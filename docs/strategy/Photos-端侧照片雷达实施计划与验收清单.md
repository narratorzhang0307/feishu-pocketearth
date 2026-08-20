# Photos 端侧照片雷达实施计划与验收清单

> 状态：六轮工程迭代完成；目标 Android 真机验收待补  
> 建立日期：2026-08-11  
> 唯一工作目录：`/Users/zhangcheng/Desktop/pocket earth 决赛`  
> 上位约束：`Pocket Earth 决赛改造总计划与执行准则.md`  
> 产品定案：Photos 不做“AI 相册清洁工”，而做“完全在手机上的个人照片雷达”。

## 0. 文档效力

本文件是 Photos 改造的逐项执行清单。它把原始研究结论转换为工程任务、质量门和证据要求，并补充总计划中没有展开的实现细节。

执行纪律：

1. 一项能力只有同时具备真实页面、可重复测试、失败路径和证据记录，才能标记为完成。
2. 不以静态演示数据、假模型状态、Manifest 中的加速标签或开发机结果替代真机证据。
3. 不为赶进度改变“原片默认不复制、不上传、不自动删除、最终决定归用户”的边界。
4. 新照片 LoRA 不进入关键路径；必须先完成 Qwen3-VL 基座冻结盲测，再决定是否训练。
5. 每完成一个工作包，在本文件“实施记录”补充文件、测试和证据路径。

## 1. 固定产品契约

### 1.1 一句话定义

Pocket Earth Photos 在手机本地理解照片里有什么，把几千张照片变成可搜索、可聚类、可提取信息、可钉到地球的索引；AI 只提出建议，不替用户判断回忆的价值。

### 1.2 三个根入口

| 入口 | 责任 | 明确不做 |
|---|---|---|
| 待你决定 | 把全库压缩成连拍代表、疑似重复、技术问题、待提取票据、可落地球等少量问题 | 不展示虚构数量，不自动执行删除 |
| 找照片 | 本地自然语言查询时间、地点、对象、人物、票据、二维码、OCR 和 GPS 条件 | 不把原片或私人索引发到公共云端 |
| 光阴志 | 展示用户明确确认收录的真实本地照片，保留时间/杂志/日历视觉 | 不把 AI 的“建议保留”等同于用户确认 |

### 1.3 活跃字段

旧 `valueScore` 只保留兼容，不进入新 UI：

```ts
interface PhotoDecisionEvidence {
  technicalQuality: number;       // 0-100，技术可用性，不代表回忆价值
  similarRepresentative?: boolean;// 相似/连拍组内的技术代表
  personalAffinity?: number;      // 0-100，明确选择足够后才出现
  preferenceConfidence: number;   // 偏好样本充足度
  reasons: string[];              // 每条必须有真实信号来源
  confidence: number;             // 类型或建议置信度
}
```

禁止文案：

- AI 价值分
- AI 认为这张没有价值
- 已为你清理
- SME2 已启用（没有真机运行日志时）
- Qwen 已识别（实际走规则、CLIP、Ollama 或 stub 时）

### 1.4 动作权限

| 动作 | AI 可执行 | 用户确认 | 系统二次确认 |
|---|---:|---:|---:|
| 打标签、建派生索引 | 是 | 授权相册即同意本地索引 | 否 |
| 建议连拍代表/重复/技术问题 | 是 | 查看或忽略 | 否 |
| 收入光阴志 | 否 | 必须 | 否 |
| 钉到 Pocket Earth | 否 | 必须 | 否 |
| 读取原片 | 否 | 必须点击具体照片 | 视系统接口 |
| 删除系统照片 | 否 | 必须 | 必须使用系统确认 |
| 上传私人照片或索引 | 否 | 独立明确授权 | 视目标服务 |

## 2. 当前实施状态基线

截至 2026-08-11：

