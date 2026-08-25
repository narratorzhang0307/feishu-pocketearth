# Pocket Data Pack Protocol v1：通用规则

> 协议 ID：`pocket-data/v1`  
> 状态：稳定  
> 适用范围：任何可为 Skill 提供结构化数据的 Data Pack  
> 核心原则：Skill 决定“如何处理”，Data Pack 决定“处理什么”

`pocket-data/v1` 是 Pocket Earth 中 Skill 与数据库之间的通用交换边界。核心协议不认识书籍、电影、音乐、展览或旅行；它只规定所有数据包都必须遵守的身份、版本、来源、隐私、兼容性、分发和安全规则。

每种 Skill 数据类型通过独立 Adapter 接入。Adapter 声明自己支持的记录 Schema、Skill ID、校验器和运行时转换逻辑。因此新增一种数据类型时，只新增 Adapter，不修改 Core 协议。

## 1. 两层架构

| 层 | 负责内容 | 是否因 Skill 改变 |
| --- | --- | --- |
| Core Protocol | 包身份、版本、隐私、来源、兼容 Skill、记录数量、分发、哈希和安全 | 否 |
| Skill Adapter | 记录字段、领域校验、索引、推荐上下文、地图点位和 UI 转换 | 是 |

一个 JSON 可以完全符合 `pocket-data/v1`，但如果当前 Pocket Earth 没有安装它对应的 Adapter，运行时必须返回“协议有效，但缺少适配器”，不得把它误判为非法 JSON，也不得猜测如何使用记录。

## 2. 通用单文件 Bundle

本地导入使用一个同时包含 Manifest 和 `records` 的 JSON 文件：

```json
{
  "protocol": "pocket-data/v1",
  "identity": {
    "id": "com.example.my-exhibitions",
    "name": "我的展览记录",
    "version": "1.0.0",
    "author": "Example User",
    "description": "由用户自己的 AI 整理"
  },
  "schema": {
    "name": "example.exhibitions/v1",
    "version": "1.0.0",
    "record_count": 1
  },
  "compatibility": {
    "skills": ["example.exhibitions"],
    "runtime_min": "1.0.0"
  },
  "privacy": "private",
  "provenance": {
    "source": "User supplied spreadsheet",
    "license": "private-use",
    "generated_at": "2026-08-10T00:00:00.000Z"
  },
  "distribution": {
    "mode": "inline"
  },
  "records": []
}
```

示例中的 `example.exhibitions/v1` 只是说明命名规则；只有安装对应 Adapter 后才能在 Pocket Earth 中运行。

## 3. Core 必需字段

### 3.1 `protocol`

- 必须严格等于 `pocket-data/v1`。
- 未来不兼容变更必须使用新的协议主版本，不能静默改变 v1 语义。

### 3.2 `identity`

- `id`：数据包永久 ID，使用稳定的小写命名空间，例如 `com.example.my-library`。
- `name`：用户可见名称。
- `version`：数据包语义化版本，例如 `1.2.0`。
- `author`：数据包作者或生成者。
- `description`：数据包用途说明。
- 同一个 `identity.id + identity.version` 代表不可变内容；内容变化必须发布新版本。

### 3.3 `schema`

- `name`：记录 Schema ID，格式为稳定命名空间加主版本，例如 `pocket.movies/v1`、`example.exhibitions/v1`。
- `version`：该记录 Schema 的完整语义化版本。
- `record_count`：记录总数，必须与单文件 `records.length` 或所有分块记录数之和一致。

协议主版本、数据包版本和记录 Schema 版本是三件不同的事，不得混用。

### 3.4 `compatibility`

- `skills`：能够消费此数据包的稳定 Skill ID 数组。
- `runtime_min`：最低运行时版本。小于或等于当前版本即兼容，不是要求精确相等。
- 当前运行时必须同时存在兼容 Skill 和对应 Adapter，才能安装并启用数据包。

### 3.5 `privacy`

- `public`：允许公开分发。
- `private`：用户私人数据，默认只保存在本机。
- `restricted`：受许可、组织或访问条件约束的数据。

### 3.6 `provenance`

- `source`：数据来自哪里，不得留空。
- `license`：公开许可、授权说明或 `private-use`。
- `generated_at`：ISO 8601 时间。
- AI 生成的数据必须保留输入来源说明；不得把 AI 猜测伪装成已验证来源。

### 3.7 `distribution`

- `inline`：单文件 Bundle，必须包含 `records`。
- `chunked`：OSS/CDN 分块 Manifest，必须包含 `files`。

## 4. Adapter 通用契约

每个 Adapter 至少声明：

```json
{
  "domain": "movies",
  "skill_id": "pocket.movies",
  "schema_name": "pocket.movies/v1",
  "schema_version": "1.0.0",
  "record_schema": "movies-record.schema.json"
}
```

Adapter 必须提供：

1. 稳定 `skill_id`。
2. 稳定 `schema_name` 和支持的 `schema_version`。
3. 一份可独立验证的 JSON Schema。
4. 运行时记录校验器，拒绝未知字段、类型错误和越界数据。
5. 从通用记录到 Skill 内部模型的转换。
6. 数据切换时需要重建的索引、推荐上下文和地图点位。
7. 至少一个最小合法 Bundle 和一组非法输入测试。

当前已安装 Adapter 的机器可读清单位于 [`adapter-registry.json`](../../schemas/pocket-data-v1/adapter-registry.json)：

| Adapter | Skill ID | Schema |
| --- | --- | --- |
| 书籍 | `pocket.books` | `pocket.books/v1` |
| 电影 | `pocket.movies` | `pocket.movies/v1` |
| 音乐 | `pocket.music` | `pocket.music/v1` |
| 照片 | `pocket.photos` | `pocket.photos/v1` |
| 内容 Mapping | `pocket.mapping` | `pocket.mapping/v1` |

