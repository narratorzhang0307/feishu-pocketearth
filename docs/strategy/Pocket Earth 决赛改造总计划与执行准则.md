# Pocket Earth 决赛改造总计划与执行准则

> 文档状态：生效中（唯一执行准则）  
> 基线工程：`/Users/zhangcheng/Desktop/pocket earth 决赛`  
> 生效日期：2026-08-10  
> 规范主文件：本 Markdown  
> Word 文件：同版本阅读与汇报稿；如与本文件不一致，以本文件为准

## 0. 文档效力与变更规则

本文件是 Pocket Earth 阿里决赛版后续改造的唯一策略基线。所有代码迁移、模型切换、Skill 重构、Data Pack 拆分、阿里云 OSS 迁移、UI 适配、性能优化和决赛证据整理，都必须逐条对照本文件执行。

- 后续只允许修改 `/Users/zhangcheng/Desktop/pocket earth 决赛`。
- 桌面和移动硬盘里的其他 Pocket Earth 工程只能读取或比较，不允许被修改。
- 若实施中需要改变架构、模块来源、协议或验收标准，必须先更新本文件，再修改代码。
- 每项改动都必须能对应到本计划中的阶段、目标和验收条件。
- 不做与决赛目标无关的顺手重构，不清理用户原有的无关文件。
- Word 文件是阶段性快照；本 Markdown 是持续维护的规范源。

## 0.1 执行看板（2026-08-11）

| 阶段 | 状态 | 本轮结果 / 证据 |
|---|---|---|
| P0、阶段9 书影音数据解耦 | 已完成并冻结 | 书籍、电影、音乐均按 `pocket-data/v1` 安装、切换、落位和卸载；本轮只做回归 |
| 阶段0 基线冻结 | 已完成 | 基线提交 `848ba12`、脏工作区与模块边界见 `docs/strategy/implementation-baseline-20260811.md`；为保护并行修改未强行切分支或打标签 |
| 阶段1 命名与信息架构 | 已完成 | 一个 Frost Agent + Skills；Public Agents / 公共知识层退出活跃页面 |
| 阶段2 协议与 Registry | 已完成 | `pocket-skill/v1` 严格校验、Registry、生命周期、示例和测试已落地 |
| 阶段3 OSS 与首屏 | 已完成 / 公开复验通过 | 113 个对象共 4,079,886,015 bytes 已上传并校验；静态素材走独立 HTTPS 域名按需加载；首屏 836,075 bytes |
| 阶段4 云端 Qwen | 已完成 | 生产/Vite 共用 DashScope Qwen Provider；旧 Gemini/GMI 接口 410，Gemma Web runtime/依赖已移除 |
| 阶段5 Android Qwen/MNN | 软件构建完成 / 真机受阻 | MNN 3.6.1、12 项 JNI、Java/Capacitor 与双 Qwen3-VL-2B 基座路由已编入 Android 36 arm64 debug APK；目标手机真实 decode、飞行模式和 SME2 A/B 待补 |
| 阶段6 Skills Plaza / RunTrace | 已完成 | Plaza 安装状态、权限、质量门禁、资产生命周期与结构化 RunTrace 已接通 |
| 阶段7 专业 Skills | 已完成可在开发机验证的范围 | 用户指定冻结旅行/看展；碑拓识读与数字复原完成真实 MNN/LoRA/Quality Gate 浏览器闭环 |
| 阶段8 内容 Mapping | 已完成并冻结 | Book-to-Earth 已完成，本轮不重做 |
| 阶段10 UI 适配 | 已完成本轮范围 | Skills、Plaza、模型管理、碑拓与地图维持 Pocket Earth 视觉；移动端浏览器闭环通过 |
| 阶段10A Photos | Web/数据/原生路由完成，真机待补 | 三入口、相册桥、pHash v3、批量索引、中文组合检索、语义索引、偏好、光阴志、Qwen/OCR Quality Gate 与 Android `PocketMnn` 路由已落地；Photos 六轮完成 |
| 阶段11 自动化验收 | Web/Android build 已完成，真机待补 | Photos 六轮及 MNN 追加三轮完成；84 files / 1,481 tests；首屏 836,075 bytes；Android APK 17,237,153 bytes；详见证据文档 |
| 阶段12 决赛证据 | 软件证据已建立，真机项待补 | `docs/evidence/implementation-status-20260811.md`、MNN 双基座 Manifest 与 SME2 A/B 协议 |
| 阶段13 清理发布 | 生产站与侧载 APK 已完成 | 活跃 Google/Gemma/GMI 运行时清理、OSS 实传、生产部署、移动包重资产清理和 debug APK 签名均完成；商店 release keystore 与真机记录待补 |

统一证据索引：`docs/evidence/implementation-status-20260811.md`。任何“已完成”只覆盖
其中列出的可复验环境；Android JNI 已完成静态编译和 APK 装包，但真实端侧 decode、
飞行模式、OSS 实传或 SME2 不得由桌面结果推断。

## 1. 决赛目标与赛事对齐

Pocket Earth 决赛版要成为一款在手机上运行的创意 AI 应用，并证明以下能力：

- 至少使用一款 Qwen 系列模型。
- 核心交互逻辑支持手机端本地运行。
- 使用 MNN 承载端侧推理，并在目标 Armv9 手机上形成 SME2 开关 A/B 证据。
- 支持多模态感知、思考和执行。
- Frost Agent 能安装、装备、调用和卸载不同 Skills。
- Skill 与数据源解耦，可加载我们的数据，也可加载遵循协议的第三方数据。
- 云端 Qwen 只承担重型生成、最新资料和端侧能力之外的增强任务。
- 应用首屏轻量，不因图片、模型、3D资产或全量数据库一次性加载而卡顿。

## 2. 不可改变的工程边界

### 2.1 唯一工作目录

唯一允许修改的目录是：

```text
/Users/zhangcheng/Desktop/pocket earth 决赛
```

### 2.2 三套工程的职责

