// ───────────────────────────────────────────────────────────────────────────
// Demo 重置模式（必须最先执行）：只有 URL 显式带 reset 时，才清空本应用的运行时数据。
// 早期线上 demo 曾经每次打开都清库；进入真实试跑后会误删用户刚生成的展品 / 3D 缓存，所以默认保留。
//
// 边界（关键）：只清【本应用自己】的数据：
//   · localStorage：所有 `pe.` / `pe-` 前缀的 key（userMarks / profile / 自建 agent / 各偏好…）
//   · IndexedDB：所有 `pe-` 前缀的库（pe-photos / pe-movies / pe-books）
// 绝不碰 Gemma/MediaPipe 端侧模型缓存与 mapbox 地图瓦片——
// 否则每次刷新都要重下模型 / 瓦片。静态演示标记（MAP_MARKERS 等）写在代码里、不在存储中，刷新本就保留。
//
// 用法：URL 带 `?reset` / `?demoReset` 才清零；普通访问与 PWA 重开都保留数据。
// ───────────────────────────────────────────────────────────────────────────
const DEMO_RESET = false;
const SHOULD_RESET = typeof location !== 'undefined' && /[?&](reset|demoReset)\b/.test(location.search);

(function demoReset() {
  if (!DEMO_RESET && !SHOULD_RESET) return;
  try {
    // ① localStorage：同步清，确保后续各 store 模块 load 时读到的就是空（回初始）
    if (typeof localStorage !== 'undefined') {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('pe.') || k.startsWith('pe-')) localStorage.removeItem(k);
      }
    }

    // ② IndexedDB：异步删 pe-* 库（首次加载无连接占用，会很快删完，在用户点开 agent 用到之前）
    if (typeof indexedDB !== 'undefined') {
      const fallback = ['pe-photos', 'pe-movies', 'pe-books', 'pe-ar-anchors'];
      const listFn = (indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> }).databases;
      if (typeof listFn === 'function') {
        listFn.call(indexedDB)
          .then((arr) => arr.forEach((d) => { if (d.name && d.name.startsWith('pe-')) indexedDB.deleteDatabase(d.name); }))
          .catch(() => fallback.forEach((n) => indexedDB.deleteDatabase(n)));
      } else {
        fallback.forEach((n) => indexedDB.deleteDatabase(n));
      }
    }
  } catch { /* 隐私模式 / 异常：忽略，至多没清干净，不影响打开 */ }
})();
