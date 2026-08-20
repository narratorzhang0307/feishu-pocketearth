import './demoReset';   // 显式 ?reset 时才清本应用数据；默认保留 PWA 本地展品/3D 缓存
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";
import { setFrostBrain } from "../frost-agent/harness/brain";
import { httpBrain } from "../frost-agent/harness/httpBrain";

// 接入阿里云百炼 Qwen 云脑；无 key 时 Skill 自动走确定性规则 fallback。
setFrostBrain(httpBrain);

createRoot(document.getElementById("root")!).render(<App />);

// 用库存给长期画像播种一次（幂等）。懒加载 profileSeed 及其库存大 JSON（movies/books），
// 并把它推迟到「用户首次交互」——首屏只渲染地球 tab、不需要画像，这样这 1MB+ 数据就不会和
// 地图瓦片抢首屏带宽；真正用到画像（点开 agent）必然发生在交互之后。15s 兜底确保最终一定播种。
let seeded = false;
const runSeed = () => {
  if (seeded) return;
  seeded = true;
  evs.forEach((e) => window.removeEventListener(e, runSeed));
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  const go = () => import("./app/lib/profileSeed").then((m) => m.seedProfileFromLibrary()).catch(() => {});
  ric ? ric(go) : go();
};
const evs = ["pointerdown", "keydown", "touchstart"];
evs.forEach((e) => window.addEventListener(e, runSeed, { passive: true }));
setTimeout(runSeed, 15000);

// 注册 Service Worker —— PWA 可安装 + 离线打开应用壳。
// 仅生产：dev 下注册会缓存 HMR 资源、干扰热更新，故用 import.meta.env.PROD 门控。
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const key = "pe.swReloaded.v35";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    });
  });
}
