# Public Earth × Frost Edge 技术说明

本文记录 Pocket Earth Google 版在 2026-07-19 完成的公共知识层、跨文化核验与树莓派实体端闭环。所有结论都对应当前实现，不把未来设想写成已完成能力。

## 1. 产品边界

| 层 | 数据 | 发布权 |
|---|---|---|
| Private Map | 用户确认后的照片、书影音、旅行、展览与偏好 | 用户本人 |
| Public Earth | 公共候选信号、原始来源、核验输出与人工决定 | Gemini 无权发布，必须经过确定性门槛和人工确认 |
| Frost Edge | 已脱敏的音乐状态或公共知识短简报 | 只读呈现，不反向写入私人知识库 |

Public Earth 不包含钱包、NFT、链上身份、合约地址或可交易资产。Frost Persona 只是一张本地能力/偏好卡，不是身份凭证。

## 2. 可执行核验链

代码入口：

- `src/app/components/EarthHubTab.tsx`：Private Map / Public Earth 分层入口；
- `src/app/components/PublicKnowledgeReview.tsx`：来源回执、双角色结果、评分与人工按钮；
- `src/app/components/PublicKnowledgeAgents.tsx`：8 个领域 Agent 与 Daily Knowledge / Podcast 的真实入口；
- `src/app/components/FrostIdentityDeck.tsx`：5 张可切换的 Frost 本地公开身份卡；
- `src/app/data/frostPublicIdentities.ts`：身份卡的公开标签、职责与逐卡隐私边界；
- `src/app/components/DailyKnowledgePage.tsx`：每日版次、来源、Truth Score 与离线 Merkle 验证；
- `src/app/components/PocketPodcastPage.tsx`：只读复用核验记录的音频/文字简报；
- `src/app/lib/publicKnowledge/review.ts`：Gemini 调用、字段归一、确定性裁决；
- `src/app/data/publicKnowledge.ts`：三条可演示来源快照；
- `src/app/lib/publicKnowledge/review.test.ts`：发布门槛回归测试；
- `knowledge/daily-worker.mjs`：独立定时 Worker、原子落盘与 7 天热数据保留；
- `knowledge/google-provider.mjs`：官方 Gemini 优先、GMI Google-only 备用传输白名单；
- `scripts/verify-google-knowledge.mjs`：版次、证明、provider 与无链上字段的可执行验收。

执行序列：

```text
Candidate Signal
  → Claim Intake
  → Evidence Guard
  → Gemini Investigator
  → Gemini Skeptic
  → Deterministic Judge
  → Human Confirmation Gate
```

调查方只能使用输入的来源包，输出中文摘要、English guide、当地语境、cultural bridge、受支持要点与不确定性。质疑方检查同源洗白、相关性/因果混写、日期、缺失语境和刻板印象。两次调用均通过现有 `/api/frost-llm`，任务类型为 `multilingual`；官方 Gemini API 优先，缺少官方 key 时允许 GMI 作为 Google-only 备用传输。

界面分别展示 `modelOwner=Google`、`provider` 与 `transport`。因此技术归属、API 提供方和网络传输不会被混写。

## 3. 确定性安全不变式

`calculateTruthScore` 在本地执行：

```text
source score      = min(36, independentDomains × 18)
support score     = min(24, supportedPoints × 6)
confidence score  = skepticConfidence × 0.28
penalties         = uncertainty + challenges + laundering + stereotype risk
```

最终还有两条不可由模型覆盖的规则：

1. 独立来源域名少于 2 个时，分数最高 48，状态固定为 `insufficient`；
2. 达到门槛时状态也只能为 `review_required`，只有人工按钮能在 UI 层形成批准决定。

核验机制由模型分工、确定性约束和人类责任三层共同构成。

### 3.1 从 Injective 参考实现迁移时的逐项决定

原 `/Users/zhangcheng/Desktop/Pocket-Earth-Injective` 在迁移过程中始终只读。Google 版逐项对照运行代码并完成以下映射：

| Injective 参考能力 | Google 版落点 | 处理 |
|---|---|---|
| PublicKnowledgeGlobe | `PublicKnowledgeMap.tsx` | 保留地图卡片交互，换成现有 Mapbox 主题 |
| PublicKnowledgeDetails | `PublicKnowledgeReview.tsx` | 保留详情入口，强化 Gemini 双角色与确定性门槛 |
| PublicKnowledgeAgents | 同名组件 | 8 张卡全部改为真实按钮并进入对应每日版次 |
| DailyKnowledgePage | 同名组件 | 保留版次、下载包和验证；链锚改为本地 Merkle 内容根 |
| PocketPodcastPage | 同名组件 | 保留音频/阅读模式；只读复用核验记录 |
| daily-worker / daily-service / harness / scoring / evidence | `knowledge/` 同名运行时 | 完整迁移采集、证据、审计、评分、调度和 7 天保留 |
| Injective identity deck | `FrostIdentityDeck.tsx` + `FrostPersona.tsx` + `PublicPlazaPage.tsx` | 保留五卡轮播、可爱人格与代理社交概念；门牌改为本地 `PE-G-*` manifest ID，并去掉 NFT/钱包/链上身份 |
| EarthAnswerAgentPage + 365 条数据 | 同名组件 + `hardware/frost-edge-google/raspi/earth_answers_365.json` | 完整保留每日解锁、历史回看与软硬同版 |
| AgentPlazaPage + catalog + spaceAgent | Google Space Agents 三件套 | 保留创建/审核/安装/直达；链身份字段改为 Gemma/Gemini 技术平面 |
| publicSemantic + Memory Router | `src/app/lib/memory/` + `memoryRouter.ts` | 只读召回公共证据，与私人画像物理分轨 |
| chain archive / contract write | 无 | 明确删除，不用云模型伪装确定性证明 |

