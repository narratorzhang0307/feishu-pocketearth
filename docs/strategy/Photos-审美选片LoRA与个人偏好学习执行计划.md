# Pocket Earth Photos 审美选片 LoRA 与个人偏好学习执行计划

> 文档状态：拟实施专项计划（需纳入总计划后生效）  
> 适用工程：`/Users/zhangcheng/Desktop/pocket earth 决赛`  
> 版本：v1.0 · 2026-08-11  
> 模型基线：`Qwen/Qwen3-VL-2B-Instruct` + MNN 3.6.1 + Android ARM64  
> 目标 Skill：`pocket.aesthetic-curator` / `aesthetic-vision-lora`  
> 规范关系：本文件是 Photos 审美选片专项执行稿；正式实施前，应同步修订《Pocket Earth 决赛改造总计划与执行准则》中“新照片 LoRA 不进入关键路径”的旧约束。

## 0. 一句话定案

Photos 不再以“语义搜索”为核心差异，而升级为完全在手机上的私人选片策展人：

> 便宜算法负责把几千张照片压缩成同场景候选组；Qwen3-VL-2B 与审美 Visual LoRA 负责组内策展；本机小型偏好排序器从用户每一次 A/B 选择中学习“什么更像你”；删除、收录、封面和地图写回始终由用户确认。

语义搜索保留为基础工具，但不再承担主叙事。杂志和日历继续作为用户确认后的结果层。

## 1. 决策与边界

### 1.1 可以使用 Qwen3-VL-2B，但必须正确分工

Qwen3-VL-2B 适合处理以下任务：

1. 看同一联系表中的 2—6 张候选照片。
2. 判断哪张更适合作为连拍代表、旅程封面或杂志主图。
3. 输出构图、光线、色彩、瞬间感和地点代表性等结构化证据。
4. 在 Base、Markdown 规则和 Visual LoRA 三条链路中完成可复验对照。

Qwen3-VL-2B 不负责：

- 逐张扫描几千张原图。
- 在手机上持续重训 LoRA。
- 仅凭大众数据宣称理解某个用户的个人审美。
- 以审美分数决定删除照片。
- 伪造不存在的置信度或审美客观真理。

### 1.2 两种“学习”必须分开

| 层级 | 学习对象 | 发生位置 | 更新频率 | 产物 |
|---|---|---|---|---|
| 通用审美学习 | 大量人群的摄影审美与主题内排序 | 训练服务器 / PAI | 版本发布时 | `visual-lora.mnn` |
| 个人偏好学习 | 用户对同组照片的每次选择、换代表和收录行为 | 用户手机 | 每次明确选择后 | IndexedDB 中的小型排序权重 |

用户选择不会直接修改 Qwen Base，也不会在手机上训练 LoRA。这样可以避免耗电、灾难性遗忘、难以回滚和训练数据泄露，同时保留“越用越懂你”的产品价值。

### 1.3 研究问题

本专项必须回答三个可证伪问题：

1. 同一个 Qwen3-VL-2B 基座上，Visual LoRA 是否比只有提示词的 Markdown Skill 更会选照片？
2. 用户完成少量成对选择后，本机排序器是否比通用审美结果更接近该用户？
3. MNN 量化与 SME2 加速后，模型收益是否仍存在，且性能能否满足手机交互？

## 2. 产品信息架构

### 2.1 Photos 根页面

维持现有三个一级入口：

1. **照片整理**：默认进入“为你挑片”，搜索降为次级入口。
2. **杂志**：展示用户确认收录的照片和自动编排结果。
3. **日历**：按真实拍摄日期浏览本地相册索引。

### 2.2 照片整理的两个子页

#### A. 为你挑片（核心）

按少量决策卡片组织，而不是显示全库分数：

- 连拍精选：同一时空连拍的 3—6 张候选。
- 旅程封面：同一旅行或地点的一组候选。
- 本周三张：从一周内已通过技术门的照片中生成候选。
- 偏好学习：给用户一个真正有区分度的 A/B 选择。
- 技术问题：模糊、严重欠曝、误拍和近重复，只提供建议。

