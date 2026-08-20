# Pocket Earth Photos 审美 LoRA 训练最终行动准则

> 版本：Final 2.0｜2026-08-11  
> 训练基座：`Qwen/Qwen3-VL-2B-Instruct`  
> 适用范围：Photos「旅程精选 / 更想留哪张 / 封面候选」的通用审美能力、固定盲测、PAI 训练与端侧交付  
> 文档角色：从现在起，本文件是审美 LoRA 的唯一训练、评测和发布准则；原产品总纲继续约束 Photos 信息架构，二者冲突时，训练和模型发布以本文件为准。

---

## 0. 最终结论

这项训练值得做，但训练目标必须收窄为：

> 在同一旅程、同一地点、同一人物或同一主题的近似候选中，选出更适合作为回忆代表图、旅程封面或叙事节点的一张；必要时承认并列，并把通用审美与用户个人偏好分开。

不训练“替用户删除照片”，不与苹果相册比通用语义搜索，也不让模型对全相册逐张运行。Pocket Earth 的差异是：

1. 先按时间、地点、人物与近重复关系压缩成一个旅程；
2. 再让通用审美 LoRA 比较同主题短名单；
3. 用用户本机的真实选择学习“什么更像你”；
4. 将结果连接到地图、旅程叙事和“重返现场”。

第一轮固定使用 2B，不改成 4B。比赛机虽然有 12 GB 内存，但 4B 会扩大模型、KV Cache、视觉输入与运行时峰值，增加首轮卡顿和导出风险。只有 2B 已通过盲测、真机内存与延迟门，且 4B 的增益经过同机 A/B 证明大于代价，才重新讨论 4B。

## 1. 与原汇总版的融合结论

### 1.1 原样保留

- `旅程精选 + 通用审美 LoRA + 本机个人偏好 + 地图/重返现场` 的产品闭环。
- 技术质量、通用审美、个人偏好三层证据独立展示。
- Base / Markdown Skill / LoRA 使用相同输入、Prompt、Schema、生成参数和盲测集。
- LoRA 是可安装、校验、切换、回滚的 Adapter；用户选择不直接改通用 LoRA。
- 每一次用户选择先写不可变事件账本，再生成可重算的派生权重。
- 不自动删除，不用长篇“漂亮理由”掩盖选图是否真的正确。

### 1.2 本版新增的硬约束

- 先冻结盲测集，再生成训练对；不能训练后挑有利样本。
- 数据集从“候选清单”改为“下载与使用顺序”，每个来源都有 revision、SHA-256、用途和禁用方式。
- Learnability 首轮只训练 1,000—2,000 对；未过门不扩大数据或烧更多 GPU。
- 第一轮采用短结构输出的视觉 SFT；只有它不能改善选择时才考虑 pairwise loss / DPO。
- 采用配对 bootstrap 置信区间和 McNemar 检验，不能只报一个准确率。
- PAI 作业必须拥有不可变 OSS 前缀、费用上限、双重超时和完整产物审计。
- 纯 PWA 与 Capacitor/MNN 是两种不同交付分支，不能在文案和证据中混写。

## 2. R0：运行时分支门

当前项目代码同时存在 Capacitor/MNN 原生链和 Transformers.js/Web 依赖，而产品又被描述为“固定到屏幕的 PWA”。这不会阻塞公共数据、HF LoRA 和盲测工作，但在端侧导出前必须做一次明确选择。

### R0-A：纯 PWA（当前默认，以用户最近的直接描述为准）

- 相册访问受浏览器权限和文件选择器限制，不宣称可静默枚举整机相册。
- 推理交付走浏览器可支持的 ONNX / WebGPU / WASM 路径。
- 若运行时不支持动态 PEFT Adapter，可在发布构建中合并 Adapter 后导出，但仍保留独立的训练 Adapter、manifest 与评测证据。
- 不能把 MNN、JNI、MediaStore、SME2 的结果当成 PWA 实测。
- 验收必须在 vivo X300 的目标浏览器中测首屏时间、峰值内存、连续 20 次延迟、温升、崩溃与离线运行。

### R0-B：Capacitor Android APK

- 正式链可采用 `Capacitor → Java → JNI → MNN → Qwen3-VL-2B + Visual Adapter`。
- 可使用 Android MediaStore 相册桥，但仍需显式权限和隐私说明。
- 必须跑 HF/MNN 一致性、Adapter 安装/回滚、飞行模式与 SME2 原始证据。
- 网页预览结果不能冒充 MNN 真机结果。

### R0 决策时点

