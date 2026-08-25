import type { SkillManifest } from './types';
import { disableSkill, equipSkill, getEquippedSkill, getInstalledSkill, installSkillManifest, uninstallSkill } from './registry';

const QWEN_BASE_SHA = '1ec84bc53d6a58ce3685419dd0b2ad2bdb289cb18d876deec21634ff68c90313';
const RELEASED_AT = '2026-08-11T00:00:00+08:00';
const OSS_MODEL_BASE = 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/models';
const lifecycle = (kind: SkillManifest['kind']): Pick<SkillManifest, 'quality_gate' | 'fallback' | 'evaluation' | 'distribution'> => ({
  quality_gate: {
    policy_id: kind === 'markdown' ? 'pocket.workflow-gate/v1' : 'pocket.mnn-adapter-gate/v1',
    checks: kind === 'markdown'
      ? ['输入符合结构化 Schema', '写入地图前取得用户确认']
      : ['Base revision 与资产 SHA256 一致', '低置信度结果不得自动覆盖原始资料', '最终写入前取得用户确认'],
  },
  fallback: { order: kind === 'markdown' ? ['rules', 'user-confirmation', 'stop'] : ['adapter', 'base', 'rules', 'user-confirmation', 'stop'] },
  evaluation: { suite: kind === 'markdown' ? 'builtin-workflow-contract-v1' : 'static-mnn-asset-contract-v1', passed: true, score: 1, threshold: 1, tested_at: RELEASED_AT },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
});

const markdown = (id: string, name: string, description: string, target: string, schemas: string[], scopes: SkillManifest['permissions']['scopes'], tools: SkillManifest['permissions']['tools']): SkillManifest => ({
  protocol: 'pocket-skill/v1',
  identity: { id, name, version: '1.0.0', author: 'Pocket Earth', description },
  kind: 'markdown',
  entry: { target },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'android-arm64'] },
  permissions: { scopes, tools, network_hosts: scopes.includes('network') ? ['dashscope.aliyuncs.com'] : [] },
  data: { schemas },
  ...lifecycle('markdown'),
  assets: [],
  provenance: { source: 'Pocket Earth 决赛内置发行版', license: 'private-demo', released_at: RELEASED_AT },
});

const lora = (options: {
  id: string; name: string; description: string; target: string; adapter: string; sha256: string; bytes: number; url: string;
  schemas?: string[]; tools: SkillManifest['permissions']['tools']; scopes: SkillManifest['permissions']['scopes']; kind?: 'lora' | 'hybrid';
  extraAssets?: SkillManifest['assets'];
  qualityGate?: SkillManifest['quality_gate']; evaluation?: SkillManifest['evaluation'];
}): SkillManifest => ({
  protocol: 'pocket-skill/v1',
  identity: { id: options.id, name: options.name, version: '1.0.0', author: 'Pocket Earth', description: options.description },
  kind: options.kind || 'lora',
  entry: { target: options.target, adapter: options.adapter },
  runtime: {
    execution: 'mnn', runtime_min: '1.0.0', platforms: ['android-arm64'],
    base: { id: 'qwen3-vl-2b-mnn-dual', revision: 'pocketearth-dual-base-20260811', sha256: QWEN_BASE_SHA },
  },
  permissions: { scopes: options.scopes, tools: options.tools, network_hosts: [] },
  data: { schemas: options.schemas || [] },
  ...lifecycle(options.kind || 'lora'),
  ...(options.qualityGate ? { quality_gate: options.qualityGate } : {}),
  ...(options.evaluation ? { evaluation: options.evaluation } : {}),
  assets: [{ id: options.adapter, role: 'adapter', media_type: 'application/octet-stream', bytes: options.bytes, sha256: options.sha256, url: options.url }, ...(options.extraAssets || [])],
  provenance: { source: 'Pocket Earth MNN release bundle', license: 'private-demo', released_at: RELEASED_AT },
});

