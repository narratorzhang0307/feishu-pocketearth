// 圆桌议事 · 回合引擎（解耦、纯逻辑，不含任何 UI）
// 「频道群聊」式的纯前端回合循环：
//   选下一个发言者 → 构造该 agent 看到的群聊上下文 → 调一次云脑(/api/frost-llm) → 追加发言 → 判断是否继续。
// 收敛靠「固定发言序列（每人 N 轮）+ 用户可随时喊停(AbortSignal)」，天然不会无限互相回复。
import { agentById, type CouncilAgent } from './agents';
import { edgeSafe } from '../../../frost-agent/edge/contract';
import { HUMAN_VOICE, cleanVoice } from '../../../frost-agent/harness/persona';

export type CouncilMode = 'roundtable' | 'debate' | 'courtroom' | 'brainstorm';
export type CouncilBackend = 'cloud' | 'edge';  // 云端 Qwen / 端侧 Qwen + MNN

export interface CouncilModeDef { id: CouncilMode; label: string; emoji: string; blurb: string; tone: string }
export const COUNCIL_MODES: CouncilModeDef[] = [
  { id: 'roundtable', label: '圆桌 · 出谋划策', emoji: '🪑', blurb: '各抒己见，合力把事想透', tone: '这是一场圆桌议事，大家各用所长出谋划策，互相补位、把方案越聊越完整。' },
  { id: 'debate', label: '自由辩论', emoji: '🗣️', blurb: '针锋相对，互相反驳', tone: '这是一场自由辩论，鼓励针对前面的发言回应、质疑、反驳，把分歧摆到台面上。' },
  { id: 'courtroom', label: '法庭', emoji: '⚖️', blurb: '正方反方，庭长裁断', tone: '这是一场模拟法庭，分正方与反方就议题各自举证、互相质证，最后由庭长裁断。' },
  { id: 'brainstorm', label: '头脑风暴', emoji: '💡', blurb: '放飞脑洞，发散不评判', tone: '这是一场头脑风暴，鼓励大胆、发散、互相接梗，先不急着否定，越离谱越好玩。' },
];
export const modeDef = (m: CouncilMode) => COUNCIL_MODES.find((x) => x.id === m)!;

export interface CouncilMsg { id: string; speakerId: string; name: string; color: string; text: string; idx: number; role?: string }

interface RunOpts {
  mode: CouncilMode;
  agentIds: string[];
  topic: string;
  rounds: number;                         // 每个 agent 发言几轮
  backend: CouncilBackend;                // 云端 / 端侧
  proIds?: string[];                      // 法庭：用户手动指定的正方（两侧都非空才采信，否则位置二分）
  conIds?: string[];                      // 法庭：用户手动指定的反方
  onMessage: (m: CouncilMsg) => void;
  onSpeaker: (id: string | null) => void; // 当前正在「思考」的发言者（null = 结束）
  signal: AbortSignal;
}

async function cloudComplete(system: string, user: string, signal: AbortSignal): Promise<string> {
  try {
    const r = await fetch('/api/frost-llm', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system, prompt: user }), signal,
    });
    if (!r.ok) return '';
    const d = await r.json();
    return typeof d?.text === 'string' ? d.text.trim() : '';
  } catch { return ''; }
}

// 用户选端侧时只调 Qwen/MNN，不把讨论内容静默上传；未加载则返回空并由本地文案兜底。
async function callLLM(system: string, user: string, signal: AbortSignal, backend: CouncilBackend): Promise<string> {
  if (backend === 'edge') {
    try {
      const t = await edgeSafe.chat(user, { system });
      if (t && t.trim()) return t.trim();
    } catch { /* 端侧不可用 → 本地兜底 */ }
    return '';
  }
  return cloudComplete(system, user, signal);
}

