# Reading Jot：Base / OCR LoRA 分情况路由与实测证据

日期：2026-08-11  
运行时：Qwen3-VL-2B-Instruct / MNN 3.6.1  
Adapter：`general-ocr-vision` / `general-document-ocr-v6-int8@d09be9ee`

## 结论

Reading Jot 不应对每个摘录强制加载 LoRA。正式策略是：

> 先用 Qwen Base；干净选区直接采用 Base。只有图像质量或 Base 输出出现压力/退化信号时，才运行通用 OCR LoRA 作为第二候选；最终通过质量门选择，强分歧必须人工校对。

这不是“压力页一定用 LoRA”，而是“压力页才允许进入 Base / LoRA 双候选”。LoRA 不得绕过质量门直接覆盖 Base。

## 本轮 Pocket Earth 真链复测

### 单行摘录固定样本

| 样本 | Base CER | LoRA CER | 结论 |
|---|---:|---:|---|
| 红线摘句 | 0 | 0 | Base 已完全正确，无需多跑 LoRA |
| 双竖线摘段 | 0 | 0 | Base 已完全正确，无需多跑 LoRA |

### 五类确定性压力变换

| 样本 | Base CER | LoRA CER | 质量门 |
|---|---:|---:|---|
| 模糊 / 降采样 | 0 | 0 | Base kept |
| 局部反光 | 0 | 0 | Base kept |
| 斜拍 / 旋转 | 0 | 0 | Base kept |
| 远距离小字 | 0.806 | 1.000 | 双方失败，manual review |
| 低对比度 | 0 | 0 | Base kept |

这些单行样本说明：图像看起来“有压力”不等于 LoRA 一定更好。新门禁已将小字的强分歧从错误自动采纳改成必须人工复核。

### 冻结迁移对照：同一中文停车单

两路使用相同图片、相同 `general-document-ocr-transcription-v2` 协议和相同 256 token 预算，唯一变量是 Adapter。

| 分支 | Base | OCR LoRA | 决策 |
|---|---|---|---|
| 清晰页 | CER 0.0127 / 8.44s；输出稳定 | CER 0.0127 / 14.65s；出现长 `□` 尾 | Base kept |
| 反光划痕压力页 | CER 0.0380 / 28.18s；触发 UTF 边界重试并出现长 `□` 尾 | CER 0.0380 / 8.54s；一次返回，未知字符尾显著减少 | LoRA accepted |

CER 会忽略部分符号差异，所以压力页的主要优势不是“核心字段 CER 数字下降”，而是输出完整性、退化尾控制和避免 Base 重试带来的端到端耗时。冻结 36 页盲测仍提供更有统计意义的精度结论：总 CER `0.5112 → 0.4219`，压力页 `0.6461 → 0.4174`，清晰页反而 `0.3763 → 0.4264`。

## 正式路由协议

1. 用户画红线或双竖线；App 仅裁剪选区，原书页不落库。
2. 对裁剪图计算分辨率、亮度、对比度、边缘强度、Laplacian 清晰度和高光裁切比例，策略版本固定为 `reading-jot-gate-v2-streetgo-derived`。
3. Qwen Base 使用摘录专用提示词先转录。
4. 若选区清晰且 Base 质量通过：停止，直接进入用户校对。
5. 若出现低分辨率、低对比度、软焦、疑似反光或 Base 硬门异常：运行 OCR LoRA。
6. LoRA 使用与训练一致的通用 OCR v2 协议和 256 token 预算；UTF-8 decode 边界错误只允许 `256 → 255 → 254 → 252` 有界重试。
7. 输出硬门检查空输出、异常短、未知字符过多、重复行、单字/单词循环、终端塌缩、任务漂移和接近解码上限。模型自报 confidence 只保留为诊断信息，不决定晋级。
8. Base/LoRA 一致度高时默认保留 Base；LoRA 不能因为文本更长或 confidence 更高而晋级。
9. 疑难候选生成独立灰度＋1.16 对比度视图进行第三次复核；复核必须明显支持某一候选，LoRA 才能自动晋级。
10. Base/LoRA 强分歧、增强复核失败或双方均触发硬门时进入人工校文。
11. 识别结果进入可编辑 textarea；Base、LoRA、增强复核、策略版本和门禁原因一起写入本机证据，保存后仍可继续修改。

