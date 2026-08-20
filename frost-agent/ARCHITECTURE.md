# Frost Agent · 决赛架构

Frost Agent 是人格、私有记忆、权限、运行记录和 Skills 的长期容器。书籍、电影、音乐、旅行、看展、古籍 Mapping 与碑拓复原都是可装备的 Skills，而不是相互争夺人格和记忆的多个前台 Agent。

## 1. 分层

```text
Frost Agent
├─ Persona / Private Memory / Permissions
├─ Skill Router
│  ├─ Model Skill：共享 Qwen Base + 可选 LoRA/MNN 专用模型
│  └─ Content Skill：Markdown/规则/工具，不要求 Adapter
├─ pocket-data/v1：可装卸 Data Pack
├─ Deterministic Tools：校验、检索、排序、地理编码、地图落位
├─ Confirm Gate：用户确认后才写入
└─ RunTrace / Device Evidence：执行路径和真机证据
```

## 2. Skill 与 Data Pack 解耦

- `pocket-skill/v1` 描述能力身份、权限、Base/Adapter、资产、门禁、评测和回退。
- `pocket-data/v1` 描述可加载数据；书籍、电影、音乐和 Mapping 使用各自版本化 Schema。
- 卸载 Data Pack 不删除 Skill、个人记录或 Frost 人格。
- 第三方或 AI 只要按协议生成并通过校验，就能被同一 Skill 加载。

## 3. 端云分工

| 层 | 实现 | 责任 |
|---|---|---|
| 端侧 Base | Qwen3 / Qwen3-VL + Alibaba MNN | 意图、选择、短生成、视觉识别、隐私任务 |
| 端侧 Adapter | MNN LoRA / 专用模型 | Travel、古籍、碑拓、复原等领域约束 |
| 云端增强 | DashScope Qwen | 联网检索后的综合、长内容、多来源叙述 |
| 确定性层 | TypeScript/Kotlin/C++ 工具 | Schema、哈希、坐标、排序、安装与写入门禁 |

核心交互必须能在手机本地完成；云端只做显式增强。模型失败时返回真实错误，由规则或手填接管。

## 4. Android MNN 与 SME2

- Web/TypeScript 通过 `capacitorMnnEdge.ts` 调用 `PocketMnnPlugin.kt`。
- Kotlin 只接受 App 私有模型与图片路径或受限 data URL。
- `libpocket_mnn_jni.so` 负责 Qwen/MNN Session、视觉、Adapter、碑拓复原和指标采集。
- 同一 arm64 APK 同时包含安全基线与 SME2 dispatch；运行时检测硬件，不支持 SME2 的手机不会执行 SME2 指令。
- target 2 为 I8MM/NEON 对照，target 3 为 SME2 实验组；切换先释放 Session，再重建 CPU dispatch。

## 5. 可信执行与证据

每次能力调用遵循：

```text
input → router → model/tool → quality gate → suggestion → confirm → write
```

RunTrace 记录业务过程；Device Lab 记录 MNN/SME2 真机性能。正式 SME2 使用 ABBA×2、每模式 20 个计入样本，覆盖固定文本、长上下文、Qwen-VL 视觉和 OCR/LoRA。温度、版本和 Input SHA 变化会使 suite 失效；每个样本立即事务提交到 IndexedDB。

## 6. 数据与发布边界

- 私人原图、票据、足迹、笔记和偏好默认只留本机。
- OSS 只分发公开/授权、版本化、可校验的模型、Skill、Data Pack、缩略图和重 3D 资产。
- 首屏不包含模型、LoRA、全量数据库、原始大图或 3D；按需加载并可卸载。
- DashScope Key、OSS 写凭证和服务器密钥不进入前端、APK、Git 或公开 Manifest。

## 7. 目录映射

- `harness/`：路由、Memory、Brain、Boundary 与事件。
- `edge/`：Qwen/MNN 统一接口、Android 桥和开发 sidecar。
- `provider-compat/`：DashScope Qwen 与 MNN 适配。
- `agents/`：为兼容历史导入保留的领域实现目录；产品语义均视为 Skills。
- `src/app/lib/skill/`：Skill Manifest、资产与生命周期。
- `src/app/lib/dataPack/`：Data Pack 协议、Schema 和运行时。

## 8. Frost 总编排 Harness

Frost 主页面不再只是电台聊天壳。跨 Skill 编排由 `harness/skillRouter.ts` 负责，电台专用低延迟链路继续留在 `harness/router.ts`，两者通过 `FrostContext.surface` 隔离，避免为了升级总控而破坏已稳定的播放逻辑。

```text
用户目标
  → Registry 目录（description + availability）
  → 本地语义指纹 / Not For 快路
  →〔长尾或组合任务〕Qwen 严格 JSON 规划
  → 目标/字段/步数/重复项 Boundary
  → 计划卡（权限、装备状态、确认标记）
  → 用户运行
  → pocket-frost-task/v1 交接
  → 目标 Skill 自己的质量门 / 确认门 / 写入
```

这套结构对应第三章的工程原则：

- `identity.description` 是语义接口，路由器只常驻精简目录。
- 工作流、模型资产和 Data Pack 在命中后才加载，遵循渐进式披露。
- 单领域任务不做无意义拆分；确定性逻辑由代码执行，模型只处理语义长尾。
- 模型返回不是执行命令，必须通过严格 Schema 与当前 Registry 白名单。
- `mark_place / data_pack / restore` 等副作用必须由用户启动，并在目标 Skill 内再次确认。
- `FrostTaskHandoffFrame` 让交接在目标页可见；任务原文只在本机临时保存。

当前真实边界：Frost 已能理解目标、选择一个或多个 Skills、显示计划与权限、阻止未装备能力、把用户确认的任务路由并交接到目标页。它不会绕开各 Skill 的表单、模型安装、质量门或人工确认，因而不是一个拥有无限工具权限的“自动点击器”。
