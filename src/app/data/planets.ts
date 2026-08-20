// 自定义「星球」store —— 用户用主题（日落星球 / 鸟类星球…）建立的主题图层。
// 每个星球 = 一组主题照片（来自 Unsplash，图片走 CDN 直链），钉到地球成为一个可开关的彩色图层。
// localStorage 持久化 + 发布订阅；与 userMarks 同思路，但单独成层、各有颜色。

export interface PlanetPhoto {
  id: string;
  thumb: string;
  full: string;
  alt: string;
  author: string;
  authorUrl: string;
  link: string;
  color: string;
  downloadLocation: string;  // 看大图时触发 Unsplash 合规埋点
  lat: number;
  lng: number;
}

export interface Planet {
  id: string;
  name: string;          // 用户起的名字，如「日落星球」
  query: string;         // 实际用于 Unsplash 的英文检索词
  color: string;         // 该星球在地球上的点色
  band: [number, number];// 该主题的纬度带（落点偏置 + 「再抓一批」一致）
  createdAt: string;
  visible: boolean;
  photos: PlanetPhoto[];
}

const KEY = 'pe.planets.v1';

function load(): Planet[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as Planet[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

let planets: Planet[] = load();
const subs = new Set<() => void>();

function persist() { try { localStorage.setItem(KEY, JSON.stringify(planets)); } catch { /* 隐私模式忽略 */ } }
function emit() { subs.forEach((fn) => fn()); }

export function getPlanets(): Planet[] { return planets; }
export function getVisiblePlanets(): Planet[] { return planets.filter((p) => p.visible); }

export function addPlanet(p: Omit<Planet, 'createdAt' | 'visible'> & { createdAt?: string; visible?: boolean }): Planet {
  const full: Planet = { ...p, createdAt: p.createdAt || new Date().toISOString(), visible: p.visible ?? true };
  planets = [full, ...planets];
  persist(); emit();
  return full;
}

export function appendPhotos(id: string, photos: PlanetPhoto[]) {
  planets = planets.map((p) => {
    if (p.id !== id) return p;
    const seen = new Set(p.photos.map((x) => x.id));
    return { ...p, photos: [...p.photos, ...photos.filter((x) => !seen.has(x.id))] };
  });
  persist(); emit();
}

export function removePlanet(id: string) {
  planets = planets.filter((p) => p.id !== id);
  persist(); emit();
}

export function togglePlanet(id: string) {
  planets = planets.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p));
  persist(); emit();
}

export function subscribePlanets(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

// 调色板：新星球依次取色，和五个基础图层颜色区分开
export const PLANET_PALETTE = ['#ff7a00', '#16d6c6', '#ff4fa3', '#9b6bff', '#ffd23b', '#4d9bff', '#54e36b', '#ff5a5f'];
export function nextPlanetColor(): string {
  return PLANET_PALETTE[planets.length % PLANET_PALETTE.length];
}
