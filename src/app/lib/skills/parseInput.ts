// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 一句话文本解析 —— 抽用户评分 + 去噪抽标题（确定性·不费云）
// ────────────────────────────────────────────────────────────────────────────
// movie/sense.ts 与 book/sense.ts 的 parseRating 几乎相同、parseTitle 骨架相同（《》优先→去噪→
// 保留多词），只是噪声词不同。这里把骨架收口，领域噪声词当参数传入。
//
// 与识图 skill 的分工：图片 → [visionExtract]（端侧读图+结构化）；一句话文本 → 本 skill（确定性、不费云）；
// 需要把自由文本按声明字段结构化 → [textExtract]（LLM）。三者各管一种输入。
// ════════════════════════════════════════════════════════════════════════════

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 };

/**
 * 从一句话抽用户评分（→ 0-5 星）：「五星/5星/★★★★」直接星；「三星半」+1；「8分」按 10 制折半。
 * fullPhrases=判 5 星的口头语（默认 满分/神作/封神，各 agent 可补自己的）。判不出返回 undefined。
 */
export function parseRating(text: string, fullPhrases: RegExp = /满分|神作|封神/): number | undefined {
  const t = text || '';
  const stars = (t.match(/★/g) || []).length;
  if (stars) return Math.min(5, stars);
  let m = t.match(/([0-9一二两三四五])\s*星(半)?/);
  if (m) { const n = /[0-9]/.test(m[1]) ? +m[1] : (CN_NUM[m[1]] ?? 0); return Math.max(0, Math.min(5, n + (m[2] ? 1 : 0))); }
  m = t.match(/([0-9]+(?:\.[0-9])?)\s*分/);
  if (m) { const v = parseFloat(m[1]); return Math.max(0, Math.min(5, Math.round(v > 5 ? v / 2 : v))); }
  if (fullPhrases.test(t)) return 5;
  return undefined;
}

export interface TitleNoise { verbs?: RegExp; nouns?: RegExp }
const RATING_TAIL = /[0-9一二两三四五]\s*星半?|[0-9]+(?:\.[0-9])?\s*分|★+/g;
const MARK_VERBS = /(帮我|给我|请|麻烦)?(标记|记录|记一下|记一笔|收藏|添加|标一下|标下)一?下?/g;
const PUNCT = /[，,。.！!？?；;~、]+/g;

/**
 * 从一句话抽标题：《》优先；否则去掉评分尾巴 + 通用"标记/记录"动词 + 领域噪声词（verbs/nouns）。
 * 保留去噪后的整段（含词间空格），不取"最长空格段"——否则含空格的多词标题被截断。
 */
export function parseTitle(text: string, noise?: TitleNoise): string {
  const t = (text || '').trim();
  const quoted = t.match(/《([^》]+)》/);
  if (quoted) return quoted[1].trim();
  let s = t.replace(RATING_TAIL, ' ').replace(MARK_VERBS, ' ');
  if (noise?.verbs) s = s.replace(noise.verbs, ' ');
  if (noise?.nouns) s = s.replace(noise.nouns, ' ');
  return s.replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
}
