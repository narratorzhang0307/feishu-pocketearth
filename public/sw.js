/* Pocket Earth · Service Worker（手写、零依赖）
 * 目标：可安装的 PWA + 离线打开应用壳。策略：
 *   - 导航请求：network-first，离线回退到缓存的 index.html（SPA 壳）
 *   - 同源静态资源（/assets、图标、字体…）：stale-while-revalidate（秒开 + 后台更新）
 *   - /api/*：一律走网络，绝不缓存（云脑 / 端侧 / 抓图都是动态）
 *   - 跨域（地图瓦片 / Unsplash / 字体 / 端侧模型权重）：放行交给浏览器，避免缓存膨胀与瓦片过期
 * 升级：改 VERSION 即弃用旧缓存（只弃用本应用自己的旧缓存，见 activate）。
 * 注意：模型、LoRA、Splat 和 Data Pack 都不在 SHELL；只在用户主动访问/安装后进入各自缓存。
 */
const VERSION = 'pe-v38';
const CACHE = `pocket-earth-${VERSION}`;
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // 只清理本应用自己的旧版本缓存；Skill/Data Pack/地图缓存有独立生命周期。
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pocket-earth-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 允许页面发 SKIP_WAITING 立即激活新 SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // 只管 GET
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // 跨域放行（地图/图床/字体）
  if (url.pathname.startsWith('/api/')) return;           // 动态接口放行

  // 导航：network-first（弱网挂起时 15s 后才回退已缓存的 SPA 壳，尽量避免手机 PWA 拿旧壳），离线回退 SPA 壳
  if (req.mode === 'navigate') {
    const network = fetch(req).then((res) => {
      // 只缓存正常的同源 200，避免把部署瞬间的 502/500 错误页存成离线壳
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
      }
      return res;
    });
    event.respondWith(
      Promise.race([
        network,
        // 弱网挂起兜底：15s 后若本地有壳就先上壳（不 abort 网络，让它继续刷新缓存）；无缓存壳则永不 resolve、交给真实网络/.catch
        new Promise((resolve) => setTimeout(() => { caches.match('/index.html').then((shell) => { if (shell) resolve(shell); }); }, 15000)),
      ]).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // 同源静态资源：stale-while-revalidate
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