`Learnability` 和 `Pilot` 都在 Hugging Face/PEFT 标准形态完成；进入端侧导出前冻结分支。若暂未冻结，所有训练产物保持标准 PEFT Adapter，不做不可逆的运行时专用转换。

## 3. 模型任务合同

### 3.1 模型只处理短名单

全相册先由低成本逻辑完成：

```text
时间/地点聚类
→ pHash/视觉向量去重
→ 模糊、过曝、严重遮挡等技术质量过滤
→ 每组保留 2—6 张候选
→ 生成固定联系表
→ Base / MD / LoRA 做同一比较
→ 本机个人偏好重排
→ 用户确认
```

LoRA 不扫描整库，不负责 OCR，不负责“南京的夏”“小狗”等语义搜索。

### 3.2 固定输入

- 二选一：一张 `896 × 448` 联系表，A/B 等大并列。
- 三至四张：一张 `896 × 896` 联系表，A—D 固定位置。
- 五至六张：一张 `1008 × 672` 联系表，A—F 固定位置。
- 每格只允许稳定字母角标；不显示文件名、评分、来源或标签。
- 训练、验证、盲测和端侧必须使用同一联系表生成器。
- A/B 样本必须生成位置互换版本；互换后选择应跟随图像而不是位置。

### 3.3 第一轮固定输出

```json
{
  "choice": "B",
  "tie": false,
  "attributes": ["composition", "moment", "story"]
}
```

约束：

- `choice` 只能是候选字母或 `TIE`。
- `attributes` 只能来自冻结词表，不要求模型生成自由文本理由。
- 第一轮输出最多 32 tokens，temperature 固定为 0。
- JSON 不合法、复读、越界字母都记为失败，不能由人工后处理改成正确答案。

冻结属性词表：`composition`、`light`、`color`、`clarity`、`moment`、`story`、`place_identity`、`subject_expression`、`technical_risk`。

### 3.4 三层证据

| 层 | 解决的问题 | 数据和算法 | 是否由通用 LoRA 学习 |
|---|---|---|---|
| 技术质量 | 是否糊、曝、噪、遮挡、截图 | OpenCV/轻量 IQA/SPAQ 属性 | 否，默认前置 |
| 通用审美 | 同一主题哪张更适合当代表图 | 公共审美数据 + 人工旅程盲测 | 是 |
| 个人偏好 | 这位用户更喜欢哪张 | 本机事件账本 + 小型成对排序器 | 否 |

“技术更好”不等于“更值得留”。含糊但情绪关键的照片必须出现在反例集里，确保质量过滤不会吞掉回忆价值。

## 4. 数据集最终选择与下载顺序

### 4.1 Tier 0：先建评测，不训练

在下载大规模图像和生成训练对之前，先冻结 Pocket Earth 任务盲测：

- 300—500 个未见主题的同组 A/B 对；
- 至少 100 个真实并列对；
- 至少 100 个位置互换对；
- 至少 100 个 3—6 候选的旅程封面任务；
- 至少 50 个“技术较差但情绪/叙事更重要”的陷阱样本。

通用审美 gold 尽量由 3 名独立标注者给出，保留分歧与置信度；用户个人 gold 单独保存，不能混成“普遍正确”。项目内部照片若无明确训练授权，只进入本地盲测，不上传 PAI。

### 4.2 Tier 1：Learnability 首轮

| 数据 | 首轮占比 | 使用方式 | 明确不做的事 |
|---|---:|---|---|
| TAD66K | 60%—70% | 同主题、分数差足够的成对比较；保持 47 个主题分层 | 不跨主题用“风景必胜截图”等捷径 |
| AADB | 25%—35% | 使用总分与已核验的 11 个属性分数生成构图、光线、色彩难对 | 当前镜像没有标注者 ID，不生成“同一标注者”pair；不把不同拆分当独立数据 |
| SPAQ | 首轮 0%；Pilot 再定 | 技术质量陷阱、亮度/色彩/对比/噪声/锐度属性 | 不把手机图像质量分冒充通用审美分；未取得并校验图包时不得只凭 metadata 造 pair |

首轮目标只有 1,000—2,000 对；先证明可学习性，不追求覆盖全部摄影风格。2026-08-11 的冻结首轮实际为 1,327 对：TAD66K 927 对、AADB 400 对；SPAQ 因完整图包约 34.8GB 且未满足本机磁盘安全门，本轮明确不进入训练。

### 4.3 Tier 2：Pilot 通过后再加入

