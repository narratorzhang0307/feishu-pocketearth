# 音乐 Skill 数据解耦交付说明

> 交付日期：2026-08-10  
> 状态：已完成本地、SQLite、OSS 与浏览器验收  
> Core 协议：`pocket-data/v1`  
> 音乐 Adapter：`pocket.music/v1`

## 最终效果

音乐 Skill 的曲库、Frost 对话、电台、24H 节目、懂我推荐、城市地图与歌曲落点不再读取项目外部 `resource-library`。运行时只读取当前装备的音乐 Data Pack；卸载或换包不会删除 Skill 能力与用户自己的听歌记忆。

默认示例包包含：

- 96 座城市电台；
- 621 首曲目；
- 29 段城市播客；
- 城市封面、坐标、时区和电台信息；
- 曲目和 DJ 解说的远程播放引用。

## 音乐记录设计

一条 `records` 记录代表一座城市电台，包含 `tracks` 与 `podcast`。音频二进制不进入 JSON；播放信息统一使用：

```json
{
  "provider": "oss|youtube|external|none",
  "url": "https://...",
  "sourceUrl": "https://...（可选）",
  "sourceId": "来源侧稳定 ID（可选）"
}
```

这使内容数据与播放解析器彼此独立。当前示例音频使用阿里云 OSS；后续歌单导入器可生成 `youtube` 引用，再由独立播放解析层处理，无需修改音乐 Skill 或 `pocket.music/v1` 的主体结构。

### YouTube 链接怎么使用

当前 Data Slot 的 URL 输入框只安装 `pocket-data/v1` Manifest，**不能直接粘贴 YouTube 单曲或歌单链接**。完整链路是：

```text
YouTube 单曲 / 歌单 URL
→ YouTube 导入器或 AI 整理
→ 生成 pocket.music/v1 JSON
→ 本地导入，或发布到 OSS 后粘贴 Manifest
→ 音乐 Skill 装载数据包
```

YouTube 曲目在 JSON 中保存来源引用：

```json
{
  "provider": "youtube",
  "url": "",
  "sourceId": "YouTube 视频 ID",
  "sourceUrl": "https://www.youtube.com/watch?v=..."
}
```

- `sourceId` 是稳定的视频 ID，`sourceUrl` 用于追溯原始页面。
- 当前版本已接入 YouTube 官方嵌入播放适配器；曲库、Frost 对话播放条、沉浸电台和地图歌曲卡都会按 `sourceId` / `sourceUrl` 播放同一首原曲。
- 当前版本尚未内置 YouTube 歌单自动转换器；用户可把歌单或导出清单交给 `make-pocket-data-pack` Skill 整理。
- 来源不可用时界面会明确告知，不会用与曲目无关的演示音频伪装播放成功。
- 当前可直接播放的数据使用 `provider: "oss"` 或 `provider: "external"`，并在 `url` 中提供可播放的 HTTPS 音频地址。
- 音频二进制不放进 JSON，Data Pack 只保存元数据和播放引用。

## 存储与发布

- 后端真源：`var/data-packs/pocket-earth-library.sqlite` 中的 `music` 域。
- 本地发布物：`public/data-packs/pocket-earth-music/1.0.0/`。
- OSS 不可变前缀：`pocket-earth/data-packs/releases/20260810-music-v1/pocket-earth-music/`。
- 正式 Manifest：`https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/data-packs/releases/20260810-music-v1/pocket-earth-music/1.0.0/manifest.json`
- 上传结果：3/3 文件已按对象 Key 与 byte 大小复验；开启 AES256、长期不可变缓存和 localhost CORS。

## 用户入口

音乐曲库顶部 Data Slot 支持：

- 从默认 OSS 恢复；
- 粘贴第三方 OSS/HTTPS Manifest；
- 导入本地单文件 Bundle；
- 在已安装包间切换；
- 卸载数据包但保留 Skill；
- 查看协议层、下载音乐模板、复制整理指令给任意 AI。

## 验收命令

```bash
npm run datapack:verify
npm run datapack:cors-check
npm run typecheck
npm test
npm run build
```

首次从旧城市资源库生成音乐包时可运行：

```bash
npm run datapack:build -- --music-source /absolute/path/to/resource-library
```

生成一次后，后续构建会复用版本化 `bundle.json`，不再依赖项目外目录。
