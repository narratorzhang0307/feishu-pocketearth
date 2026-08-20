# Pocket Earth · Google 技术选型与 GMI 可行性审核

审核日期：2026-07-14

## 结论

提交版已经改为 **Google Gemini API 官方直连优先，GMI 仅作可选备用传输**。服务端检测到 `GEMINI_API_KEY` 时使用 Google 官方 OpenAI-compatible 端点；只有官方 key 未配置而 `GMI_API_KEY` 存在时，才进入 GMI 的 Google-only 备用路径。接口返回会明确给出 `provider`、`modelOwner` 和 `transport`，不混淆模型与传输归属。

推荐的两项 Google 核心技术已经真实落地：

1. Google Gemini：云端多智能体路由、结构化补全、多模态展签理解、跨文化中英导览和复杂合议；
2. Gemma 3n + MediaPipe：浏览器 WebGPU 端侧分类、排序、短对话和视觉读图，无云 API 计费，隐私数据默认不出端。

这两项分别覆盖比赛“Google 技术深度使用”和“低资源/隐私/跨文化体验”，比堆叠 Firebase、Flutter 等未实际需要的技术更可信。

## 与赛事评分项的对应

赛事把 Google 技术深度使用列为 25%，明确要求技术参与核心能力而非简单文本包装；还单列跨文化同理心与本地化体验 10%。Pocket Earth 的看展主链与这两项直接对齐：

| 评分点 | 当前可演示证据 |
|---|---|
| Google AI 是核心能力 | 去掉 Gemini 后无法完成展签多模态理解、跨文化导览与智能体合议；去掉 Gemma 后端侧隐私链路失效 |
| 技术选择与场景匹配 | Flash 做高频多模态与结构化、Pro 做复杂合议、Flash-Lite 做轻路由、Gemma 做本机私密任务 |
| 不只是简单翻译 | 同次 Gemini 输出中文导览、英文导览、文明时间线和受约束“文化桥”，禁止刻板印象 |
| 低资源/隐私 | Gemma 权重一次加载后在设备端运行，不调用云 API；云不可用仍有受控词表和手填入口 |
| 可现场核验 | RunTrace 显示 Gemini/Gemma/本地与显式降级；接口返回 provider、modelOwner、transport；代码有官方 Gemini 与 GMI 双白名单测试 |

