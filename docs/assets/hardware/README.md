# 归档：Google / GMI 时期 Frost Edge 硬件图集

> **ARCHIVE ONLY**：本目录是上一场 Google / GMI 比赛的硬件研究归档，不属于当前
> 阿里 Qwen + MNN 手机决赛产品、发布包或技术口径。当前实现与证据以
> `docs/evidence/alibaba-mobile-ai-readiness-20260811.md` 和 Android APK 为准。

本目录保存 Pocket Earth Google 版当时的硬件技术图和 Whisplay 截图。

## 4K 技术图

[`frost-edge-4k/`](frost-edge-4k/) 保存 8 张统一命名的 4096×2304 技术图。它们不是同一内容的重复封面，而是分别回答实体形态、运行分层、交互路径、端云分工和复验方式：

| # | 图 | 主要内容 |
|---:|---|---|
| 01 | [手机 / PWA 与 Frost Edge 边界](frost-edge-4k/01-mobile-to-frost-edge-system-boundary-4k.png) | 软件发起与回看，硬件负责本地推理、现场反馈和安全执行 |
| 02 | [Raspberry Pi 运行时分层](frost-edge-4k/02-frost-edge-raspberry-pi-runtime-layers-4k.png) | 输入总线、常驻内核、三种硬件 Skill、Google AI 与真实反馈 |
| 03 | [已运行原型到产品形态](frost-edge-4k/03-working-prototype-to-frost-edge-product-4k.png) | 真机原型、工业设计与四段实体交互闭环 |
| 04 | [Frost Edge 硬件结构](frost-edge-4k/04-frost-edge-hardware-anatomy-google-ai-4k.png) | 摄像头、扬声器、Whisplay、Raspberry Pi 5、按钮与 Gemma |
| 05 | [实体端总览](frost-edge-4k/05-frost-edge-hardware-overview-4k.png) | 8 GB 树莓派、5.15 GB Gemma、三个真实入口与公共事件边界 |
| 06 | [PI HOME 与三种体验](frost-edge-4k/06-frost-edge-real-device-experiences-4k.png) | 口袋播客、日落电台、地球答案的 240×280 生产界面 |
| 07 | [Gemma × Gemini 端云路由](frost-edge-4k/07-gemma-gemini-edge-cloud-routing-4k.png) | 规则、设备内 Gemma、隐私闸、Gemini 和确认回执 |
| 08 | [代码到真机](frost-edge-4k/08-code-to-device-verification-chain-4k.png) | 安装、权重、systemd、真实请求、真机界面和技术材料互链 |

最终交付以 `frost-edge-4k/` 中的八张 PNG 为准。制作源页位于 [`render-sources/`](render-sources/)，基础渲染脚本为 [`scripts/render_hardware_core_4k.mjs`](../../../scripts/render_hardware_core_4k.mjs)；部分最终图包含人工排版修订，因此重新渲染后仍应进行视觉核对。也可以通过 `PLAYWRIGHT_MODULE` 指定 Playwright ESM 模块地址。

```bash
node scripts/render_hardware_core_4k.mjs
```

## Whisplay 真机界面

`whisplay/` 中的 12 张 240×280 图由设备生产渲染函数导出，不是重新绘制的界面草图：

| # | 界面 | 对应状态 |
|---:|---|---|
| 01 | [PI HOME](whisplay/01_PI_HOME_三项目入口.png) | 日落电台、口袋播客、地球答案统一入口 |
| 02 | [口袋播客模式](whisplay/02_口袋播客_模式选择.png) | 播客 / 文字双模式 |
| 03 | [口袋播客内容](whisplay/03_口袋播客_真实核验内容.png) | 日期、来源门槛与 Truth Score |
| 04 | [文字与 Agent 空间](whisplay/04_口袋播客_文字与Agent空间.png) | 静默阅读、Agent 与今日一页 |
| 05 | [日落电台模式](whisplay/05_日落电台_三模式.png) | 歌曲、日落、随机骰子 |
| 06 | [歌曲目录](whisplay/06_日落电台_歌曲目录.png) | 本地城市与曲目选择 |
| 07 | [真实日落时刻](whisplay/07_日落电台_真实日落时刻.png) | 城市排序和时刻显示 |
| 08 | [随机骰子](whisplay/08_日落电台_随机骰子结果.png) | 本地随机选择结果 |
| 09 | [地球答案待揭晓](whisplay/09_地球答案_每日一次.png) | 每日一次与长按确认 |
| 10 | [地球答案回看](whisplay/10_地球答案_揭晓与回看.png) | 当天内容与历史记录 |
| 11 | [Frost Agent](whisplay/11_Frost_Agent_公共知识入口.png) | 公共知识与人格边界 |
| 12 | [Gemini 双角色](whisplay/12_Gemini双角色事实核验.png) | 调查方、质疑方与确定性裁决 |

数字孪生入口：<https://pocketearth-google.throughtheglass.art/hardware-digital-twin.html>
