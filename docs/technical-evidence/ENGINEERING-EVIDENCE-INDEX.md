# 工程技术架构与 Google 技术证据索引

更新日期：2026-07-19<br>
项目：Pocket Earth 口袋地球<br>
Submission ID：349<br>
线上 Demo：<https://pocketearth-google.throughtheglass.art/><br>
代码仓库：<https://github.com/narratorzhang0307/Pocket-Earth-Google><br>
Frost Edge 数字孪生：<https://pocketearth-google.throughtheglass.art/hardware-digital-twin.html><br>
最终演示视频：<http://xhslink.com/o/2hbCI90Mpik><br>
视频直连备份：<https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/Pocket%20Earth%20%E5%8F%A3%E8%A2%8B%E5%9C%B0%E7%90%83.mp4>

本文是 Vibe-a-thon 工程材料的技术取证底稿。它只记录当前仓库已经实现、能够从代码、自动测试、界面或生产状态复核的能力；不把路线图、旧版链上能力或第三方传输包装成 Google 技术。

## 1. 技术结论

Pocket Earth 使用四项直接进入核心链路的 Google 技术：

1. **Google Gemma 3n E2B IT**：浏览器端模型，承担隐私优先的分类、排序、短对话与单图预处理；
2. **Google MediaPipe Tasks GenAI / LlmInference**：在 WebGPU 上加载和执行 Gemma `.litertlm` 权重；
3. **Google Gemma 4 E4B IT QAT Q4_0**：Raspberry Pi 5 实体端模型，承担受限分类、隐私敏感选择和离线降级；
4. **Google Gemini API / Gemini 模型族**：承担复杂多模态理解、多语结构化、跨文化叙事、受来源约束的公共事实调查与独立质疑。

浏览器 Gemma、硬件 Gemma 与 Gemini 形成互补推理平面；MediaPipe 是浏览器端真实运行时。FROST Harness、RunTrace、Public Earth、FactRelay 和 Frost Edge 将这些技术转化为可控产品能力。

## 2. 总体输入—处理—输出

```text
用户文字 / 公开展签 / 照片 / 地点 / 公共候选来源
  → 确定性规则与隐私检测
  → Gemma 端侧分类、排序、短对话或单图预处理
  → FROST Router 判断是否确有必要升级云端
  → 经同意的复杂任务进入 Gemini
  → Schema / Validator / Critic / FactRelay / 地点目录校验
  → 用户确认或人工发布闸
  → Private Earth / Public Earth / Pocket Podcast / Frost Edge
```

四条不可绕过的系统边界：

- Gemma 失败不等于自动上传；
- 模型输出不能直接写私人地球；
- Gemini Investigator 与 Skeptic 不能把自己的输出当作新来源；
- 公共知识模型没有自动发布权限，硬件 Gemma 只在回环端点运行，设备只消费白名单公共事件。

## 3. Google Gemma 3n E2B IT

### 技术与模型

- 技术：Google Gemma 开放模型；
- 模型：Gemma 3n E2B IT int4 Web；
- 权重文件：`gemma-3n-E2B-it-int4-Web.litertlm`；
- 本项目权重大小：`3,038,117,888` bytes；
- 角色：**核心技术**；由浏览器运行时真实加载和执行，技术证据包含模型状态、生成结果、错误与卸载过程。

### 输入、处理与输出

| 环节 | 内容 |
|---|---|
| 输入 | 短文本、候选列表、单张公开展签/图片、system prompt |
| 处理 | 浏览器动态加载权重；MediaPipe `LlmInference` 使用 WebGPU GPU delegate 执行；统一 GemmaEdge 契约约束 prompt 与解析 |
| 输出 | `chat` 文本、`classify` 合法标签、`rank` 0–1 分数数组、`vision` 脱敏文本；异常时返回安全空值并记录 health |

### 产品功能

- FROST Router 的本地意图预分类；
- 候选地点或内容的端侧排序；
- Agents 页“端侧试一句”；
- 看展场景单图视觉预处理；
- 隐私敏感、弱网或无需复杂生成的高频任务本地处理。

### 为什么选择

Gemma 能在浏览器端执行，适合 Pocket Earth 的私人记忆边界。“端侧优先”对应一条可操作、可观察的运行路径：用户可以主动加载、查看进度、试运行、观察失败状态并卸载模型；图片和短文本无需为了预分类先送往云端。

### 如果移除