| 能力 | 状态 | 当前证据 | 仍缺 |
|---|---|---|---|
| 三入口 Photos UI | Web 纵向闭环完成 | Web 构建、393×852 三入口/搜索/二次清除确认回归 | Android 真机安全区、真实大库和长列表回归 |
| Web 手动选图 | 首版完成 | 公开项目图片建立资产索引；坏图隔离；会话原图 URL 不持久化 | HEIC/大图/视频/1000 张批次 |
| Capacitor 相册桥 | 工程、同步与 debug 构建完成 | Capacitor 8.5、Capgo 8.0.21、Android 工程、分页/断点/按需原片、独立 GPS 插件、权限中途变化失败闭合测试、merged permissions、clean debug APK | 真机 full/limited/denied、content URI 和权限收回未验 |
| IndexedDB 资产与雷达索引 | 恢复链和批量事务完成 | 原片和 Web `File/blob:` 不入库；断点续跑、missing/权限收回、容量估计、独立清除；5000 条合成资产单次批读/批写契约 | schema 迁移与 5000 张真实照片容量实测 |
| 便宜技术分析 | pHash v3 全局重建完成 | EXIF、像素、dHash + 独立 TypeScript pHash、类型、跨分页重复/事件连通分量、稳定 asset key、v2→v3 迁移；5000 条合成分组 61ms | 闭眼/主体、真实连拍盲测、真实大库 CPU 预算 |
| 端侧语义索引 | Web 真链与中断保护通过 | CLIP 224px、512d→int8、版本化 IndexedDB、cache-only 搜索、20 条会话 LRU、latest-query-wins、20% orphan 闸、2 张公开图增量复用 | Android 性能、100 图/20 查询召回率 |
| 自然语言组合过滤 | 混合检索与合成冻结回归完成 | 标签/时间/GPS/OCR 与 embedding top-k 合并，命中约束不被向量绕过；100 条合成 metadata/tag/OCR、20 查询 Recall@5/20 均 20/20 | 真实图片/CLIP、人物和地标冻结评测 |
| Qwen3-VL 代表图 | 结构门禁完成 | MNN 识别青铜器；固定 Router schema、隐私风险与非法输出失败闭合 | 硬负样本盲测、自动漏斗比例与真机 |
| Base-first OCR 门禁 | MNN/Adapter 实测完成 | clean Base、stress Base/LoRA synthetic 对照；关键字段冲突转人工；发布哈希/硬链接证明 | 真实票据授权集、Android 真机与密集页超时 |
| Pairwise 偏好模型 | 冷启动闭环完成 | 10 组二选一、少样本中立、跨类型配对、跳过/撤销/清空、独立持久化 | embedding 特征与真机长期学习 |
| 光阴志真实确认 | 首版完成 | 只有 `chronicleIncluded=true` 才展示 | 完整时间/杂志/日历数据适配与大库性能 |
| 地球 pin | 复用接入 | 调用现有 `userMarks(kind:'photo')` 总线 | 真实 GPS 照片真机闭环与幂等截图 |
| Android/离线 MNN/SME2 | 原生路由与 APK 静态验收完成，真机未验 | Photos 按平台路由至 `PocketMnn` Capacitor→Java→JNI；clean APK、12/12 JNI、签名/16 KiB、MNN/SME2 内核静态契约通过；Mac sidecar MNN/LoRA 真跑；`sme2Verified=false` | 签名模型包真机安装/decode、飞行模式、PSS/温度与 SME2 A/B |

此表中的“首版完成”不等于决赛验收完成。

## 3. 总体技术结构

```text
Android Photo Library / Web manual picker
  └─ assetId + 时间 + 尺寸 + GPS + 缩略图引用
       └─ 增量资产索引（IndexedDB）
            ├─ 便宜闸门：EXIF / 模糊 / 曝光 / dHash / pHash / 时间邻近
            ├─ 全局聚类：重复 / 连拍 / 时空事件
            ├─ 端侧语义：MobileCLIP 或现有 CLIP embedding
            └─ 难例路由：Qwen3-VL-2B + MNN
                 ├─ 内容/来源/隐私风险结构协议
                 └─ 票据 Base OCR
                       └─ hard case → general-ocr Visual LoRA
                            └─ 双结果 Quality Gate

全部派生信息 → 本地照片索引
  ├─ 待你决定
  ├─ 找照片
  ├─ 本地 pairwise 偏好模型
  ├─ 用户确认 → 光阴志
  └─ 用户确认 → mark_place → Pocket Earth
```

硬性路由约束：Qwen3-VL 不逐张扫描几千张原图。全库阶段只使用元数据、缩略图算法和轻量 embedding；Qwen 只处理簇代表、票据候选和不确定图。

## 4. 数据与生命周期设计

### 4.1 系统资产记录

必须持久化：

- `key`：来源命名空间 + 系统 assetId。
- `assetId`：用于重新获取缩略图或按需原片。
- 授权来源：full、limited、selected。
- 媒体类型、MIME、尺寸、拍摄/修改时间。
- GPS（系统授权允许时）。
- 缩略图缓存引用，不存原片 URL。
- `analysisState`、索引版本、首次/最后发现时间。

禁止持久化：

- Web `File` 对象。
- `blob:` URL。
- 批量原片缓存路径。
- Canvas、模型输入张量和临时 base64。

### 4.2 派生雷达记录

必须包含：