每张候选必须分开显示三种证据：

- **技术质量**：清晰度、曝光、噪声、重复和分辨率。
- **通用审美**：审美 LoRA 的组内比较结果。
- **更像你的偏好**：本机成对排序器的结果及偏好置信度。

禁止使用“AI 美丑分”“价值分”或“应该删除”。建议文案使用“技术代表”“封面候选”“更像你”“为什么推荐”“暂时无法判断”。

#### B. 找照片（工具）

保留当前端侧元数据、标签、OCR 和 CLIP 向量搜索，但缩小其视觉权重：

- Photos 标题区保留搜索按钮。
- 搜索页面仍支持自然语言和组合条件。
- 搜索结果可以一键加入某次选片组或杂志候选。
- 不把“苹果相册也有的语义搜索”作为决赛主卖点。

### 2.3 杂志与日历的衔接

用户确认“设为封面”“收录杂志”或“钉到地球”后，才写入现有 `chronicleIncluded`、杂志和地图总线。审美模型不得绕过确认直接改变结果层。

## 3. 总体端侧架构

```text
Android 系统相册原片
  → Photo Library 轻路由（assetId / URI / EXIF，不复制原片）
  → 时间 + GPS + dHash/pHash + 轻量技术质量
  → 同地点 / 同场景 / 连拍候选组（3—6 张）
  → 端侧等尺寸联系表（A/B/C/D…，不落长期原图副本）
  → Qwen3-VL-2B Base / MD Skill / 审美 Visual LoRA
  → Quality Gate：LoRA、Base、并列或人工确认
  → 本机个人偏好排序器重排
  → 用户确认
  → 杂志 / 日历收录 / Pocket Earth 地图写回
```

### 3.1 为什么必须先分组再运行 Qwen

Qwen3-VL-2B 是决赛核心模型，但不适合全相册逐张重推。全库前处理继续使用现有低成本能力：

- 时间与 GPS 桶。
- dHash/pHash 重复和相似聚类。
- 清晰度、曝光、色彩和对比度。
- 已建立的 CLIP 向量与 Qwen 结构标签缓存。

只有每组 3—6 张代表候选进入 Qwen。所有输出按 `assetKey + contentHash + modelVersion + promptVersion` 缓存；照片未变化且模型未升级时不重复推理。

### 3.2 联系表输入

当前 Android JNI 视觉接口以单张图片为主，因此由端侧 Canvas 生成统一联系表：

- 2 张：`896 × 448`，左右等宽。
- 3—4 张：`896 × 896`，2×2 等宽网格。
- 5—6 张：`1008 × 672`，3×2 等宽网格。
- 每格只加稳定编号 A—F，不加先验评分或推荐标记。
- 保持相同裁剪策略、边框、间距和背景色。
- 训练和推理使用完全相同的联系表生成器。
- 盲测时随机交换候选位置，检查位置偏差。

## 4. 个人偏好学习

### 4.1 用户事件

只有明确动作可以进入偏好学习：

- 在同组照片中选择代表。
- 把另一张改成封面。
- 明确点击“更喜欢这张”。
- 收录杂志或钉到地球。
- 对系统建议点击“不是我的偏好”。

以下信号不得直接当作偏好金标：停留时间、误触、滚动顺序、相册中原有收藏状态、模型自己生成的推荐。

### 4.2 特征

每张照片使用不包含原片的派生特征：

- 现有 512 维 int8 CLIP 向量或其降维版本。
- 技术质量特征：清晰度、曝光、色彩、对比度。
- Qwen/LoRA 审美属性：构图、光线、色彩、瞬间感、地点代表性。
- 主题和场景：人物、夜景、建筑、自然、食物、展览等。
- 上下文：任务类型是连拍代表、旅程封面还是杂志主图。

