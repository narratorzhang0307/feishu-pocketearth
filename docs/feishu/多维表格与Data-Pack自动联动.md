# 飞书多维表格与 Pocket Data Pack 自动联动

## 结果

书籍、电影、音乐、照片各使用一张飞书多维表格。飞书是可协作的主数据源；Pocket Data Pack / JSON Schema 是 Pocket Earth 的运行时投影和离线缓存。

数据流：

`飞书多维表格 → 服务端分页读取 → 字段映射 → 原 Schema 校验 → IndexedDB Data Pack → 原 Pocket Earth Skill`

用户在飞书修改常用列时，常用列会覆盖 `数据 JSON` 的对应字段；地点、曲目等嵌套结构保存在 `数据 JSON` 中。Schema 不合法的记录进入 `rejected` 清单，不会覆盖当前可用数据包。

## 一次性准备

1. 在飞书创建一份多维表格，并把其 App Token 写入 `.env` 的 `FEISHU_BITABLE_APP_TOKEN`。
2. 给企业自建应用开通多维表格读取与编辑权限，并将应用加入这份多维表格、授予可编辑权限。
3. 配置 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 后运行：

```bash
npm run feishu:bitable:bootstrap
```

脚本会幂等创建“Pocket Earth · 书籍 / 电影 / 音乐 / 照片”四张表及字段，并输出四个 Table ID。把它们复制进 `.env`。

4. 把当前比赛改造目录中的原数据一次性迁入飞书：

```bash
npm run feishu:bitable:sync
```

脚本按 `Pocket ID` 更新或创建记录，重复运行不会制造重复数据。

## 自动更新

应用在以下时机会自动检查版本并仅重载发生变化的领域：

- 飞书免登成功后；
- 页面重新获得焦点时；
- 页面可见期间每 20 秒；
- 多维表格自动化调用刷新 Webhook 后。

若要让服务端在表格变更后立即失效缓存，在 `.env` 生成并配置随机 token：

```bash
openssl rand -hex 32
```

将结果写入 `FEISHU_BITABLE_REFRESH_TOKEN`。然后分别在四张表中创建自动化：

- 触发：新增记录、记录内容变更；
- 操作：发送 HTTP 请求；
- URL：`https://feishu-pocketearth.throughtheglass.art/api/feishu/library/refresh`；
- 方法：`POST`；
- Header：`Content-Type: application/json`；
- Body（书籍表示例）：

```json
{
  "token": "与 FEISHU_BITABLE_REFRESH_TOKEN 相同的值",
  "domain": "books"
}
```

其余三张表的 `domain` 分别使用 `movies`、`music`、`photos`。

## 隐私边界

照片表只保存用户确认共享的元数据与 HTTPS 缩略图/公开链接。本机原图、`blob:` URL 和 `data:` URL 不会被同步到飞书。离线时仍使用最近一次通过 Schema 校验的本机缓存。