- 内容 hash、技术质量、类型、标签、原因和置信度。
- 相似组/连拍组/事件组 ID。
- 当前技术代表与用户代表。
- 视觉后端真实来源：local-features、local-clip、qwen3-vl-mnn 或 fallback。
- OCR 结构、使用 Base/LoRA、质量分和门禁结果。
- 用户确认状态：光阴志、地球 pin、明确清理建议处理状态。
- 模型与索引 schema 版本，便于失效重建。

### 4.3 索引状态机

```text
discovered
  → thumbnail-ready
  → cheap-analyzed
  → embedded
  → qwen-enriched（可选）
  → ocr-enriched（可选）
  → user-confirmed（可选）

任一步失败 → failed + errorCode + retryable
权限收回 → metadata-retained + source-unavailable
系统资产消失 → missing，不立即删除用户确认与解释记录
```

### 4.4 版本与迁移

- 资产索引、雷达分析、embedding、偏好模型分别维护版本号。
- 算法或模型版本变化时只失效对应层，不全库无差别重做。
- 重建前保留用户明确确认、纠错和光阴志状态。
- 提供“清除照片索引”和“清除个人偏好”两个独立操作。

## 5. 工作包 A：系统相册桥

### A1. Web 安全降级

- [x] `<input type=file multiple>` 仅读取用户主动选择内容。
- [x] UI 明确说明浏览器不能枚举全部系统相册。
- [x] Web `File` 与 `blob:` URL 不持久化。
- [x] 会话恢复时提示重新选择；Web 原片/blob 不可恢复时只显示占位，不发出坏缩略图请求。
- [ ] 100/500/1000 张批次取消、内存和坏图隔离测试。

### A2. Android Capacitor

- [x] 固定 Capacitor 8.5 与 `@capgo/capacitor-photo-library` 8.x。
- [x] TypeScript 桥支持授权、分页、系统选择器、缩略图和按需原片。
- [x] 建立 `capacitor.config.ts` 和 `android/` 工程。
- [x] `npx cap sync android` 通过，Capgo 插件已进入生成配置。
- [x] Photos Qwen/OCR 在 Capacitor Android 只走 `PocketMnn` 原生桥，不请求不存在的 `/api/edge`；有定向 transport 测试。
- [x] 隔离 JDK 21 + Android SDK 36 clean Gradle Debug 构建通过；保留 APK 大小、SHA256、v2 签名、16 KiB 对齐与 12/12 JNI 证据。
- [ ] Android 13 `READ_MEDIA_IMAGES` 真机授权。
- [ ] Android 14 `READ_MEDIA_VISUAL_USER_SELECTED` 的 full/limited/denied 三态验证。
- [ ] Android 12 及以下 legacy 权限兼容验证或明确最低系统版本。
- [x] `ACCESS_MEDIA_LOCATION` 使用独立 `PocketPhotoLocation` 插件，和照片授权分开请求；未授权时不把权限缺失伪造成“照片没有 GPS”。
- [ ] 系统权限收回、部分照片变更和再次授权验证。
- [x] Android `PocketPhotoAssetRouter` 按 MediaStore content URI 交给系统相册打开；不调用会复制全尺寸缓存的 `getPhotoUrl()`。目标机系统查看器兼容性仍待验收。

### A3. 相册枚举性能

- [ ] 首批 120 个资产可渐进显示，不等待全库完成。
- [ ] 全库分页不把所有原片或 base64 放入 JS 内存。
- [ ] 超过 5000 个资产时 UI 不冻结，支持取消和断点续跑。
- [x] 5000 条派生资产已覆盖单批 IndexedDB 契约、全局分组和 literal/semantic 合并的桌面合成回归；不替代上一条真实照片/UI 验收。
- [ ] 列表使用虚拟化或窗口化，DOM 节点数量有上限。

验收证据：权限录屏、asset 数量日志、缓存目录检查、内存截图、Gradle 构建日志。

## 6. 工作包 B：便宜感知与全局聚类

### B1. 技术质量

- [x] 清晰度、曝光、颜色、对比度、平均亮度。
- [x] `technicalQuality` 与 `personalAffinity` 字段分离。
- [x] 加入过曝/欠曝、清晰度偏低和高光/阴影裁切的独立原因；只保存归一化便宜信号，不保存像素。
- [ ] 评估主体占比、闭眼或人脸清晰度；若模型成本过高，不进入关键路径。
- [ ] 冻结真实照片技术质量样本集，覆盖夜景、艺术模糊、截图、文档和社交平台压缩图。
- [x] 技术问题只产生建议；页面没有系统删除调用，并明确要求回系统相册二次确认。

### B2. 重复与连拍