产品仍可使用确定性规则与手填，但将失去通用端侧语义能力；更多任务只能停在规则兜底，或在用户授权后升级云端。弱网、隐私敏感和本地可解释性会明显下降，“端云双脑”不再成立。

### 代码与自动证据

- 运行时实现：`frost-agent/edge/gemmaEdge.ts`；
- 安全契约：`frost-agent/edge/contract.ts`、`frost-agent/edge/types.ts`；
- UI 入口：`src/app/components/OnDeviceBrainPanel.tsx`；
- 路由调用：`frost-agent/harness/router.ts`；
- 看展视觉收口：`src/app/lib/skills/visionRead.ts`；
- 开发权重 Range：`vite.config.ts`；
- 生产权重 Range：`server.mjs`；
- 自动测试：`frost-agent/edge/gemmaEdge.test.ts`、`frost-agent/harness/router.privacy.test.ts`；
- 技术说明：`docs/technical-evidence/GEMMA-EDGE-TECHNICAL-NOTE.md`。

### 图与 Demo 证据

- 架构图 04：`技术架构图/当前版本审核_04_Google双推理平面_3比4.png`；
- 架构图 05：`技术架构图/当前版本审核_05_Gemma3n端侧可核验证据_3比4.png`；
- 线上入口：`AGENTS → MY AGENTS → Gemma 端侧面板 → 加载 / 端侧试一句`；
- 视频证据：`04:56–06:08` 重点展示 Gemma 3n E2B IT int4 Web、MediaPipe LLM Inference、WebGPU、同源 Range、浏览器端生成、Gemini 按需升级与 LiteRT-LM 迁移边界；`06:52–07:08` 再次总结 Gemma 本机选择与 Gemini 云端生成的分工。

## 4. Google MediaPipe Tasks GenAI

### 技术

- 技术：`@mediapipe/tasks-genai`；
- 核心类：`FilesetResolver`、`LlmInference`；
- 执行设备：WebGPU GPU delegate；
- 角色：**核心端侧运行时**。

### 输入、处理与输出

| 环节 | 内容 |
|---|---|
| 输入 | 同源模型 URL 或用户选择的本机 `.litertlm` 文件、文本 turn、最多一张图片 |
| 处理 | 动态导入 GenAI WASM；创建 `LlmInference`；流式读取权重；使用 GPU delegate 生成；卸载时 `close()` |
| 输出 | Gemma instruction response、加载进度、ready/error 状态；不经过 Node 端推理接口 |

### 为什么选择

MediaPipe 让官方 Web 兼容 Gemma 权重直接在浏览器运行，不需要为“端侧”再部署一个远端推理服务。它与 Web/PWA 形态匹配，并允许推理运行时与业务逻辑通过 `GemmaEdge` 契约隔离。

### 如果移除

3.04 GB 权重即使存在也无法在当前 Web 产品内执行；Agents 控制台、Gemma 分类/排序/看图与端侧隐私路径会退化为规则或手填。模型文件本身不能证明端侧推理。

### 代码与证据

- `frost-agent/edge/gemmaEdge.ts`：动态 import、Fileset、GPU delegate、生成与释放；
- `public/mediapipe/wasm/`：固定版本 WASM；
- `package.json`：`@mediapipe/tasks-genai` 依赖；
- `src/app/components/OnDeviceBrainPanel.tsx`：真实加载和试运行状态；
- `server.mjs`、`vite.config.ts`：模型同源 `HEAD / GET / Range 206`，但没有 `/api/edge` 推理路由。

## 5. Google Gemini API 与 Gemini 模型族

### 技术与模型

| 任务 | 默认模型 | 角色 |
|---|---|---|
| 轻量路由 | `gemini-3.1-flash-lite` | 长尾意图、受控城市抽取 |
| 多语结构化 | `gemini-3.5-flash` | 展品字段、公共来源结构化 |
| 多模态与叙事 | `gemini-3.5-flash` | 经同意的展签云视觉、中英导览、时间线、cultural bridge |
| 复杂合议 | `gemini-3.1-pro-preview` | 显式 `council` / 法庭阶段 |
| 可选图像 | `gemini-3.1-flash-image` | 明信片类图片增强；不影响主闭环 |

Gemini 路由、多模态和叙事是**核心技术**；图像生成是**支持性增强**。

### 输入、处理与输出