1. `pocket earth_google`：唯一产品基线。
   - 保留现有产品模块、地图、书影音、照片、展览、旅行规划、视觉语言和交互闭环。
   - 当前“pocket earth 决赛”已经以该工程为基线。
2. 移动硬盘 `Pocket-Earth-GMI`：只读技术参考。
   - 参考 Qwen Provider、`/api/edge`、MNN 构建脚本和端侧降级路由。
   - 不整体复制，不把 GMI 优先云路由带回决赛版。
3. `/Users/zhangcheng/Documents/上街去`：选择性能力来源。
   - 迁移成熟的 LoRA Skill、MNN Adapter、模型资产管理、Skills Plaza、Quality Gate、RunTrace 和专业 Skill 后端。
   - 不整体覆盖 Pocket Earth，不照搬其前端。

### 2.3 重复模块替换原则

同类模块按以下顺序替换：

1. 建立旧模块到新模块的映射。
2. 复制必要代码并完成 Pocket Earth 适配。
3. 接通新入口和测试。
4. 验证功能、数据、权限和回退。
5. 删除被替代的旧实现及其残留导入。

禁止在正式版本中长期保留两套互相竞争的实现。

## 3. 核心产品概念

### 3.1 Frost Agent

Frost Agent 是用户长期拥有的本地智能体，是人格、记忆、权限、运行记录和能力的容器。决赛叙事中保留 Frost Agent 概念，但不再把具体功能称为“子 Agent”。

### 3.2 Skill

Skill 是 Frost Agent 可安装、可验证、可装备、可调用、可回滚和可卸载的能力。

对用户只展示两种主要形态：

1. 知识/工作流 Skill
   - 由 Markdown、JSON、RAG、结构化地点、规则和工具构成。
   - 适合书影音、城市文化、美食、展览内容和路线数据。
2. 专业模型 Skill
   - 由共享 Qwen Base、LoRA Adapter 或专用 MNN 小模型构成。
   - 适合古籍识读、碑拓、展品抠图、数字复原和严格旅行规划。

“混合 Skill”只是运行时组合方式，不作为第三个前台概念。

### 3.3 Data Pack

Data Pack 是可独立安装、启用、停用、更新和卸载的数据包。Skill 负责“如何处理”，Data Pack 负责“处理什么”。

### 3.4 OSS 的定位

阿里云 OSS 是模型、Skill、Data Pack、图片、音频预览和3D资产的分发层，不等于云端推理。模型从 OSS 下载到手机后，仍由 MNN 在本地运行。

### 3.5 决赛版总体关系

```text
Frost Agent
  └─ Skill Router
      ├─ 知识/工作流 Skill
      ├─ Qwen Base + LoRA/MNN Skill
      └─ Quality Gate + Fallback + RunTrace
          ├─ 本地 Data Pack / 本地索引
          ├─ OSS 可安装资产
          └─ 按需云端 Qwen 增强
```

## 4. 协议先行

### 4.1 `pocket-skill/v1`

每个 Skill 至少声明：

- `protocol`：固定为 `pocket-skill/v1`。
- `identity`：ID、名称、作者、版本、类型和能力摘要。
- `runtime`：Markdown、LoRA、MNN 或组合方式。
- `base`：Qwen Base ID、revision、tokenizer、量化方式和视觉预处理。
- `assets`：文件角色、OSS地址、格式、大小、SHA256和是否必需。
- `interface`：输入、输出、可调用工具和结构化 Schema。
- `data_dependencies`：所需或可选 Data Pack。
- `permissions`：相机、位置、地图写入、网络和存储等最小权限。
- `quality_gate`：质量判断条件。
- `fallback`：LoRA、Base、重拍、规则和停止之间的回退顺序。
- `evaluation`：固定测试集、指标和通过阈值。
- `distribution`：安装、升级、回滚和卸载信息。

验收要求：

- 不兼容的 Base、revision、预处理或文件哈希必须拒绝加载。
- Skill 卸载后不得遗留 Adapter、无主索引或失效入口。
- 私人数据不得随 Skill 发布。

### 4.2 `pocket-data/v1`

每个 Data Pack 至少声明：

- `protocol`：固定为 `pocket-data/v1`。
- `identity`：pack ID、名称、版本、作者和说明。
- `schema`：数据 Schema 版本和对象类型。
- `files`：JSON、JSONL、SQLite、向量索引、图片和媒体清单。
- `distribution`：OSS地址、文件大小、SHA256和压缩格式。
- `spatial`：WGS84、GCJ-02等坐标系和空间索引说明。
- `provenance`：来源、版权、许可证和采集时间。
- `privacy`：公开、私有或受限。
- `compatibility`：兼容的 Skill 和最低运行时版本。
- `indexes`：结构化索引、语义索引和空间索引。
- `sync_policy`：更新、增量同步和撤回策略。

验收要求：

- 卸载 Data Pack 不得删除 Skill。
- 更换 Data Pack 不需要复制或重装整个 Skill。
- 第三方数据遵守协议后即可加载。
- 数据包必须能够独立校验、停用、恢复和彻底删除。

## 5. 分阶段实施计划

## 当前优先里程碑 P0：书籍与电影 Skill 数据解耦

> 状态：已完成（2026-08-10）  
> 优先级：先于原阶段0—13执行  
> 音乐：本里程碑验收完成后单独实施

### 决策

- 书籍 Skill 和电影 Skill 只保留识别、检索、推荐、整理、地理落点与地图写回能力，不再内置某一位用户的固定数据库。
- 当前书籍与电影演示数据写入后端 SQLite，作为可替换的数据真源。
- 面向应用和第三方交换统一使用 `pocket-data/v1`，SQLite 不作为跨设备交换前提。
- OSS 发布物采用不可变版本路径，由轻量 Manifest 引用分块记录；用户触发安装后才下载。
- 浏览器把已安装数据包保存到 IndexedDB，可独立启用、切换、停用和卸载；卸载数据包不得删除 Skill。
- 允许用户导入本地单文件 Bundle，或输入 OSS/HTTPS Manifest URL 安装数据包。
- 其他用户可把公开协议交给自己的 AI；只要 AI 产物通过同一 Schema、哈希与兼容性校验，即可走与官方示例数据完全相同的导入链路。

