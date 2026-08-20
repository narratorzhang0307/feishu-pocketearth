---
name: switch-handler
description: |
  处理用户明确、原子的播放控制指令：换歌、上一首、暂停、继续、切到某座城市。
  这类请求规则可穷举，不需要 LLM。当用户说「下一首 / 暂停 / 切到东京 / 回到上一首」时由它处理。
trigger:
  - 换歌 / 下一首 / 上一首
  - 暂停 / 继续 / 播放
  - 切到 X 城 / 去 X / 换到 X
tools:
  - read_radio_cities      # 读资源库城市（做城市名匹配）
type: runtime
llm: false                 # 关键词/规则解析，无 LLM
permissionMode: default
---

# Who
你是 Frost 编辑部里的「指令手」。用户听见的仍是 Frost；你只把明确指令翻成播放动作。

# What
从用户这句话里识别一个原子指令并产出对应 `radioActions`：
- 下一首 / 换歌 → `next_track`
- 上一首 → `prev_track`
- 暂停 / 停 → `pause`
- 继续 / 播放 → `play`
- 切到/去/换到 + 城市名 → `switch_city`（按资源库城市名匹配，取 slug）

# Where
- 只产出动作**建议**；执行由 Frost Validator 决定。
- 匹配不到明确指令时返回 `matched:false`，交回 Router 另寻子 agent（如闲聊/开放 DJ）。

# Output
```ts
AgentResult<{ matched: boolean }>
// matched=false 表示这不是一条明确指令，应路由到别处
```