| 场景 | 输入 | 处理 | 输出 |
|---|---|---|---|
| FROST 长尾路由 | 用户文本、合法 intent 列表 | Flash-Lite JSON 路由；本地再次校验城市是否真的出现 | 受控 intent 与可选 city |
| 看展结构化 | 已脱敏展签、已有本地字段 | Flash 输出 JSON；Schema、朝代表、器类表与展馆表二次约束 | 名称、年代、材质、器类、展馆等受控字段 |
| 跨文化叙事 | 已知事实、用户语境 | 同一次 narrative 调用；禁止编造和国族性格推断 | 中文策展手记、English guide、时间线、事实型 cultural bridge |
| Public Knowledge | 公开主张与原始来源 | Investigator 与 Skeptic 独立请求；确定性 Truth Score 后进入人工闸 | 来源约束摘要、质疑结论、verdict、可复算版本 |

### 为什么选择

Gemini 同时覆盖图文、多语、结构化 JSON 和跨文化表达，适合“公开展签 → 双语导览 → 空间文化记忆”这条主链。公共知识层复用同一 Google 模型族，但通过 Investigator / Skeptic 分离与确定性裁决避免把语言模型当作事实权威。

### 如果移除

私人地球、确定性规则、Gemma 本地分类、手填和离线目录仍可工作，但复杂展签理解、多语结构化、中英导览、时间线、文化桥、长尾云路由和公共知识双角色审查将失去生成能力。产品会从“跨文化个人知识系统”退化为较强的本地空间整理器。

### 代码与自动证据

- Task 模型表：`frost-agent/harness/taskModels.ts`；
- 云路由：`frost-agent/harness/llmRoute.ts`、`frost-agent/harness/httpBrain.ts`；
- 官方 adapter：`frost-agent/provider-compat/googleGemini.ts`；
- GMI Google-only adapter：`frost-agent/provider-compat/gmi.ts`；
- 生产 provider 与响应 provenance：`server.mjs`；
- 看展补全与叙事：`src/app/lib/exhibition/agent.ts`、`src/app/lib/exhibition/captureGuide.ts`、`src/app/lib/exhibition/curator.ts`；
- 云图片同意：`src/app/lib/privacy/cloudUploadBoundary.ts`、`src/app/components/ExhibitionRunPage.tsx`；
- Public Knowledge 双角色：`src/app/lib/publicKnowledge/review.ts`、`knowledge/agent-harness.mjs`；
- Worker provider 白名单：`knowledge/google-provider.mjs`；
- 自动测试：`frost-agent/harness/taskModels.test.ts`、`frost-agent/provider-compat/provider.test.ts`、`src/app/lib/publicKnowledge/review.test.ts`、`src/app/lib/exhibition/curator.cross-cultural.test.ts`。

### 图与 Demo 证据

- 架构图 04：Google 双推理平面；
- 架构图 06：跨文化看展搭子；
- 架构图 08：公私双地球与 FactRelay；
- 线上看展路径：`AGENTS → 看展搭子 → 输入文字/选择公开展签 → 云视觉二次确认 → 修改草稿 → 确认钉回`；
- 线上公共知识路径：`EARTH → PUBLIC EARTH → 核验详情 / Agent 网络 / 口袋播客`；
- 视频证据：`02:29–03:08` 展示 Gemma、Gemini 分层与 RunTrace；`03:44–04:13` 展示 Gemini Flash 的展签补全、双语导览、时间线与 cultural bridge；`05:40–06:08` 说明云上传二次确认与失败不静默上传。Public Earth 与 FactRelay 是最终视频发布后新增的参赛迭代，使用线上 Demo、源码、自动测试与架构图 08 作为核验证据，不虚构视频时间码。

## 6. FROST Harness：Google 技术的产品化编排

FROST Harness 是自研工程层，负责决定 Google 技术何时被调用以及输出能否改变系统状态。

| 层 | 职责 | 关键位置 |
|---|---|---|
| Shell | 人格、语言和行为原则 | `frost-agent/harness/persona.ts` |
| Memory | 最近对话与脱敏长期画像 | `memory.ts`、`profile.ts` |
| Router | 规则 → Gemma → 隐私闸 → Gemini → 规则 | `router.ts` |
| Brain | 统一云请求与 task 语义 | `brain.ts`、`httpBrain.ts`、`taskModels.ts` |
| Boundary | 动作白名单与 suggest-then-confirm | `validator.ts`、各领域 `pin.ts` |
| Trace | 模型、阶段、耗时、错误与 fallback | `src/app/lib/observe/bus.ts`、`RunTrace.tsx` |

