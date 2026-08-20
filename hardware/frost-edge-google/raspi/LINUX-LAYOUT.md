# Frost Edge Google 版 Linux 隔离布局

Pocket Earth、Sunset Radio 与 Whisplay 可以共享一台树莓派和一块 HAT，但不共享应用目录、配置、进程、日志、状态文件或 HTTP 端口。唯一有意共享的是 Whisplay 的公开设备协议。

## 目录与持久化

| 路径 | 所有者 | 用途 |
|---|---|---|
| `/home/pi/sunset-radio` | Sunset Radio | 既有电台应用；Pocket Earth 不写入 |
| `/home/pi/Whisplay` | 厂商运行时 | 屏幕、按钮与 LED 公共客户端 |
| `/home/pi/pocket-earth` | Pocket Earth | 启动器、事件适配、播客同步与设备驱动 |
| `/home/pi/earth-answers` | Earth Answers | 365 条已审核本地卡片 |
| `/opt/pocket-earth-gemma` | Pocket Earth | 隔离的 `llama-server` 二进制 |
| `/var/lib/pocket-earth-gemma` | Pocket Earth | Google Gemma 4 E4B Q4_0 权重，只读加载 |
| `/etc/pocket-earth-edge.env` | root | Feed URL 与设备 Bearer token，权限 `0600` |
| `/var/lib/pocket-earth-edge` | Pocket Earth | Feed cursor、播客有效缓存、日期揭晓状态 |
| `/var/cache/pocket-earth-edge` | Pocket Earth | 可重建的本地 TTS 缓存 |
| `/run/pocket-earth-edge` | Pocket Earth | 当前启动周期的屏幕镜像 |

公共知识的 8 个采集 Agent 与 Gemini 核验在服务端运行；树莓派只安装能显示、播报或响应按钮的物理适配器。云密钥不得出现在 Pi 命令、Git、日志或屏幕事件中。

## 进程隔离

| Unit / endpoint | 职责 |
|---|---|
| `sunset-radio.service` · `:8080` | 既有电台 API 与本地语音能力 |
| `whisplay-daemon.service` | 厂商硬件守护进程 |
| `pocket-earth-edge.service` · `:8766` | 鉴权公共事件消费与手机镜像 |
| `pocket-earth-launcher.service` | 日落电台 / 口袋播客 / 地球答案三入口 |
| `pocket-earth-gemma.service` · `127.0.0.1:8787` | Google Gemma 4 E4B 本地推理；单并发、不对局域网开放 |
| `pocket-earth-podcast-sync.timer` | 每天 08:20 同步已核验播客 artifact |

## 数据边界

```text
Pocket Earth Google 服务
  → 鉴权 /api/frost-feed 或公开 /api/knowledge?tool=podcast
  → schema、来源数、Truth Score、凭证形态校验
  → frost_pi_event_adapter.py / frost_pi_podcast_sync.py
  → frost_pi_device_driver.py
  → Whisplay 屏幕 + RGB + 本地 TTS
```

设备只接收公开标题、短摘要、最多四个 HTTPS 来源、Truth Score、人工审核状态和本地播放命令。照片、精确坐标、完整画像、私人记忆、Gemini/GMI key、token 和 password 均不得越过边界。

## 恢复与检查

```bash
python3 /home/pi/pocket-earth/frost_pi_live_preflight.py --strict
systemctl status pocket-earth-edge.service pocket-earth-launcher.service
systemctl status pocket-earth-gemma.service
curl http://127.0.0.1:8787/v1/models
systemctl status pocket-earth-podcast-sync.timer
curl http://127.0.0.1:8766/healthz
```

删除 Pocket Earth 自有 unit 与目录不会修改 `/home/pi/sunset-radio`。反向停止 Sunset Radio 也不会删除播客缓存、Feed cursor 或 365 日卡片。