export const BUILTIN_SKILLS: SkillManifest[] = [
  markdown('pocket.earth-answer', '地球答案', '每天一次，把可靠行动原文交给 Frost 执行。', 'earth-answer-agent', [], [], []),
  markdown('pocket.music', '音乐', '用可替换 Data Pack 把音乐与城市记忆钉回地球。', 'music-agent', ['pocket.music/v1'], ['network'], ['enrich', 'geocode', 'mark_place', 'data_pack']),
  markdown('pocket.books', '书籍', '用可替换 Data Pack 整理阅读并落到故事地或作者地。', 'books-agent', ['pocket.books/v1'], ['network'], ['enrich', 'geocode', 'mark_place', 'data_pack']),
  markdown('pocket.movies', '电影', '用可替换 Data Pack 整理观影并落到取景地或故事地。', 'movies-agent', ['pocket.movies/v1'], ['network'], ['enrich', 'geocode', 'mark_place', 'data_pack']),
  markdown('pocket.photos', '照片', '在端侧整理照片，并用独立照片 Schema 同步用户确认的元数据。', 'photos-agent', ['pocket.photos/v1'], ['photos', 'network'], ['vision', 'geocode', 'mark_place', 'data_pack']),
  markdown('pocket.council', '多视角思考', '由同一个 Frost 切换多个专业视角，给出可核验的综合判断。', 'council-room', [], ['network'], ['enrich']),
  lora({
    id: 'pocket.reading-jot', name: '阅读摘录', description: '拍摄书页后用红线或双竖线框定原文；Base 优先，通用 OCR LoRA 只作压力候选，独立复核后确认并保存本机阅读卡片。', target: 'jot-agent',
    adapter: 'general-ocr-vision-lora', sha256: 'd09be9ee9a41c7ec87c45e2f721ad7861a493eeb11b04611ec06380d19fc9f5e', bytes: 17588592,
    url: `${OSS_MODEL_BASE}/general-ocr-vision-lora/pocketearth-int8-20260810/visual-lora.mnn`,
    schemas: ['pocket.reading-note/v1'], scopes: ['photos'], tools: ['vision'],
    qualityGate: {
      policy_id: 'pocket.reading-jot-gate/v2',
      checks: [
        '清晰选区和有效 Base 不运行 LoRA',
        'LoRA 只在图像退化或 Base 硬门异常时成为候选',
        '空输出、重复塌缩、任务漂移和近解码上限进入复核',
        'LoRA 自动晋级必须获得独立增强视图支持',
        'Base/LoRA 强分歧必须人工校文',
        '最终写入前取得用户确认且原文仍可编辑',
      ],
    },
    evaluation: { suite: 'reading-jot-routing-contract-v2', passed: true, score: 1, threshold: 1, tested_at: RELEASED_AT },
  }),
  lora({
    id: 'pocket.travel', name: '旅行规划', description: 'Travel LoRA 理解约束，确定性工具负责天气、路径和落图。', target: 'travel-skill',
    adapter: 'travel-planner-lora', sha256: '791a4659ecd86dba2336ca4fdc3a4ee93640bed5b7f92370bfdc3c702450dc13', bytes: 72633256,
    url: `${OSS_MODEL_BASE}/travel-planner-lora/travel-planner-v1/lora.mnn`,
    scopes: ['location'], tools: ['geocode', 'mark_place'],
  }),
  lora({
    id: 'pocket.exhibition', name: '看展搭子', description: '端侧展签识读、展品抠图与 2.5D 观察，明确授权后才云端补全。', target: 'exhibition-agent',
    adapter: 'exhibit-matting', sha256: '95f35d70763cd83f58e79d83ebba2c682853bee764906dce9b366d1d07ea4b10', bytes: 146105104,
    url: `${OSS_MODEL_BASE}/exhibit-matting/exhibit-matting-v1/exhibit-matting-fp16.mnn`,
    scopes: ['photos', 'location'], tools: ['vision', 'geocode', 'mark_place'], kind: 'hybrid',
  }),
  lora({
    id: 'pocket.book-to-earth', name: 'Book-to-Earth', description: '识读书籍和资料，保留原文证据，经人工确址后生成独立 Mapping Data Pack。', target: 'agent-forge',
    adapter: 'guji-vision-lora', sha256: '6d24871634ff4c1a9af67c5b722f4c311c59fbbe9b23b17111e915f75a992112', bytes: 17588592,
    url: `${OSS_MODEL_BASE}/guji-vision-lora/pocketearth-int8-20260810/visual-lora.mnn`,
    schemas: ['pocket.mapping/v1'], scopes: ['location'], tools: ['vision', 'geocode', 'mark_place', 'data_pack'], kind: 'hybrid',
  }),
  lora({
    id: 'pocket.rubbing', name: '碑拓识读与数字复原', description: 'Base 与碑拓 LoRA 双候选门控；修复只改用户涂选的残损区域，原图永远保留。', target: 'heritage-restoration',
    adapter: 'rubbing-vision-lora', sha256: '1427fbb08d32607db54796c935d4afde634281990f5dac1be808652e4518858e', bytes: 17588592,
    url: `${OSS_MODEL_BASE}/rubbing-vision-lora/pocketearth-int8-20260810/visual-lora.mnn`,
    scopes: ['photos'], tools: ['vision', 'restore'], kind: 'hybrid',
    extraAssets: [{ id: 'heritage-restorer', role: 'model', media_type: 'application/octet-stream', bytes: 15581812, sha256: 'c571f66050be527e7e531b9c116a417c4fece0ec4090cdaf5d2497a8c0eb5a87', url: `${OSS_MODEL_BASE}/heritage-restorer/restorer-v1/heritage-restorer.mnn` }],
  }),
];

export function ensureBuiltinSkills(): void {
  BUILTIN_SKILLS.forEach((manifest) => {
    const key = `${manifest.identity.id}@${manifest.identity.version}`;
    if (!getInstalledSkill(key)) installSkillManifest(manifest, 'builtin');
    if (manifest.assets.every((asset) => asset.optional)) equipSkill(key);
    else if (getEquippedSkill(manifest.identity.id)?.key === key && !getInstalledSkill(key)?.assetsVerifiedAt) disableSkill(manifest.identity.id);
  });
  // pocket.capture was the former generic screenshot router. Reading Jot replaces that built-in
  // without touching any user-authored note/map data (the old manifest had no model assets).
  if (getInstalledSkill('pocket.capture@1.0.0')) uninstallSkill('pocket.capture@1.0.0');
}