// 发言顺序：法庭 = 正/反交替 + 庭长收尾；其余 = 轮流
// proIds/conIds：用户手动指定正反方时按指定排（两侧都非空才采信）；否则退回位置二分（向后兼容）。
function buildOrder(mode: CouncilMode, agents: CouncilAgent[], rounds: number, proIds?: string[], conIds?: string[]): { id: string; role?: string }[] {
  const seq: { id: string; role?: string }[] = [];
  if (mode === 'courtroom') {
    const rest = agents.filter((a) => a.id !== 'chair');
    const present = new Set(rest.map((a) => a.id));
    const pickIds = (ids?: string[]) => [...new Set((ids || []).filter((id) => present.has(id)))];
    const pIds = pickIds(proIds);
    const cIds = pickIds(conIds).filter((id) => !pIds.includes(id));
    let pro: CouncilAgent[], con: CouncilAgent[];
    if (pIds.length && cIds.length) {
      pro = pIds.map((id) => rest.find((a) => a.id === id)!);
      con = cIds.map((id) => rest.find((a) => a.id === id)!);
    } else {
      const mid = Math.ceil(rest.length / 2);
      pro = rest.slice(0, mid); con = rest.slice(mid);
    }
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < Math.max(pro.length, con.length); i++) {
        if (pro[i]) seq.push({ id: pro[i].id, role: '正方' });
        if (con[i]) seq.push({ id: con[i].id, role: '反方' });
      }
    }
    const chair = agents.find((a) => a.id === 'chair') || agentById('chair');
    if (chair) seq.push({ id: chair.id, role: '庭长裁断' });
    return seq;
  }
  for (let r = 0; r < rounds; r++) for (const a of agents) seq.push({ id: a.id });
  return seq;
}

export async function runCouncil(o: RunOpts): Promise<void> {
  const agents = o.agentIds.map(agentById).filter(Boolean) as CouncilAgent[];
  if (!agents.length) { o.onSpeaker(null); return; }
  const order = buildOrder(o.mode, agents, Math.max(1, o.rounds), o.proIds, o.conIds);
  const names = agents.map((a) => a.name).join('、');
  const tone = modeDef(o.mode).tone;
  const transcript: CouncilMsg[] = [];
  let idx = 0;

  for (const step of order) {
    if (o.signal.aborted) break;
    const a = agentById(step.id)!;
    o.onSpeaker(a.id);
    const recent = transcript.slice(-8).map((m) => `${m.name}：${m.text}`).join('\n');
    const roleLine = step.role ? `你在本场的身份：${step.role}。` : '';
    // 庭长裁断时多叮嘱一句：正反证据可能有偏颇/夸大，采信前先掂量可靠性，明显站不住的要点出来。
    const judgeCaution = step.role === '庭长裁断'
      ? '裁断时注意：正反双方的证据可能有偏颇或夸大，采信前先掂量其可靠性，明显站不住的论据在裁断里点出来、不要被气势带偏。\n'
      : '';
    const system =
      `你是「${a.name}」（${a.handle}）。${a.persona}\n` +
      `${tone}\n议题：「${o.topic || '（自由发挥）'}」。在座：${names}。${roleLine}\n` +
      judgeCaution +
      `规则：用你的身份视角和说话风格发言；可以回应、补充或反驳前面的人；简短有观点（80-130 字）；不要复读别人、不要写旁白、不要"我是…"式自我介绍，直接说观点。\n${HUMAN_VOICE}`;
    const user =
      `${recent ? `【目前的讨论】\n${recent}\n\n` : ''}现在轮到你（${a.name}）发言` +
      `${step.role === '庭长裁断' ? '，请综合各方做出简短的裁断 / 总结' : ''}。`;
    let text = cleanVoice(await callLLM(system, user, o.signal, o.backend));
    if (o.signal.aborted) break;
    if (!text) text = '（一时语塞，先过。）';
    const msg: CouncilMsg = { id: `cm${idx}`, speakerId: a.id, name: a.name, color: a.color, text, idx, role: step.role };
    transcript.push(msg);
    o.onMessage(msg);
    idx++;
  }
  o.onSpeaker(null);
}
