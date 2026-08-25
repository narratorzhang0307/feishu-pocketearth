# 给任何 AI 的 Pocket Data Pack 通用整理指令

把本文件、[`pocket-data-v1.md`](pocket-data-v1.md)、目标 Skill 的记录 JSON Schema 和待整理数据一起交给任意 AI。AI 的任务是生成可校验的 `pocket-data/v1` 单文件 Bundle。

## 使用前填写

- 目标 Skill ID：例如 `pocket.books`
- 记录 Schema ID：例如 `pocket.books/v1`
- 记录 Schema 版本：例如 `1.0.0`
- 数据包 ID、名称和版本
- 数据来源、许可和隐私级别

Pocket Earth 当前已安装：

| 数据类型 | Skill ID | Schema ID | 记录 Schema |
| --- | --- | --- | --- |
| 书籍 | `pocket.books` | `pocket.books/v1` | `books-record.schema.json` |
| 电影 | `pocket.movies` | `pocket.movies/v1` | `movies-record.schema.json` |
| 音乐 | `pocket.music` | `pocket.music/v1` | `music-city-record.schema.json` |
| 照片 | `pocket.photos` | `pocket.photos/v1` | `photos-record.schema.json` |
| 内容 Mapping | `pocket.mapping` | `pocket.mapping/v1` | `mapping-record.schema.json` |

其他数据类型必须先有对应 Adapter 和记录 Schema。只有 Core 格式、没有 Adapter 的包会被正确识别，但不能直接装备到 Skill。

## 可直接复制给 AI 的通用指令

```text
请把我提供的数据整理为 Pocket Earth 的 pocket-data/v1 单文件 Data Pack Bundle。

我会同时提供：
1. pocket-data/v1 通用规则；
2. 目标 Skill 的记录 JSON Schema；
3. 待整理的原始数据；
4. 下列参数：
   - skill_id=<填写>
   - schema_name=<填写>
   - schema_version=<填写>
   - pack_id=<填写>
   - pack_name=<填写>
   - pack_version=<填写>
   - privacy=<public|private|restricted>

要求：
1. 顶层 protocol 必须严格等于 pocket-data/v1。
2. identity.id 和 skill_id 使用稳定的小写命名空间 ID；版本全部使用语义化版本。
3. schema.name、schema.version 和 compatibility.skills 必须使用我提供的参数，不能自行改名。
4. distribution.mode 必须是 inline，完整数据放入 records 数组。
5. schema.record_count 必须严格等于 records.length。
6. 每条记录必须通过我提供的记录 JSON Schema，不得增加未定义字段。
7. 不得编造事实。未知文本使用空字符串，未知数字使用 null；Schema 允许省略的字段可以省略。
8. 用户评分、公开站点评分和模型置信度不得混用。
9. 地点只有在来源可靠时才填写；坐标必须是 WGS84。无法确认时不生成假坐标。
10. privacy 根据数据实际情况填写；个人数据默认 private。
11. provenance.source 准确说明输入来源，provenance.license 填写真实许可或 private-use，generated_at 使用 ISO 8601 UTC 时间。
12. identity.id + identity.version 对应不可变内容；内容变化时提升版本。
13. 输出纯 JSON，不要 Markdown 代码围栏，不要解释文字。
14. 输出前自行核对顶层字段、记录数、重复 ID 和记录 Schema。
```

## AI 不得自行决定的内容

- 不得创造不存在的 Skill ID 或伪装成已安装 Adapter。
- 不得把一种记录 Schema 的字段塞进另一种 Schema。
- 不得把私人数据标记为 `public`。
- 不得为了补全而猜测作者、导演、日期、评分、许可或坐标。
- 不得输出脚本、HTML、Markdown 或可执行内容，只输出 JSON 数据。

## 输出后的校验

```bash
npm run datapack:validate -- /absolute/path/to/generated-bundle.json
```

结果含义：

- `VALID`：Core 与当前 Adapter 均通过，可以导入。
- `符合 pocket-data/v1，但尚未安装 ... 适配器`：包结构合法，需要先实现或安装对应 Adapter。
- 其他 `INVALID`：让 AI 根据错误信息修正，不要绕过校验。
