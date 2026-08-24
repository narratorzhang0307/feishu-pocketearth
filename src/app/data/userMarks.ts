// 用户运行时落点（tab1 地球 ⇄ tab2 各 agent 联动的底座）
// 各 agent（观影 / 读书 / 照片整理 / 行程）把用户新记录的对象写进这里，地球图层实时合并渲染。
// 轻量发布订阅 + localStorage 持久化；不依赖后端，纯端上。

import type { MarkerKind } from './mapMarkers';

export interface UserMark {
  id: string;
  kind: MarkerKind;
  lat: number;
  lng: number;
  label?: string;
  meta?: Record<string, unknown>;   // 票根 / 书 / 照片等附加信息
  createdAt: string;                 // ISO，便于排序与展示
}

const KEY = 'pe.userMarks.v1';

function load(): UserMark[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as UserMark[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

let marks: UserMark[] = load();
const subs = new Set<() => void>();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch { /* 容量/隐私模式：内存仍可用 */ }
}
function emit() { subs.forEach((fn) => fn()); }

export function getUserMarks(): UserMark[] { return marks; }
export function getUserMarksByKind(kind: MarkerKind): UserMark[] { return marks.filter((m) => m.kind === kind); }

export function addUserMark(m: Omit<UserMark, 'createdAt'> & { createdAt?: string }): UserMark {
  const full: UserMark = { ...m, createdAt: m.createdAt || new Date().toISOString() };
  marks = [full, ...marks];
  persist(); emit();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pocket-earth:user-mark-added', { detail: full }));
  return full;
}

export function removeUserMark(id: string) {
  marks = marks.filter((m) => m.id !== id);
  persist(); emit();
}

export function subscribeUserMarks(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

// 同城/同国多点散开（与 mapMarkers 的 jitter 同思路，避免完全重合）
export function spreadCoord(seed: string, lng: number, lat: number, amp = 1.4): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = h >>> 0;
  const dlng = ((h & 0xffff) / 0xffff - 0.5) * amp;
  const dlat = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * amp;
  // 抖动后回收进合法经纬度范围：近日界线（lng≈±180）抖散可能溢出，经度按地球回绕、纬度 clamp，
  // 保证写入 userMarks / GeoJSON 的坐标始终合规（否则极端点位在部分渲染路径会错位）。
  const wrapLng = (x: number) => ((x + 180) % 360 + 360) % 360 - 180;
  return [wrapLng(lng + dlng), Math.max(-90, Math.min(90, lat + dlat))];
}
