# Pocket Earth Photos Tab 最终执行计划与验收准则

> 版本：Final 1.0 / 2026-08-11  
> 状态：Photos 专项权威执行稿  
> 目标运行时：Android Capacitor APK + Qwen3-VL-2B-Instruct + Alibaba MNN 3.6.1 + 可插拔 Visual LoRA + 目标机 SME2 证据  
> 产品边界：完全在手机上的私人照片策展人；原片仍在系统相册，AI 只给建议，最终决定始终属于用户。

## 0. 文档地位与最终定案

本文件合并并取代下列 Photos 专项方案中的产品与工程决策：

- `Pocket_Earth_Photos改进与LoRA_Skill验证方案_2026-08-11.md/.docx`
- `docs/strategy/Photos-审美选片LoRA与个人偏好学习执行计划.md/.docx`
- `docs/strategy/Photos-端侧照片雷达实施计划与验收清单.md` 中与本文件冲突的旧 Photos 信息架构和“新照片 LoRA 不进入关键路径”约束
- 《Pocket Earth 决赛改造总计划与执行准则》中阶段 10A 的旧 Photos 定案；后续应按本文件同步总计划

不冲突的既有相册桥、照片索引、搜索、杂志、日历、OCR、地图 Pin、RunTrace、MNN 与 SME2 验收能力继续沿用。

### 0.1 一句话定位

> Pocket Earth Photos 不做另一个相册搜索框，也不做替用户删除回忆的“AI 清洁工”；它把几千张照片压缩成少量值得决定的旅程候选，用通用审美 LoRA 提供策展能力，再从用户每次明确选择中学习“什么更像你”。

### 0.2 十项不可再摇摆的决定

1. Photos 根页面固定保留三个现有入口：`照片整理 / 杂志 / 日历`。
2. `照片整理` 内固定保留两个子 Tab：`待你决定 / 找照片`。不新增“光阴志”Tab，不把“待你决定”改名；“旅程精选”作为其中的首要卡片模块。
3. `杂志 / 日历` 继续使用当前有辨识度的 UI，但正式数据只来自系统相册引用和用户确认结果。
4. `找照片` 保留自然语言语义搜索，但只作为基础能力和入口，不作为比赛的核心差异。
5. 核心差异固定为：`旅程精选 + 通用审美 LoRA + 本机个人偏好 + 地图/重返现场闭环`。
6. 正式推理主链固定为 Android APK 内的 `Capacitor → Java → JNI → MNN → Qwen3-VL-2B / Visual LoRA`；网页只预览 UI 或运行轻量索引，不得冒充 MNN/SME2 真机结果。
7. 审美 LoRA 保持为可插拔 Adapter，不与 Qwen 基座永久合并；模型升级和个人偏好必须解耦。
8. 用户选择只训练手机端的小型成对排序器，不在手机上重训 LoRA。换 LoRA 后，历史选择在手机端重放并重算派生权重。
9. 技术质量、通用审美、个人偏好三条证据必须分开；任何审美模型都不得自动删除、移动或覆盖用户原片。
10. “重返现场”先复用现有 GPS + 相机叠加 + 手动对齐链，OpenCV 自动配准通过原型门后再进入演示主链；3D 照片花园只是增强项。

## 1. 对另一窗口方案的评价与吸收结论

另一窗口方案的产品判断是有价值的：它正确意识到“语义搜索”已经是常见相册能力，Pocket Earth 需要把“照片理解”与“地点、旅程、再次回到现场”串成闭环。其主要问题不是方向，而是运行时假设与本项目现实不一致。

### 1.1 原样吸收

| 提案 | 最终处理 | 原因 |
|---|---|---|
| 旅程精选而不是泛化搜索 | 吸收 | 与 Pocket Earth 的地点、地图和叙事核心一致 |
| 同主题/同地点组内二选一 | 吸收 | 比单图“7.8 分”更适合审美学习和用户决策 |
| 地点代表性、旅程故事感、封面候选 | 吸收 | 能把普通审美任务变成 Pocket Earth 专属任务 |
| 精选集要有多样性 | 吸收 | 防止 12 张精选全是相似日落或同一人像 |
| Base / Markdown / LoRA 固定对照 | 吸收 | 能证明 LoRA Skill 学到视觉能力，而非更会说理由 |
| Qwen3-VL-4B 作为教师/能力上限 | 吸收 | 可辅助难例标注和离线对照，但不进入比赛手机默认路径 |
| 技术质量与审美策展分开 | 吸收 | 模糊但珍贵的照片不能被“技术差”直接抹掉 |
| 重返现场的二维图像配准 | 条件吸收 | 有明显产品差异，但必须先通过稳定性、性能和回退门 |

### 1.2 吸收但改写

| 原提案 | 最终改写 |
|---|---|
| 纯 PWA + WebGPU/Transformers.js 跑 Qwen3-VL | 正式链改为 Capacitor APK + MNN；WebGPU 仅可继续服务 CLIP 等轻量语义索引 |
| LoRA 训练后合并进最终模型 | Adapter 与固定基座分离，保留安装、校验、切换、回滚和版本证据 |
| 第一轮冻结视觉编码器、训练语言 attention/MLP | 第一轮冻结语言解码器，优先训练视觉塔选定层与 merger/aligner，避免量化后复读只改善措辞 |
| OpenCV.js 是“重返现场”第一版核心 | 先把现有 GPS/相机叠加链做稳；OpenCV.js 或原生 OpenCV 二选一原型通过后才升级自动对齐 |
| Pocket Earth 专属偏好数据用于 LoRA | 只使用有授权、可审计的项目策展数据训练通用 LoRA；私人相册选择默认永不进入下一版 LoRA |
| 输出审美小数分 | 训练内部可保留 margin；用户界面只显示等级、相对选择、证据和置信状态，不展示伪精确美丑分 |

