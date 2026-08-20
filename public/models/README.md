# Model manifests

该目录只保存轻量、可公开分发的模型/Skill Manifest，不保存数 GB 权重。

- Qwen3 / Qwen3-VL MNN Base、LoRA 与专用模型托管在版本化阿里云 OSS Release 下。
- Android 安装器验证 Manifest SHA-256、每个文件的固定大小与 Release ID 后才激活。
- 下载支持 HTTP Range 和断点续传，资产进入 App 私有目录，不进入首屏包。
- `travel-planner/manifest.json` 是 Travel LoRA 的公开描述；其他内建 Skill 的不可变地址与哈希位于 `src/app/lib/skill/builtins.ts`。

模型安装、MNN/SME2 状态与真机 Trace 可在 Skills 页顶部的 Device Lab 查看。