### 本里程碑交付物

- `pocket-data/v1` 规范、JSON Schema、AI 整理提示模板和最小示例。
- 书籍 `pocket.books/v1` 与电影 `pocket.movies/v1` 记录 Schema。
- SQLite 建库、第三方包校验、分块导出与 OSS 上传脚本。
- 书籍和电影两个默认 Data Pack 的 OSS Manifest、分块数据及 SHA256 清单。
- Pocket Earth 内的数据包管理入口：URL导入、本地导入、启用、切换和卸载。
- 书架、片库、推荐上下文、检索索引和地球点位全部读取当前启用的数据包。

### 验收

1. 应用首屏和 Skill 代码包不再静态导入全量书籍、电影 JSON。
2. 安装默认书籍包后，书架、读书推荐、已读判断和书籍地图点恢复。
3. 安装默认电影包后，片库、电影推荐、已看判断和电影地图点恢复。
4. 卸载书籍或电影数据包后，对应 Skill 入口和新增记录能力仍然存在。
5. 导入一个遵循协议的第三方小型数据包后，无需改代码即可替换对应内容。
6. Manifest、每个数据分块和单文件 Bundle 均可独立校验协议、Schema、记录数、大小和 SHA256。
7. OSS 对象使用不可变版本路径和长期缓存；Manifest URL 可由环境配置替换。
8. 私人账号标识、密钥、原始导出文件和未授权内容不进入公开包。

### 完成记录

- 后端 SQLite 真源已生成并验证：书籍 1,055 条、电影 2,124 条。
- `pocket-data/v1` 规范、两类记录 Schema、第三方 AI 整理指南和示例 Bundle 已交付。
- 18 个发布文件共 3,203,947 bytes，已上传到阿里云 OSS 不可变路径 `pocket-earth/data-packs/releases/20260810-books-movies-v1/`。
- OSS Manifest、分块对象、长期缓存和 CORS 已通过真实 HTTPS 与浏览器校验。
- 书籍与电影 Skill 均支持 URL/OSS 安装、本地 Bundle 导入、切换、停用和卸载；Skill 与数据生命周期相互独立。
- 全量测试 1,344 条通过，TypeScript 类型检查、SQLite/Data Pack 一致性检查和生产构建通过。
- 详细发布地址与复验命令见 `docs/protocols/书籍与电影Skill数据解耦交付说明.md`。

## 阶段0：冻结 Google 基线

### 执行

- 记录当前 Git 提交、工作区状态和文件清单。
- 保留用户已有的未提交文件和无关变更。
- 建立决赛改造分支及阶段标签。
- 记录现有类型检查、测试和构建基准。
- 建立“源工程—目标模块—替换状态”清单。

### 当前基准

- TypeScript 类型检查已通过。
- 52个测试文件、1336项测试已通过。
- 当前决赛目录与 Google 基线主体一致。

### 验收

- 任意阶段都能追踪改动来源和原因。
- 不修改其他 Pocket Earth 目录。

## 阶段1：统一命名与信息架构

### 执行

- 前台“子 Agent”统一改为“Skill”。
- 将现有 Agents 能力广场改造成 Skills 页面。
- Frost Agent 保留为唯一智能体主体。
- 内部旧类型先增加兼容层，避免一次性大范围重写。
- 稳定后清理 `installAgent`、`SpaceAgent` 等失去产品意义的旧命名。

### 目标页面

- 我的 Frost Agent
- 已装备 Skills
- Skills Plaza
- Skill 运行记录
- 模型与 Data Pack 管理

### 验收

- 用户理解为“一个 Frost Agent 不断装备 Skills”。
- 前台不再出现容易误解的“多个子 Agent”叙事。

## 阶段2：建立协议、注册表和兼容校验

### 执行

- 定义 `pocket-skill/v1` 和 `pocket-data/v1` TypeScript Schema。
- 提供 Markdown Skill、LoRA Skill、混合 Skill 和 Data Pack 示例 Manifest。
- 建立 Skill Registry、Data Pack Registry 和版本迁移器。
- 建立权限审查、Base兼容、SHA256和签名检查。
- 建立统一安装状态：未安装、下载中、校验中、已安装、已装备、失败、可更新。

### 验收

- 示例包能完成安装、启用、停用、升级、回滚和卸载。
- 非法或不兼容包被明确拒绝，并展示原因。

## 阶段3：阿里云 OSS 与首屏性能改造

### 3.1 迁移范围

所有可公开分发的重资产迁移到 OSS：

- 图片原图和缩略图
- 展品素材
- GLB、Gaussian Splat和深度图
- Skill压缩包
- LoRA Adapter
- MNN模型
- 书影音演示数据包
- 动物头像
- 城市包
- 音频封面和预览素材

用户私人照片、足迹、向量库、画像和私人笔记默认留在本地；需要同步时进入私有 OSS，通过 STS 或临时签名地址访问。

### 3.2 OSS对象结构

```text
skills/{skill_id}/{version}/manifest.json
skills/{skill_id}/{version}/assets/{sha256}
data/{pack_id}/{version}/manifest.json
data/{pack_id}/{version}/chunks/{sha256}
models/{model_id}/{revision}/{filename}
images/{category}/{sha256}/thumb.webp
images/{category}/{sha256}/full.webp
exhibits/{asset_id}/{version}/preview.webp
exhibits/{asset_id}/{version}/model.glb
```

### 3.3 加载规则

首次打开只加载：

- App Shell
- 当前页面代码
- 地图基础配置
- 当前视野内的轻量地点摘要
- 小尺寸缩略图

首屏禁止加载：

- Qwen模型
- LoRA Adapter
- 全量书影音数据库
- 原始大图
- 3D/Splat资产
- 全部地图点位
- 未访问页面的代码

实现要求：

