---
name: photos-agent
description: 端侧整理照片，并把用户明确确认的照片元数据写入独立的 pocket.photos/v1 / 飞书照片表。书籍、电影和音乐请求不得进入本 Agent。
---

# Photos Agent Contract

photos-agent 只处理照片。原图、Base64、`blob:` / `file:` URL、设备路径和相册资产令牌不得写入 Data Pack 或飞书。

- Skill ID：`pocket.photos`
- Schema：`pocket.photos/v1`
- 飞书表：`FEISHU_BITABLE_PHOTOS_TABLE_ID`
- 运行入口：`photos-agent`
- 写入前必须由用户确认；同一照片稳定 ID 或同名元数据已存在时提醒用户，不新建重复行。
- 缺少照片表配置时明确失败，不得回退到书籍、电影或音乐表。
