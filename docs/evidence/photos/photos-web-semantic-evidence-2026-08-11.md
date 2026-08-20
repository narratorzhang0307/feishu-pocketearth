# Photos Web 语义索引与首屏证据（2026-08-11）

## 结论

- Photos 语义模型不会进入应用首屏；必须由用户点击“安装模型并建立语义索引”后才动态加载。
- 公开项目图片的视觉向量与文本查询均在浏览器端完成，向量以 512 维对称 int8 记录保存到独立 IndexedDB。
- 首次安装完成后，搜索以 `local_files_only` 方式读取浏览器缓存；ONNX Runtime 的 JS/WASM 文件由应用本地资源提供，不依赖 jsDelivr。
- 本记录只证明开发机 WebGPU/WASM 路径，不证明 Android、MNN 或 SME2。

## 可复现输入

仅使用仓库内公开演示资产，不读取私人相册：

- `public/assets/exhibit-2_5d/chsd-Ark_HM_791_HI-museum-mnn/views/view-00-001.webp`
- `public/assets/exhibit-2_5d/chsd-Ark_HM_791_HI-museum-mnn/views/view-02-121.webp`

## 实测

| 场景 | 结果 |
|---|---|
| 首次显式安装与索引 | 2/2 成功；新增 2、复用 0、失败 0；36.1 秒；开发机后端 WebGPU fp16 |
| 文本查询 `bronze artifact` | 返回 2 个候选；余弦分约 0.19 / 0.18 |
| 同资产增量重建 | 新增 0、复用 2、失败 0；约 0.2 秒 |
| 整页刷新后 cache-only 查询 | 仍返回 2 个候选；文本塔用后释放，再次查询可从本地缓存恢复 |
| 生产版手机视口回归 | 393×852 下三入口、安装卡、搜索框、结果卡与底栏无横向溢出 |

刷新后的网络检查只观察到应用本地 ORT 模块：

```text
http://127.0.0.1:4178/assets/ort-wasm-simd-threaded.jsep-*.mjs
```

该次 cache-only 查询未观察到 Hugging Face 或 jsDelivr 请求。首次模型安装仍需要联网下载模型文件，产品 UI 必须如实称为“安装”，不能称为出厂完全离线。

## 生产构建

`npm run build`：2308 modules transformed，构建通过。

| 资源 | 大小 | 首屏加载 |
|---|---:|---:|
| `photo-semantic-runtime-*.js` | 902.13 kB | 否 |
| `ort-wasm-simd-threaded.jsep-*.wasm` | 21,596.02 kB | 否 |
| `PhotosTab-*.js` | 72.15 kB | 否（路由按需） |
| 初始 CSS/JS 总量 | 836,390 bytes | 是 |

`node scripts/release/verify-first-paint.mjs` 返回：

```json
{"ok":true,"initialBytes":836390,"limitBytes":3145728,"forbiddenRequests":[]}
```

## 固定实现

- 模型：`Xenova/clip-vit-base-patch32`
- 索引版本：`clip-vit-b32-q8-int8-v1`
- 输入：224px 本地缩略图
- 向量：512 维，对称 int8
- 查询：中文常用意图在本地扩写为英文 CLIP 提示；文本向量每次只计算一次
- 版本失效：旧向量忽略，照片索引、光阴志确认和个人偏好不删除
- 内存：视觉塔和文本塔在完成、取消或异常路径均释放

## 尚未证明

- 5000 张相册的内存峰值、温度、功耗和全库耗时。
- Android WebView 的 WASM q8 性能与模型缓存配额。
- 冻结 100 张图库/20 条查询的 Recall@5、Recall@20。
- Android 飞行模式完整闭环。