### 1.3 明确不采用

- 不用浏览器 WebGPU 结果替代 MNN、JNI 或 SME2 证据。
- 不把 4B 模型放入比赛默认端侧路径。
- 不把 LoRA 合并为一份无法热插拔、无法回滚的大模型。
- 不对全相册逐张运行 Qwen3-VL 或 OCR LoRA。
- 不把“未点击”“没有收藏”自动当成负样本。
- 不从公开大众审美数据推断“已经理解某个用户”。
- 不用审美排序直接触发删除、归档、移动、Pin 或杂志收录。
- 不在 OpenCV 自动配准尚未通过真机场景测试前把它写成已完成能力。

## 2. 当前真实基线与缺口

### 2.1 已经存在并应复用

| 当前能力 | 代码位置 | 结论 |
|---|---|---|
| `照片整理 / 杂志 / 日历` 与 `待你决定 / 找照片` | `src/app/components/PhotosTab.tsx` | 信息架构已符合最终方案，不推翻 UI |
| 系统相册授权、分页读取、轻路由 | `src/app/lib/photo/libraryBridge.ts` | 已使用 Capgo 相册桥和自有 Android 路由，且 `includeFullResolutionData=false` |
| 真实照片时间线、杂志、日历 | `PhotosChronicle.tsx`、`chronicleData.ts` | 继续作为确认后的情感结果层 |
| EXIF/GPS/清晰度/曝光/色彩/dHash/pHash | `features.ts`、`technicalQuality.ts` | 继续承担低成本第一层 |
| 全局重复、连拍和事件分组 | `globalGroups.ts` | 继续承担候选压缩，不调用大模型 |
| 中文组合检索和 CLIP 语义索引 | `search.ts`、`semantic.ts`、`vision.ts` | 保留为“找照片”基础能力 |
| Qwen3-VL 代表图理解、票据 Base/LoRA 路由 | `PhotosTab.tsx`、`httpPhotoEdge.ts`、`capacitorMnnEdge.ts` | 复用 MNN、Quality Gate 和 RunTrace |
| 本机个人偏好 v1 | `preference.ts` | 已有成对 logistic 学习、10 次冷启动、撤销与清空 |
| GPS 回访和相机/3D预览 | `ARPhotoRunPage.tsx`、`ARPhotoView.tsx`、`lib/arphoto/*` | 作为重返现场 v1 基线 |
| MNN/SME2 真机验收账本 | `DeviceEvidenceLedgerPage.tsx`、`deviceEvidence.ts` | Photos 性能证据统一进入现有账本 |

### 2.2 当前必须补齐的缺口

1. 还没有 `aesthetic-curator` 审美 Visual LoRA，也没有 Base/MD/LoRA 固定盲测结果。
2. 当前个人偏好 v1 把聚合权重和最多 20 份历史快照放在 `localStorage`，没有不可变原始选择事件。
3. 现有 v1 权重没有 `featureSchemaVersion / adapterVersion / eventWatermark`，换 LoRA 后无法证明权重是否兼容。
4. “待你决定”已有多类建议，但还没有独立的“旅程精选”多样性选择器、封面任务和地点代表性证据。
5. 当前重返现场有 GPS、相机叠加与手动/3D 预览，但没有 ORB/AKAZE + RANSAC + Homography 自动配准。
6. MNN、SME2、5000 张真实相册、温升、内存和飞行模式仍需目标比赛手机实测；浏览器结果不能补位。

## 3. 最终产品信息架构

### 3.1 Photos 顶层

顶层保持现有三个等权入口：

1. **照片整理**：做决策、找照片、形成个人偏好。
2. **杂志**：展示用户明确收录的旅程精选和封面；保留现有视觉与素材兜底。
3. **日历**：按照拍摄时间查看真实系统相册引用；默认 `2026.08`，可向前浏览至 `2020.01`。

正式 APK 不内置一整套冒充用户相册的原片。无照片时展示空状态和“访问用户相册，构建照片集”；演示素材作为 APK 外的独立相册包导入新手机，授权后由系统相册真实枚举。

### 3.2 照片整理：待你决定

`待你决定` 是默认子页。模块按下列顺序出现：

#### A. 旅程精选

- 以时间间隔、GPS 邻近、地点语义和相似度形成 Journey / Place Cluster。
- 每段旅程先显示 6—12 张有叙事顺序的候选，而不是简单 Top-N 高分。
- 每个地点给出一张“通用审美封面”和一张“更像你封面”；不一致时并列解释。
- 多样性门限制同类照片占比，覆盖人物、风景、昼夜、抵达、细节和关键节点。
- 用户可执行：`设为旅程封面 / 收录杂志 / 钉到地球 / 重返现场 / 换一张`。

#### B. 更想留哪张

- 冷启动和持续学习均使用同地点、同主题、同场景的 A/B 选择。
- 显示“技术更稳”“通用审美推荐”“更像你”三种独立结论。
- 用户可以选 A、选 B、并列、都不喜欢或跳过。
- 跳过、页面停留和未点击不得作为负样本。

#### C. 原有决策组

- 连拍代表。
- 疑似重复。
- 模糊、误拍、极端曝光等技术问题。
- 待提取的票据/二维码。
- 带 GPS、适合落到地球的照片。

所有删除和清理仍只是建议；删除动作必须跳回系统相册或经过明确二次确认，并尽量使用系统可恢复机制。

### 3.3 照片整理：找照片

保留自然语言搜索，例如：

- 去年杭州拍的猫。
- 所有停车票据。
- 带二维码的照片。
- 东京旅行中有朋友的照片。
- 没有 GPS 但像西湖的照片。
- 适合作为南京旅程封面的夜景。

搜索结果可继续进入：