- 地图按视野范围、缩放层级和分页加载。
- 先显示聚合点，再按需加载地点详情。
- 图片使用 WebP/AVIF 缩略图，进入详情才加载大图。
- 3D展品先显示预览图，用户进入2.5D/3D后才加载模型。
- Skill先下载 Manifest，用户确认安装后再下载必需资产。
- Qwen Base只保存一份，Adapter按Skill单独下载。
- 下载支持进度、取消、断点续传、SHA256校验和卸载。
- Service Worker只缓存已使用资源，不预缓存完整OSS。
- 哈希资产使用长期缓存，Manifest使用短缓存和ETag。
- 公共资源走OSS CDN；私有资源使用短期签名URL。
- OSS访问密钥不得进入浏览器包、源码、截图或录屏。

### 3.4 当前重点对象

- `public/mediapipe/wasm` 三个WASM合计约81MB。
- `public/exhibits/preset-nike.splat` 约8.7MB。
- `src/app/data/douban-movies.json` 约0.88MB。
- 其他图片、演示素材和硬件材料按清单迁移。

MediaPipe/Gemma必须等Qwen/MNN链路验证通过后再移除或改为可选下载。

### 验收

- 首屏网络请求没有 `.mnn`、LoRA、Splat或全尺寸图片。
- 首屏不读取完整书影音数据库。
- 弱网下可以先进入地图和基础页面。
- 已安装的模型、Skill和Data Pack可离线使用。
- 下载失败不会导致应用白屏。

## 阶段4：云端模型切换为 Qwen

### 执行

- 建立统一 Qwen Provider。
- 服务端代理调用阿里云百炼/DashScope。
- API Key仅存在服务端环境变量。
- 替换 Gemini/GMI 文本、视觉和任务路由。
- 模型名称配置化，不硬编码在页面。
- 保留统一任务类型：route、narrative、vision、multilingual、planner和restoration explanation。

### 切换顺序

1. Qwen Provider和测试完成。
2. 并行接入现有页面。
3. 与旧链路做输出对照。
4. Qwen稳定后删除Gemini/Gemma/GMI活跃代码。
5. 清理环境变量、旧接口和旧文案。

### 验收

- 没有GMI Key时决赛核心功能仍可运行。
- 网络请求不再调用GMI。
- 云端失败时回退端侧或确定性规则，不伪装成功。

## 阶段5：完成端侧 Qwen + MNN

### 来源

- 旧GMI：接口和MNN构建脚本参考。
- “上街去”：LoRA、模型资产状态和扩展运行时。
- 决赛版：补齐Android原生桥接和真实验证。

### 执行

- 当前文本/旅行链路采用 Qwen3-VL-2B language MNN export，视觉链路采用独立的
  Qwen3-VL-2B INT8 vision export；两者由不可变 Manifest 固定，不能混装。
- 双基座是既有 Travel 语言 LoRA 与古籍/碑拓/OCR 视觉 LoRA 的 Base 哈希不兼容所需；
  若未来把全部 Adapter 重训到同一 Base，再以真机质量和内存证据决定是否合并。
- 实现Android原生MNN/JNI/Capacitor桥接。
- 实现模型安装、加载、卸载和真实健康检查。
- 健康检查必须完成一次实际推理，不能只检查配置文件存在。
- 同一时刻默认只激活一个LoRA Adapter。
- 端侧负责Skill路由、用户意图、权限判断、简短解释、结构化抽取、Quality Gate和回退决定。
- 重型生成或最新资料才访问云端Qwen。
- 记录加载时间、首Token、tokens/s、峰值内存、温度和功耗。
- 在目标Armv9手机上执行SME2开关A/B。

### 验收

- 飞行模式完成至少一个核心闭环。
- UI和RunTrace能证明本次由端侧Qwen/MNN完成。
- SME2有真实运行日志和对照数据。
- OSS只承担模型分发，下载后推理在本机完成。

## 阶段6：Skills Plaza 与生命周期

### 执行

- 迁移“上街去”的Plaza能力和动物头像。
- 使用Pocket Earth的地图、卡片、配色和动效重新适配。
- Skill卡片展示作者、版本、能力、Base依赖、大小、权限、测试结果和安装状态。
- 支持发布、安装、下载、校验、装备、切换、停用、回滚和卸载。
- 公共伙伴只公开Skill ID、版本、作者、摘要和允许动作，不传播私人数据。

### RunTrace字段

- Skill ID和版本
- Qwen Base revision
- Adapter或专用模型版本
- 本地或云端路径
- 输入来源摘要
- 使用工具
- Quality Gate结果
- 回退原因
- 用户确认状态
- 最终写入对象

### 验收

- 任意一次Skill调用都可追踪。
- 安装、升级、回滚和卸载后状态一致。
- 权限不足或包不兼容时明确拒绝。

## 阶段7：专业 Skills 迁移与替换

| 能力 | 前端保留来源 | 后端/运行时来源 | 决赛改造 |
|---|---|---|---|
| 看展搭子 | Pocket Earth展览页面 | “上街去”LoRA、抠图、2.5D | 替换重复后端，保留Pocket Earth UI |
| 展品2.5D | Pocket Earth展品详情 | 多视图、深度、Builder | 预览优先，资产按需从OSS加载 |
| Full 3D | Pocket Earth现有3D入口 | GPU/KIRI/PAI链路 | 作为可选云端增强，不阻塞2.5D |
| 古籍识读 | Pocket Earth书籍/地图页面 | 古籍LoRA + Base回退 | 保留原页、识读、候选和确认分层 |
| 碑拓恢复 | Pocket Earth地点卡片 | 碑拓LoRA + Quality Gate | 低置信度自动回退 |
| 数字化复原 | Pocket Earth展品详情 | 修复模型/算法 | 原图和修复建议同时保存 |
| Travel Planner | Pocket Earth现有规划UI | “上街去”Planner LoRA与协议 | 保留前端，替换规划引擎 |
| Skills Plaza | Pocket Earth整体视觉 | “上街去”Plaza与动物头像 | 重做组件和动效适配 |

每个Skill按以下顺序迁移：

