# Qwen + MNN 端侧运行时

决赛版核心交互在 Android APK 内通过 Alibaba MNN 运行。浏览器页面只预览界面，不生成或冒充真机成绩。

## 运行路径

```text
业务 Skill
  → EdgeModel / httpEdge
  → capacitorMnnEdge（Android）
  → PocketMnnPlugin.kt
  → libpocket_mnn_jni.so
  → Qwen3 / Qwen3-VL Base + 可选 MNN Adapter
```

- `capacitorMnnEdge.ts`：Android 原生桥、资产进度和请求边界。
- `httpEdge.ts`：业务统一入口；Web 开发环境调用同源 `/api/edge`。
- `viteEdge.ts`：开发期 Qwen/MNN sidecar，不属于手机真机证据。
- `types.ts`：文本、视觉、资产、复原与验收证据契约。
- `contract.ts`：失败时返回明确空值，让上层走确定性规则。

## 模型与隐私

Base、LoRA 和专用模型采用固定 Manifest、SHA-256、精确尺寸与 OSS Range 断点续传，安装后写入 App 私有目录。原始照片、票据和个人记录默认不上传；云端增强必须由具体 Skill 显式声明并遵守最小数据原则。

## 验收

Skills 页顶部的 Device Lab 提供 MNN ON/OFF、SME2 ON/OFF、固定文本/长上下文/视觉/OCR-LoRA ABBA×2、飞行模式、10 分钟稳定性以及证据 ZIP。每个样本独立提交到 IndexedDB；未连接比赛手机前所有项目保持“未验证”。
