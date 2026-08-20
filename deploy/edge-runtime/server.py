#!/usr/bin/env python3
# 端侧推理 sidecar：把 MNN-LLM 跑起来的本地 HTTP 端点，给上层应用的 /api/edge 适配层调用。
# OpenAI 兼容最小面：/health、/v1/chat(文本+图片)、/v1/embeddings(可降级)。
# 设计要点：
#   - 文本模型(Qwen3.5 小尺寸)与视觉模型(Qwen3-VL)各加载一份，按请求里 model=text|vision 选。
#   - 防输出截断坑：强制纯 JSON、剥掉 Markdown 代码围栏(```)——预编译 MNN 在 step decode
#     遇到 ``` 前缀会误触发假结束符导致提前停，做结构化输出(classify/rank/vision)时必须规避。
#   - 全程离线本地推理；模型路径由环境变量传入。
#
# 运行：python3 server.py  （或用 serve.sh 带调优参数）
# 依赖：pymnn(含 LLM 运行时)。安装/编译见 build-mnn.sh 与 README；不同 MNN 版本的 python API
#       可能略有差异，下方 _load / _infer 两处是唯一需要按你这版 MNN 适配的地方。
import json, os, re, sys, gc, hashlib, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

TEXT_CONFIG = os.environ.get('MNN_TEXT_CONFIG', '')      # 文本模型 config.json 绝对路径
VISION_CONFIG = os.environ.get('MNN_VISION_CONFIG', '')  # 视觉模型 config.json 绝对路径
TRAVEL_CONFIG = os.environ.get('MNN_TRAVEL_CONFIG', VISION_CONFIG)  # 旅行语言 LoRA 的精确基座图
PORT = int(os.environ.get('MNN_PORT', '8000'))
THREAD_NUM = int(os.environ.get('MNN_THREAD_NUM', '4'))  # 绑大核数量
PRECISION = os.environ.get('MNN_PRECISION', 'low')       # low 换速度
USE_MMAP = os.environ.get('MNN_USE_MMAP', 'true')        # 防大模型加载闪退
GUIJI_LORA = os.environ.get('MNN_GUIJI_LORA', '')
RUBBING_LORA = os.environ.get('MNN_RUBBING_LORA', '')
GENERAL_OCR_LORA = os.environ.get('MNN_GENERAL_OCR_LORA', '')
GENERAL_OCR_LANGUAGE_LORA = os.environ.get('MNN_GENERAL_OCR_LANGUAGE_LORA', '')
TRAVEL_PLANNER_LORA = os.environ.get('MNN_TRAVEL_PLANNER_LORA', '')
RESTORATION_MODEL = os.environ.get('MNN_HERITAGE_RESTORER', '')
EXHIBIT_MATTING_MODEL = os.environ.get('MNN_EXHIBIT_MATTING', '')
VISUAL_LORA_MARKER = os.environ.get('MNN_VISUAL_LORA_MARKER', '')
VISUAL_LORA_PATCH_ID = 'pocketearth/mnn-3.6.1-multimodal-lora-v2'
ACCELERATION = [item.strip() for item in os.environ.get('MNN_ACCELERATION', '').split(',') if item.strip()]
# 视觉打分提速：发图前缩图(降 prefill) + 视觉每次全新实例(防多模态重用串味/失控) + 截掉失控尾巴
VISION_MAX_PX = int(os.environ.get('MNN_VISION_MAX_PX', '448'))  # 视觉图最长边上限，越小越快
VISION_HIGH_PX = int(os.environ.get('MNN_VISION_HIGH_PX', '560')) # OCR 高精度档；端侧时延/精度折中
VISION_OCR_PX = int(os.environ.get('MNN_VISION_OCR_PX', '1120'))   # 普通文档小字；配合页面分区控制 prefill
OCR_SAMPLER_TYPE = os.environ.get('MNN_OCR_SAMPLER_TYPE', 'mixed').strip().lower()
if OCR_SAMPLER_TYPE not in ('mixed', 'greedy'):
    OCR_SAMPLER_TYPE = 'mixed'
OCR_NGRAM = max(3, min(12, int(os.environ.get('MNN_OCR_NGRAM', '4'))))
OCR_NGRAM_FACTOR = max(1.0, min(2.0, float(os.environ.get('MNN_OCR_NGRAM_FACTOR', '1.0'))))

_FENCE = re.compile(r'^\s*```[a-zA-Z]*\s*|\s*```\s*$')   # 去 Markdown 代码围栏
_THINK = re.compile(r'<think>.*?</think>', re.S)         # 去思考块(Qwen3 思考模式残留)
_EOS = re.compile(r'<\|endoftext\|>|<\|im_end\|>')       # 终止符：之后内容一律是失控尾巴
_RUNAWAY = re.compile(r'(?:\s*\*+\s*-+\s*){3,}.*$', re.S)  # 失控复读尾巴(** --- ** ---…)

_models = {}  # name -> handle
_restorer = {'mtime': 0.0, 'interpreter': None, 'session': None}
_restorer_lock = threading.Lock()
_exhibit_matting = {'mtime': 0.0, 'interpreter': None, 'session': None}
_exhibit_matting_lock = threading.Lock()
_language_lora_lock = threading.Lock()

_ADAPTERS = {
    'guji-vision': GUIJI_LORA,
    'rubbing-vision': RUBBING_LORA,
    'general-ocr-vision': GENERAL_OCR_LORA,
}
_LANGUAGE_ADAPTERS = {
    'travel-planner': TRAVEL_PLANNER_LORA,
}
_VISUAL_ASSET_IDS = {'guji-vision-lora', 'rubbing-vision-lora', 'general-ocr-vision-lora'}
_LANGUAGE_ASSET_IDS = {'travel-planner-lora'}