- **AVA**：按 DPChallenge 的 challenge/category 和评分分布构造同场景难对；仅在 Tier 1 通过后下载与扩展。AVA 规模大、专业摄影与后期偏置强，不能主导首轮。
- **PARA**：用于验证个体偏好方法和标注者差异，不用于训练“所有用户都喜欢”的首版通用 Adapter。
- **Flickr-AES / REAL-CUR 等个性化审美集**：仅作为个人排序方法研究备选。
- **PCCD/评论或 caption 数据**：推迟到选择准确率通过之后，只训练受控属性解释，不把未经核验的长评论当视觉事实。

### 4.4 获取优先级

1. 克隆 TAD66K、AADB、SPAQ 官方仓库，记录 commit。
2. 下载官方 metadata/labels，先生成数据报告，不急于全量复制图片。
3. 获取 TAD66K 图像；官方入口失败时才使用可追溯镜像，并在 manifest 中同时记录原始来源和镜像。
4. 下载 AADB 256×256 小版本做首轮；需要高分辨率时再补完整集。
5. 仅在 Learnability 通过后运行 AVA downloader。
6. PARA 只在个性化方法实验启动时获取。

当前磁盘只有约 42 GiB 可用。下载器必须先计算预计大小，保留至少 15 GiB 系统余量；AVA 等大集优先放 OSS 或外部数据盘，不允许把 raw 图像提交到 Git。

### 4.5 已发现并固定处理的上游陷阱

- TAD66K `labels/merge` 与 47 个按主题文件的拆分不一致：审计发现 478 张按主题 train 图片被移入 merged test。Pocket Earth 禁止使用 `merge/`，只从 `unmerge/<split>/<theme>.csv` 读取，再按图片、主题和 pHash 组重建拆分。
- AADB 完整包含 9,958 张唯一图片、总分和 11 个属性。`train / validation / old test` 三者互斥且刚好覆盖 9,958 张；`testNew` 只是由 873 张 old test 与 127 张 validation 重组出的冗余划分。训练前将前三者合并成“未划分源池”，丢弃上游 phase 语义，再按 pHash 近重复组重建 Pocket Earth 的 train / validation / test；绝不能把 `testNew` 作为新增样本。
- 2026-08-11 的 AADB 全量图片审计结果：9,958 张全部成功解码，28 组完全重复、57 组 pHash 距离不大于 3 的近重复（共 131 张），其中 14 组跨越上游 phase；`testNew` 1,000 张镜像与源图哈希完全一致。所有后续拆分必须以 `duplicateGroup` 为最小单位。
- 当前 AADB 包没有标注者 ID，因此可以做属性感知 pair，不能做 rater-aware pair。个体偏好研究继续由 PARA/其他带用户维度的数据承担。
- SPAQ 已核验 11,125 行 MOS、亮度/色彩/对比/噪声/锐度、9 类场景概率与 EXIF，名称集合一致且无缺失；其高分辨率图包约 34.8GB。首轮只按场景和技术属性分层抽取所需图片，保留至少 15GiB 本机余量，不把 SPAQ MOS 当成“视觉美观”总分。
- TAD66K 全量包 66,327 张有标签图片全部成功解码，另有 798 张无标签图片已隔离；发现 14 个完全重复组、60 个 pHash 距离不大于 3 的近重复组（155 张），其中 23 组跨上游 phase、13 组跨主题。按“摄影者键 + 近重复组”连通分量重建后为 train 52,743 / validation 6,890 / test 6,694，摄影者、重复图和连通分量交叉泄漏均为 0。
- AADB 与 TAD66K 合并审计 76,285 张图片时又发现 3 个跨数据集近重复组（17 张），且全部跨 split；冻结 pair 没有使用这 17 张图片。跨数据集查重是强制门，不能因每个数据集内部已经去重而省略。
- 语义配对不允许只按“同主题/分差”盲配。冻结首轮先用同一 CLIP 模型筛内容相近候选，再保留有足够审美 margin 的 pair：TAD66K 训练对 CLIP 相似度最低 0.723232、中位数 0.861252；AADB 最低 0.828171、中位数 0.913535。AADB 的旧版“只看分数/属性、跨内容配对”方案已明确拒绝。

## 5. 数据治理与防泄漏

### 5.1 目录合同

```text
training/aesthetic-curator/
  README.md
  .gitignore
  sources/                 # 官方仓库或下载器；记录 commit
  manifests/               # 来源、revision、许可页、SHA-256、大小
  raw/                     # 原始数据，不进 Git
  normalized/              # 统一字段与图像索引，不进 Git
  contact-sheets/          # 可重建产物，不进 Git
  splits/                  # 冻结的 group-aware split
  eval/                    # 盲测 schema/摘要；私人图像不上传
  pai/                     # 作业模板、镜像、资源、费用与超时
  runs/                    # 本地报告；大权重在 OSS
```

### 5.2 每个来源必须有 manifest