- 旅程精选候选。
- 票据 OCR。
- 地图 Pin。
- 杂志收录。
- 重返现场。

“找照片”优先使用元数据、OCR、标签和本地 embedding；只有候选短名单或复杂组合需要时才调用 Qwen3-VL。

### 3.4 杂志

- UI、封面素材和现有版式完整保留。
- 正式数据源优先为用户已确认 `chronicleIncluded` 的真实系统资产。
- 用户未连接相册时可显示明确标注的“演示样刊”，不得伪装成扫描结果。
- 旅程封面、地点章节和照片顺序均可由用户修改。

### 3.5 日历

- 日历本体在可用内容区居中，不再在日历内部上下滚动。
- 默认打开 `2026.08`，左右按钮按月向前/向后；范围至少覆盖 `2020.01—2026.08`。
- 月份不需要预写 80 余份静态 DOM，只需由日期算法动态生成格子。
- 照片落点以真实 `creationDate / DateTimeOriginal` 为准；无时间或冲突项进入修正队列。

## 4. 相册轻路由与隐私边界

### 4.1 核心原则

用户授权后，Pocket Earth 看到的是系统相册资产的引用和派生索引，不是把全部原片复制进 APK 私有目录：

```text
系统相册原片
  → assetId / content URI / creationDate / GPS / 尺寸
  → 临时缩略图或按需可显示 URL
  → dHash / pHash / 技术特征 / embedding / 结构标签
  → Pocket Earth 索引和决策
```

正式约束：

- `getLibrary` 固定 `includeFullResolutionData=false`。
- IndexedDB 不保存原始照片字节，不保存可长期失效的临时文件路径。
- 全分辨率仅在用户打开单张照片或触发模型时按需获取，用完释放临时引用。
- 插件为 WebView 导出到应用 cache 的文件要设置清理策略；“轻路由”不等于缓存永不产生。
- 用户在系统相册删除或修改资产后，索引执行 tombstone/重建，不保留幽灵原片。
- PWA/网页降级只能让用户主动选择文件，不能宣称能够静默枚举整机相册。

### 4.2 权限状态

| 状态 | 行为 |
|---|---|
| 未请求 | 显示用途、轻路由说明和“构建照片集”按钮 |
| limited | 只索引用户选定资产，UI 明确显示“部分相册” |
| authorized | 分页增量枚举系统媒体库 |
| denied | 保留演示样刊，可打开系统设置，不反复弹权限 |
| 权限撤回 | 停止读取新资产，清理不可访问缓存，保留用户可选择删除的派生账本 |

### 4.3 新手机演示照片包

为了让无私人照片的比赛手机形成真实相册链路，建立独立演示包，不放进 APK：

- 文件覆盖 `2020.01—2026.08` 多个年份、月份和旅程。
- 修改 EXIF `DateTimeOriginal / DateTimeDigitized / DateTime`，并同步文件修改时间。
- 为部分照片写入可验证 GPS，另保留少量无 GPS 样本测试推断和人工修正。
- 包含连拍、近重复、模糊、票据、二维码、猫、人物、城市夜景和地点封面困难组。
- 导入手机后触发 Android MediaStore 扫描，再由 Pocket Earth 授权读取。
- APK 与演示包分离；评委能看到照片先存在系统相册，Pocket Earth 只建立索引。

## 5. 端侧照片执行链

### 5.1 分层流水线

```text
用户授权系统相册
  → 分页枚举 assetId / EXIF / GPS / 尺寸
  → 低分辨率缩略图
  → 技术质量 + dHash/pHash + 时间/GPS 聚类
  → 事件/旅程/同场景候选组
  → CLIP 语义 embedding（可选、增量、本地）
  → Qwen3-VL Base 做代表图理解和难例路由
  → MD Skill 或 Aesthetic Visual LoRA 只比较短名单
  → Quality Gate：LoRA / MD / Base / 并列 / 人工确认
  → 本机个人偏好排序器重排
  → 用户确认杂志、封面、Pin 或重返现场
```

### 5.2 计算预算

- 全库：只运行元数据、缩略图技术特征、感知哈希和可选轻量 embedding。
- 每个候选组：最多选 2—6 张进入 Qwen/LoRA 联系表。
- 票据：Qwen Base 先判断是否为票据；普通票据走 Base OCR，反光、小字、破损难例才切通用 OCR Visual LoRA。
- 审美 LoRA：只处理同主题候选对或旅程封面短名单，不扫描整库。
- 后台任务必须支持暂停、断点、温度过高自动停止和充电时继续。

### 5.3 旅程精选算法

旅程精选不是把单图分数从高到低排列，而是两阶段：

1. **组内代表**：在同地点/同场景中比较技术质量、通用审美、地点代表性和用户偏好。
2. **组间策展**：用时间顺序和多样性约束选择 6—12 张，避免内容重复。

建议以约束式 MMR/覆盖选择实现：

```text
候选收益 = 组内相对偏好
         + 地点代表性
         + 旅程节点覆盖
         + 个性偏好修正
         - 与已选照片的视觉/时间重复
```

不要把该公式变成用户可见的绝对“美丑分”。技术门、模型选择、个人重排和用户最终决定仍分别记录。

### 5.4 结构化输出

```json
{
  "groupId": "sha256:...",
  "task": "journey-cover",
  "technical": {
    "status": "pass",
    "issues": []
  },
  "universalCuration": {
    "choice": "asset-b",
    "level": "strong",
    "attributes": ["主体明确", "夜景层次", "地点辨识度"],
    "reason": "B 更适合作为本段旅程封面"
  },
  "personalization": {
    "effective": true,
    "choice": "asset-a",
    "reason": "你更常保留有朋友和环境关系的画面",
    "eventCount": 36
  },
  "qualityGate": "ask-user",
  "baseRevision": "Qwen3-VL-2B-Instruct@fixed",
  "adapterVersion": "aesthetic-curator-vision@1.0.0",
  "runTraceId": "..."
}
```

