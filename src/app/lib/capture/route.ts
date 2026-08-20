// 统一万能记一笔 · 路由器
// 一句话（可带截图）→ frost 云脑判域（电影/书/旅行/心情）→ 调对应现成 agent 抽结构 → 返回 suggest-then-confirm 描述子。
// 沿用 runMovieAgent / runBookAgent / analyzeMood / pinManualStop 等现成管线，零重造。
// 解耦：不碰 FROST 封闭枚举内核(ProfileDomain)，不碰热区 MyMapTab / MarkerDetail。
// 注：音乐记单曲无独立 agent（曲库点歌才准），与「地点 / 随手想法」一并归 mood 兜底，文案如实说明。
import { runMovieAgent } from '../movie/agent';
import { confirmPin as confirmMovie } from '../movie/pin';
import type { MovieDraft } from '../movie/types';
import { GEO_LABEL as MOVIE_GEO } from '../movie';
import { runBookAgent } from '../book/agent';
import { confirmPin as confirmBook } from '../book/pin';
import type { BookDraft } from '../book/types';
import { GEO_LABEL as BOOK_GEO } from '../book';
import { pinManualStop } from '../travel/pin';
import { resolvePlace } from '../skills/resolvePlace';
import { analyzeMood, addMoodSticker, MOOD_TONES, pickRot, geocodeCity } from '../../data/geoStickers';
import { requestMapFocus } from '../../data/mapFocus';

export type CaptureDomain = 'movie' | 'book' | 'travel' | 'mood';
export const DOMAIN_LABEL: Record<CaptureDomain, string> = { movie: '电影', book: '书', travel: '行程', mood: '心情 / 随手' };
export const DOMAIN_COLOR: Record<CaptureDomain, string> = { movie: '#ffb000', book: '#b388ff', travel: '#ff3b6b', mood: '#ffd23b' };

export interface CaptureResult {
  domain: CaptureDomain;
  ok: boolean;             // 是否抽到可钉的东西
  needPlace?: boolean;     // 认出了但没坐标（电影/书待补国家）→ 当下不可钉，引导去对应 agent 补地点
  title: string;           // 主体名（片名 / 书名 / 城市 / 心情摘要）
  where: string;           // 落点描述（取景地·东京 / 京都 / 此处）
  note: string;            // 一句说明 / 失败原因
  rating?: number;         // 电影/书的我的评分（0-5，预览用）
  movieDraft?: MovieDraft;
  bookDraft?: BookDraft;
  confirm: () => Promise<{ pinned: boolean; reason?: string }>;
}

const FALLBACK: [number, number] = [120.14, 30.24];   // 杭州西湖（与 MoodRunPage 一致）
const NO_PIN = async () => ({ pinned: false, reason: 'noDraft' });

// frost 云脑判域 +（travel 时）抽目的地规范地名：回 {domain, place}。失败 / 判不准一律回落 mood（最稳的兜底）。
// place 关键：让云脑从整句里只抽出地名（还能借上下文消歧，如「波拉尼奥是智利作家」→ 智利圣地亚哥），
// 别把整句喂给地理编码器——噪声词会把「圣地亚哥」从智利首都拽到哥伦比亚同名小镇（钉错洲）。
async function classify(text: string): Promise<{ domain: CaptureDomain; place?: string }> {
  try {
    const r = await fetch('/api/frost-llm', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system: '你判断用户这句「随手记」最适合钉成哪一类，只输出 JSON {"domain":"...","place":"..."}。四类：'
          + 'movie（看了某部电影 / 影片 / 剧集，如"看完奥本海默"）、book（读了某本书 / 某位作者，如"读完百年孤独"）、'
          + 'travel（亲身去过 / 到过 / 玩了某个地方的出行经历，如"上周去了京都""在巴黎待了三天""刚从西藏回来""出差去了东京"——只要是"我去过某地"就归这里）、'
          + 'mood（表达此刻的心情 / 感受 / 随手想法，没有具体作品、也不是某次出行，如"今天有点累""想喝杯咖啡"）。'
          + '判断顺序：先看有没有具体作品名 → movie / book；再看是不是"亲身去过 / 到过某地" → travel；都不是 → mood。'
          + 'place 字段：仅当 domain=travel 时，从句子里抽出那个目的地的规范地名（只填地名本身，不要原句的其它字；能判断国家就带上国家消歧，如"智利圣地亚哥""日本京都"），其余情况一律填空字符串 ""。',
        prompt: text, json: true, task: 'route',
      }),
    });
    if (!r.ok) return { domain: 'mood' };
    const d = await r.json();
    const t = typeof d?.text === 'string' ? d.text : '';
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0 || e <= s) return { domain: 'mood' };
    const o = JSON.parse(t.slice(s, e + 1)) as { domain?: string; place?: string };
    const dom = (o.domain || '').trim();
    const domain = (['movie', 'book', 'travel', 'mood'] as string[]).includes(dom) ? (dom as CaptureDomain) : 'mood';
    return { domain, place: typeof o.place === 'string' ? o.place.trim() : '' };
  } catch { return { domain: 'mood' }; }
}

