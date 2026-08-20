// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 文本 → 结构化字段（textExtract）· LLM · schema 驱动
// ────────────────────────────────────────────────────────────────────────────
// 给一段文本 + 一份「目标字段 schema」，整理成匹配 schema 的扁平 JSON 字段。
//
// 它是 [visionExtract] 的「文字→字段」那半截，单独抽出来后两者完全对称、且组合关系清晰：
//   visionRead   : 图  → 文字        （端侧·脱敏）
//   textExtract  : 文字 → 字段        （本 Skill：端侧 Qwen/MNN 优先，必要时显式走云端 Qwen）
//   visionExtract: 图  → 字段  =  visionRead + textExtract
// 也可单独用于「直接丢一段文本、按声明字段结构化」的场景（不经图片）。
//
// 泛化：schema 是【调用方传入的参数】fields，不写死——同一 skill 适配任意领域。
// FieldSpec 在此定义（它是"按字段结构化"这件事的契约），visionExtract / 各 agent 从这里引用。
// ════════════════════════════════════════════════════════════════════════════
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import { enrichJSON, extractJSON } from './enrichEntity';

/** 一个目标字段：key=JSON 键，label=给模型看的中文名，hint=可选补充说明。 */
export interface FieldSpec { key: string; label: string; hint?: string }

export interface TextExtractInput {
  text: string;             // 待结构化的文本（已是纯文本；若来自图片，应先经 visionRead 脱敏）
  domain: string;           // 领域上下文，如 '电影' / '咖啡馆' / '野生鸟类'
  fields: FieldSpec[];      // 目标 schema（调用方提供）
  instruction?: string;     // 可选：额外领域指引（如落点优先级、口吻），原样并入提示词
}

export interface TextExtractResult {
  fields: Record<string, string>;     // 按 fields.key 填好的结构化结果（文本里没有的字段缺省不填）
  ok: boolean;                        // 是否抽到 ≥1 个字段
  via: 'edge' | 'cloud' | 'none';     // 结构化走端侧文本模型、走云，还是没走（单字段兜底=none）
}

// 结构化提示词：把文本整理成固定键的 JSON。
function structurePrompt(domain: string, fields: FieldSpec[], raw: string, instruction?: string): string {
  return [
    `下面是关于「${domain}」的文本。请整理成一个 JSON 对象，键固定用：${fields.map((f) => `"${f.key}"`).join('、')}。`,
    `每个键的含义：${fields.map((f) => `${f.key}=${f.label}${f.hint ? `（${f.hint}）` : ''}`).join('；')}。`,
    instruction || '',
    `文本里没有的字段给空字符串。只输出 JSON，不要解释、不要代码块。`,
    `文本：\n${raw}`,
  ].filter(Boolean).join('\n');
}

/**
 * 文本→结构化字段。端侧 Qwen/MNN 优先（JSON 模式），不行再回退云端 Qwen。
 * 单字段兜底：结构化两头都没出、而 schema 只有一个字段时，文本首行（冒号后）即答案——避免白丢结果。
 */
export async function textExtract(input: TextExtractInput): Promise<TextExtractResult> {
  const none: TextExtractResult = { fields: {}, ok: false, via: 'none' };
  const text = (input.text || '').trim();
  if (!text || !input.fields.length) return none;

  const sp = structurePrompt(input.domain, input.fields, text, input.instruction);
  let obj: Record<string, string> | null = null;
  let via: 'edge' | 'cloud' | 'none' = 'none';
  try {
    if (await edgeSafe.available()) {
      const t = await edgeSafe.chat(sp, { json: true });
      obj = extractJSON<Record<string, string>>(t);
      if (obj) via = 'edge';
    }
  } catch { /* 落到云 */ }
  if (!obj) { obj = await enrichJSON<Record<string, string>>({ prompt: sp }); if (obj) via = 'cloud'; }
  if (obj && Array.isArray(obj)) { obj = null; via = 'none'; }   // 模型误吐 JSON 数组 → 当未结构化，落单字段兜底，不静默返回空

  // 单字段兜底：没出 JSON 但只有一个字段 → 文本本身就是答案，取首行冒号后的值。
  if (!obj && input.fields.length === 1) {
    const v = text.split('\n')[0].replace(/^[^：:]*[：:]\s*/, '').trim();
    if (v) { obj = { [input.fields[0].key]: v }; via = 'none'; }
  }

  const fields: Record<string, string> = {};
  if (obj) for (const f of input.fields) { const v = obj[f.key]; if (typeof v === 'string' && v.trim()) fields[f.key] = v.trim(); }
  return { fields, ok: Object.keys(fields).length > 0, via };
}
