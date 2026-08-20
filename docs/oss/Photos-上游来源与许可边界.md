# Photos 上游来源与许可边界

更新时间：2026-08-11

本文件记录 Photos“个人照片雷达”研发中实际阅读过的上游。除 npm 依赖 `@capgo/capacitor-photo-library` 外，下面仓库都没有以源码目录或模型权重形式进入 Pocket Earth 发布物。

| 上游 | 固定 commit | 许可结论 | Pocket Earth 的使用方式 |
|---|---|---|---|
| Capgo capacitor-photo-library | `82981121b77642fb57a94712d2854aeddfde751f` | MPL-2.0 | 通过 npm 包调用公开 API；不复制或修改插件源文件 |
| Queryable | `b95a05a8ac1bee2d703af869b9e9e996dd9672bd` | MIT | 阅读架构，独立实现查询向量 LRU、分批让出主线程、权限变化安全闸 |
| Apple MobileCLIP | `aecfb5453d022e9deff12f81a150ea8f35194baa` | 代码 MIT；官方模型权重另受 Research-only 条款约束 | 只参考文本塔/视觉塔拆分与 iOS 推理结构；未打包权重 |
| Ente | `d2586486a34dd355c7ff7706b5bad8b30bc0751f` | AGPL-3.0 | 仅参考架构和产品行为；无源码复制 |
| Immich | `0ff47f417855eb6710e18951c8e705b99698828b` | AGPL-3.0 | 仅参考重复组、OCR/向量检索的数据职责；无源码复制 |
| OpenCV contrib img_hash | `a8e9acd62cabd30419dba83007f2ac0d07de5e2c` | Apache-2.0 | 参考 pHash 的公开算法步骤与阈值语义，独立编写 TypeScript 可分离 DCT 与测试 |
| Alibaba MNN | `1d535d728362d0ee8a4cc6d854b970c8d7f94e02` | Apache-2.0 | 阅读 Qwen-VL、多模态、Android 性能和 SME2 runtime dispatch；沿用项目已有 MNN sidecar，不复制 App 示例源码 |

## 必须保留的边界

### Capgo

插件会为缩略图和显式打开的原图创建应用缓存文件。Pocket Earth 在相册枚举时固定使用 `includeFullResolutionData=false`，只在用户点击查看、Qwen/OCR 或确认钉地球时按需解析资源。MPL-2.0 并不等于 MIT；如果未来修改插件源文件，必须单独重新审查该文件级 copyleft 义务。

### Apple MobileCLIP

仓库代码许可与模型权重许可不是一回事。当前官方 `LICENSE_MODELS` 明确把用途限制为非商业科研/学术开发，并排除商业产品开发。比赛包因此继续使用当前 Transformers.js CLIP 基线；MobileCLIP 只保留为可插拔引擎接口和真机候选，不下载、不分发官方权重。

### Ente / Immich

两者均为 AGPL-3.0。Pocket Earth 只提炼与具体表达无关的产品原则，例如“有限权限不是删除证据”“重复组保留张与个人偏好分开解释”“索引损坏可重建”。实现、函数命名、代码结构均由 Pocket Earth 独立完成。

### OpenCV pHash

Pocket Earth 的 `perceptualHashFromLuma` 使用标准的 32×32 灰度、低频 8×8 DCT、去除 DC、均值二值化流程。实现是独立 TypeScript 可分离 DCT，并针对手机相册场景采用更保守的汉明距离阈值 6；pHash 只与 dHash、时间、GPS 一起生成“疑似重复”建议，永远不执行删除。

### MNN / SME2

上游代码显示，SME2 至少同时要求：构建时包含相应宏、Linux/Android `AT_HWCAP2` 检出 SME2、具体算子和形状选择 SME2 路径。Pocket Earth 的 RunTrace 只有在 sidecar 返回真机证据时才能显示已启用；否则必须写“未验证/未报告”。
