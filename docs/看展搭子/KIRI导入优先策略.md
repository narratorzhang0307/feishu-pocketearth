# 看展搭子 · 3D 双轨策略（导入优先，API 保留不充值）

> 2026-07-03 定策。依据：KIRI 官方 API 文档 21 张截图逐张实测理解 + 成本页 + ChatGPT 复盘 + 本项目已落地代码。

## 一句话结论
**KIRI 负责「生成」，不负责「存储」；看展搭子负责「存储 + 展示 + 组织」。** 前期主力走「自己用 KIRI Pro 生成 → 导出 GLB → 导入看展搭子」，**不碰 API 充值**；API 代码保留，等以后要「用户上传视频自动生成」再接后端。

## 成本（实测，是不走 API 的根据）
- **API**：每次 call = 1 credit = **$1**，最低充值 **500 credits = $500**。账号已建 key `pocket-earth`，有 **10 个免费 credit**（够端到端测通，不够生产）。
- **Pro 订阅**：3DGS 新人 **$47.99/年**（≈¥3.99/月），Unlimited。自己批量生成用这个，比 API 按次划算得多。

## 双轨
| 轨 | 用途 | 走 API? | 状态 |
|---|---|---|---|
| **A 轨（主力·MVP）** | 自己用 KIRI Pro/Web/App 生成 → 导出 GLB/PLY → **导入**看展搭子 → IndexedDB 存 → 展示 | ❌ | 本轮落地 mesh viewer 后**打通** |
| **B 轨（保留·后期）** | 用户上传视频/多图 → 后端调 KIRI API 自动生成 | ✅ | 代码已就绪（录视频/多图入口 + /api/kiri 代理），待真实 key 端到端 |

## 为什么必须自己存储（KIRI 不做仓库）
- KIRI 生成的模型**只在其服务器存 3 天**（Asset Retention），之后自动删。
- `getModelZip` 返回的 zip 直链**只有效 60 分钟**。
- → 所以拿到就必须落到自己的存储。看展搭子用 **IndexedDB blob**（`splatStore` 'pe-splats'，blob 绝不进 localStorage/dataURL）。

## 格式与渲染（本轮技术核心）
KIRI 可导出 obj/fbx/stl/**ply**/**glb**/gltf/**usdz**/xyz。看展搭子按格式分发到正确渲染器：

| 格式 | 类型 | 渲染器 | 说明 |
|---|---|---|---|
| **.glb / .gltf** | 网格 mesh | **MeshViewer**（three.js GLTFLoader）· 本轮新增 | **首选**：二进制打包模型+材质+纹理，网页/跨平台最省事 |
| .ply / .splat / .ksplat | 高斯泼溅 | ExhibitViewer（@mkkellogg/gaussian-splats-3d） | 真实感强，KIRI 3DGS 默认输出 |
| .usdz | 网格（Apple AR） | iPhone AR Quick Look（待接） | 给 iPhone/iPad 用户「放进现实空间」，Web 端不直接渲染 |

分发器 `Viewer3D.tsx`：`shouldUseMeshViewer(format, url)` 先信任全链路传递的 format，缺失或只剩 `application/octet-stream` 这类未知格式时再从 KIRI/GMI 模型 URL 兜底识别 glb/gltf → MeshViewer，否则 → ExhibitViewer。format 全链路传递：导入存扩展名 → `splatStore` → `pin` meta.splatFormat → `fromMark` → `MarkerDetail` → `openView3D(url, format)` → `Viewer3D`。

## 「手机 vibe coding 配环境」的边界（诚实）
- ✅ 能在手机端做：导入模型 / 存储 / 展示 3D（旋转缩放）/ 写展品信息 / 时间线。**这就是 A 轨，本轮打通。**
- ❌ 不能：把 KIRI 的重建算法本地装进手机跑。KIRI 只有云端 REST API，没有可下载的本地 SDK。真调 API 也必须放后端（key 走 `Authorization: Bearer`，绝不进前端 bundle）——本项目 `/api/kiri` 代理已这么做。

## 与时间线那条线的融合（保留）
拍照时间线（`CultureLayerTimeline` 文化层叠压：旧在下、新在上）与 3D 导入**并存**：
- 一件展品可以只有照片（进时间线）、也可以额外附 3D 模型（GLB/PLY，徽章 ◆）。
- 时间线按拍摄/年代排序不变；3D 是展品的「可选增强层」，不打断时间线体验。

## API 契约实测校准（B 轨用）
逐张核对官方文档，本项目 `/api/kiri` 代理契约**基本全对**：端点 `api.kiriengine.app/api/v1/open/{3dgs,photo,featureless}/{video,image}`、`Bearer` 认证、状态码（-1上传/0处理/1失败/2成功/3排队/4过期）、`data.serialize`、`data.status`、`data.modelUrl`（zip 60分钟）、`/balance`。**唯一缺口**：upload 未传 `isMesh`/`isMask`；若 B 轨要直接出 GLB，需 `isMesh=1` + `fileFormat=glb`（当前默认出 3DGS special PLY，够 ExhibitViewer 用）。

### 2026-07-03 真实 key 实测（balance，不烧 credit）
用户填入 key 后实测 `GET /balance`：**直连 KIRI + 经 `/api/kiri` 代理，两层都 HTTP 200**，返回 `{"code":200,"msg":"success","data":{"balance":10},"ok":true}`。
→ **key / Bearer 认证 / 端点 / 响应结构 / SSRF 放行 全部实测通过，契约不再是纸面。**
⚠️ **文档 vs 实际差异**：balance 返回 `"code":200`，但官方文档图所有示例写 `"code":0`。**本项目判成功用 HTTP `r.ok` + `data.*` 字段、不依赖 `code`**，故这个差异不影响代码（当初这么写是对的）。
**仅剩** upload→status→getModelZip→解 .ply 全链路待真实素材端到端（会用 1 credit）。

## 下一步
1. USDZ iPhone AR Quick Look 接入（`<a rel="ar">` / model-viewer）。
2. B 轨 upload 补 `isMesh`/`isMask`/`fileFormat` 参数（要出 mesh 时）。
3. 真实 GLB 文物样例，替换 demo 的耐克鞋 preset。
