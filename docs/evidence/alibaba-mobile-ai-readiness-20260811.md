# Pocket Earth × 阿里手机创意 AI 挑战赛要求证据矩阵

> 更新：2026-08-11  
> 原则：静态代码、测试和 APK 能证明的写 `VERIFIED`；只能在比赛手机上证明的写
> `DEVICE NOT RUN`，不用网页预览或编译日志冒充真机成绩。

## 总结

Pocket Earth 已经满足“手机应用 + Qwen + MNN + Arm SME2 可验收实现”的代码与安装包前提。
尚缺的不是 UI 或编译产物，而是连接赛事手机后的真实 decode、飞行模式闭环、温度/
内存和 SME2 OFF/ON 性能数据。

## 要求对照

| 赛事要求 | 状态 | 可复验证据 | 不得过度声称的边界 |
|---|---|---|---|
| 在手机上开发创意 AI 应用 | **VERIFIED / APK** | Capacitor Android 36 构建成功；`art.throughtheglass.pocketearth`；14,455,560 bytes；仅 `arm64-v8a`；APK 签名和 16 KiB 对齐通过 | 还没有在比赛专用手机安装和点通全流程 |
| 至少使用一款 Qwen 系列模型 | **VERIFIED** | Android 原生链路使用 Qwen3 / Qwen3-VL MNN 双基座；云端增强仅使用 DashScope Qwen；旧 Gemini/GMI 路由返回 410 | 模型权重按 OSS Manifest 安装到应用私有目录，不内置在 APK |
| 核心交互逻辑支持本地运行 | **VERIFIED / CODE** | Skill Registry、Frost 本地语义路由、隐私门、权限门、确认门、任务交接、Data Pack 和地图写入边界都在本机；敏感原文禁止在 MNN 失败后自动上云 | **DEVICE NOT RUN**：本地 Qwen 的真实首 Token / tokens/s 尚未采样 |
| MNN 端侧推理 | **VERIFIED / COMPILED + PACKAGED** | MNN 3.6.1、LLM/Omni、`libpocket_mnn_jni.so`、`libMNN.so`、`libc++_shared.so`；13/13 JNI 导出；APK 库哈希和依赖复验通过 | **DEVICE DECODE NOT RUN** |
| 深度适配 Arm SME2 | **VERIFIED / IMPLEMENTED** | MNN SME2/KleidiAI 内核进 APK；CPU target 2/3 真实切换；Skills 顶部有 MNN/SME2 显式开关；IndexedDB 验收账本、ABBA×2、A/B 各 20 次、温控/版本/Input SHA 失效门和导出包已实现 | **SME2 PERFORMANCE NOT RUN**：未连真机时 UI 必须显示网页预览，不产生假样本 |
| 云+端混合架构（可选） | **VERIFIED** | 本地高置信路由 → Android MNN Qwen 长尾规划 → 非敏感请求才允许升级 DashScope Qwen；云端返回必须通过严格 JSON / Skill ID / 数量 / 目标白名单校验 | 云端只增强，不应被描述为端侧 MNN 成绩 |
| 创意性与实用性 | **VERIFIED / PRODUCT** | Frost 是一个可持续装备 Skills 的本地个人 Agent；书籍、电影、音乐 Data Pack 与 Skill 解耦；旅行、看展、阅读摘录、Book-to-Earth、碑拓复原形成同一 Harness 下的专业能力 | 评审演示应以 2–3 个闭环为主，不应把 Skill 数量当成主卖点 |

## Frost 真实编排证据

Frost 不再是一张人格卡或页面导航，其 Harness 是可执行的最小编排层：

1. 只读取 Skill Manifest 的语义指纹、装备状态、权限和工具，不把整份 Skill 正文塞进 Prompt。
2. 先走确定性高置信规则；只有长尾或组合任务才调用 Qwen 规划。
3. Android 上优先 MNN Qwen；非 Android 预览明示记录“非 Android 原生环境”。
4. 模型只能选择已登记 Skill，最多 3 步；未知字段、重复 Skill、重复目标、伪造 ID 全部失败闭合。
5. 未装备 Skill 不能执行；落图、生成 Data Pack、数字修复仍由目标 Skill 二次确认。
6. `pocket-frost-task/v1` 只在当前会话的 `sessionStorage` 交接任务，不上传、不自动写数据。
7. Trace 展示目录数、路由来源、耗时、安全门和回退，不展示或伪造模型隐藏思维过程。

定向测试：`frost-agent/harness/skillRouter.test.ts`、`skillRouter.mnn.test.ts`、
`taskHandoff.test.ts`。

## 最终自动化证据

| 项目 | 结果 |
|---|---|
| TypeScript | `npm run typecheck` 通过 |
| Vitest | 92 files / 1,549 tests 通过 |
| Vite release build | 2,305 modules transformed |
| Skills 控制台懒加载 | `MusicAgentsTab` 824.94 kB → 83.09 kB |
| 首屏门禁 | 839,901 / 3,145,728 bytes；`forbiddenRequests=[]` |
| 发布目录 | 8.5 MiB；旧 Google 数字孪生页、Data Pack 实例、MediaPipe 和已上 OSS 重资产均裁剪 |
| Android | `BUILD SUCCESSFUL` |
| APK | 14,455,560 bytes；SHA256 `03d22d9a66fe099bf98ca8b5e0df20f191cc9c4c867c3c865a91311a8cd19b24` |
| JNI | SHA256 `27fb5b90aff1c69d903a2c4f1d8346ebe959bea757fe8988f24225e1903c4fbf`；13/13 exports |
| MNN | SHA256 `bbb09db8036d6c1f380af00f94d8a13939848ceceefcdd704ab2dd14c0cc7d44` |
| APK 静态契约 | MNN LLM + CPU target 2/3 + SME2 + KleidiAI；arm64 only；无权重；低于 40 MiB；16 KiB 对齐；签名通过 |

可安装调试包：`deliverables/Pocket-Earth-Qwen-MNN-决赛-debug-20260811-r3.apk`。

## 只剩真机能完成的项目

1. 安装 APK，完成 MNN runtime probe，再按 Manifest 安装双 Qwen Base 和专业 Adapter。
2. 飞行模式下跑 Frost 路由、Travel LoRA、视觉 LoRA、OCR 和遮罩内修复闭环。
3. 在验收账本中完成 MNN OFF/ON 与 SME2 ABBA×2，每模式至少 20 个计入样本。
4. 导出汇总、原始样本、logcat、Perfetto、版本/设备/Input SHA，并记录首 Token、tokens/s、PSS、温度和降频。
5. 只有完成上述步骤后，才能把 `DEVICE NOT RUN` 改为 `VERIFIED ON DEVICE`。