- [x] dHash 与时间桶批内近似重复。
- [x] 时空簇内技术代表。
- [x] 独立实现 32×32 灰度、低频 8×8 DCT、去 DC、均值二值化的 pHash；使用保守汉明阈值 6，并与时间/GPS/dHash 护栏联合，不单独触发删除。
- [x] 算法版本升级为 `photo-radar-phash-v3`；存量 `photo-radar-dhash-v2` 下次扫描重算一次，用户确认与偏好数据不丢失。
- [x] 跨分页/跨批次全局查重，避免 batch ID 把同组拆开。
- [ ] 连拍识别结合时间间隔、尺寸、相似度和系统 burst 信息（可用时）。
- [x] 截图/文档连续序列跳过普通实拍查重，并有同 hash 连续截图不产生 `duplicateOf` 的定向测试。
- [x] `duplicateOf` 使用稳定 asset key，而不是可能碰撞的内容 hash。
- [x] 用户切换代表只训练个人偏好与光阴志确认，不覆盖 `technicalQuality`。

### B3. 事件聚类

- [x] 时间 + GPS 近邻的基础时空簇。
- [ ] 无 GPS 时结合时间和 embedding，形成旅行/活动事件候选。
- [ ] 地点半径和时间窗建立固定测试。
- [ ] 跨时区、错误 EXIF 时间和异常 GPS 进入待确认。

## 7. 工作包 C：全库语义索引与搜索

### C1. embedding 路径

- [x] 现有浏览器 CLIP 可做零样本粗分类。
- [x] 固定首个决赛 embedding 模型为 `Xenova/clip-vit-base-patch32`；MobileCLIP 保留为 Android 后续替换项，并如实标注当前不是 MobileCLIP/MNN。
- [x] 只编码 224px 缩略图，不编码全库原片。
- [x] embedding 量化和本地持久化，记录 512 维、模型 ID、版本、源修改时间和生成时间。
- [x] 文本查询只计算一次文本向量，使用 cosine top-k。
- [x] 同一会话缓存最近 20 条文本向量；文本 runtime 串行，排队旧查询跳过且只有最新查询可回写。
- [x] full + authorized 快照才允许回收孤立向量；limited 快照不清理，孤立比例超过 20% 自动保留。
- [x] 模型升级只忽略/重建对应 embedding，不丢用户确认。
- [x] embedding 只进入本地 IndexedDB；生产代码没有向公共 OSS/云模型发送路径。

### C2. 组合查询

- [x] 时间、GPS、标签、OCR 的确定性组合过滤首版。
- [x] “去年杭州拍的猫”。
- [x] “所有停车票据”。
- [x] “没有 GPS 但像西湖的照片”。
- [x] “带二维码的照片”进入本地同义词、Qwen 结构标签和语义查询。
- [x] “东京旅行中有朋友的照片”可由本地文本扩写 + 人物标签/向量召回组合执行；召回质量仍待冻结评测。
- [x] “猫和票据”确定性标签按交集解释；语义候选作为补召回，时间/GPS 硬约束仍生效。
- [ ] 未知自然语言先做本地文本解析；解析失败再用本地 Qwen 文本能力，不调用云端。
- [x] 查询结果逐项显示时间、GPS、标签、OCR 与语义分来源；解释不回显 OCR 正文。

### C3. 搜索评测

- [ ] 建立至少 100 张冻结测试图库和 20 条查询。
- [ ] 记录 Recall@5、Recall@20、误报类型和无结果率。
- [x] 建立 100 条合成 metadata/tag/OCR 记录 + 20 条中文查询的确定性回归，Recall@5=20/20、Recall@20=20/20、无结果=0；不含真实图片或 CLIP。
- [ ] 票据、截图、真照片、雕塑/画作等硬负样本单独统计。
- [x] 无模型、无 embedding、cache 不完整或索引版本不兼容时明确降级到标签/时间/GPS/OCR。

## 8. 工作包 D：Qwen3-VL/MNN 路由

### D1. 固定结构协议

目标输出：

```json
{
  "sourceType": "real_photo | screenshot | document_photo | artwork | uncertain",
  "photoCategory": "real-scene | real-life | screenshot | document | uncertain",
  "content": ["pet", "cat", "person", "food", "landmark"],
  "documentType": "receipt | ticket | menu | id | other | none",
  "needsOcr": true,
  "privacyRisk": ["face", "id_number", "address", "qr"],
  "route": "semantic_index | ocr | geo_pin | review",
  "description": "只描述可见事实",
  "confidence": 0.92
}
```

- [x] JSON 抽取、枚举收口和置信度归一化。
- [x] `photoCategory` 可纠正便宜启发式误判。
- [x] 补齐 `sourceType/content/documentType/needsOcr/privacyRisk/route/hardDocument` 固定字段。
- [x] Prompt 明确不猜人物身份、关系和不可见地点；只保存可见结构证据。
- [x] 非 MNN 后端不显示为 Qwen3-VL/MNN 成功。
- [x] schema 缺字段、枚举非法或非 JSON 时保留原判断，并在 RunTrace 显示结构门禁失败。