1. 复制必要模块。
2. 改成统一Manifest。
3. 接入OSS资产。
4. 接入RunTrace。
5. 接入Quality Gate。
6. 运行固定测试。
7. 切换页面入口。
8. 删除被替代旧实现及其残留导入。

## 阶段8：将古籍 Mapping 泛化为任意内容 Mapping

新能力暂定名：

**Book-to-Earth Mapping / 内容落地球**

统一流程：

```text
导入书籍或资料
→ OCR/文本解析
→ 人物、地点、事件候选
→ 地理编码
→ 来源与可信度检查
→ 用户确认
→ 生成Data Pack
→ 写入知识地图
```

支持范围：

- 古籍
- 现代小说
- 游记
- 历史资料
- 电影剧本
- 音乐及相关地点
- 个人笔记
- 展览图录

古籍是专业预设，不再是整个Mapping能力的唯一对象。

### 验收

- 同一Mapping Skill可以分别加载古籍和现代书。
- 卸载某本书的数据包后，Mapping Skill仍然存在。
- 地图点位带来源、页码、置信度和用户确认状态。

### 实施状态（2026-08-10）

- 已将原 `AGENT-FORGE` 入口替换为 `BOOK-TO-EARTH / 内容落地球`；旧“说一句话造 Agent”页面不再作为活跃实现。
- 已迁移“上街去”的载体路由、古籍/碑拓/通用视觉 LoRA 选择、整页识读、重叠复核、OCR 完整性门禁与断点恢复能力，并统一套用 Pocket Earth 的移动端 UI。
- 已实现 PDF 文字层优先、扫描页和图片才进入 `Qwen3-VL-2B + routed LoRA`；指定 Adapter 未安装时失败闭合，不允许共享 Base 冒充 LoRA。
- 已建立 `pocket.mapping/v1` Data Pack Adapter、Schema、示例、AI 制作模板和严格校验器。地点必须保留原文、页码、来源 SHA256、坐标、置信度和人工确认，未经确认的候选不能装包。
- 已接入本地 Qwen 原文候选筛选、可选云端 Qwen 疑难地名增强、本地 Data Pack/OSM 坐标候选和人工确址闸门；云端只接收地名与必要短句，不上传整本文件或原图。
- 已接入 Mapping Data Pack 的安装、切换、卸载和地图图层开关；卸载数据包会移除对应地图点，Mapping Skill 与本地断点仍保留。
- 已为地图点加入原文引文、页码、关系、地点状态、置信度、资料来源和可核验链接详情。
- PDF/EPUB/视觉 Mapping 代码已改为进入 Skill 时按需加载，不进入 Skills 首页首屏执行路径。
- 协议、Registry 与 Mapping 核心共 21 项定向测试通过，TypeScript 检查与 Web 构建通过。
- 本地浏览器闭环样本把 10 个原文地点筛到人工闸门，篇名、否定示例和 UI 术语噪声被拒绝；确认 1 个地点后安装包使地图标记数 `3460 → 3461`、图层显示 `内容 ON`，卸载后恢复 `3460 / 内容未加载`，而 `BOOK-TO-EARTH` Skill 入口仍保留。
- 扫描古籍/碑拓 LoRA 的连续吞吐、内存与 SME2 A/B 仍须在决赛真机上补最终证据。

## 阶段9：书影音和数据库解耦

### 执行

- 书籍与电影部分由优先里程碑 P0 先行完成；本阶段复核协议兼容性与回归结果。
- 将音乐、照片等其余演示数据改成独立Data Pack。
- 增加Data Pack管理页。
- 展示已启用、已停用、版本、来源和更新时间。
- 支持单独刷新、停用、卸载和本地索引重建。
- 支持第三方Data Pack导入。

### YouTube链路

- 作为概念验证能力继续保留。
- 仅在用户触发后请求。
- 不在首屏预加载。
- 不将转换内容批量缓存进安装包或公共数据包。
- 与音乐Skill解耦，允许未来替换数据源。

### 关键演示

1. 安装“杭州音乐地图”Data Pack。
2. 音乐Skill显示对应地点。
3. 卸载Data Pack。
4. 音乐Skill仍然存在。
5. 安装另一兼容数据包后恢复内容。

## 阶段10：Pocket Earth UI适配

### 原则

- 不照搬“上街去”整套页面。
- 只迁移能力、状态组件和必要交互。
- 所有模块重新套用Pocket Earth的地图、卡片、颜色、间距和动效。
- Travel Planner保留Pocket Earth现有前端。
- 不因术语替换破坏用户熟悉的主流程。

### 统一运行状态

- 本地Qwen
- 云端Qwen
- 当前Adapter
- 使用的Data Pack
- Quality Gate结果
- 是否发生回退

### 验收

- 新能力看起来属于Pocket Earth，而不是嵌入的另一套产品。
- 手机窄屏、刘海、安全区和触控均通过验证。

### 旅行规划先行状态（2026-08-10）

- 已保留 Pocket Earth 原 `TravelRunPage` 的目的地、日期、偏好、天气、票务、路线卡和地图写回 UI。
- 已迁移“上街去”经真实 MNN 验证的 `Qwen3-VL-2B + Travel Planner LoRA`、语言适配器哈希清单与 sidecar。
- 已接入 `pocket.travel-intent/v1` 协议门控：LoRA 只解析需求，显式 UI 字段不可被模型覆盖。
- 已把书籍、电影和音乐 Data Pack 定位为可卸载的口味信号；它们不成为 LoRA 权重或未经证据的旅行地点。
- 已提供 `Travel LoRA / 规则回退` 的真实状态和 Qwen RunTrace 徽章；MNN 不可用时不让 Gemma/Base 冒充 LoRA。
- 69MB Travel LoRA 已进入带版本号与 SHA256 的阿里云 OSS 不可变发布，不进入网页首屏、`public/dist` 或 APK；端侧安装器按需下载，并在激活前核对固定大小与 SHA256，失败时继续显示规则回退而不冒充 LoRA 成功。

## 阶段10A：Photos 端侧个人照片雷达

