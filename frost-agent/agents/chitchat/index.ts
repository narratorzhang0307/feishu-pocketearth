// 闲聊 · 优先真实大脑，stub 时走 Frost 声音规则 fallback（无 LLM 也能体面回应）
import { AgentResult, FrostContext } from '../../harness/types';
import { getFrostBrain } from '../../harness/brain';
import { FROST_PERSONA, NO_STAGE_DIRECTION, HUMAN_VOICE, cleanVoice } from '../../harness/persona';
import { formatHistory } from '../../harness/memory';

// Frost 声音的兜底回应（按文本做稳定取样，避免每次都一样）
const FALLBACKS = [
  '我在。今晚的频率一直开着，你随时说。',
  '嗯，我听着。深夜的电台不急，慢慢讲。',
  '黄昏正沿着地球往西走，我陪你坐一会儿。',
  '说吧，反正这条频率只有我们两个。',
  '我记下了。要不要我顺手放点什么垫着？',
];

function pickFallback(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACKS[h % FALLBACKS.length];
}

const buildPrompt = (text: string, history: string) =>
  `你是${FROST_PERSONA.name}（${FROST_PERSONA.nameEn}），深夜电台 DJ。声音：冷静克制、带黄昏与远方的口吻，不像产品说明。\n` +
  (history ? history + '（请结合上面的对话，记住用户说过的话，不要前后矛盾）\n' : '') +
  `用一到两句话回应用户这句闲聊，不要挑歌、不要切城。${NO_STAGE_DIRECTION}\n${HUMAN_VOICE}\n用户：${text}\n${FROST_PERSONA.name}：`;

export async function runChitchat(ctx: FrostContext): Promise<AgentResult<Record<string, never>>> {
  const text = (ctx.userText || '').trim();
  let reply = '';
  try {
    reply = cleanVoice((await getFrostBrain().complete(buildPrompt(text, formatHistory(ctx.history)))).trim());
  } catch { reply = ''; }
  if (!reply) reply = pickFallback(text || 'frost'); // stub / 出错 → 规则 fallback
  return { agent: 'chitchat', reply, data: {}, radioActions: [] };
}
