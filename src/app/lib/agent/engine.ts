// 自定义 agent 工厂 · 通用 agent 引擎（meta-agent 生成的 agent 的「跑」）。
// 这是 movie/book 六层骨架的【参数化版】：吃一份 manifest + 用户一句输入 →
//   感知 → 云脑/端侧按 manifest.tagFields 打标 + 按 geoStrategy 选落点城市 → geocode → 草稿(suggest)。
// 单级失败降级、不抛错（舱壁）。产出未钉，由 pin.ts 确认才落地。完全解耦：只依赖共享 geocodeCity + 模型。
import { resolvePlace } from '../skills/resolvePlace';
import { extractJSON } from '../skills/enrichEntity';
import { visionExtract, type FieldSpec } from '../skills/visionExtract';
import { getFrostBrain } from '../../../../frost-agent/harness/brain';
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import { GEO_LABEL, type AgentManifest } from './manifest';

export interface CustomGeo { place: string; lat: number; lng: number; strategy: string }
export interface CustomDraft {
  id: string;              // 稳定：input 归一
  agentId: string;
  label: string;           // 这一条对象的名字
  tags: Record<string, string>;   // 按 manifest.tagFields 填
  note: string;            // 一句关系说明（云脑写）
  geo: CustomGeo | null;
  needPlace: boolean;
  via: 'edge' | 'cloud' | 'rules';
  confidence: number;
  reason: string;
}

// 保留所有 Unicode 字母/数字（不止汉字）——否则日文假名/韩文/西里尔被删光，不同输入会归一成同一 id 致草稿碰撞。
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 40) || 'item';

function buildPrompt(manifest: AgentManifest, input: string): string {
  const strat = manifest.geoStrategy.map((g) => GEO_LABEL[g] || g).join(' > ');
  return [
    `你是一个专门整理「${manifest.domain}」的助手。用户给了一条：「${input}」。`,
    `请只输出纯 JSON（不要解释、代码、链接）：`,
    `{`,
    `  "label": "这条对象的规范名字",`,
    `  "tags": { ${manifest.tagFields.map((f) => `"${f}": "值，不知道就空字符串"`).join(', ')} },`,
    `  "city": "按『${strat}』这个优先级，这条对象最该钉到地球上的哪座城市（只给一个城市名，中文或英文均可）",`,
    `  "country": "所属国家（备用，城市定位不到时用）",`,
    `  "note": "≤30字，一句话说明它为什么属于那座城（口吻：${manifest.persona || '简洁'}）"`,
    `}`,
  ].join('\n');
}

type EnrichOut = { label?: string; tags?: Record<string, string>; city?: string; country?: string; note?: string };

/** 跑一个自定义 agent：manifest + 一句输入 → 草稿。onEdge 时只走浏览器内 Gemma。 */
export async function runCustomAgent(manifest: AgentManifest, input: string, opts?: { onEdge?: boolean }): Promise<CustomDraft | null> {
  const text = input.trim();
  if (!text) return null;
  const draft: CustomDraft = {
    id: `${manifest.id}-${norm(text)}`, agentId: manifest.id, label: text, tags: {}, note: '',
    geo: null, needPlace: true, via: 'rules', confidence: 0.3, reason: `输入「${text}」`,
  };

  const prompt = buildPrompt(manifest, text);
  let raw = '';
  const wantEdge = !!opts?.onEdge && manifest.tools.includes('edge_tag');
  if (wantEdge && (await edgeSafe.available())) { raw = await edgeSafe.chat(prompt, { json: true }); if (raw) draft.via = 'edge'; }
  if (!wantEdge && !raw && manifest.tools.includes('enrich')) {
    try { raw = (await getFrostBrain().complete(prompt, { json: true })) || ''; } catch { raw = ''; }
    if (raw) draft.via = 'cloud';
  }

  const r = extractJSON<EnrichOut>(raw);
  if (r) {
    if (r.label) draft.label = r.label;
    if (r.tags && typeof r.tags === 'object') {
      for (const f of manifest.tagFields) { const v = r.tags[f]; if (typeof v === 'string' && v.trim()) draft.tags[f] = v.trim(); }
    }
    draft.note = (r.note || '').toString().slice(0, 40);
    draft.confidence = 0.7;
    draft.reason += `；${draft.via === 'edge' ? '端侧' : '云脑'}补全`;
    // 落点：geocode 城市 → 不行再 country。geoStrategy 决定的是「找哪类地名」，已由 prompt 表达。
    if (manifest.tools.includes('geocode')) {
      const hit = (r.city && await resolvePlace(r.city)) || (r.country && await resolvePlace(r.country)) || null;
      if (hit) draft.geo = { place: hit.place, lat: hit.lat, lng: hit.lng, strategy: manifest.geoStrategy[0] || 'manual' };
    }
  } else {
    draft.reason += '；模型不可用→保留输入（可手动指定地点）';
  }
  draft.needPlace = !draft.geo;
  return draft;
}

/**
 * 从【一张图】跑自定义 agent：复用 visionExtract skill（原图只进端侧 VL、不出端）→ 按 manifest.tagFields
 * 把图读成结构化草稿 → geocode → 草稿(suggest)。这让任意自建 agent 白得「拍图/截图入库」能力，零改本引擎。
 */
export async function runCustomAgentFromImage(manifest: AgentManifest, imageDataUrl: string): Promise<CustomDraft | null> {
  if (!imageDataUrl) return null;
  // schema = 标准的 名字 + 地点（用于落点）+ manifest 声明的各标签字段。
  const fields: FieldSpec[] = [
    { key: '_label', label: '名字/标题', hint: `这个${manifest.domain}叫什么` },
    { key: '_place', label: '地点/城市', hint: '相关的城市或地点（用于钉地球）' },
    ...manifest.tagFields.map((f) => ({ key: f, label: f })),
  ];
  const res = await visionExtract({ imageDataUrl, domain: manifest.domain, fields });
  if (res.visionVia === 'none') return null;   // 端侧 VL 未就绪/没读出（原图不送云）→ 交回 UI 提示

  const label = res.fields._label || '（未识别）';
  const draft: CustomDraft = {
    id: `${manifest.id}-img-${norm(label + (res.fields._place || ''))}`, agentId: manifest.id,
    label, tags: {}, note: '',
    geo: null, needPlace: true,
    via: res.onDevice ? 'edge' : res.structuredVia === 'cloud' ? 'cloud' : 'rules',
    confidence: res.ok ? 0.7 : 0.4,
    reason: `截图识别（端侧 VL${res.onDevice ? '+端侧结构化' : res.structuredVia === 'cloud' ? '+云脑结构化' : ''}）`,
  };
  for (const f of manifest.tagFields) if (res.fields[f]) draft.tags[f] = res.fields[f];
  if (manifest.tools.includes('geocode') && res.fields._place) {
    const hit = await resolvePlace(res.fields._place);
    if (hit) draft.geo = { place: hit.place, lat: hit.lat, lng: hit.lng, strategy: manifest.geoStrategy[0] || 'manual' };
  }
  draft.needPlace = !draft.geo;
  return draft;
}
