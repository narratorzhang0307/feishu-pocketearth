// 标记位置覆盖 · 数据层
// 用户在地球上把某个点（照片 / 音乐 / 电影 / 书 / 行程）拖到新位置后，按 id 记下它的新经纬度，
// 持久化到 localStorage。渲染各类点时统一过一遍 applyOverride，让拖动后的位置在缩放/平移/刷新后都保持。
// 目的：用户可凭事后更精准的信息，手动校对自己看过 / 读过的东西的落点。

export interface Override { lng: number; lat: number; }

const KEY = 'pe.markerOverrides.v1';

function load(): Record<string, Override> {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

let overrides: Record<string, Override> = load();
const subs = new Set<() => void>();

function persist() { try { localStorage.setItem(KEY, JSON.stringify(overrides)); } catch { /* 隐私模式忽略 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function getOverride(id: string): Override | undefined { return overrides[id]; }

// 取实际坐标：有覆盖用覆盖，否则用原坐标。返回 [lng, lat]。
export function applyOverride(id: string, lng: number, lat: number): [number, number] {
  const o = overrides[id];
  return o ? [o.lng, o.lat] : [lng, lat];
}

// 拖动中：仅更新内存并通知重渲染（不落盘，避免每帧写 localStorage）
export function setOverride(id: string, lng: number, lat: number) {
  overrides = { ...overrides, [id]: { lng, lat } };
  emit();
}

// 拖动结束：落盘
export function commitOverrides() { persist(); }

// 清除某个点的覆盖（恢复原始落点）
export function clearOverride(id: string) {
  if (!(id in overrides)) return;
  const next = { ...overrides }; delete next[id];
  overrides = next; persist(); emit();
}

export function subscribeOverrides(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
