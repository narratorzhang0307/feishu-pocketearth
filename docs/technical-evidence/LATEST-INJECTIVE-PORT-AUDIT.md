# Injective 最新能力迁移审计（Google 版）

审计日期：2026-07-19<br>
只读参考：`/Users/zhangcheng/Desktop/Pocket-Earth-Injective`，最新只读 HEAD `409a98b`；运行时代码迁移基线 `aaa8ced`<br>
写入目标：`/Users/zhangcheng/Desktop/pocket earth_google`

本记录说明哪些最新能力被保留、如何 Google 化，以及哪些链上部分被明确删除。参考仓库和原树莓派均未被修改。

`aaa8ced..409a98b` 的后续差异仅为参赛 PPT、截图与制作脚本，没有新增或修改 Web / Worker / Raspberry Pi 运行时代码，因此本表的功能迁移结论仍覆盖最新实现。

## 迁移结果

| 最新参考能力 | Google 版代码 | 状态与改造 |
|---|---|---|
| 8 个可点击新闻子 Agent | `PublicKnowledgeAgents.tsx`、`publicKnowledgeAgents.ts` | 完整保留；每个领域进入独立 Daily Knowledge 页面 |
| 六步 FactRelay 详情 | 同上 | 合并为单个折叠面板；逐步显示输入、处理、输出与安全边界 |
| 7 日领域候选缓存 | `DailyKnowledgePage.tsx`、`publicKnowledgeMap.ts` | 每个领域显示两条不同的真实候选与原始来源，不用空卡填充 |
| Daily Knowledge 自动 Worker | `knowledge/daily-worker.mjs` 等 | 独立进程、08:10 调度、7 天保留、原子落盘；只允许 Google Gemini 核验 |
| 口袋播客双入口 | `PublicEarthPage.tsx`、`PublicKnowledgeAgents.tsx`、`PocketPodcastPage.tsx` | Public Earth 与 Agents 共用同一页面、同一数据，不复制事实源 |
| 播客 / 文字模式 | `PocketPodcastPage.tsx` | 完整保留；条目必须至少两条独立公开来源才进入播报 |
| Frost 五张身份卡 | `FrostIdentityDeck.tsx`、`frostPublicIdentities.ts` | 完整保留卡片轮播和人格图；改为本地 manifest，删除 NFT、钱包、合约和链上身份 |
| Frost 软件与硬件统一形象 | `FrostPersona.tsx`、`FrostBuddyPage.tsx`、`public/frost-personas/`、树莓派 launcher | 总 Agent 对话页、身份卡、代理广场、播客与设备主持人共用同一图集来源 |
| 树莓派三入口 | `hardware/frost-edge-google/raspi/frost_pi_project_launcher.py` | 日落电台、口袋播客、地球答案均保留 |
| 树莓派真实播客 | `frost_pi_podcast_sync.py`、systemd service/timer | 每天 08:20 拉取同一播客产物；schema/来源门槛校验后原子缓存，本地 TTS 播报 |
| Pi skill router / event adapter / 运维交接 | `frost_pi_skill_agent.py`、`frost_pi_event_adapter.py`、`LINUX-LAYOUT.md`、`LIVE-HANDOFF.md` | 34/34 个顶层树莓派运行文件均有 Google 版对应；链上播报改为白名单公共知识，未注册 skill 与凭证形态内容会被拒绝 |
| 365 日地球答案 | `frost_pi_earth_answers.py`、`earth_answers_365.json` | 保留日期锁、历史回看与离线数据 |
| Injective 合约、钱包、链锚 | 无 | 删除；内容完整性改为本地 Merkle，发布权改为人工确认 |

## Google 技术映射

```text
公开候选来源
  → 8 个领域 Agent
  → Gemini Investigator（受来源约束的多语摘要与跨文化语境）
  → Gemini Skeptic（来源洗白、缺失语境、刻板印象审计）
  → 本地确定性 Truth Score / Merkle 内容根
  → Human Review Gate
  → Public Earth / Pocket Podcast / Frost Edge
```

官方 Gemini API 优先；只有缺少官方 key 时才允许 GMI 作为 `google/gemini-*` 的备用传输。GMI 不被标注为 Google 技术。私人、高频任务仍由浏览器内 Gemma 3n E2B + MediaPipe + WebGPU 承担，公共知识链路不会读取私人地图原文或原始照片。

## 不变式

1. 参考 Injective 项目只读，迁移不反向覆盖原项目。
2. 少于两个独立来源的候选不能进入播客或正式知识版次。
3. Gemini 没有自动发布权限；确定性裁决也只能产生 `review_required`。
4. 身份卡不包含钱包、NFT、合约、现实地址和私人记忆。
5. 树莓派只接收白名单公共简报，不接收 API key、token、照片、精确坐标或完整画像。
6. Web 与硬件的口袋播客消费同一版本化 artifact，避免两端讲述不同事实。
7. `hardware/frost-buddy/raspi` 的 34 个顶层运行/交接文件在 Google 目标目录中均有同名对应；内容按 Google 与无链边界改造，而不是漏拷贝。

## 复验

```bash
npm run typecheck
npm test -- --reporter=dot
npm run verify:knowledge
npm run build

cd hardware/frost-edge-google/raspi
python3 frost_pi_podcast_sync_smoke.py
python3 frost_pi_event_adapter_smoke.py
python3 frost_pi_skill_agent_smoke.py
python3 frost_pi_project_launcher_smoke.py
python3 frost_pi_device_driver_smoke.py
python3 frost_pi_earth_answers_smoke.py
python3 frost_pi_live_preflight_smoke.py
bash -n deploy-to-pi.sh
```