_QWEN_REPO = 'taobao-mnn/Qwen3-VL-2B-Instruct-MNN'
_QWEN_REVISION = '9e49ec71ded22500a997ed0f9961e1e92b85bbc9'
_QWEN_FILES = (
    'config.json', 'llm.mnn', 'llm.mnn.json', 'llm.mnn.weight',
    'llm_config.json', 'tokenizer.txt', 'visual.mnn', 'visual.mnn.weight',
)
_QWEN_TOTAL_BYTES = 1_480_000_000
_PRECISION_BASE_VISUAL_SHA256 = '087805fafbd06cfc21fd55a7e2f4120d865a8c920395bdda8f2bde34b102fa31'
_PRECISION_BASE_WEIGHT_SHA256 = 'dba2242b2deb4b9cc1dbd8365b6e50e81104c5f5a7d7c4fef1b572b2a4587b29'
_TRAVEL_BASE_LANGUAGE_SHA256 = 'c2286f60cbd56a82f26bfeac92f6a96e9690889b1939346abfe9e1fae996a8f3'
_TRAVEL_BASE_LANGUAGE_WEIGHT_SHA256 = '1554f9ce71743b56c2d7fba4cb0c2a31c7cddf4f21e1a2ff5a2e85b9a316a29f'
_MODEL_DIR = os.path.dirname(os.path.realpath(VISION_CONFIG)) if VISION_CONFIG else os.path.expanduser('~/mnn-models/Qwen3-VL-2B-Instruct-MNN')
_TRAVEL_MODEL_DIR = os.path.dirname(os.path.realpath(TRAVEL_CONFIG)) if TRAVEL_CONFIG else _MODEL_DIR
_ASSET_TARGETS = {
    'guji-vision-lora': GUIJI_LORA,
    'rubbing-vision-lora': RUBBING_LORA,
    'general-ocr-vision-lora': GENERAL_OCR_LORA,
    'travel-planner-lora': TRAVEL_PLANNER_LORA,
    'heritage-restorer': RESTORATION_MODEL,
    'exhibit-matting': EXHIBIT_MATTING_MODEL,
}
_BUNDLED_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'assets', 'heritage')
_BUNDLED_ASSETS = {
    'guji-vision-lora': (
        os.path.join(_BUNDLED_DIR, 'guji-v2', 'visual-lora.mnn'),
        '6d24871634ff4c1a9af67c5b722f4c311c59fbbe9b23b17111e915f75a992112',
    ),
    'rubbing-vision-lora': (
        os.path.join(_BUNDLED_DIR, 'rubbing-v2', 'visual-lora.mnn'),
        '1427fbb08d32607db54796c935d4afde634281990f5dac1be808652e4518858e',
    ),
    'general-ocr-vision-lora': (
        os.path.join(_BUNDLED_DIR, 'general-ocr-release', 'visual-lora.mnn'),
        'd09be9ee9a41c7ec87c45e2f721ad7861a493eeb11b04611ec06380d19fc9f5e',
    ),
    'heritage-restorer': (
        os.path.join(_BUNDLED_DIR, 'restorer-v1', 'heritage-restorer.mnn'),
        'c571f66050be527e7e531b9c116a417c4fece0ec4090cdaf5d2497a8c0eb5a87',
    ),
    'exhibit-matting': (
        os.path.join(os.path.dirname(os.path.realpath(__file__)), 'assets', 'exhibit', 'exhibit-matting-v1', 'exhibit-matting-fp16.mnn'),
        '95f35d70763cd83f58e79d83ebba2c682853bee764906dce9b366d1d07ea4b10',
    ),
    'travel-planner-lora': (
        os.path.join(os.path.dirname(os.path.realpath(__file__)), 'assets', 'travel', 'travel-planner-v1', 'lora.mnn'),
        '791a4659ecd86dba2336ca4fdc3a4ee93640bed5b7f92370bfdc3c702450dc13',
    ),
}
_BUNDLED_LANGUAGE_ASSETS = {
    'general-ocr-vision-lora': (
        os.path.join(_BUNDLED_DIR, 'general-ocr-release', 'language-lora.mnn'),
        '',
    ),
}
_asset_job = {'state': 'idle', 'downloaded': 0, 'total': _QWEN_TOTAL_BYTES, 'error': '', 'cancel': False}
_asset_lock = threading.Lock()


def _file_bytes(paths):
    total = 0
    for path in paths:
        try: total += os.path.getsize(path)
        except OSError: pass
    return total


def _bundled_asset_ready(asset_id: str) -> bool:
    """A release is bundled only after its visual graph hash is pinned."""
    source, expected_sha = _BUNDLED_ASSETS.get(asset_id, ('', ''))
    return bool(source and expected_sha and os.path.isfile(source))


def _visual_lora_runtime_ready():
    if not VISUAL_LORA_MARKER or not os.path.isfile(VISUAL_LORA_MARKER):
        return False
    try:
        with open(VISUAL_LORA_MARKER, 'r', encoding='utf-8') as stream:
            return json.load(stream).get('patchId') == VISUAL_LORA_PATCH_ID
    except Exception:
        return False


def _precision_visual_base_ready():
    """The released overlays are attested to one exact INT8 visual graph."""
    graph = os.path.join(_MODEL_DIR, 'visual.mnn')
    if not os.path.isfile(graph):
        return False
    try:
        return _sha256_file(graph) == _PRECISION_BASE_VISUAL_SHA256
    except OSError:
        return False


def _adapter_files_ready(adapter: str, visual_path: str) -> bool:
    """Attest the visual overlay and any explicitly configured legacy decoder overlay."""
    if not visual_path or not os.path.isfile(visual_path) or not _precision_visual_base_ready():
        return False
    try:
        visual_weight = os.path.join(_MODEL_DIR, 'visual.mnn.weight')
        visual_alias = os.path.realpath(visual_path) + '.weight'
        if not (os.path.isfile(visual_weight) and os.path.isfile(visual_alias)
                and os.path.samefile(visual_weight, visual_alias)):
            return False
        if adapter != 'general-ocr-vision':
            return True
        # v6 and later are deliberately visual-only: the shared, unmodified Qwen
        # decoder is more stable after MNN export. Keep the optional check only so
        # an explicitly configured legacy paired package can never run half-installed.
        if not GENERAL_OCR_LANGUAGE_LORA:
            return True
        language_path = os.path.realpath(GENERAL_OCR_LANGUAGE_LORA) if GENERAL_OCR_LANGUAGE_LORA else ''
        language_weight = os.path.join(_MODEL_DIR, 'llm.mnn.weight')
        language_alias = language_path + '.weight'
        return bool(language_path and os.path.isfile(language_path)
                    and os.path.isfile(language_weight) and os.path.isfile(language_alias)
                    and os.path.samefile(language_weight, language_alias))
    except OSError:
        return False


def _language_adapter_files_ready(adapter: str, language_path: str) -> bool:
    """Attest a separated language LoRA against the exact shared Qwen decoder."""
    if adapter not in _LANGUAGE_ADAPTERS or not language_path or not os.path.isfile(language_path):
        return False
    try:
        base_graph = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn')
        shared_weight = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn.weight')
        alias = os.path.realpath(language_path) + '.weight'
        return bool(
            os.path.isfile(base_graph)
            and os.path.isfile(shared_weight)
            and os.path.isfile(alias)
            and os.path.samefile(shared_weight, alias)
            and _sha256_file(base_graph) == _TRAVEL_BASE_LANGUAGE_SHA256
            and _sha256_file(shared_weight) == _TRAVEL_BASE_LANGUAGE_WEIGHT_SHA256
        )
    except OSError:
        return False


def _qwen_paths():
    return [os.path.join(_MODEL_DIR, name) for name in _QWEN_FILES]


def _installed_qwen_paths():
    if _precision_visual_base_ready():
        return [os.path.join(_MODEL_DIR, name) for name in (
            'config.json', 'llm.mnn', 'llm.mnn.weight', 'llm_config.json',
            'tokenizer.mtok', 'visual.mnn', 'visual.mnn.weight',
        )]
    return _qwen_paths()


