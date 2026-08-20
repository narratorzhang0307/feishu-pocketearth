# Photos GitHub 上游研究与六轮迭代记录

日期：2026-08-11  
目标：把 Photos 做成“完全在手机上的个人照片雷达”，同时满足本地核心交互、Qwen/MNN 证据、真实相册轻路由、自然语言找照片和用户最终确认。

## 1. 研究方法与验收规则

七个仓库均以 `--depth=1`、blob filter 和 sparse checkout 固定到本地 `research/upstream/`；目录被 `.gitignore` 排除，不进入产品。每个结论必须回答五个问题：

1. 当前 commit 和许可证是什么；
2. 真正解决了 Photos 的哪个已知问题；
3. 是“依赖调用、独立实现、只参考架构”还是“不采用”；
4. 是否增加隐私、误删、模型权重或移动性能风险；
5. 是否有测试、构建或真机证据支持。

每组三轮检查互相独立：第一组验证合法适配、失败/迁移和 Android 真链；第二组继续从 5000 条级别算法成本、中文查询/权限变化和评委 Demo/发布产物反向挑错。单轮通过不能替代下一轮。

## 2. 七个上游的源码结论

### 2.1 Capgo capacitor-photo-library

阅读位置：Android `PhotoLibraryPlugin.java`、`PhotoLibraryService.java`，iOS `PhotoLibrary.swift`，TypeScript definitions。

- Android 13+ 使用 `READ_MEDIA_IMAGES`，Android 14 能区分 `READ_MEDIA_VISUAL_USER_SELECTED` 的 limited 状态；iOS 映射 PhotoKit limited。
- `getLibrary` 支持 offset/limit/totalCount/hasMore，默认按时间倒序；返回 assetId、尺寸、时间、文件大小和可选缩略图。
- 枚举时若 `includeFullResolutionData=true` 会复制原资源到应用缓存；当前实现明确为 false。
- 缩略图也会写应用缓存，插件没有公开的精细清理 API，因此 UI 和文档不能声称“没有任何本地副本”，只能准确说“原片未复制；存在派生缩略图缓存”。
- 决策：继续使用 npm 依赖 8.0.21，不 vendoring、不修改 MPL 文件。

### 2.2 Queryable

阅读位置：`EmbeddingStore.swift`、`GPUSimilaritySearch.swift`、`PhotoSearcher.swift`、模型与 PhotoKit helper。

- 图像塔只在索引时运行，查询只运行文本塔；与当前 Photos 的职责拆分一致。
- 二进制主索引 + journal + tombstone + 原子 compact 说明移动端索引必须有版本和恢复语义。
- 搜索把归一化 Float16 矩阵常驻 GPU，只上传很小的查询向量；当前 Web 实现仍是 JS 精确扫描，决赛规模可用，但必须记录未来 native 优化边界。
- 建索引使用 batch、autoreleasepool、主动释放图片并周期性 yield，避免相册越大越卡。
- orphan 超过约 20% 时不做批量清除，防止 limited permission 或 PhotoKit 瞬时状态被误判成删除。
- 已独立适配：20 条会话内文本向量 LRU、每张索引后 yield、孤立向量 20% 安全闸、版本化向量记录。

### 2.3 Apple MobileCLIP

阅读位置：iOS `Models.swift`、`ZSImageClassification.swift`，模型定义与许可证。

- 文本 encoder 和图像 encoder 分开创建；目标输入依模型为 224 或 256；iOS 示例展示端侧 latency/FPS。
- 代码 MIT，但官方权重不是 MIT，`LICENSE_MODELS` 限定 Research Purposes 并排除商业产品开发。
- 决策：本轮不更换当前 CLIP，也不下载/打包权重。保留 `PhotoEmbeddingEngine` 的未来抽象事项，只有在权重许可、中文冻结集和 Android 真机性能都过门后才替换。

### 2.4 Ente

阅读位置：本地 vector DB、semantic search、query cache、device health、similar images service。

- 512 维索引会检测文件缺失、修复损坏、批量写入并报告磁盘/内存统计。
- 搜索有 consent gate、20 条 query cache、latest-query-wins、阈值和 warmup。
- 电量低于 20%、Android 电池温度高于约 42°C 或严重 thermal state 时暂停 ML。
- 新增/删除比例超过约 20% 时倾向完整重建，而不是盲目增量。
- 决策：AGPL，仅参考；本轮先落 query cache 和 20% 安全闸。电池/温度调度列入第二轮真机边界，不伪造 Web thermal 能力。

