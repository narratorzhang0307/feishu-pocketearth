// 主题星球 agent 逻辑：中文主题 → Unsplash 英文检索词（+纬度带）→ 抓图 → 按主题落点 → 组装一颗星球。
// 解析走「本地词典 → 端侧模型 → 原样」瀑布；落点走「主题纬度带 + 大陆经度锚 + id 确定性散开」，
// 让每颗星球落得像有意为之、且按主题分布（日落在暖带、极光在高纬），刷新不抖动。

import { edgeSafe } from '../../../frost-agent/edge/contract';
import type { PlanetPhoto } from './planets';
import { photoPoints } from './photos';

export interface ThemeParse { query: string; band: [number, number] }

// 词典：中文主题 → 英文检索词 + 纬度带（lat 区间）。新增主题改这一处数据即可。
const THEME_DICT: { match: string[]; query: string; band: [number, number] }[] = [
  { match: ['日落', '黄昏', '夕阳'], query: 'golden hour sunset coast', band: [-35, 38] },
  { match: ['日出', '清晨', '黎明'], query: 'sunrise dawn horizon', band: [-30, 42] },
  { match: ['鸟', '飞鸟', '候鸟'], query: 'wild birds in nature', band: [20, 62] },
  { match: ['极光'], query: 'aurora borealis night sky', band: [56, 72] },
  { match: ['雪', '雪山', '冬'], query: 'snow mountain winter', band: [38, 70] },
  { match: ['沙漠'], query: 'desert dunes sand', band: [12, 35] },
  { match: ['海', '海洋', '大海'], query: 'ocean waves seascape', band: [-40, 45] },
  { match: ['森林', '树林'], query: 'deep forest woodland', band: [28, 60] },
  { match: ['花', '花海'], query: 'wildflowers blossom field', band: [22, 55] },
  { match: ['星空', '银河', '星'], query: 'milky way starry night', band: [-30, 45] },
  { match: ['城市夜景', '夜景', '霓虹', '赛博'], query: 'city skyline night neon', band: [18, 55] },
  { match: ['雨', '雨天'], query: 'rainy moody street', band: [15, 55] },
  { match: ['秋', '秋叶', '枫'], query: 'autumn foliage golden leaves', band: [32, 60] },
  { match: ['樱花'], query: 'cherry blossom sakura', band: [28, 42] },
  { match: ['灯塔'], query: 'lighthouse coastline cliff', band: [33, 60] },
  { match: ['山', '山脉', '高山'], query: 'mountains landscape peaks', band: [25, 62] },
  { match: ['猫'], query: 'cat kitten', band: [-30, 55] },
  { match: ['咖啡'], query: 'coffee cafe', band: [-20, 55] },
  { match: ['雾', '云海'], query: 'fog mist clouds valley', band: [10, 58] },
];

const stripDecor = (s: string) => s.replace(/星球|世界|主题|之|的|风光|系列/g, '').trim();

