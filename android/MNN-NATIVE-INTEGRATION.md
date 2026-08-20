# Pocket Earth Android MNN 原生集成

## 已编入 APK 的内容

Capacitor 插件 `PocketMnn` 已接通 Java → JNI → Alibaba MNN 3.6.1。仓库中的
`android/native/CMakeLists.txt` 会为 `arm64-v8a` 编译并打包：

```text
libMNN.so
libc++_shared.so
libpocket_mnn_jni.so
```

MNN 构建启用 LLM、Omni/Qwen-VL、ARM82、SME2、KleidiAI、低内存权重解量化与
16 KiB page-size 对齐。运行时根据手机 CPU capability 自动选择内核；“编译包含
SME2”不等于“这台手机实际启用了 SME2”。`runtime.acceleration` 只报告设备实际
feature，`runtime.compiledAcceleration` 才报告编译能力。

构建与静态验收：

```bash
ANDROID_SDK_ROOT=/tmp/pocket-android-sdk \
POCKET_MNN_SOURCE=/Users/zhangcheng/mnn-src/MNN-3.6.1-pocketearth \
scripts/android/build-mnn-runtime.sh

npm run build:mobile
npx cap sync android
JAVA_HOME=/tmp/pocket-jdk21/Contents/Home \
ANDROID_SDK_ROOT=/tmp/pocket-android-sdk \
./android/gradlew -p android assembleDebug

scripts/android/verify-mnn-apk.sh
```

验收脚本检查 AArch64、12 个 JNI 导出、MNN LLM API、SME2/KleidiAI 内核、动态库
依赖、APK 内外哈希一致、16 KiB ELF/APK 对齐、包名与签名；同时只允许 arm64-v8a
三项原生库，禁止模型权重、旧 MediaPipe 和预设 Splat 回流，并以 40 MiB 为体积门禁。

## 为什么 APK 里不直接塞 3.75 GB 权重

“MNN 编译进应用”指推理引擎随 APK 安装；Qwen 权重是可替换的版本化资产，不应该
把数 GB 模型焊死进 APK。否则升级一个 LoRA 也要重新发布整个应用，安装包、首装和
更新都会不可接受。正式版现已从阿里云 OSS 下载到应用私有目录：Java 安装器读取固定
release descriptor，逐文件支持 Range 断点续传，并在 14 个文件的大小和 SHA256 全部
匹配后写入双基座激活标记；下载完成后推理仍完全在手机本地执行。

当前 LoRA 训练记录证明需要两套不能混用的 Qwen3-VL-2B 基座：

```text
files/pocket-earth/models/
├── qwen3-vl-2b-language/  # chat/classify/rank + Travel Planner 语言 LoRA
├── qwen3-vl-2b-vision/    # INT8 视觉基座 + 古籍/碑拓/OCR 视觉 LoRA
├── adapters/
│   ├── travel-planner/
│   ├── guji-vision/
│   ├── rubbing-vision/
│   └── general-ocr/
└── specialists/
```

单一混合目录会让其中一类 LoRA 对上错误 graph/weight。Android 运行时现已按请求类型
路由双基座、核对适配器 allowlist，并保持最多一个 Base/LoRA 模型驻留，避免 2B 模型
重复占内存。完整 14 文件、3,748,601,738 bytes 和 SHA256 固定在
`android/native/model-bundle.manifest.json`。descriptor 与模型共 15 个 OSS 对象，
3,748,604,229 bytes，公开 HTTPS/Range/元数据校验已通过。

## 调试手机的一键安装

连接一台已授权的 Android 手机后：

```bash
# 只校验本机两套模型和全部专业资产，不改手机
scripts/android/install-mnn-debug-bundle.sh --verify-only

# 安装 debug APK，将双基座、LoRA 和专用模型流入 app-private storage，
# 每个文件在 Mac 和手机两端校验 SHA256，最后才写激活标记
scripts/android/install-mnn-debug-bundle.sh
```

该脚本使用 `run-as`，只适用于 debug 包。交付 APK 内的正式 OSS Release Bundle 安装器
不依赖 `run-as`：用户在端侧引擎面板主动安装约 3.75 GB 双基座，应用持续显示逐文件
进度，断网后可续传。普通 Skill 的任意 URL 不能替换共享 Qwen Base。

## JNI 行为与失败闭合

- `nativeTextReady` / `nativeVisionReady`：分别检查语言、视觉文件布局；Java 还要求
  固定 release marker 和精确大小，不能由一个目录冒充两条链路。
- `nativeInvalidate`：Adapter 安装、替换或卸载后立即释放 Base/LoRA 驻留实例，防止
  已卸载的旧 Adapter 继续从内存响应。
- `nativeProbe`：执行真实 decode；只有输出包含 `POCKET_MNN_READY` 才通过。
- `nativeChat`：空 Adapter 走语言 Base；`travel-planner` 只允许走语言基座。
- `nativeVision`：空 Adapter 或古籍/碑拓/OCR allowlist 只允许走视觉 INT8 基座；图片
  限制在应用私有目录或不超过 24 MiB 的 data URL，异常也会清理临时文件。
- `nativeMetrics`：返回实际 token 数、prefill/decode 耗时和 tokens/s；无法测量的内存、
  温度与功耗不编造。
- `nativeRestore`：目前明确返回 `native_restoration_model_not_connected`，不能用假图
  冒充端侧 MNN 修复结果。

可选资产安装器只接受 HTTPS、精确字节数和 SHA256，支持 `.part`/Range 续传、进度、
取消、原子激活、Base 哈希兼容与共享 weight 硬链接。六个内置原生资产还必须匹配
应用固定白名单、Skill Manifest 与 OSS Release 三方同一哈希；调用方不能自带另一组
SHA 冒充可信模型。单个 Skill 不能卸载共享 Base。

## 仍需真机完成的证据

当前电脑没有连接 Android 设备，因此静态构建不等于真机推理已通过。决赛前还必须在
目标 Armv9 手机上完成：

1. 运行调试安装脚本并确认两套 Base 与 Adapter 状态均为 installed。
2. 执行 `runtime_probe`、Travel LoRA chat、三种视觉 LoRA 各一次真实 decode。
3. 飞行模式复跑核心路径。
4. 记录加载时间、首 Token、tokens/s、峰值内存、温度与功耗。
5. 按 `docs/evidence/sme2-ab-protocol.md` 做同机 SME2 OFF/ON A/B。

完成第 5 项前，只能写“APK 包含 SME2 内核”，不能写“SME2 已验证/已加速”。
