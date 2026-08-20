# Pocket Earth OSS 资产与首屏策略

## 边界

- OSS 只分发公开模型、LoRA、Skill、Data Pack、缩略图和可选 3D 资产，不承担“端侧推理”的冒充角色。
- 私人照片、原始票据、足迹、笔记、向量、偏好模型和未确认转录默认只留本机；若以后同步，只能走私有 Bucket + STS 短期签名。
- 浏览器、Android 包、源码和录屏不保存 AccessKey。发布脚本只读取本机已登录的阿里云 CLI STS Profile。

## 缓存与路径

- Hash/版本固定对象：`public, max-age=31536000, immutable`。
- Manifest：短缓存 + ETag，不覆盖旧版本；升级发布新版本路径。
- `models/{id}/{revision}/{file}`、`skills/{id}/{version}/manifest.json`、`data/{id}/{version}/manifest.json`。
- Qwen Base 在设备上只保留一份；不同 Skill 只安装自己的 Adapter/专用小模型。

## 首屏硬门禁

- `index.html` 的静态依赖闭包不得包含 `.mnn`、LoRA、`.splat`、Data Pack、MediaPipe WASM 或未访问页面资产。
- `public/sw.js` 的 Shell 只含入口、Manifest 和小图标；OSS 跨域资源不由 Shell 预缓存。
- `npm run verify:first-paint` 对生产 `dist` 的 HTML 和静态 ESM 闭包执行可重复检查。
- Android 构建执行 `build:mobile`，删除已退出活跃路由的 79MB MediaPipe/Gemma WASM 和 8.3MB 预设 Splat；专业模型通过资产安装器进入 App 私有目录。

## 当前发行

- 精确文件、对象 Key、字节数和 SHA256 在 `docs/deploy/oss-release-20260811.json`。
- `python3 scripts/release/publish-oss-assets.py --dry-run` 只做本地完整性审计。
- 去掉 `--dry-run` 后上传；若不可变 Key 已存在但大小或元数据 SHA 不同，脚本拒绝覆盖。
