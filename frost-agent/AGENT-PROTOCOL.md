# Frost Agent Protocol

Frost 是 Pocket Earth 唯一的前台 Agent。书籍、电影、音乐、旅行、看展、阅读摘录、Book-to-Earth 与碑拓复原均作为可安装、可装备、可卸载的 Skills，由 Frost 规划和路由；它们不各自持有人格、记忆或无限权限。

## 1. 任务入口契约

Frost 接收统一上下文：

- `userText`：本轮目标，只在必要时进入云端规划。
- `history`：最近会话摘要，不包含原图、票据或完整私人数据库。
- `surface`：`frost` 使用跨 Skill 总编排，`radio` 保留低延迟电台指令路由。
- `now/citySlug`：确定性时间与当前城市上下文。

明显的证件、精确住址、医疗和私密照片文本不会静默升级到云端。

## 2. 三层渐进式披露

1. **目录层**：常驻 `identity.name`、`identity.description`、状态与少量用户口语触发词。
2. **流程层**：命中后读取 Manifest 的 target、permissions、quality gate 与 fallback。
3. **执行层**：用户确认运行后，目标 Skill 才加载模型、Adapter、Data Pack、模板或工具。

总路由不会把全部模型说明、知识库、样例和 Data Pack 塞入同一个 Prompt。

## 3. 规划与路由

一次 Frost 请求按以下顺序执行：

1. 读取当前 Skill Registry，区分 `equipped / installed / not-installed`。
2. 用本地语义指纹、排除条件和显式目标做高置信快路。
3. 长尾或组合任务在 Android 上先调用 Qwen/MNN 生成严格 JSON 计划；端侧不可用且允许出端时才调用 DashScope Qwen。
4. Boundary 拒绝未知字段、虚构 Skill、重复目标和超过三步的计划。
5. 单领域任务保持在一个 Skill 内；多个互不依赖领域才并行，有真实前后依赖才串行。
6. 用户点击“运行”后，Frost 以 `pocket-frost-task/v1` 把目标交给对应 Skill 页。

模型只拥有建议权。Frost 不允许模型直接修改地图、数据库、相册或设备状态。

## 4. 权限与确认

`pocket-skill/v1` 的 `permissions.scopes / tools / network_hosts` 是能力边界，不是装饰文案。

- 未登记的 target 永远不能运行。
- 未装备的模型 Skill 先下载并校验 SHA256，不能绕过安装状态。
- `mark_place / data_pack / restore` 等有副作用工具在计划卡上明确标记。
- 真正写入时继续经过目标 Skill 自己的 Schema、质量门、人工确认与回退链。
- 任务交接只写本机 `sessionStorage`，不自动上传。

## 5. Qwen / MNN 分工

- 本地确定性规则：明确目标、权限收口、Schema、去重、数量上限。
- Android Qwen + MNN：隐私输入、轻量分类、视觉识读与 LoRA 专项能力。
- DashScope Qwen：低置信语义规划、长内容和显式联网增强。
- 云端不可用或 JSON 契约不通过：回退本地候选；没有可靠候选就停止，不编造能力。

规划属于轻量结构化任务，使用 Qwen route 模型；视觉、研究与长叙事按各自 task 路由到对应 Qwen 模型。

## 6. 可观察性

Frost 页面只展示可审计事件，不展示模型隐藏推理：

- 目录中 Skill 总数与已装备数。
- 本地路由耗时。
- 是否调用 Qwen、契约是否通过及耗时。
- Boundary 校验结果。
- 确认门或待装备原因。

电台动作继续经过 `validator.ts`；设备 MNN/SME2 性能证据继续进入独立 IndexedDB 验收账本，二者不混为一次推理。

## 7. 新增 Skill

1. 提供合法 `pocket-skill/v1` Manifest。
2. 用 description 写清 What / When / Not For。
3. 声明最小 scopes、tools 与精确 network hosts。
4. 声明 Schema、质量门、fallback 与评测成绩。
5. 提供稳定 target，并在应用导航注册可运行页面。
6. 为“应触发 / 不应触发 / 断网 / 未装备 / 用户取消 / 模型返回脏字段”补测试。

保持 Manifest 接口不变时，内部可以从 Markdown 换成 LoRA、从规则换成 Qwen，Frost 路由与用户操作不需要重写。
