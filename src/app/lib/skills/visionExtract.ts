// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 识图→结构化（vision extract）= visionRead + textExtract
// ────────────────────────────────────────────────────────────────────────────
// 一句话：给一张图 + 一份「目标字段 schema」，端侧把图读懂、整理成匹配 schema 的结构化 JSON。
//
// 为什么这是「端侧必须」的能力（端侧必要性论证 —— 这正是本 skill 想说明的事）：
//   · 隐私铁律：用户的截图/相册照片里常有票据、票根、身份证号、手机号、定位等敏感信息。
//     本 skill 的【① 视觉读图】这一步**只调端侧 Gemma 3n（MediaPipe / WebGPU）**，
//     原图一个字节都不出端、不上云。没有端侧 VL，就只能把原图传云——那会泄露隐私。所以这是「云替代不了」的。
//   · 离线 / 低延迟：图就在手机上，端侧直接读，不依赖网络往返、不耗流量传大图。
//
// 组合（书 §3.12：skill 可组合 skill，无层级）：本 skill = [visionRead]（① 图→脱敏文本，端侧）
//   + [textExtract]（② 文字→字段，端侧优先/回退云）。两半截各自独立、对称：
//     visionRead    : 图  → 文字
//     textExtract   : 文字 → 字段
//     visionExtract : 图  → 字段
//   想要纯文本再自行做嵌套结构化的（如旅行的 segments/stays/spots）→ 直接用 [visionRead]，不必经本 skill。
//   想直接把一段文本结构化（不经图）→ 直接用 [textExtract]。
//
// 泛化（解决「电影 schema≠书 schema」）：schema 是【调用方传入的参数】（fields），不写死。
//   FieldSpec 的契约定义在 [textExtract]；这里再导出以兼容现有引用。
// ════════════════════════════════════════════════════════════════════════════
import { visionRead } from './visionRead';
import { textExtract, type FieldSpec } from './textExtract';

export type { FieldSpec };

export interface VisionExtractInput {
  imageDataUrl: string;     // 原图（dataURL / objectURL）——只进端侧视觉，绝不出端
  domain: string;           // 领域上下文，如 '电影' / '书' / '咖啡馆' / '野生鸟类'
  fields: FieldSpec[];      // 目标 schema（调用方提供）
  redact?: boolean;         // 是否对端侧读出的文本做敏感号脱敏（默认 true，双保险）
}

export interface VisionExtractResult {
  fields: Record<string, string>;            // 按 fields.key 填好的结构化结果（图上没有的字段缺省不填）
  raw: string;                               // 端侧 VL 读出并脱敏后的原始文本（可调试 / 展示）
  ok: boolean;                               // 是否抽到 ≥1 个字段
  visionVia: 'edge' | 'none';                // 视觉永远端侧；'none' = 端侧 VL 未就绪/没读出
  structuredVia: 'edge' | 'cloud' | 'none';  // 结构化走端侧 Qwen/MNN 还是云端 Qwen
  onDevice: boolean;                         // 是否全程端侧（视觉+结构化都端侧）
}

// ① 视觉提示词：让端侧 VL 只读图上确有的字段、逐行输出，禁编造、禁输出敏感号。
function visionPrompt(domain: string, fields: FieldSpec[]): string {
  const lines = fields.map((f) => `· ${f.label}${f.hint ? `（${f.hint}）` : ''}`).join('\n');
  return [
    `这是一张关于「${domain}」的图片或截图。请只读出图中【实际可见】的信息，逐条输出，每条一行，格式「字段名：值」：`,
    lines,
    `规则：图上没有的字段就跳过，绝不编造；绝不输出身份证号、手机号、银行卡号、二维码内容——遇到一律写 ***。`,
  ].join('\n');
}

/**
 * 识图→结构化。原图只进端侧视觉 [visionRead]（不出端）；脱敏文本再交 [textExtract] 做结构化。
 * 端侧 VL 未就绪 → 诚实返回 visionVia:'none'（绝不把原图送云，宁可降级让用户手填）。
 */
export async function visionExtract(input: VisionExtractInput): Promise<VisionExtractResult> {
  const none: VisionExtractResult = { fields: {}, raw: '', ok: false, visionVia: 'none', structuredVia: 'none', onDevice: false };
  if (!input.imageDataUrl || !input.fields.length) return none;

  // ① 端侧视觉：[visionRead]（原图只进端侧→脱敏，隐私收口）。读不出/未就绪 → none（不把原图送云）。
  const raw = await visionRead(input.imageDataUrl, visionPrompt(input.domain, input.fields), { max: 1200, redact: input.redact });
  if (!raw) return none;

  // ② 结构化：脱敏文本交 [textExtract]（端侧文本模型优先，回退云；原图全程不参与第②步）。
  const r = await textExtract({ text: raw, domain: input.domain, fields: input.fields });
  return { fields: r.fields, raw, ok: r.ok, visionVia: 'edge', structuredVia: r.via, onDevice: r.via !== 'cloud' };
}