图证据：`技术架构图/当前版本审核_07_Harness_RunTrace_长期记忆_3比4.png`。

## 7. Public Earth、FactRelay 与 Pocket Podcast

### 功能定位

Public Earth 只处理公开来源的候选主张，并与浏览器内私人记忆分库存储、分入口展示。私人地球不会被公开，公共内容也不会自动发布。

### 六步核验

1. Claim Intake：把候选新闻规范为可验证主张；
2. Evidence Scout：保留 URL、日期、发布方并做独立来源判断；
3. Gemini Investigator：只根据给定来源解释支持了什么；
4. Gemini Skeptic：独立检查断章取义、来源洗白、缺失语境与刻板印象；
5. Deterministic Judge：固定公式计算 Truth Score 和状态；
6. Receipt Keeper：保存来源哈希、本地 Merkle 内容根与版本路径。

少于两个独立来源不能进入正式版次或播客。达到阈值也只产生 `review_required`；`automaticPublication=false`，最终发布仍由人决定。

### 代码位置

- 八领域定义：`knowledge/topics.mjs`、`src/app/data/publicKnowledgeAgents.ts`；
- Worker：`knowledge/daily-worker.mjs`、`knowledge/daily-service.mjs`；
- 证据与评分：`knowledge/evidence.mjs`、`knowledge/scoring.mjs`；
- 双角色 Agent：`knowledge/agent-harness.mjs`；
- 版次与 Merkle：`knowledge/archive.mjs`；
- 播客：`knowledge/podcast-agent.mjs`、`src/app/components/PocketPodcastPage.tsx`；
- Web UI：`PublicEarthPage.tsx`、`PublicKnowledgeMap.tsx`、`PublicKnowledgeReview.tsx`、`DailyKnowledgePage.tsx`；
- API：`server.mjs` 的 `/api/knowledge`。

### 当前状态边界

八个领域接口与页面都已实现，但实时内容取决于有效 provider 或历史 snapshot。没有实时数据时返回并显示 `unavailable`；AI 与 Technology 可使用明确标注的 Google 官方离线策展样例，不能表述成八领域均在实时抓取与发布。

## 8. Frost Edge 软硬件共生与 Gemma 4 E4B

Frost Edge 是**核心产品形态与 Google AI 推理平面**。Raspberry Pi 5 本机运行 Google Gemma 4 E4B IT QAT Q4_0；复杂、已授权的公共任务升级到 Gemini；设备 Harness、事件白名单、Validator 与人工确认闸约束最终动作。

### Google Gemma 4 E4B 真机运行时

- 权重：`gemma-4-E4B_q4_0-it.gguf`；
- 大小：`5,154,941,280` 字节；
- SHA-256：`676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`；
- 回环端点：`127.0.0.1:8787/v1`；
- 模型服务：`pocket-earth-gemma.service`；
- 设备 Agent：`pocket-earth-edge.service`；
- 三入口 Launcher：`pocket-earth-launcher.service`。

设备路由顺序固定为 `规则 → Gemma → 隐私边界 → Gemini → Validator / Critic / Confirm Gate`。Gemma 不可用时，规则、目录、缓存和手填路径继续工作；端侧失败不会触发静默云上传。

### 三个入口

- 日落电台：地点、真实日落时刻、歌曲目录、随机骰子与缓存；
- 口袋播客：与 Web 同批已核验公共知识，提供播客、文字模式和离线缓存；
- 地球答案：365 日本地答案、日期锁、揭晓状态与 Public Earth 核验入口。

### 安全边界

- Feed 使用独立 Bearer token、cursor 与 JSONL；
- 只允许白名单公共事件和裁剪字段；
- 私人原文、原图、完整画像、精确坐标和 Gemini / GMI Key 不进入树莓派；
- 模型端点只绑定 loopback，云密钥只存在于 Pocket Earth 服务端；
- 网络失败时继续使用上一有效缓存；
- 当前生产 Frost Feed 默认关闭，线上 Demo 与实体硬件实时连接不在当前能力声明中。

### 代码与证据

