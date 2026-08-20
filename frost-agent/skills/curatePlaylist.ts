// 可复用 Skill · 调度歌曲（curate playlist）
// 把「按方向锚点从全量曲库调度一份歌单」抽成一个独立、可直接调用的 skill：
//   云脑选曲 + 写每首贴合理由；云不可用则跨城兜底。
// 任何 agent / 场景都能 `import { curatePlaylist }` 直接调用——不必走整套 router，也不复制选曲逻辑。
// open-dj-director 现在只是它的一个调用方（intent=open_dj 的适配壳）。
import { RADIO_CITIES } from '../harness/domain';
import { PlaylistEntry, ChatTurn } from '../harness/types';
import { getFrostBrain } from '../harness/brain';
import { cleanVoice, HUMAN_VOICE } from '../harness/persona';
import { formatHistory } from '../harness/memory';

// 候选曲库：全量摊平（每首都带城市标签）。每城只取前 2 首时，"放日本的音乐"这种按国家/风格点歌
// 就只能看到东京/大阪的头两首、凑不出像样歌单——放宽到全量，让大脑能真正按国家/城市/风格/心情策展。
interface Candidate { id: string; title: string; artist: string; city: string }
const candidates = (): Candidate[] => RADIO_CITIES.flatMap((c) =>
  c.tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, city: c.cityNameZh }))
);
const trackLookup = () => new Map(
  RADIO_CITIES.flatMap((c) => c.tracks.map((t) => [t.id, { title: t.title, artist: t.artist, cityNameZh: c.cityNameZh }] as const))
);

// 从用户这句话里提取「方向锚点」（国家 / 地域 / 风格 / 心情 / 文学），供选曲 prompt 与思考痕迹用。
export function extractAnchor(text: string): string {
  const m: [RegExp, string][] = [
    // 国家 / 地域
    [/日本|日语|日文/, '日本'], [/韩国|韩语|韩文/, '韩国'], [/法国|法语/, '法国'], [/欧洲/, '欧洲'],
    [/拉丁|拉美|拉美洲/, '拉丁'], [/非洲/, '非洲'], [/印度/, '印度'], [/中东/, '中东'],
    // 风格流派
    [/爵士|jazz/i, '爵士'], [/嘻哈|说唱|hip ?hop|rap/i, '嘻哈'], [/民谣|folk/i, '民谣'],
    [/电子|electronic|techno|house/i, '电子'], [/摇滚|rock/i, '摇滚'], [/古典/, '古典'], [/金属|metal/i, '金属'],
    // 心情 / 场景 / 文学锚点
    [/慵懒|松弛|放松|chill/i, '慵懒'], [/伤感|悲伤|难过|emo/i, '伤感'], [/兴奋|嗨|燃|带劲/, '高能'],
    [/海明威/, '海明威'], [/马尔克斯/, '马尔克斯'], [/博尔赫斯/, '博尔赫斯'], [/村上/, '村上春树'],
    [/失眠|睡不着|深夜/, '失眠'], [/海边|海岸/, '海边'], [/异乡|想家|漂泊/, '漂泊'],
    [/老电影|电影/, '电影感'], [/开车|自驾|公路/, '公路'], [/上班|工作|专注/, '专注'], [/读|看书|小说/, '阅读'],
  ];
  for (const [re, tag] of m) if (re.test(text)) return tag;
  return text.slice(0, 8) || '今夜';
}

