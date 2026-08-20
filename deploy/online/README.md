# Pocket Earth 决赛版线上部署

线上站点只负责 PWA 静态文件、Qwen 云端增强和只读旅行资料代理。核心 Skill、个人记忆、MNN 推理与 SME2 验收均在 Android 本机；网页预览不会冒充端侧成绩。

## 运行拓扑

```text
https://pocketearth.throughtheglass.art
  -> nginx 443
  -> 127.0.0.1:3009 / server.mjs
       |- dist/                         PWA
       |- /api/frost-llm[-stream]       Qwen 文本/JSON
       |- /api/qwen-vision              用户主动授权的云视觉兜底
       |- /api/qwen-image               Qwen Image
       |- /api/travel-*                 只读地理、天气与来源
       `- /api/edge                     可选本机 MNN sidecar；线上默认 stub
```

旧的 Google/GMI 公共知识 worker 已退出活跃部署。`/api/gemini-*` 与 `/api/gmi-*` 只返回 410，防止旧客户端静默走错模型。

## 必要环境变量

复制 `.env.example` 为 `.env`，至少填写：

```dotenv
API_PORT=3009
DASHSCOPE_API_KEY=...
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
QWEN_VISION_MODEL=qwen3-vl-plus
TRUST_PROXY=true
CLOUD_RATE_LIMIT_PER_MINUTE=24
```

`TRUST_PROXY=true` 只应在 Node 端口未向公网暴露、且请求必经本仓库 nginx 配置时开启。公开云端接口按真实 IP 限流，输入长度与图片类型也在服务端再次校验。

## 部署

```bash
PEM=/absolute/path/to/key.pem \
REMOTE=root@server-ip \
./deploy/online/deploy.sh
```

脚本先构建，再分两阶段推送哈希资源和外壳，最后只重启 `/root/pocketearth` 下的
`pocketearth` PM2 进程并清理该进程对应的旧 knowledge worker。

## 验证

```bash
curl -fsS https://pocketearth.throughtheglass.art/healthz
curl -I https://pocketearth.throughtheglass.art/
```

健康结果应显示 `llm` 为 Qwen、`edge` 为 `stub` 或 `qwen-mnn`；响应应带 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` 与 HSTS。线上网页不能产生 MNN/SME2 真机成绩，正式证据必须从 Android 的验收账本导出。