### D2. 漏斗路由

- [x] 用户可对代表图手动触发 Qwen。
- [ ] 自动路由仅覆盖：低置信、簇代表、票据候选、搜索召回不足。
- [ ] 已确定的纯黑、完全重复等便宜项不调用 Qwen。
- [ ] 全库 Qwen 调用数量和比例写入 RunTrace。
- [x] Qwen/OCR 使用外部 AbortSignal 可由页面即时取消，并保留 75/125 秒内部超时；取消路径有集成测试且不写派生结果。

### D3. 硬负样本冻结盲测

至少覆盖：

- [ ] 真猫 / 猫截图 / 猫雕塑 / 猫画。
- [ ] 停车票 / 登机牌 / 菜单 / 二维码海报。
- [ ] 真实街景 / 手机截图中的街景。
- [ ] 社交平台压缩且无 EXIF 的真实照片。
- [ ] 文物、书页、艺术品和拍摄文档。
- [ ] 反光、小字、倾斜、遮挡和模糊票据。

只有冻结盲测表明基座路由质量不足，才进入 `photos-router-v1` LoRA 决策。

## 9. 工作包 E：票据 OCR 与 Quality Gate

固定流程：

```text
Qwen Base 判断 documentType / needsOcr
  → 普通票据 Base OCR
  → 完整性与字段质量评分
  → 仅 hard case 且 Adapter 已真实安装时调用 general-ocr-vision
  → Base 与 LoRA 同标尺比较
  → LoRA 至少提升 0.08 才覆盖 Base
  → 双方低于人工阈值则进入 manual-review
```

- [x] Base-first 纯函数门禁。
- [x] LoRA 最小提升阈值 0.08。
- [x] 输出 route、qualityScore 和 qualityGate。
- [ ] hard case 已读取 Qwen 固定结构字段，并兼容旧理由；像素侧反光/透视信号尚未独立冻结。
- [x] Adapter 未安装或运行时补丁/基座哈希/共享硬链接不匹配时失败闭合，不用 Base 冒充 LoRA。
- [x] synthetic clean 票据证明 Base 直接完成且不调用 LoRA；真实用户票据仍待授权测试。
- [x] synthetic stress 票据完成 Base/LoRA 双结果：CER 18.78%→10.80%，但金额退化，关键字段冲突转人工。
- [x] 复现 clean Base 优先：本次 synthetic clean CER 1.41%，并继承现有冻结 audit 的 clean 退化结论。
- [x] OCR 正文不进入 RunTrace；Trace 只记录模型、Adapter、门禁和回退摘要。
- [x] face、ID number、地址、二维码风险在票据卡展示并要求分享/导出前复核。
- [x] OCR 只由用户对单张候选触发，有 75/125 秒超时；不会进入整本相册后台扫描。

## 10. 工作包 F：个人偏好模型

### F1. 原则

- 技术质量永远不被个人偏好训练修改。
- 未点击不是负样本。
- 只有明确二选一、换代表、收藏、收入光阴志或钉地球才形成训练信号。
- 模型本地训练、本地保存、可解释、可清空。
- 样本不足时不显示确定性个人分。

### F2. 冷启动

- [x] Bradley-Terry 风格在线 pairwise 更新首版。
- [x] 标签与可解释基础特征权重。
- [x] 冷启动 UI 提供 10 组二选一，可跳过且跳过不记负样本。
- [x] 少于 10 次明确选择时显示“学习中”，`personalAffinity` 保持空值。
- [x] 候选生成优先跨照片类型并保持确定性，避免十组都来自同一类。
- [ ] 加入 embedding 特征或低维投影，提升对具体视觉风格的学习。
- [ ] 偏好原因区分“你常选择宠物/人物/夜景”等可解释信号。

### F3. 生命周期

- [x] Photos 页面显示样本数与可信度进度；独立设置页/更新时间展示仍待补。
- [x] 单次选择可撤销，保留最近 20 个本地快照。
- [x] 支持“清除个人偏好”，不清除照片索引和光阴志。
- [x] 偏好记录固定 schema/version；非法或不兼容记录安全回到空模型。

## 11. 工作包 G：三个产品入口

### G1. 待你决定