展览、旅行等后续模块必须复用 Core，只新增自己的 Adapter。古籍、现代书和普通资料的内容 Mapping 已统一复用 `pocket.mapping/v1`，古籍只是载体预设。

## 5. 所有记录的共同规则

Core 不规定领域字段，但所有 Adapter 必须落实以下共同约束：

- 每条记录必须有数据包内唯一、稳定的字符串 `id`。
- 未知文本使用空字符串，未知数字使用 `null`；不得由 AI 编造事实。
- 日期使用 Adapter 明确声明的标准格式，当前内置 Adapter 使用 `YYYY-MM-DD` 或空字符串。
- 地点坐标统一使用 WGS84；来源不足时不写坐标。
- 用户评分、公开站点评分和模型置信度必须使用不同字段。
- 记录不得携带执行代码、访问令牌或未声明的二进制内容。
- Adapter 必须拒绝未知字段，防止数据悄悄改变语义。

## 6. 两种等价分发形态

### 6.1 Inline Bundle

适合本地导入、AI 输出和小型私人数据库。Manifest 与记录在同一 JSON 中；`distribution.mode` 必须为 `inline`。

### 6.2 OSS Manifest + 分块

适合公共数据或大量记录：

```text
manifest.json
chunks/records-00001.json
chunks/records-00002.json
bundle.json
```

`files` 中每个分块必须声明：

- 安全相对路径；
- `application/json`；
- byte 大小；
- SHA256；
- 记录数。

客户端只在用户安装时下载，逐块验证后再写入本机。`bundle.json` 是同版本的便携形式，必须与分块 Manifest 内容一致。

## 7. 安装与生命周期

1. Core 校验协议、身份、版本、来源、隐私和分发结构。
2. 根据 `schema.name` 查找 Adapter。
3. 没有 Adapter 时返回“协议有效，但缺少适配器”。
4. Adapter 校验每条记录和 Skill 兼容性。
5. 分块模式验证路径、大小、SHA256 和记录数。
6. 写入本机 IndexedDB，并设为对应 Skill 的当前 Data Pack。
7. 重建该 Skill 的索引、推荐上下文和地图点位。
8. 切换或卸载只影响 Data Pack，不删除 Skill 和用户自己新增的记录。

## 8. 安全与隐私

- 网络安装只接受 HTTPS；本机开发可接受 localhost HTTP。
- 分块必须与 Manifest 同源，不允许 `..`、绝对路径或跨源跳转。
- 单文件和单分块默认上限 50MB；记录总数默认上限 50,000。
- `private` 数据不得自动上传 OSS。
- 公共 OSS 包不得包含账号 ID、令牌、私密笔记、原始私人照片或可识别个人身份的信息。
- 公共版本使用不可变路径和长期缓存；更新发布新版本，不覆盖旧对象。
- Core 校验通过不等于内容可信；来源、许可和 Adapter 的领域校验仍然必须通过。

## 9. 新增一种 Skill 数据的标准步骤

1. 定义稳定 Skill ID，例如 `example.exhibitions`。
2. 定义记录 Schema ID，例如 `example.exhibitions/v1`。
3. 编写记录 JSON Schema、合法示例和非法示例。
4. 注册 Adapter，并实现记录校验与内部模型转换。
5. 声明数据切换时需要更新的索引、地图和推荐上下文。
6. 使用通用 Data Pack 安装、切换和卸载 UI，不另造数据库安装链路。
7. 通过 Core、Adapter、分块哈希、生命周期和隐私测试后才能标记为可安装。

## 10. 第三方 AI 兼容规则

其他用户可以把以下三项交给自己的 AI：

1. 本通用协议；
2. 目标 Adapter 的记录 Schema；
3. 待整理的原始数据。

AI 输出符合协议的单文件 Bundle 后，可以进入与 Pocket Earth 官方数据相同的安装链路。第三方不需要使用 SQLite；SQLite 只是 Pocket Earth 当前的后端真源，`pocket-data/v1` 才是跨 AI、跨设备、跨数据库的交换协议。

通用 AI 指令位于 [`pocket-data-v1-ai-guide.md`](pocket-data-v1-ai-guide.md)。

## 11. 本仓库实现位置

- Core JSON Schema：`schemas/pocket-data-v1/manifest.schema.json`
- Adapter 注册表：`schemas/pocket-data-v1/adapter-registry.json`
- 书籍记录 Schema：`schemas/pocket-data-v1/books-record.schema.json`
- 电影记录 Schema：`schemas/pocket-data-v1/movies-record.schema.json`
- 音乐城市记录 Schema：`schemas/pocket-data-v1/music-city-record.schema.json`
- 照片元数据记录 Schema：`schemas/pocket-data-v1/photos-record.schema.json`
- 内容 Mapping 记录 Schema：`schemas/pocket-data-v1/mapping-record.schema.json`
- 浏览器 Core 与 Adapter 选择：`src/app/lib/dataPack/protocol.ts`、`types.ts`
- 后端/CLI 校验：`scripts/data-packs/protocol.mjs`
- 用户安装生命周期：`src/app/lib/dataPack/registry.ts`

## 12. 校验命令

```bash
npm run datapack:validate -- /absolute/path/to/bundle-or-manifest.json
npm run datapack:verify
```

只有校验结果为 `VALID` 的包才允许导入。`VALID` 表示 Core 和当前已安装 Adapter 均通过；缺少 Adapter 的包必须明确返回 Adapter 错误。