### 2.5 Immich

阅读位置：duplicate utility/service、smart search vector schema、OCR schema、CLIP text/vision encoders、搜索模型文档。

- 重复组的保留张会参考文件大小和 EXIF 完整度，但 Pocket Earth 把它降为“技术质量相同时的客观 tie-break”，不与个人偏好混为一谈。
- GPS 等元数据只有在组内一致时才适合合并；Pocket Earth 不执行元数据合并或删除。
- 向量检索和 OCR 检索是两种索引职责；当前 Photos 同样把 embedding 与 OCR 结构证据分开。
- 上游多语言评测说明英文 CLIP 对中文查询不能想当然，当前本地中英扩展只是比赛基线，模型替换前必须跑中文冻结集。
- 决策：AGPL，仅参考数据职责；已加入分辨率/字节数/元数据完整度的客观 tie-break。

### 2.6 OpenCV img_hash

阅读位置：`phash.cpp`、`block_mean_hash.cpp`、headers 和 tests。

- pHash 使用 32×32 灰度、DCT 左上 8×8、DC 清零、均值二值化和 Hamming 距离。
- 已独立实现可分离 DCT，避免每张图直接计算 65,536 次二维乘加；保存 64-bit 十六进制 hash。
- 第一轮测试发现横向/纵向渐变距离仅为 8，因此重复阈值从宽松值收紧到 6，pHash 只做补充证据。

### 2.7 MNN

阅读位置：多模态接入指南、Android image processor、MemoryMonitor/LlmSession、`CPURuntime.cpp`、`CPUAttention.cpp`。

- Qwen3-VL 属于已有 Qwen2.5 vision 路线；视觉预处理、token 和 projector 必须与导出配置一致。
- Android 示例按 PSS 采样内存，并区分 prefill/decode 指标；这些可作为真机证据 UI 的字段参考。
- Linux/Android 通过 `getauxval(AT_HWCAP2)` 检测 SME2；特定 attention 路径还要求构建宏、Flash Attention、数据类型、线程和 core 条件。
- 决策：沿用现有 Qwen3-VL-2B/MNN sidecar 与 RunTrace，不把“ARM64 可运行”误写成“SME2 已命中”。

## 3. 第一轮：合法适配、测试与首次构建

### 3.1 实施内容

- 加入独立 TypeScript pHash，并在 RadarAnalysis 保存 `perceptualHash`；旧 `photo-radar-dhash-v2` 记录继续可读。
- 重复候选必须满足原有时间/GPS 护栏，并由 dHash 或严格 pHash 距离支持；所有动作仍是建议。
- 技术分相同时，代表张依次参考像素数、文件字节数、元数据完整度，绝不使用个人偏好替代技术判断。
- 语义查询增加 20 条 session-only LRU；重复查询不再反复装载文本塔。
- 搜索结果排除 `missing` 和 `permission-revoked` 资产。
- 完整 full-library scan 后可回收少量孤立派生向量；比例超过 20% 自动保留。limited snapshot 永远不是删除证据。
- RunTrace 文案更新为 dHash + pHash v3，并继续声明“不读原片”。

### 3.2 第一轮验证

- 定向测试：4 files / 15 tests 通过；覆盖 pHash 亮度稳定性、结构差异、LRU、孤立向量安全闸、权限撤回过滤、pHash 补充候选和客观代表张。
- TypeScript：`tsc --noEmit` 通过。
- 生产构建：Vite 2308 modules 通过。
- Photos 懒加载 chunk：79.72 kB（gzip 26.14 kB）；语义 runtime 独立 chunk 902.13 kB（gzip 234.75 kB）。
- 首屏门禁：836,390 bytes，小于 3 MiB，且无禁止的首次请求。

### 3.3 第一轮遗留项

- pHash 需要在第二轮做批量耗时预算和更多近似/非近似夹具；当前只有数值单测。
- query cache 只在会话内，避免持久化用户查询；这是隐私取舍，不是遗漏。
- Capgo 缩略图缓存生命周期需在第二轮检查 Android/iOS 可观测空间与清理策略。
- 当前 Web CLIP 是英文优先模型；必须建立中文冻结集，不能把少量翻译词表当作模型质量证明。

