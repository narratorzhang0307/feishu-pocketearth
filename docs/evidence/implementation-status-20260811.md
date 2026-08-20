# Pocket Earth 决赛版实施与验收状态（2026-08-11）

## 结论

本轮只修改 `/Users/zhangcheng/Desktop/pocket earth 决赛`，没有写入其他 Pocket
Earth 工程。最终合并状态已包含 Photos 任务完成的六轮改造：相册桥、pHash v3、端侧
语义索引、个人偏好、Qwen/OCR 门禁与 Android `PocketMnn` transport。

决赛版的 Web 主架构、`pocket-skill/v1` 生命周期、Skills Plaza、真实 Frost Skill
编排器、Qwen Provider、
MNN sidecar、碑拓识读/复原、地图视野加载、首屏门禁和 Android 原生 MNN/JNI/Java/
Capacitor 链路已经落地并有可复验结果。OSS 上传、生产站部署和可安装 APK 已完成；
Android 目标机真实 decode、飞行模式与 Armv9/SME2 A/B 仍需真机补证，不得包装为完成。

## 主要交付

### Skill 与产品信息架构

- 前台保留一个 Frost Agent，具体能力统一称为 Skills。
- 移除 Public Agents / 公共知识层活跃页面与路由。
- `pocket-skill/v1` 严格校验身份、Base/Adapter、资产、权限、Data Pack、Quality
  Gate、Fallback、Evaluation 与 Distribution。
- Registry 支持安装、校验、装备、停用、回滚和卸载；共享资产按引用计数回收。
- Skills Plaza 展示作者、版本、channel、大小、权限、Base revision、质量门禁和测试结果。
- RunTrace 记录真实 Skill、模型、Adapter、数据、工具、质量门禁、回退、确认和写回对象。
- Frost 优先使用本地语义指纹，长尾任务在 Android 优先由 MNN Qwen 产生严格计划，
  再受目标白名单、装备状态、权限、写入确认和 `pocket-frost-task/v1` 交接契约约束。
  敏感原文不会因 MNN 失败而自动升级到云端。

### Qwen 与 MNN

- 生产与 Vite 开发共用 `server/qwen-provider.mjs`，云端只走 DashScope/百炼。
- Gemini/GMI 旧接口返回 HTTP 410；已删除死的 `gemmaEdge.ts` 与
  `@mediapipe/tasks-genai` 依赖。
- 桌面 sidecar 已真实执行 Qwen3-VL Base、视觉 LoRA 和文化遗产复原，不用 mock 冒充。
- Android 资产安装器实现 HTTPS、大小/SHA256、Range 续传、进度、取消、原子激活、
  Base 哈希兼容和共享 weight 硬链接。
- MNN 3.6.1、`libpocket_mnn_jni.so` 与 `libc++_shared.so` 已编入 arm64-v8a APK；
  13/13 JNI 导出、MNN LLM API、真实 CPU target 2/3 开关、SME2/KleidiAI 内核和
  16 KiB 对齐均通过静态验收。
- Agents 顶部已加入默认展开的 MNN / SME2 真机验收台。开关持久化到 Android 本地；
  配置切换与非正式 2+5 快速检查生成可折叠 Trace。正式 SME2 结论使用 ABBA×2：每个 leg
  2 次预热 + 5 次计入，A/B 各 20 次；每条 sample 与 suite 状态在同一 IndexedDB 事务中
  立即提交，支持中断续跑与未完成列表。
- 正式 suite 锁定 APK/MNN/设备/ABI/Input SHA，检查 thermal status、电池温度/漂移和固定
  输出质量；完整 ZIP 一并导出汇总、原始 samples、配置记录、logcat、Perfetto 可导入应用
  轨迹及 SHA256 manifest。系统级 Perfetto 未采集时会明确标记 false，不用应用埋点冒充。
- Travel 语言 LoRA 与视觉 LoRA 的 Base 哈希不兼容，因此运行时采用 language/vision
  两套 Qwen3-VL-2B MNN export，并保证最多一个 Base/LoRA 模型驻留。
- 双基座 14 文件、3,748,601,738 bytes 由 `android/native/model-bundle.manifest.json`
  固定大小和 SHA256；引擎随 APK 安装，模型权重另行安装到应用私有目录。
- Java 按任务分别报告 text/vision ready；共享 Base 不允许由普通 Skill URL 替换，
  Adapter 类型与 Base 不匹配时失败闭合。

### 专业 Skill

