# Frost Edge · Google AI 硬件技术说明

Frost Edge 是 Pocket Earth 的 Raspberry Pi 5 × Whisplay 实体端。它复用 Web/PWA 的空间知识对象、Public Earth 审核边界和 Frost Agent Harness，在本机增加 Google Gemma 4 E4B 推理，并把复杂、已授权的公共任务升级到 Google Gemini。

- 数字孪生：<https://pocketearth-google.throughtheglass.art/hardware-digital-twin.html>
- 数字孪生源码：[`public/hardware-digital-twin.html`](../../public/hardware-digital-twin.html)
- Google 版设备代码：[`hardware/frost-edge-google/raspi/`](../../hardware/frost-edge-google/raspi/)
- 设备源码快照：[`hardware/frost-edge-google/sunset-radio/`](../../hardware/frost-edge-google/sunset-radio/)
- Gemma 4 真机验收：[`GEMMA-4-E4B-VALIDATION.md`](../../hardware/frost-edge-google/raspi/GEMMA-4-E4B-VALIDATION.md)
- 4K 核心硬件图：[`docs/assets/hardware/frost-edge-4k/`](../assets/hardware/frost-edge-4k/)

![Frost Edge 硬件总览](../assets/hardware/frost-edge-4k/05-frost-edge-hardware-overview-4k.png)

Frost Edge 已在 Raspberry Pi 5 真机运行。Google Gemma 4 E4B 服务绑定设备回环地址，三入口 launcher、屏幕、按钮、音频、公共知识同步和失败降级共享同一 Device Harness；复杂且满足边界的公共任务才升级到 Gemini。

![从真机原型到 Pocket Earth 实体终端](../assets/hardware/frost-edge-4k/03-working-prototype-to-frost-edge-product-4k.png)

![Frost Edge 硬件结构与 Google AI](../assets/hardware/frost-edge-4k/04-frost-edge-hardware-anatomy-google-ai-4k.png)

## 1. Google AI 在硬件上的职责

| 层 | Google 技术 | 设备职责 | 失败后的行为 |
|---|---|---|---|
| 确定性层 | 本地规则与白名单 | 按钮、项目入口、敏感字段、固定目录、缓存读取 | 继续使用规则和上一有效缓存 |
| 本地推理层 | Gemma 4 E4B IT QAT Q4_0 | 受限分类、隐私敏感选择、短文本理解、离线动作候选 | 返回安全空值，设备维持可操作状态 |
| 云端推理层 | Gemini Flash / Flash-Lite / Pro | 多语结构化、公共知识调查与质疑、跨文化说明 | 显示 unavailable 或使用缓存，不切换非 Google 生成模型 |
| 执行边界 | Validator / Critic / Confirm Gate | 校验工具、字段、来源和动作；要求人工确认 | 未确认时不发布、不写私人地球、不执行硬件惊扰动作 |
| 可观测层 | Frost RunTrace | 记录阶段、模型、所有者、传输、耗时、错误和降级 | 规则结果保持 `local`，不会伪装成 Gemma 或 Gemini 命中 |

设备固定采用以下路径：

```text
用户输入 / 按钮 / 公共事件
  → 确定性规则
  → Google Gemma 4 E4B（127.0.0.1:8787）
  → 隐私与事件白名单
  → Google Gemini（复杂且已授权的公共任务）
  → Validator / Critic / Confirm Gate
  → 屏幕、灯光、声音或公共缓存
```

![Gemma 与 Gemini 端云双脑](../assets/hardware/frost-edge-4k/07-gemma-gemini-edge-cloud-routing-4k.png)

## 2. Gemma 4 E4B 本机运行时

当前设备模型来自 Google 官方仓库 `google/gemma-4-E4B-it-qat-q4_0-gguf`：

