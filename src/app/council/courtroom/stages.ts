// 法庭流水线引擎（核心）：把 courtroom 从「群聊回合」升级为有阶段依赖的串行庭审：
//   立案争点 → 举证质证 → 法庭辩论 → 合议裁决(json) → 复核(Critic + 确定性验证器)。
// 每阶段只向下游传「结构化小结论」(Handoff Contract)；裁决阶段无条件走云端 json（端侧小模型 json 不稳）。
// 解耦：纯逻辑无 UI、回调式流式接口，AbortSignal 检查点同 engine.ts；复用 cleanVoice/HUMAN_VOICE/edgeSafe。
import { agentById, type CouncilAgent } from '../agents';
import { edgeSafe } from '../../../../frost-agent/edge/contract';
import { cleanVoice } from '../../../../frost-agent/harness/persona';
import { buildRoleSystem, resolveSides } from './roles';
import { shouldPass } from './clerk';
import { verifyVerdict } from './courtVerify';
import { newVerdictId, clamp01, type Verdict, type CourtStage, type ArgPoint, type CourtRole } from './types';
import { findSimilarCases, saveCase } from './caseStore';
import type { CouncilMsg } from '../engine';

export interface CourtroomOpts {
  agentIds: string[];
  proIds?: string[];          // 用户手动指定的正方（可选）；两侧都非空才采信，否则退回位置二分
  conIds?: string[];          // 用户手动指定的反方（可选）
  topic: string;
  rounds: number;
  backend: 'cloud' | 'edge';
  geo?: { lat: number; lng: number; place: string };
  onMessage: (m: CouncilMsg) => void;
  onSpeaker: (id: string | null) => void;
  onStage?: (stage: CourtStage) => void;
  onVerdict: (v: Verdict | null) => void;
  signal: AbortSignal;
}

// —— LLM 调用：对话走云/端；裁决走云端 json（自己 parse + 兜底，因 server 把 json 当字符串塞 .text）——
async function cloudText(system: string, user: string, signal: AbortSignal): Promise<string> {
  try {
    const r = await fetch('/api/frost-llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt: user, task: 'council' }), signal });
    if (!r.ok) return '';
    const d = await r.json();
    return typeof d?.text === 'string' ? d.text.trim() : '';
  } catch { return ''; }
}
async function speak(system: string, user: string, signal: AbortSignal, backend: 'cloud' | 'edge'): Promise<string> {
  if (backend === 'edge') {
    try { const t = await edgeSafe.chat(user, { system }); if (t && t.trim()) return t.trim(); } catch { /* 回落云端 */ }
    if (signal.aborted) return '';
  }
  return cloudText(system, user, signal);
}
function extractJSON(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf('{'); const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)) as Record<string, unknown>; } catch { return null; }
}
// 裁决/争点：无条件走云端 json（忽略 backend==='edge'，端侧 json 不稳），自己 parse + 兜底
async function cloudJSON(system: string, user: string, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/api/frost-llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt: user, json: true, task: 'council' }), signal });
    if (!r.ok) return null;
    const d = await r.json();
    return extractJSON(typeof d?.text === 'string' ? d.text : '');
  } catch { return null; }
}

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const strArr = (x: unknown) => Array.isArray(x) ? x.map(str).filter(Boolean).slice(0, 8) : [];
const argArr = (x: unknown): ArgPoint[] => Array.isArray(x) ? x.map((o) => {
  const r = (o || {}) as Record<string, unknown>;
  return { claim: str(r.claim), evidenceRef: str(r.evidenceRef || r.evidence), reasoning: str(r.reasoning) };
}).filter((a) => a.claim).slice(0, 6) : [];

// 公开发言滚动窗口（结构化争点常驻 + 最近 K 条原文），每轮重申议题（修 engine 只在 system 出现一次）
function buildUserPrompt(topic: string, issues: string[], transcript: CouncilMsg[], roleHint: string): string {
  const issuesLine = issues.length ? `本案争点：${issues.join('；')}。` : '';
  const recent = transcript.slice(-6).map((m) => `${m.name}（${m.role || ''}）：${m.text}`).join('\n');
  return `【议题】${topic || '（自由发挥）'}\n${issuesLine}\n${recent ? `【目前的庭审】\n${recent}\n\n` : ''}${roleHint}请紧扣议题与争点发言。`;
}

const ROLE_LABEL: Record<string, string> = { prosecutor: '控方', defender: '辩方', judge: '审判长', critic: '复核', juror: '陪审' };

