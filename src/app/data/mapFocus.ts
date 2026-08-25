// 跨组件「飞到某坐标」通道：藏书票、电影票、音乐标记和照片点击后，先让 App 切到地球 tab，
// 再由地图消费同一条请求。Skill 与地图都是懒加载 chunk，不能只依赖模块内存：
// - CustomEvent 负责跨 chunk / HMR 实例通知；
// - sessionStorage 负责地图尚未挂载时保存一次性请求。
export type MapFocusDomain = 'books' | 'movies' | 'music' | 'photos' | 'other';

export interface MapFocusReq {
  lng: number;
  lat: number;
  zoom: number;
  domain?: MapFocusDomain;
  recordId?: string;
  label?: string;
  requestedAt: number;
}

export interface MapFocusMeta {
  domain?: MapFocusDomain;
  recordId?: string;
  label?: string;
}

export const MAP_FOCUS_EVENT = 'pocket-earth:map-focus';
const MAP_FOCUS_STORAGE_KEY = 'pocket-earth:map-focus:pending';
const MAX_PENDING_AGE_MS = 2 * 60 * 1000;

let pending: MapFocusReq | null = null;
const subs = new Set<(r: MapFocusReq) => void>();

const isFocusReq = (value: unknown): value is MapFocusReq => {
  if (!value || typeof value !== 'object') return false;
  const req = value as Partial<MapFocusReq>;
  return Number.isFinite(req.lng) && Number.isFinite(req.lat) && Number.isFinite(req.zoom);
};

const writePending = (req: MapFocusReq) => {
  try { window.sessionStorage.setItem(MAP_FOCUS_STORAGE_KEY, JSON.stringify(req)); } catch { /* 无存储权限时仍可走事件 */ }
};

const readStoredPending = (): MapFocusReq | null => {
  try {
    const raw = window.sessionStorage.getItem(MAP_FOCUS_STORAGE_KEY);
    if (!raw) return null;
    const req = JSON.parse(raw) as unknown;
    if (!isFocusReq(req)) return null;
    const requestedAt = Number((req as MapFocusReq).requestedAt || 0);
    if (requestedAt > 0 && Date.now() - requestedAt > MAX_PENDING_AGE_MS) return null;
    return { ...(req as MapFocusReq), requestedAt: requestedAt || Date.now() };
  } catch { return null; }
};

const clearStoredPending = () => {
  try { window.sessionStorage.removeItem(MAP_FOCUS_STORAGE_KEY); } catch { /* ignore */ }
};

// 请求把地图飞到 (lng,lat)。zoom 默认 6.8——必须 > 心情贴展开阈值 6.5，否则只飞到方位、便签仍不展开。
export function requestMapFocus(lng: number, lat: number, zoom = 6.8, meta: MapFocusMeta = {}): void {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  const r: MapFocusReq = { lng, lat, zoom, ...meta, requestedAt: Date.now() };
  pending = r;
  if (typeof window !== 'undefined') {
    writePending(r);
    window.dispatchEvent(new CustomEvent<MapFocusReq>(MAP_FOCUS_EVENT, { detail: r }));
    return;
  }
  subs.forEach((f) => { try { f(r); } catch { /* 单个订阅者异常不影响其它 */ } });
}

// 地图组件挂载/变可见时调用：取走并清空挂起的焦点请求（消费一次）。
export function consumePendingMapFocus(): MapFocusReq | null {
  const p = pending || (typeof window !== 'undefined' ? readStoredPending() : null);
  pending = null;
  if (typeof window !== 'undefined') clearStoredPending();
  return p;
}

export function subscribeMapFocus(f: (r: MapFocusReq) => void): () => void {
  if (typeof window !== 'undefined') {
    const onFocus = (event: Event) => {
      const req = (event as CustomEvent<unknown>).detail;
      if (!isFocusReq(req)) return;
      try { f(req); } catch { /* 单个订阅者异常不影响其它 */ }
    };
    window.addEventListener(MAP_FOCUS_EVENT, onFocus);
    return () => { window.removeEventListener(MAP_FOCUS_EVENT, onFocus); };
  }
  subs.add(f);
  return () => { subs.delete(f); };
}