不保存人脸身份向量，不把用户私有照片上传作为默认训练数据。

### 4.3 在线成对排序器

第一版采用可解释的 Bradley–Terry / Logistic 成对排序，不在端侧训练神经网络：

```text
P(A > B) = sigmoid(w · (xA - xB))
w ← w + η(1 - P)(xA - xB) - λw
```

其中 `xA`、`xB` 是两张照片的派生特征，`w` 只保存在本机 IndexedDB。每次明确选择后立即事务提交，支持导出、重置和回滚。

### 4.4 冷启动与动态融合

少量选择不足以代表用户，因此采用动态权重：

```text
personalWeight α = min(0.65, n / (n + 20))
finalPreference = (1 - α) × generalAesthetic + α × personalRanker
```

`n` 是有效成对选择数。技术质量不直接混入审美分数，而是作为独立门禁：严重模糊或无有效内容的照片先进入技术复核；用户仍可救回。

阶段提示建议：

- 0—9 次：主要使用通用审美，显示“正在认识你的偏好”。
- 10—29 次：开始显示“更像你”，但保持低置信度。
- 30—49 次：允许个性化改变组内排序。
- 50 次以上：个人权重最多占 65%，仍保留通用和技术证据。

## 5. 审美 LoRA 数据计划

### 5.1 数据来源与作用

| 数据集 | 作用 | 使用方式 |
|---|---|---|
| AVA | 大规模通用审美、摄影挑战和风格 | 从评分分布构造主题内高置信排序对 |
| TAD66K | 47 类主题与主题特定审美 | 构造夜景、人物、建筑、自然等主题内难例 |
| AADB | 审美属性、评分与标注者一致性 | 训练构图/色彩/光线等属性，构造同标注者排序 |
| Pocket Earth 自建盲测 | 真实手机旅行、连拍和封面任务 | 只做验证；未经单独授权不进入公开训练 |

公开数据只能训练“通用审美”，不能被描述为用户个人偏好。

### 5.2 禁止使用固定分数区间粗暴分档

不采用重叠的“1—3 较差、3—5 一般、5—7 良好、7—10 优秀”。正确做法：

1. 保留 AVA 的原始投票分布、均值和方差。
2. 优先在同一摄影挑战、主题或内容类别内配对。
3. 只有均值差距大于预设 margin 且置信区间足够分离时才标 `A > B`。
4. 差距小的样本标记为 `tie`，训练模型学会不确定。
5. 限制同一图片在训练对中的重复次数，防止热门图片支配梯度。
6. 按原始图片、摄影挑战和近重复组先切分，再构造训练对，防止泄漏。

### 5.3 三阶段数据规模

| 阶段 | 规模 | 目的 | 退出条件 |
|---|---:|---|---|
| Learnability | 1,000—2,000 对 | 验证 Visual LoRA 能否学习选择标签 | HF 端明显优于 Base/MD |
| Pilot | 5,000—10,000 对 | 验证主题内泛化和 MNN 导出 | 固定盲测达到研究门槛 |
| Release | 20,000—30,000 对 | 覆盖多主题、并列和位置换位 | HF/MNN 双门禁通过 |

### 5.4 训练样本格式

第一阶段以短答案为主，避免模型只学会“说漂亮话”：

```json
{
  "image": "contact-sheets/group-000123.jpg",
  "messages": [
    {
      "role": "user",
      "content": "从 A、B 中选择更适合作为旅程封面的照片。只输出 JSON。"
    },
    {
      "role": "assistant",
      "content": "{\"choice\":\"B\",\"tie\":false,\"attributes\":[\"主体明确\",\"纵深\"],\"confidenceBand\":\"high\"}"
    }
  ],
  "metadata": {
    "theme": "city-night",
    "sourceGroup": "ava-challenge-…",
    "labelMargin": 1.42,
    "positionPermutation": "BA"
  }
}
```

训练金标理由只能来自数据集属性或人工标注；不得用另一个模型生成一段听起来合理的理由再冒充视觉证据。