用户界面只展示必要的中文结论；完整字段进入本机证据与调试页。

## 6. 审美 LoRA Skill 最终训练方案

### 6.1 Skill 结构

```text
aesthetic-curator-skill/
├── SKILL.md                    # 触发、任务、权限、流程、回退和输出 Schema
├── adapter/
│   ├── adapter_config.json
│   └── visual-lora.mnn         # 可插拔、不可变版本资产
├── prompts/
│   └── curation-protocol.md
├── eval/
│   ├── frozen-groups.json
│   ├── human-rankings.json
│   ├── failure-cases.json
│   └── release-gates.json
└── manifest/
    └── skill-manifest.json     # Base revision、MNN、SHA256、输入输出和回退
```

Markdown 部分教模型“什么时候、按什么流程、输出什么”；Visual LoRA 学习难以写成文字规则的视觉偏好；Eval 证明它确实改善选择。

### 6.2 固定基座与 Adapter

- 基座固定 `Qwen3-VL-2B-Instruct` 的明确 revision/hash。
- Android 复用现有 MNN 共享基座，不打包第二份 2B。
- Adapter 单独下载、哈希校验、协议安装、激活、回滚和卸载。
- 同一时刻只激活与基座、MNN 版本和量化规格兼容的一个审美 Adapter。
- Qwen3-VL-4B 只作离线教师、难例复核或能力上限，不成为真机默认链。

### 6.3 第一轮训练模块

第一轮采用 visual-first：

- 冻结语言解码器。
- 先训练视觉 merger/aligner 和经验证兼容的视觉注意力投影 LoRA。
- 若 merger-only 已达到学习性门，就不扩大目标层。
- 若只改善文字理由而不改善二选一，才增加视觉塔选定层；不先改语言 Decoder。
- rank 从 8 起做小网格，不用参数量替代盲测。

原因：本项目现有“上街去”链路已经观察到语言 Adapter 在量化路径出现复读风险；审美 Skill 的证据应该是视觉选择改变，而不是描述更华丽。

### 6.4 数据计划

#### 公共数据候选

| 数据 | 作用 | 使用前门禁 |
|---|---|---|
| AVA | 通用摄影审美分布 | 下载来源、许可和拆分审计 |
| TAD66K | 主题内审美 | 保持主题分层，避免跨主题捷径 |
| AADB | 构图、光线、色彩等属性 | 保留标注者差异和一致性 |
| PARA | 个体偏好研究 | 只用于方法研究，不冒充当前用户 |
| PCCD / 摄影评论数据 | 解释与属性对齐 | 防止直接复制长评论，统一简短 Schema |

公共数据只能训练通用/策展审美，不能声称学到了某个用户。

#### Pocket Earth 任务数据

单独建立有授权、可追溯的策展数据，不直接吸收真实用户私人事件：

- 同地点两图二选一。
- 同主题困难对和并列。
- 旅程封面。
- 地点代表性。
- 有情绪价值但技术不完美的反例。
- 人物、风景、建筑、夜景、票据等主题平衡。
- A/B 位置交换，防止总选左/右。
- 近重复和裁剪版本，防止仅凭主体类别走捷径。

### 6.5 标签与损失

主监督不是小数回归，而是：

- `choice: A / B / tie`
- `overallLevel: weak / acceptable / strong`
- `attributes: composition / light / color / moment / place / story`
- `coverCandidate: true / false`
- 简短、可核对的结构化理由

训练可组合：成对排序损失 + 离散分类 + 结构化 SFT。连续原始评分只用于构造高置信对和保留不确定性，不粗暴切四档后丢掉分布。

### 6.6 三阶段训练

| 阶段 | 数据量 | 目的 | 退出条件 |
|---|---:|---|---|
| Learnability | 1,000—2,000 对 | 确认 Visual LoRA 能改变选择而非只改措辞 | 未见组显著优于 MD，否则停训并改目标层/标签 |
| Pilot | 5,000—10,000 对 | 主题内泛化、MNN 导出和失败样本 | 达到研究门且 HF/MNN 一致 |
| Release | 20,000—30,000 对 | 补足难例、并列、位置平衡和项目任务 | 只有 Pilot 通过才扩大，不为数据量而扩训 |

### 6.7 固定对照

| 组 | 配置 | 证明内容 |
|---|---|---|
| A | 2B Base + 最小统一 Schema | 基座能力 |
| B | 2B Base + Markdown Skill | 提示词/规则增益 |
| C | 2B Base + 同一 Markdown + Visual LoRA | 权重 Skill 的真实增益 |
| D | 4B Base + Markdown | 离线教师/能力上限，不参与端侧默认性能 |

固定输入、候选顺序、temperature、生成参数、输出 Schema 和测试集。Base/MD/LoRA 三组不能换 Prompt 或后处理规则。

### 6.8 评测和发布门

| 指标 | 研究门 | 默认发布门 |
|---|---:|---:|
| LoRA 相比 MD 同主题二选一 | +5 个百分点 | ≥ +8 个百分点 |
| 与人工排序的 Spearman/Kendall | +0.05 | ≥ +0.10 |
| 旅程封面 Top-1 | 优于 MD | ≥ +8 个百分点 |
| A/B 位置交换一致性 | ≥ 93% | ≥ 97% |
| 重复推理一致性 | ≥ 93% | ≥ 97% |
| HF 与 MNN 选择一致率 | ≥ 90% | ≥ 95% |
| 非法 JSON / 循环复读 | 0 个灾难样本 | 0 个灾难样本 |
| 技术差但有情绪价值的错误清理 | 不得自动执行 | 只能请求用户确认 |

