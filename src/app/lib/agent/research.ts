// 自定义 agent 工厂 · 多步自主研究流水线（「建图」挡）。
// 一句主题（如「杭州观鸟地图」）→ 自动规划→模型知识候选→反思补全→待核验落点草稿。
// 理论骨架（黄佳《Agent设计模式》第7章）：规划-执行(§7.2) + ReAct(§7.1) + 反思/Reflexion(§7.1.4) + 状态护具(§7.2.2)。
// 全云 Qwen 协同（规划、知识抽取、反思；核心交互/选择仍可端侧）。解耦：只依赖共享 geocodeCity + 本模块 pin/manifest。
// 工程纪律（书里反复强调）：硬步数上限防死循环、动作去重、JSON 约束、每步舱壁降级、进度持久化（断点续传）。
import { getFrostBrain } from '../../../../frost-agent/harness/brain';
import { resolvePlace } from '../skills/resolvePlace';
import { extractJSON } from '../skills/enrichEntity';
import type { AgentManifest } from './manifest';
import { GEO_LABEL } from './manifest';
import type { CustomDraft } from './engine';
import { confirmPin } from './pin';

export interface MapRecord {
  label: string;                    // 一个落点对象名（如「白鹭 · 西溪湿地」）
  tags: Record<string, string>;     // 按 manifest.tagFields
  city: string;                     // 抽取出的城市/地名
  note: string;                     // 一句说明
  verificationStatus: 'pending';   // 模型知识候选默认待核验，不冒充实时搜索结果
  verificationPrompt: string;      // 给用户的具体核验建议
  geo: { place: string; lat: number; lng: number } | null;  // geocode 后
}
export interface MapDraft {
  goal: string;
  records: MapRecord[];             // 草稿批（未钉，待用户确认）
  queriesRun: string[];
  rounds: number;
  via: 'cloud';
}
export type OnResearchPhase = (msg: string, note?: string) => void;   // note → RunTrace 云/端侧/本地 badge

// JSON 解析走 enrichEntity skill 的 extractJSON（统一一处稳健解析）
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

// ——— 规划器（§7.2）：主题 → 一批候选生成角度 + 目标数量 ———
async function planMap(manifest: AgentManifest, goal: string): Promise<{ queries: string[]; target: number }> {
  const prompt =
    `你在为「${manifest.domain}」主题地图规划候选生成。用户目标：「${goal}」。\n` +
    `请把它拆成 4-8 个知识整理角度（覆盖不同子区域/子类别），并给一个合理的候选数量。\n` +
    `只输出 JSON：{"queries":["查询1","查询2",...],"target":数字}`;
  const raw = await getFrostBrain().complete(prompt, { json: true });
  const r = extractJSON<{ queries: string[]; target: number }>(raw);
  const queries = Array.isArray(r?.queries) ? r!.queries.filter((q) => typeof q === 'string' && q.trim()).slice(0, 8) : [];
  return { queries: queries.length ? queries : [goal], target: Math.min(30, Math.max(4, Number(r?.target) || 12)) };
}

// ——— 执行器（§7.1 ReAct 单步）：一个整理角度 → 若干待核验候选 ———
async function runQuery(manifest: AgentManifest, query: string): Promise<MapRecord[]> {
  const fields = manifest.tagFields.join('、');
  const prompt =
    `任务：仅基于模型已有知识，为「${query}」生成属于「${manifest.domain}」的候选条目；这不是实时联网搜索。\n` +
    `每个候选给：名字(可含具体地点)、所在【城市或区】、标签字段(${fields})、一句说明、给用户的核验建议。\n` +
    `注意 city 只填城市或区名（如 杭州 / 临安 / 内罗毕），不要带具体地点名（地点放进 label），便于精确定位。\n` +
    `只输出 JSON：{"records":[{"label":"名字","city":"城市或区","tags":{${manifest.tagFields.map((f) => `"${f}":"值或空"`).join(',')}},"note":"≤30字说明","verificationPrompt":"如何核验该候选，≤36字"}]}\n` +
    `不确定的候选可以保留，但不得虚构来源、链接或声称已经搜索验证。`;
  const raw = await getFrostBrain().complete(prompt, { json: true });
  const r = extractJSON<{ records: MapRecord[] }>(raw);
  if (!r || !Array.isArray(r.records)) return [];
  return r.records
    .filter((x) => x && typeof x.label === 'string' && x.label.trim())
    .map((x) => ({
      label: x.label.trim(), city: (x.city || '').toString().trim(),
      tags: (x.tags && typeof x.tags === 'object') ? x.tags : {},
      note: (x.note || '').toString().slice(0, 40),
      verificationStatus: 'pending',
      verificationPrompt: (x.verificationPrompt || '请对照博物馆、地方志或权威目录核验名称与地点').toString().slice(0, 48),
      geo: null,
    }));
}

// ——— 反思器（§7.1.4 / §8.2）：已找到的够不够？还漏哪些？→ 补查询 or 停 ———
async function reflectGaps(manifest: AgentManifest, goal: string, found: string[]): Promise<{ done: boolean; more: string[] }> {
  const prompt =
    `目标：为「${goal}」建一张「${manifest.domain}」地图。已找到这些条目：${found.slice(0, 40).join('、') || '（无）'}。\n` +
    `判断是否已覆盖该主题下的主要对象。若还明显缺重要的，给 1-4 个新的补充整理角度；若够全了就 done=true。\n` +
    `只输出 JSON：{"done":true或false,"more":["补充查询",...]}`;
  const raw = await getFrostBrain().complete(prompt, { json: true });
  const r = extractJSON<{ done: boolean; more: string[] }>(raw);
  return { done: !!r?.done, more: Array.isArray(r?.more) ? r!.more.filter((q) => typeof q === 'string' && q.trim()).slice(0, 4) : [] };
}