## 4. 第二轮：失败、性能、隐私与迁移

### 4.1 反向检查发现的问题

- 非可重入文本 encoder 遇到连续输入时可能并发执行，旧查询还可能晚于新查询回写 UI。
- full library 重扫若把 limited/权限瞬时缺失误判为删除，会错误清掉派生向量；超过 20% 的大批孤立项也不应自动清理。
- 已有 `photo-radar-dhash-v2` 记录虽能读取，却不会自然获得新增 pHash，导致同一照片长期停留在旧算法。
- 用户停止扫描后，当前批次仍可能继续分析；大库后台建索引缺少低电量、页面后台和 thermal 状态门禁。
- 权限收回后，搜索、待决定和光阴志仍可能显示已不可读取的缩略图。
- Photos 初始化等待可选的 MNN health probe，会让相册状态无谓延迟最多 6.5 秒。

### 4.2 第二轮修正

- 新增串行 `LatestPhotoSemanticQueue`：文本 runtime 同一时刻只执行一次；排队中的过期查询直接跳过，最终只允许最新查询更新结果。
- query cache 保持 20 条、仅内存会话；清空语义索引时同时失效队列世代和 query cache。
- 只有 `full + authorized` 的完整快照才允许清理派生向量；limited 快照永不作为删除证据，孤立比例超过 20% 时保留并请求以后全量重建。
- 雷达算法升级为 `photo-radar-phash-v3`；旧 v2 记录在下次扫描时重算一次，同时保留用户确认、偏好与光阴志数据。
- 每 48 张设置批次取消边界；每 12 张重新检查页面可见性、电量与可获得的 thermal 信息。低于 20% 且未充电、页面进入后台或严重 thermal 时暂停重任务；平台不提供信息时明确 fail-open，不伪造温度读数。
- `missing`/`permission-revoked` 资产从建议、搜索和偏好训练中排除；已确认光阴志记录不删除，但隐藏原图并提示恢复授权。
- 相册/IndexedDB 状态先初始化，MNN health probe 异步进行；Web 回归中本地来源状态约 300ms 可见，不再等待 6.5 秒探测。
- Capgo 缓存边界被写进 UI：批量枚举不复制原片，但存在插件派生缩略图缓存；Android 新增自有路由桥，用系统相册打开 MediaStore 原片，并让“清除本机照片索引”同步清理 App 私有照片缓存，绝不调用 MediaStore 删除。

### 4.3 第二轮验证

- 定向回归：8 files / 26 tests 通过，覆盖 latest-query-wins、串行 runtime、孤立向量安全闸、v2→v3 迁移、设备预算、权限撤回和取消边界。
- 全项目回归：81 files / 1,467 tests 通过；TypeScript、Vite 生产构建与 Android `cap sync` 通过。
- Photos chunk 82.15 kB（gzip 27.15 kB）；语义 runtime 902.13 kB（gzip 234.75 kB）。
- 首屏 836,390 bytes，小于 3 MiB；没有首屏模型、ORT WASM 或受限权重请求。

### 4.4 第二轮明确未完成

- 尚无 100/500/1000/5000 张真实授权图库的 CPU、PSS、磁盘缓存与温升数据。
- 尚无 100 图/20 查询中文冻结集；当前查询扩写不能代替 Recall@5/20 证据。
- Web API 不能提供可靠 Android 电池温度；只有原生层未来报告时才使用 thermal 字段。
- 原生推理取消只能让 UI/JS 及时返回，JNI 尚无中断当前 token generation 的取消原语。

## 5. 第三轮：决赛演示、真机与合规反向复核

### 5.1 评委路径复核

- 390×844 手机视口逐个检查“待你决定 / 找照片 / 光阴志”、空库、设计样刊说明、清除确认和 RunTrace。
- 使用仓库内两张公开碑拓夹具走 Web 手动选图真链：2 个资产均完成便宜分析，形成连拍候选和票据候选，RunTrace 记录 3 个真实步骤；没有使用私人照片或静态伪数量。
- 页面只承诺浏览器手动选择；系统全相册枚举明确限定为 Capacitor Android 包。
- 技术代表只由技术质量、像素、字节数和元数据完整度决定；个人偏好始终是另一条证据。

