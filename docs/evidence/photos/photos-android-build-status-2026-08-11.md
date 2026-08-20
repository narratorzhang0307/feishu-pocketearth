# Photos Android 构建与权限状态（2026-08-11）

## 已完成的静态/同步证据

- Capacitor 8.5 Android 工程位于 `android/`，应用 ID 为 `art.throughtheglass.pocketearth`。
- `@capgo/capacitor-photo-library@8.0.21` 已被 `npx cap sync android` 识别并写入 Android 工程。
- 插件 Manifest 会合并 `READ_MEDIA_IMAGES`、`READ_MEDIA_VISUAL_USER_SELECTED` 与 legacy `READ_EXTERNAL_STORAGE`；当前插件也声明了 `READ_MEDIA_VIDEO`，虽然产品请求参数固定 `includeVideos:false`，真机权限文案仍需复核。
- `ACCESS_MEDIA_LOCATION` 与相册读取分开声明、分开请求。
- 自定义 `PocketPhotoLocation` 已在 `MainActivity` 显式注册；每次最多处理 250 个 image asset ID，单个损坏/云端资产不会中断整批。
- 自定义 `PocketMnn` 已在 `MainActivity` 显式注册。Photos 的 `runtime_status`、Qwen vision、Base OCR 与 OCR Adapter 在 Capacitor Android 走 `PocketMnn`→Java 单线程队列→JNI，不再请求只存在于 Vite/Node 的 `/api/edge`。
- transport 单测证明 Android 分支不调用 `fetch`、SME2 只接受 JNI runtime 的 `sme2-active`、JS 取消可在 native promise 未返回时及时结束 UI 请求。JNI 当前没有中断已开始推理的取消原语，底层调用可能继续至结束。
- 相册枚举固定 `includeFullResolutionData:false`，缩略图 320px；Android 原片点击通过自有 `PocketPhotoAssetRouter` 将 MediaStore content URI 交给系统相册，不在 App 内生成全尺寸副本。
- `npx cap sync android` 于 2026-08-11 成功完成。
- 最后一轮 `npm run build:mobile` 在同步前删除旧 MediaPipe WASM 与预设 Splat，避免无关重资产回流 Android 包。

## 最终 debug 构建证据

系统没有全局 Java/Android 环境；本轮使用只位于 `/tmp` 的隔离 JDK 21、Android SDK 36 与 NDK 27，执行：

```text
npm run build:mobile
npx cap sync android
./android/gradlew -p android clean assembleDebug --no-daemon
scripts/android/verify-mnn-apk.sh
```

结果：

```text
BUILD SUCCESSFUL
APK bytes: 36,813,193
APK SHA256: 6132ee8a77e5dd0688b63b6e0c00a1dc4dceb49c7096163a2d5b528cd749cf15
JNI: 12/12 exports
ABI: arm64-v8a
Signature: v2 verified
ELF/APK alignment: 16 KiB verified
```

merged manifest 已实际包含 `READ_MEDIA_IMAGES`、`READ_MEDIA_VISUAL_USER_SELECTED`、legacy `READ_EXTERNAL_STORAGE` 与独立 `ACCESS_MEDIA_LOCATION`。APK 内含 `libMNN.so`、`libpocket_mnn_jni.so`、`libc++_shared.so`，不含 Qwen/LoRA 权重；模型仍需按签名 manifest 安装到应用私有目录。

轻路由深化后重新执行 mobile sync 与 `assembleDebug`：Gradle 成功，APK dex 已确认包含 `PocketPhotoAssetRouter`、`openInSystemGallery` 和 `clearAppPhotoCache`。`scripts/android/verify-mnn-apk.sh` 继续通过 12/12 JNI、arm64-v8a、v2 签名和 16 KiB 对齐门禁。

本次 clean 构建同时复验 84 files / 1,481 tests、2,309 modules mobile build、836,390 bytes 首屏门禁和上游源码/受限 MobileCLIP 权重未入包。5000 条与 100/20 查询结果只来自桌面合成回归，详见 `photos-round4-6-evidence-2026-08-11.md`。

这些结果只证明软件编译、装包与静态原生契约；未连接目标 Android 手机，因此不能声称相册权限、content URI、模型安装、真实 decode、飞行模式或 SME2 runtime 已通过。

## 必须在目标 Android 手机继续

1. Android 13 验证全部照片授权；Android 14 验证全部/选定/拒绝三态。
2. 验证权限收回、再次授权、分页断点和 `ACCESS_MEDIA_LOCATION` 独立授权。
3. 检查系统权限弹窗是否因上游插件额外显示“视频”；若不符合最小权限，决赛包前必须改为 image-only 原生桥或经验证的 Manifest/插件补丁。
4. 使用固定哈希安装两套 Qwen Base 与 OCR Adapter，运行 Photos `runtime_status`、Qwen、Base OCR 和 LoRA Quality Gate；缺模型时必须保持 `stub`。
5. 开启飞行模式复跑索引、找照片、Qwen/OCR 和落地球闭环。
6. 记录 PSS、模型加载、首 token、tokens/s、电量、温度和取消后的 native 占用。
7. 只有运行日志明确显示 `sme2-active` 且完成同机关闭对照，才可声称 SME2 已启用。