```json
{
  "dataset": "TAD66K",
  "upstream_url": "https://github.com/woshidandan/TANet-image-aesthetics-and-quality-assessment",
  "revision": "<commit-or-release>",
  "downloaded_at": "<ISO-8601>",
  "mirror_url": null,
  "files": [{"path": "...", "bytes": 0, "sha256": "..."}],
  "allowed_use_in_this_run": "theme-matched aesthetic pairs",
  "notes": ""
}
```

任何标签、图像或拆分更新都产生新 manifest；不允许覆盖 `latest` 后继续沿用旧实验名。

### 5.3 拆分单位

- 以原始图片、拍摄 challenge/theme、来源相册/摄影者和 pHash 近重复组为 group。
- 同一 group 只能出现在 train、val、blind 之一。
- 不能按“pair 行”随机拆分，因为同一图片会泄漏到两侧。
- 联系表互换版本与原版本属于同一 group。
- 冻结后输出 `split-report.json`：样本数、独立图片数、主题分布、重复簇、交叉泄漏必须为 0。

### 5.4 Pair 构造

- 只在同主题、同 challenge 或可解释的相邻语义簇内配对。
- 使用评分分布和标注不确定性设 margin；差异小的样本进入 `TIE`，不强行制造赢家。
- 限制单张图片出现次数，避免少数高分图成为万能赢家。
- 训练对中 A/B 左右位置必须近似均衡。
- 难例包括：评分接近、构图与情绪冲突、技术质量与叙事冲突、主体相同但瞬间不同。
- 长文本理由不作为 gold；属性只能来自公开结构标注或人工复核。

## 6. 训练路线

### 6.1 固定基座

- `Qwen/Qwen3-VL-2B-Instruct`，记录精确 revision、文件清单和 SHA-256。
- 首轮不更换基座、不同时比较 2B/4B，不让基座变化污染 LoRA 归因。
- 训练产物保持标准 PEFT Adapter，包含 `adapter_config.json`、权重、tokenizer/config 引用和 manifest。

### 6.2 Learnability：先做视觉 SFT

首轮任务是一张联系表输入、一个短 JSON 输出。推荐起点：

| 项 | 固定值/搜索范围 |
|---|---|
| train type | LoRA |
| freeze LLM | `true` |
| freeze ViT | `false` |
| freeze aligner/merger | `false` |
| target modules | 视觉/aligner 中经审计兼容的 linear modules |
| rank / alpha | `8 / 16` |
| dropout | `0` 或 `0.05` |
| precision | BF16 |
| batch / accumulation | `1 / 16` |
| gradient checkpointing | 开启 |
| epochs | 2—3，按盲测早停 |
| learning rate | 先 `2e-5`；仅在失败诊断后比较 `1e-5` / `5e-5` |
| max output tokens | 32 |

不同时扫大量超参。流程固定为：32—64 样本 dry-run → 128 样本过拟合检查 → 1,000—2,000 对 Learnability → 过门后 Pilot。

### 6.3 为什么不先做 DPO

SFT 的短选择标签最容易审计、最容易验证视觉 Adapter 是否改变选择，也最利于后续导出。若 SFT 在盲测中没有改善，先检查标签、泄漏、目标层和位置偏置；确认这些无误后，再做显式 pairwise ranking loss 或 DPO。不能用更复杂损失掩盖数据合同错误。

### 6.4 语言层启用门

默认不训练语言层。若视觉 Adapter 已改善选择，但持续出现 JSON/终止问题，依次执行：

1. 收紧 Prompt、Schema、生成长度与停止符；
2. 验证 tokenizer/chat template 一致；
3. 仍失败才加入最小范围语言 LoRA，并重新跑全部盲测与灾难复读门。

## 7. 固定对照与统计验收

### 7.1 三组对照

| 组 | 模型 | 作用 |
|---|---|---|
| A | 2B Base | 基座能力 |
| B | 2B Base + 冻结 Markdown Skill | 流程与提示带来的增益 |
| C | 2B Base + 同一 Markdown + Visual LoRA | 权重真正学到的增益 |

三组只允许更换 Adapter 是否加载；输入图、候选顺序、Prompt、chat template、解码参数、Schema 和后处理完全一致。

### 7.2 必报指标

- A/B pair accuracy、3—6 候选 Top-1 accuracy。
- Tie precision / recall / F1。
- 位置互换一致率。
- 同输入三次重复推理一致率。
- 排序任务 Kendall tau / Spearman rho。
- 非法 JSON、复读、越界选择、空输出率。
- 按数据源、主题、明暗、室内外、人物/地点分层的结果。
- 技术质量与情绪价值冲突集的错误率。