// ——— 状态护具（§7.2.2）：进度持久化，长任务被刷新/中断也能续 ———
const PKEY = (goal: string) => `pe.research.v1.${norm(goal)}`;
function saveProgress(goal: string, d: Partial<MapDraft>) { try { localStorage.setItem(PKEY(goal), JSON.stringify(d)); } catch { /* ignore */ } }
export function loadProgress(goal: string): Partial<MapDraft> | null { try { const r = localStorage.getItem(PKEY(goal)); return r ? JSON.parse(r) : null; } catch { return null; } }
export function clearProgress(goal: string) { try { localStorage.removeItem(PKEY(goal)); } catch { /* ignore */ } }

/** 编排器：规划→执行→反思 的多步自主循环，产出草稿批（未钉）。带硬上限 + 动作去重 + 舱壁降级 + 持久化。 */
export async function populateMap(
  manifest: AgentManifest, goal: string, onPhase?: OnResearchPhase,
  opts?: { maxRounds?: number; maxQueries?: number },
): Promise<MapDraft> {
  const ph = onPhase || (() => {});
  const maxRounds = opts?.maxRounds ?? 3;
  const maxQueries = opts?.maxQueries ?? 12;   // 硬步数上限（§7.1.3 防死循环）
  const executed = new Set<string>();          // 动作去重（§7.1.3）：做过的整理角度不重复
  const byKey = new Map<string, MapRecord>();  // 去重后的记录
  const queriesRun: string[] = [];

  ph('① 规划：拆解主题…', 'Qwen 云端');
  const plan = await planMap(manifest, goal);   // 只调一次规划器
  let queue = plan.queries;
  const target = plan.target;

  let round = 0;
  while (round < maxRounds && queriesRun.length < maxQueries) {
    round++;
    for (const q of queue) {
      if (queriesRun.length >= maxQueries) break;
      const sig = norm(q);
      if (executed.has(sig)) continue;          // 跳过重复动作
      executed.add(sig); queriesRun.push(q);
      ph(`② 第${round}轮 · 知识抽取：「${q}」（${queriesRun.length}/${maxQueries}）`, 'Qwen 云端');
      let recs: MapRecord[] = [];
      try { recs = await runQuery(manifest, q); } catch { recs = []; }   // 舱壁：单查询失败不崩
      for (const rec of recs) {
        const key = norm(rec.label) + '|' + norm(rec.city);
        if (!byKey.has(key)) byKey.set(key, rec);
      }
      saveProgress(goal, { goal, records: [...byKey.values()], queriesRun, rounds: round });
    }
    // 反思：够了吗？
    if (byKey.size >= target) { ph('③ 反思：已达目标数量，收敛', 'Qwen 云端'); break; }
    ph('③ 反思：检查覆盖、补查询…', 'Qwen 云端');
    const { done, more } = await reflectGaps(manifest, goal, [...byKey.values()].map((r) => r.label));
    if (done || !more.length) { ph('③ 反思：覆盖足够，收敛', 'Qwen 云端'); break; }
    queue = more.filter((q) => !executed.has(norm(q)));
    if (!queue.length) break;
  }

  // 地理编码（真实 geocoding：本地表→Mapbox→缓存，破"只认~100城"）
  ph('④ 地理编码：把条目落到坐标…', 'resolvePlace 本地→Mapbox');
  for (const rec of byKey.values()) {
    const hit = rec.city ? await resolvePlace(rec.city) : null;
    if (hit) rec.geo = { place: hit.place, lat: hit.lat, lng: hit.lng };
  }

  const draft: MapDraft = { goal, records: [...byKey.values()], queriesRun, rounds: round, via: 'cloud' };
  saveProgress(goal, draft);
  ph(`✓ 完成：${draft.records.length} 个候选（${draft.records.filter((r) => r.geo).length} 个可落点）`);
  return draft;
}

// geo 策略标签（给 UI 展示落点依据用）
export function geoStrategyLabel(manifest: AgentManifest): string {
  return manifest.geoStrategy.map((g) => GEO_LABEL[g] || g).join(' > ');
}

// ——— 批量落点（suggest-then-confirm 第13原则）：复用 pin.ts 的 confirmPin，DRY ———
function recordToDraft(manifest: AgentManifest, rec: MapRecord): CustomDraft {
  return {
    id: `${manifest.id}-${norm(rec.label)}-${norm(rec.city)}`, agentId: manifest.id,
    label: rec.label, tags: rec.tags, note: rec.note,
    geo: rec.geo ? { place: rec.geo.place, lat: rec.geo.lat, lng: rec.geo.lng, strategy: manifest.geoStrategy[0] || 'manual' } : null,
    needPlace: !rec.geo, via: 'cloud', confidence: 0.7, reason: '建图研究',
  };
}
/** 把用户勾选的记录批量钉到地球（只钉有坐标的）。返回成功钉的数量。 */
export function confirmMapRecords(manifest: AgentManifest, records: MapRecord[]): number {
  let n = 0;
  for (const rec of records) {
    if (!rec.geo) continue;
    if (confirmPin(manifest, recordToDraft(manifest, rec)).pinned) n++;
  }
  return n;
}
