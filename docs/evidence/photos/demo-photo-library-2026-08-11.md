# Pocket Earth 新机演示照片库证据

日期：2026-08-11

## 结论

- 已将当前 Photos 静态样刊实际使用的远程照片按缩略 URL 去重，生成 198 张可导入安卓系统相册的 JPEG。
- 覆盖 2020-01-06 至 2025-12-21、6 个年份、67 个自然月份。
- 每张 JPEG 都写入 `DateTimeOriginal`、`DateTimeDigitized`、`DateTime`、`+08:00` 时区、GPS 与同步文件 mtime。
- 日期是比赛预设演示时间，不是素材原始拍摄时间；这一点已写入图片 UserComment、README 与 manifest。
- 所有图片均保留来源 URL、作者、作品链接与 SHA-256 清单。
- 生成目录位于 `deliverables/`，不在 `public/`，不会被 Vite/Capacitor 打进 APK。

## 构建产物

- 文件夹：`deliverables/pocket-earth-demo-photo-library/`
- 压缩包：`deliverables/pocket-earth-demo-photo-library.zip`
- 照片：198 张
- 文件夹总大小：28,523,194 bytes
- ZIP 大小：28,138,498 bytes
- ZIP 文件项：202（198 JPEG + README + JSON/CSV 清单）

## 验证门

生成器对每张照片执行以下验证，任一失败即不发布产物：

1. JPEG 可重新打开并通过 Pillow `verify()`；
2. EXIF `DateTimeOriginal` 与预设精确一致；
3. EXIF 同时存在纬度和经度；
4. 文件 mtime 与预设时间偏差不超过 1 秒；
5. 最终 ZIP CRC 全量通过。

构建结果：198/198 通过；ZIP `testzip()` 返回空错误。

## App 数据路径

授权/选择照片后，三个主视图共用同一批资产：

`MediaStore assetId + DATE_TAKEN + ≤320px thumbnail` → `照片整理 / 杂志 / 日历`

- 杂志按 `DATE_TAKEN` 年份分刊；
- 日历按 `DATE_TAKEN` 年月日落格；
- 照片整理在相同 assetId 上计算质量、重复、票据、GPS 等派生建议；
- 打开原片时由 Android `content://media/...` 路由到系统相册；
- App 不保存原片 URL、不复制原片、不删除 MediaStore 文件。

本地网页验证使用 2020、2023、2025 三张生成照片，已确认杂志生成三本年份刊、日历显示真实日期、照片整理对同一批三张照片完成分析。