def _asset_snapshot():
    paths = _installed_qwen_paths()
    installed = all(os.path.isfile(path) and os.path.getsize(path) > 0 for path in paths)
    precision_total = _file_bytes(paths) if _precision_visual_base_ready() else _QWEN_TOTAL_BYTES
    with _asset_lock:
        job = dict(_asset_job)
    state = 'installed' if installed else job['state'] if job['state'] in ('downloading', 'failed', 'cancelled') else 'missing'
    downloaded = _file_bytes(paths)
    if state == 'downloading': downloaded = max(downloaded, int(job.get('downloaded') or 0))
    return [
        {
            'id': 'qwen3-vl-2b-mnn', 'kind': 'base',
            'name': 'Qwen3-VL-2B-Instruct INT8 精度包' if _precision_visual_base_ready() else 'Qwen3-VL-2B-Instruct INT4',
            'state': state, 'installed': installed, 'downloaded': downloaded,
            'total': precision_total, 'repo': _QWEN_REPO, 'revision': _QWEN_REVISION,
            'runtime': 'MNN 3.6.1', 'target': 'android-arm64', 'acceleration': ['arm82', 'sme2'],
            'error': job.get('error', '') if state == 'failed' else '',
        },
        {
            'id': 'guji-vision-lora', 'kind': 'adapter', 'name': '古籍视觉 LoRA',
            'state': 'installed' if _adapter_files_ready('guji-vision', GUIJI_LORA) else 'missing',
            'installed': _adapter_files_ready('guji-vision', GUIJI_LORA),
            'downloaded': _file_bytes([GUIJI_LORA]) if GUIJI_LORA else 0, 'total': 0,
            'runtime': 'MNN multimodal LoRA patch v2', 'target': 'android-arm64', 'acceleration': ['arm82', 'sme2'],
            'bundled': _bundled_asset_ready('guji-vision-lora'),
        },
        {
            'id': 'rubbing-vision-lora', 'kind': 'adapter', 'name': '碑拓视觉 LoRA',
            'state': 'installed' if _adapter_files_ready('rubbing-vision', RUBBING_LORA) else 'missing',
            'installed': _adapter_files_ready('rubbing-vision', RUBBING_LORA),
            'downloaded': _file_bytes([RUBBING_LORA]) if RUBBING_LORA else 0, 'total': 0,
            'runtime': 'MNN multimodal LoRA patch v2', 'target': 'android-arm64', 'acceleration': ['arm82', 'sme2'],
            'bundled': _bundled_asset_ready('rubbing-vision-lora'),
        },
        {
            'id': 'general-ocr-vision-lora', 'kind': 'adapter', 'name': '通用文档 OCR LoRA',
            'state': 'installed' if _adapter_files_ready('general-ocr-vision', GENERAL_OCR_LORA) else 'missing',
            'installed': _adapter_files_ready('general-ocr-vision', GENERAL_OCR_LORA),
            'downloaded': _file_bytes([GENERAL_OCR_LORA, GENERAL_OCR_LANGUAGE_LORA]), 'total': 0,
            'runtime': 'MNN visual LoRA patch v2', 'target': 'android-arm64', 'acceleration': ['arm82', 'sme2'],
            'bundled': _bundled_asset_ready('general-ocr-vision-lora'),
        },
        {
            'id': 'travel-planner-lora', 'kind': 'adapter', 'name': '旅行规划语言 LoRA',
            'state': 'installed' if _language_adapter_files_ready('travel-planner', TRAVEL_PLANNER_LORA) else 'missing',
            'installed': _language_adapter_files_ready('travel-planner', TRAVEL_PLANNER_LORA),
            'downloaded': _file_bytes([TRAVEL_PLANNER_LORA]) if TRAVEL_PLANNER_LORA else 0,
            'total': 72633256,
            'runtime': 'MNN 3.6.1 create_lora', 'target': 'android-arm64', 'acceleration': ['arm82', 'sme2'],
            'bundled': _bundled_asset_ready('travel-planner-lora'),
        },
        {
            'id': 'heritage-restorer', 'kind': 'restorer', 'name': '古籍碑拓 U-Net 生成器',
            'state': 'installed' if RESTORATION_MODEL and os.path.isfile(RESTORATION_MODEL) else 'missing',
            'installed': bool(RESTORATION_MODEL and os.path.isfile(RESTORATION_MODEL)),
            'downloaded': _file_bytes([RESTORATION_MODEL]) if RESTORATION_MODEL else 0, 'total': 0,
            'runtime': 'MNN image generator', 'target': 'android-arm64', 'acceleration': ['arm82', 'sme2'],
            'bundled': _bundled_asset_ready('heritage-restorer'),
        },
        {
            'id': 'exhibit-matting', 'kind': 'specialist', 'name': '博物馆展品抠图 MNN',
            'state': 'installed' if EXHIBIT_MATTING_MODEL and os.path.isfile(EXHIBIT_MATTING_MODEL) else 'missing',
            'installed': bool(EXHIBIT_MATTING_MODEL and os.path.isfile(EXHIBIT_MATTING_MODEL)),
            'downloaded': _file_bytes([EXHIBIT_MATTING_MODEL]) if EXHIBIT_MATTING_MODEL else 0, 'total': 146105104,
            'runtime': 'MNN 3.6.1 FP16', 'target': 'android-arm64', 'acceleration': ['arm82', 'sme2'],
            'bundled': _bundled_asset_ready('exhibit-matting'),
        },
    ]


def _install_bundled_asset(asset_id: str):
    import shutil
    target = _ASSET_TARGETS.get(asset_id, '')
    source, expected_sha = _BUNDLED_ASSETS.get(asset_id, ('', ''))
    if not target or not _bundled_asset_ready(asset_id):
        raise RuntimeError('内置权重不存在或完整适配器尚未通过发布门禁')
    if _sha256_file(source) != expected_sha:
        raise RuntimeError('内置权重 SHA-256 校验失败')
    if asset_id in _VISUAL_ASSET_IDS:
        shared_weight = os.path.join(_MODEL_DIR, 'visual.mnn.weight')
        if not os.path.isfile(shared_weight):
            raise RuntimeError('请先安装 Qwen3-VL 官方 MNN 基座')
        if not _precision_visual_base_ready():
            raise RuntimeError('这三份发布 adapter 固定匹配 INT8 精度基座；当前 INT4 基座不兼容，已失败闭合')
    if asset_id in _LANGUAGE_ASSET_IDS:
        base_graph = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn')
        shared_weight = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn.weight')
        if not (os.path.isfile(base_graph) and os.path.isfile(shared_weight)):
            raise RuntimeError('请先安装 Qwen3-VL 官方 MNN 基座')
        if _sha256_file(base_graph) != _TRAVEL_BASE_LANGUAGE_SHA256:
            raise RuntimeError('旅行规划 LoRA 与当前 Qwen 语言图不兼容，已拒绝安装')
        if _sha256_file(shared_weight) != _TRAVEL_BASE_LANGUAGE_WEIGHT_SHA256:
            raise RuntimeError('旅行规划 LoRA 与当前 Qwen 语言权重不兼容，已拒绝安装')
    language_source = language_sha = language_target = language_shared_weight = ''
    if asset_id == 'general-ocr-vision-lora' and GENERAL_OCR_LANGUAGE_LORA:
        language_source, language_sha = _BUNDLED_LANGUAGE_ASSETS.get(asset_id, ('', ''))
        language_target = GENERAL_OCR_LANGUAGE_LORA
        language_shared_weight = os.path.join(_MODEL_DIR, 'llm.mnn.weight')
        if not language_source or not language_sha or not os.path.isfile(language_source):
            raise RuntimeError('已配置旧版语言适配器，但内置包不完整')
        if _sha256_file(language_source) != language_sha:
            raise RuntimeError('内置通用 OCR 语言权重 SHA-256 校验失败')
        if not os.path.isfile(language_shared_weight):
            raise RuntimeError('请先安装完整 Qwen3-VL 官方 MNN 基座')
    os.makedirs(os.path.dirname(os.path.realpath(target)), exist_ok=True)
    part = target + '.part'
    language_part = language_target + '.part' if language_target else ''
    shutil.copyfile(source, part)
    if language_source:
        os.makedirs(os.path.dirname(os.path.realpath(language_target)), exist_ok=True)
        shutil.copyfile(language_source, language_part)
    os.replace(part, target)
    if language_part:
        os.replace(language_part, language_target)
    metadata = {
        'id': asset_id, 'sha256': expected_sha, 'size': os.path.getsize(target),
        'installedAt': int(time.time()), 'source': 'bundled',
    }
    if asset_id in _VISUAL_ASSET_IDS:
        alias = target + '.weight'
        if os.path.lexists(alias):
            os.remove(alias)
        os.link(shared_weight, alias)
        metadata.update({
            'schema': 'pocket-skill-visual-module/v2',
            'baseRepo': _QWEN_REPO, 'baseRevision': _QWEN_REVISION,
            'runtime': 'MNN 3.6.1', 'runtimePatch': VISUAL_LORA_PATCH_ID,
            'sharedWeightAlias': os.path.basename(alias),
            'sharedWeightSha256': _sha256_file(shared_weight), 'linkMode': 'hard-link',
            'expectedSharedWeightSha256': _PRECISION_BASE_WEIGHT_SHA256,
        })
    if asset_id in _LANGUAGE_ASSET_IDS:
        alias = target + '.weight'
        if os.path.lexists(alias):
            os.remove(alias)
        shared_weight = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn.weight')
        os.link(shared_weight, alias)
        metadata.update({
            'schema': 'pocket-skill-language-module/v1',
            'baseRepo': 'Qwen/Qwen3-VL-2B-Instruct',
            'baseRevision': 'ae9985b208c074c10cfbe3a61b5cb7268cdc9c53',
            'runtime': 'MNN 3.6.1',
            'sharedWeightAlias': os.path.basename(alias),
            'sharedWeightSha256': _sha256_file(shared_weight),
            'expectedBaseGraphSha256': _TRAVEL_BASE_LANGUAGE_SHA256,
            'expectedSharedWeightSha256': _TRAVEL_BASE_LANGUAGE_WEIGHT_SHA256,
            'linkMode': 'hard-link',
            'deploymentScale': 0.25,
        })
    if language_target:
        language_alias = language_target + '.weight'
        if os.path.lexists(language_alias):
            os.remove(language_alias)
        os.link(language_shared_weight, language_alias)
        metadata.update({
            'schema': 'pocket-skill-multimodal-module/v3',
            'languageGraph': os.path.basename(language_target),
            'languageSha256': language_sha,
            'languageSize': os.path.getsize(language_target),
            'languageSharedWeightAlias': os.path.basename(language_alias),
            'languageSharedWeightSha256': _sha256_file(language_shared_weight),
        })
    with open(target + '.asset.json', 'w', encoding='utf-8') as meta:
        json.dump(metadata, meta, ensure_ascii=False, indent=2)
    return metadata


