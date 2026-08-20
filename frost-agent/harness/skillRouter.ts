/**
 * Frost 跨 Skill 总编排器。
 *
 * 设计边界：
 * - 常驻层只读取 Manifest 的名称/description 与精简语义指纹；不会把模型、Data Pack 或参考资料塞进 Prompt。
 * - 确定性高置信路由先行；只有长尾、组合任务才调用 Qwen 规划。
 * - 规划只产生“建议打开哪个已登记 Skill”，不直接写地图、相册或用户数据。
 * - 任何模型返回都经过严格字段、目标白名单、可用状态与数量上限校验。
 */
import { getFrostBrain } from './brain';
import { formatHistory } from './memory';
import type { AgentResult, FrostContext } from './types';
import { isNativeMnnPlatform } from '../edge/capacitorMnnEdge';
import { runEdgeChatEvidence } from '../edge/httpEdge';
import {
  BUILTIN_SKILLS,
  getEquippedSkill,
  listInstalledSkills,
  type SkillKind,
  type SkillManifest,
  type SkillScope,
  type SkillTool,
} from '../../src/app/lib/skill';
import { getLearnedSkills } from './skillForge';

export type SkillAvailability = 'equipped' | 'installed' | 'not-installed';
export type FrostPlanMode = 'single' | 'sequence' | 'parallel';
export type FrostPlanSource = 'local-rule' | 'mnn' | 'qwen' | 'local-fallback';

export interface RoutableSkill {
  id: string;
  name: string;
  description: string;
  target: string;
  kind: SkillKind | 'shortcut';
  availability: SkillAvailability;
  scopes: SkillScope[];
  tools: SkillTool[];
  triggers: string[];
  notFor: string[];
}

export interface FrostPlanStep {
  id: string;
  skillId: string;
  skillName: string;
  target: string;
  objective: string;
  reason: string;
  availability: SkillAvailability;
  permissions: string[];
  requiresConfirmation: boolean;
}

export interface FrostPlan {
  id: string;
  mode: FrostPlanMode;
  source: FrostPlanSource;
  summary: string;
  steps: FrostPlanStep[];
  ready: boolean;
  createdAt: string;
}

export interface FrostOrchestratorData {
  plan: FrostPlan | null;
  route: 'skill-plan' | 'direct-answer';
}

export type FrostOrchestratorResult = AgentResult<FrostOrchestratorData> & { plan: FrostPlan | null };

interface RouteHint { triggers: string[]; notFor?: string[] }

// description 是所有 Skill 的开放接口；内置 Skill 再补一小组用户口语，修复欠触发。
// 这里不放工作流正文、提示词、知识库或模型资产，符合渐进式披露。
const ROUTE_HINTS: Record<string, RouteHint> = {
  'pocket.earth-answer': { triggers: ['地球答案', '今日行动', '今天做什么', '晨间行动'], notFor: ['问答', '百科'] },
  'pocket.music': { triggers: ['音乐', '歌曲', '歌单', '点歌', '听歌', '电台', '艺人', '歌手', '专辑'] },
  'pocket.books': { triggers: ['书籍', '书单', '读书', '阅读记录', '作者', '故事地', '藏书票'], notFor: ['古籍mapping', '古籍 mapping', '整本书落地图', 'pdf地点'] },
  'pocket.movies': { triggers: ['电影', '影片', '观影', '导演', '演员', '取景地', '片单'] },
  'pocket.council': { triggers: ['圆桌', '多视角', '不同角度', '辩论', '法庭', '权衡', '利弊', '综合判断'] },
  'pocket.reading-jot': { triggers: ['阅读摘录', '书页', '划线', '读书笔记', '摘抄', '识读这页', '拍书页'] },
  'pocket.travel': { triggers: ['旅行', '旅游', '行程', '路线', '几日游', '一日游', '去哪玩', '景点', '散步路线'] },
  'pocket.exhibition': { triggers: ['看展', '展览', '展品', '展签', '博物馆', '美术馆', '2.5d', '3d绕拍'] },
  'pocket.book-to-earth': { triggers: ['book-to-earth', '书籍mapping', '书籍 mapping', '古籍mapping', '古籍 mapping', '古籍pdf', '古籍扫描', '整本书落地球', '一本书落地球', 'pdf地点', '从书里提取地点', '资料落地图'] },
  'pocket.rubbing': { triggers: ['碑拓', '拓片', '碑文', '残损修复', '数字复原', '古文字修复'] },
};