- Feed 服务：`frost-feed-service.mjs`；
- 硬件桥：`hardware/frost-edge-google/frost-hardware-bridge.mjs`；
- Gemma 安装：`hardware/frost-edge-google/raspi/install-gemma-edge.sh`；
- Gemma 客户端：`hardware/frost-edge-google/raspi/frost_pi_gemma.py`；
- Gemma systemd：`hardware/frost-edge-google/raspi/pocket-earth-gemma.service`；
- Pi Feed client：`hardware/frost-edge-google/raspi/frost_pi_feed_client.py`；
- 三入口启动器：`hardware/frost-edge-google/raspi/frost_pi_project_launcher.py`；
- 口袋播客同步：`hardware/frost-edge-google/raspi/frost_pi_podcast_sync.py`；
- 地球答案：`hardware/frost-edge-google/raspi/frost_pi_earth_answers.py`；
- 架构图 09：`技术架构图/当前版本审核_09_FrostEdge软硬件共生_3比4.png`；
- 硬件图集：`docs/assets/hardware/boards/` 与 `docs/assets/hardware/whisplay/`；
- 数字孪生：`public/hardware-digital-twin.html`；
- 完整技术说明：`docs/hardware/FROST-EDGE-GOOGLE.md`；
- 自动证据：Feed/Bridge Node 测试、Google Frost Edge Python smoke、模型端点与真机 preflight。

视频 `03:34–04:41` 展示日落电台等产品入口。Frost Edge 三入口、口袋播客同步、离线缓存、Gemma 4 E4B 与实机联调通过源码、数字孪生、硬件图集和真机测试补充核验。最终视频没有完整覆盖实体设备操作，硬件被清楚标注为发布后深化的补充审核证据。

## 9. Provider、模型所有者与传输必须分开

当前代码的选择顺序：

```text
GEMINI_API_KEY 有效
  → Google Gemini API 官方端点

没有官方 Key，但有 GMI_API_KEY
  → GMI OpenAI-compatible transport
  → 只允许 google/gemini-*

两者都不可用
  → 返回结构化空结果
  → 本地规则 / Gemma / 目录 / 缓存 / 手填
```

响应显式暴露 `provider`、`modelOwner` 与 `transport`。备用传输只接受 Google Gemini 模型标识，传输方与模型所有者分别记录，云端不会切换到其他模型族。当前生产 `/healthz` 显示 `gmi-google-fallback`、`google/gemini-3.5-flash`；正式提交前将再次实测并更新，该状态属于可替换的传输层配置。

## 10. 非 Google 支持技术

| 技术 | 用途 | 材料口径 |
|---|---|---|
| Mapbox | 私人/公共地球地图与视觉主题 | 地图基础设施，不纳入 Google AI 技术申报 |
| OpenStreetMap / Open-Meteo | 地理编码、地点、天气等旅行工具 | 辅助数据，不纳入 Gemini tool calling 证据 |
| React / TypeScript / Vite | Web/PWA 产品与构建 | 应用工程基础 |
| IndexedDB / localStorage | 私人空间对象与本地长期记忆 | 单设备本地库，不等于云同步 |
| WebGPU | 浏览器 GPU 执行标准 | MediaPipe / Gemma 的执行基础，按浏览器标准记录 |
| GMI | Google Gemini 模型的可选备用传输 | 必须弱化并与 model owner 分开 |
| KIRI | 可选 3D 重建 | BYOK 增强，不纳入主闭环或 Google 技术申报 |

当前不申报 Firebase、Vertex AI、Google Search Grounding、Flutter、Android Studio 或 Google ADK，因为仓库没有相应真实实现。

## 11. 可复验命令与本轮基线

```bash
npm run typecheck
npm test -- --run
npm run build
npm run verify:knowledge
node --check server.mjs
```

2026-07-19 本地复验结果：

- TypeScript 类型检查通过；
- 52 个 Vitest 文件、1336 项测试通过；
- Vite production build 通过，2246 modules transformed；
- Knowledge verify 通过；
- Frost Feed / Bridge Node 测试 4/4；
- Google Frost Edge 十个核心 Python smoke 通过。

完整 Sunset Radio 历史回归集中仍有一个旧 `pi_command_wake_smoke.py` 预期与当前静音/界面行为不一致，因此材料只报告已经实际复验的 Google 核心 smoke，不写“全部历史硬件测试通过”。

## 12. 工程正式回答的引用方式

在 工程文字中，每项技术至少引用：

1. 一个功能代码入口；
2. 一个边界或测试文件；
3. 一张架构图；
4. 一个线上 Demo 操作路径；
5. 引用已经逐段复核的最终视频时间码；视频未覆盖的后续迭代明确改用线上 Demo、源码、测试和架构图取证。

正式审核材料优先使用带 commit SHA 的永久链接，避免后续行号变化；视频时间码来自最终 MP4、字幕与关键画面的逐段复核，不凭记忆估算。
