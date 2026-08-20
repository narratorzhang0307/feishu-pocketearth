// 判例库（最小版）：照抄 userMarks.ts 的 localStorage + 发布订阅。
// P0 只做 saveCase/getCases/subscribeCases/removeCase；双键检索/反思记忆/画像反哺挪 P1+（对抗校验已砍）。
import type { CaseRecord, Verdict } from './types';

const KEY = 'pe.council.cases.v1';
const subs = new Set<() => void>();
let cases: CaseRecord[] = load();

function load(): CaseRecord[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const r = localStorage.getItem(KEY);
      if (r) { const v = JSON.parse(r); if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object' && x.verdict && typeof x.verdict === 'object' && typeof x.verdict.id === 'string') as CaseRecord[]; }   // 损坏/非数组/缺 verdict → 回落 []，免 findSimilarCases.map / saveCase.filter 在庭审中途抛崩（同 skillForge/geoStickers 损坏存档护栏）
    }
  } catch { /* */ }
  return [];
}
function persist() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cases.slice(0, 100))); } catch { /* */ } }
function emit() { subs.forEach((fn) => fn()); }

export function getCases(): CaseRecord[] { return cases; }
export function saveCase(verdict: Verdict): void { cases = [{ verdict, ts: Date.now() }, ...cases.filter((c) => c.verdict.id !== verdict.id)]; persist(); emit(); }
export function removeCase(id: string): void { cases = cases.filter((c) => c.verdict.id !== id); persist(); emit(); }
export function subscribeCases(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

// 双键朴素检索相似争点判例（目标键=topic 词重叠 + 状态键=issues 争点词重叠），零依赖、复用内存数组。
// 给「类案参照」用：开庭前召回最像的历史判例要旨，注入合议阶段（类案同判，越审越有先例撑腰）。
function words(s: string): string[] { return (s || '').split(/[^0-9a-zA-Z一-龥]+/).filter((w) => w.length >= 2); }
export function findSimilarCases(topic: string, issues: string[], k = 3): Verdict[] {
  const tW = new Set(words(topic));
  const iW = new Set(issues.flatMap(words));
  return cases
    .map((c) => c.verdict)
    .filter((v) => v.ruleEstablished)                        // 只召回有裁判要旨的（现成先例语料）
    .map((v) => {
      const vt = new Set(words(v.topic)); const vi = new Set((v.issues || []).flatMap(words));
      let s = 0;
      for (const w of tW) if (vt.has(w)) s += 1;
      for (const w of iW) if (vi.has(w)) s += 1;
      return { v, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.v);
}