- [x] 连拍组、疑似重复、技术问题、票据、可落地球五类真实计数。
- [x] 空库显示 0，不显示示例数字。
- [x] 技术代表和个人偏好标签分离。
- [x] 所有删除类结果标明“仅建议”。
- [ ] 每类支持全部查看、跳过、稍后处理和已处理状态。
- [ ] 相似组支持左右滑动、原图对比和撤销代表选择。
- [x] 疑似重复没有删除动作，只进入比较/待确认。
- [x] 根收件箱只展示首个连拍组、3 张票据、3 个地球候选和 10 个技术问题；总数保留在计数器，不把全库重新堆给用户。

### G2. 找照片

- [x] 自然语言框和组合过滤首版。
- [x] 搜索结果可继续 Qwen 理解或收入光阴志。
- [x] embedding top-k 与标签/时间/GPS/OCR 过滤合并，向量候选不能绕过时间/GPS 硬约束。
- [x] 搜索历史只写本地 `localStorage`、上限 8 条，页面提供独立清除。
- [x] OCR/Qwen 隐私风险提示首版；人物与地点分享范围仍需统一设置页。
- [x] 搜索结果采用 60 张一窗的增量窗口，未展开结果不创建图片 DOM；可逐窗继续显示。

### G3. 光阴志

- [x] 只有用户明确 `chronicleIncluded` 的照片进入真实光阴志。
- [x] 原静态杂志保留为明确标注的“设计样刊”。
- [x] 真实数据首版提供时间/杂志/日历三个视图。
- [ ] 把原有 MagazineBook 的排版能力适配到真实资产模型。
- [ ] 年/月/日分组处理无日期、时区和修改时间回退。
- [x] 从光阴志移除只更新本地确认，不删除系统原片。
- [ ] 光阴志封面与代表图由用户可调整。

## 12. 工作包 H：Pocket Earth 闭环与可观测

### H1. 地球动作

- [x] 复用 `userMarks(kind:'photo')` 总线。
- [x] pin 只保存小缩略图，不保存原片。
- [x] 同内容 hash 重复 pin 幂等。
- [x] 使用稳定 asset key + 内容 hash 双重身份；重复确认幂等，并在 pin 元数据保留本地 asset 引用。
- [ ] 真机 GPS 照片从 Photos 确认后出现在地图。
- [ ] 地图详情可返回对应照片资产；资产失效时保留文字与小缩略。
- [ ] 分享地图时精确坐标继续抽稀。

### H2. RunTrace

每次照片任务必须记录：

- 授权范围，不记录私人文件名。
- 枚举资产数、读取缩略图数、按需原片数。
- 便宜分析、embedding、聚类、Qwen、Base OCR、LoRA、Quality Gate、人工确认各阶段耗时。
- 模型 ID、MNN 版本、Adapter ID、后端和降级原因。
- 内存峰值、取消、超时和失败数量。
- 实际加速能力；`sme2-active` 只能来自运行时实测标志。

当前状态：

- [x] 相册手动选择和 Qwen 代表图有 RunTrace。
- [x] Qwen3-VL/MNN 真实运行 14.13 秒的开发机记录。
- [x] 语义索引资产数、模型/后端、OCR Base/Adapter/门禁进入结构化 trace；运行标题不再记录私人文件名或 OCR 正文。
- [ ] RunEvidence/RunTrace 已支持 runtime、真实 acceleration、visualInput、maxTokens、modelLoadMs 和 peakMemoryMb；Photos 已写入前四项，内存与模型加载仍待目标真机采样。
- [ ] Android 真机可导出的 trace 证据。

## 13. 工作包 I：性能、隐私和离线门槛

以下是目标，不是当前证据：

| 项目 | 目标 |
|---|---|
| 首批资产可见 | 授权后 1.5 秒内先显示首批元数据/缩略图，后续渐进 |
| 全库枚举 | 可取消、可断点，主线程无长时间冻结 |
| 便宜分析 | 320px 缩略图，批次受控，峰值内存可记录 |
| Qwen fast | 只处理代表/难例；目标机单张时间和内存必须实测 |
| OCR high/ocr | 超时可降级，密集页不进入全库后台扫描 |
| 首屏 | 不加载 Qwen/MNN、MobileCLIP、全量缩略图或原片 |
| 飞行模式 | 已安装模型后可完成索引、查询、识别、确认和地图写回 |

隐私检查：

- [x] 公共 OSS 不存私人照片索引。
- [x] Web File/blob URL 不持久化。
- [x] Android 原片点击后由系统相册通过 content URI 打开；App 分析只读 ≤320px 派生缩略图。
- [x] 已安装模型后的 cache-only 文本查询只观察到本地 ORT 模块请求；首次安装仍明确需要网络。Android 飞行模式尚待真机。
- [x] IndexedDB 使用资产字段白名单，RunTrace 不写私人文件名；原生缩略图缓存可随“清除本机照片索引”删除。目标机缓存目录复核仍待完成。
- [x] 权限说明、照片派生索引二次清除和个人偏好独立清除已进入 UI；数据导出说明尚待补。
- [x] 人脸、证件号、地址和二维码风险提示已进入结构协议与票据 UI。