def _uninstall_asset(asset_id: str):
    """Remove one optional adapter/specialist without ever deleting the shared Qwen base."""
    if asset_id == 'qwen3-vl-2b-mnn':
        raise RuntimeError('共享 Qwen 基座不能随单个 Skill 卸载')
    target = _ASSET_TARGETS.get(asset_id, '')
    if not target:
        raise RuntimeError('未知或不可卸载的端侧资产')
    targets = [target, target + '.weight', target + '.asset.json']
    if asset_id == 'general-ocr-vision-lora' and GENERAL_OCR_LANGUAGE_LORA:
        targets.extend([
            GENERAL_OCR_LANGUAGE_LORA,
            GENERAL_OCR_LANGUAGE_LORA + '.weight',
            GENERAL_OCR_LANGUAGE_LORA + '.asset.json',
        ])
    removed = []
    for path in targets:
        try:
            if path and os.path.isfile(path):
                os.remove(path)
                removed.append(os.path.basename(path))
        except OSError as error:
            raise RuntimeError('端侧资产卸载失败：' + str(error)) from error
    return {'id': asset_id, 'removed': removed}


def _download_qwen():
    os.makedirs(_MODEL_DIR, exist_ok=True)
    with _asset_lock:
        _asset_job.update(state='downloading', downloaded=_file_bytes(_qwen_paths()), error='', cancel=False)
    try:
        completed = 0
        for name in _QWEN_FILES:
            target = os.path.join(_MODEL_DIR, name)
            if os.path.isfile(target) and os.path.getsize(target) > 0:
                completed += os.path.getsize(target)
                continue
            part = target + '.part'
            existing = os.path.getsize(part) if os.path.isfile(part) else 0
            url = f'https://huggingface.co/{_QWEN_REPO}/resolve/{_QWEN_REVISION}/{name}?download=true'
            headers = {'User-Agent': 'PocketEarth/1.0 MNN model installer'}
            if existing: headers['Range'] = f'bytes={existing}-'
            response = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)
            if existing and getattr(response, 'status', 200) != 206:
                existing = 0
            mode = 'ab' if existing else 'wb'
            with open(part, mode) as output:
                while True:
                    with _asset_lock:
                        if _asset_job.get('cancel'): raise InterruptedError('用户已停止下载')
                    chunk = response.read(1024 * 1024)
                    if not chunk: break
                    output.write(chunk)
                    with _asset_lock: _asset_job['downloaded'] = completed + existing + output.tell() - existing
            os.replace(part, target)
            completed += os.path.getsize(target)
        if not all(os.path.isfile(path) and os.path.getsize(path) > 0 for path in _qwen_paths()):
            raise RuntimeError('模型文件清单不完整')
        with _asset_lock: _asset_job.update(state='installed', downloaded=completed, error='')
    except InterruptedError as exc:
        with _asset_lock: _asset_job.update(state='cancelled', error=str(exc))
    except Exception as exc:
        with _asset_lock: _asset_job.update(state='failed', error=str(exc))


def _start_qwen_download():
    with _asset_lock:
        if _asset_job['state'] == 'downloading': return False
        _asset_job.update(state='downloading', error='', cancel=False)
    threading.Thread(target=_download_qwen, name='qwen-mnn-download', daemon=True).start()
    return True


def _import_asset(handler, asset_id: str):
    target = _ASSET_TARGETS.get(asset_id, '')
    if not target: return handler._send({'error': 'asset_not_allowlisted'}, 400)
    length = int(handler.headers.get('content-length', 0))
    if length <= 0 or length > 1024 * 1024 * 1024:
        return handler._send({'error': 'invalid_asset_size'}, 400)
    os.makedirs(os.path.dirname(os.path.realpath(target)), exist_ok=True)
    part = target + '.part'; digest = hashlib.sha256(); remaining = length
    try:
        with open(part, 'wb') as output:
            while remaining:
                chunk = handler.rfile.read(min(1024 * 1024, remaining))
                if not chunk: raise RuntimeError('asset_upload_incomplete')
                output.write(chunk); digest.update(chunk); remaining -= len(chunk)
        if asset_id in _VISUAL_ASSET_IDS:
            shared_weight = os.path.join(_MODEL_DIR, 'visual.mnn.weight')
            if not os.path.isfile(shared_weight):
                raise RuntimeError('请先安装 Qwen3-VL 官方 MNN 基座，再导入视觉 LoRA')
            if not _precision_visual_base_ready():
                raise RuntimeError('当前基座与发布版 INT8 视觉 overlay 不兼容；已拒绝导入')
        if asset_id in _LANGUAGE_ASSET_IDS:
            base_graph = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn')
            shared_weight = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn.weight')
            if not (os.path.isfile(base_graph) and os.path.isfile(shared_weight)):
                raise RuntimeError('请先安装 Qwen3-VL 官方 MNN 基座，再导入语言 LoRA')
            if _sha256_file(base_graph) != _TRAVEL_BASE_LANGUAGE_SHA256:
                raise RuntimeError('当前 Qwen 语言图与旅行规划 LoRA 不兼容；已拒绝导入')
            if _sha256_file(shared_weight) != _TRAVEL_BASE_LANGUAGE_WEIGHT_SHA256:
                raise RuntimeError('当前 Qwen 语言权重与旅行规划 LoRA 不兼容；已拒绝导入')
        os.replace(part, target)
        metadata = {'id': asset_id, 'sha256': digest.hexdigest(), 'size': length, 'installedAt': int(time.time())}
        if asset_id in _VISUAL_ASSET_IDS:
            alias = target + '.weight'
            if os.path.lexists(alias):
                os.remove(alias)
            os.link(shared_weight, alias)
            metadata.update({
                'schema': 'pocket-skill-visual-module/v2',
                'baseRepo': _QWEN_REPO,
                'baseRevision': _QWEN_REVISION,
                'runtime': 'MNN 3.6.1',
                'runtimePatch': VISUAL_LORA_PATCH_ID,
                'sharedWeightAlias': os.path.basename(alias),
                'sharedWeightSha256': _sha256_file(shared_weight),
                'expectedSharedWeightSha256': _PRECISION_BASE_WEIGHT_SHA256,
                'linkMode': 'hard-link',
            })
        if asset_id in _LANGUAGE_ASSET_IDS:
            shared_weight = os.path.join(_TRAVEL_MODEL_DIR, 'llm.mnn.weight')
            alias = target + '.weight'
            if os.path.lexists(alias):
                os.remove(alias)
            os.link(shared_weight, alias)
            metadata.update({
                'schema': 'pocket-skill-language-module/v1',
                'baseRepo': 'Qwen/Qwen3-VL-2B-Instruct',
                'baseRevision': 'ae9985b208c074c10cfbe3a61b5cb7268cdc9c53',
                'runtime': 'MNN 3.6.1',
                'sharedWeightAlias': os.path.basename(alias),
                'sharedWeightSha256': _sha256_file(shared_weight),
                'expectedBaseGraphSha256': _TRAVEL_BASE_LANGUAGE_SHA256,
                'expectedSharedWeightSha256': _TRAVEL_BASE_LANGUAGE_WEIGHT_SHA256,
                'linkMode': 'hard-link',
                'deploymentScale': 0.25,
            })
        with open(target + '.asset.json', 'w', encoding='utf-8') as meta:
            json.dump(metadata, meta, ensure_ascii=False, indent=2)
        return handler._send({'status': 'installed', 'asset': metadata})
    except Exception as exc:
        try: os.remove(part)
        except OSError: pass
        return handler._send({'error': str(exc)}, 500)