// 一句话（+可选截图）→ 判域 → 走对应 agent → 统一 CaptureResult（suggest，confirm 才钉）。
export async function runCapture(text: string, imageDataUrl?: string, onPhase?: (phase: string, detail?: string) => void): Promise<CaptureResult | null> {
  const t = (text || '').trim();
  if (!t && !imageDataUrl) return null;
  // 只给截图没文字时默认先认作品（电影封面 / 海报最常见）；否则云脑判域
  onPhase?.('判断这是哪一类', '云脑判域');
  let domain: CaptureDomain; let placeHint = '';
  if (imageDataUrl && !t) { domain = 'movie'; }
  else { const c = await classify(t); domain = c.domain; placeHint = c.place || ''; }
  // 判域词护栏：用户明说领域（「这部电影」「这本书」）时别让云脑误判 mood。
  // 截图+文字时判域全靠 classify(t)，而 classify 只收文字、片名只在截图里，文案没具体作品名 → 云脑按「没作品名→mood」回落
  //（实测「帮我记录下这部电影到我的电影agent中」+截图被判成心情）。收紧成词组（不含裸「电影/书」）避免「电影博物馆」「软件作者」误判。
  if (/这部(电影|片|剧|影片|纪录片)|这部片子|影片|剧集|看的这部/i.test(t)) domain = 'movie';
  else if (/这本(书|小说)|这部小说|看的这本/i.test(t)) domain = 'book';
  // 确定性护栏：明显的「去过某地」(出行动词 + 可识别城市) 强制 travel，别被云脑误判成 mood
  if (domain === 'mood' && /去了|去过|到了|到过|玩了|逛了|出差|旅行|刚从.{0,6}回来/.test(t) && geocodeCity(t)) domain = 'travel';
  // 愿望护栏：「想去 + 某地」是还没去的向往，但常被作家名/书名/片名带偏（如「看了波拉尼奥想去圣地亚哥」被判成读书）。
  // 不限源域(book/travel/movie/mood)：只要句中有「想去…」且后面不是「看/吃/玩」这类动作 → 强制 mood，钉成「想去」心情便签。
  if (/(想去|想再去|好想去|超想去|打算去|计划去|准备去|种草)(?![看吃喝玩做听买找逛])/.test(t)) domain = 'mood';

  if (domain === 'movie') {
    const d = await runMovieAgent({ kind: imageDataUrl ? 'image' : 'text', text: t, imageDataUrl }, onPhase ? (p, d) => onPhase(p, d) : undefined);
    if (!d) return { domain, ok: false, title: '', where: '', note: '没认出影片，换种说法、或去 movies-agent 手填', confirm: NO_PIN };
    return { domain, ok: true, needPlace: d.needPlace, title: d.title, where: d.geo ? `${MOVIE_GEO[d.geo.kind]}·${d.geo.place}` : '待补国家', note: d.needPlace ? '认出了，但还没定位到地点 —— 去 movies-agent 补国家后可钉' : '', rating: d.tags.userRating, movieDraft: d, confirm: () => confirmMovie(d) };
  }
  if (domain === 'book') {
    const d = await runBookAgent({ kind: imageDataUrl ? 'image' : 'text', text: t, imageDataUrl }, onPhase ? (p, d) => onPhase(p, d) : undefined);
    if (!d) return { domain, ok: false, title: '', where: '', note: '没认出书，换种说法、或去 books-agent 手填', confirm: NO_PIN };
    return { domain, ok: true, needPlace: d.needPlace, title: d.title, where: d.geo ? `${BOOK_GEO[d.geo.kind]}·${d.geo.place}` : '待补国家', note: d.needPlace ? '认出了，但还没定位到地点 —— 去 books-agent 补国家后可钉' : '', rating: d.tags.userRating, bookDraft: d, confirm: () => confirmBook(d) };
  }
  if (domain === 'travel') {
    onPhase?.('定位行程地点', 'resolvePlace 本地→Mapbox');
    // 用云脑抽出的规范地名查坐标，整句兜底——整句会把「看了波拉尼奥想去」这类噪声喂进地理编码器，
    // 实测会把「圣地亚哥」从智利首都[-70.6,-33.4]拽到哥伦比亚同名小镇[-77,1.1]（钉错洲、目的地方向找不到）。
    const geo = await resolvePlace(placeHint || t);
    if (!geo) return { domain, ok: false, title: '', where: '', note: '没认出地点，写清城市名再试', confirm: NO_PIN };
    return {
      domain, ok: true, title: geo.place, where: geo.place, note: '记为去过的一段行程',
      confirm: async () => { const res = await pinManualStop({ city: geo.place, note: t.slice(0, 40), lng: geo.lng, lat: geo.lat }); return { pinned: res.ok, reason: res.reason }; },
    };
  }
  // mood：含 地点 / 随手想法 / 音乐感想 等一切兜底
  onPhase?.('判地点 + 情绪', '云脑判情绪');
  const r = await analyzeMood(t, FALLBACK);
  let place = r.place, lng = r.lng, lat = r.lat;
  // 本地字典没收录的地名（如圣地亚哥）会落到兜底「此处」——用云脑抽的规范地名走 resolvePlace 全球定位补救，钉对真实城市
  const hint = placeHint || r.rawPlace;
  if (place === '此处' && hint) {
    onPhase?.('全球定位地点', 'resolvePlace 本地→Mapbox');
    const geo = await resolvePlace(hint).catch(() => null);
    if (geo) { place = geo.place; lng = geo.lng; lat = geo.lat; }
  }
  return {
    domain: 'mood', ok: true, title: `${MOOD_TONES[r.tone].label} · ${t.slice(0, 12)}`, where: place === '此处' ? '未定位 · 暂落地图' : place, note: '记为一条心情贴',
    confirm: async () => {
      const id = 'mood-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);   // 加随机尾，免同毫秒撞 id → React key 重复 / removeMoodSticker 误删两条
      addMoodSticker({ id, lat, lng, text: t, place, color: MOOD_TONES[r.tone].color, rot: pickRot(id), tone: r.tone });
      if (place !== '此处') requestMapFocus(lng, lat);   // 钉完让地图自动飞到落点 + 放大到便签可见（未定位的西湖兜底不飞）
      return { pinned: true };
    },
  };
}