未达到发布门时，LoRA 留在研究/证据入口，正式产品继续使用 MD/Base + 个人排序器。

## 7. 个人偏好：事件、权重与 LoRA 热替换

### 7.1 三层必须解耦

| 层 | 内容 | 生命周期 |
|---|---|---|
| 通用视觉层 | Qwen3-VL-2B + 当前审美 Visual LoRA | 可升级、可回滚 |
| 用户事实层 | 用户明确的 A/B、并列、换封面、收录、Pin、救回 | 永久事件账本，Adapter 无关 |
| 派生偏好层 | 从事件和当前特征重算的小型排序权重 | 可删除、可重建、带版本 |

用户选择不是 LoRA 权重的一部分。换更强 LoRA 时，事实层原样保留；只有特征缓存和派生排序权重需要重算。

### 7.2 当前 v1 迁移

现有 `preference.ts` 已能工作，但只保存 `localStorage` 聚合权重和最多 20 个模型快照。最终迁移规则：

1. 首次升级读取 `pe.photoPreference.v1`，保存为 `legacySnapshot`。
2. 旧聚合权重可作为新模型冷启动先验，但不能伪造成可重放原始事件。
3. 无法从旧权重反推出过去每次 A/B，文档和 UI 明确标注迁移边界。
4. 升级后的每次明确选择立即写 IndexedDB，不等待整组流程结束。
5. 后续模型快照只是缓存，原始事件才是真相源。

### 7.3 IndexedDB 表

| 表 | 主键 | 内容 |
|---|---|---|
| `photo_assets` | `assetKey` | 轻路由资产、状态、时间、GPS、内容 hash |
| `photo_features` | `assetKey+featureVersion` | 技术/EXIF/哈希/稳定 embedding |
| `photo_groups` | `groupId+groupVersion` | 连拍、重复、事件、旅程、地点候选 |
| `aesthetic_results` | `groupId+base+adapter+prompt` | Base/MD/LoRA 结构结果与 RunTrace |
| `preference_events` | `eventId` | 不可变的明确用户选择 |
| `preference_feature_cache` | `assetKey+adapter+schema` | 当前 Adapter 相关特征 |
| `preference_models` | `modelId` | 派生权重、版本、水位和评测 |
| `chronicle_selections` | `selectionId` | 封面、杂志、Pin 等最终确认 |

### 7.4 事件 Schema

```json
{
  "eventId": "uuid",
  "deviceId": "local-stable-id",
  "createdAt": "2026-08-11T10:00:00+08:00",
  "task": "journey-cover",
  "action": "choose-left",
  "groupId": "sha256:...",
  "winnerAssetKey": "asset-a",
  "loserAssetKey": "asset-b",
  "candidateSetHash": "sha256:...",
  "context": {
    "journeyId": "...",
    "placeId": "...",
    "source": "explicit-ab"
  },
  "featureSchemaVersion": "photo-pref-features@2",
  "activeBaseRevision": "Qwen3-VL-2B-Instruct@fixed",
  "activeAdapterVersion": "aesthetic-curator-vision@1.0.0",
  "runTraceRefs": ["..."]
}
```

`skip`、未点击和停留时长不写成 winner/loser。`并列`单独记录为 tie，不强行制造输赢。

### 7.5 手机端小模型

使用现有成对 logistic/Bradley-Terry 思路增量更新：

```text
p(A > B) = sigmoid(w · (xA - xB))
w ← w + η × (1 - p) × (xA - xB) - λw
```

特征分两类：

- **稳定特征**：技术质量、GPS、时间、主题、人物/风景/票据、CLIP embedding、用户任务上下文。
- **Adapter 相关特征**：当前审美 LoRA 的构图、光线、色彩、瞬间感、地点代表性和 pairwise margin。

模型记录：

- `featureSchemaVersion`
- `baseRevision`
- `derivedWithAdapterVersion`
- `eventWatermark`
- `trainedFromEventCount`
- `holdoutAccuracy`
- `createdAt`

样本少于 10 次只显示“正在认识你的偏好”；随着有效选择增多，个人权重逐步增加，但不建议超过最终排序的 65%。

### 7.6 更换 LoRA 后怎样重算

这是手机端可以完成的，不需要 GPU 训练：

1. 下载新 Adapter，核对 manifest、Base revision、MNN 版本、文件大小和 SHA256。
2. 保留旧 Adapter、旧特征缓存和旧偏好模型，先不切默认。
3. 从 `preference_events` 找出历史选择涉及的**去重照片集合**，只重跑这些照片，不重扫整个相册。
4. 用 MNN + 新 LoRA 生成新的 Adapter 相关特征；这一步是模型推理，可由 SME2 加速，耗时取决于历史照片数量。
5. 用手机 CPU 在历史事件上重放 logistic 更新；这一步通常很轻，不需要 GPU。
6. 在本机历史留出集上比较新旧 `holdoutAccuracy`、一致性和失败率。
7. 通过门禁后原子切换 `activeAdapter + preferenceModel`；失败则回滚旧组合。
8. 全过程按样本提交、可暂停、可锁屏恢复，并记录温度、电量、进度和 RunTrace。

如果新旧 Adapter 共用完全稳定且定义不变的特征，旧权重可以直接继承；正式版本仍默认执行一次快速回放/校准，因为它更可验证。

### 7.7 端侧计算边界

- **不需要 GPU 的部分**：事件写入、去重、特征差分、logistic/Bradley-Terry 权重重建、验证和原子切换。
- **需要模型推理但不是训练的部分**：用新 LoRA 重算历史照片的审美属性；正式链由 MNN CPU/SME2 完成。
- **需要 GPU/训练服务器的部分**：训练或再训练新的通用 Visual LoRA。
- 设备发热时允许暂停推理并在充电/低温状态继续；不能把“手机能算”理解为应一次性持续跑几千张。

