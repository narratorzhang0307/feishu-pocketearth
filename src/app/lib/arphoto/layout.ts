// 布局引擎（纯函数，node 可测）：把 N 张照片排进锚点局部空间。
// 对标 XOSMO Lab 的 Blender 手工"垂吊照片墙"——那条链路里 Blender 只干了排版这一件事，
// 这里用确定性算法程序化生成：同一 seed 每次重现同一布局（重访贴合时布局不跳变）。
// 单位：米。坐标系：锚点为原点，y 向上，-z 朝用户（three 惯例）。
import type { ArLayoutItem, ArLayoutKind } from './types';

// FNV-1a → mulberry32：与 userMarks.spreadCoord / 诗歌树 sketch 同思路的确定性随机
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 环绕个展的空间包络（手机端近场观看的舒适区）
export const CLOUD_RADIUS_MIN = 0.85;
export const CLOUD_RADIUS_MAX = 1.25;
export const CLOUD_Y_MIN = 0.95;
export const CLOUD_Y_MAX = 2.05;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));   // ≈2.399963，方位角均匀铺开

/** 单张：正对用户、视线高度略下（放置点上方 1.4m 处一张相框） */
export function singleLayout(): ArLayoutItem[] {
  return [{ position: [0, 1.4, 0], rotationY: 0, tilt: 0, scale: 1 }];
}

/**
 * 环绕个展：黄金角螺旋绕垂直轴，一圈"垂吊照片墙"。
 * 高度沿序号从低到高铺满包络；半径/俯仰/缩放用 seed 抖出手作感；每张朝向中心（观者站在中间环视）。
 */
export function cloudLayout(count: number, seed: string): ArLayoutItem[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  if (n === 1) return singleLayout();
  const rng = makeRng(hashSeed(seed || 'ar'));
  const phase = rng() * Math.PI * 2;   // 整环随 seed 转相位
  const items: ArLayoutItem[] = [];
  for (let i = 0; i < n; i++) {
    const angle = phase + i * GOLDEN_ANGLE;
    const radius = CLOUD_RADIUS_MIN + (CLOUD_RADIUS_MAX - CLOUD_RADIUS_MIN) * rng();
    const y = CLOUD_Y_MIN + ((CLOUD_Y_MAX - CLOUD_Y_MIN) * i) / (n - 1) + (rng() - 0.5) * 0.1;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    items.push({
      position: [x, clamp(y, CLOUD_Y_MIN - 0.06, CLOUD_Y_MAX + 0.06), z],
      rotationY: angle + Math.PI,            // 面向中轴（观者）
      tilt: (rng() - 0.5) * 0.24,            // ±0.12rad 手作歪斜
      scale: 0.85 + rng() * 0.3,             // 0.85–1.15
    });
  }
  return items;
}

function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

export function layoutFor(kind: ArLayoutKind, count: number, seed: string): ArLayoutItem[] {
  return kind === 'cloud' ? cloudLayout(count, seed) : singleLayout();
}
