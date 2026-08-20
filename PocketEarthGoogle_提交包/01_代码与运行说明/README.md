# 代码与运行说明

实际项目根目录：`/Users/zhangcheng/Desktop/pocket earth_google`

## 启动

```bash
npm ci
cp .env.example .env
# 优先填自己的 GEMINI_API_KEY；没有时可填自己的 GMI_API_KEY 作为备用
npm run dev
```

生产验证：

```bash
npm run typecheck
npm test -- --run
npm run build
```

## Google 云端模型

- Council：`gemini-3.1-pro-preview`
- 叙事、双语、视觉与默认任务：`gemini-3.5-flash`
- 轻量路由：`gemini-3.1-flash-lite`

云端优先级：`GEMINI_API_KEY` 走 Google 官方 Gemini API；只有官方 key 留空时才读取 `GMI_API_KEY`。官方适配器拒绝非 `gemini-*`，GMI 备用适配器拒绝非 `google/gemini-*`。

## Gemma 端侧模型

默认运行地址：`/local-models/gemma-3n-E2B-it-int4-Web.litertlm`。当前开发目录已在 `.local-models/` 安装官方 Gemma 3n E2B Web 权重；权重不进入 Git 或 `dist`，部署新域名时需将该目录与 `server.mjs` 一起上传。也可在界面更换本机模型文件。

MediaPipe WASM 已固定在 `public/mediapipe/wasm/`。浏览器需要 WebGPU。模型未安装时，应用仍可正常启动，并明确显示端侧模型未启用，不会静默切到云端。

## 无境外账号默认路径

- 云端：优先使用自己的 Google AI Studio / Gemini API key；拿不到时使用自己的 GMI 组织作为备用；
- 端侧：Gemma 本地权重，不产生云端 API 费用；
- 3D：本地导入或内置示例；旧 KIRI BYOK 云重建由 `VITE_ENABLE_KIRI_CLOUD=true` 才启用，提交版保持关闭。
