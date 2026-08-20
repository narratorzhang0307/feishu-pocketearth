// 书记官：纯函数零 LLM（对抗校验把 Clerk 从独立 agent 降级为工具）。
// 三件事：发言去重（trigram Jaccard）、跑题判定（议题关键词重叠）、reply/pass 阈值。
// 在 stages.ts 每次发言后调用，复读/跑题/空话则 pass，落实收敛护栏。

function trigrams(s: string): Set<string> {
  const t = (s || '').replace(/\s+/g, '');
  const g = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3));
  return g;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// 与历史任一发言近重复（默认阈值 0.62）→ 视为复读
export function isNearDuplicate(text: string, prior: string[], threshold = 0.62): boolean {
  const g = trigrams(text);
  if (g.size < 3) return false;
  return prior.some((p) => jaccard(g, trigrams(p)) >= threshold);
}

// 提取议题关键词：无内部标点的整段议题（如「该不该搬去海边城市生活？」）会塌缩成单一巨型词，
// 任何发言都不可能逐字包含 → 误判全员跑题。故对长段再补 2-3 字滑窗子片段，让关键词变短、可命中。
const STOPCHAR = /[的了是和与或在有我你他她它们这那个该不要吗呢吧啊为对把被让从到去来做会能]/g;
export function topicKeywords(topic: string): string[] {
  const segs = (topic || '').split(/[\s，,。.、；;：:？?！!（）()「」《》"'—\-]+/).filter(Boolean);
  const out = new Set<string>();
  for (const s of segs) {
    if (s.length >= 2 && s.length <= 4) out.add(s);
    // 长段：去常见虚字后做 2-3 字滑窗，产出可命中的短关键词
    const core = s.replace(STOPCHAR, '');
    if (core.length >= 2) {
      for (let i = 0; i + 2 <= core.length; i++) out.add(core.slice(i, i + 2));
      for (let i = 0; i + 3 <= core.length; i++) out.add(core.slice(i, i + 3));
    }
  }
  return [...out].slice(0, 40);
}
// 与议题关键词零重叠（且议题有关键词）→ 视为跑题。宁可放过略偏的发言，也不误杀（收敛容错优于严格）。
export function isOffTopic(text: string, topic: string): boolean {
  const kw = topicKeywords(topic);
  if (!kw.length) return false;
  return !kw.some((k) => text.includes(k));
}

// 综合 reply/pass：空话 / 复读 / 跑题 → pass（书记官记一笔，不进正式发言）
export function shouldPass(text: string, prior: string[], topic: string): { pass: boolean; why?: string } {
  const t = (text || '').trim();
  if (t.length < 6) return { pass: true, why: '空话' };
  if (isNearDuplicate(t, prior)) return { pass: true, why: '复读' };
  if (isOffTopic(t, topic)) return { pass: true, why: '跑题' };
  return { pass: false };
}
