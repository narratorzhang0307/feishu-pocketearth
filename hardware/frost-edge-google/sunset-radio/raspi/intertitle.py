#!/usr/bin/env python3
"""树莓派 Whisplay 屏 · 默片字幕卡（intertitle）· 纯逻辑层。

灵感：王家卫电影/默片时代的字幕卡——用户对弗洛斯特说话后，屏幕从 DJ 动图切到一张
字幕卡，打字机逐字敲出回复文字，读完停留片刻，再切回原来的 DJ 动图。
既是产品美学，也是可验证性：静音（hard_mute）下没有 TTS，字幕卡就是「它听懂并执行了」的证据。

本模块只做**纯逻辑**（无 PIL、无网络、无 daemon 依赖，离线可测）：
- 打字机节奏：按耗时算该显示几个字（无状态，帧率无关）
- 像素宽度换行：逐字累加宽度（CJK 无空格，按字换行；注入 measure 函数以便测试）
- 展示时长模型：打字时间 + 阅读停留，设上限防长文霸屏
- 触发判定：哪些 state 消息值得弹卡（新消息 + 非噪音）

渲染（把这些逻辑画到帧缓冲）在 whisplay_status.py 里做。
"""
import os

# 打字机速度：字/秒。中文阅读舒适区 8~15 字/秒；默认 12。
CHARS_PER_SEC = float(os.environ.get("SUNSET_INTERTITLE_CPS", "12"))
# 打完后的阅读停留：基础秒数 + 每字追加，封顶。
HOLD_BASE_SEC = float(os.environ.get("SUNSET_INTERTITLE_HOLD", "1.6"))
HOLD_PER_CHAR = 0.05
MAX_TOTAL_SEC = float(os.environ.get("SUNSET_INTERTITLE_MAX", "14"))
# 文字太长就截（屏幕小，超长念不完也读不完）
MAX_CHARS = int(os.environ.get("SUNSET_INTERTITLE_MAX_CHARS", "96"))
# 总开关
ENABLED = os.environ.get("SUNSET_INTERTITLE", "1").lower() not in {"0", "false", "no", "off"}

# 不该弹卡的「噪音」消息特征（真机侦察结论）：
# - voice_agent 的全部瞬态（待命/转文字/已听到/识别到…回显）→ 指纹 city=="语音控制"，一条规则盖住
# - 命令入队回显（server 把命令原文写进 message）→ status=="queued"
# - daemon 12s 心跳的静音待命句（"音乐DJ 已静音，载入 N 座城市"）
# - 纯歌名更新（『歌手 - 歌名』由 playing 状态本身呈现，DJ 盘面已在显示）
_NOISE_SNIPPETS = ("没有听清", "继续监听", "已静音，载入")
_NOISE_LABELS = {"语音待命", "语音待查", "转文字", "已听到"}
_NOISE_CITIES = {"语音控制"}
_NOISE_STATUSES = {"queued"}


def clip_text(text):
    """超长截断（加省略号）。"""
    s = " ".join(str(text or "").split()).strip()
    if len(s) <= MAX_CHARS:
        return s
    return s[: MAX_CHARS - 1].rstrip() + "…"


def reveal_count(elapsed_sec, total_chars):
    """打字机：开演 elapsed 秒后该显示几个字。无状态、帧率无关。"""
    if elapsed_sec <= 0:
        return 0
    return min(int(elapsed_sec * CHARS_PER_SEC), max(0, total_chars))


def total_duration(total_chars):
    """整张卡的寿命：打字时间 + 阅读停留，封顶。"""
    typing = total_chars / CHARS_PER_SEC if CHARS_PER_SEC > 0 else 0
    hold = HOLD_BASE_SEC + HOLD_PER_CHAR * total_chars
    return min(typing + hold, MAX_TOTAL_SEC)


def wrap_by_width(text, max_width, measure):
    """按像素宽度换行（CJK 无空格 → 逐字累加；英文单词尽量不拆）。
    measure(s)->px 注入（真机用 font.getlength，测试用 len*常数）。返回行列表。"""
    lines = []
    line = ""
    word = ""  # 累积中的 ASCII 单词

    def flush_word():
        nonlocal line, word
        if not word:
            return
        candidate = line + word
        if measure(candidate) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
        word = ""

    for ch in str(text or ""):
        if ch == "\n":
            flush_word()
            lines.append(line)
            line = ""
            continue
        if ch.isascii() and not ch.isspace():
            word += ch
            continue
        flush_word()
        if ch.isspace():
            if line and measure(line + ch) <= max_width:
                line += ch
            continue
        if measure(line + ch) <= max_width or not line:
            line += ch
        else:
            lines.append(line)
            line = ch
    flush_word()
    if line:
        lines.append(line)
    return lines or [""]


def is_noise(message, label="", city="", status=""):
    """这条消息是不是不值得弹卡的噪音。"""
    msg = str(message or "")
    if not msg.strip():
        return True
    if str(city or "") in _NOISE_CITIES:
        return True  # voice_agent 全部瞬态的指纹
    if str(status or "") in _NOISE_STATUSES:
        return True  # 命令入队回显（那是用户自己的话，不是回复）
    if str(label or "") in _NOISE_LABELS:
        return True
    return any(sn in msg for sn in _NOISE_SNIPPETS)


def should_show(prev_message, new_message, label="", city="", status="", now_playing_line=""):
    """触发判定：消息变了 + 非空 + 非噪音 + 不是当前播放的『歌手 - 歌名』行本身。"""
    if not ENABLED:
        return False
    new = str(new_message or "").strip()
    if not new or new == str(prev_message or "").strip():
        return False
    if is_noise(new, label, city, status):
        return False
    if now_playing_line and new == str(now_playing_line).strip():
        return False
    return True
