# Pocket Earth · Google AI 技术审核十图

规格：2160 × 2880，宽高比 3:4；每张同时提供 PNG 与 SVG。

统一视觉：浅灰网格纸、米白分区、粗黑描边、硬投影、青/绿/紫/黄章节标签与绿色流程箭头，严格延续“Google 技术五幕·浅色版”。

## 十图与审核要求

1. 封面定位：基于空间的个人知识库，建立一句话产品记忆点。
2. 用户痛点与空间索引：目标海外用户、真实场景、出海价值与 Tech for Good 起点。
3. 3–5 分钟真实闭环：回应完成度与传播效果 25%；含本次实跑 52/52 测试文件、1336/1336 测试项、typecheck 与 build。
4. Google 双推理平面：回应 Google AI 深度使用 25%；说明 Gemma / Gemini 为什么与任务匹配。
5. Gemma 3n 端侧证据：项目内 3,038,117,888 bytes 权重、同源 Range、MediaPipe、WebGPU、Agents 可现场复核入口与失败边界。
6. 跨文化看展搭子：回应跨文化同理心 10%；显式同意、双语语境重写、cultural bridge 与反刻板印象。
7. Harness / RunTrace / 长期记忆：回应创新性与 Vibe Coding 20%；展示空间索引、多 Agent 委派、确认式写入与可观测编排。
8. 公私双地球与 FactRelay：私人记忆与公共事实分轨；来源收集、Gemini 双角色核验、确定性评分和人工发布形成责任闭环。
9. Frost Edge：展示日落电台、口袋播客、地球答案，以及公共事件白名单、断网缓存、Pi 无云密钥等硬件边界。
10. 五项审核闭环：把 25/25/20/20/10 五项指标映射到现场可见、代码可复核的证据，并给出 5 分钟演示顺序。

## 口径边界

- Google Gemini API 官方直连优先；GMI 只在无官方 Key 时作为 Google 模型的备用传输。
- Gemma 权重已安装，代码具备加载与端侧试问入口；图中写“可现场复核”，不把未录制的现场状态夸大为已完成演示。
- 不申报 Firebase、Vertex AI、Flutter、Google ADK、Search Grounding 等当前代码未使用的技术。
- KIRI、Mapbox、OSM、Open-Meteo 等不是本次 Google AI 核心技术。
- 8 个公共知识领域的 Agent 接口已实现，但实时版次取决于 provider / snapshot；无数据时明确显示 unavailable。
- Frost Feed 当前线上默认关闭，硬件完成度以实物、视频、源码、白名单和 smoke test 证明。

生成脚本：scripts/build-google-technical-portrait-cards.mjs
