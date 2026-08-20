# Pocket Data Pack v1 制作契约

## 目录

1. 两层模型
2. 顶层字段
3. 版本和兼容性
4. 记录共同规则
5. 分发方式
6. 隐私与来源
7. 安装生命周期
8. 制作验收

## 1. 两层模型

`pocket-data/v1` 是 Skill 与数据之间的通用交换边界。

- Core Protocol 只负责包身份、版本、来源、隐私、兼容 Skill、记录数量、分发和安全。
- Skill Adapter 负责书籍、电影或音乐的具体记录字段、领域校验、索引、地图点位与 UI 转换。

保持两层分离。新增数据类型时新增 Adapter，不修改 Core。一个包可以符合 Core，但如果运行时没有对应 Adapter，它仍不能被装备。

## 2. 顶层字段

单文件 Bundle 必须包含以下字段：

- `protocol`：严格等于 `pocket-data/v1`。
- `identity`：数据包的稳定 ID、名称、版本、作者和说明。
- `schema`：记录 Schema ID、Schema 版本和记录总数。
- `compatibility`：可消费此包的 Skill ID 与最低运行时版本。
- `privacy`：`public`、`private` 或 `restricted`。
- `provenance`：真实来源、许可和生成时间。
- `distribution`：本 Skill 输出时固定为 `{ "mode": "inline" }`。
- `records`：符合目标 Adapter Schema 的记录数组。

不要添加自定义顶层字段。需要表达的领域信息必须进入 Adapter 已定义的记录字段。

## 3. 版本和兼容性

- `identity.id` 使用稳定的小写命名空间，例如 `com.example.my-books`。
- `identity.version` 和 `schema.version` 使用语义化版本，例如 `1.2.0`。
- `identity.id + identity.version` 代表不可变内容；内容变化必须提升版本。
- `schema.name` 必须严格使用目标 Adapter 的 ID，不得自行发明或改名。
- `compatibility.skills` 必须包含目标 Skill ID。
- `schema.record_count` 必须严格等于 `records.length`。

协议版本、数据包版本和记录 Schema 版本是三件不同的事，不得混用。

## 4. 记录共同规则

- 每条记录必须有数据包内唯一、稳定的字符串 `id`。
- 不得编造事实。未知文本使用空字符串，未知数字使用 `null`；Schema 允许省略的字段可以省略。
- 日期使用 `YYYY-MM-DD` 或空字符串。
- 地点坐标使用 WGS84；来源不足时省略地点，不生成假坐标。
- 用户评分、公开站点评分和模型置信度使用不同字段。
- 不得增加记录 Schema 未定义的字段。
- 记录不得包含执行代码、访问令牌或未声明的二进制内容。

## 5. 分发方式

本制作 Skill 只生成适合 AI 输出和本地导入的 Inline Bundle：Manifest 与全部记录在同一个 JSON 中，`distribution.mode` 为 `inline`。

大型公共库可以另行发布 OSS/CDN 分块 Manifest。分块模式需要为每个文件声明安全相对路径、字节数、SHA256 和记录数，不属于本 Skill 的默认输出。

## 6. 隐私与来源

- 个人资料默认使用 `privacy=private` 和 `license=private-use`。
- `public` 只用于确认允许公开分发且不含私人信息的数据。
- `restricted` 用于受组织、账号或许可条件约束的数据。
- `provenance.source` 必须具体说明输入来自文件、清单、URL、导出数据或数据库。
- `provenance.generated_at` 使用 ISO 8601 UTC 时间。
- AI 整理不等于事实来源；保留原始输入来源，不要把模型猜测写成已验证事实。
- 公共包不得包含账号 ID、令牌、私密笔记、原始私人照片或可识别个人身份的信息。

## 7. 安装生命周期

Pocket Earth 装入数据包时会依次：

1. 校验 Core 字段、版本、来源、隐私和分发结构。
2. 根据 `schema.name` 查找 Adapter。
3. 用 Adapter 校验每条记录与 Skill 兼容性。
4. 写入本机缓存并设为当前 Data Pack。
5. 重建对应 Skill 的索引、推荐上下文和地图点位。

切换或卸载只改变 Data Pack，不删除 Skill 能力或用户另外保存的私人记录。

## 8. 制作验收

交付前必须确认：

1. 选择了正确的模板、Skill ID 与 Schema ID。
2. 顶层字段完整且无额外字段。
3. 每条记录完全符合目标 JSON Schema。
4. `record_count` 正确且没有重复记录 ID；音乐还需检查跨城市 track ID。
5. 日期、评分、URL、坐标、隐私和来源真实有效。
6. `node scripts/validate-data-pack.mjs <文件.json>` 返回 `VALID`。

只有通过校验的单文件 JSON 才能交付给用户导入。
