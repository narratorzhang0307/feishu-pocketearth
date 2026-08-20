// Mapbox 配置
// Token 不入库：在项目根目录创建 .env 文件并设置 VITE_MAPBOX_TOKEN=你的token
// 申请地址：https://account.mapbox.com/access-tokens/
export const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string) || "";

if (!MAPBOX_TOKEN && typeof console !== "undefined") {
  console.warn(
    "[mapbox] 未检测到 VITE_MAPBOX_TOKEN，地图将无法加载。请在 .env 中配置（可参考 .env.example）。"
  );
}

// 默认地图样式 —— 干净浅色底图，适合照片漫游
export const MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";
