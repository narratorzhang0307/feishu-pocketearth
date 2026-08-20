// 可复用 Skill（app 层）· 本地库 RAG 锚定匹配（match catalog）
// 把「按归一名在本地库里精确→模糊匹配一条记录」抽成 skill：归一(去年份括号/标点/空格/小写) → 精确命中 →
// 包含式模糊(长度差≤1 收紧，取最接近，防短名前缀误命中)。movie/book 的本地豆瓣库锚定都复用它。
// 关注点分离：matching 逻辑通用（在此）；catalog 数据 + 记录类型 + 索引字段(电影 title+original / 书 title)
// 是领域专属，留各 agent 用 buildCatalogIndex 自建索引。app 层 skill（不依赖内核）。

/** 与各 agent 一致口径的书名/片名归一：去结尾年份括号、去标点空格、小写。 */
export function normTitle(s: string): string {
  return (s || '')
    .replace(/\(\d{4}\)|（\d{4}）/g, '')
    .replace(/[《》\s·\-—:：,，.。!！?？'"'']/g, '')
    .toLowerCase();
}

/** 从记录建归一索引：keysOf 给每条记录返回用作键的字段（如 [r.title, r.original]）。先到先得不覆盖。 */
export function buildCatalogIndex<R>(records: R[], keysOf: (r: R) => (string | undefined)[]): Map<string, R> {
  const m = new Map<string, R>();
  for (const r of records) for (const name of keysOf(r)) {
    const k = normTitle(name || '');
    if (k && !m.has(k)) m.set(k, r);
  }
  return m;
}

export interface CatalogMatch<R> { record: R; exact: boolean }

/** 归一精确命中 → 包含式模糊（q≥2 且长度差≤1，取长度最接近的）。命不中返回 null。 */
export function matchCatalog<R>(query: string, index: Map<string, R>): CatalogMatch<R> | null {
  const q = normTitle(query);
  if (!q) return null;
  const exact = index.get(q);
  if (exact) return { record: exact, exact: true };
  if (q.length >= 2) {
    let best: R | null = null; let bestKey = '';
    for (const [k, r] of index) {
      if (k.length < 2) continue;
      if ((k.includes(q) || q.includes(k)) && Math.abs(k.length - q.length) <= 1) {
        if (!best || Math.abs(k.length - q.length) < Math.abs(bestKey.length - q.length)) { best = r; bestKey = k; }
      }
    }
    if (best) return { record: best, exact: false };
  }
  return null;
}