def _load(config_path: str, max_new_tokens: Optional[int] = None):
    """加载一份 MNN-LLM 模型：create(config) → set_config(端侧调优) → load()。"""
    import MNN.llm as mnnllm          # pymnn 的 LLM 运行时(pip install MNN 即含)
    m = mnnllm.create(config_path)
    try:
        configured_sampler = 'mixed'
        try:
            with open(config_path, 'r', encoding='utf-8') as config_stream:
                configured_sampler = str(json.load(config_stream).get('sampler_type') or 'mixed')
        except Exception:
            pass
        runtime_config = {'precision': PRECISION, 'thread_num': THREAD_NUM, 'memory': 'low',
                          # OCR and evidence extraction must be reproducible. The
                          # upstream Qwen MNN config defaults to mixed sampling at
                          # temperature 0.7, which can turn a correct first token
                          # into arbitrary continuations on the same page.
                          'sampler_type': configured_sampler,
                          'mixed_samplers': ['penalty', 'topK', 'topP', 'temperature'],
                          'random_seed': 20260805, 'temperature': 0.35, 'topK': 8, 'topP': 0.9,
                          'repetition_penalty': 1.15, 'presence_penalty': 0.05,
                          'penalty_window': 192, 'n_gram': OCR_NGRAM,
                          'ngram_factor': OCR_NGRAM_FACTOR,
                          'use_mmap': USE_MMAP.lower() in ('1', 'true', 'yes')}
        # MNN 3.6.x snapshots generation options during load(); applying this
        # later in _infer is ignored by some PyMNN builds.
        if max_new_tokens is not None and max_new_tokens > 0:
            runtime_config['max_new_tokens'] = max_new_tokens
        m.set_config(runtime_config)
    except Exception:
        pass
    m.load()
    return m


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _downscale(raw: bytes, max_px: Optional[int] = None) -> bytes:
    """发图前缩图：最长边压到 VISION_MAX_PX、转 JPEG，显著降低视觉 prefill。无 Pillow / 失败时原样返回。"""
    limit = VISION_MAX_PX if max_px is None else max_px
    if limit <= 0:
        return raw
    try:
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        w, h = im.size
        longest = max(w, h)
        if longest > limit:
            s = limit / float(longest)
            im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, format='JPEG', quality=82)
        return buf.getvalue()
    except Exception:
        return raw  # 缩图失败不挡推理


def _infer(model, prompt: str, images=None, detail: str = 'fast', max_new_tokens: int = -1) -> str:
    """单轮推理。视觉先缩图、再写临时文件、用 <img> 标签喂给 Qwen-VL。
    注意：多模态模型这版 MNN 不能跨调用重用(reset/reuse_kv 都会串味/复读/失控)，
    视觉每次用全新实例，见 do_POST。"""
    if max_new_tokens > 0:
        try:
            # PyMNN 不同构建的 response() 参数个数不一致；set_config 是跨版本稳定入口。
            model.set_config({'max_new_tokens': max_new_tokens})
        except Exception:
            pass
    if images:
        import base64, tempfile
        tmp, tags = [], ''
        try:
            for img in images:
                raw = img.split(',', 1)[1] if (img.strip().startswith('data:') and ',' in img) else img
                limit = VISION_OCR_PX if detail == 'ocr' else VISION_HIGH_PX if detail == 'high' else VISION_MAX_PX
                data = _downscale(base64.b64decode(raw), limit)
                fd, path = tempfile.mkstemp(suffix='.jpg')
                with os.fdopen(fd, 'wb') as f:
                    f.write(data)
                tmp.append(path); tags += f'<img>{path}</img>'
            try:
                # Patched/pinned PyMNN exposes the third positional budget. Passing it
                # here is stronger than relying on a mutable config and bounds runaway OCR.
                c_obj = getattr(model, '_c_obj', None)
                if c_obj is not None and max_new_tokens > 0:
                    return str(c_obj.response(tags + prompt, False, max_new_tokens))
                return str(model.response(tags + prompt, False))
            except TypeError:
                return str(model.response(tags + prompt, stream=False))
        finally:
            for p in tmp:
                try: os.remove(p)
                except OSError: pass
    try:
        c_obj = getattr(model, '_c_obj', None)
        if c_obj is not None and max_new_tokens > 0:
            return str(c_obj.response(prompt, False, max_new_tokens))
        return str(model.response(prompt, False))
    except TypeError:
        return str(model.response(prompt, stream=False))


def _ensure(name: str):
    cfg = VISION_CONFIG if name == 'vision' else TEXT_CONFIG
    if not cfg or not os.path.isfile(cfg):
        raise RuntimeError(f'模型 {name} 未配置或 config 不存在: {cfg}')
    if cfg in _models:           # 按 config 路径缓存：文本/视觉指向同一多模态模型时只载一份
        return _models[cfg]
    _models[cfg] = _load(cfg)
    return _models[cfg]


def _adapter_path(adapter: str) -> str:
    """只从环境变量 allowlist 解析 adapter，绝不接受请求传入任意文件路径。"""
    path = _ADAPTERS.get(adapter, '')
    return os.path.realpath(path) if path else ''


def _language_adapter_path(adapter: str) -> str:
    """Resolve a request language adapter strictly through the server allowlist."""
    path = _LANGUAGE_ADAPTERS.get(adapter, '')
    path = os.path.realpath(path) if path else ''
    if not _language_adapter_files_ready(adapter, path):
        raise RuntimeError(f'语言 adapter 未安装或与共享 Qwen 基座不兼容: {adapter}')
    return path


