---
name: music-pipeline
description: |
  音乐资产流水线（离线脚本，非浏览器运行时）。从城市音乐稿/歌曲目录出发，
  解析音视频源 URL → 下载音频 → 格式整理（时长/文件名）→ 上传对象存储 →
  把可播放 URL 写回资源库 audio.db。城市增删只动数据，不动 UI。
type: pipeline
runtime: node
llm: false
io:
  in: "城市 slug + [{ trackId, title, artist, query }]"
  out: "audio.db tracks.audio_url 写入"
data: "仓库根 resource-library/audio.db（二进制不入库；schema 见 frost-agent/backend）"
---

# 阶段（责任链）
1. resolve   歌名/艺人 → 音视频源 URL（需解析工具 / API）— 接入点
2. download  下载音频（需下载工具）— 接入点
3. normalize 转码/统一格式/取时长（需转码工具）— 接入点
4. upload    上传对象存储（需 SDK + 凭据）— 接入点
5. writeback 把音频托管 URL 写回 audio.db（✅ 已实现）

# 边界
- 不在前端跑、不进 bundle。
- 外部步骤需要工具与凭据；本仓库不含任何对象存储/托管密钥。
- writeback 是真实可用步骤：拿到音频托管 URL 后即可入库。

# 用法
```bash
# 已有音频托管 URL → 直接写库（最常用）
node frost-agent/agents/music-pipeline/pipeline.mjs \
  writeback --city <slug> --track <trackId> --url <audio_url>
# 查看完整流水线计划（不执行外部步骤）
node frost-agent/agents/music-pipeline/pipeline.mjs plan --city <slug>
# 之后：npm run library:build
```