详细执行、测试矩阵、阶段门与真机证据清单见：`docs/strategy/Photos-端侧照片雷达实施计划与验收清单.md`。本节负责产品定案，详细清单负责逐项验收；未在清单中取得代码、测试或真机证据的能力不得标记完成。

### 产品定案

Photos 不再被定义为“AI 相册清洁工”，而是“完全在手机上的个人照片雷达”。它负责感知照片里有什么、把几千张照片压缩成少数需要用户决定的问题，并逐渐学习个人偏好；删除、归档、落点和地点修正始终由用户最终确认。

Photos 根页面固定为三个入口：

1. **待你决定**：按连拍代表、疑似重复、技术问题、待提取票据和可落地球照片生成少量建议组。所有数量必须来自真实本地索引，不用静态演示数字冒充扫描结果。
2. **找照片**：支持“去年杭州拍的猫”“所有停车票据”“带二维码的照片”“东京旅行中有朋友的照片”“没有 GPS 但像西湖的照片”等自然语言查询。结果来自本地元数据、视觉标签、OCR 文本和本地向量/排序索引；网络不可用时仍可完成核心查询。
3. **光阴志**：保留现有“时间 / 杂志 / 日历”视觉，但数据源逐步切换为用户已授权的本地索引和已确认照片。它是整理后的结果层，不承担自动清理职责。

旧文案中的“AI 价值分”退出活跃页面和动作门禁，替换为可解释的独立字段：

- `technicalQuality`：清晰度、曝光、构图可用性等相对客观指标。
- `similarRepresentative`：在重复/连拍组内是否为技术代表，不等同于用户最喜欢。
- `personalAffinity`：端侧个人偏好模型给出的相对排序。
- `reasons[]`：为什么建议，必须对应真实特征或模型输出。
- `confidence`：置信度不足时只进入待确认，不得自动执行。

### 系统相册与数据边界

- 决赛 Android 包使用 Capacitor 原生桥接读取系统媒体库；Web/PWA 只提供用户主动选择文件的降级入口，不宣称浏览器能一键枚举整个手机相册。
- 授权后先索引 `assetId`、媒体类型、拍摄时间、尺寸、收藏状态、GPS 和缩略图引用；默认不把原片复制进应用，也不把原片、缩略图、EXIF、OCR、向量或画像上传到公共 OSS。
- 列表与批处理只请求缩略图；查看原图、精细 OCR 或用户确认导出时才按资产 ID 临时读取原片。
- Android 权限支持“选择的照片 / 全部照片 / 拒绝”；拒绝或权限收回后保持已有派生索引可见，并提供重新授权和本地索引清除入口。
- 删除只能生成建议清单。即使接入系统删除 API，也必须再次显示系统确认，不允许后台或批量静默删除。

### 端侧感知与路由

处理顺序固定为由轻到重的漏斗：

```text
系统元数据 / EXIF
→ 缩略图 dHash + pHash、模糊、曝光、颜色与时间邻近
→ 重复 / 连拍 / 事件聚类
→ 本地轻量视觉标签或向量召回
→ 只对不确定候选调用 Qwen3-VL-2B MNN
→ 票据基座 OCR
→ 仅反光、划痕、小字等难例进入 general-ocr Visual LoRA
→ Quality Gate 选择基座结果、LoRA 结果或人工确认
```

- Qwen3-VL 基座负责代表图内容理解、票据路由和疑难标签，不对全相册原片逐张高分辨率扫描。
- 现有 `general-ocr-vision-lora` 只作为难例 Adapter。已知证据显示它改善 stress 文档、但会让 clean 文档退化；因此普通票据优先使用基座，LoRA 结果不得无门禁覆盖基座。
- 密集页在开发机上可能超过 120 秒，不能进入后台全库扫描关键路径。
- 新照片 LoRA 不进入决赛关键路径。只有固定盲测证明基座分类不足且时间允许时，才训练 `photos-router-v1`；不得用 LoRA 学习单个用户的“好照片”审美。

### 个人偏好模型

- “清晰/曝光正常”和“我更喜欢”是两类问题，UI、数据字段和排序必须分离。
- 个人偏好采用本地小型成对排序模型，从用户在同组照片中的保留、换代表、收藏、落地球和明确清理行为增量学习。
- 首版输入使用可解释特征和视觉标签；后续可加入 MobileCLIP embedding。模型参数只存端侧，支持清空和重新学习。
- 训练样本必须来自用户主动选择，不把“未点击”当负样本；样本不足时显示“尚未形成个人偏好”，不伪造高置信度。

### 感知—思考—执行闭环

1. 感知：系统相册资产、EXIF/GPS、缩略图视觉、OCR 和自然语言查询。
2. 思考：客观质量、重复/连拍聚类、语义召回、个人偏好排序和置信度门禁。
3. 建议：换连拍代表、归档票据、补地点、保留或加入待清理清单。
4. 确认：用户逐组确认或跳过；所有可逆建议与不可逆系统动作分开。
5. 执行：确认后的照片可写入现有 `mark_place` / `userMarks(kind:'photo')` 总线并出现在 Pocket Earth；原片仍留在系统相册。
6. 学习：只把用户的明确选择写入本地偏好模型，并允许撤销或清空。

### RunTrace 与比赛证据

每次照片任务至少记录：

- 相册授权范围、枚举资产数和缩略图读取数，不记录私人文件名或 OCR 正文。
- 元数据、像素/dHash/pHash、聚类、轻量视觉、Qwen3-VL、Base OCR、OCR LoRA、Quality Gate 和人工确认各阶段耗时。
- 真实后端、模型 ID、MNN 版本、Adapter ID、内存峰值、是否降级以及实际启用的加速能力。
- `SME2` 只能在目标真机日志明确证明启用后展示为已启用；当前 `ARM64/arm82` 证据不得改写成 SME2 已验证。

### 决赛主演示