def _language_lora_config(adapter: str) -> str:
    """Create the proven shared-weight graph-switch config for PyMNN builds.

    MNN's C++ LLM API exposes create_lora(), but some 3.6.1 PyMNN wheels omit
    that binding. The exported overlay is also a complete language graph whose
    external offsets are identical to llm.mnn. Pointing a request-local config
    at the overlay and the same llm.mnn.weight is the verified fallback used by
    the blind-test evaluator; it does not merge or duplicate the base weights.
    """
    path = _language_adapter_path(adapter)
    base_config = TRAVEL_CONFIG
    if not base_config or not os.path.isfile(base_config):
        raise RuntimeError('Qwen3-VL 基座 config.json 未安装')
    config_dir = os.path.dirname(os.path.realpath(base_config))
    if os.path.dirname(path) != config_dir:
        raise RuntimeError(f'语言 adapter 必须与 Qwen config.json 同目录: {adapter}')
    with open(base_config, 'r', encoding='utf-8') as stream:
        config = json.load(stream)
    config['llm_model'] = os.path.basename(path)
    config['llm_weight'] = 'llm.mnn.weight'
    config['sampler_type'] = 'penalty'
    config['penalty_sampler'] = 'greedy'
    config['penalty'] = 1.2
    config['max_new_tokens'] = 512
    config_path = os.path.join(config_dir, f'config-{adapter}-language.json')
    part = config_path + '.part'
    with open(part, 'w', encoding='utf-8') as stream:
        json.dump(config, stream, ensure_ascii=False, indent=2)
    os.replace(part, config_path)
    return config_path


def _visual_lora_config(adapter: str) -> str:
    """Build a deterministic same-directory vision config for base or LoRA OCR."""
    path = ''
    if adapter:
        if not _visual_lora_runtime_ready():
            raise RuntimeError('MNN 视觉 LoRA 运行时补丁未安装，拒绝用基座冒充 LoRA')
        path = _adapter_path(adapter)
        if not path or not os.path.isfile(path):
            raise RuntimeError(f'adapter 未安装: {adapter}')
    base_config = VISION_CONFIG or TEXT_CONFIG
    if not base_config or not os.path.isfile(base_config):
        raise RuntimeError('Qwen3-VL 基座 config.json 未安装')
    config_dir = os.path.dirname(os.path.realpath(base_config))
    if adapter:
        if os.path.dirname(path) != config_dir:
            raise RuntimeError(f'adapter 必须与视觉 config.json 同目录: {adapter}')
        shared_weight = os.path.join(config_dir, 'visual.mnn.weight')
        alias = path + '.weight'
        if not (os.path.isfile(shared_weight) and os.path.isfile(alias)):
            raise RuntimeError(f'adapter 缺少共享 visual.mnn.weight 别名: {adapter}')
        if not os.path.samefile(shared_weight, alias):
            raise RuntimeError(f'adapter 权重别名不是官方共享基座的硬链接: {adapter}')
    with open(base_config, 'r', encoding='utf-8') as stream:
        config = json.load(stream)
    # MNN snapshots sampling policy during create/load. Writing it into the
    # request config is therefore required; set_config alone is too late in
    # some 3.6.x PyMNN builds.
    config['sampler_type'] = OCR_SAMPLER_TYPE
    config['mixed_samplers'] = ['penalty', 'topK', 'topP', 'temperature']
    config['random_seed'] = 20260805
    config['temperature'] = 0.35
    config['topK'] = 8
    config['topP'] = 0.9
    config['repetition_penalty'] = 1.15
    config['presence_penalty'] = 0.05
    config['penalty_window'] = 192
    config['n_gram'] = OCR_NGRAM
    config['ngram_factor'] = OCR_NGRAM_FACTOR
    config.pop('penalty_sampler', None)
    if adapter:
        config['visual_lora_model'] = os.path.basename(path)
    else:
        config.pop('visual_lora_model', None)
        config.pop('llm_lora_model', None)
    language_lora = _language_lora_path(adapter)
    if language_lora:
        # The pinned runtime first loads the shared decoder base, then applies
        # this request-local overlay with Module::Config.base. This keeps the
        # object as an Omni model and preserves its visual processor.
        config['llm_lora_model'] = os.path.basename(language_lora)
    config_path = os.path.join(config_dir, f'config-{adapter or "vision-deterministic"}.json')
    part = config_path + '.part'
    with open(part, 'w', encoding='utf-8') as stream:
        json.dump(config, stream, ensure_ascii=False, indent=2)
    os.replace(part, config_path)
    return config_path


def _language_lora_path(adapter: str) -> str:
    """Return an optional allowlisted legacy decoder overlay.

    Current general OCR releases are visual-only and leave this unset. This compatibility
    path remains fail-closed when a legacy paired package is explicitly configured;
    arbitrary request paths are never accepted.
    """
    if adapter != 'general-ocr-vision' or not GENERAL_OCR_LANGUAGE_LORA:
        return ''
    path = os.path.realpath(GENERAL_OCR_LANGUAGE_LORA)
    if not os.path.isfile(path):
        raise RuntimeError('通用 OCR 语言控制 LoRA 未安装，拒绝只运行半套适配器')
    base_config = VISION_CONFIG or TEXT_CONFIG
    config_dir = os.path.dirname(os.path.realpath(base_config)) if base_config else ''
    if os.path.dirname(path) != config_dir:
        raise RuntimeError('通用 OCR 语言控制 LoRA 必须与基座 config.json 同目录')
    shared_weight = os.path.join(config_dir, 'llm.mnn.weight')
    alias = path + '.weight'
    if not (os.path.isfile(shared_weight) and os.path.isfile(alias)):
        raise RuntimeError('通用 OCR 语言控制 LoRA 缺少共享 llm.mnn.weight 别名')
    if not os.path.samefile(shared_weight, alias):
        raise RuntimeError('通用 OCR 语言控制 LoRA 权重别名不是官方共享基座的硬链接')
    return path


def _data_bytes(value: str) -> bytes:
    import base64
    raw = value.split(',', 1)[1] if value.strip().startswith('data:') and ',' in value else value
    return base64.b64decode(raw)


