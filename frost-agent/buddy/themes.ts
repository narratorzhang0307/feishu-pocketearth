// FROST buddy · 主题换装形态（由多 agent 设计 + 对抗复核 + 归一生成，请勿手改）
// 引擎与基底逐帧同构：每个主题 = 一组等宽字符 pose + SEQ + div + 粒子。
// 装备「加在方盒上」，仍保留 FROST 识别（穹顶 .-~-. + 方眼 + 盒壁 [ ]）。
// 据当前聊天主题自动换装：聊音乐戴耳机、聊电影戴眼镜、看书捧书、造星球戴盔……
import type { StateDef } from './poses';

export type FrostTheme = 'none' | 'music' | 'movie' | 'book' | 'photo' | 'travel' | 'cosmos' | 'mood' | 'culture';

export const THEME_LABEL: Record<Exclude<FrostTheme, 'none'>, string> = { music: "LISTENING", movie: "WATCHING", book: "READING", photo: "FRAMING", travel: "ROAMING", cosmos: "STARGAZING", mood: "MUSING", culture: "NARRATING" };

export const THEMES: Partial<Record<FrostTheme, StateDef>> = {
  music: {
    div: 2, particle: 'snow',
    poses: [
      { name: "REST", lines: ["   .---.     ", "   .-~-.     ", " ([.::::.])  ", "  [ o  o ]   ", "  [ ---- ]   ", "   `----`    "] },
      { name: "BREATHE", lines: ["   .---.     ", "   .-~-.     ", " ([.::::.])  ", "  [ o  o ]   ", "  [ ---- ]   ", "  `------`   "] },
      { name: "BLINK", lines: ["   .---.     ", "   .-~-.     ", " ([.::::.])  ", "  [ -  - ]   ", "  [ ---- ]   ", "   `----`    "] },
      { name: "HUM_R", lines: ["   .---.    o", "   .-~-.   / ", " ([.::::.])  ", "  [ o  o ]   ", "  [ -==- ]   ", "   `----`    "] },
      { name: "HUM_L", lines: ["o  .---.     ", " \\ .-~-.     ", " ([.::::.])  ", "  [ o  o ]   ", "  [ -==- ]   ", "   `----`    "] },
    ],
    seq: [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 0, 4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0],
  },
  movie: {
    div: 7, particle: 'snow',
    poses: [
      { name: "idle_a", lines: ["    .-~-.     ", "   [.:::.]    ", "  -[o][o]-    ", "   [ ---- ]   ", "   `------`   ", "      *.      "] },
      { name: "idle_b_breath", lines: ["    .-~-.     ", "   [.:::.]    ", "  =[o][o]=    ", "   [ ---- ]   ", "  `-------`   ", "     .*.      "] },
      { name: "blink", lines: ["    .-~-.     ", "   [.:::.]    ", "  -[-][-]-    ", "   [ ---- ]   ", "   `------`   ", "      *.      "] },
      { name: "reel_flicker", lines: ["    .-~-.     ", "   [.:::.]    ", "  -[o][o]-    ", "   [ ---- ]   ", "   `-=--=-`   ", "      *.      "] },
    ],
    seq: [0, 0, 1, 0, 0, 0, 3, 0, 1, 0, 2, 0, 0, 1, 0],
  },
  book: {
    div: 1, particle: 'snow',
    poses: [
      { name: "READ", lines: ["    .-~-.    ", "   [.:::.]   ", "   [ v  v ]  ", "   [ ---- ]  ", "   `------`  ", "  \\__/^\\__/  "] },
      { name: "BREATHE", lines: ["    .-~-.    ", "   [.:::.]   ", "   [ v  v ]  ", "   [ ---- ]  ", "  `--====--` ", "  \\__/^\\__/  "] },
      { name: "BLINK", lines: ["    .-~-.    ", "   [.:::.]   ", "   [ -  - ]  ", "   [ ---- ]  ", "   `------`  ", "  \\__/^\\__/  "] },
      { name: "TURN", lines: ["    .-~-.    ", "   [.:::.]   ", "   [ v  v ]  ", "   [ ---- ]  ", "   `------`  ", "  \\__/^/__/  "] },
      { name: "DOWNCAST", lines: ["    .-~-.    ", "   [.:::.]   ", "   [ .  . ]  ", "   [ ---- ]  ", "   `------`  ", "  \\__/^\\__/  "] },
      { name: "FLAKE", lines: ["    .-~-.  * ", "   [.:::.]   ", "   [ v  v ]  ", "   [ ---- ]  ", "   `------`  ", "  \\__/^\\__/  "] },
    ],
    seq: [0, 0, 0, 3, 0, 0, 1, 0, 0, 2, 0, 0, 0, 3, 0, 0, 4, 0, 0, 1, 0, 0, 3, 0, 0, 0, 2, 0, 0, 3, 0, 4, 0, 0, 1, 0, 0, 5, 0, 3],
  },
  photo: {
    div: 2, particle: 'snow',
    poses: [
      { name: "IDLE", lines: ["  .-~-.      ", "        .    ", " [.:::.]     ", " [ o o] [O]  ", " [ ----] `-` ", "  `----`     "] },
      { name: "BREATHE", lines: ["  .-~-.      ", "        .    ", " [.:::.]     ", " [ o o] [O]  ", " [ ----] `-` ", " `------`    "] },
      { name: "AIM", lines: ["  .-~-.      ", "        .    ", " [.:::.]     ", " [ o o] [O]  ", " [ ----] `-` ", "  `----`     "] },
      { name: "BLINK", lines: ["  .-~-.      ", "        .    ", " [.:::.]     ", " [ - -] [O]  ", " [ ----] `-` ", "  `----`     "] },
      { name: "FOCUS", lines: ["  .-~-.      ", "        .    ", " [.:::.]     ", " [ o o] [O]  ", " [ ----] `-` ", "  `----`     "] },
      { name: "SHUTTER", lines: ["  .-~-.   *  ", "        .    ", " [.:::.]     ", " [ o o] [(o] ", " [ ----] `-` ", "  `----`     "] },
    ],
    seq: [0, 0, 0, 2, 0, 0, 3, 0, 4, 5, 0, 0, 1, 0, 0, 0, 2, 0, 0, 4, 5, 0, 0, 0, 3, 0, 0, 0],
  },
  travel: {
    div: 2, particle: 'snow',
    poses: [
      { name: "REST", lines: ["   .____.     ", "  _/.-~-.\\_   ", "  [.:::.]     ", "  [ o  o ]    ", "  [ ---- ]    ", "  `------` (N)"] },
      { name: "BREATHE", lines: ["   .____.     ", "  _/.-~-.\\_   ", "  [.:::.]     ", "  [ o  o ]    ", "  [ ---- ]    ", " `--------`(N)"] },
      { name: "BLINK", lines: ["   .____.     ", "  _/.-~-.\\_   ", "  [.:::.]     ", "  [ -  - ]    ", "  [ ---- ]    ", "  `------` (N)"] },
      { name: "MAP", lines: ["   .____.     ", "  _/.-~-.\\_   ", "  [.:::.] ,--.", "  [ o  o ]|x.|", "  [ ---- ]|./|", "  `------``--'"] },
      { name: "ROUTE", lines: ["   .____.     ", "  _/.-~-.\\_   ", "  [.:::.]     ", "  [  o  o]    ", "  [ ---- ]    ", "  `------` (^)"] },
      { name: "MAP_BREATHE", lines: ["   .____.     ", "  _/.-~-.\\_   ", "  [.:::.] ,--.", "  [ o  o ]|x.|", "  [ ---- ]|./|", " `-------``--'"] },
    ],
    seq: [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 2, 0, 0, 1, 0, 0, 3, 5, 3, 0, 0, 1, 0, 0, 2, 0, 4, 0, 0, 1, 0, 0, 0, 2, 0],
  },
  cosmos: {
    div: 2, particle: 'snow',
    poses: [
      { name: "HELM_REST", lines: ["   .-\"\"-.    ", "  ( .--. )   ", " ([ .:::. ]) ", " ([ o   o ]) ", " ([ ----- ]) ", "  `-.__.-`   "] },
      { name: "HELM_BREATHE", lines: ["   .-~~-.    ", "  ( .--. )   ", " ([ .:::. ]) ", " ([ o   o ]) ", " ([ ----- ]) ", " `-.____.-`  "] },
      { name: "HELM_BLINK", lines: ["   .-\"\"-.    ", "  ( .--. )   ", " ([ .:::. ]) ", " ([ -   - ]) ", " ([ ----- ]) ", "  `-.__.-`   "] },
      { name: "ANTENNA_STAR", lines: ["   .-*\"-.    ", "  ( .--. )   ", " ([ .:::. ]) ", " ([ o   o ]) ", " ([ ----- ]) ", "  `-.__.-`   "] },
      { name: "ORBIT_R", lines: ["   .-\"\"-. *  ", "  ( .--. )   ", " ([ .:::. ]) ", " ([ o   o ]) ", " ([ ----- ]) ", "  `-.__.-`   "] },
      { name: "ORBIT_L", lines: [" *  .-\"\"-.   ", "  ( .--. )   ", " ([ .:::. ]) ", " ([ o   o ]) ", " ([ ----- ]) ", "  `-.__.-`   "] },
    ],
    seq: [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 1, 0, 0, 2],
  },
  mood: {
    div: 3, particle: 'snow',
    poses: [
      { name: "MUSE", lines: ["      ( . . ) ", "   .-~-.      ", "  [.:::.]     ", "  [ o  o ]    ", "  [ ---- ]    ", "  `------`    "] },
      { name: "BREATHE", lines: ["              ", "   .-~-.      ", "  [.:::.]     ", "  [ o  o ]    ", "  [ ---- ]    ", " `--------`   "] },
      { name: "BLINK", lines: ["      ( . . ) ", "   .-~-.      ", "  [.:::.]     ", "  [ -  - ]    ", "  [ ---- ]    ", "  `------`    "] },
      { name: "WONDER", lines: ["      ( ? )   ", "   .-~-.      ", "  [.:::.]     ", "  [ o  o ]    ", "  [ ---- ]    ", "  `------`    "] },
      { name: "TENDER", lines: ["       <3     ", "   .-~-.      ", "  [.:::.]     ", "  [ ^  ^ ]    ", "  [ ---- ]    ", "  `------`    "] },
      { name: "DRIFT", lines: ["       ( . . )", "   .-~-.      ", "  [.:::.]     ", "  [ o  o ]    ", "  [ ---- ]    ", "  `------`    "] },
    ],
    seq: [0, 4, 0, 3, 0, 1, 0, 2, 0, 4, 0, 0, 3, 0, 5, 0, 2, 0, 4, 0, 3, 0, 0, 1, 0, 2, 0, 4, 0, 3, 0, 1, 0, 0, 5, 0, 4, 0, 3, 0, 2, 0, 1, 0, 0, 3],
  },
  culture: {
    div: 7, particle: 'snow',
    poses: [
      { name: "idle_listen", lines: ["   .-~-.      ", "  [.:::.] (o) ", "  [ o  o ]  | ", "  [ ---- ]  | ", "  `------` -+-", "              "] },
      { name: "speak_open", lines: ["   .-~-.      ", "  [.:::.] (o) ", "  [ o  o ]  |)", "  [ ~~~~ ]  |)", "  `------` -+-", "              "] },
      { name: "narrate_wave", lines: ["   .-~-.  (o) ", "  [.:::.]   |)", "  [ o  o ]  |)", "  [ -==- ]  |)", "  `------` -+-", "              "] },
      { name: "blink_speak", lines: ["   .-~-.      ", "  [.:::.] (o) ", "  [ -  - ]  |)", "  [ ~~~~ ]  |)", "  `------` -+-", "              "] },
      { name: "breathe_out", lines: ["   .-~-.      ", "  [.:::.] (o) ", "  [ o  o ]  | ", "  [ ---- ]  | ", " `--------`-+-", "              "] },
    ],
    seq: [0, 0, 1, 2, 1, 0, 4, 0, 1, 2, 3, 1, 0, 0, 4],
  },
};