### 7.8 用户控制

提供：

- 撤销最近一次选择。
- 查看“为什么更像你”。
- 导出偏好事件与派生模型 JSON。
- 重置个人偏好但保留照片索引。
- 清除审美缓存。
- 卸载/回滚审美 LoRA。
- 删除全部 Photos 派生数据；不影响系统相册原片。

私人照片和事件默认不上传、不进入下一版 LoRA 训练。未来若允许研究贡献，必须另行明示授权、可撤回并与本机偏好学习隔离。

## 8. 重返现场

### 8.1 v1：先把现有链做稳

复用已有 `ARPhotoRunPage / ARPhotoView / lib/arphoto`：

- 只对带可信 GPS 的照片显示“重返现场”。
- 地图导航到拍摄点附近。
- 达到距离门后打开相机叠加。
- 提供透明度、缩放、旋转、四角调整和过去/现在分割线。
- 保存对比截图并 Pin 回 Pocket Earth。
- 不支持相机或权限拒绝时使用 2D 手动叠加，不阻塞 Photos 主流程。

### 8.2 v2：OpenCV 自动配准原型

候选链：

```text
旧照片 + 当前相机帧
  → ORB 或 AKAZE 特征与描述子
  → Hamming / KNN 匹配与 ratio test
  → RANSAC 剔除离群点
  → Homography / perspectiveTransform
  → 旧照片 warp 到当前画面
  → 透明度 / 分割线 / 对比拍摄
```

必须记录：匹配点数、inlier 数和比例、重投影误差、Homography 状态、耗时和失败原因。

### 8.3 实现选择门

先做两条小原型，同一固定场景测试：

| 路线 | 优点 | 风险 |
|---|---|---|
| OpenCV.js/WASM | 容易接入现有 React 相机页 | 包体、主线程/内存、相机帧拷贝和 WebView 性能 |
| Android 原生 OpenCV/JNI | 更可控，可复用原生相机/线程 | 构建复杂度和 APK 体积 |

以目标真机的成功率、P95、内存和包体选择，不以“代码更快写完”决定。正式主链要求：

- 稳定纹理建筑/街道场景自动配准成功率达到约定门槛。
- 弱纹理、树木水面、人群、大视角差时能快速失败，不出现错误贴合。
- 失败后一键进入手动缩放/旋转/四角兜底。
- OpenCV 能力未通过门时，v1 仍是完整可演示功能。

### 8.4 v3：3D 照片花园

保留为彩蛋和情感表达，不替代二维配准，不进入决赛 P0。

## 9. MNN、SME2 与证据

### 9.1 正式运行路径

```text
Photos React UI
  → Capacitor PocketMnn Plugin
  → Java PocketMnnRuntime
  → JNI libpocket_mnn_jni.so
  → MNN 3.6.1
  → Qwen3-VL-2B Base + 可选 Visual LoRA
```

网页 `/api/edge` 或 WebGPU 结果只属于开发预览，不进入“端侧已运行”证据。

### 9.2 Photos 必须进入现有验收账本的项目

- 模型和 Adapter manifest、大小、SHA256、Base revision。
- 冷启动加载、热模型 TTFA、prefill、decode、端到端耗时。
- 单图与两图联系表内存峰值。
- 20 张连续短名单处理的稳定性、温升和失败率。
- 飞行模式 Base、MD、LoRA 三组固定样本。
- MNN OFF 后不得偷偷调用原生推理。
- SME2 target 2/3 固定输入 ABBA×2；每种模式 20 个计入样本。
- `hardwareSme2 / requested / effective` 分开，硬件不支持时不得显示 EFFECTIVE。
- LoRA 卸载、切换、失败回退和 Session/dispatch 重建。
- 网络请求 0、APK SHA、MNN 版本、模型输入 SHA 和质量门结果。

### 9.3 证据叙事

比赛不只说“支持 MNN/SME2”，而展示五层：

1. APK 编译和 native 库证据。
2. 目标手机硬件能力。
3. 请求配置和 target 2/3。
4. 实际 dispatch/推理生效。
5. 同机固定样本的效果、性能和质量门。

## 10. 实施工作包与阶段门

### WP0：规范收口与冻结基线（P0）

任务：

- 将本文件登记为 Photos 权威稿并同步总计划旧结论。
- 冻结当前 Web build、Android APK、测试、模型/Adapter 哈希和目标机状态。
- 固定 Base/MD/LoRA 输出 Schema、盲测集拆分和禁止事项。

验收：所有团队窗口使用同一 UI、运行时、模型和证据定义。

### WP1：相册轻路由与演示包（P0）

任务：

- 审计 Capgo/自有路由缓存，确保全库 `includeFullResolutionData=false`。
- 补临时全图释放、权限撤回、资产删除 tombstone 和缓存清理。
- 生成 `2020.01—2026.08` 演示相册 ZIP，修改 EXIF/mtime/GPS 并做 MediaStore 真机导入测试。

验收：新手机导入照片 → 授权 → 三个视图按真实时间/GPS重建；APK 中无该相册原片。

### WP2：偏好账本 v2（P0）

任务：

- 新增 `preference_events / preference_feature_cache / preference_models`。
- 将每次选择即时事务写入 IndexedDB。
- 迁移 v1 localStorage 聚合权重为 legacy seed。
- 补并列、跳过、撤销、导出、重置、崩溃恢复和版本门。

验收：中途杀进程不丢已完成选择；原始事件可重放；旧权重不会误称原始历史。

### WP3：旅程精选和多样性（P0）

任务：

