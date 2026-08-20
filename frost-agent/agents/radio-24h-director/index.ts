// 24H 电台编排官 · 纯本地综合判断（无后端）。
// 把「现在 → 午夜」沿日落线经过的城市逐座排开，每座城从它的六七首里挑最贴此刻心境的一首，
// 并写出理由。全程留下可见的「思考痕迹」（含 skill 调用），用来证明这是一次 agent 的综合判断。
import { RadioCity, RadioTrack } from '../../harness/domain';

const SUNSET_MIN = 18 * 60 + 30; // 当地 18:30 视为日落

// ── 小时间工具（与 tour-director 同源，保持本文件自洽） ──
function localMinutes(city: RadioCity, now: Date): number {
  if (city.ianaTz) {
    try {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: city.ianaTz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
      const h = parseInt(p.find((x) => x.type === 'hour')!.value, 10);
      const m = parseInt(p.find((x) => x.type === 'minute')!.value, 10);
      return h * 60 + m;
    } catch { /* fall through */ }
  }
  const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  return ((utc + city.tzOffset * 60) % 1440 + 1440) % 1440;
}
const forwardTo = (from: number, to: number) => ((to - from) % 1440 + 1440) % 1440;
const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ── 节目表数据结构 ──
export interface SongPick {
  trackId: string;
  title: string;
  artist: string;
  reason: string;          // 为什么这首贴此刻心境（展开时逐首显示）
}

export interface ProgramSlot {
  rank: number;
  slug: string;
  cityNameZh: string;
  cityName: string;
  freq: number;
  cover: string;
  userClock: string;       // 你这边：这座城沉入夜色的时刻
  cityLocalClock: string;  // 城市当地日落时刻（≈18:30）
  durationMin: number;
  songs: SongPick[];       // 该城为此刻心境挑的一组歌（数量随契合度多寡变化）
}

export interface DayProgram {
  bjTime: string;          // 北京时间（skill）
  weather: string;         // 杭州天气（skill）
  profile: string;         // 长期记忆里的"你"（skill）
  mood: string;            // 近期对话里读出的心境
  todayPlan: string;       // 推断的今日安排
  endClock: string;        // 排到几点（午夜）
  trace: string[];         // 思考痕迹（含 skill 调用），UI 以终端风格呈现
  reply: string;           // Frost 声音开场白
  slots: ProgramSlot[];
}

// ── skills（demo：北京时间真实，其余为占位的"长期记忆/天气/心境/安排"） ──
function skillBeijingTime(now: Date): string {
  try {
    const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).formatToParts(now);
    const wd = p.find((x) => x.type === 'weekday')?.value || '';
    const map: Record<string, string> = { Sun: '周日', Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六' };
    return `${t}·${map[wd] || ''}`;
  } catch { return `${fmt(now.getHours() * 60 + now.getMinutes())}·${WEEK[now.getDay()]}`; }
}
function skillHangzhouWeather(now: Date): string {
  const pool = ['多云转晴 18° · 风很轻', '微雨初歇 16° · 空气是湿的', '晚晴 20° · 江风从西边来', '薄云 17° · 月色压得很低'];
  return pool[(now.getDate() + now.getHours()) % pool.length];
}
function skillUserMemory(): string {
  return 'momo：写字的人，偏爱深夜、旧唱片与海，怕吵，习惯一个人把夜熬到很沉';
}
interface Mood { word: string; keywords: string[] }
function skillRecentMood(now: Date): Mood {
  const pool: Mood[] = [
    { word: '松弛里带着一点想出走', keywords: ['出走', '远', '路', '海', '自由', '风', '夜', '光', '走', '漂'] },
    { word: '安静、想把世界关小一点', keywords: ['安静', '孤', '夜', '慢', '旧', '雨', '低', '空', '一个人', '沉'] },
    { word: '有点想念某个人', keywords: ['想念', '爱', '旧', '回', '梦', '光', '夜', '温', '等', '远'] },
  ];
  return pool[now.getDate() % pool.length];
}
function skillTodayPlan(): string {
  return '刚收工，把接下来的夜晚交给耳朵';
}

// 一首歌对此刻心境的契合度：心境关键词在 标题/歌手/解说稿 里的命中。
function moodHits(t: RadioTrack, mood: Mood): string[] {
  const hay = `${t.title} ${t.artist} ${t.introText || ''}`;
  return mood.keywords.filter((k) => hay.includes(k));
}