## 14. 自动化测试矩阵

### 14.1 已有定向测试

- [x] 原生资产映射不持久化原片 URL。
- [x] Web File 与 blob URL 会话隔离。
- [x] 资产来源命名空间。
- [x] 偏好样本不足不伪造分数。
- [x] pairwise 选择能学习方向且不修改技术质量。
- [x] 时间/地点/对象组合搜索。
- [x] 票据与无 GPS 组合搜索。
- [x] Qwen 结构解析和置信度归一化。
- [x] 干净 OCR 停在 Base。
- [x] LoRA 仅在明显提升时被采纳。

### 14.2 必须补齐

- [x] IndexedDB missing/权限收回、full↔limited 中途切换和批量事务已有测试；跨 schema 数据迁移仍未实现并保持未完成。
- [x] 跨批重复/连拍/事件聚类。
- [x] 资产消失、limited 不误判删除、权限收回与重新出现恢复。
- [x] 10 组偏好冷启动阈值、跨类型候选、撤销与清空。
- [x] embedding 量化、版本隔离、cosine top-k 与中文意图本地扩写。
- [x] Qwen schema 全字段、非法输出、stub 和 AbortSignal 集成路径已测；内部 75/125 秒超时由同一 AbortController 收口。
- [x] OCR Adapter 未安装、退化、关键字段并列冲突和人工复核。
- [x] pin 稳定双键、重复确认幂等；坐标抽稀已有纯函数，地图回流真机仍待补。
- [ ] React 三入口空/加载/失败/大结果状态。
- [ ] Android 权限仪表测试或可重复真机脚本。

每次合入最低门槛：

```text
npm run typecheck
npm test
npm run build:mobile
npx cap sync android
Android Gradle debug/release build
```

## 15. 决赛真机证据包

目标目录：`docs/evidence/photos/`

必须产出：

1. `photos-android-permissions.md`：机型、Android 版本、full/limited/denied。
2. `photos-asset-index.md`：资产数、分页、原片读取数、缓存检查。
3. `photos-search-eval.json`：固定图库、查询、Recall@5/20。
4. `photos-qwen-blind-eval.json`：硬负样本、基座输出、错误分类。
5. `photos-ocr-quality-gate.json`：Base/LoRA/采纳结果与耗时。
6. `photos-performance.json`：模型、MNN、加速、耗时、内存和温度。
7. `photos-offline-runtrace.json`：飞行模式完整链路。
8. `photos-sme2-ab.md`：同机同输入、开关 SME2、热身、重复次数、统计结果。
9. `photos-demo-checklist.md`：最终演示逐步核验与失败备选。

SME2 判定规则：

- Manifest 写有 SME2：不算。
- 编译目标含 arm82：不算。
- MNN 声称支持 SME2：不算。
- 只有目标真机运行日志明确显示 SME2 kernel/active，并有关闭对照，才算完成。

## 16. 决赛主演示固定脚本

1. 打开 Photos，展示首屏没有加载重模型。
2. 点击“授权并索引相册”，系统显示 full/limited 选择。
3. 首批缩略图立即出现，页面明确“原片未复制、未上传”。
4. 展示“待你决定”的真实五类计数。
5. 搜索“猫和票据”，展示本地命中和命中理由。
6. 让 Qwen3-VL 理解一张代表图；打开 RunTrace 验证 MNN 后端。
7. 对普通停车票做 Base OCR，证明没有调用 LoRA。
8. 对难例票据触发 general-ocr LoRA，展示双结果 Quality Gate。
9. 打开连拍组，技术代表与个人偏好代表分开；用户换选一张。
10. 把用户确认照片收入光阴志，并切换时间/杂志/日历。
11. 确认带 GPS 的照片钉到 Pocket Earth，切换地球查看落点。
12. 展开最终 RunTrace，展示模型、Adapter、耗时、内存、降级和 SME2 实测状态。

备选纪律：真机某模型失败时明确显示 fallback，不能切到预录假结果或把规则结果改名为 Qwen。

## 17. 执行顺序与阶段门

### Gate 1：产品与数据地基

完成工作包 A、资产索引和三入口真实空状态。未通过前不训练模型。

### Gate 2：便宜漏斗和搜索

完成跨批聚类、embedding 和组合搜索评测。未通过前不让 Qwen 扫全库。

### Gate 3：Qwen 与 OCR

完成结构协议、硬负样本和 Base/LoRA 门禁。基座盲测不足才讨论 `photos-router-v1`。

