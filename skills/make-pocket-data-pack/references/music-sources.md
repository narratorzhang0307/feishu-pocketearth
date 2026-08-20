# 音乐来源整理规则

## YouTube 单曲

1. 把视频页面当作原始来源，不要当作 Data Pack Manifest。
2. 能可靠读取时，提取曲名、艺人和视频 ID；不能确认时保留空字段或询问用户。
3. 将 `playback.provider` 设为 `youtube`，将视频 ID 写入 `sourceId`，将原始 HTTPS 页面写入 `sourceUrl`。
4. YouTube 来源的 `url` 必须留空，因为它不是可交给 HTML Audio 的音频直链；Pocket Earth 会用 `sourceId` / `sourceUrl` 启动 YouTube 官方嵌入播放器。
5. 若另有获得许可、可直接播放的 OSS 或外部音频，则改用 `oss` 或 `external` ，并仅在 `url` 填写该 HTTPS 音频直链。

## YouTube 歌单

1. 先展开为曲目清单，再逐首生成 track；歌单本身不是一条 track。
2. 无法访问完整歌单时，要求用户提供 YouTube 导出清单、CSV、截图识别结果或逐行曲目文本，不得猜测缺失曲目。
3. 同一数据包内所有 track ID 必须跨城市唯一。

## 无播放来源

仍可保留曲目元数据。把 `playback` 或 `introPlayback` 写成 `{"provider":"none","url":""}`。不要伪造 OSS 地址或 YouTube ID。
