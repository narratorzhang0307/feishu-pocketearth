# app 层 Skills 目录（路由器）

这里是**运行时共享能力模块**：各 agent（电影 / 书 / 旅行 / 照片 / 造物主）`import` 的领域无关能力。一处实现、多处调用，让各 agent 退化成"领域薄配置"。

> 本文件是**路由器不是仓库**（黄佳《Harness》§3.5）：只列每个 skill 是什么、谁在用、依赖谁；细节看各 `.ts` 文件头注释。

## 两种 skill 的家目录约定（别混）
- `src/app/lib/skills/`（**本目录**）= **app 层**：依赖 app 数据（userMarks / geoStickers / catalog / 画像）。
- `frost-agent/skills/` = **内核层**：只依赖 harness（如 `curatePlaylist`）。
- 开发工具目录中的 `skills/*/SKILL.md` = 开发期技能（部署 / 验证 SOP），不跑在 app 里。

## 索引

### 一、输入 → 结构化（把图 / 文本读成数据）
| skill | 一句话 | 谁在用 |
|---|---|---|
| `visionRead` | 原图 → 端侧 VL（edgeSafe）→ 脱敏文本。**「原图只进端侧」隐私边界唯一收口** | travel/sense、（visionExtract 内部）|
| `textExtract` | 文本 → 按 schema 的扁平字段（端侧优先/回退云）。与 visionExtract 对称 | （目前仅 visionExtract 内部；可直接用于纯文本场景）|
| `visionExtract` | 图 → 字段 = `visionRead` + `textExtract` | movie/sense、book/sense、造物主 engine |
| `parseInput` | 一句话 → 评分 + 去噪抽标题（确定性·不费云，噪声词当参数）| movie/sense、book/sense |
| `browserVision` | 纯浏览器端侧视觉原语：decode / dHash+hamming / CLIP 零样本（零网络，原图不出浏览器）| photo features/vision/reasoning |

> 端侧看图**两条线**：`visionRead`(联网本机端侧服务·VL 读字) vs `browserVision`(纯浏览器 CLIP 分类)——性质不同，见各文件头。

### 二、落点（钉地球）
| skill | 一句话 | 谁在用 |
|---|---|---|
| `resolvePlace` | 地名 → 坐标（本地表 → Mapbox 城市级 → 缓存）| 造物主 engine / research |
| `markPlace` | 统一落点（校验/去重/抖散/写 userMarks）| movie/pin、book/pin、造物主 pin |

### 三、云脑 & 本地库
| skill | 一句话 | 谁在用 |
|---|---|---|
| `enrichEntity` | 调云脑要 JSON + 稳健解析（`extractJSON` / `enrichJSON` 含超时）| 造物主 engine/research/forge、movie/tagging |
| `matchCatalog` | 本地库 RAG 锚定匹配（归一→精确→长度收紧的模糊）| movie/catalog、book/catalog |

### 四、端侧记忆 & 反思
| skill | 一句话 | 谁在用 |
|---|---|---|
| `keyedStore` | 通用 IndexedDB keyed 库（keyPath 参数化）+ localStorage 纠错偏好 | movie/store、book/store、photo/store |
| `draftCritic` | 通用护栏：评分钳 / 坐标 / 年份 / 应用纠错 / 命中本地索引 | movie/critic、book/critic |

## skill 之间的组合（skill 调 skill，无层级）
```
visionExtract ─┬─ visionRead
               └─ textExtract ── enrichEntity
draftCritic ──（类型）── keyedStore   (Corrections)
```

## 遵循的原则（§3.12，迁移自软件工程）
- **关注点分离**：领域无关能力不归任何 agent 私有，收口到此。
- **依赖倒置**：调用方依赖输入输出契约，不依赖实现（visionRead/textExtract 可注入端侧/云后端）。
- **单一职责**：每个 skill 只做一件事；**可组合**（上面的组合图）。
- **最小接口**：领域差异做成参数（schema / 噪声词 / keyPath / geo.kind），不写死分支。

## 加新 skill 时
1. 判家目录（依赖 app 数据→本目录；只依赖 harness→`frost-agent/skills/`）。
2. 领域差异做成参数，别写死。
3. 各处改 `import`、删镜像副本 → `npm run build` + 必要时 node 单测（行为保持）。
4. 在本 README 的索引里补一行。