// —— 主题识别：关键词 + runFrost 意图 → 主题 ——
const THEME_PRIORITY: FrostTheme[] = ["photo", "movie", "book", "cosmos", "travel", "music", "culture", "mood"];

const THEME_KEYWORDS: Record<string, string[]> = {
  music: ["歌", "歌单", "音乐", "听歌", "听", "曲", "曲子", "专辑", "单曲", "旋律", "节奏", "电台", "DJ", "放首歌", "推首歌", "哼", "耳机", "song", "songs", "music", "playlist", "album", "track", "tune", "listen", "open_dj", "dj", "beat", "vibe", "headphone", "hum"],
  movie: ["电影", "影", "看片", "看电影", "影片", "片子", "导演", "院线", "影院", "电影院", "放映", "胶片", "镜头", "大片", "影评", "shot", "movie", "movies", "film", "films", "cinema", "cinematic", "screening", "director", "reel", "flick", "theater", "theatre"],
  book: ["书", "读", "读书", "看书", "在读", "读完", "读到", "捧书", "翻书", "翻页", "章节", "一本", "小说", "散文", "随笔", "作家", "作者", "文学", "书评", "书单", "藏书", "page", "read", "reading", "book", "books", "novel", "chapter", "author", "literature", "reader", "bookmark", "paperback", "read it", "finished the book"],
  photo: ["照片", "相册", "拍照", "拍一张", "相机", "快门", "影像", "合影", "自拍", "镜头", "取景", "底片", "胶卷", "曝光", "构图", "抓拍", "留影", "photo", "photos", "photograph", "picture", "pic", "camera", "shutter", "snapshot", "snap", "shot", "lens", "album", "capture", "selfie", "frame", "focus"],
  travel: ["旅行", "行程", "去", "路线", "出发", "旅程", "远方", "出门", "探险", "旅游", "去哪", "怎么去", "攻略", "目的地", "自驾", "徒步", "导航", "景点", "机票", "签证", "行李", "背包", "travel", "trip", "tour", "journey", "route", "destination", "itinerary", "explore", "adventure", "navigate", "roadtrip", "wander", "go to", "how to get", "backpack", "flight", "visa"],
  cosmos: ["星球", "星辰", "造星", "天体", "宇宙", "太空", "宇航", "航天", "头盔", "出舱", "星空", "银河", "行星", "卫星", "轨道", "星舰", "玻璃盔", "planet", "planets", "space", "cosmos", "cosmic", "astronaut", "spacesuit", "helmet", "orbit", "galaxy", "star", "stars", "stellar", "celestial", "universe", "spaceship", "regenerate"],
  mood: ["心情", "感觉", "感受", "想", "在想", "想念", "累", "好累", "孤独", "孤单", "想家", "此刻", "情绪", "心事", "发呆", "走神", "有点", "难过", "失落", "安静", "陪我", "聊聊", "随便聊", "mood", "feeling", "feelings", "feel", "thinking", "pensive", "lonely", "tired", "homesick", "wistful", "quiet", "chitchat", "rambling", "musing"],
  culture: ["讲讲", "介绍", "介绍一下", "说说", "讲一下", "为什么", "为啥", "历史", "文化", "这座城", "这个城市", "这座城市", "城市", "这位作家", "这个作家", "背后", "背后的故事", "故事", "由来", "起源", "典故", "讲述", "科普", "聊聊", "tell me about", "introduce", "why", "history", "culture", "city", "this city", "the author", "the writer", "behind", "story", "background", "origin", "explain", "narrate", "lore", "heritage"],
};