## 6. Qwen3-VL-2B Visual LoRA 训练配方

### 6.1 固定基座

- Base：`Qwen/Qwen3-VL-2B-Instruct`。
- revision、tokenizer、视觉预处理和 Base SHA256 必须写入 Manifest。
- Android 继续复用现有 Qwen3-VL-2B MNN 共享基座，不打包第二份 2B 模型。
- 训练输入分辨率和端侧联系表分辨率必须一致。

### 6.2 第一版参数

```text
freeze_llm        = true
freeze_vit        = false
freeze_aligner    = false
target_modules    = vision tower + visual merger/aligner all-linear
lora_rank         = 8
lora_alpha        = 16
lora_dropout      = 0.0—0.05（以盲测选择）
precision         = bf16
batch             = 1—2
grad_accumulation = 16
epochs            = 2—3
gradient_checkpointing = true
```

原因：现有“上街去”MNN 路径已经证明语言 Decoder overlay 在量化后存在复读风险；发布的通用 OCR v6 采用冻结语言基座、只训练视觉塔和对齐层的路线。审美能力同样应优先改变视觉特征，而不是只让语言层更会描述审美。

### 6.3 训练代码

在“上街去”的 `skill-forge/python/skill_forge` 基础上新增独立任务，不修改已发布 OCR 训练脚本：

```text
train_qwen_aesthetic.py
build_aesthetic_pairs.py
build_contact_sheets.py
evaluate_aesthetic.py
export_mnn_aesthetic_lora.py
```

训练目录物理隔离：

```text
oss://<bucket>/pocketearth/aesthetic-curator/v1/
  code/<sha256>/
  data/<dataset-sha256>/
  base/<base-revision>/
  runs/<job-id>/
  release/<version>/
```

### 6.4 损失与训练顺序

第一阶段使用结构化短答案 SFT，主要监督 `choice/tie`，理由属性为次要监督。若 SFT 只改善语言风格、没有提高二选一准确率，再增加显式 pairwise rank loss；不得通过延长解释文本掩盖选择能力没有提升。

## 7. Base / MD / LoRA 固定盲测

### 7.1 三组完全一致

| 版本 | 模型和输入 | 允许变化 |
|---|---|---|
| Base | 原始 Qwen3-VL-2B + 固定联系表 | 无审美规则、无 Adapter |
| MD Skill | Base + 固定审美规则与输出 Schema | 只增加 Markdown 指令 |
| LoRA Skill | 与 MD 完全相同 + 审美 Visual LoRA | 只增加 Adapter |

三组使用相同图片、联系表、排列轮换、temperature、max tokens 和 JSON Schema。

### 7.2 盲测集合

发布前至少准备：

- 300—500 个未参与训练的主题内 A/B 对。
- 100 个 3—6 张组内封面选择任务。
- 100 个 `tie / 无明显胜者` 对。
- 100 个 A/B 位置交换样本。
- 100 个真实手机照片对，覆盖旅行、夜景、人物、食物、建筑和展览。
- 至少 50 个“技术差但有情绪价值”反例，防止模型把锐利度等同于审美。

真实个人偏好测试以用户本人选择为金标；通用审美测试至少三名独立标注者，并记录分歧，不强行制造唯一答案。

### 7.3 核心指标与发布门槛

| 指标 | 研究门槛 | 发布门槛 |
|---|---:|---:|
| LoRA 相比 MD 二选一准确率 | +5 个百分点 | ≥ +8 个百分点 |
| 组内 Top-1 封面命中率 | +6 个百分点 | ≥ +10 个百分点 |
| Spearman / Kendall 排序相关性 | +0.05 | ≥ +0.10 |
| A/B 换位一致性 | ≥ 85% | ≥ 90% |
| Tie 识别 F1 | ≥ 0.60 | ≥ 0.70 |
| MNN 相比 HF 选择一致率 | ≥ 90% | ≥ 95% |
| 灾难性复读 / 非法 JSON | 0 | 0 |

