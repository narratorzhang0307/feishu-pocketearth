# Pocket Earth Google → Frost Edge 实时联调契约

这条 handoff 只传公开事件。服务器负责来源核验、Gemini 双角色审查、确定性裁决、人工发布状态、鉴权和 cursor；树莓派使用本地 Gemma 4 E4B 做含糊指令选择，并把通过白名单的动作映射为 LED、屏幕和本地 TTS。

## 软件端

1. 服务端和 Pi 配置同一个随机 `FROST_FEED_TOKEN`；真实值不进 Git，也不用 `VITE_` 前缀。
2. `/api/frost-feed` 只输出 `music_now_playing`、`public_knowledge_brief`、`buddy_status`。
3. `/api/knowledge?tool=podcast` 输出版本化播客 artifact；每条至少两个独立来源。
4. `speak` 由服务器受控模板产生；Pi 不补写事实，也不持有 Gemini 或 GMI key。
5. 客户端成功执行 action 后才原子保存下一 cursor；同步失败时保留最后一份有效播客。

## 物理端

环境变量应写入 root 所有、权限 `0600` 的 `/etc/pocket-earth-edge.env`：

```bash
FROST_FEED_URL=https://pocketearth-google.throughtheglass.art/api/frost-feed
FROST_FEED_TOKEN=<随机设备 token>
POCKET_EARTH_API_BASE=https://pocketearth-google.throughtheglass.art
```

单次核验：

```bash
python3 frost_pi_feed_client.py --once --cursor-file /tmp/pocket-earth-frost.cursor
python3 frost_pi_podcast_sync.py --output /tmp/pocket-earth-podcast.json
python3 frost_pi_live_preflight.py --strict
```

`frost_pi_skill_agent.py` 可把本地语音或按钮文本路由到固定 skill。明确指令先走确定性关键词，含糊指令才调用回环地址上的 Google Gemma；Pi 本身不读取云 key。任何模型返回的未注册 skill 都会被拒绝并回落到确定性关键词。复杂任务按隐私边界转交中心 Gemini 路径，设备不会因 Gemma 失败而静默上传内容。

## 解耦验收

| 层 | 所有者 | 验收 |
|---|---|---|
| 公开知识、Gemini 核验、Bearer token、cursor | Pocket Earth 服务 | Node 测试与 `verify:knowledge` |
| JSONL → state / tts / display | Pi adapter | `frost_pi_event_adapter_smoke.py` |
| 本地 skill 白名单 | Pi skill router | `frost_pi_skill_agent_smoke.py` |
| Google Gemma 本地推理 | Pi loopback service | `frost_pi_gemma_smoke.py` + `/v1/models` |
| 播客 schema / Agent 回执 / 原子缓存 | Pi podcast sync | `frost_pi_podcast_sync_smoke.py` |
| LED、Whisplay、TTS、镜像 | Pi driver | `frost_pi_device_driver_smoke.py` + 严格预检 |

完整目录、权限、端口和进程隔离见 [LINUX-LAYOUT.md](LINUX-LAYOUT.md)。
