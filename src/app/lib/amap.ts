// 高德地图（AMap）配置 —— 与 Mapbox 平行、可切换的底图 provider。
// Key 不写死：全部从 import.meta.env 读，缺失时给可读警告，便于随时回退 Mapbox。
//
// 在项目根目录 .env 里配置（参考 .env.example）：
//   VITE_MAP_PROVIDER=amap                切到高德（默认 mapbox，删掉此行即回退）
//   VITE_AMAP_KEY=你的高德 Web端(JS API) key
//   VITE_AMAP_SECURITY_JSCODE=你的安全密钥   （JSAPI 2.0 必填）
//
// 申请地址：https://console.amap.com/dev/key/app
//   应用管理 → 创建新应用 → 添加 Key → 服务平台选「Web端(JS API)」→ 拿到 key + 安全密钥。
export const AMAP_KEY = (import.meta.env.VITE_AMAP_KEY as string) || '';
export const AMAP_SECURITY_JSCODE = (import.meta.env.VITE_AMAP_SECURITY_JSCODE as string) || '';

// 底图样式：默认深色，贴合 Pocket Earth 的太空黑背景。
// 可换 amap://styles/normal | light | dark | grey | whitesmoke。
export const AMAP_STYLE = (import.meta.env.VITE_AMAP_STYLE as string) || 'amap://styles/dark';

declare global {
  interface Window {
    AMap?: unknown;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

let amapPromise: Promise<unknown> | null = null;

// 动态注入高德 JSAPI 2.0（带安全密钥），resolve 出 window.AMap。
// 这是「确实调用了高德地图 API」的入口：脚本地址与 key 都来自 env，不写死。
export function loadAmap(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapPromise) return amapPromise;
  if (!AMAP_KEY) {
    return Promise.reject(new Error('缺少 VITE_AMAP_KEY（高德地图 key 未配置）'));
  }
  // JSAPI 2.0 要求安全密钥在加载脚本前挂到 window 上。
  window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_JSCODE };
  amapPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}`;
    s.async = true;
    s.onload = () => (window.AMap ? resolve(window.AMap) : reject(new Error('高德 JSAPI 已加载但 window.AMap 不存在')));
    s.onerror = () => reject(new Error('高德 JSAPI 脚本加载失败（检查网络 / key / 域名白名单）'));
    document.head.appendChild(s);
  });
  return amapPromise;
}

const AMAP_SELECTED = String(import.meta.env.VITE_MAP_PROVIDER || 'mapbox').toLowerCase() === 'amap';
if (AMAP_SELECTED && !AMAP_KEY && typeof console !== 'undefined') {
  console.warn('[amap] 未检测到 VITE_AMAP_KEY，高德底图将无法加载。请在 .env 配置（参考 .env.example）。');
}
