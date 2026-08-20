# Photos 第 4—6 轮证据（2026-08-11）

## 证据边界

本记录证明第二组三轮的软件复杂度回归、中文确定性检索、权限中途变化、手机窄屏 UI、构建和 APK 静态契约。它不证明目标 Android 手机上的真实系统相册、真实 5000 图解码、CLIP 视觉召回、PSS/温度、离线 Qwen decode 或 SME2 实际命中。

## 第 4 轮：批量存储与 5000 条回归

实现：

- IndexedDB keyed store 增加 `getMany/putMany/delMany`；资产、雷达结果、状态补丁和语义 orphan 清理使用批量事务。
- 重复候选使用 10 分钟桶和 content hash 索引；事件使用同桶/相邻桶连通分量，避免时间桶边界漏组。
- literal/semantic 搜索结果使用 Map/Set 合并，保留时间和 GPS 硬约束。

复验命令：

```text
npx vitest run src/app/lib/photo/globalGroups.test.ts src/app/lib/photo/libraryStore.test.ts src/app/lib/photo/search.test.ts src/app/lib/photo/searchEvaluation.test.ts src/app/lib/photo/libraryBridge.test.ts --reporter=verbose
```

结果：5 files / 22 tests；测试耗时 143ms，总进程 234ms。其中：

- 5000 资产 upsert：8ms；mock 契约验证 1 次 `getMany` + 1 次 `putMany`，无逐条 `get/put`。
- 5000 资产 minute-spaced 全局分组：61ms，低于固定 2,500ms 桌面回归预算。
- 5000 条 literal/semantic 合并：11ms，GPS 硬约束保持。

上述存储测试使用模拟 store；分组/合并使用合成对象，不含图片解码和真实磁盘 IO。

## 第 5 轮：中文确定性检索与权限状态机

- 修复会误删地名字符“中/里”的中文结构词处理。
- 100 条合成记录由 20 个目标和 80 个干扰项组成，覆盖时间、地点、猫狗/人物、票据/OCR、二维码和 GPS 有无。
- 20 条固定查询结果：Recall@5=20/20，Recall@20=20/20，无结果=0；单测 11ms。
- 这是 metadata/tag/OCR parser 的确定性回归；未输入真实像素或 CLIP embedding，因此不得标成“100 图语义搜索评测通过”。
- 相册分页扫描新增 stable/restart/revoked 状态机：full↔limited 变化从 0 重启；revoked 停止并保留派生数据，不做 missing 清理。

## 第 6 轮：窄屏、RunTrace 与发布产物

- 390×844 浏览器审计通过三入口、光阴志空态/设计样刊和本地搜索。
- 仓库公开夹具 `restoration-mask.png` 建立第 5 条派生资产；搜索“票据”命中 2 条 document 结果。
- 便宜分析 RunTrace：3 步、约 0.06 秒，backend 标记“本地”；未冒充 Qwen/MNN。
- 历史未知地图 kind 兼容为 `custom`，复载后没有新增 `sq-heritage` warning。
- `dist`、Android Web 资源和 APK 文件名/内容扫描没有 MobileCLIP 官方权重、Queryable、Ente、Immich、Qwen/LoRA 权重、旧 MediaPipe WASM 或预设 Splat。

最终自动化：

```text
Vitest: 84 files / 1,481 tests
TypeScript: passed
Vite mobile build: 2,309 modules
First paint: 836,390 / 3,145,728 bytes; forbiddenRequests=[]
Capacitor sync: @capgo/capacitor-photo-library@8.0.21
Gradle clean assembleDebug: BUILD SUCCESSFUL
APK: 36,603,933 bytes
APK SHA256: 66d89e9813c0c4f0dbeec4c0f4cf6398044529dd69ab2018b0f1119de7e3fc61
Native contract: 12/12 JNI; arm64-v8a; v2 signature; 16 KiB alignment; MNN LLM + SME2 + KleidiAI compiled
```

依赖审计仍有 2 个 high，来自 Transformers.js 的可选 Node `sharp`/libvips 链，当前没有上游 fix。浏览器/Android 未打包 sharp 原生库；风险为已隔离、未修复、继续跟踪。

## 仍需目标手机补证

1. Android 13/14 full、limited、denied、收回和再次授权。
2. 真实 100/500/1000/5000 图的首批时间、全库时间、IndexedDB 大小、PSS、温度、取消和恢复。
3. 100 张真实图片 + 20 查询的 CLIP Recall@5/20、误报和无结果率。
4. 签名 Qwen Base/OCR Adapter 安装、真实 decode、飞行模式和 JNI 取消占用。
5. 同一目标 Armv9 手机 SME2 OFF/ON A/B；只有 runtime 日志显示 `sme2-active` 才可对外宣称启用。
