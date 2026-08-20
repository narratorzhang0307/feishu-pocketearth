// 文化问答 · 优先真实大脑+RAG；stub 时用当前城市播客文稿作近似回答
import { RADIO_CITIES } from '../../harness/domain';
import { AgentResult, FrostContext } from '../../harness/types';
import { getFrostBrain } from '../../harness/brain';
import { cleanVoice, HUMAN_VOICE } from '../../harness/persona';
import { formatHistory } from '../../harness/memory';

function podcastSnippet(citySlug?: string): { city: string; text: string } | null {
  const city = citySlug ? RADIO_CITIES.find((c) => c.slug === citySlug) : undefined;
  const seg = city?.podcast?.find((p) => p.text && p.text.trim());
  if (!city || !seg) return null;
  // 取前两句，避免整段倒出来
  const sentences = seg.text.replace(/\s+/g, ' ').split(/(?<=[。！？])/).filter(Boolean);
  return { city: city.cityNameZh, text: sentences.slice(0, 3).join('').slice(0, 220) };
}

export async function runDeepAnswer(
  ctx: FrostContext
): Promise<AgentResult<{ source: 'brain' | 'podcast' | 'none' }>> {
  const text = (ctx.userText || '').trim();

  let brainReply = '';
  const prompt = `${formatHistory(ctx.history)}就用户的城市/作家/作品文化问题给出一段有质感的回答（120-220 字），从声音、夜晚、城市气质切入。\n${HUMAN_VOICE}\n用户：${text}`;
  try { brainReply = cleanVoice((await getFrostBrain().complete(prompt, { task: 'narrative' })).trim()); } catch { brainReply = ''; }
  if (brainReply) {
    return { agent: 'deep-answer', reply: brainReply, data: { source: 'brain' }, radioActions: [] };
  }

  // stub fallback：当前城市的播客文稿作近似来源
  const snip = podcastSnippet(ctx.citySlug);
  if (snip) {
    return {
      agent: 'deep-answer',
      reply: `关于${snip.city}，我手边有一段夜里的稿子：${snip.text}`,
      data: { source: 'podcast' },
      radioActions: [],
    };
  }

  return {
    agent: 'deep-answer',
    reply: '这座城的文化知识库我还没接上，等 writer-book 流水线把书读进来，我再好好跟你讲。',
    data: { source: 'none' },
    radioActions: [],
  };
}