### 5.2 Android 真链反向检查

第三轮发现一个关键问题：Photos 专用 `httpPhotoEdge.ts` 原先直接请求 `/api/edge`。这在桌面 Vite sidecar 可工作，但安装后的 Android WebView 没有该 HTTP 服务，Qwen/OCR 会退化为 stub。

已修正为：

```text
Photos Qwen/OCR
  ├─ Capacitor Android → PocketMnn → Java 单线程队列 → JNI MNN
  └─ Web/Vite          → /api/edge → 本机 MNN sidecar
```

- Android 路径不再发起 `/api/edge`；`runtime_status`、vision、Base OCR 与 OCR Adapter 共用原生 `PocketMnn` 契约。
- RunTrace 的 SME2 只接受 JNI runtime 返回的 `sme2-active`；`arm64`、`arm82`、Manifest 或编译标签均不能证明命中。
- JS 超时/取消会及时返回 stub，不把迟到结果写入 UI；由于 JNI 暂无取消原语，底层推理可能继续至当前调用结束，文档明确保留该边界。
- 新增 3 个 transport 测试，证明 Android 调原生桥且不 fetch、SME2 只来自 runtime capability、native promise 挂起时用户取消仍及时返回。

### 5.3 开源与提交包复核

- Capgo 仅作为 MPL-2.0 npm 依赖使用；未复制其源码。
- Queryable 的 MIT 架构思想被独立改写为 TypeScript 数据结构与测试，没有拷贝 Swift 实现。
- Ente、Immich 均只参考公开架构/数据职责，不复制 AGPL 源码。
- OpenCV pHash 为独立 TypeScript DCT 实现；记录 Apache-2.0 来源与算法语义。
- MobileCLIP 代码与权重许可分开处理：官方权重未下载、未打包、未进入关键路径。
- `research/upstream/` 已被 `.gitignore` 排除；生产 `dist` 与 Android Web 资源未发现上述仓库目录名或受限 MobileCLIP 权重。

### 5.4 第三轮最终门禁

第三轮代码修正后的末次门禁结果：

- `npm test`：83 files / 1,473 tests 通过。
- `npm run typecheck`：通过。
- `npm run build:mobile`：2,309 modules 通过并执行移动包重资产裁剪；Photos 82.66 kB（gzip 27.29 kB），语义 runtime 902.13 kB（gzip 234.75 kB）。
- `npm run verify:first-paint`：836,390 bytes，小于 3 MiB，禁止请求为 0。
- `npx cap sync android`：通过，识别 `@capgo/capacitor-photo-library@8.0.21`。
- 隔离 JDK 21 + Android SDK 36 clean `assembleDebug`：通过；最终 APK 36,600,457 bytes，SHA256 `da060b0ce5ac8a5cdb9c9b8fec3129a4a5abfcce4fbb59efccce7a2cc9804b9d`。
- APK 复核：arm64-v8a、v2 签名、16 KiB 对齐、11/11 JNI 导出、MNN LLM/SME2/KleidiAI 静态契约均通过；这只证明编译装包，不证明目标机 decode 或 SME2 实际命中。
- merged manifest 复核：包含 `READ_MEDIA_IMAGES`、`READ_MEDIA_VISUAL_USER_SELECTED`、legacy `READ_EXTERNAL_STORAGE` 和独立 `ACCESS_MEDIA_LOCATION`。
- 手机页面复测：4 个仓库公开夹具资产、4 个派生分析；新一轮便宜分析 RunTrace 为 3 步/约 0.03 秒，并正确标为“本地”而非 MNN。
- 产物扫描：`research/upstream/` 被 Git ignore；`dist` 与 Android Web 资源未发现上游仓库标识或 MobileCLIP/Queryable/Immich/Ente 命名权重。
- 依赖审计：仍有 2 个 high，均来自 Transformers.js 的 Node-only `sharp`/libvips 链，当前无上游修复；已确认 `sharp` 不进入浏览器/Android Web 产物，不把“隔离”误写成“漏洞已修复”。

## 6. 第四轮：5000 条级别复杂度与存储事务

