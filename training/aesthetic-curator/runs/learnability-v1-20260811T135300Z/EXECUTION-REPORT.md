# Pocket Earth Photos 审美 LoRA — Learnability v1 执行报告

> 结论：PAI 工程链和数据完整性验证成功，首轮模型阶段门未通过。不得进入 Pilot，不提交盲目重跑。

## 作业与成本

- PAI Job：`dlcjz4xl668a09b3`
- 状态：`Succeeded`
- 运行区间：2026-08-11 21:53:08—22:17:12（Asia/Shanghai）
- PAI 计时：1,567 秒（约 26 分 7 秒）
- 资源：1 × A10，`ecs.gn7i-c8g1.2xlarge`
- 已核验参考单价：10.50 元/小时
- 按运行时间折算：约 4.57 元；最终账单以阿里云账单明细为准
- 作业硬上限：50 分钟；脚本内层 timeout：48 分钟；用户单次预算上限：50 元

## 冻结数据

- 1,327 train / 174 validation / 174 test canonical pairs
- A/B 精确互换后：2,654 / 348 / 348 SFT rows
- 训练来源：TAD66K 927 对 + AADB 400 对
- 3,071 张打包图片，545,578,086 bytes，全部 SHA-256 校验
- SPAQ 本轮未进入训练：只有 metadata 通过审计，完整图包未满足磁盘安全门
- AADB / TAD66K 内部与跨数据集 pHash 查重已完成；冻结 pair 不包含已发现的 17 张跨库近重复图

## 训练与 Adapter

- 基座：`Qwen/Qwen3-VL-2B-Instruct@ae9985b208c074c10cfbe3a61b5cb7268cdc9c53`
- ms-swift：commit `49efcbfe59e480d4fa9a8bdecdb76c743d0af37d`
- visual/aligner-only LoRA，rank 8 / alpha 16 / dropout 0.05
- 160 steps，effective batch 8，learning rate `1e-5`，约 0.482 epoch
- validation loss：step 80 为 2.296，step 160 为 2.216
- Adapter scope：visual 204、aligner 4、language 0、other 0
- Adapter：14,446,016 bytes
- Adapter SHA-256：`1f5f9b14294b8d205bbb9509e24a7a803426b5a5687e6186bf86a8423999afb9`

## Base / Markdown / LoRA 工程探针

评测为 16 个 canonical pair，原位与 A/B 互换后共 32 rows；每个来源 8 对。样本量只够验证闭环和暴露问题，不支持显著性或产品发布结论。

| 指标 | Base | Markdown Skill | Visual LoRA |
|---|---:|---:|---:|
| choice accuracy | 56.25% | 59.375% | 59.375% |
| pair symmetric accuracy | 43.75% | 37.50% | 43.75% |
| position A prediction rate | 50.00% | 59.375% | 53.125% |
| evaluator exact-key JSON rate | 31.25% | 21.875% | 37.50% |
| reasonCode 命中冻结枚举 | 0% | 0% | 0% |
| 完整严格合同通过率 | 0% | 0% | 0% |

LoRA 对比最佳 baseline：choice gain 0，pair symmetric gain 0，未过门。逐 row 看，LoRA 与 MD 都正确 18 条，LoRA 独有正确 1 条，MD 独有正确 1 条；差异不足以支持增益声明。

## 独立复核

- 远端 evaluator 报告下载后在本地重新计算，字节级 SHA-256 一致：`e0252ddf1065b17f4b2407d2d2a5157b279d9d88511d0d12b148d2a44caf60c7`。
- Base / MD / LoRA 原始输出与远端 `evaluation.sha256` 全部一致。
- 本地 Adapter 文件与远端 `adapter.sha256` 一致。
- 远端退出码为 0，bundle 二次校验 `ready = true`。

## 为什么停止扩训

1. 视觉 LoRA 与 Markdown 的 choice accuracy 相同，尚未证明权重学习有独立收益。
2. 语言主干冻结，却让模型承担 JSON 和 reason code 生成，任务合同与 Adapter 能力范围错位。
3. Prompt 没有向三路明示允许的 reason code 枚举，所有模型都倾向生成自然语言理由。
4. 首轮只跑 0.482 epoch，不能用“多训几步也许会好”代替受控实验设计。
5. 双图工程探针还不是产品最终联系表输入。

## 下一次付费作业前的硬门

- 模型只输出单 token `A/B` 或 A/B logit；宿主负责 JSON，理由改走受控属性/规则。
- Base、MD、LoRA 使用相同输出约束；MD 只多审美 rubric。
- evaluator 分开报告 JSON 可解析、字段精确、reason 枚举、choice、位置互换。
- 本地完成 128 对 dry-run、checkpoint 加载与新 evaluator 单测。
- visual/aligner-only 路线至少跑满 1 epoch；按本轮实测先预算约 333 steps，仍受单次 50 元硬门约束。
- 真正 Pilot 使用冻结联系表与 300—500 对 Pocket Earth 真实旅程盲测。

## 本地产物

- `remote/learnability-report.json`：远端三路比较报告
- `remote/base-results.jsonl`、`remote/md-results.jsonl`、`remote/lora-results.jsonl`：原始输出
- `remote/adapter-scope.json`、`remote/adapter.sha256`、`remote/evaluation.sha256`：完整性证据
- `remote/run.log`、`remote/train.log`：完整运行日志
- `checkpoints/checkpoint-160/`：本地 Adapter；大权重已由 `.gitignore` 排除
