// 批量观展一键整理 · 数据准备层（照片 → 观展组）。
// 一堆展签/展品照丢进来：逐张读 EXIF（拍摄时间 + GPS，photo 域现成 readExif，原图不出端）→
// GPS 就近归馆（venues.nearestVenue，内建种子 + 用户自定义馆一起算）→ 按「同一天 · 同一馆」聚成观展组。
// 逐张 OCR/补全仍走 runExhibitionAgent 单件流水线（本模块不碰云，只做确定性分组）。
import { readExif } from '../photo/features';
import { nearestVenue } from './venues';

export interface BatchPhoto {
  index: number;
  file: File;
  date: string | null;        // YYYY-MM-DD（EXIF 拍摄时间；readExif 内部已回退文件修改时间）
  time: string | null;        // HH:mm（组内展示/排序）
  lat?: number; lng?: number;
  venueName: string | null;   // GPS → 最近场馆（2km 内），命中即免选馆
  venueKm?: number;
}

export interface BatchVisit {
  key: string;                // `${date}|${venue}`：React key 与选馆回写定位用
  date: string | null;
  venueName: string | null;   // null = 这组还没归到馆，UI 上让用户选
  photos: BatchPhoto[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export function isoDate(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** 逐张读 EXIF + GPS 归馆（串行；单张坏图跳过不拖垮整批）。 */
export async function analyzeBatchPhotos(files: File[]): Promise<BatchPhoto[]> {
  const out: BatchPhoto[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let date: string | null = null;
    let time: string | null = null;
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const ex = await readExif(f);
      if (ex.capDate) { date = isoDate(ex.capDate); time = `${pad(ex.capDate.getHours())}:${pad(ex.capDate.getMinutes())}`; }
      if (ex.hasGPS && !ex.suspectExif && typeof ex.lat === 'number' && typeof ex.lng === 'number') { lat = ex.lat; lng = ex.lng; }
    } catch { /* 无 EXIF：留空，靠同日跟随或人工选馆 */ }
    const near = lat != null && lng != null ? nearestVenue(lat, lng) : null;
    out.push({ index: i, file: f, date, time, lat, lng, venueName: near?.venue.name ?? null, venueKm: near?.km });
  }
  return out;
}

/** 纯函数聚组：同一天 + 同一馆 = 一次观展。
 *  无 GPS 的照片：当天只认出一个馆时跟随它（一天通常逛一个馆——iOS 相册导出常剥 GPS，这条兜底救大多数）；
 *  当天多馆或零馆时单列成「待选馆」组交人工。组间日期降序（最近的观展在最上）。 */
export function groupIntoVisits(photos: BatchPhoto[]): BatchVisit[] {
  const byDate = new Map<string, BatchPhoto[]>();
  for (const p of photos) {
    const d = p.date || '';
    const arr = byDate.get(d);
    if (arr) arr.push(p); else byDate.set(d, [p]);
  }
  const dates = [...byDate.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return b.localeCompare(a);
  });
  const visits: BatchVisit[] = [];
  for (const d of dates) {
    const dayPhotos = byDate.get(d)!;
    const venues = [...new Set(dayPhotos.map((p) => p.venueName).filter((v): v is string => !!v))];
    const follow = venues.length === 1 ? venues[0] : null;
    const byVenue = new Map<string, BatchPhoto[]>();
    for (const p of dayPhotos) {
      const v = p.venueName || follow || '';
      const arr = byVenue.get(v);
      if (arr) arr.push(p); else byVenue.set(v, [p]);
    }
    const names = [...byVenue.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
    for (const v of names) {
      const list = byVenue.get(v)!.slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      visits.push({ key: `${d || '未记日期'}|${v || '待选馆'}`, date: d || null, venueName: v || null, photos: list });
    }
  }
  return visits;
}

/** 给某个观展组回写场馆（用户在组卡上选馆后调用；返回新数组，不改原对象）。 */
export function assignVenue(visits: BatchVisit[], key: string, venueName: string): BatchVisit[] {
  return visits.map((v) => (v.key === key ? { ...v, venueName, key: `${v.date || '未记日期'}|${venueName}` } : v));
}
