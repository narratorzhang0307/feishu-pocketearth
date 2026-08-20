// Frost Harness · 学习型技能 + 安全审查闸（P2-I）
// 让 frost「学」一个新技能：你用一句话描述 → 云脑拟一份【声明式技能清单】→ 过【安全审查闸】→ 安装。
// 安全边界（关键）：技能只是「触发词 → 路由到一个已有 agent」的声明式快捷方式，
//   **不包含、也不执行任何代码**；闸门用白名单校验目标、拒绝一切疑似代码/外链/未知字段。
//   真·让 agent 自写可执行代码并自进化属高风险，列为前瞻、本实现不做。
import { getFrostBrain } from './brain';

export interface LearnedSkill {
  id: string;
  name: string;        // 显示名（≤20 字）
  desc: string;        // 一句话说明
  keywords: string[];  // 触发词（1–8 个）
  target: string;      // 必须 ∈ ALLOWED_TARGETS（只能路由到已有 agent）
  createdAt: string;   // ISO
}

// 白名单：技能唯一能路由到的目标 = 已存在的可运行 agent。名→中文用途（也喂给云脑拟稿）。
export const ALLOWED_TARGETS: Record<string, string> = {
  'music-agent': '点歌 / 音乐电台',
  'movies-agent': '看电影',
  'books-agent': '读书',
  'travel-skill': '规划行程',
  'jot-agent': '随手记一笔 / 记心情',
  'council-room': '多视角思考',
  'exhibition-agent': '看展与展品整理',
  'agent-forge': '把书籍或资料做成地点 Mapping',
  'heritage-restoration': '碑拓识读与数字复原',
  'earth-answer-agent': '今日行动原文',
};

export interface Review { ok: boolean; reasons: string[] }

/** 安全审查闸：声明式技能清单必须通过这里才能安装。任何疑点都拒绝（默认不放行）。 */
export function reviewSkill(m: unknown): Review {
  const reasons: string[] = [];
  if (!m || typeof m !== 'object') return { ok: false, reasons: ['不是合法的技能清单对象'] };
  const s = m as Record<string, unknown>;
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 20) reasons.push('技能名缺失或过长（≤20 字）');
  if (typeof s.target !== 'string' || !(s.target in ALLOWED_TARGETS)) reasons.push(`目标不在白名单（只能路由到已有 agent：${Object.keys(ALLOWED_TARGETS).join(' / ')}）`);
  if (!Array.isArray(s.keywords) || s.keywords.length === 0 || s.keywords.length > 8 || !s.keywords.every((k) => typeof k === 'string' && k.length <= 12)) reasons.push('触发词需 1–8 个、每个 ≤12 字');
  // 字段白名单：只允许已知字段，多一个就拒
  const allowed = ['id', 'name', 'desc', 'keywords', 'target', 'createdAt'];
  for (const k of Object.keys(s)) if (!allowed.includes(k)) reasons.push(`含未知字段「${k}」`);
  // 安全扫描：拒绝任何疑似代码 / 外链 / 危险标记
  const blob = JSON.stringify(s);
  if (/<script|<\/|function\s*\(|=>|\beval\b|\brequire\(|\bimport\b|process\.|child_process|\bfetch\(|https?:\/\/|`|\$\{/i.test(blob)) reasons.push('检测到疑似代码 / 外链，拒绝（技能只能是声明式路由，不执行任何代码）');
  return { ok: reasons.length === 0, reasons };
}

/** 云端拟稿：把你的一句话描述交给云脑，产出一份待审查的技能清单（失败返回 null）。 */
export async function proposeSkill(desc: string): Promise<Partial<LearnedSkill> | null> {
  const brain = getFrostBrain();
  const targets = Object.entries(ALLOWED_TARGETS).map(([k, v]) => `${k}（${v}）`).join('、');
  const prompt =
    `用户想教 frost 一个快捷技能，描述：「${desc}」。\n` +
    `技能只能路由到下列已有 agent 之一（target 必须取其英文名）：${targets}。\n` +
    `只输出纯 JSON：{"name":"≤20字技能名","desc":"一句话说明","keywords":["触发词1","触发词2"],"target":"上面之一的英文名"}。\n` +
    `不要任何代码、链接、解释，只要这个 JSON。`;
  let raw = '';
  try { raw = (await brain.complete(prompt, { json: true })) || ''; } catch { return null; }
  if (!raw) return null;
  try {
    const obj = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(obj ? obj[0] : raw) as Partial<LearnedSkill>;
  } catch { return null; }
}

// ——— 已学技能 store（localStorage + pub/sub）———
const KEY = 'pe.skills.v1';
const LEGACY_TARGETS: Record<string, string> = { 'travel-agent': 'travel-skill' };
let skills: LearnedSkill[] = load();
const subs = new Set<() => void>();
function load(): LearnedSkill[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const r = localStorage.getItem(KEY);
      if (r) {
        const v = JSON.parse(r);
        if (Array.isArray(v)) return v
          .map((x) => x && typeof x === 'object' && typeof x.target === 'string' && LEGACY_TARGETS[x.target] ? { ...x, target: LEGACY_TARGETS[x.target] } : x)
          .filter((x) => x && typeof x === 'object' && typeof x.target === 'string' && x.target in ALLOWED_TARGETS) as LearnedSkill[];
      }   // 损坏或已撤下目标会被过滤；仍在用的旧 travel-agent 会无损迁移。
    }
  } catch { /* ignore */ }
  return [];
}
function persist() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(skills)); } catch { /* ignore */ } }
function emit() { subs.forEach((fn) => fn()); }

export function getLearnedSkills(): LearnedSkill[] { return skills; }
export function subscribeSkills(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

/** 安装一份技能：再过一次安全闸，通过才落地。返回校验结果。 */
export function installSkill(m: Partial<LearnedSkill>): Review {
  const review = reviewSkill(m);
  if (!review.ok) return review;
  const base = (m.name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';
  let id = base; let n = 1;
  while (skills.some((x) => x.id === id)) id = `${base}-${++n}`;
  skills = [{ id, name: m.name!.trim(), desc: (m.desc || '').toString().slice(0, 40), keywords: (m.keywords || []) as string[], target: m.target!, createdAt: new Date().toISOString() }, ...skills];
  persist(); emit();
  return review;
}

export function removeLearnedSkill(id: string): void {
  skills = skills.filter((x) => x.id !== id);
  persist(); emit();
}
