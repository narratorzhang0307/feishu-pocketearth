// 观展史聚合（纯函数，无 IO）：把散落的展品记录按「哪天 → 哪馆 → 看了什么」组装成个人观展时间线。
// 与文化层时间轴（按展品创作年代 eraStart 叠压）互补：文化层回答「它们多老」，观展史回答「我什么时候看的」。
// 数据源是 userMarks(kind:'exhibition') 的 meta（visitDate/museum 落点时已写入），此处零新增存储。

export interface VisitItemLite { visitDate?: string; museum?: string }

export interface VenueGroup<T> { museum: string; items: T[] }
export interface VisitDay<T> { date: string; weekday: string; venues: VenueGroup<T>[]; total: number }
export interface VisitSummary { days: number; venues: number; items: number }

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const UNDATED = '未记日期';
export const UNKNOWN_VENUE = '未记场馆';

function weekdayOf(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
}

/** 按观展日期降序 → 天内按场馆分组（保持录入顺序）。无日期的沉到最后一组。 */
export function groupVisits<T extends VisitItemLite>(items: T[]): VisitDay<T>[] {
  const byDate = new Map<string, T[]>();
  for (const it of items) {
    const date = (it.visitDate || '').trim() || UNDATED;
    const arr = byDate.get(date);
    if (arr) arr.push(it); else byDate.set(date, [it]);
  }
  const dates = [...byDate.keys()].sort((a, b) => {
    if (a === UNDATED) return 1;
    if (b === UNDATED) return -1;
    return b.localeCompare(a);   // ISO 日期字符串降序 = 最近在前
  });
  return dates.map((date) => {
    const dayItems = byDate.get(date)!;
    const byVenue = new Map<string, T[]>();
    for (const it of dayItems) {
      const venue = (it.museum || '').trim() || UNKNOWN_VENUE;
      const arr = byVenue.get(venue);
      if (arr) arr.push(it); else byVenue.set(venue, [it]);
    }
    const venues = [...byVenue.entries()]
      .sort((a, b) => (a[0] === UNKNOWN_VENUE ? 1 : b[0] === UNKNOWN_VENUE ? -1 : 0))
      .map(([museum, list]) => ({ museum, items: list }));
    return { date, weekday: date === UNDATED ? '' : weekdayOf(date), venues, total: dayItems.length };
  });
}

/** 顶部汇总条：去过 N 天 · M 馆 · X 件（未记日期/场馆不计入天数/馆数）。 */
export function visitSummary(items: VisitItemLite[]): VisitSummary {
  const days = new Set(items.map((i) => (i.visitDate || '').trim()).filter(Boolean));
  const venues = new Set(items.map((i) => (i.museum || '').trim()).filter(Boolean));
  return { days: days.size, venues: venues.size, items: items.length };
}