- 文件：`gemma-4-E4B_q4_0-it.gguf`
- 大小：`5,154,941,280` 字节
- SHA-256：`676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`
- 模型目录：`/var/lib/pocket-earth-gemma/`
- 运行时目录：`/opt/pocket-earth-gemma/`
- 应用目录：`/home/pi/pocket-earth/`
- systemd：`pocket-earth-gemma.service`
- 回环端点：`http://127.0.0.1:8787/v1`
- 模型别名：`gemma-4-e4b-it`

真机验收结果：`pocket-earth-gemma.service` 为 `active (running)`，`/v1/models` 返回 `gemma-4-e4b-it`，真实 Chat Completions 返回 `FROST EDGE READY.`。这些结果、模型哈希和可复现命令记录在 [`GEMMA-4-E4B-VALIDATION.md`](../../hardware/frost-edge-google/raspi/GEMMA-4-E4B-VALIDATION.md)。

模型端点没有公网监听。设备应用通过 `frost_pi_gemma.py` 调用回环服务，并将 `provider=local-gemma`、`modelOwner=Google`、`transport=loopback` 写入结果。安装脚本会校验文件大小和哈希、构建本地运行时、安装独立 systemd 单元，然后调用 `/v1/models` 与聊天完成端点。

相关代码：

- [`install-gemma-edge.sh`](../../hardware/frost-edge-google/raspi/install-gemma-edge.sh)
- [`pocket-earth-gemma.service`](../../hardware/frost-edge-google/raspi/pocket-earth-gemma.service)
- [`frost_pi_gemma.py`](../../hardware/frost-edge-google/raspi/frost_pi_gemma.py)
- [`frost_pi_gemma_smoke.py`](../../hardware/frost-edge-google/raspi/frost_pi_gemma_smoke.py)
- [`frost_pi_live_preflight.py`](../../hardware/frost-edge-google/raspi/frost_pi_live_preflight.py)

## 3. 服务、目录与故障隔离

Pocket Earth 使用自己的目录和服务单元，保留服务器与树莓派上的其他项目：

| 边界 | Pocket Earth 路径或服务 |
|---|---|
| 应用源码 | `/home/pi/pocket-earth` |
| Gemma 运行时 | `/opt/pocket-earth-gemma` |
| 模型与状态 | `/var/lib/pocket-earth-gemma` |
| 本地模型服务 | `pocket-earth-gemma.service` |
| 设备 Agent | `pocket-earth-edge.service` |
| 三入口 Launcher | `pocket-earth-launcher.service` |
| 播客同步 | `pocket-earth-podcast-sync.service` / `.timer` |

Launcher 对 Gemma 使用 `Wants=`，让模型服务保持可选依赖。Gemma 冷启动、升级或故障时，日落电台、口袋播客与地球答案仍能读取规则、目录和缓存。设备 Google 版部署脚本不会覆盖 `/home/pi/sunset-radio`。

![树莓派内部 Google 架构](../assets/hardware/frost-edge-4k/02-frost-edge-raspberry-pi-runtime-layers-4k.png)

## 4. 三个真实硬件入口

![Frost Edge 三个真实硬件入口](../assets/hardware/frost-edge-4k/06-frost-edge-real-device-experiences-4k.png)

### 4.1 口袋播客

口袋播客读取 Public Earth 的 Daily Knowledge 产物。八个领域 Agent 先发现公开信号；Gemini Investigator 与 Skeptic 分别完成来源约束调查和反方审查；确定性 Truth Score 与人工发布闸决定内容能否进入公共版次。树莓派每天同步同一份 `pocket-earth-daily-podcast/v1` 结果，网络失败时保留上一份有效缓存。

![口袋播客与公共知识](../assets/hardware/whisplay/03_口袋播客_真实核验内容.png)

### 4.2 日落电台

日落电台保留歌曲目录、真实日落时刻与随机骰子三种屏幕路径。确定性天文和城市目录负责主流程，Gemma 处理受限自然语言选择，Gemini 只承担需要复杂文化背景的公共说明。播放状态、城市和屏幕反馈留在设备本地。

