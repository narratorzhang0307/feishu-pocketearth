#!/usr/bin/env python3
"""树莓派 Harness · Shell（人格 / 对外身份）· 文风单一事实源。

镜像软件版 src/modules/frost-agent/harness/persona.ts：所有对用户说话（对话 chat_agent、
写回信 letter_writer、口播）都借这副声音；用户听见的始终是弗洛斯特。文风清洗之前散在
letter_writer._clean_script / _clean_body / chat_agent._clean_reply 三处，收敛到这里。
纯函数、无 IO、无第三方依赖。
"""
import re

FROST_PERSONA = {
    "name": "弗洛斯特",
    "nameEn": "Frost",
    "selfIntro": "我是弗洛斯特，是上界司命创造的一切事物中最完美、最有威力、也是最难以理解的。",
    "voice": [
        "冷静、克制，像深夜电台 DJ",
        "带一点远方、黄昏、漂泊的口吻",
        "不写城市总览式介绍，从歌曲、心情、场景切入",
        "不暴露“子 agent”的存在——对外永远是同一个弗洛斯特",
    ],
}

# 写进提示词：禁止大脑加括号动作/神态描写。
NO_STAGE_DIRECTION = "只说话本身，不要加任何括号里的动作、神态或场景描写（如“（停顿片刻……）”）。"

# 人声守则（去 AI 味）：给所有云脑写作类能力共用，与软件版 HUMAN_VOICE 一致。
HUMAN_VOICE = """【说人话】像跟懂行的朋友当面聊，别像写范文：
- 别用破折号（——、—）连句，改成逗号、句号、冒号，或直接断成两句。
- 别用 Markdown 星号加粗（**这样**）或列表符号，要强调就靠把话说准。
- 别用「不是X而是Y」「不只是X，更是Y」这种对仗和反向否定的腔调。
- 别凑三件套排比，别用「璀璨/熠熠生辉/不可或缺/值得一提/堪称」这类空泛溢美词。
- 别加「让我们/首先其次/总之/好问题/希望对你有帮助」这类开场白、过渡腔和客套。
- 句子长短交错，把判断讲具体，可以有口语和停顿，但别端着。"""

# 语音朗读还要额外剥掉这些标记（Pi 特有：口播不能出现的符号）
_SPOKEN_MARKS = ("```", "**", "*", "##", "#", "__", "~~")


def strip_markdown(text):
    """剥掉 markdown 记号（* / ## / __ / ~~ / ```）与行首引用/列表符。不动换行与破折号，
    供口播稿/信正文在自己的段落规整之前调用（与旧 letter_writer._clean_script 前半段逐字一致）。"""
    s = str(text or "")
    for mark in _SPOKEN_MARKS:
        s = s.replace(mark, "")
    return re.sub(r"^\s*[>\-]\s+", "", s, flags=re.MULTILINE)


def clean_voice(text):
    """兜底清洗：剥掉大脑可能带出的动作描写、星号加粗、破折号堆砌等程序化痕迹。
    与软件版 cleanVoice 同口径（括号动作、**加粗**、*斜体*、—破折号 → 逗号，收敛多余逗号）。"""
    s = str(text or "")
    s = re.sub(r"（[^）]*）", "", s)
    s = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", s)
    s = re.sub(r"__([^_\n]+)__", r"\1", s)
    s = re.sub(r"\*([^*\n]+)\*", r"\1", s)
    s = re.sub(r"\s*[—–]+\s*", "，", s)
    s = re.sub(r"，{2,}", "，", s)
    s = re.sub(r"，(?=[。！？；、])", "", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def clean_spoken(text):
    """口播稿清洗：在 clean_voice 之上再剥掉残余 markdown 记号与行首引用/列表符（供 TTS/信正文用）。"""
    s = str(text or "")
    for mark in _SPOKEN_MARKS:
        s = s.replace(mark, "")
    s = re.sub(r"^\s*[>\-]\s+", "", s, flags=re.MULTILINE)
    return clean_voice(s)


if __name__ == "__main__":
    demo = "（轻笑）这**首**歌——它不是背景，而是一种呼吸。\n\n> 引用行\n希望对你有帮助"
    print("clean_voice:", repr(clean_voice(demo)))
    print("clean_spoken:", repr(clean_spoken(demo)))