const INTENT_THEME: Record<string, FrostTheme> = {
  "open_dj": "music",
  "playlist": "music",
  "music": "music",
  "song": "music",
  "dj": "music",
  "movies": "movie",
  "movie": "movie",
  "film": "movie",
  "cinema": "movie",
  "books": "book",
  "book": "book",
  "read": "book",
  "reading": "book",
  "photos": "photo",
  "photo": "photo",
  "camera": "photo",
  "planet": "cosmos",
  "regenerate": "cosmos",
  "space": "cosmos",
  "astronaut": "cosmos",
  "tour": "travel",
  "travel": "travel",
  "trip": "travel",
  "route": "travel",
  "mood": "mood",
  "chitchat": "mood",
  "feeling": "mood",
  "city_culture": "culture",
  "culture": "culture",
  "history": "culture",
  "narrate": "culture",
};

// 强动作意图：只保留“无关键词可依”的明确动作（跟着日落环游=远行、造星=造星）。
// 不含 open_dj/playlist——它们会为“聊书/聊场景”也建歌单，应让关键词主导内容主题
// （提到书→看书、提到电影→看片、提到歌单→听歌），避免一律判成听歌。
const STRONG_INTENT: Record<string, FrostTheme> = {
  tour: 'travel', regenerate: 'cosmos', planet: 'cosmos',
};

/** 据用户这句话 + runFrost 返回意图判定主题。
 *  ① 强动作意图直接定（建歌单→听歌等）；② 否则按关键词命中、priority 取最具体（电影/书/照片…）；
 *  ③ 都没有再用弱意图兜底（city_culture→讲述、chitchat→想心事）。 */
export function themeFor(text: string, intent?: string): FrostTheme {
  if (intent) {
    const strong = STRONG_INTENT[intent.toLowerCase()];
    if (strong) return strong;
  }
  const lower = (text || '').toLowerCase();
  const hits = new Set<string>();
  for (const th of Object.keys(THEME_KEYWORDS)) {
    if (THEME_KEYWORDS[th].some((k) => lower.includes(k.toLowerCase()))) hits.add(th);
  }
  for (const th of THEME_PRIORITY) {
    if (th !== 'none' && hits.has(th)) return th;
  }
  if (intent) {
    const it = INTENT_THEME[intent.toLowerCase()];
    if (it) return it;
  }
  return 'none';
}