### 7.3 统计方法

- 报告 LoRA 相对 MD 的配对准确率差。
- 对“样本组”做至少 10,000 次 paired bootstrap，报告 95% CI；区间必须排除 0。
- 对二选一正确/错误变化做双侧 McNemar 检验，研究门要求 `p < 0.05`。
- 多次实验必须同时报告所有运行，不只选择最好 seed。

### 7.4 阶段门

| 指标 | Learnability 研究门 | Pilot/发布门 |
|---|---:|---:|
| LoRA 相比 MD 的配对准确率 | ≥ +5 个百分点，CI 排除 0 | ≥ +8 个百分点，CI 排除 0 |
| McNemar | `p < 0.05` | `p < 0.05` |
| 位置互换一致率 | ≥ 90% | ≥ 95% |
| 三次重复一致率 | ≥ 95% | ≥ 98% |
| 非法 JSON / 复读 / 越界 | 0 | 0 |
| HF 与最终端侧选择一致率 | 暂不要求 | ≥ 95% |

未达研究门：停止扩训，定位数据、视觉目标层、联系表或标签问题。未达发布门：Adapter 只保留在研究/证据入口，正式产品继续使用 MD/Base + 本机个人排序器。

## 8. 阿里云 PAI DLC 作业合同

### 8.1 提交前硬门

- 先只读检查地域、Workspace、OSS、GPU 配额、镜像和当前单价。
- 单次 LoRA 训练人民币费用上限固定为 **50 元**；提交前按控制台实时单价反推最长运行时间，并额外保留安全余量。无法证明不会超过 50 元时，不调用 `CreateJob`。
- 代码和数据预先缓存到同地域 OSS；基座必须锁定精确 revision 并在作业启动时核验。首轮基座从 ModelScope 按锁定 revision 拉取，后续正式 Pilot 再缓存到同地域 OSS，避免外部源成为运行时单点。
- `split-report.json` 中跨集合泄漏为 0，train/val 非空，blind 不在训练挂载路径。
- 本地完成 dry-run、128 样本过拟合检查和 adapter namespace 预审。

### 8.2 首轮建议资源

- PAI DLC `PyTorchJob`，1 × A10 24 GB；候选规格 `ecs.gn7i-c8g1.2xlarge`，以提交时控制台实际可用规格为准。
- 使用与 ms-swift、Torch、CUDA 匹配的训练镜像；已验证过的参考组合为 ms-swift 3.12.5 / Torch 2.9 / CUDA 12.8，但每次仍要记录真实 digest。
- PAI `JobMaxRunningTimeMinutes` 与脚本内 `timeout` 同时启用，脚本 timeout 比作业硬超时短 10—15 分钟。
- 首轮实际硬超时 50 分钟、脚本内层超时 48 分钟；实例保留时间为 0。A10 官方参考价 10.50 元/小时，对应理论资源费上限 8.75 元，远低于用户规定的单次 50 元上限。

### 8.3 OSS 隔离

```text
oss://<bucket>/pocketearth/aesthetic-curator/v1/
  code/<code-sha256>/
  data/<dataset-sha256>/
  base/<base-revision>/
  runs/<job-id>/
```

禁止共享 `latest/`、同名 checkpoint、同名日志或覆盖旧 run。训练挂载到 `/mnt/oss` 后，进程只写本次 `runs/<job-id>/`。

### 8.4 提交模板

```bash
aliyun pai-dlc CreateJob \
  --region <region> \
  --body "$(jq -c . pai/job-request.json)"
```

作业内入口使用：

```bash
bash -lc 'set -euo pipefail
mkdir -p <run>/logs <run>/adapter
swift sft \
  --model <base>/Qwen3-VL-2B-Instruct \
  --dataset <data>/train.jsonl \
  --val_dataset <data>/val.jsonl \
  --tuner_type lora \
  --freeze_llm true \
  --freeze_vit false \
  --freeze_aligner false \
  --lora_rank 8 \
  --lora_alpha 16 \
  --bf16 true \
  --per_device_train_batch_size 1 \
  --gradient_accumulation_steps 16 \
  --gradient_checkpointing true \
  --output_dir <run>/adapter \
  2>&1 | tee <run>/logs/run.log'
```

真实参数以提交时锁定的 ms-swift 版本为准。首轮锁定 ms-swift commit `49efcbfe59e480d4fa9a8bdecdb76c743d0af37d`，该版本经远端实测使用 `--tuner_type lora`；不得凭其他版本文档猜测参数名。

### 8.5 已知故障检查