function buildPrompt(text: string, anchor: string, history: string, pool: Candidate[]): string {
  const lib = pool.map((c) => `${c.id} | ${c.title} — ${c.artist} · ${c.city}`).join('\n');
  return [
    '你是 Frost（弗洛斯特），深夜电台的开放式 DJ。声音冷静克制、带黄昏与远方，不像产品说明。',
    history,
    `用户请求：${text}`,
    `这次的方向锚点：「${anchor}」——据此判断 ta 想听的国家 / 地域 / 风格 / 心情，围绕它选歌。`,
    '注意："放 / 放下 / 放一下 / 来点 / 放首 + 某类音乐" 都表示「想听这类音乐」（"放下日本的音乐"="放一下日本的音乐"，是想听、不是想舍弃）。',
    '',
    '可选曲库（格式：trackId | 歌名 — 歌手 · 城市）：',
    lib,
    '',
    '若用户点名了国家 / 地域 / 城市 / 风格（如"日本""欧洲""爵士""慵懒"），只从对应的歌里挑——城市标签能帮你判断国家与地域（如东京·大阪=日本，巴黎·马赛=法国/欧洲）；歌手名能帮你判断风格。挑不满也别硬塞不相干的。',
    '请从中挑 5-8 首最贴合用户场景/心情/文学锚点的歌，按"进入状态→展开→收束"排列。',
    '为每首写一段推荐理由 note（80-150 字，不要超过 150 字）：',
    '  · 先落到这首歌本身——它的质感、年代、城市气质，或一句代表性的歌词/段落；',
    '  · 再用 DJ 的口吻把它和用户这次说的话呼应起来，说清它为什么此刻贴合。',
    '  要具体、有画面感、像深夜 DJ 在跟你低声介绍，不要套话、不要"已接入OSS"这类系统话术。',
    HUMAN_VOICE,
    '只能用上面出现过的 trackId。返回严格 JSON：',
    '{"reply":"80-160字，用 Frost 声音说明这份策展方向","picks":[{"trackId":"...","note":"80-150字推荐理由"}]}',
  ].join('\n');
}

function crossCityFallback(limit = 7): PlaylistEntry[] {
  const picks: PlaylistEntry[] = [];
  for (const c of RADIO_CITIES) {
    const t = c.tracks[0];
    if (!t) continue;
    picks.push({ trackId: t.id, title: t.title, artist: t.artist, cityNameZh: c.cityNameZh, note: '' });
    if (picks.length >= limit) break;
  }
  return picks;
}

export interface CuratePlaylistInput { text: string; history?: ChatTurn[] }
export interface CuratePlaylistResult {
  anchor: string;            // 提取到的方向锚点（日本 / 爵士 / 失眠 …）
  reply: string;             // Frost 口吻的策展说明
  playlist: PlaylistEntry[]; // 选出的歌（含每首贴合理由 note）
  viaLLM: boolean;           // true = 云脑精选；false = 跨城兜底
}

// 调度一份歌单。输入只要一句话（+ 可选对话历史），输出锚点 / 说明 / 歌单。
// 这是「调度歌曲」能力的唯一实现，供 open-dj-director 等任意调用方复用。
export async function curatePlaylist(input: CuratePlaylistInput): Promise<CuratePlaylistResult> {
  const text = (input.text || '').trim();
  const anchor = extractAnchor(text);
  const pool = candidates();
  const lookup = trackLookup();

  // 云「写」：从全候选里精选并写每首贴合理由
  let raw = '';
  try { raw = (await getFrostBrain().complete(buildPrompt(text, anchor, formatHistory(input.history), pool), { json: true })).trim(); } catch { raw = ''; }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { reply?: string; picks?: { trackId: string; note?: string }[] };
      const playlist: PlaylistEntry[] = (parsed.picks || [])
        .map((p): PlaylistEntry | null => { const m = lookup.get(p.trackId); return m ? { trackId: p.trackId, title: m.title, artist: m.artist, cityNameZh: m.cityNameZh, note: cleanVoice((p.note || '').trim()) } : null; })
        .filter((x): x is PlaylistEntry => !!x);
      if (playlist.length >= 3) {
        return { anchor, reply: cleanVoice(parsed.reply || '') || '为你排好了。', playlist, viaLLM: true };
      }
    } catch { /* 落到 fallback */ }
  }

  // 云不可用 → 跨城兜底
  return {
    anchor,
    reply: `可以。我把「${anchor}」当成这次歌单的场景锚点来排：先抓住它的速度、空间和情绪，再把歌曲按进入状态、展开、收束放好。`,
    playlist: crossCityFallback(7),
    viaLLM: false,
  };
}