因此没有把旧项目的链依赖带入，也没有重复覆盖 Google 版已经完成的 Mapbox、FactRelay 与隐私同意设计。

## 4. 跨文化输出为什么属于核验而非装饰

调查方必须同时给出：

- `summaryZh`：受来源约束的中文事实摘要；
- `guideEn`：面向不同语言用户的简洁英文说明；
- `localContext`：当地制度、历史或社会语境；
- `culturalBridge`：只比较可核实的共同主题与差异；
- `uncertainties`：来源没有回答的内容。

质疑方再对 `stereotypeRisk` 做显式审计。项目禁止把单一事件、作品或政策推断成民族性格，也不把自动翻译等同于跨文化理解。

## 5. Frost Edge 实体端

提交副本位于 `hardware/frost-edge-google/`，包含：

| 实体入口 | 子模式 |
|---|---|
| 日落电台 | 歌曲目录 / 日落时刻 / 随机骰子 |
| 口袋播客 | 播客模式 / 阅读模式 |
| 地球答案 | 本地 365 条答案卡 |

`frost-hardware-bridge.mjs` 和 `raspi/frost_pi_event_adapter.py` 对字段做双重白名单。公共简报最多携带 4 个 HTTPS 来源、0–100 的 Truth Score 和 `review_required / insufficient`。硬件不会接收照片、精确坐标、完整长期画像、API key、token、password 或 private key。

`frost-feed-service.mjs` 把 Daily Knowledge 生成的同一份 Pocket Podcast 片段转换为鉴权、游标式 JSONL；它不重新生成事实。无服务端 token 返回 503，错误 token 返回 401；设备成功执行动作后才保存下一游标。

`frost_pi_skill_agent.py` 保留原硬件的轻量 skill router 结构，但把链上播报替换为 `public_knowledge_brief`、口袋播客和地球答案。可选模型选择器只能由服务器侧 Google Gemini 路径注入；Pi 不保存 Gemini/GMI key，模型返回的未注册 skill 会被拒绝。`frost_pi_event_adapter_smoke.py` 还会明确拒绝旧 `chain_dispatch` 事件。

设备端增加 Google Gemma 4 E4B IT QAT Q4_0 本机推理：

- 模型文件：`gemma-4-E4B_q4_0-it.gguf`，5,154,941,280 字节；
- SHA-256：`676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee`；
- 回环端点：`127.0.0.1:8787/v1`；
- 模型服务：`pocket-earth-gemma.service`；
- 设备 Agent：`pocket-earth-edge.service`；
- 三入口服务：`pocket-earth-launcher.service`。

设备路由固定为 `规则 → Gemma → 隐私边界 → Gemini → Validator / Critic / Confirm Gate`。Gemma 处理受限分类、隐私敏感选择和离线降级；复杂公共任务经任务边界升级到 Gemini。模型服务只监听回环地址，树莓派不保存 Gemini/GMI key。

Google 版使用 `/home/pi/pocket-earth`、`/opt/pocket-earth-gemma` 与 `/var/lib/pocket-earth-gemma`，并使用独立 systemd 单元。原 `/home/pi/sunset-radio` 和其他树莓派项目保持不变。代码快照用于迁移核对，部署脚本只写 Google 版目录。

硬件数字孪生位于 `public/hardware-digital-twin.html`，12 张 Whisplay 界面以内嵌 data URL 运行；在线入口为 <https://pocketearth-google.throughtheglass.art/hardware-digital-twin.html>。完整硬件说明与图片见 [Frost Edge Google AI 硬件技术说明](../hardware/FROST-EDGE-GOOGLE.md)。

## 6. Frost Persona 与代理社交

`public/frost-personas/` 保存两张 3×2 原始人格图集，`FrostPersona.tsx` 用 CSS 裁切为 12 个角色。Frost 总 Agent 对话页、Agents 首页、五张 Public Earth 身份卡、Public Plaza、口袋播客与实体端使用同一视觉语言。

身份卡中的 `PE-G-*` 是本地公开 manifest ID，只用于稳定引用 Agent 角色；它不是链上门牌、资产凭证或现实地址。每张卡同时声明自己的数据边界，且测试会拒绝 wallet、contract、Injective、NFT 等旧语义重新进入公开身份清单。

Public Plaza 的状态机满足：

```text
默认未加入、匹配数为 0
  → 用户看到将被使用的脱敏标签
  → 点击显式同意
  → 生成本机一次性匹配
  → 退出并清除匹配
```

照片、原文、精确坐标和完整长期画像不进入广场。当前广场是本机交互原型，界面明确标注真实匹配仍依赖未来 UGC 生态。

## 7. 复验命令

```bash
npm run typecheck
npm test -- --run
npm run verify:knowledge
npm run knowledge:refresh
npm run build
node --test hardware/frost-edge-google/frost-hardware-bridge.test.mjs

cd hardware/frost-edge-google/raspi
python3 frost_pi_gemma_smoke.py
python3 frost_pi_project_launcher_smoke.py
python3 frost_pi_device_driver_smoke.py
```

2026-07-19 结果：52 个测试文件、1336 项测试通过；生产构建通过；公共 semantic 召回、Google Space Agent 清单、知识 Worker、硬件事件桥、固定 skill 路由、播客 Agent 回执、启动器、设备屏幕与 365 日地球答案冒烟测试通过。