- 新增 Journey/Place Cluster 和地点封面任务。
- 实现技术代表、通用代表、个人代表、用户代表四者分离。
- 实现多样性/时间顺序/地点覆盖选择。
- 保持根 Tab、杂志和日历 UI 不变。

验收：同一旅程不会全选近重复；用户能看懂每条建议来自哪一层并随时覆盖。

### WP4：MD 基线与固定评测（P0）

任务：

- 冻结 Markdown 审美协议、联系人表输入和 JSON Schema。
- 建立同主题困难对、并列、旅程封面、情绪反例和位置交换集。
- 记录 2B Base、2B MD 和 4B MD 教师结果。

验收：后续 LoRA 不能通过换 Prompt、换候选或换后处理获得假提升。

### WP5：Visual LoRA Learnability / Pilot（P1）

任务：

- 完成数据来源/许可/重复泄漏报告。
- 训练 visual-first rank-8 Learnability Adapter。
- 只有过门后扩大到 5k—10k Pilot。
- 建立失败样本和“理由漂亮但选择没变”专项审计。

验收：LoRA 在未见同主题对上明显优于 MD；否则停止扩大并修目标层/标签。

### WP6：MNN Adapter 与 Android 接入（P1）

任务：

- 沿用“上街去”Visual LoRA 导出、安装、哈希和 Quality Gate 链。
- 保持 Adapter 独立，不合并共享基座。
- 在 HF 与真实 MNN 上跑同一盲测；补灾难复读和非法结构门。
- 发布不可变 OSS 资产路径和 manifest。

验收：HF/MNN 一致率达门，Android 飞行模式可运行，失败时明确回退 MD/Base。

### WP7：换 LoRA 后历史重放（P1）

任务：

- 新 Adapter 安装后只重算历史事件涉及的去重照片。
- 按样本提交进度，可暂停、恢复和回滚。
- CPU 重建个人模型并在本机留出事件上比较新旧组合。
- 通过后原子激活，不通过保留旧版本。

验收：更换 Adapter 不丢用户事实；无需 GPU 训练；旧版本一键回滚。

### WP8：重返现场自动配准（P2）

任务：

- 先完善现有 GPS/相机手动叠加。
- 对 OpenCV.js 和 Android 原生 OpenCV 做小型真机原型。
- 建立稳定纹理、弱纹理、昼夜、视角差、遮挡和失败兜底集。

验收：只有自动配准成功率/P95/内存达门才进入比赛主 Demo，否则保留为实验入口。

### WP9：决赛真机、演示与证据包（P0/P1）

任务：

- 用比赛目标手机导入演示相册。
- 完成 MNN、SME2、飞行模式、20 张连续运行、温度和内存账本。
- 冻结 APK、模型、Adapter、Input 和数据包 SHA256。
- 录制主链与回退链，导出 JSON、logcat、Perfetto、截图和视频。

验收：任何“已运行/已加速/LoRA 赢了”的表述都有同机原始证据。

## 11. 建议代码落点

### 11.1 修改

- `src/app/components/PhotosTab.tsx`：增加旅程精选、三层证据、偏好账本状态和模型切换提示。
- `src/app/components/PhotosChronicle.tsx`：确认结果和 Journey 章节，不改现有视觉语言。
- `src/app/lib/photo/preference.ts`：保留算法核心，迁出 localStorage 真相源。
- `src/app/lib/photo/globalGroups.ts`：输出稳定 Journey/Place Cluster。
- `src/app/lib/photo/radarStore.ts`、`store.ts`：增加事件与版本化派生表。
- `frost-agent/edge/httpPhotoEdge.ts`、`capacitorMnnEdge.ts`：增加审美任务、Adapter 版本和结构门。
- `android/app/.../PocketMnnPlugin.java`、`PocketMnnRuntime.java`：复用 Adapter 切换、状态、样本指标和失败码。

### 11.2 新增

- `src/app/lib/photo/journeyCuration.ts`
- `src/app/lib/photo/aestheticProtocol.ts`
- `src/app/lib/photo/aestheticRuntime.ts`
- `src/app/lib/photo/preferenceLedger.ts`
- `src/app/lib/photo/preferenceRebuild.ts`
- `src/app/lib/photo/demoAlbumManifest.ts`
- 对应单测、迁移测试、5000 资产复杂度测试和 Android transport 测试
- 若 OpenCV 原型通过，再增加 `src/app/lib/arphoto/registration.ts` 或原生 `photo_registration_jni.cpp`

## 12. 决赛演示主链

现场不要等待完整模型安装或 40 次性能测试；正式证据应赛前完成，现场只做快速复测。

1. 展示新手机系统相册已有独立导入的演示照片，Pocket Earth APK 不带相册原片。
2. 在 Photos 点击“访问用户相册，构建照片集”，显示轻路由说明和授权。
3. 时间/杂志/日历按系统真实时间戳重建；日历默认 2026.08。
4. 打开“待你决定”的旅程精选，展示同地点候选和多样性时间线。
5. 对同一候选显示：技术质量、通用审美 LoRA、个人偏好三条独立证据。
6. 打开固定 Base / MD / LoRA 对照，展示 LoRA 的盲测结果，不只展示漂亮理由。
7. 用户做一次 A/B 选择，立即写入偏好账本，排序变化有解释且可撤销。
8. 飞行模式运行一次 Qwen3-VL-2B + MNN + Visual LoRA；展开 RunTrace。
9. 设为旅程封面并收录杂志/钉到地球。
10. 若自动配准已过门，演示“重返现场”；否则演示稳定的 GPS + 手动相机叠加。
11. 打开 MNN/SME2 验收账本，展示此前完成的同机 ABBA、内存、温升、质量门和原始样本。

## 13. 风险与停机规则

