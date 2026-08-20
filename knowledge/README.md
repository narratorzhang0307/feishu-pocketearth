# Public Earth · Daily Knowledge Worker

Google 版保留了原 Injective 项目里已经验证过的公共知识采集与核验机制，但移除了钱包、合约和链上写入。它是一条独立于私人地球的公开数据流水线：只处理公共新闻与公开来源，不读取用户照片、位置历史或长期私人画像。

## 运行链路

```text
8 个领域 Knowledge Scout
  └─ Google News RSS + Bing News RSS 发现候选信号
      └─ 来源域名、时效、主题相关度与独立性守卫
          └─ Gemini Investigator（受证据约束的调查方）
              └─ Gemini Skeptic（来源洗白 / 日期 / 语境 / 刻板印象质疑）
                  └─ Deterministic Judge（本地 Truth Score）
                      └─ Merkle 内容根 + RunTrace
                          └─ draft_review_required
                              └─ 人工确认后进入 Public Earth
```

模型调用始终遵循 Google-first：

1. 有 `GEMINI_API_KEY` 时调用 Google Gemini API 官方端点；
2. 没有官方 key、但有 `GMI_API_KEY` 时，仅通过 GMI 传输 `google/gemini-*`；
3. 两者都没有时只返回明确标注的官方资料策展样例，不伪装成实时模型核验。

## 八个领域

`ai`、`technology`、`finance`、`climate`、`science`、`health`、`culture`、`policy` 共用同一个 Harness。领域文件只定义查询词、优先来源和主题词；预算、核验角色、失败停止、审计轨迹与人工闸门只实现一次。

## 文件

| 文件 | 职责 |
|---|---|
| `topics.mjs` | 八领域配置、优先来源和调用预算 |
| `evidence.mjs` | RSS 发现、来源清洗、时效/独立域名守卫 |
| `agent-harness.mjs` | Scout 调度、预算、RunTrace 和人工发布闸门 |
| `google-provider.mjs` | Gemini 官方直连优先、GMI Google 模型备用 |
| `scoring.mjs` | 不依赖模型的 Truth Score 计算 |
| `daily-service.mjs` | `/api/knowledge`、版次、证明与下载包 |
| `daily-worker.mjs` | 每日常驻 Worker、7 天热缓存和原子写入 |
| `podcast-agent.mjs` | 只用已核验记录生成口袋播客与文字简报 |
| `archive.mjs` | 人工确认后的长期精选归档（不写链） |

## 本地运行

```bash
# 运行一轮，输出到 var/knowledge/YYYY-MM-DD/
npm run knowledge:refresh

# 常驻；启动时运行一轮，之后每天按环境变量调度
npm run knowledge:worker
```

默认每天 UTC 00:10（北京时间 08:10）运行。生产环境使用独立 PM2 进程 `pocket-earth-google-knowledge`，与 Web 服务、旧 Pocket Earth 和其他项目隔离。

## API

```text
GET  /api/knowledge?tool=topics
GET  /api/knowledge?tool=today&topic=ai
GET  /api/knowledge?tool=edition&topic=ai
GET  /api/knowledge?tool=proof&recordHash=0x...
GET  /api/knowledge?tool=pack&date=YYYY-MM-DD
GET  /api/knowledge?tool=podcast&date=YYYY-MM-DD
POST /api/knowledge?tool=refresh&topic=ai
```

`refresh` 仅允许本机请求；设置 `KNOWLEDGE_ADMIN_TOKEN` 后改为 Bearer Token。公开接口只读。

## 数据与隐私

- `var/knowledge/` 是运行时目录并已加入 `.gitignore`；
- 快照只包含公开新闻、来源元数据、模型审计结果和本地内容根；
- 私人照片、精确坐标、用户对话、Gemma 本地提示和长期画像不会进入 Worker；
- Merkle root 仅用于离线完整性验证，不代表区块链交易、资产所有权或事实已由模型自动发布；
- Worker 无自动发布权限，所有输出默认是 `draft_review_required`。