def _restore_image(image_value: str, mask_value: str):
    """Run the fixed 256px MNN generator tile-by-tile; pixels outside the user mask are immutable."""
    import base64, io
    import MNN
    import numpy as np
    from PIL import Image

    if not RESTORATION_MODEL or not os.path.isfile(RESTORATION_MODEL):
        raise RuntimeError('U-Net MNN 修复生成器尚未安装')
    image = Image.open(io.BytesIO(_data_bytes(image_value))).convert('RGB')
    mask = Image.open(io.BytesIO(_data_bytes(mask_value))).convert('L')
    if mask.size != image.size:
        mask = mask.resize(image.size, Image.Resampling.NEAREST)
    if max(image.size) > 1400:
        scale = 1400 / float(max(image.size))
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS)
        mask = mask.resize(size, Image.Resampling.NEAREST)
    source = np.asarray(image, dtype=np.uint8)
    mask_u8 = np.asarray(mask, dtype=np.uint8)
    result = source.copy()
    tile_size = 256
    tile_count = 0

    with _restorer_lock:
        mtime = os.path.getmtime(RESTORATION_MODEL)
        if _restorer['session'] is None or _restorer['mtime'] != mtime:
            interpreter = MNN.Interpreter(RESTORATION_MODEL)
            session = interpreter.createSession({'numThread': THREAD_NUM})
            _restorer.update(mtime=mtime, interpreter=interpreter, session=session)
        interpreter = _restorer['interpreter']; session = _restorer['session']
        for y in range(0, image.height, tile_size):
            for x in range(0, image.width, tile_size):
                h = min(tile_size, image.height - y); w = min(tile_size, image.width - x)
                tile_mask = mask_u8[y:y+h, x:x+w]
                if not np.any(tile_mask >= 16):
                    continue
                damaged = np.full((tile_size, tile_size, 3), 255, dtype=np.uint8)
                damaged[:h, :w] = source[y:y+h, x:x+w]
                padded_mask = np.zeros((tile_size, tile_size), dtype=np.uint8)
                padded_mask[:h, :w] = tile_mask
                damaged_f = (damaged.astype(np.float32) / 127.5 - 1.0).transpose(2, 0, 1)[None]
                mask_f = (padded_mask.astype(np.float32) / 255.0)[None, None]
                for name, value in (('damaged', damaged_f), ('mask', mask_f)):
                    tensor = interpreter.getSessionInput(session, name)
                    host = MNN.Tensor(list(value.shape), MNN.Halide_Type_Float, value, MNN.Tensor_DimensionType_Caffe)
                    tensor.copyFrom(host)
                interpreter.runSession(session)
                output = interpreter.getSessionOutput(session, 'restored')
                shape = output.getShape()
                if tuple(shape) != (1, 3, tile_size, tile_size):
                    raise RuntimeError(f'U-Net MNN 输出尺寸异常: {shape}')
                host = MNN.Tensor(shape, MNN.Halide_Type_Float, np.zeros(shape, dtype=np.float32), MNN.Tensor_DimensionType_Caffe)
                output.copyToHostTensor(host)
                restored = np.asarray(host.getData(), dtype=np.float32).reshape(shape)[0].transpose(1, 2, 0)
                restored = np.clip((restored + 1.0) * 127.5, 0, 255).astype(np.uint8)
                active = padded_mask[:h, :w, None] >= 16
                result[y:y+h, x:x+w] = np.where(active, restored[:h, :w], source[y:y+h, x:x+w])
                tile_count += 1
    output = io.BytesIO()
    Image.fromarray(result).save(output, format='PNG', optimize=True)
    coverage = float(np.count_nonzero(mask_u8 >= 16) / max(mask_u8.size, 1))
    return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode(), {
        'maskCoverage': coverage, 'tileCount': tile_count, 'unmaskedMaxDelta': 0,
    }


def _matte_exhibit(image_value: str):
    """Run the fixed 768px museum matting model and return alpha + RGBA cutout."""
    import base64, io
    import MNN
    import numpy as np
    from PIL import Image

    if not EXHIBIT_MATTING_MODEL or not os.path.isfile(EXHIBIT_MATTING_MODEL):
        raise RuntimeError('博物馆展品抠图 MNN 尚未安装')
    image = Image.open(io.BytesIO(_data_bytes(image_value))).convert('RGB')
    original_size = image.size
    resized = image.resize((768, 768), Image.Resampling.LANCZOS)
    value = np.asarray(resized, dtype=np.float32) / 255.0
    value = (value - np.asarray([0.485, 0.456, 0.406], dtype=np.float32)) / np.asarray([0.229, 0.224, 0.225], dtype=np.float32)
    value = np.ascontiguousarray(value.transpose(2, 0, 1)[None])
    started = time.perf_counter()

    with _exhibit_matting_lock:
        mtime = os.path.getmtime(EXHIBIT_MATTING_MODEL)
        if _exhibit_matting['session'] is None or _exhibit_matting['mtime'] != mtime:
            interpreter = MNN.Interpreter(EXHIBIT_MATTING_MODEL)
            session = interpreter.createSession({'numThread': THREAD_NUM})
            _exhibit_matting.update(mtime=mtime, interpreter=interpreter, session=session)
        interpreter = _exhibit_matting['interpreter']; session = _exhibit_matting['session']
        tensor = interpreter.getSessionInput(session, 'image')
        host = MNN.Tensor(list(value.shape), MNN.Halide_Type_Float, value, MNN.Tensor_DimensionType_Caffe)
        tensor.copyFrom(host)
        interpreter.runSession(session)
        output = interpreter.getSessionOutput(session, 'alpha')
        shape = output.getShape()
        if tuple(shape) != (1, 1, 768, 768):
            raise RuntimeError(f'展品抠图 MNN 输出尺寸异常: {shape}')
        result = MNN.Tensor(shape, MNN.Halide_Type_Float, np.zeros(shape, dtype=np.float32), MNN.Tensor_DimensionType_Caffe)
        output.copyToHostTensor(result)
        alpha = np.asarray(result.getData(), dtype=np.float32).reshape(shape)[0, 0]

    alpha_u8 = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    alpha_image = Image.fromarray(alpha_u8).resize(original_size, Image.Resampling.LANCZOS)
    # Keep the runtime quality gate consistent with the frozen-blind IoU
    # evaluation, which thresholds foreground probability at 0.5.
    foreground = np.asarray(alpha_image, dtype=np.uint8) >= 128
    foreground_ratio = float(np.count_nonzero(foreground) / max(foreground.size, 1))
    accepted = 0.05 <= foreground_ratio <= 0.85
    reason = '' if accepted else ('目标过小，请靠近展品重拍' if foreground_ratio < 0.05 else '前景占比过大，疑似把展厅背景当成展品，请重拍')
    cutout = image.convert('RGBA')
    cutout.putalpha(alpha_image)
    alpha_buffer = io.BytesIO(); alpha_image.save(alpha_buffer, format='PNG', optimize=True)
    cutout_buffer = io.BytesIO(); cutout.save(cutout_buffer, format='PNG', optimize=True)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        'alpha': 'data:image/png;base64,' + base64.b64encode(alpha_buffer.getvalue()).decode(),
        'image': 'data:image/png;base64,' + base64.b64encode(cutout_buffer.getvalue()).decode(),
        'stats': {
            'accepted': accepted, 'reason': reason, 'foregroundRatio': foreground_ratio,
            'elapsedMs': elapsed_ms, 'runtime': 'MNN 3.6.1', 'model': 'exhibit-matting-v1',
            'acceleration': ACCELERATION,
        },
    }


def _strip_repetition_collapse(t: str) -> str:
    """Remove only an unmistakable terminal short-period loop; never invent text."""
    value = (t or '').rstrip()
    collapse_start = len(value)
    for period in range(1, 17):
        if len(value) < period * 8:
            continue
        unit = value[-period:]
        # Restrict the detector to token-like loops seen at decode collapse;
        # ordinary punctuation rules and table borders remain untouched.
        if not all(char.isalnum() or '\u3400' <= char <= '\u9fff' or char in ('□', '`') for char in unit):
            continue
        start = len(value)
        while start >= period and value[start - period:start] == unit:
            start -= period
        if len(value) - start >= max(64, period * 8):
            collapse_start = min(collapse_start, start)
    if collapse_start == len(value):
        return t
    prefix = value[:collapse_start].rstrip()
    visible = re.sub(r'\s+', '', prefix)
    tail_coverage = (len(value) - collapse_start) / max(1, len(value))
    # A trustworthy prefix survives. A page that is entirely collapsed becomes
    # an explicit unknown glyph and remains review-required instead of hallucinating.
    return prefix if tail_coverage < 0.85 and len(visible) >= 4 and len(set(visible)) >= 3 else '□'


def _strip_fence(t: str) -> str:
    t = _THINK.sub('', t or '')              # 先去思考块
    t = _EOS.split(t)[0]                      # 砍掉终止符之后的失控尾巴
    t = _RUNAWAY.sub('', t)                   # 砍掉 ** --- 复读尾巴
    t = _strip_repetition_collapse(t)         # 只裁剪可证明的终端单字循环
    return _FENCE.sub('', t.strip()).strip()  # 再去代码围栏