第四轮不把“能跑小夹具”等同于“能承受相册索引”，重点检查派生数据层是否存在明显的逐条 IndexedDB 往返和二次复杂度。

- `KeyedStore` 新增 `getMany/putMany/delMany`，资产 upsert、missing/revoked 标记、雷达批次、语义 orphan 回收与清空改为单事务批量操作。
- 便宜分析完成一批后一次写雷达结果、一次回写资产状态；补 GPS 和重算个人偏好也不再逐条开启事务。
- 重复代表候选改为 10 分钟桶 + content hash 索引；事件聚类改为相邻时间桶上的连通分量，修复刚好跨 10 分钟边界的漏组。
- literal/semantic 合并改为 Map/Set 线性去重与排序准备，避免在 comparator 中反复 `find/some`。
- 定向回归在当前开发机上记录：5000 资产批量 upsert 8ms（1 次批读 + 1 次批写 mock 契约）、5000 资产全局分组 61ms、5000 条 literal/semantic 合并 11ms；5 files / 22 tests 共 234ms。

这些数字只证明纯 TypeScript/模拟存储回归没有明显的 O(n²) 退化，不是 5000 张真实照片的解码、IndexedDB 磁盘、PSS、温升或手机帧率证据。

## 7. 第五轮：中文查询与权限中途变化

- 修复中文解析器全局删除“中/里”的问题；“中山公园”“巴黎旅行”“东京旅行中有朋友”等地点和邻接标签不再被拆坏。
- 建立 100 条合成 metadata/tag/OCR 夹具和 20 条固定中文查询：Recall@5 20/20、Recall@20 20/20、无结果 0，单测 11ms。
- 该评测是确定性过滤器的冻结合成回归，不含真实图片像素或 CLIP embedding，不能替代真实 100 图视觉检索评测。
- 分页枚举每页复查授权：full 与 limited 中途互换时丢弃断点并按新授权范围从 0 重启；权限被收回时停止扫描、保留派生记录但隐藏不可读来源，且不把未见资产误标为删除。
- 新增权限状态矩阵测试，覆盖 stable、restart 和 revoked；真实 Android 13/14 系统弹窗与 content URI 仍待目标机。

## 8. 第六轮：手机 Demo、RunTrace、离线包与最终门禁

- 390×844 审计“待你决定 / 找照片 / 光阴志”；用仓库内公开夹具建立第 5 条资产，搜索“票据”只命中 2 个 document 标签结果。
- 便宜分析 RunTrace 为 3 步、约 0.06 秒，明确标为“本地”，没有把像素/dHash/pHash/EXIF 冒充成 MNN。
- 光阴志空态只接受用户确认；设计样刊继续明确标注“不是你的相册数据”。
- 控制台发现旧版本 localStorage 中 agent-specific `heritage` kind 会请求不存在的 `sq-heritage` 图标；现在未知历史 kind 安全映射到 `custom`，复载后没有新增警告。
- 生产包文件名和 APK 内容扫描未发现 MobileCLIP 官方权重、Queryable、Ente 或 Immich 源码；`research/upstream/` 继续被 Git ignore。
- 最终 `npm test`：84 files / 1,481 tests；TypeScript、2,309 modules mobile build、836,390 bytes 首屏门禁和 Capacitor sync 全部通过。
- 隔离 JDK 21 + Android SDK 36 clean 构建成功；APK 36,603,933 bytes，SHA256 `66d89e9813c0c4f0dbeec4c0f4cf6398044529dd69ab2018b0f1119de7e3fc61`；12/12 JNI、arm64-v8a、v2 签名、16 KiB 对齐、MNN LLM/SME2/KleidiAI 静态契约通过。
- `npm audit --omit=dev` 仍报告 2 个 high，均沿 Transformers.js 可选 Node `sharp`/libvips 链且当前无 fix；浏览器/Android 产物未打包 sharp 原生库。此结论是“隔离并持续跟踪”，不是“漏洞已修复”。

六轮检查至此完成。以下项目仍必须留在“未完成”：目标手机授权与真实系统相册、签名模型包安装和 decode、飞行模式、真实 5000 图大库、真实图片/CLIP 中文冻结集、真实票据授权集、PSS/温度、JNI 真取消和 SME2 同机 A/B。