“审美理由更好听”只能作为展示指标，不能替代二选一、Top-1 和排序指标。

### 7.4 Quality Gate

每个组记录 Base、MD 和 LoRA 候选，但产品只展示最终建议：

- LoRA 盲测已发布且本次输出合法：进入 LoRA 候选。
- LoRA 与 Base/MD 强烈冲突且置信度接近：显示并列，请用户选择。
- LoRA 未安装、哈希不符或运行失败：明确回退 MD/Base。
- 技术门判断为极端模糊或空画面：先进入技术复核，不让审美模型直接删除。
- 用户选择始终覆盖模型排序，并作为下一次个人偏好事件。

## 8. MNN 导出与 Android 接入

### 8.1 导出

复用现有 Visual LoRA 工具链：

1. 审计 PEFT Adapter 的目标模块、rank、tensor 数量和 Base revision。
2. 导出 `visual-lora.mnn` 与 `visual-lora-mapping.json`。
3. 在 HF 上生成固定盲测输出。
4. 在真实 MNN sidecar 上运行同一批样本。
5. 对比选择、JSON、复读、速度和内存。
6. 只有 HF/MNN 双门禁通过后才上传不可变 OSS 路径。

Adapter 预计与现有 rank-8 Visual LoRA 处于同一量级，但文件大小必须以最终导出为准，不能预先宣称 17.6MB。

### 8.2 原生运行时改造

新增独立资产 ID，不能复用 OCR LoRA：

```text
aesthetic-vision-lora
adapter runtime id: aesthetic-curator-vision
```

至少修改：

- `frost-agent/edge/types.ts`：资产枚举。
- `frost-agent/edge/httpPhotoEdge.ts`：运行状态和审美推理调用。
- `android/native/pocket_mnn_jni.cpp`：Visual Adapter allowlist 与路径。
- `PocketMnnPlugin.java`：安装状态、文件路径、大小和 SHA256。
- `src/app/lib/skill/builtins.ts`：`pocket.aesthetic-curator` Manifest。
- Photos Runtime、RunTrace 和模型中心 UI。

### 8.3 MNN / SME2 真机指标

每种任务分开记录：

- Base 加载时间与 Adapter 切换时间。
- 联系表预处理时间。
- 视觉 Prefill、首 Token、Decode 和总耗时。
- PSS/RSS 峰值、温度、电量和失败率。
- SME2 `target 2 / target 3` 的 ABBA 对照。
- 飞行模式下网络请求数必须为 0。

正式证据进入现有 MNN 验收账本和 SME2 A/B 账本，不另做无法追溯的截图表格。

## 9. 端侧任务调度与性能预算

### 9.1 执行时机

默认策略：

- 用户打开某个候选组时即时运行。
- 后台批量只在充电、非高温、App 前台或受控后台窗口运行。
- 同一时刻只允许一个 Qwen 视觉任务。
- 支持暂停、逐组事务提交和下次续跑。
- 手机进入 thermal throttling 时暂停，不继续平均掉降频影响。

### 9.2 预算目标

| 项目 | 目标 |
|---|---:|
| 便宜分组与技术分析 | 5,000 张保持 O(n) 或受控近似复杂度 |
| 单个联系表生成 | P50 < 120ms |
| 已加载模型的 2 图组内选择 | P50 < 5s，最终以真机实测为准 |
| Adapter 切换 | P50 < 1.5s，最终以真机实测为准 |
| 单次任务内存峰值 | 不超过设备安全水位，必须记录真实 PSS/RSS |
| 连续运行 | 10 分钟无崩溃、无持续内存上升、可因温度自动暂停 |

任何没有目标手机证据的耗时都标记为目标，不写成已达到。

## 10. 数据、隐私与可撤销性