const SONG_FIT = [
  (hit?: string) => (hit ? `这首里的「${hit}」正接住此刻——` : `它的呼吸贴着你此刻的心境——`),
  (hit?: string) => (hit ? `挑它，是为了那点「${hit}」——` : `挑它，是它的低声刚好——`),
  (hit?: string) => (hit ? `「${hit}」这一下，正是今晚想要的——` : `它的节奏和你今晚同频——`),
];

// 单首歌的理由：一句心境契合 + 该曲解说稿的第一句（够具体、不冗长）。
function songReason(t: RadioTrack, hits: string[], i: number): string {
  const fit = SONG_FIT[i % SONG_FIT.length](hits[0]);
  const intro = (t.introText || '').replace(/\s+/g, ' ').trim();
  const firstSent = intro.split(/(?<=[。！？])/)[0] || intro;
  const body = firstSent.slice(0, 80) || `${t.title} 来自 ${t.artist}`;
  return `${fit}${body}`;
}

// 该城为此刻心境挑一组歌：命中心境的都收（多寡随契合度），至少 1 首、至多 5 首。
function pickSongs(city: RadioCity, mood: Mood): SongPick[] {
  const scored = city.tracks
    .map((t) => ({ t, hits: moodHits(t, mood) }))
    .sort((a, b) => b.hits.length - a.hits.length);
  const matched = scored.filter((s) => s.hits.length > 0);
  const chosen = (matched.length ? matched : scored.slice(0, 1)).slice(0, 5);
  return chosen.map((s, i) => ({ trackId: s.t.id, title: s.t.title, artist: s.t.artist, reason: songReason(s.t, s.hits, i) }));
}

/**
 * 一键综合编排：从现在到午夜，沿日落线把城市逐座排开，逐城择歌、写明理由，并留下思考痕迹。
 * 纯本地、确定性，作为 agent 综合判断的 demo 呈现。
 */
export function buildDayProgram(cities: RadioCity[], now: Date = new Date()): DayProgram {
  const bjTime = skillBeijingTime(now);
  const weather = skillHangzhouWeather(now);
  const profile = skillUserMemory();
  const mood = skillRecentMood(now);
  const todayPlan = skillTodayPlan();

  const userNow = now.getHours() * 60 + now.getMinutes();
  // 现在 → 午夜（本地 24:00）之间日落的城市，按先后排序
  const ranked = cities
    .filter((c) => c.tracks.length > 0)
    .map((c) => ({ city: c, mts: forwardTo(localMinutes(c, now), SUNSET_MIN) }))
    .sort((a, b) => a.mts - b.mts);
  let inWindow = ranked.filter((r) => userNow + r.mts <= 1440); // 午夜前
  if (inWindow.length < 5) inWindow = ranked.slice(0, 8);       // 兜底：至少排一段
  inWindow = inWindow.slice(0, 10);                             // 封顶：最多 10 座城（凌晨时窗口会很大）

  const endClock = '00:00';
  const slots: ProgramSlot[] = inWindow.map((r, i) => {
    const next = inWindow[i + 1];
    const userSunset = userNow + r.mts;
    const gap = next ? next.mts - r.mts : Math.max(8, 1440 - userSunset);
    return {
      rank: i + 1,
      slug: r.city.slug,
      cityNameZh: r.city.cityNameZh,
      cityName: r.city.cityName,
      freq: r.city.station.freq,
      cover: r.city.cover,
      userClock: fmt(userSunset % 1440),
      cityLocalClock: fmt(SUNSET_MIN),
      durationMin: Math.max(8, Math.round(gap)),
      songs: pickSongs(r.city, mood),
    };
  });

  const trace = [
    'Router → Frost 电台编排官',
    `skill·北京时间 → 现在 ${bjTime}`,
    `skill·杭州天气 → 今夜${weather}`,
    `skill·长期记忆 → ${profile}`,
    `读最近对话 → 今日心境：${mood.word}`,
    `推断今日安排 → ${todayPlan}`,
    `取日落线 → 从 ${fmt(userNow)} 到 ${endClock}，共 ${slots.length} 座城将依次沉入夜色`,
    `逐城择歌 → 按此刻心境给每座城挑一组歌（多寡随契合度），逐首写明理由`,
    '编排完成 → 节目表已生成，可整段播放，或从任意一城进入',
  ];

  const reply = `我查了北京时间 ${bjTime}，也望了眼杭州的天——${weather}。照你最近的样子，今晚是${mood.word}。于是我顺着日落线，从现在排到午夜，每座城沉进夜色时，都为你留了一首最贴此刻的歌。`;

  return { bjTime, weather, profile, mood: mood.word, todayPlan, endClock, trace, reply, slots };
}