export async function runCourtroom(o: CourtroomOpts): Promise<void> {
  const agents = o.agentIds.map(agentById).filter(Boolean) as CouncilAgent[];
  if (agents.length < 2) { o.onSpeaker(null); o.onVerdict(null); return; }
  const names = agents.map((a) => a.name).join('、');
  const topic = o.topic;
  const { proIds, conIds, judgeId } = resolveSides(o.agentIds, o.proIds, o.conIds);
  const judge = agentById(judgeId) || agentById('chair')!;
  // 边界：法庭需正反各至少一人。否则会单方庭审（辩方全程缺席），裁决严重偏颇——直接如实提前结束。
  if (!proIds.length || !conIds.length) {
    const m: CouncilMsg = { id: 'ct0', speakerId: judge.id, name: judge.name, color: judge.color, idx: 0, role: ROLE_LABEL.judge,
      text: cleanVoice('开庭需要正反双方：请至少选两名「庭长以外」的与会者，本庭才能正反对辩。') };
    o.onMessage(m); o.onVerdict(null); o.onSpeaker(null); return;
  }
  const transcript: CouncilMsg[] = [];
  let idx = 0;
  const maxTurns = agents.length * Math.max(1, o.rounds) * 2 + 4;   // 收敛硬上限

  const push = (a: CouncilAgent, role: CourtRole, text: string) => {
    const t = cleanVoice(text) || '（无补充。）';
    const m: CouncilMsg = { id: `ct${idx}`, speakerId: a.id, name: a.name, color: a.color, text: t, idx, role: ROLE_LABEL[role] };
    transcript.push(m); o.onMessage(m); idx++;
  };
  const sideText = () => transcript.filter((m) => m.role === '控方' || m.role === '辩方').map((m) => `${m.name}：${m.text}`);

  // —— 阶段①：立案 / 争点固定（审判长用 json 提取争点）——
  o.onStage?.('立案'); o.onSpeaker(judge.id);
  let issues: string[] = [];
  const issueObj = await cloudJSON(
    '你是弗洛斯特（FROST），本庭庭长，负责立案。读议题，提炼 1-3 个真正需要裁断的「争点」。只输出 JSON：{"issues":["...","..."]}。争点要具体、可辩、互不重复。',
    `议题：「${topic || '（自由发挥）'}」。请输出争点 JSON。`, o.signal);
  if (o.signal.aborted) return done(o);
  issues = strArr(issueObj?.issues);
  if (!issues.length) issues = [topic || '该议题是否成立'];
  push(judge, 'judge', `本庭就「${topic || '该议题'}」开庭。本案争点：${issues.map((s, i) => `${i + 1}）${s}`).join('；')}。请控辩双方依次举证。`);

  const ctx = { topic, names, issues };

  // —— 阶段②③：举证质证 + 法庭辩论（控辩交替，rounds 轮；书记官去重/防跑题；maxTurns 收敛）——
  o.onStage?.('举证质证');
  const proA = proIds.map(agentById).filter(Boolean) as CouncilAgent[];
  const conA = conIds.map(agentById).filter(Boolean) as CouncilAgent[];
  const rounds = Math.max(1, o.rounds);
  for (let r = 0; r < rounds; r++) {
    if (r === 1) o.onStage?.('法庭辩论');
    for (let i = 0; i < Math.max(proA.length, conA.length); i++) {
      for (const [side, agent] of [['prosecutor', proA[i]], ['defender', conA[i]]] as [CourtRole, CouncilAgent | undefined][]) {
        if (!agent) continue;
        if (o.signal.aborted) return done(o);
        if (idx >= maxTurns) break;
        o.onSpeaker(agent.id);
        const sys = buildRoleSystem(side, agent, ctx);
        const hint = r === 0 ? '现在轮到你举证：摆出你方最有力的一条证据与推理。' : '现在轮到你辩论：针对对方刚才的发言回应、质疑或反驳。';
        const text = await speak(sys, buildUserPrompt(topic, issues, transcript, hint), o.signal, o.backend);
        if (o.signal.aborted) return done(o);
        const pass = shouldPass(text, transcript.map((m) => m.text), topic);
        if (pass.pass) continue;   // 书记官：复读/跑题/空话 → 不计入正式发言
        push(agent, side, text);
      }
    }
  }

  // —— 阶段④：合议裁决（无条件云端 json，确定性验证器把关）——
  if (o.signal.aborted) return done(o);
  o.onStage?.('合议裁决'); o.onSpeaker(judge.id);
  const recordText = sideText().join('\n');
  // 类案参照：开庭前召回相似争点的历史判例要旨，注入合议（仅供审判长参考，不得凌驾本场证据；偏离须在 dissent 说明）
  const precedents = findSimilarCases(topic, issues, 3);
  const precedentDigest = precedents
    .map((v) => `先例：${v.topic} → 要旨：${v.ruleEstablished}${v.dissent ? `（存异：${v.dissent}）` : ''}`)
    .join('\n');
  const verdictObj = await cloudJSON(
    '你是弗洛斯特（FROST），本庭庭长，综合整场庭审做出结构化裁决。只输出一个 JSON 对象，忠实于庭审公开记录、不要引入记录中没出现的证据。'
    + '正反双方的证据可能有偏颇或夸大，采信前先掂量其可靠性，明显站不住的论据在 verdict 里点出来、不要被其气势带偏。'
    + '字段：issues(争点数组)、proArgs(正方论据数组,每条{claim,evidenceRef证据引用,reasoning推理})、conArgs(反方论据数组,同结构)、'
    + 'verdict(裁断文本,给出倾向与理由)、confidence(0到1的置信度数字)、dissent(保留的合理分歧)、ruleEstablished(本案确立的一句裁判要旨)。'
    + (precedentDigest ? '若本案裁断偏离下方【类案参照】的先例要旨，须在 dissent 字段说明为何偏离。' : ''),
    `议题：「${topic}」。争点：${issues.join('；')}。\n【庭审公开记录】\n${recordText || '（双方未充分举证）'}\n`
    + (precedentDigest ? `【类案参照（仅供参考，不得凌驾本场证据）】\n${precedentDigest}\n` : '')
    + '请输出裁决 JSON。', o.signal);
  if (o.signal.aborted) return done(o);

  const verdict: Verdict = {
    id: newVerdictId(), topic, mode: 'courtroom', issues,
    proArgs: argArr(verdictObj?.proArgs), conArgs: argArr(verdictObj?.conArgs),
    verdict: str(verdictObj?.verdict) || '（合议未达成明确裁断，建议补充举证后再审。）',
    confidence: clamp01(typeof verdictObj?.confidence === 'number' ? verdictObj.confidence as number : parseFloat(String(verdictObj?.confidence)) || 0.5),
    dissent: str(verdictObj?.dissent), ruleEstablished: str(verdictObj?.ruleEstablished), critique: '',
    createdAt: new Date().toISOString(), transcriptDigest: transcript.map((m) => `${m.name}:${m.text}`).join(' / ').slice(0, 400),
    geo: o.geo,
  };
  push(judge, 'judge', `合议裁断：${verdict.verdict}（置信 ${Math.round(verdict.confidence * 100)}%）`);

  // —— 阶段⑤：复核（Critic 证伪 + 确定性验证器；违规则降置信、记入 critique）——
  // 核验先于 abort 判断算出来：它是确定性纯逻辑（无网络），critical 关系到「能否入库」，须始终可得。
  const check = verifyVerdict(verdict, { evidenceMentions: sideText() });
  const hasCritical = check.critical.length > 0;
  if (hasCritical) verdict.criticalViolations = check.critical.map((c) => c.msg);   // 透出给 UI 标红
  if (!o.signal.aborted) {
    o.onStage?.('复核');
    // 复核官只在「已入场」成员里选：抬杠侠 contra 入场则优先，否则辩方/正方首人，最后庭长。
    // （不再无条件 agentById('contra') 拉入未入场的人发言）
    const critic = o.agentIds.includes('contra') ? agentById('contra')!
      : (conA[0] || proA[0] || judge);
    o.onSpeaker(critic.id);
    const cSys = buildRoleSystem('critic', critic, ctx);
    const cText = await speak(cSys, `这是本案裁断：「${verdict.verdict}」。确定性核验发现的问题：${check.messages.join('；') || '无'}。请用一两句指出裁断最可能的薄弱处（证据不足/推理跳步/越级），没有就说「程序无明显瑕疵」。`, o.signal, o.backend);
    if (!o.signal.aborted) {
      verdict.critique = (cleanVoice(cText) || '程序无明显瑕疵。') + (check.messages.length ? `（自动核验：${check.messages.join('；')}）` : '');
      if (check.messages.length) verdict.confidence = clamp01(verdict.confidence - 0.15 * Math.min(2, check.messages.length));
      push(critic, 'critic', verdict.critique);
    }
  }

  // 自动入库判例：置信达阈 + 有裁判要旨 + 无 critical 违规（疑似杜撰证据等）才入库。
  // 让判例库有料可被「类案参照」检索，又绝不让「证据可能是编的」裁决污染先例语料（按 id 幂等去重）。
  if (verdict.confidence >= 0.6 && verdict.ruleEstablished && !hasCritical) saveCase(verdict);
  o.onVerdict(verdict);
  done(o);
}

function done(o: CourtroomOpts) { o.onSpeaker(null); }