- 原片仍在系统相册；App 只保存 asset 引用、缩略派生、索引和用户确认。
- 联系表是临时推理输入；缓存只保存必要的低清派生和结果哈希。
- 用户偏好权重只在本机 IndexedDB，默认不上传。
- 提供“导出我的偏好”“重置个人偏好”“清除审美索引”和“卸载审美 LoRA”。
- 卸载 Adapter 不删除阅读、杂志、日历和已确认地图点。
- 清除个人偏好后回到通用审美冷启动，不影响照片原片。
- 用户私有照片默认不进入下一版 LoRA 训练；若未来参与，必须单独明示授权、撤回和数据隔离。

## 11. IndexedDB 数据结构

至少建立四类对象：

| Store | 主键 | 用途 |
|---|---|---|
| `aesthetic_groups` | `groupId` | 同场景候选、联系表哈希、任务类型和状态 |
| `aesthetic_results` | `group+model+prompt` | Base/MD/LoRA 候选、属性和运行证据 |
| `preference_events` | `eventId` | 用户 A/B 选择、时间、上下文和撤销状态 |
| `preference_model` | `profileId` | 权重、特征版本、样本数、校准和更新时间 |

每次用户选择先写 `preference_events`，再更新 `preference_model`。崩溃时可以从事件重新计算权重，汇总权重不是唯一证据。

## 12. RunTrace 与评委证据

每次选片 Trace 至少展示：

1. 真实照片组数量与 asset 引用；不显示私人文件名。
2. 时间/GPS/哈希聚类耗时。
3. 技术质量门结果。
4. 联系表规格与内容哈希。
5. 实际运行的 Base revision、Adapter version、MNN 版本和 SME2 effective 状态。
6. Base/MD/LoRA 路由与 Quality Gate。
7. 个人偏好样本数、权重版本和是否改变排序。
8. 用户最终确认与写入目标。
9. 网络请求数、耗时、内存和回退原因。

不得在 Trace 中保存原图、完整文件路径、人脸身份或用户私密文本。

## 13. 实施工作包

### WP0：规范变更与基线冻结

- 将本专项写入总计划，替换“不得训练审美 LoRA”的旧结论。
- 冻结当前 Photos 代码、测试、APK、模型哈希和真机状态。
- 创建 `pocket.aesthetic-curator/v1` Schema 草案。

验收：总计划、本专项和实际代码不再互相矛盾。

### WP1：Base / MD 研究基线

- 用当前 Qwen3-VL-2B 构建联系表推理。
- 固定 Markdown 审美规则和 JSON Schema。
- 建立 300—500 对核心盲测，不训练模型。

验收：Base、MD 的准确率、位置偏差、耗时和失败样本可复验。

### WP2：数据与 Learnability LoRA

- 下载、审计并登记 AVA/TAD66K/AADB 数据来源。
- 按来源组切分，构造 1,000—2,000 对。
- 训练 visual-only rank-8 LoRA。

验收：HF 端 LoRA 在未见组上明显优于 MD；否则停止扩大训练。

### WP3：Pilot 与 MNN 导出

- 扩到 5,000—10,000 对和多主题。
- 导出 `visual-lora.mnn`。
- 运行 HF/MNN 同集对照和灾难页审计。

验收：研究门槛、MNN 一致性和零复读同时通过。

### WP4：Android Adapter 与 Photos UI

- 增加 Adapter 安装、哈希、状态、回滚和 RunTrace。
- 把“待你决定”升级为“为你挑片”。
- 实现联系表、组内排序、并列和确认交互。

验收：网页不冒充 MNN；Android 真机可以离线运行并明确展示回退。

### WP5：个人偏好排序器

- 建立四个 IndexedDB store。
- 实现成对 Logistic 更新、动态融合、撤销、重算和重置。
- UI 分离“通用审美”和“更像你”。

验收：同一设备累计选择后排序可重复改变；清除后恢复冷启动。

### WP6：正式盲测与 SME2