### Gate 4：偏好与用户动作

完成 10 组冷启动、撤销、光阴志确认和地球 pin。

### Gate 5：Android 与证据

完成真机权限、飞行模式、性能、内存和 SME2 A/B，才可在最终材料中写“手机端完整运行”。

## 18. 实施记录

### 2026-08-11 · Web/数据层纵向闭环

主要文件：

- `src/app/components/PhotosTab.tsx`
- `src/app/components/PhotosChronicle.tsx`
- `src/app/lib/photo/libraryBridge.ts`
- `src/app/lib/photo/libraryStore.ts`
- `src/app/lib/photo/radarPipeline.ts`
- `src/app/lib/photo/search.ts`
- `src/app/lib/photo/preference.ts`
- `src/app/lib/photo/understanding.ts`
- `src/app/lib/photo/semantic.ts`
- `src/app/lib/photo/globalGroups.ts`
- `src/app/lib/photo/photoLocationBridge.ts`
- `frost-agent/edge/httpPhotoEdge.ts`
- `android/app/src/main/java/art/throughtheglass/pocketearth/PhotoLocationPlugin.java`
- `scripts/evaluate-photo-ocr-fixture.mjs`

验证：

- 第一组前三轮定向回归、Android transport 与第二组第 4—6 轮均通过；最终全项目回归为 84 files / 1,481 tests。
- TypeScript 通过。
- Web/mobile 生产构建通过：2,309 modules；Photos 82.66 kB（gzip 27.29 kB），语义 runtime 902.13 kB（gzip 234.75 kB）。
- 最终首屏验证 836,390 bytes，语义运行时与 21.6MB ORT WASM 均未首屏加载。
- 393×852/390×844 手机视口完成三入口、索引二次清除、本地语义查询和 RunTrace 真实性检查；便宜分析显示“本地”，不冒充 MNN。
- Web 手动选择 3 个公开项目图片，资产索引 3，成功分析 2；坏图隔离未中断批次。
- Qwen3-VL/MNN 对代表图真实运行并返回青铜器描述，RunTrace 14.13 秒。
- 两张公开图建立 CLIP int8 索引：首次 36.1 秒；增量重建复用 2/2，约 0.2 秒；刷新后 cache-only 搜索仍命中。
- Android Capacitor 工程与 Capgo 相册插件 `cap sync` 成功；自定义 EXIF 位置插件已显式注册；Photos Qwen/OCR 已改为 Capacitor `PocketMnn`→Java→JNI，不再依赖 Android 包中不存在的 `/api/edge`。
- 5000 条合成资产回归：批量 upsert 8ms、全局分组 61ms、literal/semantic 合并 11ms；只证明纯逻辑/模拟存储复杂度，不证明手机真实照片性能。
- 100 条合成 metadata/tag/OCR + 20 条中文查询回归为 Recall@5 20/20、Recall@20 20/20、无结果 0；不作为真实 CLIP 视觉召回率。
- 隔离 JDK 21 + Android SDK 36 已完成 clean `assembleDebug`；APK 36,603,933 bytes，SHA256 `66d89e9813c0c4f0dbeec4c0f4cf6398044529dd69ab2018b0f1119de7e3fc61`，v2 签名、16 KiB 对齐、12/12 JNI 与 merged photo permissions 复核通过。
- 通用 OCR v6 的基座图、共享权重、Adapter 与运行时补丁哈希/硬链接验证通过；MNN health 显示 Adapter installed。
- synthetic clean Base：CER 1.41%；synthetic stress Base/LoRA：CER 18.78%→10.80%，但 LoRA 金额字段退化，因此进入人工冲突门禁。
- `tar` 已 override 到 7.5.22；Transformers.js 的 Node-only `sharp` 上游告警仍保留并已隔离记录。
- `research/upstream/` 已被 Git ignore；生产 `dist` 和 Android Web 资源未发现 Queryable/MobileCLIP/Ente/Immich 命名资产或受限权重。

证据：

- `docs/evidence/photos/photos-web-semantic-evidence-2026-08-11.md`
- `docs/evidence/photos-ocr-runtime-evidence-2026-08-11.json`
- `docs/evidence/photos/photos-android-build-status-2026-08-11.md`
- `docs/evidence/photos/photos-dependency-audit-2026-08-11.md`
- `docs/evidence/photos/photos-round4-6-evidence-2026-08-11.md`

未完成：目标机权限和真实系统相册、签名 JNI/模型包安装与真 decode、5000 张真实大库、100 张真实图片/CLIP 语义召回评测、Qwen 硬负样本盲测、真实票据授权集、Android 飞行模式、内存/温度、JNI 推理真取消和 SME2 A/B。
