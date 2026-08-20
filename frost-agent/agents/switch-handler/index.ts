// 指令手 · 纯规则解析（无 LLM）
// 把用户明确指令（换歌/暂停/切城）翻成 radioActions 建议。
import { RADIO_CITIES } from '../../harness/domain';
import { AgentResult, FrostContext, RadioAction } from '../../harness/types';

const norm = (s: string) => s.toLowerCase().replace(/[\s·・.\-_'’,，。！!]/g, '');

/** 在资源库城市里按中文名/英文名宽松匹配，返回 slug。导出供 LLM 路由调用。 */
export function matchCity(text: string): { slug: string; cityNameZh: string } | null {
  const t = norm(text);
  for (const c of RADIO_CITIES) {
    const zh = norm(c.cityNameZh);
    const en = norm(c.cityName);
    if ((zh && t.includes(zh)) || (en && en.length > 2 && t.includes(en))) {
      return { slug: c.slug, cityNameZh: c.cityNameZh };
    }
  }
  return null;
}

const NEXT = /(下一首|下首|换一?首|换歌|next|skip)/i;
const PREV = /(上一首|上首|前一首|回到上|prev|previous)/i;
const PAUSE = /(暂停|停一下|别放了|停下|pause)/i;
const RESUME = /^(继续|继续播放|播放|放吧|接着放|接着听|play|resume)$/i; // 裸恢复播放（无具体城市/曲目）
const WANT_CITY = /(切|去|跳|换到|播放|放|听|来点|来一?首|station|城市|电台)/i; // 含城市名时表"想去这座城"

/** 把城市名解析成「切城」结果（LLM 路由抽到城市后调用）。匹配不到返回 null。 */
export function switchToCity(name: string): AgentResult<{ matched: boolean }> | null {
  const hit = matchCity(name);
  if (!hit) return null;
  return { agent: 'switch-handler', reply: `好，切到${hit.cityNameZh}。`, data: { matched: true }, radioActions: [{ type: 'switch_city', slug: hit.slug }] };
}

/** 解析一条明确指令。匹配不到返回 matched:false（交回 Router）。 */
export function runSwitchHandler(ctx: FrostContext): AgentResult<{ matched: boolean }> {
  const text = (ctx.userText || '').trim();
  let action: RadioAction | null = null;
  let reply = '';

  // 切城优先：句中带城市名、且带切城/播放/听类动词 → 切到那座城
  // （"播放圣彼得堡的歌" 应切到圣彼得堡，而不是把"播放"当成恢复播放）
  const cityHit = matchCity(text);
  if (cityHit && WANT_CITY.test(text)) {
    action = { type: 'switch_city', slug: cityHit.slug };
    reply = `好，切到${cityHit.cityNameZh}。`;
  }
  if (!action) {
    if (NEXT.test(text)) { action = { type: 'next_track' }; reply = '换下一首。'; }
    else if (PREV.test(text)) { action = { type: 'prev_track' }; reply = '回上一首。'; }
    else if (PAUSE.test(text)) { action = { type: 'pause' }; reply = '先停一下。'; }
    else if (RESUME.test(norm(text))) { action = { type: 'play' }; reply = '继续。'; }
  }

  if (!action) {
    return { agent: 'switch-handler', reply: '', data: { matched: false }, radioActions: [] };
  }
  return { agent: 'switch-handler', reply, data: { matched: true }, radioActions: [action] };
}
