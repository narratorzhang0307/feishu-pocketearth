# Frost Edge Node · Raspberry Pi Runtime

本目录是 Pocket Earth Google 版的树莓派运行时备份。它只消费公开、已核验的数据，不读取 Gemini/GMI 密钥、私人记忆、原始照片或精确坐标，也不依赖钱包与区块链。

## Google Gemma 本地推理

硬件使用 Google `Gemma 4 E4B IT QAT Q4_0` 文本权重，文件名为 `gemma-4-E4B_q4_0-it.gguf`。它通过独立的 `pocket-earth-gemma.service` 在回环地址 `127.0.0.1:8787` 提供 Chat Completions 兼容 API；接口返回 `provider=local-gemma`、`modelOwner=Google`、`transport=loopback`，便于 RunTrace 与真机预检核验模型归属。

该路径已在 Raspberry Pi 5 真机完成验收：服务状态为 `active (running)`，`/v1/models` 返回 `gemma-4-e4b-it`，真实生成请求返回 `FROST EDGE READY.`。完整文件哈希、命令和隔离边界见 [`GEMMA-4-E4B-VALIDATION.md`](GEMMA-4-E4B-VALIDATION.md)。

```bash
# Mac 端：下载官方 5.15GB GGUF 后执行
./install-gemma-edge.sh sunset-pi \
  /Users/zhangcheng/Downloads/gemma-4-E4B_q4_0-it.gguf

# Pi 端：验证真实加载
curl -fsS http://127.0.0.1:8787/v1/models
python3 frost_pi_live_preflight.py --strict
```

端侧顺序固定为“确定性规则 → Gemma → 隐私边界 → 固定 skill 白名单”。云端 Gemini 不在 Pi 上直连：确有必要的复杂任务由中心服务处理，官方 Gemini API 优先，GMI 仅作为 Google Gemini 模型的备用传输，树莓派不持有两条路径的任何 key。

## 三个硬件入口

- `日落电台`：歌曲目录、真实城市日落时刻、随机骰子。
- `口袋播客`：播客模式与文字模式，共用 Web 端 `/api/knowledge?tool=podcast` 产物。
- `地球答案`：365 条离线原创回答。

橙色按钮长按 1.2 秒进入或执行，单击移动，双击返回。播客预览中单击切换已核验条目，长按只播放当前条目；候选信号不会被播报成事实。

## 每日播客同步

`frost_pi_podcast_sync.py` 验证 `pocket-earth-daily-podcast/v1`，要求每个播报条目至少有两个来源；就绪版次还必须携带完整的 `pocket-earth-podcast-agent-run/v1` 生命周期回执，并声明 `automaticPublication=false`。验证通过后才以临时文件替换方式原子写入缓存，网络失败时保留上一次有效版本。

```bash
export POCKET_EARTH_API_BASE=https://pocketearth-google.throughtheglass.art
python3 frost_pi_podcast_sync.py --output ./pocket-podcast.json
```

`pocket-earth-podcast-sync.timer` 在开机后及每天北京时间 08:20 同步。`pocket-earth-launcher.service` 与 `pocket-earth-edge.service` 分离：前者处理用户按钮与本地界面，后者只消费鉴权的公开事件流。

`frost_pi_skill_agent.py` 先用确定性关键词处理明确指令，只把含糊选择交给本地 Gemma；Gemma 输出仍必须通过固定 skill 白名单，未注册 skill 会被拒绝。目录、权限、进程与端口隔离见 `LINUX-LAYOUT.md`，真机联调契约见 `LIVE-HANDOFF.md`。

## 离线验收

```bash
python3 frost_pi_podcast_sync_smoke.py
python3 frost_pi_event_adapter_smoke.py
python3 frost_pi_gemma_smoke.py
python3 frost_pi_skill_agent_smoke.py
python3 frost_pi_project_launcher_smoke.py
python3 frost_pi_device_driver_smoke.py
python3 frost_pi_live_preflight_smoke.py
```

`deploy-to-pi.sh sunset-pi` 会先上传到远端临时目录、执行全部烟测，再安装 systemd 单元；它不会修改独立的 Sunset Radio 源码目录。Gemma 权重和原生推理服务由 `install-gemma-edge.sh` 单独安装，便于追溯与回滚。