1. 在手机上授权选定照片或系统相册，立即显示本地缩略索引，并明确“原片未复制、未上传”。
2. 搜索“猫和票据”，展示本地命中的猫、停车票和登机牌。
3. 用 Qwen3-VL 识别其中一张票据；普通样本走基座，难例才展示 OCR LoRA 与 Quality Gate。
4. 打开一组连拍，同时显示“技术代表”和“更符合你的偏好”，允许左右换选。
5. 用户确认一张带 GPS 的照片，写入 Pocket Earth 地图落点。
6. 展开真实 RunTrace，展示 Qwen3-VL-2B、MNN、Adapter、耗时、内存、降级路径和目标机 SME2 实测状态。

### 当前实施状态（2026-08-11）

已形成可运行的 Web/数据层纵向闭环：

- `PhotosTab` 已固定为“待你决定 / 找照片 / 光阴志”；原静态时间/杂志/日历被保留为明确标注的设计样刊，真实光阴志只读取用户明确 `chronicleIncluded` 的本地资产。
- Capacitor 8.5 Android 工程、Capgo 相册桥、分页/断点/暂停/恢复、missing/权限收回、320px 缩略图和按需原片均已接入；`ACCESS_MEDIA_LOCATION` 使用独立原生插件并已在 `MainActivity` 注册。
- 全局重复/事件聚类已跨分页重建，`duplicateOf` 使用稳定 asset key；独立 TypeScript pHash 已升级为 v3 并为旧 v2 记录提供一次性迁移；技术代表、个人偏好和用户代表互不覆盖。
- 首个决赛语义模型固定为 CLIP ViT-B/32：224px 缩略图、512 维向量、对称 int8、版本化 IndexedDB、cache-only 文本查询。首次安装需要网络，安装后核心查询可从本地缓存运行；当前不把它包装为 MobileCLIP 或 MNN。
- 语义查询采用 20 条会话 LRU、非可重入文本塔串行和 latest-query-wins；只有 full + authorized 快照可回收孤立向量，limited 与超过 20% 的大批差异不会触发自动清理。
- Qwen3-VL 照片路由已固定结构字段、隐私风险和严格枚举；非 MNN、非 JSON、缺字段或非法枚举均失败闭合并保留便宜分析。
- 通用 OCR v6 已在真实 MNN sidecar 上验证基座/Adapter 哈希、共享硬链接和运行时补丁。synthetic stress 的 LoRA CER 优于 Base，但金额字段退化；因此关键字段冲突时强制人工复核，不能只看模型自报 confidence。
- 个人偏好冷启动为 10 组本地二选一，少于 10 次不显示个人分，支持跳过、撤销与独立清空；任何学习都不修改 `technicalQuality`。
- 照片派生索引与个人偏好可独立清除；地球 pin 使用 `assetKey + contentHash` 双键，重复确认幂等并保留本地资产引用。
- Photos 已完成六轮定向检查：pHash/索引、失败与迁移、Android transport、5000 条复杂度、中文查询/权限变化、手机 Demo/发布产物；追加 MNN 三轮后最终全项目为 84 files / 1,481 tests。TypeScript、2,309 modules mobile 构建、首屏 3MB 门禁、clean debug APK 与手机视口回归已通过，首屏实测 836,075 bytes，语义运行时与 ORT WASM 均按需从 OSS 素材域名加载。
- 5000 条合成资产批量 upsert、分组和混合结果合并回归已建立；100 条合成 metadata/tag/OCR 与 20 条中文查询达到 Recall@5/20 20/20。两者都不等于真实照片解码、手机性能或 CLIP 视觉召回证据。
- 搜索结果现显示时间/GPS/标签/OCR/语义逐项命中来源，采用 60 张一窗的 DOM 上限；搜索历史仅存本机并可清除。Web 会话恢复会提示重新选图，不伪造可恢复的 blob 缩略图。
- Qwen/OCR 已接 AbortSignal 与 75/125 秒内部超时，RunTrace 显示真实 runtime、加速报告、视觉输入和 maxTokens；峰值内存与模型加载耗时仍等待目标 Android 真机采样。
- 第三轮发现并修复 Photos Android transport：Capacitor 包现在调用 `PocketMnn`→Java→JNI；Web/Vite 才使用 `/api/edge`。JS 取消可及时结束页面请求，但 JNI 尚不能中断已经开始的推理。

仍不得写成“手机端完整完成”的部分：

- 本轮已配置隔离的 JDK 21、Android SDK 36 与 NDK 27，`cap sync android`、Gradle clean build、Manifest merge、APK v2 签名、16 KiB 对齐和 12/12 JNI 导出均已通过。
- Android 原生 MNN/JNI 已编入 APK，双基座与 Adapter 的本机哈希前向校验通过；但目标机安装与实际推理、飞行模式全链、5000 张真实大库性能、内存/温度和 SME2 同机 A/B 均未完成。
- 语义搜索尚缺 100 张真实图片/20 查询的 CLIP Recall@5/20；照片路由尚缺真猫/截图/雕塑、票据/菜单/海报等硬负样本盲测。
- 依赖审计已修复 `tar`；Transformers.js 的 Node-only `sharp` 上游 high 告警暂无可用修复，已确认不进入浏览器生产资源，但仍需持续跟踪。

实施细节与证据路径以 `docs/strategy/Photos-端侧照片雷达实施计划与验收清单.md` 为准。

### 验收

- Android 真机可以在授权范围内枚举真实系统照片；Web 端明确标记为手动选择降级，不出现虚假全库授权。
- 首次索引只读取缩略图和必要元数据；没有用户确认时不复制原片、不上传、不删除。
- “待你决定”五类建议均来自真实索引，空库和无候选有正确空状态。
- 自然语言查询至少覆盖时间、地点、对象、票据/二维码、人物和 GPS 缺失组合条件。
- 技术质量与个人偏好可产生不同代表，且原因和置信度可见。
- 普通票据默认不调用 OCR LoRA；难例调用后必须经过 Quality Gate。
- 用户确认的带 GPS 照片可通过现有照片落点总线出现在地图，重复确认幂等。
- 飞行模式下授权后的索引、查询、建议、Qwen/MNN 核心识别和地图写回可运行；无模型时明确回退，不伪装为 Qwen 结果。
- 有定向单元测试、TypeScript、Web 构建、Android 构建和目标真机验收记录。