- 训练前卸载未使用且与 Transformers 冲突的 AutoAWQ。
- 旧 Torch 若缺 `init_device_mesh`，不要现场打补丁；换匹配镜像。
- `tee` 前先创建日志目录；所有 shell 用 `set -euo pipefail`。
- PAI 状态 `Succeeded` 只代表进程结束，不代表模型通过发布门。
- Adapter audit 必须确认视觉/aligner tensor 数量大于 0；若声明 visual-only，语言 tensor 必须为 0。

### 8.6 必须归档的产物

- `job-request.json`、镜像 digest、资源规格、开始/结束时间与成本。
- `training-recipe.json`、完整 `run.log`、checkpoint、最终 Adapter。
- `adapter-audit.json`、所有文件 SHA-256、Base revision。
- Base / MD / LoRA 三路盲测原始输出、统计报告和失败样本清单。
- 数据和 split manifest、Prompt/Schema 版本、联系表生成器版本。

缺一项都不能进入端侧导出。

## 9. 端侧导出与发布

### 9.1 共通门

- HF/PEFT 盲测先通过。
- Adapter 可安装、哈希校验、切换、卸载和回滚。
- 最终运行时用同一批冻结联系表重跑，选择一致率达到 95%。
- 飞行模式可运行；网络请求为 0；失败时明确回退 MD/Base。

### 9.2 纯 PWA 分支

- 依据浏览器支持选择 ONNX/WebGPU/WASM 导出，不假设 PEFT 热插拔天然可用。
- 若必须合并权重，合并模型只是部署工件；标准 Adapter 和独立评测永久保留。
- vivo X300 实测：首次加载、单组延迟、20 组连续延迟、峰值内存、标签切换、后台恢复、温升与离线缓存。
- 如果 2B 在浏览器中仍超过体验预算，优先减少视觉分辨率/候选数、异步预取或仅在用户点开短名单时运行；不先换 4B。

### 9.3 Capacitor/MNN 分支

- 使用真实 `Capacitor → Java → JNI → MNN` 路径完成同样盲测。
- 记录 MNN 版本、量化方式、Adapter 格式、APK SHA、模型 SHA 与 RunTrace。
- SME2 需要 ABBA、Perfetto/原始 trace、同输入输出一致性和温升/内存证据；UI 开关不算证据。

## 10. 个人偏好与通用 LoRA 的边界

- 用户对 A/B、旅程封面、保留/跳过的选择先写本机事件：`eventId`、`groupId`、候选 ID、选择、时间、`baseRevision`、`adapterVersion`、`promptVersion`、`featureSchemaVersion`。
- 通用 LoRA 只产出可重算的审美属性和 pairwise margin。
- 本机小排序器将这些特征与地点、人物、时间、收藏、分享等本地信号组合。
- 换 Adapter 时保留事实事件，失效的是 Adapter 相关特征缓存；在手机端重放历史选择并重建派生权重，不需要 GPU 重训。
- 私人相册默认不上传、不进入下一版通用 LoRA。此处是训练数据隔离规则，不影响本机个性化能力。

## 11. 分阶段执行表

### D0：规范冻结

- [x] 审核产品汇总版 Word 与原 Markdown。
- [x] 固定 2B、任务合同、三组对照和统计门。
- [x] 明确纯 PWA / Capacitor 分支冲突与 R0 时点。

### D1：数据落地

- [x] 创建 `training/aesthetic-curator/` 目录与 `.gitignore`。
- [x] 获取并记录 TAD66K、AADB、SPAQ 来源；SPAQ 本轮仅批准 metadata，图包未下载。
- [x] 生成来源 manifest、SHA-256、磁盘预算和下载报告。
- [x] 获取并逐图解码 AADB 与 TAD66K 全量首轮图像。
- [x] 生成 pHash/摄影者/theme group、跨数据集查重与零泄漏 split report。
- [x] 生成并人工抽检同内容语义 pair；冻结 1,327 train / 174 validation / 174 test canonical pairs。

### E0：盲测冻结

- [ ] 冻结联系表生成器、Prompt、Schema 和解码参数。
- [ ] 建立通用盲测、并列、位置互换、旅程封面和情绪陷阱集。
- [ ] 跑 Base / MD 基线并保存逐样本输出。

### T0：本地烟雾测试

- [ ] 32—64 样本完整训练/保存/加载闭环。
- [ ] 128 样本过拟合检查。
- [ ] Adapter namespace 审计和 JSON/终止测试。

### T1：PAI Learnability

