# Pocket Earth · Google AI 出海创想赛提交包

## 一句话

Pocket Earth 默认通过 Google Gemini API 官方端点完成跨文化理解与多智能体云推理，用 Gemma 3n + MediaPipe 把高频、隐私敏感的分类、排序与视觉理解留在用户设备；GMI 仅保留为可选备用传输。

## 目录

1. `01_代码与运行说明/`：运行、模型与审核演示路径；
2. `02_架构图/`：最终代码对应的 A-D 架构图；
3. `03_视频口播/`：原片完整字幕、Google 版完整字幕、只含新增替换段的口播、逐段剪辑表；
4. `04_技术审核/`：GMI 可行性、无国外银行卡方案、实现证据清单。

## 审核演示顺序

1. 打开 Agents，展开 `GEMMA 3N E2B × MEDIAPIPE` 端侧引擎面板，点击“加载已安装 Gemma 3n”；
2. 打开看展搭子，点“本地示例”，展示中文手记、English guide、时间线与文化桥；
3. 展示选择图片后的二次确认弹窗，以及所有地图写入前的用户确认；
4. 展示 RunTrace 中的 Gemini / Gemma / local 贡献；
5. 用架构图 B 明确：Google Gemini API 是默认路径，GMI 只是 optional fallback transport。

## 不作出的声明

- 不声称使用了未落地的 Firebase、Vertex AI、Google ADK 或 Search Grounding；
- 不把 GMI 说成 Google 产品；
- 不把本地演示数据说成实时 API 结果；
- 不要求购买淘宝共享 API key 或共享 Google 账号；
- Google 提交版默认关闭旧 KIRI 云重建，3D 使用本地导入或仓库内置示例。