## 从“上街去”吸收的质量门

本版不是重新发明一套分数，而是迁移三项已经有冻结证据的设计：输入退化路由、输出完整性硬门、跨视图一致性复核。对应的“上街去”证据显示：通用 OCR 36 页盲测中 stress CER `0.6461 → 0.4174`，clean CER 却 `0.3763 → 0.4264`；古籍原始 LoRA `0.7564` 劣于 Base `0.6218`，但门控后降到 `0.5430`。因此 Pocket Earth 明确把“门控后的系统”而不是“LoRA 单路”定义为产品能力。

训练/发布门和手机运行时门分开：训练侧仍要求冻结盲测、压力增益、clean 退化、塌缩率和灾难页率；运行时没有真值 CER，只能依据输入退化、输出完整性、跨候选与跨视图一致性决定 Base、LoRA 或人工复核。

### v2 真实 MNN 三路复跑

2026-08-11 22:27（Asia/Shanghai）重新使用同一冻结停车单执行 `npm run reading-jot:transfer`，没有复用上一次的时延：

- clean 页 Base `13.182s` 通过；LoRA `17.235s` 产生未知字符尾、单词循环和终端塌缩。系统不追加无意义复核，最终 `base-kept`。
- stress 页 Base `31.826s`，并因 UTF 边界把 token budget 从 256 重试到 255，随后触发未知字符尾、单词循环和终端塌缩；LoRA 第一票 `9.451s` 通过。
- 系统没有立即相信压力页 LoRA，而是生成灰度＋1.16 对比度增强视图，用相同 LoRA 路由运行第三票 `9.169s`；第三票仍支持 LoRA 后才标记 `lora-accepted`。
- 两张输入 SHA256 与上一轮完全一致；后端实际返回 `backend=mnn`，运行时为 MNN 3.6.1 / Qwen3-VL-2B-Instruct，Adapter 为 `general-ocr-vision`。

本轮完整文本、时延、CER、token budget、门控原因、输入哈希与结论见 `reading-jot-gate-v2-ab-rerun-2026-08-11.json`。这是运行时 Smoke A/B，用于证明真实路由与第三票门控生效，不替代 36 页冻结盲测。

## 为什么能防止低秩 Adapter 的负迁移

- LoRA 只在与其训练分布相符的疑难 OCR 分支被调用。
- 干净摘录默认停在共享 Qwen Base，避免低秩权重改变已正确的视觉映射。
- 即使进入 LoRA 分支，Adapter 也只是候选，不拥有直接覆盖权。
- 每次决策保留 Base、LoRA、路由原因、质量门和人工确认记录，可追溯、可回滚。

## PPT 截图

- `screenshots/reading-jot-gate-v2-01-runtime-routing.png`：本轮真实 MNN 环境、六步路由和 clean/stress 最终分支。
- `screenshots/reading-jot-gate-v2-02-clean-ab.png`：clean 同图 Base/LoRA A/B；CER 相同但 LoRA 触发完整性硬门。
- `screenshots/reading-jot-gate-v2-03-stress-three-vote.png`：stress Base/LoRA/增强视图三票与最终 LoRA 路由。
- `screenshots/reading-jot-00-app-ui-phone.png`：Reading Jot 真页面与 MNN / LoRA Ready。
- `screenshots/reading-jot-01-evidence.png`：真链、固定样本与干净页 Base-only。
- `screenshots/reading-jot-02-evidence.png`：五类压力矩阵与人工复核门。
- `screenshots/reading-jot-03-evidence.png`：同一停车单 clean / stress 分支对照。

原始数据：

- `reading-jot-gate-v2-ab-rerun-2026-08-11.json`
- `reading-jot-mnn-eval-2026-08-11-rerun.json`
- `reading-jot-mnn-stress-eval-2026-08-11.json`
- `reading-jot-mnn-transfer-matched-protocol-2026-08-11.json`