const SIDE_EFFECT_TOOLS = new Set<SkillTool>(['mark_place', 'data_pack', 'restore']);
const PRIVATE_MARKERS = /(身份证|护照|银行卡|手机号|电话号码|家庭住址|精确住址|证件照|人脸照片|病历|医疗记录|私密照片)/;
const SEQUENCE_MARKERS = /(先.+再|然后|之后|接着|第一步|第二步)/;
const PARALLEL_MARKERS = /(同时|一起|分别|并行|各自)/;
const MAX_STEPS = 3;

function nowMs(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function elapsed(start: number): number { return Math.max(0, Math.round(nowMs() - start)); }
function norm(value: string): string { return value.toLowerCase().replace(/[\s_·—–-]+/g, ''); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

function availabilityOf(manifest: SkillManifest): SkillAvailability {
  if (getEquippedSkill(manifest.identity.id)) return 'equipped';
  return listInstalledSkills().some((item) => item.manifest.identity.id === manifest.identity.id) ? 'installed' : 'not-installed';
}

export function listRoutableSkills(): RoutableSkill[] {
  const installed = listInstalledSkills();
  const manifests = new Map<string, SkillManifest>();
  for (const manifest of BUILTIN_SKILLS) manifests.set(manifest.identity.id, manifest);
  for (const item of installed) manifests.set(item.manifest.identity.id, item.manifest);

  const result: RoutableSkill[] = [...manifests.values()].map((manifest) => {
    const hint = ROUTE_HINTS[manifest.identity.id];
    return {
      id: manifest.identity.id,
      name: manifest.identity.name,
      description: manifest.identity.description,
      target: manifest.entry.target,
      kind: manifest.kind,
      availability: availabilityOf(manifest),
      scopes: [...manifest.permissions.scopes],
      tools: [...manifest.permissions.tools],
      triggers: unique([manifest.identity.name, manifest.identity.id, ...(hint?.triggers || [])]),
      notFor: hint?.notFor || [],
    };
  });

  // 旧版“教 Frost 一个快捷方式”仍可参与路由，但它只能指向既有页面，不获得新权限。
  for (const learned of getLearnedSkills()) {
    result.push({
      id: `learned.${learned.id}`,
      name: learned.name,
      description: learned.desc,
      target: learned.target,
      kind: 'shortcut',
      availability: 'equipped',
      scopes: [], tools: [], triggers: unique([learned.name, ...learned.keywords]), notFor: [],
    });
  }
  return result;
}

function scoreSkill(text: string, skill: RoutableSkill): number {
  const input = norm(text);
  if (!input) return 0;
  if (skill.notFor.some((term) => input.includes(norm(term)))) return -100;
  let score = 0;
  for (const trigger of skill.triggers) {
    const t = norm(trigger);
    if (!t || !input.includes(t)) continue;
    score += t.length >= 8 ? 18 : t.length >= 4 ? 12 : 8;
  }
  // 开放 Skill 没有内置 hints 时，description 仍提供一个低权重语义入口。
  for (const token of norm(skill.description).split(/[，。；、/]/).filter((item) => item.length >= 3)) {
    if (input.includes(token)) score += 3;
  }
  return score;
}

function firstMentionPosition(text: string, skill: RoutableSkill): number {
  const input = norm(text);
  let first = Number.POSITIVE_INFINITY;
  for (const trigger of skill.triggers) {
    const token = norm(trigger);
    if (!token) continue;
    const position = input.indexOf(token);
    if (position >= 0) first = Math.min(first, position);
  }
  return first;
}

function modeFor(text: string, count: number): FrostPlanMode {
  if (count <= 1) return 'single';
  if (SEQUENCE_MARKERS.test(text)) return 'sequence';
  if (PARALLEL_MARKERS.test(text)) return 'parallel';
  return 'parallel';
}

function planId(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `frost-${Date.now().toString(36)}-${(hash >>> 0).toString(36)}`;
}

function permissionsFor(skill: RoutableSkill): string[] {
  const values = [
    ...skill.scopes.map((scope) => `范围:${scope}`),
    ...skill.tools.map((tool) => `工具:${tool}`),
  ];
  return values.length ? values : ['无额外权限'];
}

function stepFor(skill: RoutableSkill, objective: string, reason: string, index: number): FrostPlanStep {
  return {
    id: `step-${index + 1}`,
    skillId: skill.id,
    skillName: skill.name,
    target: skill.target,
    objective: objective.slice(0, 240),
    reason: reason.slice(0, 180),
    availability: skill.availability,
    permissions: permissionsFor(skill),
    requiresConfirmation: skill.tools.some((tool) => SIDE_EFFECT_TOOLS.has(tool)),
  };
}

function createPlan(text: string, skills: RoutableSkill[], source: FrostPlanSource, summary: string, mode?: FrostPlanMode): FrostPlan {
  const steps = skills.slice(0, MAX_STEPS).map((skill, index) => stepFor(
    skill,
    text,
    source === 'qwen' ? '云端 Qwen 依据 Skill 语义指纹匹配'
      : source === 'mnn' ? '端侧 Qwen/MNN 依据 Skill 语义指纹匹配' : '本地语义指纹命中',
    index,
  ));
  return {
    id: planId(text), mode: mode || modeFor(text, steps.length), source,
    summary: summary.slice(0, 240), steps,
    ready: steps.length > 0 && steps.every((step) => step.availability === 'equipped'),
    createdAt: new Date().toISOString(),
  };
}

function localPlan(text: string, catalog: RoutableSkill[]): { plan: FrostPlan | null; highConfidence: boolean } {
  const ranked = catalog.map((skill) => ({ skill, score: scoreSkill(text, skill) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id));
  if (!ranked.length) return { plan: null, highConfidence: false };
  const best = ranked[0].score;
  const multi = SEQUENCE_MARKERS.test(text) || PARALLEL_MARKERS.test(text);
  const selected = multi
    ? ranked.filter((item) => item.score >= 8).slice(0, MAX_STEPS)
    : [ranked[0]];
  // 相关度决定“选哪些 Skill”，但显式的“先…再…”必须决定执行顺序。
  // 否则高分领域会抢到第一步，形成路由正确、依赖顺序错误的假智能。
  if (SEQUENCE_MARKERS.test(text)) {
    selected.sort((left, right) => {
      const byMention = firstMentionPosition(text, left.skill) - firstMentionPosition(text, right.skill);
      return Number.isNaN(byMention) || byMention === 0 ? right.score - left.score : byMention;
    });
  }
  const plan = createPlan(text, selected.map((item) => item.skill), 'local-rule', `Frost 找到 ${selected.length} 个适合这次任务的 Skill。`);
  // “然后”不等于必须跨 Skill：若只有一个领域命中，让该 Skill 自己完成内部流水线，
  // 避免把“整理书单然后落图”错误拆成 books + Book-to-Earth。
  return { plan, highConfidence: best >= 8 && (selected.length === 1 || !multi || selected.length >= 2) };
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

interface CloudStep { skillId: string; objective: string; reason: string }
interface CloudPlan { mode: FrostPlanMode; summary: string; steps: CloudStep[] }

export function parseCloudPlan(raw: string, catalog: RoutableSkill[]): CloudPlan | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const root = value as Record<string, unknown>;
    if (!exactKeys(root, ['mode', 'summary', 'steps'])) return null;
    if (!['single', 'sequence', 'parallel'].includes(String(root.mode))) return null;
    if (typeof root.summary !== 'string' || root.summary.length > 240) return null;
    if (!Array.isArray(root.steps) || root.steps.length < 1 || root.steps.length > MAX_STEPS) return null;
    const ids = new Set(catalog.map((skill) => skill.id));
    const steps: CloudStep[] = [];
    for (const item of root.steps) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const step = item as Record<string, unknown>;
      if (!exactKeys(step, ['skillId', 'objective', 'reason'])) return null;
      if (typeof step.skillId !== 'string' || !ids.has(step.skillId)) return null;
      if (typeof step.objective !== 'string' || !step.objective.trim() || step.objective.length > 240) return null;
      if (typeof step.reason !== 'string' || !step.reason.trim() || step.reason.length > 180) return null;
      steps.push({ skillId: step.skillId, objective: step.objective, reason: step.reason });
    }
    if (new Set(steps.map((step) => step.skillId)).size !== steps.length) return null;
    const byId = new Map(catalog.map((skill) => [skill.id, skill]));
    if (new Set(steps.map((step) => byId.get(step.skillId)?.target)).size !== steps.length) return null;
    return { mode: root.mode as FrostPlanMode, summary: root.summary, steps };
  } catch { return null; }
}

function plannerPrompt(text: string, history: string, catalog: RoutableSkill[]): string {
  const directory = catalog.map((skill) => [
    `- id=${skill.id}`,
    `name=${skill.name}`,
    `state=${skill.availability}`,
    `description=${skill.description}`,
    `triggers=${skill.triggers.slice(0, 8).join('、')}`,
  ].join(' | ')).join('\n');
  return `你是 Frost 的 Skill Router，只做任务分解和能力选择，不执行任务，不编造 Skill。\n` +
    `可用目录（description 是语义契约；state=equipped 才能立即运行）：\n${directory}\n` +
    `${history}` +
    `用户任务：${text}\n` +
    `最多选择 ${MAX_STEPS} 个真正必要的 Skill。可一步完成就不要拆分；有前后依赖用 sequence，互不依赖才用 parallel。` +
    `不要把闲聊或普通知识问答硬塞给 Skill。只返回严格 JSON，字段不得增减：` +
    `{"mode":"single|sequence|parallel","summary":"一句计划摘要","steps":[{"skillId":"目录中的精确 id","objective":"交给该 Skill 的明确任务","reason":"为什么必须用它"}]}`;
}

function planFromModel(raw: string, text: string, catalog: RoutableSkill[], source: 'mnn' | 'qwen'): FrostPlan | null {
  const parsed = parseCloudPlan(raw, catalog);
  if (!parsed) return null;
  const byId = new Map(catalog.map((skill) => [skill.id, skill]));
  const steps = parsed.steps.map((item, index) => {
    const skill = byId.get(item.skillId);
    return skill ? stepFor(skill, item.objective, item.reason, index) : null;
  });
  if (steps.some((step) => !step)) return null;
  const validSteps = steps as FrostPlanStep[];
  return {
    id: planId(text), mode: parsed.mode, source, summary: parsed.summary,
    steps: validSteps, ready: validSteps.every((step) => step.availability === 'equipped'), createdAt: new Date().toISOString(),
  };
}

async function mnnPlan(ctx: FrostContext, catalog: RoutableSkill[]): Promise<{ plan: FrostPlan | null; detail: string }> {
  if (!isNativeMnnPlatform()) return { plan: null, detail: '非 Android 原生环境' };
  const text = (ctx.userText || '').trim();
  try {
    const response = await runEdgeChatEvidence(plannerPrompt(text, formatHistory(ctx.history), catalog), {
      json: true,
      maxTokens: 384,
      system: '你是手机端 Frost Skill Router。只返回契约要求的 JSON，不执行任务。',
    });
    const plan = response.backend === 'mnn' && typeof response.text === 'string'
      ? planFromModel(response.text.trim(), text, catalog, 'mnn') : null;
    const elapsedMs = response.stats?.elapsedMs;
    const metric = typeof elapsedMs === 'number' ? ` · native ${Math.round(elapsedMs)}ms` : '';
    return { plan, detail: `${response.backend}${metric}${response.error ? ` · ${response.error}` : ''}` };
  } catch (error) {
    return { plan: null, detail: `native error · ${String(error)}` };
  }
}

async function qwenPlan(ctx: FrostContext, catalog: RoutableSkill[]): Promise<FrostPlan | null> {
  const text = (ctx.userText || '').trim();
  let raw = '';
  try {
    raw = (await getFrostBrain().complete(plannerPrompt(text, formatHistory(ctx.history), catalog), { json: true, task: 'frost-plan' })).trim();
  } catch { raw = ''; }
  if (!raw) return null;
  return planFromModel(raw, text, catalog, 'qwen');
}

export async function planFrostTask(ctx: FrostContext): Promise<{ plan: FrostPlan | null; trace: string[] }> {
  const started = nowMs();
  const text = (ctx.userText || '').trim();
  const catalog = listRoutableSkills();
  const catalogMs = elapsed(started);
  const localStart = nowMs();
  const local = localPlan(text, catalog);
  const localMs = elapsed(localStart);
  const equipped = catalog.filter((skill) => skill.availability === 'equipped').length;
  const trace = [
    `目录 · ${catalog.length} 个 Skill / ${equipped} 个已装备 · ${catalogMs}ms`,
    `本地路由 · 语义指纹与排除条件 · ${localMs}ms`,
  ];

  if (local.highConfidence) {
    trace.push(`路由决策 · 高置信本地命中 · ${elapsed(started)}ms`);
    return { plan: local.plan, trace };
  }

  const mnnStart = nowMs();
  const native = await mnnPlan(ctx, catalog);
  const mnnMs = elapsed(mnnStart);
  if (native.plan) {
    trace.push(`MNN 规划 · 端侧严格 JSON 契约通过 · ${mnnMs}ms · ${native.detail}`);
    trace.push(`Boundary · ${native.plan.steps.length} 个目标均在当前 Skill 目录 · ${elapsed(started)}ms`);
    return { plan: native.plan, trace };
  }
  trace.push(`MNN 规划 · 未采用 · ${mnnMs}ms · ${native.detail}`);

  if (PRIVATE_MARKERS.test(text)) {
    trace.push('隐私门 · 命中敏感输入，禁止把原文升级到云端 Qwen');
    return { plan: local.plan ? { ...local.plan, source: 'local-fallback' } : null, trace };
  }

  const cloudStart = nowMs();
  const cloud = await qwenPlan(ctx, catalog);
  const cloudMs = elapsed(cloudStart);
  if (cloud) {
    trace.push(`Qwen 规划 · 严格 JSON 契约通过 · ${cloudMs}ms`);
    trace.push(`Boundary · ${cloud.steps.length} 个目标均在当前 Skill 目录 · ${elapsed(started)}ms`);
    return { plan: cloud, trace };
  }
  trace.push(`Qwen 规划 · 不可用或契约未通过，回退本地 · ${cloudMs}ms`);
  if (local.plan) trace.push(`Boundary · 采用本地候选 · ${elapsed(started)}ms`);
  return { plan: local.plan ? { ...local.plan, source: 'local-fallback' } : null, trace };
}

function planReply(plan: FrostPlan): string {
  const names = plan.steps.map((step) => `「${step.skillName}」`).join(plan.mode === 'sequence' ? ' → ' : '、');
  if (!plan.ready) return `我已经把任务路由到 ${names}，但其中有能力尚未装备。先完成安装与哈希校验，我再把任务交过去。`;
  const confirm = plan.steps.some((step) => step.requiresConfirmation) ? '涉及落图或生成数据包的动作，仍会在 Skill 内再次请你确认。' : '我只会把任务交给已装备的 Skill。';
  return `我会用 ${names} 处理这件事。${confirm}`;
}

/** Frost 主页面入口：输出可验证计划；没有合适 Skill 时返回 null，由页面走直接回答。 */
export async function runFrostOrchestrator(ctx: FrostContext): Promise<FrostOrchestratorResult> {
  const { plan, trace } = await planFrostTask({ ...ctx, surface: 'frost' });
  if (!plan) {
    return {
      agent: 'frost-orchestrator', reply: '', data: { plan: null, route: 'direct-answer' },
      radioActions: [], trace: [...trace, '收口 · 没有合适 Skill，交给 Frost 直接回答'], plan: null,
    };
  }
  return {
    agent: 'frost-orchestrator', reply: planReply(plan), data: { plan, route: 'skill-plan' },
    radioActions: [], trace: [...trace, `确认门 · ${plan.ready ? '等待用户启动计划' : '等待装备缺失能力'}`], plan,
  };
}
