// Frost Harness · LLM 意图路由（泛化层）
// 明确指令由 switch-handler 正则秒回；其余交给大脑读懂自然语言、判断意图 + 抽城市。
// 大脑不可用（stub/无 key/出错）时返回 null，调用方回退到规则路由。
import { FrostContext, FrostIntent } from './types';
import { getFrostBrain } from './brain';
import { formatHistory } from './memory';
import { RADIO_CITIES } from './domain';
import { matchCity } from '../agents/switch-handler';

export interface LlmRoute {
  intent: FrostIntent;   // switch | tour | open_dj | city_culture | general
  city?: string;         // 抽到的城市中文名（供 switch / city_culture）
  reason?: string;       // 给思考痕迹用
}

const ALLOWED = new Set<FrostIntent>(['switch', 'tour', 'open_dj', 'city_culture', 'general']);
const buildPrompt = (text: string, history: string) =>
  `你是电台总控的「意图路由」。先想清楚用户这句到底想要什么，再判类别、抽城市。\n` +
  (history ? history : '') +
  `类别（intent 只能取其一）：\n` +
  `- switch：明确点名要切到某座【具体城市】的电台，且这座城在下面的候选名单里（如"切到东京""去巴黎""换成圣彼得堡"）。只有原话里真出现具体城市名时才用。\n` +
  `- open_dj：想听某一类音乐——按国家 / 地域 / 风格流派 / 心情 / 场景 / 书或作家点歌（如"放点日本的音乐""来点爵士""放首慵懒的""适合下雨天开车""我在读卡夫卡""像村上那种"）。凡"放 / 来点 + 某种音乐"但没点名具体城市的，一律归这里。\n` +
  `- tour：跟着日落走 / 现在哪座城在日落 / 想要一整夜的电台。\n` +
  `- city_culture：问某座城 / 某位歌手 / 某首作品背后的事、历史、文化。\n` +
  `- general：其它任何（电台能做什么、世界常识、闲聊、说不清的）。\n` +
  `关键区分：国家 / 地域 / 风格 / 心情都不是城市——"放日本的音乐"是 open_dj（不是切到东京）；"放点欧洲的"是 open_dj（不是切到某座欧洲城）。只有用户真点了候选名单里的城市名，才用 switch。\n` +
  `城市候选（city 只能从这些中文名里选，选不到就留空；open_dj 一般留空）：${RADIO_CITIES.map((c) => c.cityNameZh).join('、')}\n` +
  `返回严格 JSON：{"intent":"switch|tour|open_dj|city_culture|general","city":"<中文城市名或空>","reason":"一句中文，为什么这样判断"}\n` +
  `用户：${text}`;

export async function llmRoute(ctx: FrostContext): Promise<LlmRoute | null> {
  const text = (ctx.userText || '').trim();
  if (!text) return null;
  let raw = '';
  try { raw = (await getFrostBrain().complete(buildPrompt(text, formatHistory(ctx.history)), { json: true, task: 'route' })).trim(); } catch { raw = ''; }
  if (!raw) return null; // 大脑不可用 → 调用方回退正则
  try {
    const p = JSON.parse(raw) as { intent?: string; city?: string; reason?: string };
    let intent = (p.intent && ALLOWED.has(p.intent as FrostIntent) ? p.intent : 'general') as FrostIntent;
    let city = (p.city || '').trim() || undefined;
    let reason = (p.reason || '').trim() || undefined;
    // 确定性护栏：判了 switch，就回头核对——城市必须真出现在用户原话里。
    // 没出现（多半是把"日本/欧洲"这类国家·地域脑补成了某座城）→ 降级成 open_dj 点歌；
    // 出现了 → 以原话里那座城为准（盖掉大脑可能抽歪的 city），让"切城"永远切到用户真说的城。
    if (intent === 'switch') {
      const hit = matchCity(text);
      if (!hit) { intent = 'open_dj'; city = undefined; reason = (reason ? reason + '；' : '') + '原话未点名具体城市，按点歌处理'; }
      else { city = hit.cityNameZh; }
    }
    return { intent, city, reason };
  } catch { return null; }
}