- 完成 500 对、100 组、位置换位和 tie 集。
- 完成 Base/MD/LoRA、MNN target 2/3 ABBA 对照。
- 将原始样本和汇总写入端侧验收账本。

验收：达到发布门槛，否则 LoRA 留在研究入口、不进入默认产品路径。

### WP7：决赛 Demo 与证据包

- 准备同场景 6 张照片的固定 Demo。
- 录制飞行模式运行、一次用户选择和下一组重新排序。
- 展示杂志封面或地图写回。

验收：每个口头主张都能从真机 Trace、盲测或模型 Manifest 找到证据。

## 14. 相对排期

| 日程 | 重点 | 可交付物 |
|---|---|---|
| D0 | WP0 + WP1 | 规范、固定盲测、Base/MD 基线 |
| D1 | 数据构造 + Learnability | 数据报告、1—2k 训练对、首个 Adapter |
| D2 | Pilot LoRA | 5—10k 对、HF 评测、失败样本 |
| D3 | MNN 导出与原生接入 | MNN Adapter、Manifest、安装链 |
| D4 | Photos UI + 联系表 | “为你挑片”完整交互 |
| D5 | 个人偏好学习 | IndexedDB 账本、重排和重置 |
| D6 | 真机与 SME2 | APK、ABBA 原始数据、性能报告 |
| D7 | 决赛材料 | 演示视频、证据索引、风险说明 |

如果时间不足，优先顺序为：固定盲测 → Learnability → MNN 导出 → “为你挑片”真机闭环 → 个人偏好排序；不要先扩充解释文案或全相册后台扫描。

## 15. 决赛演示脚本

1. 授权访问目标手机相册，说明原片没有复制进 APK。
2. 打开“为你挑片”，出现一次旅行的 6 张同场景候选。
3. 展示技术质量、通用审美和“更像你”是三条独立证据。
4. 打开 A/B 证据：同一联系表分别跑 Base、MD、LoRA，展示固定盲测汇总。
5. 飞行模式下运行一次 Qwen3-VL-2B + MNN + 审美 Visual LoRA。
6. 用户选择一张不同于通用推荐的照片，端侧偏好事件立即保存。
7. 打开下一组相似照片，展示个人排序器如何调整“更像你”的排序。
8. 用户确认旅程封面，写入杂志或钉到 Pocket Earth。
9. 展开 RunTrace：模型哈希、MNN、SME2、耗时、内存、网络请求 0 和回退路径。

## 16. 风险与止损

| 风险 | 识别方式 | 止损策略 |
|---|---|---|
| LoRA 只让理由更漂亮 | 二选一/Top-1 没提升 | 停止扩训；调整视觉目标模块或改显式 rank loss |
| 学成“日落/美女优先” | 跨主题好、主题内差 | 只构造同主题难对，平衡人物、夜景和地点 |
| 语言 Adapter 量化复读 | MNN 非法 JSON/循环 | 冻结 LLM，只发布 visual overlay |
| 手机推理过慢 | 真机 P50/P95 超预算 | 只处理组内代表、缓存、充电时后台预计算 |
| 个人偏好过拟合 | 少量选择导致大幅漂移 | 动态 α、L2 正则、最大 65%、支持重置 |
| 位置偏差 | A/B 换位后结论变化 | 训练与盲测随机换位，低一致性转人工 |
| 审美伤害用户情感 | 把纪念照判低分 | 不显示美丑分、不自动删除、情绪价值可救回 |
| 数据泄漏 | 同图片或同挑战跨集合 | 原图/挑战/近重复组先切分再配对 |

## 17. 最终验收清单

### 产品

- [ ] Photos 主叙事已从语义搜索转为私人选片策展。
- [ ] 通用审美、技术质量和个人偏好在 UI 中明确分层。
- [ ] 没有审美自动删除，没有伪精确美丑分。
- [ ] 用户确认后才能收录杂志、设封面或写入地图。

### 模型

