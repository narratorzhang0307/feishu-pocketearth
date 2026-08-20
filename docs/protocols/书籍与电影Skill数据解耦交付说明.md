# 书籍与电影 Skill 数据解耦交付说明

> 交付日期：2026-08-10  
> 状态：已完成并通过 OSS 及浏览器验收  
> 交换协议：`pocket-data/v1`

## 1. 最终效果

书籍 Skill 和电影 Skill 现在只负责识别、检索、推荐、整理、地理落点与地图写回。内容数据库作为可安装的 Data Pack 独立存在，用户可以：

- 加载 Pocket Earth 的默认 OSS 数据；
- 输入第三方 HTTPS/OSS Manifest URL 安装数据；
- 导入自己的单文件 Bundle；
- 在多个已安装数据包之间切换；
- 卸载数据包而保留 Skill 本身。

第三方用户可把 `pocket-data-v1-ai-guide.md` 交给自己的 AI。AI 按 Schema 生成 Bundle 后，走的就是与 Pocket Earth 官方示例包相同的校验、安装、存储和运行链路，无需修改应用代码。

## 2. 后端与发布数据

后端数据真源位于本机忽略目录 `var/data-packs/pocket-earth-library.sqlite`，不进入前端 Bundle。

| Skill | 记录 Schema | 记录数 | OSS 分块数 |
| --- | --- | ---: | ---: |
| 书籍 | `pocket.books/v1` | 1,055 | 5 |
| 电影 | `pocket.movies/v1` | 2,124 | 9 |

OSS 发布信息：

- Bucket：`last-night-on-earth`
- Region：`cn-hangzhou`
- 不可变前缀：`pocket-earth/data-packs/releases/20260810-books-movies-v1/`
- 发布文件：18 个
- 总大小：3,203,947 bytes
- 缓存：`public, max-age=31536000, immutable`
- 加密：OSS 服务端 AES256

正式 Manifest：

- [书籍 Data Pack Manifest](https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/data-packs/releases/20260810-books-movies-v1/pocket-earth-books/1.0.0/manifest.json)
- [电影 Data Pack Manifest](https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/data-packs/releases/20260810-books-movies-v1/pocket-earth-movies/1.0.0/manifest.json)

## 3. 共同协议

协议采用两种等价交付形态：

1. 单文件 Bundle：Manifest 与 `records` 放在一个 JSON 中，适合用户从本地导入。
2. 分块 Manifest：Manifest 引用多个记录分块，适合 OSS/CDN 和较大数据库。

安装时强制校验：

- `protocol`、Skill 域和记录 Schema 是否兼容；
- Manifest 声明的记录总数；
- 每个分块的 byte 大小和 SHA256；
- 重复记录 ID；
- 不安全相对路径、跨源分块和非 HTTPS 地址；
- 单文件与单分块 50MB 上限。

SQLite 是 Pocket Earth 当前的后端实现，不是互操作前提。其他用户的 AI 只需输出符合 `pocket-data/v1` 的 Bundle 或 OSS Manifest，无需使用同一种数据库技术。

## 4. 应用运行方式

- 默认数据源为上述两个 OSS Manifest，可通过 `VITE_BOOKS_DATA_PACK_URL` 和 `VITE_MOVIES_DATA_PACK_URL` 覆盖。
- 下载后的记录保存在浏览器 IndexedDB `pe-data-packs` 中。
- 当前启用包映射保存在本地设置中；切换数据包会同步刷新书架、片库、推荐上下文、搜索索引和地图点位。
- 首屏 JavaScript 不再静态导入书籍和电影全量 JSON。
- `public/data-packs` 保留可部署的同版本发布物，供离线开发和 OSS 重新发布使用。

## 5. OSS CORS

保留 Bucket 原有 CORS 规则，只新增以下开发来源：

- `http://localhost:5173`
- `http://127.0.0.1:5173`

现有 `lastnightonearth.throughtheglass.art` 与 `*.throughtheglass.art` 来源继续保留。若决赛版部署到其他域名，需要把该精确 Origin 追加到 `scripts/data-packs/oss-cors.xml` 后重新应用；不要把包含写方法的现有规则直接改成通配符来源。

## 6. 验收结果

- Data Pack/SQLite 一致性：通过。
- TypeScript 类型检查：通过。
- 全量自动测试：53 个测试文件、1,344 条测试全部通过。
- Vite 生产构建：通过。
- 生产 JS Bundle 抽查：书籍与电影样例记录不存在于 JS 资产中。
- OSS 对象校验：18/18，缺失 0，大小不一致 0。
- 公开 Manifest：HTTP 200，JSON 类型、长期缓存和 CORS 正确。
- 真实浏览器从 OSS 恢复书籍 1,055 条、电影 2,124 条，错误日志 0。

## 7. 主要文件

- `docs/protocols/pocket-data-v1.md`：完整协议。
- `docs/protocols/pocket-data-v1-ai-guide.md`：可直接交给其他 AI 的整理说明。
- `schemas/pocket-data-v1/`：Manifest、书籍、电影 JSON Schema 与示例。
- `scripts/data-packs/`：SQLite 构建、数据包验证、发布校验、OSS 上传与 CORS 配置。
- `src/app/lib/dataPack/`：浏览器安装、验证、IndexedDB 和生命周期实现。
- `src/app/components/DataPackManager.tsx`：用户导入、切换和卸载入口。

## 8. 常用复验命令

```bash
npm run datapack:build
npm run datapack:verify
npm run typecheck
npm test
npm run build
```

重新发布前应使用上传脚本的 `--dry-run` 先核对 Bucket、前缀、文件数和字节数。发布新内容必须使用新的不可变 release 路径，不能原地替换本版本。
