# Google Gemma 4 E4B · Frost Edge 真机验收记录

本记录对应 Pocket Earth Frost Edge 的 Raspberry Pi 5 真机。验收覆盖模型完整性、独立 systemd 服务、回环端点、真实生成与应用侧预检；模型权重、设备地址、密钥和运行日志不进入 Git。

## 验收结论

| 项目 | 真机结果 |
|---|---|
| 设备 | Raspberry Pi 5，8 GB |
| 模型 | Google Gemma 4 E4B IT QAT Q4_0 |
| 模型文件 | `gemma-4-E4B_q4_0-it.gguf` |
| 文件大小 | `5,154,941,280` 字节 |
| SHA-256 | `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee` |
| 服务 | `pocket-earth-gemma.service`，`active (running)` |
| 监听范围 | `127.0.0.1:8787`，仅设备回环 |
| 模型发现 | `/v1/models` 返回 `gemma-4-e4b-it` |
| 真实生成 | Chat Completions 返回 `FROST EDGE READY.` |
| 应用归因 | `provider=local-gemma`、`modelOwner=Google`、`transport=loopback` |
| 故障边界 | Gemma 不可用时回到规则、目录与上一有效缓存，不自动上传 |

## 可复现核验

```bash
systemctl is-active pocket-earth-gemma.service
curl -fsS http://127.0.0.1:8787/v1/models
curl -fsS http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gemma-4-e4b-it","messages":[{"role":"user","content":"Reply exactly: FROST EDGE READY."}],"temperature":0,"max_tokens":16}'
sha256sum /var/lib/pocket-earth-gemma/gemma-4-E4B_q4_0-it.gguf
python3 /home/pi/pocket-earth/frost_pi_live_preflight.py --strict
```

## 运行隔离

- 权重与状态：`/var/lib/pocket-earth-gemma/`
- 推理运行时：`/opt/pocket-earth-gemma/`
- Pocket Earth 应用：`/home/pi/pocket-earth/`
- 动态库：`/opt/pocket-earth-gemma/lib/`
- 监听端点：`127.0.0.1:8787/v1`

模型服务不监听局域网或公网，树莓派不保存 Gemini 云密钥。复杂公共任务由 Pocket Earth 服务端在既有隐私闸和人工确认边界内升级到 Gemini；设备端只接收白名单公共事件。

## 安装器保证

[`install-gemma-edge.sh`](install-gemma-edge.sh) 执行以下动作：

1. 分段续传权重并核对本地与远端 SHA-256；
2. 构建 `llama-server`，同时安装实际依赖的共享库；
3. 安装并启动独立 `pocket-earth-gemma.service`；
4. 等待 `/v1/models` 就绪；
5. 发起一次真实 Chat Completions 请求后才报告完成。

这份记录描述的是已经完成的真机运行验收。数字孪生用于远程展示同一设备状态机，不替代上述真实设备证据。
