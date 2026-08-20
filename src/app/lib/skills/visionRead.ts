// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 底层原语 · 端侧识图读字（vision read）
// ────────────────────────────────────────────────────────────────────────────
// 一句话：原图 → 端侧视觉模型读出文本 → 确定性正则脱敏 → 纯文本。
//
// 这是「原图只进端侧、绝不出端」这条隐私铁律的【唯一收口处】：全项目凡是要"读图"的 agent
// （电影/书认片、旅行票据 OCR、自建 agent 拍图…）都走这一个函数，原图只在这里碰一次端侧模型，
// 一个字节都不写持久层、不上云。脱敏正则也只在这里维护一份（曾在 movie/travel/visionExtract 各有一份）。
//
// 分层（书 §3.12 skill 组合 skill）：
//   · 想要【纯文本】（再自行做领域专属/嵌套结构化，如旅行的 segments/stays/spots）→ 直接用 visionRead。
//   · 想要【扁平结构化字段】（片名/导演/物种…）→ 用上层 [visionExtract]，它 = visionRead + 结构化。
// ════════════════════════════════════════════════════════════════════════════
import { edgeSafe } from '../../../../frost-agent/edge/contract';

// 确定性脱敏（不靠模型自觉）：长卡号 → 证件(18,含X) → 手机(11)。顺序避免互吃字。
// 证件(18位,含尾X)在前 + 前后数字边界(?<!\d)…(?!\d)：否则 16-19 的卡号正则会先吃掉 18 位身份证、误标成卡号且漏掉尾 X。
const REDACT: [RegExp, string][] = [
  [/(?<!\d)\d{17}[\dXx](?!\d)/g, '***证件***'],
  [/(?<!\d)\d{16,19}(?!\d)/g, '***卡号***'],
  [/(?<!\d)1[3-9]\d{9}(?!\d)/g, '***手机***'],
];
export function redactText(s: string): string { let t = s || ''; for (const [re, rep] of REDACT) t = t.replace(re, rep); return t; }

export interface VisionReadOptions {
  max?: number;       // 截断上限（默认 1200 字）
  redact?: boolean;   // 是否脱敏（默认 true，与端侧提示词里"别输出敏感号"互为双保险）
  timeoutMs?: number; // 端侧 VL 推理超时（默认 30s）：3B VL 冷加载 / 大图推理一旦挂起，底层 fetch('/api/edge') 永不返回会让整条记一笔流水线无限转圈（实测卡死 176s），超时即返回 '' 走手填兜底
  adapter?: string;   // 可选 MNN 分离式 LoRA；由端侧 allowlist 解析，前端不能传任意路径
  detail?: 'fast' | 'high' | 'ocr';
  maxTokens?: number; // MNN decode 上限；与 max（返回字符串截断）分开
}

/**
 * 原图 → 端侧视觉 → 脱敏文本。端侧未就绪 / 读不出 → 返回 ''（绝不把原图送云，由调用方走手填兜底）。
 * 【原图只进端侧 edgeSafe.vision 的唯一收口；原图用完即弃，不落任何持久层】。
 */
export async function visionRead(imageDataUrl: string, prompt: string, opts: VisionReadOptions = {}): Promise<string> {
  if (!imageDataUrl) return '';
  let raw = '';
  // 端侧 vision 经 httpEdge 的 fetch('/api/edge') 无原生超时；服务端 VL 推理挂起时 await 会永久 pending（实测截图认片卡死 176s）。
  // 唯一收口处再兜一道 Promise.race 超时：超时返回 '' → 上层 sense 拿不到片名 → 走「没认出·去手填」兜底，绝不无限转圈（与 httpEdge 的 AbortController 互为纵深）。
  const timeoutMs = opts.timeoutMs ?? 30000;
  try {
    raw = (await Promise.race([
      edgeSafe.vision(imageDataUrl, prompt, { adapter: opts.adapter, detail: opts.detail, maxTokens: opts.maxTokens }),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), timeoutMs)),
    ])) || '';
  } catch { raw = ''; }
  if (!raw) return '';
  const sliced = raw.slice(0, opts.max ?? 1200);
  return ((opts.redact ?? true) ? redactText(sliced) : sliced).trim();
}
