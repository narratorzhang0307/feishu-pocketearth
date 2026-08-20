---
name: script-tts-pipeline
description: |
  DJ 声音流水线（离线脚本）。把展示稿转换成适合 TTS 引擎念的口播稿（年份/数字/符号 → 口语），
  再生成 DJ 音频、字幕文本与同步数据，上传对象存储，写回资源库 audio.db。
type: pipeline
runtime: node
llm: false
io:
  in: "展示稿文本 + 目标(城市播客 / 某曲 DJ 解说)"
  out: "audio.db podcast / tracks.intro_audio_url 写入"
data: "仓库根 resource-library/audio.db（二进制不入库；schema 见 frost-agent/backend）"
---

# 阶段（责任链）
1. normalize 展示稿 → 口播稿：年份/数字/符号转中文口语（✅ 已实现，纯 JS）
2. synth     TTS 引擎生成 DJ 语音（需 TTS API）— 接入点
3. caption   口播稿 → 字幕文本 + chunk_meta 同步数据（部分可在前端做）
4. upload    上传对象存储（需凭据）— 接入点
5. writeback 音频托管 URL → audio.db（✅ 已实现：城市播客 / 某曲 DJ 解说）

# 边界
- 离线运行，不进 bundle，不含密钥。
- normalize 与 writeback 真实可用；synth/upload 是接入点。

# 用法
```bash
node frost-agent/agents/script-tts-pipeline/pipeline.mjs normalize --text "收在2012年同名专辑里"
node frost-agent/agents/script-tts-pipeline/pipeline.mjs writeback --city <slug> --kind podcast --url <audio_url> [--text 文稿]
node frost-agent/agents/script-tts-pipeline/pipeline.mjs writeback --city <slug> --kind intro --track <id> --url <audio_url>
# 之后：npm run library:build
```
