# Pocket Earth 决赛实施基线（2026-08-11）

本文件记录执行《Pocket Earth 决赛改造总计划与执行准则》前的只读基线。所有修改只发生在本目录；Photos Tab 由另一任务维护，本轮不改其实现。

## Git 与工作区

- 分支：`main`
- 基线提交：`848ba12`
- 工作区：已有大量未提交修改和新增文件，全部视为用户资产；不重置、不覆盖无关变更。
- 已完成并冻结：书籍、电影、音乐 Data Pack；旅行规划；看展搭子；Book-to-Earth。

## 可验证基线

- `npm run typecheck`：通过。
- `npm run build`：通过；Skills 主页面产物约 826 kB（gzip 261 kB），Mapbox 与 3D 已拆为异步 chunk。
- `npm test -- --run`：1419 项中 1415 项通过，4 项失败。
- 4 项失败均为旧 Google/GMI 展示断言仍期待 `Gemini` / `KIRI中`，实际界面已经显示 `Qwen` / `3D重建中`；不是运行逻辑失败，将在 Qwen-only 清理阶段同步修正测试。

## 已确认的结构缺口

1. `pocket-data/v1` 已有严格校验和安装/切换/卸载，但 Skill 安装仍是旧版“触发词 → 旧 Agent 页面”的快捷路由，不是 `pocket-skill/v1`。
2. 云端 `/api/frost-llm` 仍以 Gemini/GMI 为主，Qwen 仅覆盖旅行、看展与 Mapping；开发与生产各维护一份重复 Provider 逻辑。
3. Skills Plaza 仍使用 `SpaceAgent` / `installAgent` 和 Google 技术标签，尚未连接统一 Skill Registry 与生命周期。
4. 页面底栏仍显示 `Agents`；部分可见文案仍讲“多个 Agent / 子 Agent”。
5. 浏览器 Gemma 面板仍是旧 Google 基线；MNN sidecar 已有 Qwen、LoRA、SHA256、断点续传和真实资产状态，但尚未成为统一的端侧模型管理界面。
6. Capacitor 依赖已安装，但仓库没有 Android 工程和原生 MNN Bridge；真机 SME2 证据尚不能从本仓库复现。
7. `public/assets` 仍含展品 2.5D/3D 重资产；虽然 3D 代码已懒加载，仍需补公开 OSS Manifest、首屏禁止请求检查和发布证据。

## 实施边界

- 不改 Photos Tab、相册读取、照片备份和照片推理实现。
- 对已完成模块只做命名、Provider 兼容与回归测试，不重新设计其业务和 UI。
- 任何“端侧已就绪 / SME2 已启用 / LoRA 已安装”只能来自真实 runtime probe 与哈希校验，不能由配置或文案推断。
