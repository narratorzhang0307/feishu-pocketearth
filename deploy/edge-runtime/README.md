# Travel Planner 端侧运行时

这里保留从「上街去」迁入、并为 Pocket Earth 旅行规划收敛后的真实端侧链路：

```text
Pocket Earth Travel UI
  → POST /api/edge (adapter: travel-planner)
  → MNN sidecar
  → Qwen3-VL-2B-Instruct 语言图 + Travel Planner LoRA
  → pocket.travel-intent/v1 协议门
  → Pocket Earth 确定性候选排序 / 天气 / 路线规划
```

LoRA 只负责把自然语言需求解析成结构化旅行意图，包括天数、兴趣、节奏、避开项和是否少走路。城市事实、POI、天气、距离和营业状态不写进 LoRA，仍由可替换的 Data Pack、OpenStreetMap、Open-Meteo 与 OSRM 提供。

## 本地启动

先确认已经安装 MNN 格式的 Qwen3-VL-2B-Instruct，然后启动 sidecar：

```bash
cd deploy/edge-runtime
bash serve.sh
```

应用侧环境变量：

```dotenv
EDGE_BACKEND=mnn
MNN_URL=http://127.0.0.1:8000
```

再启动 Pocket Earth：

```bash
npm run dev
```

访问 `GET http://127.0.0.1:8000/health`，只有 `models.travel=true` 且 `adapters.travel-planner.installed=true`，界面才显示「端侧已就绪」。加载失败时应用明确显示「规则回退」，不会把 Qwen 基座或浏览器模型冒充为 Travel LoRA。

## 运行资产

- `server.py`：MNN HTTP sidecar；提供 `/health` 与 `/v1/chat`。
- `serve.sh`：校验模型、共享权重、LoRA 哈希后启动 sidecar。
- `assets/travel/travel-planner-v1/lora.mnn`：language-only Travel Planner LoRA。
- `assets/travel/travel-planner-v1/manifest.json`：基座版本、量化方式、适配器范围与 SHA-256。
- `assets/travel/travel-planner-v1/SHA256SUMS`：离线完整性校验。

部署信息的公开副本在 `public/models/travel-planner/manifest.json`。大模型资产不会进入前端 `dist` 或首屏；当前开发环境由本机 sidecar 加载。后续上传 OSS 时，只更新 manifest 的远端分发地址及校验值，不改 UI、意图协议或路线规划逻辑。

## 能力边界

- Qwen + LoRA：解析需求、补全缺失约束、输出固定 JSON。
- Pocket Data Pack：提供可装卸的书籍、电影、音乐等个人偏好信号。
- 旅行事实源：提供地点、天气、路径和可验证来源。
- 确定性规划器：筛选、排序、分天和落地图。
- Armv9 SME2 性能：必须在比赛真机单独验收；Mac 只作为功能与协议验证环境。
