# Pocket Earth 决赛版技术架构

## 1. 产品模型

```text
Frost Agent
  └─ Skill Router
      ├─ Knowledge / Workflow Skill
      ├─ Qwen Base + LoRA / MNN Skill
      └─ Quality Gate + Fallback + RunTrace
          ├─ local Data Pack / index
          ├─ versioned OSS assets
          └─ optional cloud Qwen
```

Frost Agent 是唯一长期智能体；具体能力统一称为 Skill。Skill 定义“如何做”，
Data Pack 定义“处理什么”。二者拥有独立安装和卸载生命周期。

## 2. 协议与注册表

- `src/app/lib/skill/`：`pocket-skill/v1` 类型、严格校验、Registry、安装状态与资产生命周期。
- `src/app/lib/dataPack/`：`pocket-data/v1`、领域 Schema、IndexedDB/本地导入、地图图层状态。
- `schemas/`、`docs/protocols/`、`skills/make-pocket-data-pack/`：第三方和 AI 可使用的规范、模板、示例与校验器。

安装顺序固定为 Manifest → 协议/权限/Base 兼容检查 → 资产下载 → 大小/SHA256
校验 → 原子激活 → 装备。卸载时按引用计数回收无主资产，但不删除共享 Qwen Base、
用户私有数据或其他 Skill 正在使用的文件。

## 3. 推理平面

### 3.1 端侧

- 统一契约：`frost-agent/edge/types.ts`。
- Web/桌面开发：`/api/edge` → MNN sidecar；未就绪时显式 `stub`。
- Android：`capacitorMnnEdge.ts` → `PocketMnnPlugin.java` → JNI → MNN。
- Android 资产：HTTPS + Range 续传 + 进度/取消 + 字节数/SHA256 + 原子激活。
- Adapter：共享 Base 固定哈希，单时刻激活一个 LoRA，不兼容时拒绝加载。

健康检查必须实际 decode `POCKET_MNN_READY`，仅存在配置文件不算就绪。当前仓库
缺 `libpocket_mnn_jni.so`，所以 Android 运行时会诚实返回 `stub`。

### 3.2 云端

- `server/qwen-provider.mjs` 是生产与 Vite 开发共用的 Qwen Provider。
- `/api/frost-llm`、流式文本、视觉和图像生成路由到 DashScope/百炼。
- API Key 只读服务端环境变量。
- 云端只处理重型生成、最新资料或用户明确允许的公开内容；失败不伪装成功。
- 旧 Gemini/GMI 接口只保留 410 兼容响应，防止旧客户端静默走错模型。

## 4. 资产与加载

- 首屏仅 App Shell、当前页面代码、地图基础配置和轻量摘要。
- 地图数据按当前视野（含缓冲区）送入 GeoJSON Source，低缩放先聚合，点击聚合再展开。
- 书影音和 Mapping Data Pack 在进入地图后按需加载，并可单独落位/卸载。
- 图片先缩略图，详情才加载大图；2.5D/3D 在用户打开查看器后才加载。
- MNN、LoRA、Splat、全量数据库不进入首屏静态依赖闭包。
- OSS 对象不可变版本路径 + 长缓存；Manifest 短缓存/ETag；私人数据不用公共 OSS。

发布清单与哈希：`docs/deploy/oss-release-20260811.json`。

## 5. 质量与可追溯

每次专业 Skill 运行输出结构化 RunTrace：

- Skill ID/版本、Base revision、Adapter/专用模型版本；
- 本地/云端路径、输入来源摘要、使用工具和 Data Pack；
- Quality Gate、回退原因、用户确认和最终写回对象；
- 实际耗时与运行时能提供的性能字段。

LoRA 与 Base 冲突时不按模型自报置信度强行覆盖；质量门禁可选择 Base、LoRA、
重拍、规则或人工复核。碑拓示例已经验证冲突仲裁与未遮罩像素不变约束。

## 6. 隐私与失败边界

- 私人原图、OCR 正文、精确足迹、向量和偏好模型默认不上传。
- 权限按 Skill Manifest 最小声明；公开发布、覆盖和删除必须用户确认。
- 缺模型、缺资产、哈希不符、Base 不兼容、断网或云 API 失败都显示真实状态。
- 桌面 MNN 证据不能冒充 Android；Android 编译不能冒充 JNI 推理；Arm64 不能冒充 SME2。

## 7. 验收入口

- 执行准则：`docs/strategy/Pocket Earth 决赛改造总计划与执行准则.md`
- 实施状态：`docs/evidence/implementation-status-20260811.md`
- Android JNI 约束：`android/MNN-NATIVE-INTEGRATION.md`
- OSS 策略：`docs/deploy/OSS-ASSET-POLICY.md`

历史 Google/Gemma/GMI 的文档、图和提交材料属于归档，不进入当前运行时或决赛表述。