## 阶段11：测试、性能和隐私验收

### 新增测试

- Skill Manifest Schema
- Data Pack Schema
- OSS URL和SHA256
- 安装、取消和断点续传
- Skill与Data Pack独立卸载
- Qwen Provider
- MNN真实健康检查
- Adapter连续切换
- Quality Gate与Base回退
- 地图分块加载
- 弱网和断网
- 首屏无重资产请求
- Android真机
- SME2开关A/B
- 隐私、权限和公开发布

### 持续门槛

- TypeScript检查通过。
- 原有1336项测试不回退。
- 新增测试全部通过。
- 不修改其他Pocket Earth目录。
- 不上传密钥、私人数据或无许可资产。

## 阶段12：决赛演示与证据

建议4分钟左右的主演示：

1. 快速打开Pocket Earth，证明首屏不加载全量模型和数据库。
2. 展示Frost Agent已安装的Skills。
3. 从OSS Plaza安装轻量Skill或Data Pack。
4. 飞行模式运行端侧Qwen/MNN核心交互。
5. 拍摄展品，运行看展搭子和2.5D。
6. 运行古籍、碑拓或任意书籍Mapping。
7. Travel Planner编排多个已安装Skills。
8. 将结果写回地球。
9. 卸载Data Pack，证明Skill仍然存在。
10. 展示RunTrace、Quality Gate和SME2证据。

### 对应赛事要求

- Qwen系列模型
- 手机端核心逻辑本地运行
- MNN与Arm SME2
- 多模态交互
- 感知—思考—执行
- 轻量Agent
- 创意生产力
- 可验证端云协同

## 阶段13：最终清理与发布

### 执行

- 删除已经被Qwen替换的Gemini/Gemma/GMI活跃路由。
- 删除因本次迁移产生的无主组件、导入、环境变量和重复文案。
- 审核前端Bundle、OSS清单和缓存策略。
- 生成Android Release包和真机安装记录。
- 生成技术架构图、实现证据索引和演示材料。
- 对照本文件完成逐项验收。

### 验收

- 决赛包没有未使用的大模型和重资产。
- 不再依赖GMI才能完成核心流程。
- 所有演示步骤与代码、日志和真机证据一致。

## 6. 实际开发顺序

1. 先完成优先里程碑 P0：书籍与电影 Data Pack 协议、SQLite、OSS分发和用户导入闭环。
2. 单独完成音乐 Skill 数据解耦并复用已验证协议。
3. 冻结新的基线。
4. 完成通用OSS Loader和全局懒加载。
5. 完成云端Qwen Provider。
6. 完成端侧Qwen/MNN。
7. 打通“看展搭子 → LoRA → 2.5D → 地图写回”垂直样板。
8. 建成Skills Plaza。
9. 迁移古籍、碑拓和数字化复原。
10. 泛化任意书籍Mapping。
11. 接入Travel Planner后端。（已完成本机真实 MNN/Qwen/LoRA、协议门控与 Pocket Earth UI 适配；OSS 模型分发和 Armv9 SME2 A/B 纳入最终验收）
12. 拆分照片等其余Data Pack并复核书影音协议兼容性。
13. 统一文案并删除旧Google/GMI/Gemma活跃链路。
14. 完成真机、性能、SME2和决赛录像验收。

该顺序是依赖顺序，不应在基础协议和运行时尚未稳定时同时大规模迁移所有模块。

## 7. 每阶段通用完成定义

一项工作只有同时满足以下条件才能标记完成：

- 功能已接入真实页面，不是孤立脚本。
- 有自动化测试或可重复的真机验收步骤。
- 失败、回退和取消路径可见。
- 没有残留重复模块或无主资源。
- 不破坏现有Pocket Earth交互和数据。
- OSS资源带版本、大小、SHA256和缓存策略。
- 私人数据、密钥和敏感配置未进入公开资源。
- RunTrace能解释本次调用使用了哪个Skill、模型、数据和工具。
- 本文件中的对应状态和必要决策已更新。

## 8. 最终验收清单

- Google版产品模块和Pocket Earth视觉主体得到保留。
- 决赛核心链路以Qwen为模型底座，不以GMI为必要依赖。
- 核心交互可由手机端Qwen/MNN离线完成。
- 目标Armv9手机具备SME2开关A/B证据。
- Frost Agent能够安装、装备、切换和卸载Skills。
- Skill和Data Pack可以独立安装与卸载。
- 第三方Data Pack可按协议加载。
- 图片、模型、3D资产和大数据包通过OSS按需分发。
- 首屏不加载模型、全量数据库、原始大图和3D重资产。
- Travel Planner使用“上街去”后端能力和Pocket Earth前端。
- 看展、碑拓、古籍、复原、2.5D和Mapping形成真实闭环。
- 每次Skill调用有RunTrace、Quality Gate和明确回退。
- TypeScript、原有测试、新增测试、构建和真机验收全部通过。
- 决赛视频中的每项表述都有代码、日志、真机或固定测试证据。

## 9. 关键边界

- 可接受为决赛体验和稳定性投入OSS及CDN费用，但必须避免重复下载、无效预取和无版本缓存。
- 公共演示资产可以上传OSS；私人照片、足迹、画像、向量库和私密笔记默认本地。
- 模型从OSS下载不代表云端推理；下载完成后必须支持本地MNN运行。
- 未拍到的展品背面、不可见文字和不确定地点不得伪装成确定事实。
- 云端付费操作、公开发布、覆盖和删除必须由用户明确授权。
- 所有决赛叙事必须与真实完成度一致。

## 10. 维护方式

后续每次实施应在本文件对应阶段补充：

- 状态：待执行、进行中、已完成或受阻。
- 主要改动文件。
- 测试结果。
- 真机或性能证据位置。
- 与原计划不同的决策及原因。

若需要调整本计划，先修改本 Markdown，再同步生成新的 Word 快照。