赛事原始标准：[Google AI 出海创想赛](https://gdghz.github.io/Vibe-a-thon-2026/google_ai_vibe_a_thon.html)。

## 云端 provider 路线

默认路线是 Google 官方 Gemini API。官方提供 `https://generativelanguage.googleapis.com/v1beta/openai/` OpenAI-compatible 端点，现有文本、流式、结构化 JSON 与图片消息都可复用同一套请求形状：[Gemini API OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)。

用户主动点击生成展品明信片时，`/api/gemini-image` 优先调用官方 Gemini Interactions API 的 `gemini-3.1-flash-image`；仅在官方 key 缺失时才进入 GMI 图片备用传输。官方 REST 形状与图片模型能力见：[Gemini API image generation](https://ai.google.dev/gemini-api/docs/image-generation)。

代码中的优先级固定为：

1. `GEMINI_API_KEY`：Google Gemini API 官方直连；
2. `GMI_API_KEY`：GMI 备用传输，但仍只允许 Google Gemini；
3. 两者都没有：回到确定性规则、端侧或手填入口，不伪造云结果。

## GMI 为什么仍可作为备用

GMI 官方 LLM API 使用 Bearer API key，提供 `/v1/models` 与 `/v1/chat/completions`，并支持文本、图像和音频消息；官方也明确要求密钥不要放进客户端代码。本项目完全遵循这一接入方式：[GMI LLM API Reference](https://docs.gmicloud.ai/inference-engine/api-reference/llm-api-reference)。

当前账户实测：

- `/v1/models` 返回 74 个可用模型；
- `google/gemini-3.1-flash-lite` 文本调用成功；
- `google/gemini-3.5-flash` 文本调用成功；
- `google/gemini-3.5-flash` 的 `image_url` 调用成功，能读取项目测试展签中的中英文字段。

代码做了双 provider 防线：

- 官方适配器只接受 `gemini-*`，并固定 Google 官方域名；
- GMI 适配器只接受 `google/gemini-*`；
- `server.mjs` 和 `vite.config.ts` 都执行“官方优先、GMI 备用”的同一顺序；
- 自动测试分别验证官方端点、官方模型白名单与 GMI Google-only 白名单。

因此“通过 GMI 使用 Google 技术”在工程上成立。风险不是技术归属，而是审核证据不足；提交时必须说“GMI transport → Google Gemini model”，不要说“用了 GMI 所以用了 Google”。

## 无国外银行卡方案

使用优先级：

1. **Google AI Studio / Gemini API 官方 key**：代码已完成官方直连；能取得 key 时优先用于审核演示，调用归属最清晰。
2. **Gemma 端侧**：模型开放权重，不需要云 API key 或银行卡；需要接受 Gemma 许可并下载 Web 兼容模型。Gemma 3n 面向手机、笔记本和平板，支持文本与视觉输入：[Gemma 3n 概览](https://ai.google.dev/gemma/docs/gemma-3n)。
3. **自己的 GMI 组织作为备用**：官方 Gemini key 不可用时保留国内可达路径；必须展示实际模型 ID 与 transport 元数据。Google 2026 年计费规则会变化，不能在材料中承诺“永久免费且无需付款方式”：[Gemini API 结算说明](https://ai.google.dev/gemini-api/docs/billing?hl=zh-cn)。

不建议购买淘宝共享 API key、共享 Google 账号或来路不明的中转 key：

- 密钥可能被多人共享、限流或随时失效；
- 无法证明调用的真实模型与数据处理方；
- 供应商可读取输入内容；
- 共享 key 泄漏后会被快速封禁，Google 官方也要求限制 Gemini API key 并防止泄漏；
- 技术审核时无法提供属于自己的控制台、用量和模型证据。

如果确实需要第三方协助付款，只接受“给**自己的 GMI 组织**充值/兑换官方 voucher”的方式，不交出账号，不接收共享 key，并先向 GMI support 确认渠道是否符合条款。GMI 官方文档能确认存在 credit 与 voucher 概念，但没有公开承诺支付宝/微信等具体方式，因此不能把淘宝代充当成官方支持结论：[GMI rate limits / credits](https://docs.gmicloud.ai/inference-engine/api-reference/rate-limit)。

Google 提交版还把旧 KIRI 云重建默认关闭：3D 展品使用本地文件导入或仓库内置示例，不需要 KIRI 账号、国外银行卡或额外云额度。旧兼容代码只有显式设置 `VITE_ENABLE_KIRI_CLOUD=true` 才出现，不属于本次 Google AI 主链。

## MediaPipe 的现实风险

Google 当前文档确认 `@mediapipe/tasks-genai`、WebGPU、Gemma 3n E2B/E4B Web 模型与多模态图片输入均受支持：[MediaPipe Web LLM Inference](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js)。

但同一官方页面也标注：MediaPipe LLM Inference API 已进入 maintenance-only，并建议 Web 新项目迁移到 LiteRT-LM JavaScript。处理策略：

- 本次按用户指定保留 Gemma + MediaPipe，因其文档、npm 包和 Web 兼容模型当前仍可用；
- 将运行时收口在 `gemmaEdge.ts`，业务层只依赖 `EdgeModel`，未来迁移 LiteRT-LM 时不改 agent；
- 架构图诚实写 `MediaPipe LLM Inference (current) / LiteRT-LM migration-ready`，不声称 MediaPipe 是长期唯一方案。

## 不采用的 Google 技术

- Firebase：当前 IndexedDB/localStorage 与 Node 服务已经满足 demo；硬加 Firebase 只会成为外围包装。
- Flutter / Android Studio：当前交付是 Web/PWA，重写客户端不符合最小改动原则。
- Vertex AI：通常需要 Google Cloud Billing，不符合“不依赖国外银行卡”的约束。
- Google Search grounding：当前建图功能没有接入 grounding，所以代码只称“模型知识候选”，每项默认 `pending` 并带核验提示，不冒充实时搜索。
- Gemini Nano：适合原生 Android 场景，当前 Web/PWA 直接采用 Gemma 更匹配。

## 对《智能体设计模式》的取舍

书中与本项目最匹配的是提示链、路由、多智能体协作、记忆、异常恢复、人类参与、护栏以及轨迹评估。它们已经分别落在 frost-agent 的 Router、Brain、Memory、Boundary 与 RunTrace 中。书中也介绍了 Google ADK、Vertex AI 与 Search 工具，但这些是可选实现框架，不是模式本身；当前 TypeScript Harness 已经实现所需模式，所以不为了技术数量重写到 ADK，也不把未接入的 Vertex 或 Search 写进提交材料。

## 提交时的一句话口径

> Pocket Earth 默认通过 Google Gemini API 完成跨文化理解与多智能体云推理，用 Gemma 3n + MediaPipe 把分类、排序和展签视觉理解留在用户设备；GMI 只作为可选备用传输，不参与核心技术申报。
