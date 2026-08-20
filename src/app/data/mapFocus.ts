// 跨组件「飞到某坐标」通道：记一笔/各 agent 钉完后，让地图自动飞过去并放大到「便签/卡片展开可见」的尺度，
// 免去用户手动切地球 tab + 手动转地球 + 手动放大才看得到刚钉的点。仿 geoStickers 的 subscribe 写法、零依赖。
// pending：给地图组件「挂载/切回 earth tab」时消费（用户钉完切过来才看到地图的情形）；
// subs：给已挂载可见的地图组件实时响应。
export interface MapFocusReq { lng: number; lat: number; zoom: number }

let pending: MapFocusReq | null = null;
const subs = new Set<(r: MapFocusReq) => void>();

// 请求把地图飞到 (lng,lat)。zoom 默认 6.8——必须 > 心情贴展开阈值 6.5，否则只飞到方位、便签仍不展开。
export function requestMapFocus(lng: number, lat: number, zoom = 6.8): void {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  const r: MapFocusReq = { lng, lat, zoom };
  pending = r;
  subs.forEach((f) => { try { f(r); } catch { /* 单个订阅者异常不影响其它 */ } });
}

// 地图组件挂载/变可见时调用：取走并清空挂起的焦点请求（消费一次）。
export function consumePendingMapFocus(): MapFocusReq | null { const p = pending; pending = null; return p; }

export function subscribeMapFocus(f: (r: MapFocusReq) => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
