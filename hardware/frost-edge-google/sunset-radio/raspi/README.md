# Frost Edge · 日落电台运行快照

本目录保存 Pocket Earth Google 版从既有日落电台硬件工程中抽取的树莓派运行组件。它属于只读来源快照后的独立副本，部署目标为 `/home/pi/pocket-earth`，不会覆盖或修改原设备上的其他项目。

## Google 端云双脑

Frost Edge 只暴露两类生成式推理路径：

1. Google Gemma 4 E4B IT 在树莓派本机运行。`edge.py` 通过 `127.0.0.1:8787/v1` 调用独立的 `pocket-earth-gemma.service`，承担意图预分类、候选排序、短答和弱网降级。
2. Google Gemini 处理确有必要的复杂理解。`pi_command_daemon.py` 与硬件入口通过 Pocket Earth 的 `/api/frost-llm` 受控代理升级云端；服务端保留 provider、model owner、transport 和 fallback 记录。

确定性命令优先由本地规则完成。Gemma 只在规则无法可靠判断时参与；云端升级受隐私规则、用户同意和动作白名单约束。端侧失败不会触发静默上传。

## 三个硬件入口

- 日落电台：城市、时间和环境信号驱动的本地播放体验。
- 口袋播客：读取已经通过公共知识核验的内容，生成文字简报与可播放节目。
- 地球答案：围绕地点和公共知识进行本地问答，复杂请求再升级 Gemini。

三个入口共用 Frost Agent 人格、Whisplay 屏幕、按钮事件和同一套边界策略。硬件只同步白名单公共事件与可缓存内容，不保存私人原文、原图、完整画像、精确坐标或云端密钥。

## 关键组件

- `edge.py`：Gemma loopback 客户端与确定性降级。
- `agent_brain.py`：Frost Agent 的规则、工具、Gemma 与 Gemini 路由。
- `pi_command_daemon.py`：验证命令和模型动作，禁止未授权硬件操作。
- `agent_tools.py`：城市、曲目、天气、日落与设备状态工具。
- `whisplay.py`、`whisplay_preview.py`：240×280 Whisplay 真机界面与无硬件预览。
- `capability_doctor.py`：只报告能力状态，不输出密钥。
- `unattended_check.py`：静音、服务、队列、屏幕和边界综合检查。
- `*_smoke.py`：离线、无声、无外部副作用的回归测试。

## 隐私和动作边界

- 摄像头只在用户明确触发时采集单帧，完成分析后删除临时图片。
- 不进行身份识别、面部情绪推断或后台持续拍摄。
- 麦克风临时文件在处理后删除；本地语音组件不依赖云端上传。
- 音频由 `audio_mode.py` 和静音守护控制，后台检查不会自动播放。
- 模型输出只能生成候选动作；城市、曲目和设备命令必须通过本地目录与白名单校验。

## 本地核验

```bash
python3 edge_smoke.py
python3 capability_doctor_smoke.py
python3 unattended_check.py --summary --quick
python3 whisplay_preview.py
```

完整 Google 版部署、模型安装与真机证据位于上级 `hardware/frost-edge-google/raspi/`。本快照保留硬件运行所需的界面、驱动与测试代码，权重文件、运行密钥和私人网络配置均不进入 Git。