![日落电台真实界面](../assets/hardware/whisplay/07_日落电台_真实日落时刻.png)

### 4.3 地球答案

地球答案在本地保存 365 日行动卡、日期锁和揭晓状态。Frost-Agent 公共知识入口可展示 Gemini 双角色核验结果；私人原文、精确坐标和用户画像不进入公共硬件事件。

![地球答案本地体验](../assets/hardware/whisplay/10_地球答案_揭晓与回看.png)

## 5. 数据与隐私边界

设备事件桥只允许以下公共、低风险事件：

- `music_now_playing`
- `public_knowledge_brief`
- `buddy_status`

允许字段限于公开标题、短摘要、来源 URL、Truth Score、核验状态和设备显示信息。Bearer token、API key、Cookie、私人记忆原文、原图、人脸、证件、手机号、完整画像和精确坐标会被拒绝。Gemma 失败不会触发静默上传；云端 Gemini 调用仍需满足任务边界与用户同意。

![手机、PWA 与 Frost Edge 的系统边界](../assets/hardware/frost-edge-4k/01-mobile-to-frost-edge-system-boundary-4k.png)

## 6. 数字孪生与可核验证据

数字孪生是单文件 HTML，12 张 Whisplay 界面以 data URL 内嵌，可以离线双击运行，也可以在正式域名直接访问。它使用与真机一致的三个入口、240×280 屏幕状态、Google 技术说明、隐私边界和 RunTrace，作为远程技术复核的补充交互证据。

数字孪生将三入口、Gemma 4、Gemini、Public Earth 与口袋播客放在同一条可交互证据链中；它是展示与状态复现，不替代树莓派上的真实推理验收。

真机证据链包括：

1. 模型文件大小与 SHA-256；
2. `/v1/models` 端点；
3. 真实聊天完成结果与端到端耗时；
4. systemd 服务状态和启动日志；
5. 三入口 launcher 与 12 张真实 Whisplay 截图；
6. Python smoke test、live preflight 与设备资源记录；
7. 数字孪生和生产站点入口。

![代码到真机证据链](../assets/hardware/frost-edge-4k/08-code-to-device-verification-chain-4k.png)

> **真机验证状态：已完成。** Raspberry Pi 5 上的 Gemma 4 E4B 已真实加载并运行，模型发现、真实生成、systemd 服务、回环隔离和应用预检均已通过。数字孪生用于远程展示同一状态机，不替代真机运行证据。

## 7. 本地核验命令

```bash
python3 hardware/frost-edge-google/raspi/frost_pi_gemma_smoke.py
python3 hardware/frost-edge-google/raspi/frost_pi_skill_agent_smoke.py
python3 hardware/frost-edge-google/raspi/frost_pi_live_preflight_smoke.py
bash hardware/frost-edge-google/raspi/preflight.sh
```

真机安装与部署：

```bash
bash hardware/frost-edge-google/raspi/install-gemma-edge.sh \
  sunset-pi \
  /absolute/path/to/gemma-4-E4B_q4_0-it.gguf

bash hardware/frost-edge-google/raspi/deploy-to-pi.sh sunset-pi
```

模型权重、密钥、设备缓存和运行日志均被排除在 Git 之外。

## 8. 官方模型来源与分发边界

- 模型来源：[Google Gemma 4 E4B IT QAT Q4_0 官方模型卡](https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf)；
- Gemma 文档：[Google AI for Developers · Get started with Gemma](https://ai.google.dev/gemma/docs/get_started)；
- 当前设备文件：`gemma-4-E4B_q4_0-it.gguf`；
- 当前设备校验值：`676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`；
- 仓库只保存安装器、服务定义、适配器、测试和证据，不提交或二次分发模型权重；
- 真机实现当前只申报已经测试的文本分类、选择、短回复和降级能力。模型卡中的图像、音频和长上下文能力不自动等于本设备已经接入的产品能力。