| 风险 | 观察信号 | 决策 |
|---|---|---|
| LoRA 只让理由更漂亮 | 二选一/Top-1 无提升 | 停止扩训，调整视觉目标层或排序标签 |
| 量化后复读/非法 JSON | MNN 输出循环或结构失败 | 禁止发布，保持 visual-only 和严格回退 |
| 个人偏好过拟合 | 少量选择导致排序剧烈摆动 | 正则、动态权重上限、并列支持、重置 |
| 换 LoRA 后权重失真 | 历史留出准确率下降 | 不原子切换，保留旧 Adapter/模型 |
| 相册读取变成复制原片 | cache 或 IndexedDB 持久化全图 | 阻止发布，恢复 asset 引用和临时清理 |
| OpenCV 错误贴合 | 低 inlier 仍显示成功 | 快速失败并进入手动兜底 |
| 全库 Qwen 扫描发热 | 温升、耗时、内存不可控 | 只做分组短名单，后台可暂停 |
| 评委质疑 MNN/SME2 | 只有 UI 开关无原始证据 | 不宣称有效，补 JNI/ABBA/Perfetto 证据 |
| 审美伤害情感 | 珍贵但模糊照片被判“差” | 不显示绝对美丑分、不自动删除、允许救回 |

## 14. 最终验收清单

### 产品与相册

- [ ] 顶层仍是照片整理 / 杂志 / 日历；子页仍是待你决定 / 找照片。
- [ ] 旅程精选是“待你决定”的首要模块，不额外创建光阴志 Tab。
- [ ] 正式 APK 不内置演示相册原片，授权后读取系统相册真实资产。
- [ ] `includeFullResolutionData=false`，IndexedDB 无原片字节。
- [ ] limited、denied、撤权、资产删除和空相册状态正确。
- [ ] 杂志和日历只把用户确认项当正式结果；日历默认 2026.08。

### 模型与 LoRA

- [ ] Base / MD / LoRA 共用固定输入、Prompt、Schema 和评测集。
- [ ] Visual LoRA 显著改善选择，而不是只改善理由。
- [ ] Adapter 与基座分离，manifest、SHA256、兼容和回滚完整。
- [ ] HF/MNN 一致率达门，灾难复读和非法结构为 0。
- [ ] 4B 只作教师/对照，不进入比赛默认端侧路径。

### 个人偏好

- [ ] 每次明确选择即时写 `preference_events`。
- [ ] 跳过、未点击和停留时长不作为负样本。
- [ ] v1 localStorage 只作为 legacy seed，不伪造历史事件。
- [ ] 权重带 feature/base/adapter/eventWatermark 版本。
- [ ] 换 LoRA 后在手机端重算历史去重照片特征并由 CPU 重建权重。
- [ ] 新组合门禁失败可回滚，用户事实永不丢失。

### MNN/SME2 与隐私

- [ ] Android 真机路径为 Capacitor → Java → JNI → MNN。
- [ ] 网页预览不冒充 MNN、LoRA 或 SME2 真机结果。
- [ ] 飞行模式完成代表图理解和审美二选一。
- [ ] SME2 target 2/3 ABBA 和质量一致性进入验收账本。
- [ ] 私人照片、embedding、OCR 正文和偏好事件默认不上传。

### 重返现场

- [ ] GPS + 手动相机叠加 v1 稳定可用。
- [ ] OpenCV 自动配准有匹配/inlier/误差/P95/失败原因证据。
- [ ] 弱纹理和大视角差可以快速失败并回退手动模式。
- [ ] 未过门前不把自动配准放入决赛主链。

## 15. 研究与上游依据

- [Qwen3-VL 官方微调说明](https://github.com/QwenLM/Qwen3-VL/blob/main/qwen-vl-finetune/README.md)：官方脚本支持分别控制视觉、merger/MLP 和语言组件以及 LoRA 参数。
- [Alibaba MNN 官方 Releases](https://github.com/alibaba/MNN/releases)：MNN 官方发布记录包含 Qwen3-VL 与 Arm SME2 支持；项目仍需提供本机独立证据。
- [Capgo capacitor-photo-library](https://github.com/Cap-go/capacitor-photo-library)：支持相册授权、分页资产、缩略图和按需全图；全图/选择器会使用应用 cache，必须配合清理策略。
- [Queryable](https://github.com/mazzzystar/Queryable)：离线保存照片向量、查询时编码文本并排序的语义搜索参考。
- [Apple MobileCLIP](https://github.com/apple/ml-mobileclip)：移动端图文 embedding 研究与模型参考。
- [OpenCV Feature Matching + Homography](https://docs.opencv.org/4.13.0/d1/de0/tutorial_py_feature_homography.html)：匹配、RANSAC、Homography 与透视变换的官方流程。
- [OpenCV AKAZE Matching](https://docs.opencv.org/master/db/d70/tutorial_akaze_matching.html)：二进制特征、KNN/ratio 与 inlier 评估参考。
- [OpenCV.js 使用说明](https://docs.opencv.org/4.10.0/d0/d84/tutorial_js_usage.html)：WebAssembly/Web 页面接入参考，不等同于真机已达到性能门。

## 16. 最终结论

最终 Photos 方案不是把另一窗口方案全部搬来，也不是继续停留在当前语义搜索和规则偏好：

> 保留已经做好的真实相册轻路由、搜索、杂志和日历；把“待你决定”升级为旅程策展入口；用 Qwen3-VL-2B + MNN + 可插拔 Visual LoRA 学通用审美，用 IndexedDB 事件账本和手机端小排序器学个人偏好；换 LoRA 后在手机端重放历史选择并重算，不需要 GPU 训练；最后用地点 Pin 和重返现场把照片重新连接到现实世界。

这条链既回应 Qwen、MNN 和 SME2 的比赛要求，也形成苹果相册语义搜索之外、真正属于 Pocket Earth 的产品闭环。