- [x] 按单次不超过 50 元的已确认上限提交 1 × A10、1,327 对作业；任务 `dlcjz4xl668a09b3`，50 分钟硬上限，理论资源费上限 8.75 元。
- [x] 归档不可变 OSS 产物、Adapter、三路原始输出、SHA-256 和成本；作业运行 1,567 秒，按核验单价折算约 4.57 元。
- [x] 跑 16 对工程探针的 Base / MD / LoRA 三路评测和位置互换；该规模只做闭环验证，不运行 bootstrap / McNemar 显著性声明。
- [x] 首轮未过门并执行失败诊断；停止进入 5,000—10,000 对 Pilot，也不盲目提交第二次付费作业。

> 本次随作业运行的 16 个 canonical pair / 32 条位置互换评测只用于验证 Base / MD / LoRA 三路闭环、严格 JSON、方向性增益和位置偏置；样本量不足以替代 E0 的 300—500 对真实旅程盲测，也不运行或宣称 McNemar 显著性。无论该小评测结果多好，都不能直接进入发布门。
>
> 为先隔离“视觉 LoRA 能否学到成对审美”的变量，本次 Learnability bundle 使用 ms-swift 标准双图输入，而不是产品最终联系表。它可以证明学习和 Adapter 工程链，不能证明联系表 UI 下的真实效果；进入 Pilot 前必须用冻结的联系表生成器复训/复测，并重新检查字母角标、尺寸和位置偏置。

### T2：端侧与产品

- [ ] 冻结 R0 分支。
- [ ] 导出并跑 HF/目标运行时一致性。
- [ ] vivo X300 完成内存、延迟、温升、飞行模式和连续运行。
- [ ] 接入旅程精选、个人偏好重排、地图与重返现场演示链。

## 12. 停机规则

出现以下任一情况，立即停止扩大训练：

- 盲测泄漏、同图跨集合或位置偏置未解决。
- LoRA 只让属性/理由更漂亮，choice/Top-1 未提升。
- 95% CI 包含 0 或 McNemar 不显著。
- 非法 JSON、复读、越界选择不为 0。
- Adapter 实际没有视觉 tensor，或 visual-only 声明与审计不符。
- PAI 作业超出用户确认的费用或时间上限。
- 端侧与 HF 一致率未过门，或目标机出现崩溃/不可接受卡顿。

停机不等于项目失败：保留 MD/Base + 技术质量 + 本机个人排序器，分析失败样本后再决定是否修数据、目标层或损失。

## 13. 2026-08-11 冻结首轮执行记录

1. 冻结 bundle：1,327 train / 174 validation / 174 test canonical pairs；A/B 完整互换后为 2,654 / 348 / 348 条 SFT rows，3,071 张独立打包图片。
2. 数据包 `learnability-v1.zip`：550,642,585 bytes，SHA-256 `b7724b11976274c4136bf9c5de6b3b8b351c42515d624c9b37599cf70bb651d2`；本地与远端均必须整包复核后才能解压。
3. 训练基座：`Qwen/Qwen3-VL-2B-Instruct@ae9985b208c074c10cfbe3a61b5cb7268cdc9c53`；视觉/aligner-only LoRA，rank 8、alpha 16、dropout 0.05、learning rate `1e-5`、effective batch 8、160 steps、image tokens 512。
4. 资源：上海地域单节点 A10 `ecs.gn7i-c8g1.2xlarge`；PAI 硬超时 50 分钟，脚本内层 48 分钟，理论最高 8.75 元。
5. 作业：`dlcjz4xl668a09b3`。远端必须再次通过预算、ZIP 路径安全、SHA-256、逐行 JSON、图片哈希、精确 A/B swap、split 泄漏与单元测试，才允许训练。
6. 本轮是可学习性/工程闭环，不是最终产品盲测；任务已完成并归档，首轮阶段门判定为未通过，详见下节。

### 13.1 首轮实际结果

PAI 作业 `dlcjz4xl668a09b3` 于 2026-08-11 22:17:12（Asia/Shanghai）成功结束，运行 1,567 秒。按已核验的 10.50 元/小时折算资源费约 **4.57 元**，约占单次 50 元上限的 9.14%；最终账单仍以阿里云账单明细为准。

- 最终 Adapter 为 14,446,016 bytes；SHA-256 `1f5f9b14294b8d205bbb9509e24a7a803426b5a5687e6186bf86a8423999afb9`。
- Adapter scope：204 个 visual tensor、4 个 aligner tensor、0 个 language tensor；语言主干确实冻结。
- validation loss 从 step 80 的 2.296 降到 step 160 的 2.216；说明优化过程有效，但不能替代选图准确率。
- 远端报告下载后本地独立复算，报告 SHA-256 均为 `e0252ddf1065b17f4b2407d2d2a5157b279d9d88511d0d12b148d2a44caf60c7`。