- “碑拓识读与数字复原”已加入 Plaza 和 Skills 页面。
- 实际 Base 与 LoRA 识读出现分歧时 Quality Gate 阻止自动覆盖，并进入人工复核。
- 实际复原输出保留原图对照；测试样本遮罩覆盖 30.1%，未遮罩像素最大变化为 0。
- 书籍、电影、音乐、旅行、看展和 Book-to-Earth 按用户要求视为已完成模块，仅做协议、
  Provider 与回归兼容，不重新设计。

### 资产、地图与首屏

- OSS 已发布并逐对象复验：双 Qwen 基座 15 个对象 3,748,604,229 bytes，6 个
  专业 Skill 资产 287,085,948 bytes，92 个静态素材 44,195,838 bytes。静态素材经
  `assets-pocketearth.throughtheglass.art` 在线展示，去除 OSS 默认域名强制下载头。
- 地图 GeoJSON 按当前视野加 15% 缓冲构建，支持跨 180° 经线；低缩放使用 cluster，
  点击聚合点自动展开，移动结束再刷新视野数据。
- Android 正式构建顺序执行 `build:mobile → cap sync android → assembleDebug`，旧
  MediaPipe WASM 和预设 Splat 不进入 APK。
- Service Worker 不预缓存模型、LoRA、全量 Data Pack 或跨域 OSS 重资产。

## 自动化与构建证据

| 验收 | 结果 |
|---|---|
| 全量 Vitest | 92 files / 1,549 tests，通过 |
| TypeScript | `npm run typecheck`，通过 |
| 新增地图边界测试 | 普通视野与跨 180° 经线，通过 |
| 生产 mobile Web build | 2,305 modules transformed，通过 |
| Skills 控制台懒加载 | 主块由 824.94 kB 降为 83.09 kB |
| 首屏门禁 | 839,901 bytes / 3,145,728 bytes；forbiddenRequests=[] |
| mobile build prune | MediaPipe WASM 与 `preset-nike.splat` 已删除 |
| Android 36 Java/Capacitor build | `BUILD SUCCESSFUL` |
| debug APK | 14,455,560 bytes；arm64-v8a；签名通过 |
| APK SHA256 | `03d22d9a66fe099bf98ca8b5e0df20f191cc9c4c867c3c865a91311a8cd19b24` |
| JNI SHA256 | `27fb5b90aff1c69d903a2c4f1d8346ebe959bea757fe8988f24225e1903c4fbf` |
| MNN SHA256 | `bbb09db8036d6c1f380af00f94d8a13939848ceceefcdd704ab2dd14c0cc7d44` |
| APK 原生契约 | 13/13 JNI；MNN LLM + CPU target 2/3 + SME2 + KleidiAI；仅 arm64-v8a；无模型权重；低于 40 MiB；16 KiB ELF/APK 对齐 |
| APK 重资产检查 | 无 MediaPipe WASM、预设 Splat 和 Qwen/LoRA 权重；MNN 引擎/JNI 在包内 |

APK：`deliverables/Pocket-Earth-Qwen-MNN-决赛-debug-20260811-r3.apk`。

最终 `npm run typecheck` 已在 Photos 第六轮编辑后重新运行并通过。全量测试、mobile
生产构建、首屏门禁、MNN clean compile、Android Java/JNI 编译、APK 内容/对齐/签名
也全部通过。

Photos 第 4—6 轮继续补齐批量 IndexedDB 事务、5000 条派生索引复杂度回归、中文
地点/邻接标签解析、full↔limited/revoked 中途变化和 390×844 Demo 复核。100 条
metadata/tag/OCR 合成记录的 20 查询为 Recall@5/20 20/20，但不包含真实图片或 CLIP；
5000 条结果也不包含真实图片解码、磁盘 IO、PSS 或温升。证据见
`docs/evidence/photos/photos-round4-6-evidence-2026-08-11.md`。

## 三轮 MNN 构建与检查记录

1. **第一轮：真实原生链路。** 从 MNN 3.6.1 源码编译 LLM/Omni 与 JNI，发现并修复
   首次使用临时图像目录前未创建的问题，产出可装包的三项 arm64 原生库。
2. **第二轮：架构与失败边界。** 对训练产物逐文件做 SHA256 前向核验，发现 Travel
   语言 LoRA 与古籍/碑拓/OCR 视觉 LoRA 不可共用一个 Base；改为双基座路由，修复两个
   2B 模型可能同时驻留的内存风险，并补齐图片路径/24 MiB 上限、异常清理和 capability
   如实报告。
3. **第三轮：全新目录 clean rebuild。** 使用新的 `/tmp/pocket-mnn-round3-*` 从零编译
   579 个 native target，重新执行 mobile prune、Capacitor sync、Gradle clean build、
   13/13 JNI、库哈希、包名、16 KiB 对齐和 APK 签名检查。该轮一度发现旧
   MediaPipe/Splat 被陈旧 Web assets 带回，重新执行 mobile build/sync 后复验通过。

