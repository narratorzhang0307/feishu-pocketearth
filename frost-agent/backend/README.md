# 后端数据底座

音乐相关后端的真源是 SQLite 链接库 `resource-library/audio.db`（私有，不入库）。
本目录的脚本是公开代码；私有内容（音频托管 URL、城市数据）只在本地。

## schema（`seed-db.mjs` 即其可执行定义）

| 表 | 主键 | 关键字段 |
|---|---|---|
| `cities` | `slug` | city_name(_zh) / iana_tz / tz_offset / station_* / cover_url |
| `tracks` | `(city_slug, track_id)` | title / artist / duration_sec / audio_url / intro_text / intro_audio_url |
| `podcast` | `(city_slug, seg_id)` | title / subtitle / text / audio_url |

## 数据流

```
cities/*.json ──(seed-db)──> audio.db ──(build-library)──> cities/*.json ──> 前端
                                ↑
              music-pipeline / script-tts-pipeline 把音频托管 URL 写回
```

## 用法

```bash
# 1) 建 schema（如有 resource-library/cities/*.json 则一并灌库）
node frost-agent/backend/seed-db.mjs

# 2) 从 audio.db 生成前端读取的 cities/*.json
node frost-agent/backend/build-library.mjs

# 拿到音频托管 URL 后写库（任选其一），再跑 build-library
node frost-agent/backend/add-audio.mjs podcast     <city_slug> <audio_url> [标题] [文稿]
node frost-agent/backend/add-audio.mjs track-audio <city_slug> <track_id> <audio_url>
node frost-agent/backend/add-audio.mjs track-intro <city_slug> <track_id> <audio_url>
node frost-agent/backend/add-audio.mjs cover       <city_slug> <audio_url>
```

> 二进制 `audio.db` 与城市数据均不入库；外部音频托管 URL 与凭据只在本地。