| 16 对 / 32 条位置互换工程探针 | Base | Markdown Skill | Visual LoRA |
|---|---:|---:|---:|
| choice accuracy | 56.25% | 59.375% | 59.375% |
| pair symmetric accuracy | 43.75% | 37.50% | 43.75% |
| 位置 A 预测率 | 50.00% | 59.375% | 53.125% |
| 当前 evaluator 的 exact-key JSON 率 | 31.25% | 21.875% | 37.50% |
| `reasonCode` 命中冻结枚举 | 0% | 0% | 0% |
| 完整严格合同通过率 | 0% | 0% | 0% |

**阶段结论：未过门。** LoRA 相对最佳 baseline 的 choice gain 为 0，pair symmetric gain 为 0，JSON 率也远低于 95%。16 对样本不足以做显著性结论，但已经足以否定“这份首轮 Adapter 可以进入 Pilot”。

### 13.2 失败诊断与下一轮硬门

本次失败没有出现数据泄漏、坏图、错位 swap、Adapter 挂错层或费用失控；主要暴露的是训练合同问题：

1. 160 steps 只覆盖约 0.482 epoch，尚未完整看完一轮 2,654 条 SFT rows。
2. visual-only LoRA 可以改变视觉表征，却不适合承担严格 JSON 和短枚举语言格式学习；语言主干冻结时，应由宿主约束输出格式。
3. Prompt 要求“原因代码”但没有向 Base / MD / LoRA 明示冻结枚举，三路都生成了自然语言理由；当前 `reasonAccuracy = 0` 是可解释的合同缺陷，不应伪装成纯视觉能力失败。
4. 本轮双图输入只验证可学习性，尚未覆盖产品最终联系表与字母角标。

下一次付费训练前必须同时完成：

- 把模型目标收窄为单 token `A/B` 或可直接比较的 A/B logit；由宿主组装 JSON，属性理由另走受控规则/属性头。Base、MD、LoRA 使用完全相同的输出约束。
- evaluator 将“JSON 可解析”“字段精确”“reason 在冻结枚举”“choice 正确”拆成四个独立指标；不得把任意自然语言 reason 计作合同有效。
- 在本地 128 对完成格式、位置互换、checkpoint 加载和 evaluator 单测，再考虑 PAI。
- 若继续 visual/aligner-only LoRA，至少跑满 1 个 epoch；按本次实测速率先做 333 steps 时间预算，仍必须保留 50 元硬上限和内层 timeout。
- Pilot 前改用冻结联系表生成器，并建立 300—500 对 Pocket Earth 真实旅程盲测；公共数据小探针不再承担产品发布结论。

## 14. 官方依据

- [Qwen3-VL 官方微调说明](https://github.com/QwenLM/Qwen3-VL/blob/main/qwen-vl-finetune/README.md)
- [ms-swift 命令行参数](https://github.com/modelscope/ms-swift/blob/main/docs/source_en/Instruction/Command-line-parameters.md)
- [ms-swift 自定义数据集](https://swift.readthedocs.io/en/v3.10/Customization/Custom-dataset.html)
- [PAI DLC CreateJob API](https://help.aliyun.com/en/pai/developer-reference/api-pai-dlc-2020-12-03-createjob)
- [PAI DLC 计费公式](https://help.aliyun.com/en/pai/product-overview/billing-of-dlc)
- [PAI GPU 规格参考价](https://help.aliyun.com/en/pai/product-overview/free-trial-guide)
- [PAI DLC 挂载 OSS](https://help.aliyun.com/zh/pai/use-cloud-storage-for-a-dlc-job)
- [TAD66K / TANet 官方仓库](https://github.com/woshidandan/TANet-image-aesthetics-and-quality-assessment)
- [AADB 官方仓库](https://github.com/aimerykong/deepImageAestheticsAnalysis)
- [AADB 论文](https://arxiv.org/abs/1606.01621)
- [PARA 官方项目页](https://yuzheyang.github.io/blog/Dataset/PARA.html)
- [SPAQ 官方仓库](https://github.com/h4nwei/SPAQ)
- [AVA 下载器与数据说明](https://github.com/imfing/ava_downloader)
- [OpenCV Mobile](https://github.com/nihui/opencv-mobile)：服务“重返现场”特征匹配/配准，不是审美 LoRA 训练库。

---

## 最终发布口径

> Pocket Earth 没有再造一个苹果相册搜索框。它先理解“一段旅程”，再在同一回忆的候选中策展，用视觉 LoRA 学通用审美，用本机选择学“什么更像你”，最后把照片放回地图与现实现场。任何 LoRA 增益都必须在冻结盲测、相同 Prompt、相同输入和真实目标运行时中被证明。
