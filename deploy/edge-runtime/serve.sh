#!/usr/bin/env bash
# 起本机 MNN sidecar（端侧推理 HTTP 端点），带端侧调优参数。
# 起好后把应用的 .env 设成 EDGE_BACKEND=mnn、MNN_URL=http://127.0.0.1:8000 即可切到端侧。
set -euo pipefail

MODELS_DIR="${MODELS_DIR:-$HOME/mnn-models}"
MNN_DIR="${MNN_DIR:-$HOME/mnn-src/MNN-3.6.1-pocketearth}"
export MNN_TEXT_CONFIG="${MNN_TEXT_CONFIG:-$MODELS_DIR/Qwen3.5-0.8B-MNN/config.json}"
# 比赛视觉主链固定为 Qwen3-VL-2B；目录尚未下载时 sidecar 仍可启动，供 UI 一键安装。
# The released visual LoRAs are attested to the INT8 visual graph. Prefer that
# exact local bundle when it is present; older development machines used the
# v5-int8-paired directory name, while release installs use the shorter name.
DEFAULT_VISION_DIR="$MODELS_DIR/Qwen3-VL-2B-Instruct-MNN-INT8"
if [[ ! -f "$DEFAULT_VISION_DIR/config.json" && -f "$MODELS_DIR/Qwen3-VL-2B-Instruct-MNN-v5-int8-paired/config.json" ]]; then
  DEFAULT_VISION_DIR="$MODELS_DIR/Qwen3-VL-2B-Instruct-MNN-v5-int8-paired"
fi
if [[ ! -f "$DEFAULT_VISION_DIR/config.json" ]]; then
  DEFAULT_VISION_DIR="$MODELS_DIR/Qwen3-VL-2B-Instruct-MNN"
fi
export MNN_VISION_CONFIG="${MNN_VISION_CONFIG:-$DEFAULT_VISION_DIR/config.json}"
DEFAULT_TRAVEL_DIR="$MODELS_DIR/Qwen3-VL-2B-Instruct-MNN"
export MNN_TRAVEL_CONFIG="${MNN_TRAVEL_CONFIG:-$DEFAULT_TRAVEL_DIR/config.json}"
export MNN_GUIJI_LORA="${MNN_GUIJI_LORA:-$(dirname "$MNN_VISION_CONFIG")/guji-visual-lora.mnn}"
export MNN_RUBBING_LORA="${MNN_RUBBING_LORA:-$(dirname "$MNN_VISION_CONFIG")/rubbing-visual-lora.mnn}"
export MNN_GENERAL_OCR_LORA="${MNN_GENERAL_OCR_LORA:-$(dirname "$MNN_VISION_CONFIG")/general-ocr-visual-lora.mnn}"
export MNN_TRAVEL_PLANNER_LORA="${MNN_TRAVEL_PLANNER_LORA:-$(dirname "$MNN_TRAVEL_CONFIG")/travel-planner-lora.mnn}"
# v6 起只挂视觉 LoRA，解码器使用共享 Qwen 原生语言基座。
# 只有显式运行旧版成对包时才设置此变量。
export MNN_GENERAL_OCR_LANGUAGE_LORA="${MNN_GENERAL_OCR_LANGUAGE_LORA:-}"
export MNN_HERITAGE_RESTORER="${MNN_HERITAGE_RESTORER:-$(dirname "$MNN_VISION_CONFIG")/heritage-restorer.mnn}"
export MNN_EXHIBIT_MATTING="${MNN_EXHIBIT_MATTING:-$(dirname "$MNN_VISION_CONFIG")/exhibit-matting-fp16.mnn}"
export MNN_VISUAL_LORA_MARKER="${MNN_VISUAL_LORA_MARKER:-$MNN_DIR/.pocketearth-visual-lora-runtime.json}"
export MNN_PORT="${MNN_PORT:-8000}"
export MNN_THREAD_NUM="${MNN_THREAD_NUM:-4}"   # 绑大核数量
export MNN_PRECISION="${MNN_PRECISION:-low}"   # low 换速度
export MNN_USE_MMAP="${MNN_USE_MMAP:-true}"    # 防大模型加载闪退

# 本机源码构建没有安装进系统 site-packages 时，自动挂载 PyMNN 与动态库。
# Android 正式包不走这个 shell；这里只修复 macOS 开发机的一键启动。
if [[ "$(uname -s)" == "Darwin" ]]; then
  MNN_PY_BUILD="${MNN_PY_BUILD:-$(find "$MNN_DIR/pymnn/pip_package/build" -maxdepth 1 -type d -name 'lib.*' -print -quit 2>/dev/null || true)}"
  if [[ -n "$MNN_PY_BUILD" ]]; then
    export PYTHONPATH="$MNN_PY_BUILD${PYTHONPATH:+:$PYTHONPATH}"
  fi
  if [[ -d "$MNN_DIR/pymnn_build" ]]; then
    export DYLD_LIBRARY_PATH="$MNN_DIR/pymnn_build${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
  fi
  if [[ -z "${PYTHON:-}" && "$MNN_PY_BUILD" == *-3.9 ]]; then
    MNN_PYTHON39="/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python"
    if [[ -x "$MNN_PYTHON39" ]]; then
      PYTHON="$MNN_PYTHON39"
    fi
  fi
fi

echo "[serve] 文本模型: $MNN_TEXT_CONFIG"
echo "[serve] 视觉模型: $MNN_VISION_CONFIG"
echo "[serve] 旅行语言基座: $MNN_TRAVEL_CONFIG"
echo "[serve] 古籍 LoRA: $MNN_GUIJI_LORA"
echo "[serve] 碑拓 LoRA: $MNN_RUBBING_LORA"
echo "[serve] 通用 OCR LoRA: $MNN_GENERAL_OCR_LORA"
echo "[serve] 旅行规划语言 LoRA: $MNN_TRAVEL_PLANNER_LORA"
if [[ -n "$MNN_GENERAL_OCR_LANGUAGE_LORA" ]]; then
  echo "[serve] 旧版通用 OCR 语言 LoRA: $MNN_GENERAL_OCR_LANGUAGE_LORA"
else
  echo "[serve] 通用 OCR 解码器: 共享 Qwen 原生语言基座"
fi
echo "[serve] 修复生成器: $MNN_HERITAGE_RESTORER"
echo "[serve] 展品抠图模型: $MNN_EXHIBIT_MATTING"
echo "[serve] 视觉 LoRA 运行时标记: $MNN_VISUAL_LORA_MARKER"
echo "[serve] 端口: $MNN_PORT  线程: $MNN_THREAD_NUM  精度: $MNN_PRECISION  mmap: $MNN_USE_MMAP"
# 也可显式用装了 MNN 的解释器（venv），例如 PYTHON=~/mnn-venv/bin/python。
exec "${PYTHON:-python3}" "$(dirname "$0")/server.py"