- [ ] 使用固定 Qwen3-VL-2B Base、revision 和视觉预处理。
- [ ] Visual LoRA、Base 和 MD 使用同一盲测。
- [ ] 二选一、Top-1、排序、换位和 tie 指标达到发布门槛。
- [ ] HF 与 MNN 一致性达到 95%，灾难性复读为 0。

### 端侧

- [ ] 原片未进入 APK，轻路由引用仍有效。
- [ ] Adapter 从 OSS 按需安装并校验大小、SHA256 和 Base 兼容。
- [ ] 飞行模式真实运行，网络请求为 0。
- [ ] MNN/SME2 真机证据进入验收账本。
- [ ] 热、内存、连续运行和中断恢复通过。

### 个性化

- [ ] 每个偏好事件立即事务提交。
- [ ] 权重可由事件重算，可导出、撤销和重置。
- [ ] 个人权重随样本数渐进增加，上限 65%。
- [ ] 清除偏好不删除原片、杂志、日历或地图点。

## 18. 代码与产物清单

建议新增：

```text
src/app/lib/photo/aestheticTypes.ts
src/app/lib/photo/aestheticGroups.ts
src/app/lib/photo/aestheticContactSheet.ts
src/app/lib/photo/aestheticRuntime.ts
src/app/lib/photo/aestheticPreference.ts
src/app/lib/photo/aestheticStore.ts
src/app/components/PhotoAestheticCurator.tsx
src/app/components/PhotoPreferenceLedger.tsx
frost-agent/edge/httpAestheticEdge.ts
docs/evidence/aesthetic-curator-evaluation.md
deploy/edge-runtime/assets/aesthetic-curator-release/
```

训练侧建议新增：

```text
skill-forge/skills/aesthetic-curator/
skill-forge/python/skill_forge/build_aesthetic_pairs.py
skill-forge/python/skill_forge/build_contact_sheets.py
skill-forge/python/skill_forge/train_qwen_aesthetic.py
skill-forge/python/skill_forge/evaluate_aesthetic.py
skill-forge/python/skill_forge/export_mnn_aesthetic_lora.py
```

最终证据包至少包含：训练数据报告、泄漏审计、Base/MD/LoRA 原始预测、失败样本、HF/MNN 一致性、Adapter Manifest 与 SHA256、真机 RunTrace、SME2 ABBA、APK 哈希和演示视频。

## 19. 参考资料

1. QwenLM. [Qwen3-VL 官方微调代码与训练参数](https://github.com/QwenLM/Qwen3-VL/blob/main/qwen-vl-finetune/README.md)。官方训练入口允许分别控制视觉塔、视觉投影/merger 和语言模型。
2. Murray, Marchesotti, Perronnin. [AVA: A Large-Scale Database for Aesthetic Visual Analysis](https://mlanthology.org/cvpr/2012/murray2012cvpr-ava/)。超过 25 万张图片，包含评分、语义和摄影风格元数据。
3. He et al. [Rethinking Image Aesthetics Assessment: Models, Datasets and Benchmarks](https://www.ijcai.org/proceedings/2022/132)。TAD66K 含 66K 图片、47 个主题，并强调主题相关审美标准。
4. Kong et al. [Photo Aesthetics Ranking Network with Attributes and Content Adaptation](https://arxiv.org/abs/1606.01621)。AADB 直接建模相对排序、审美属性和同一标注者一致性。
5. Yun, Choo. [Scaling Up Personalized Image Aesthetic Assessment via Task Vector Customization](https://www.ecva.net/papers/eccv_2024/papers_ECCV/papers/05680.pdf)。说明通用审美与个人偏好需要分层，并通过少量用户样本进行个性化。

---

**最终原则**：Markdown Skill 负责流程、权限、联系表和输出合同；审美 Visual LoRA 负责从大量视觉偏好中获得难以语言化的通用排序能力；本机成对排序器负责从用户每一次明确选择中学习个人偏好。三者各司其职，才构成可信、可复验、可回滚的 Photos Model Skill。
