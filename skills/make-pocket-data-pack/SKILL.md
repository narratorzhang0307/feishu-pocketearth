---
name: make-pocket-data-pack
description: 将书籍、电影、音乐、照片元数据与内容地点证据等原始资料整理成可校验并可导入 Pocket Earth 的独立 pocket-data/v1 Data Pack。Use when the user asks to make, convert, normalize, repair, validate, import, or migrate a Pocket Earth books, movies, music, photos, or content Mapping data package. Not for普通内容推荐、播放歌曲或修改 Pocket Earth Skill 本身。
---

# 制作 Pocket Data Pack

把原始资料转换成可导入的 `pocket-data/v1` JSON。保持 Skill 能力与数据分离；只整理数据，不修改 Skill 代码。

## 快速路由

| 用户数据 | Skill / Schema | 必须读取 | 输出模具 |
| --- | --- | --- | --- |
| 书籍、书单、阅读记录 | `pocket.books` / `pocket.books/v1` | `references/books-record.schema.json` 与 `references/books-example.bundle.json` | `assets/books-template.json` |
| 电影、剧集、影单、观影记录 | `pocket.movies` / `pocket.movies/v1` | `references/movies-record.schema.json` 与 `references/movies-example.bundle.json` | `assets/movies-template.json` |
| 音乐、城市电台、YouTube 单曲或歌单 | `pocket.music` / `pocket.music/v1` | `references/music-city-record.schema.json`、`references/music-example.bundle.json` 与 `references/music-sources.md` | `assets/music-template.json` |
| 照片元数据、地点与精选说明 | `pocket.photos` / `pocket.photos/v1` | `references/photos-record.schema.json` 与 `references/photos-example.bundle.json` | `assets/photos-template.json` |
| 书籍 / 资料地点证据、内容落地球 | `pocket.mapping` / `pocket.mapping/v1` | `references/mapping-record.schema.json` 与 `references/mapping-example.bundle.json` | `assets/mapping-template.json` |

始终读取 `references/pocket-data-v1.md`。只读取当前领域对应的 Schema、示例和来源说明，不加载无关领域文件。

## 制作流程

1. 确认目标领域、数据包名称、作者、来源、许可和隐私级别。默认把个人数据标记为 `private`，许可写为 `private-use`。
2. 复制对应的 `assets/*-template.json` 作为输出起点。不要改写 `protocol`、`schema.name`、`schema.version`、`compatibility.skills` 或 `runtime_min`。
3. 依据对应 JSON Schema 整理 `records`。保持字段类型精确，不得增加 Schema 未定义字段。
4. 为每条记录生成数据包内稳定且唯一的 `id`。内容相同的记录在重复整理时应获得相同 ID；不要使用数组序号作为唯一依据。
5. 不得编造事实。未知文本填空字符串，未知数字填 `null`；可选字段在没有可靠来源时省略。地点只在来源可靠时写入，坐标必须为 WGS84。
6. 把 `schema.record_count` 更新为 `records.length`，把 `provenance.generated_at` 更新为 ISO 8601 UTC 时间。内容变化时提升 `identity.version`。
7. 将结果保存为 UTF-8 JSON，并运行 `node scripts/validate-data-pack.mjs <输出文件.json>`。修复所有错误，直到输出 `VALID`。
8. 交付可导入的单文件 Bundle。能够写文件时交付 `.json` 文件；只能聊天输出时仅输出纯 JSON，不要添加 Markdown 围栏或解释文字。

### Mapping 领域额外闸门

- 古籍、现代小说、游记、史书、剧本、笔记与展览图录共用 `pocket.mapping/v1`；古籍只是载体预设。
- 每个地点必须保存原文页码、逐字引文、地点关系、现状、坐标置信度与人工确认结果。
- AI 只能生成候选。`confirmed` 只有在用户核对原文、地点状态和坐标后才能写为 `true`；未经确认的候选不得进入最终 Data Pack。
- `sourceSha256` 必须是原始导入文件的 SHA256；不能计算时应请求调用方提供，不得编造。

## 不可违反的契约

- 顶层必须且只需表达协议身份、数据包身份、Schema、兼容性、隐私、来源、分发与记录；`distribution.mode` 必须为 `inline`。
- `identity.id + identity.version` 代表不可变内容；同一版本不得对应两份不同数据。
- `schema.record_count` 必须等于 `records.length`；所有记录 ID 必须唯一。
- 用户评分、公开站点评分与地点置信度不得混用。
- 私人笔记、账号 ID、访问令牌、原始私人照片和其他敏感数据不得被标成 `public`。
- 照片 Data Pack 只保存 Schema 声明的可同步元数据；不得包含原图、Base64、`blob:` / `file:` URL、设备路径或相册资产令牌。
- 不要把 YouTube 页面或歌单 URL 当作 Data Pack Manifest；先按 `references/music-sources.md` 展开和整理成音乐记录。
- 不要绕过校验器，也不要为了通过校验而删除可追溯来源。

## 修复已有 Data Pack

先运行校验脚本并按第一条错误修复。每次只修复被证明不符合契约的部分，保留用户数据、稳定 ID 与原始来源。修复后重新校验，直到 `VALID`。

## 输出前检查

- 确认目标 Adapter 与用户请求一致。
- 确认顶层字段、记录字段和类型完全符合 Schema。
- 确认记录数、重复 ID、日期、评分范围、URL、坐标与隐私标记。
- 确认 YouTube 来源保留 `sourceId` 和 `sourceUrl`，无法读取歌单时向用户索取导出的曲目清单，不猜测曲目。
- 确认校验器已返回 `VALID`。
