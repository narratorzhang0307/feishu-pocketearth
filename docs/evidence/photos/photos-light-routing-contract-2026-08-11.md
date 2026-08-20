# Photos 轻路由数据契约（2026-08-11）

## 结论

Android 决赛链路把系统相册视为唯一原片库。Pocket Earth 不导入、移动或删除 MediaStore 原片；它只维护可重建的本地引用和派生索引。

## 权限边界

| 授权 | 能力 | 边界 |
|---|---|---|
| 全部照片 | 分页枚举全部图片、建立本地轻索引 | 不读取视频，不复制全尺寸文件 |
| 系统选定照片（Android 14 limited） | 只枚举系统允许的图片 | 未授权照片对 App 不可见；limited 快照不作为删除证据 |
| 拒绝 | 不能枚举或打开系统照片 | 旧派生记录保留但从结果隐藏 |
| `ACCESS_MEDIA_LOCATION` | 按 assetId 读取原始 EXIF GPS | 与照片读取权限分开请求；不授权也能整理和搜索 |

## 本地保存什么

| 层 | 保存 | 不保存 |
|---|---|---|
| 资产索引 | assetId、来源、授权范围、文件名、类型、尺寸、时间、可选 GPS、缩略图缓存引用 | 原片字节、原片 URL、`File`/Blob、全尺寸 base64 |
| 雷达索引 | dHash/pHash、技术质量、结构标签、聚类、用户确认 | 图片像素 |
| 语义索引 | 512 维 int8 embedding、模型 ID/版本、源修改时间 | 原图和浮点特征图 |
| 展示缓存 | 插件生成的 ≤320px JPEG 缩略图 | 系统相册原件 |

`toPersistedAsset()` 使用字段白名单，而不是把桥返回对象整体写入 IndexedDB；即使上游将来新增 `file`、`originalUrl` 或 data URL 字段，也不会进入持久化索引。

## 查看与清理

- Android `native-library` 照片点击“在系统相册打开原片”时，`PocketPhotoAssetRouter` 用 MediaStore content URI 启动系统查看器；不调用会复制全尺寸文件到 App 缓存的 `getPhotoUrl()`。
- 决赛 Android 页面不再暴露上游 `pickMedia()` 路径，因为该上游会把用户选择的全尺寸文件复制到应用缓存。
- Qwen、OCR、技术质量和 embedding 当前读取 ≤320px 派生缩略图；全库后台不会批量读取原片。
- “清除本机照片索引”只删除 Pocket Earth 的 IndexedDB 派生记录和 `cacheDir/photoLibrary` 缓存；代码没有 MediaStore delete 调用。
- 系统相册删除/编辑照片后，下一次完整扫描只更新引用状态；Pocket Earth 不反向修改系统原片。

## 仍需真机确认

- Android 13 全量授权和 Android 14 full/limited/denied 系统弹窗。
- 目标机系统查看器能否打开 content URI，以及权限收回后的错误提示。
- 清理前后 App 私有缓存目录大小、真实 5000 图扫描耗时、PSS、温度和电量。
- `ACCESS_MEDIA_LOCATION` 独立授权与 GPS 地图闭环。

在完成上述目标机检查前，只能声称“代码与构建满足轻路由契约”，不能声称“目标手机已经验收”。
