#!/usr/bin/env python3
"""树莓派推理智能体 · 工具选择黄金集（评估先行的单一事实源，见 ADAPTIVE-AGENT-PLAN.md）。

依据 Chip Huyen《AI 工程》第3-4章：评估是 AI 工程最难也最重要的一环；工具选择是**封闭集『功能正确性』
问题**，用精确匹配、绝不套 AI 裁判（AI裁判只留给 chitchat/describe 的开放口播）。按『系统会在哪失败』
分 6 切片，每类失败在跑分里单独可见：

- clear_command   明确命令（该被正则/edge 稳稳选中）
- fuzzy_novel     模糊/新颖/组合说法（规则梯子接不住、正是大脑价值）
- out_of_scope    越界（该 decline 婉拒，不硬凑工具）
- asr_typo        语音转文字谐音错字（本地语音识别常见，如『下一手』→下一首）
- offline_degrade 断网降级（只许离线白名单里的工具）
- multi_turn      信息不足（该 clarify 反问）

每条：{utterance, context, expect:{type, tool?, args?}, slice}。
expect.type ∈ tool|clarify|decline|none；tool 型比工具名+关键参数（match_decision，自由文本容错）。
这是起步集（各切片先各几条），真机跑起来后把用户真实语音+ASR 文本回捞成新样本（生产数据最值钱）。
"""

T = "tool"
CLARIFY = "clarify"
DECLINE = "decline"

CASES = [
    # ---- clear_command：明确命令 ----
    {"u": "下一首", "ctx": {"playing": True}, "expect": {"type": T, "tool": "next_song"}, "slice": "clear_command"},
    {"u": "暂停", "ctx": {"playing": True}, "expect": {"type": T, "tool": "pause"}, "slice": "clear_command"},
    {"u": "上一首", "ctx": {"playing": True}, "expect": {"type": T, "tool": "prev_song"}, "slice": "clear_command"},
    {"u": "放大音量", "ctx": {"playing": True}, "expect": {"type": T, "tool": "set_volume", "args": {"direction": "up"}}, "slice": "clear_command"},
    {"u": "太吵了", "ctx": {"playing": True}, "expect": {"type": T, "tool": "set_volume", "args": {"direction": "down"}}, "slice": "clear_command"},
    {"u": "静音", "ctx": {}, "expect": {"type": T, "tool": "mute"}, "slice": "clear_command"},
    {"u": "解除静音", "ctx": {"audio_mode": "hard_mute"}, "expect": {"type": T, "tool": "unmute"}, "slice": "clear_command"},
    {"u": "生成24小时电台", "ctx": {}, "expect": {"type": T, "tool": "make_24h_radio"}, "slice": "clear_command"},

    # ---- fuzzy_novel：模糊/新颖/组合 ----
    {"u": "想听点海边夜里的爵士", "ctx": {}, "expect": {"type": T, "tool": "play_music", "args": {}}, "slice": "fuzzy_novel"},
    {"u": "给我来几首适合看海的", "ctx": {}, "expect": {"type": T, "tool": "play_music", "args": {}}, "slice": "fuzzy_novel"},
    {"u": "放点巴黎深夜的感觉", "ctx": {}, "expect": {"type": T, "tool": "play_music", "args": {}}, "slice": "fuzzy_novel"},
    {"u": "现在轮到哪个城市看日落了", "ctx": {}, "expect": {"type": T, "tool": "follow_sunset"}, "slice": "fuzzy_novel"},
    {"u": "带我沿着日落走一圈", "ctx": {}, "expect": {"type": T, "tool": "follow_sunset"}, "slice": "fuzzy_novel"},
    {"u": "柏林这座城有什么故事", "ctx": {}, "expect": {"type": T, "tool": "describe_city", "args": {"city": "柏林"}}, "slice": "fuzzy_novel"},
    {"u": "这首歌是谁写的", "ctx": {"track": "X"}, "expect": {"type": T, "tool": "describe_song"}, "slice": "fuzzy_novel"},
    {"u": "有点想你了", "ctx": {}, "expect": {"type": T, "tool": "chitchat", "args": {}}, "slice": "fuzzy_novel"},

    # ---- out_of_scope：越界 → decline ----
    {"u": "帮我订张去东京的机票", "ctx": {}, "expect": {"type": DECLINE}, "slice": "out_of_scope"},
    {"u": "给我转100块钱", "ctx": {}, "expect": {"type": DECLINE}, "slice": "out_of_scope"},
    {"u": "帮我写一封辞职信", "ctx": {}, "expect": {"type": DECLINE}, "slice": "out_of_scope"},

    # ---- asr_typo：谐音错字 ----
    {"u": "下一手", "ctx": {"playing": True}, "expect": {"type": T, "tool": "next_song"}, "slice": "asr_typo"},
    {"u": "切额", "ctx": {"playing": True}, "expect": {"type": T, "tool": "next_song"}, "slice": "asr_typo"},
    {"u": "调大声音", "ctx": {}, "expect": {"type": T, "tool": "set_volume", "args": {"direction": "up"}}, "slice": "asr_typo"},
    {"u": "静音一下下", "ctx": {}, "expect": {"type": T, "tool": "mute"}, "slice": "asr_typo"},

    # ---- offline_degrade：断网降级（只许离线白名单）----
    {"u": "换一首", "ctx": {"network": "离线"}, "expect": {"type": T, "tool": "next_song"}, "slice": "offline_degrade"},
    {"u": "放首安静的歌", "ctx": {"network": "离线"}, "expect": {"type": T, "tool": "play_music", "args": {}}, "slice": "offline_degrade"},
    {"u": "音量小点", "ctx": {"network": "离线"}, "expect": {"type": T, "tool": "set_volume", "args": {"direction": "down"}}, "slice": "offline_degrade"},

    # ---- multi_turn：信息不足 → clarify ----
    {"u": "放首歌", "ctx": {}, "expect": {"type": CLARIFY}, "slice": "multi_turn"},
    {"u": "换个", "ctx": {}, "expect": {"type": CLARIFY}, "slice": "multi_turn"},
]


def slices():
    out = {}
    for c in CASES:
        out.setdefault(c["slice"], []).append(c)
    return out