class H(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        try:
            self.send_response(code); self.send_header('content-type', 'application/json')
            self.send_header('content-length', str(len(body))); self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            # A mobile browser may cancel a long OCR request when the view changes
            # or its deadline expires. Inference still owns native MNN resources
            # until the current call unwinds, so treat the vanished client as a
            # normal cancellation instead of recursively attempting a second
            # response and polluting the sidecar error log.
            return

    def log_message(self, *a):  # 静音默认访问日志
        pass

    def do_GET(self):
        if self.path == '/v1/assets':
            return self._send({'status': 'ok', 'assets': _asset_snapshot()})
        if self.path == '/health':
            ready = {
                'text': os.path.isfile(TEXT_CONFIG or ''),
                'vision': os.path.isfile(VISION_CONFIG or ''),
                'travel': os.path.isfile(TRAVEL_CONFIG or ''),
            }
            adapters = {
                name: {
                    'installed': _adapter_files_ready(name, path),
                    'file': os.path.basename(path) if path else '',
                    **({'languageFile': os.path.basename(GENERAL_OCR_LANGUAGE_LORA)}
                       if name == 'general-ocr-vision' and GENERAL_OCR_LANGUAGE_LORA else {}),
                }
                for name, path in _ADAPTERS.items()
            }
            adapters.update({
                name: {
                    'installed': _language_adapter_files_ready(name, path),
                    'file': os.path.basename(path) if path else '',
                    'scope': 'language',
                }
                for name, path in _LANGUAGE_ADAPTERS.items()
            })
            restorer = {'installed': bool(RESTORATION_MODEL and os.path.isfile(RESTORATION_MODEL)),
                        'file': os.path.basename(RESTORATION_MODEL) if RESTORATION_MODEL else ''}
            exhibit_matting = {'installed': bool(EXHIBIT_MATTING_MODEL and os.path.isfile(EXHIBIT_MATTING_MODEL)),
                               'file': os.path.basename(EXHIBIT_MATTING_MODEL) if EXHIBIT_MATTING_MODEL else ''}
            return self._send({'status': 'ok', 'backend': 'mnn', 'models': ready,
                               'adapters': adapters, 'restorer': restorer, 'exhibitMatting': exhibit_matting,
                               'assets': _asset_snapshot(), 'acceleration': ACCELERATION,
                               'visualLoraRuntime': {
                                   'ready': _visual_lora_runtime_ready(),
                                   'patchId': VISUAL_LORA_PATCH_ID,
                               }})
        self._send({'error': 'not found'}, 404)

    def do_POST(self):
        if self.path.startswith('/v1/assets/import/'):
            return _import_asset(self, self.path.rsplit('/', 1)[-1])
        ln = int(self.headers.get('content-length', 0))
        try:
            req = json.loads(self.rfile.read(ln) or b'{}')
        except Exception:
            return self._send({'error': 'bad json'}, 400)
        try:
            if self.path == '/v1/assets/install':
                asset_id = req.get('asset')
                if asset_id == 'qwen3-vl-2b-mnn':
                    started = _start_qwen_download()
                    return self._send({'status': 'accepted' if started else 'already_running', 'assets': _asset_snapshot()}, 202)
                if asset_id in _BUNDLED_ASSETS:
                    metadata = _install_bundled_asset(asset_id)
                    return self._send({'status': 'installed', 'asset': metadata, 'assets': _asset_snapshot()})
                return self._send({'error': 'asset_has_no_install_source'}, 400)
            if self.path == '/v1/assets/cancel':
                with _asset_lock: _asset_job['cancel'] = True
                return self._send({'status': 'cancelling', 'assets': _asset_snapshot()})
            if self.path == '/v1/assets/uninstall':
                result = _uninstall_asset(req.get('asset', ''))
                return self._send({'status': 'uninstalled', 'asset': result, 'assets': _asset_snapshot()})
            if self.path == '/v1/chat':
                name = 'vision' if req.get('model') == 'vision' or req.get('images') else 'text'
                sys_p = (req.get('system') or '').strip()
                # 防截断：要 JSON 时显式要求纯 JSON、禁代码围栏
                if req.get('json'):
                    sys_p = (sys_p + '\n只输出纯 JSON，不要 Markdown 代码块、不要 ``` 包裹。').strip()
                prompt = (sys_p + '\n' + req.get('prompt', '')).strip() if sys_p else req.get('prompt', '')
                if name == 'vision':
                    # 多模态模型不能跨调用重用：每次全新实例(mmap 重载很快)、用完释放，保证稳定无失控
                    adapter = (req.get('adapter') or '').strip()
                    cfg = _visual_lora_config(adapter)
                    if not (cfg and os.path.isfile(cfg)):
                        raise RuntimeError('vision 模型未配置')
                    limit = max(1, min(1024, int(req.get('max_new_tokens') or 512)))
                    base_model = _load(cfg, max_new_tokens=limit)
                    model = base_model
                    try:
                        out = _infer(model, prompt, req.get('images'), req.get('detail') or 'fast', limit)
                    finally:
                        del base_model
                        gc.collect()
                else:
                    adapter = (req.get('adapter') or '').strip()
                    if adapter:
                        path = _language_adapter_path(adapter)
                        if not TRAVEL_CONFIG or not os.path.isfile(TRAVEL_CONFIG):
                            raise RuntimeError('旅行规划 LoRA 需要兼容的 Qwen3-VL-2B MNN 语言基座')
                        limit = max(1, min(1024, int(req.get('max_new_tokens') or 512)))
                        # Prefer the native split-LoRA binding. Some official
                        # PyMNN 3.6.1 wheels omit it, so fall back to the already
                        # blind-tested overlay graph + identical shared weights.
                        base_model = _load(TRAVEL_CONFIG, max_new_tokens=limit)
                        lora_model = None
                        try:
                            if hasattr(base_model, 'create_lora'):
                                with _language_lora_lock:
                                    lora_model = base_model.create_lora(path)
                                if lora_model is None:
                                    raise RuntimeError(f'MNN create_lora 失败: {adapter}')
                            else:
                                del base_model
                                base_model = None
                                lora_model = _load(_language_lora_config(adapter), max_new_tokens=limit)
                            out = _infer(lora_model, prompt, max_new_tokens=limit)
                        finally:
                            if lora_model is not None:
                                del lora_model
                            if base_model is not None:
                                del base_model
                            gc.collect()
                    else:
                        out = _infer(_ensure(name), prompt, req.get('images'))
                return self._send({'backend': 'mnn', 'model': name, 'text': _strip_fence(out)})
            if self.path == '/v1/restoration':
                image, stats = _restore_image(req.get('image') or '', req.get('mask') or '')
                return self._send({'backend': 'mnn', 'image': image, 'stats': stats})
            if self.path == '/v1/exhibit-matting':
                return self._send({'backend': 'mnn', **_matte_exhibit(req.get('image') or '')})
            if self.path == '/v1/embeddings':
                # MNN-LLM 主线给 chat；嵌入若无专用头，由上层适配层降级为确定性向量。
                return self._send({'backend': 'mnn', 'vectors': None,
                                   'note': 'no embedding head; caller should fallback'})
            self._send({'error': 'not found'}, 404)
        except Exception as e:
            self._send({'backend': 'stub', 'error': str(e)}, 200)  # 出错回 stub 语义，上层自动降级


def main():
    if not TEXT_CONFIG and not VISION_CONFIG:
        print('[server] 未设置 MNN_TEXT_CONFIG / MNN_VISION_CONFIG，先 fetch-models.sh 再用 serve.sh 传入', file=sys.stderr)
    print(f'[server] MNN sidecar 监听 127.0.0.1:{PORT}  text={bool(TEXT_CONFIG)} vision={bool(VISION_CONFIG)}')
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()


if __name__ == '__main__':
    main()
