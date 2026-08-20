// 角色分离层：在现有 agent.persona 之上叠「立场偏置层」+「证据采信方法层（全场共用一把尺）」+ 少量风格锚。
// 复用 frost-agent/harness/persona.ts 的 HUMAN_VOICE（不碰 FROST_PERSONA：法庭 N 官是各自独立人格）。
// P0 立场指派直接复用 engine.ts 的位置二分（前半正方/后半反方），不做 LLM assignSides（挪 P1）。
import { HUMAN_VOICE } from '../../../../frost-agent/harness/persona';
import type { CouncilAgent } from '../agents';
import type { CourtRole } from './types';

// 立场偏置层：控方天然找支持证据、辩方天然建立合理怀疑、审判长不站队只裁断
const STANCE: Record<CourtRole, string> = {
  prosecutor: '本场你是【控方·正方】。你天然为「议题命题成立」举证，主动找最有力的真实证据、案例、数据与逻辑链支持它。例：要论证「该搬去海边」，你会摆出气候、通勤、生活成本的具体数据。只用可考证据，绝不编造。',
  defender: '本场你是【辩方·反方】。你天然「建立合理怀疑」，主动找反例、漏洞、隐藏代价与不成立的理由。例：对「该搬去海边」，你会指出潮湿、就业面窄、社交断裂的风险。只用可考证据，绝不编造。',
  judge: '本场你是【审判长】。你不持立场、不下场辩论，只厘清争点、推进程序、归纳分歧、做公允裁断。谁的推理链自相矛盾或被对方有效反驳，就削谁的权。专治顺着提问者意图编结论的毛病。',
  juror: '本场你是【陪审员】。独立判断，给出倾向（支持/反对/中立）与理由，不被任一方气势带偏。',
  clerk: '你是书记官，只做记录与归整，不发表立场。',
  critic: '本场你是【复核官】。你只做证伪：专挑这份裁决的错（采信了不该采信的证据？推理跳步？越过质证直接定论？）。挑错远比一次判对容易，所以放手挑。',
};

// 证据采信方法层（全场共用一把尺，保证用同一标准）
const METHOD = '证据采信标准：①每条主张须带可考的证据引用（出处/事实/数据/案例）和一步步推理链；②无证据的空口断言不予采信；③自相矛盾或被有效反驳的主张降权；④严格区分事实与观点。';

export interface RoleCtx { topic: string; names: string; issues?: string[] }

// 角色 system 提示工厂：人设(agent) + 立场偏置 + 方法层 + 议题/争点 + 发言规则 + HUMAN_VOICE
export function buildRoleSystem(role: CourtRole, agent: CouncilAgent, ctx: RoleCtx): string {
  const issuesLine = ctx.issues && ctx.issues.length ? `本案争点：${ctx.issues.join('；')}。` : '';
  return (
    `你是「${agent.name}」（${agent.handle}）。${agent.persona}\n` +
    `${STANCE[role]}\n${METHOD}\n` +
    `议题：「${ctx.topic || '（自由发挥）'}」。${issuesLine}在座：${ctx.names}。\n` +
    `发言规则：用你的身份视角与说话风格；紧扣议题与争点；简短有观点（80-130 字）；亮出你的证据与推理；不复读别人、不写旁白、不自我介绍，直接说。\n${HUMAN_VOICE}`
  );
}

// P0 位置二分指派立场（复用 engine.ts:62-64 的现成逻辑，UI 文案已向用户解释「前半正方/后半反方」）
export function assignSidesByPosition(agentIds: string[]): { proIds: string[]; conIds: string[]; judgeId: string } {
  const rest = agentIds.filter((id) => id !== 'chair');
  const mid = Math.ceil(rest.length / 2);
  return { proIds: rest.slice(0, mid), conIds: rest.slice(mid), judgeId: 'chair' };
}

// P1 手动分边：用户在 UI 里逐个点选谁正方/谁反方时调这里。
// 规则：过滤掉庭长、去重、只保留真正在场(agentIds 内)的人；同一人不得同时正反（反方去掉已在正方者）。
// 只有「两侧都非空」才采信手动指定；否则（未传 / 传了但一边为空）退回位置二分，保持向后兼容。
export function resolveSides(agentIds: string[], proIds?: string[], conIds?: string[]): { proIds: string[]; conIds: string[]; judgeId: string } {
  const present = new Set(agentIds);
  const clean = (arr?: string[]) => [...new Set((arr || []).filter((id) => id !== 'chair' && present.has(id)))];
  const pro = clean(proIds);
  const con = clean(conIds).filter((id) => !pro.includes(id));
  if (pro.length && con.length) return { proIds: pro, conIds: con, judgeId: 'chair' };
  return assignSidesByPosition(agentIds);
}