## 追加三轮运行时与发布强化记录

1. **运行时一致性轮。** 发现 LoRA 卸载或覆盖后旧模型仍可能驻留内存；新增
   `nativeInvalidate`，资产变更即释放 Base/Adapter，并在调用前确认所需 Adapter 已安装。
   同时将实际加速从误写的 `ARM82` 修正为 `NEON/SME2/SVE2` 设备事实，并限制视觉输入
   为带正确文件签名的 JPEG/PNG/WebP。
2. **安装安全轮。** 六个内置模型必须匹配 Android 白名单、Skill Manifest 与 OSS
   Release 三方同一大小/SHA256；精确校验 HTTPS 重定向与 Content-Range。模型文件、
   共享权重硬链接和元数据使用同文件系统原子替换，避免先删旧文件形成空窗。
3. **发布门禁轮。** 重新执行 mobile build、Capacitor sync 与 Gradle clean build；APK
   只允许 arm64-v8a 的三项原生库，禁止 `.mnn/.weight/safetensors/gguf` 权重入包，设置
   40 MiB 上限，并再次通过 13/13 JNI、16 KiB 对齐、APK 签名和全量回归。

调试模型安装脚本 `scripts/android/install-mnn-debug-bundle.sh --verify-only` 已验证本机
两套 Base、全部 LoRA/专业资产及固定哈希；由于 `adb devices -l` 当前没有设备，脚本
没有执行目标机写入，也没有生成虚假的真机成功记录。

## 浏览器端到端证据

在 `http://127.0.0.1:5176/` 的实际 UI 中完成：

1. Skills 页显示 `POCKET EARTH · QWEN + MNN`，没有 Public Agents Tab。
2. Plaza 展示完整 `pocket-skill/v1` 安装信息。
3. 安装并装备“碑拓识读与数字复原”；资产由 sidecar 校验。
4. 运行 Base + LoRA，Base 输出“李上上德”、LoRA 输出“李上壇”，一致率 33%；
   Quality Gate 标记 `manual-review`，没有自动覆盖。
5. 运行数字化复原：2.00 秒、mask 30.1%、1 tile、unmasked max delta 0。
6. 地图缩小到全国视野后显示聚合数字，点击后自动放大到区域视野。

## OSS 与生产部署状态

- 阿里云 OAuth 登录恢复后，三个不可变发布清单已全部上传：113 个对象、
  4,079,886,015 bytes。公开 HEAD 逐项核对 HTTP 200、Content-Length、
  `x-oss-meta-sha256`、immutable cache 和 CORS；模型与 ORT 代表对象的 Range 0-0
  返回 HTTP 206。
- OSS 默认域名会对媒体添加 `Content-Disposition: attachment`。最终静态发布
  `20260811-final-v3` 通过独立 HTTPS 素材域名转发，逐项确认无强制下载头；原始对象
  仍在 OSS，Web 与 APK 只按需读取。
- `dist` 从约 137 MiB 裁为 16 MiB；Photos ORT WASM、展品 2.5D/3D、古籍地点库和
  演示素材均不进入首屏或 APK。
- 正式站已部署到 `https://pocketearth.throughtheglass.art/`；`/healthz`、静态 Chunk、
  Qwen DashScope 冒烟请求均通过，Qwen 返回 `POCKET_EARTH_QWEN_OK`。服务器保留
  `/root/pocket-earth-backups/20260811-1152-final.tar.gz` 回滚包。

## 尚未完成且必须真机补证

1. 用调试安装脚本把已经构建的 APK、双 Qwen Base、LoRA 与专业模型安装到目标手机。
2. 在目标手机完成 `runtime_probe`、Travel LoRA、三种视觉 LoRA、OCR 和
   `nativeRestore` 遮罩内修复的真实 decode 与飞行模式核心闭环。修复原生实现已编译进 APK，
   但还没有在比赛手机上跑过，不得宣称为真机完成。
3. 记录加载、首 Token、tokens/s、峰值内存、温度、功耗。
4. 按 `docs/evidence/sme2-ab-protocol.md` 完成同一 Armv9 手机 SME2 OFF/ON A/B。
5. 如需上架应用商店，用用户正式 keystore 生成 release/AAB；当前交付为已签名、可侧载的
   debug APK。

以上真机项完成前，比赛材料必须分别显示：MNN/JNI compiled and packaged、device
decode NOT RUN、SME2 NOT RUN；OSS upload 与 Web deployment 可以如实标记为 VERIFIED。