// 中文主题 → {英文 query, 纬度带}。词典优先，未命中走端侧翻译，再不行原样。
export async function parseTheme(themeZh: string): Promise<ThemeParse> {
  const core = stripDecor(themeZh) || themeZh.trim();
  for (const e of THEME_DICT) if (e.match.some((m) => core.includes(m))) return { query: e.query, band: e.band };
  // 端侧翻译（edgeSafe.chat；stub/失败时返回空串，安全降级）
  try {
    const out = await edgeSafe.chat(core, {
      system: '把中文摄影主题翻译成 2-4 个英文 Unsplash 检索关键词，只输出关键词本身，小写，不要标点和解释。',
    });
    const cleaned = (out || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
    if (cleaned) return { query: cleaned, band: [-50, 60] };
  } catch { /* 降级 */ }
  return { query: core, band: [-50, 60] };
}

// 大陆经度/纬度锚点（粗粒度大陆中心），落点吸附到这些点附近 → 避免点掉进大洋正中
const ANCHORS: [number, number][] = [
  [-122, 38], [-96, 40], [-79, 40], [-106, 56], [-19, 64], [-58, -20], [-70, -35],
  [-3, 51], [10, 48], [18, 60], [15, 41], [37, 55], [100, 62], [-8, 32], [18, 0],
  [28, -26], [45, 30], [77, 22], [104, 35], [110, 1], [138, 37], [151, -33], [174, -41],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clampLat = (x: number) => Math.max(-78, Math.min(78, x));

// 按主题纬度带 + 大陆锚 + id 散开，给一张照片确定性落点
function placePhoto(band: [number, number], id: string): [number, number] {
  const inBand = ANCHORS.filter(([, lat]) => lat >= band[0] - 10 && lat <= band[1] + 10);
  const pool = inBand.length ? inBand : ANCHORS;
  const h = hash(id);
  const [alng, alat] = pool[h % pool.length];
  const dlng = (((h >>> 8) & 0xffff) / 0xffff - 0.5) * 16;   // ±8°
  const dlat = (((h >>> 20) & 0xfff) / 0xfff - 0.5) * 10;    // ±5°
  return [alng + dlng, clampLat(Math.max(band[0], Math.min(band[1], alat + dlat)))];
}

interface RawPhoto { id: string; thumb: string; full: string; alt: string; author: string; authorUrl: string; link: string; color: string; downloadLocation: string }

// 抓图 + 落点，返回带坐标的 PlanetPhoto 列表
export async function fetchPlanetPhotos(query: string, band: [number, number], count = 24): Promise<{ photos: PlanetPhoto[]; error?: string }> {
  let data: { photos?: RawPhoto[]; error?: string };
  try {
    const r = await fetch(`/api/unsplash?query=${encodeURIComponent(query)}&count=${count}`);
    data = await r.json();
  } catch (e) {
    return { photos: [], error: 'network' };
  }
  if (data.error) return { photos: [], error: data.error };
  const raw = data.photos || [];
  if (!raw.length) return { photos: [], error: 'empty' };
  const photos: PlanetPhoto[] = raw.map((p) => {
    const [lng, lat] = placePhoto(band, p.id);
    return { id: p.id, thumb: p.thumb, full: p.full, alt: p.alt, author: p.author, authorUrl: p.authorUrl, link: p.link, color: p.color, downloadLocation: p.downloadLocation, lat, lng };
  });
  return { photos };
}

// 舱壁降级：Unsplash 不可用（无密钥/额度用尽/离线）时，用本地世界照片库凑一颗星球——
// 主题图像虽不精准，但「失败要有 fallback、要看得见」，好过一个死错误。落点仍按主题纬度带散开。
export function localPlanetPhotos(band: [number, number], count = 24): PlanetPhoto[] {
  const pool = photoPoints.filter((p) => p.thumb && p.full);
  const within = (lat: number) => lat >= band[0] - 12 && lat <= band[1] + 12;
  const ordered = [...pool.filter((p) => within(p.lat)), ...pool.filter((p) => !within(p.lat))].slice(0, count);
  return ordered.map((p) => {
    const id = 'local-' + p.id;
    const [lng, lat] = placePhoto(band, id);
    return { id, thumb: p.thumb!, full: p.full!, alt: p.city || '', author: p.author || '', authorUrl: p.authorLink || '', link: p.photoLink || '', color: '#2a2a2a', downloadLocation: '', lat, lng };
  });
}

const UTM = '?utm_source=pocket_earth&utm_medium=referral';
export const withUtm = (url: string) => (url ? url + (url.includes('?') ? '&' : '') + UTM.slice(1) : url);

// 看大图时触发 Unsplash 合规埋点（fire-and-forget）
export function trackDownload(downloadLocation: string) {
  if (!downloadLocation) return;
  fetch(`/api/unsplash?track=${encodeURIComponent(downloadLocation)}`).catch(() => {});
}
