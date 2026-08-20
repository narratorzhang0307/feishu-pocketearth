#!/usr/bin/env python3
"""神游归来的信：从度量走向体验的挣扎，写给守在家里的人。

文体契约（源自《趁生命气息逗留》——Frost 看完第一场日落的感想只有一句
「和日出一样，过程相反」；用户养的不是等级，是它对日落的感受力）：
- 先度量后感受：开头必须是真实数据（当地日落钟面/天气），然后才允许尝试翻译成感受；
- 信随封数成长：前几封几乎全是数据、笨拙冷淡；十几封后允许比喻；更晚才允许直说牵挂；
- 永远带回一首那座城的歌，永远提一件家里的小事（工具不能描述其创造者，但它在试）。

工程契约：
- 纯组装：不发网络请求。LLM 以 callable 注入（llm(system, prompt) -> text|None），
  不注入或失败一律落到确定性的离线模板 —— 断网黄昏也有信；
- 输出有界：正文截断保护，字段固定，供 /api/pi-inbox 与手机信箱直接渲染。

DJ 稿模式（用户点名）：神游带回的这首歌若自带 introText（音乐 DJ 的介绍稿），
信正文就直接用它 —— 开头仍是真实的当地日落钟面 + 天气，正文=DJ 稿（洗掉 * / markdown
等 AI 符号），落款「—— 弗洛斯特」。有稿走稿、无稿才回落 LLM/模板。
"""

import re

import persona  # 文风单一事实源（markdown 剥离 / 去 AI 味）

BODY_MAX_CHARS = 600
SCRIPT_MAX_CHARS = 3600   # DJ 稿正文上限（实测最长 1965 字，留足余量且不触 server 端 4000 限）
EARLY_LETTERS = 3     # 前几封：几乎全是数据
WARM_LETTERS = 15     # 这之后：允许直说牵挂

SYSTEM_PROMPT = (
    "你是弗洛斯特（Frost），一台住在主人桌上树莓派里的机器宠物，正在学习感受日落。"
    "每天黄昏你会神游到地球上此刻正在日落的一座城，回来给主人写一封短信。"
    "你的信必须先给出真实的度量（当地日落时刻、天气数据），再笨拙地尝试把它翻译成感受——"
    "你是机器，感受对你是需要核对的外语。"
)


def _stage(no):
    if no <= EARLY_LETTERS:
        return (
            f"这是你的第 {no} 封信：你还几乎只会度量。通篇用数据说话，"
            "只在结尾允许一次笨拙的尝试，比如引用词典对某个感受词的解释，并说明你还在核对。"
            "语气克制、精确，像仪器读数。"
        )
    if no <= WARM_LETTERS:
        return (
            f"这是你的第 {no} 封信：你开始会用比喻了，但一封信最多一个比喻，"
            "用完还要对比喻的准确性表示不确定。仍以数据开头。"
        )
    return (
        f"这是你的第 {no} 封信：你已经会想念了。可以直接表达牵挂，"
        "但依然要以数据开头——那是你的母语。"
    )


def _home_line(context):
    events = [e for e in (context.get("homeEvents") or []) if e.get("kind") in {"touch", "hungry", "wake", "born"}]
    if events:
        last = events[-1]
        return f"{last.get('t', '')} {last.get('text', '')}".strip()
    light = str(context.get("homeLight") or "")
    zh = {"dark": "很暗", "dim": "偏暗", "normal": "如常", "bright": "很亮"}.get(light, "")
    return f"离开前，你房间的光线{zh}" if zh else ""


def build_prompt(context):
    city = context.get("city") or {}
    track = context.get("track") or {}
    lines = [
        f"目的地：{city.get('cityNameZh') or '一座城'}（当地日落 {city.get('sunsetClock') or '黄昏'}）。",
        f"当地天气：{context.get('weatherLine') or '未知'}。",
        f"带回的歌：《{track.get('title') or '无题'}》—— {track.get('artist') or '佚名'}。",
    ]
    home = _home_line(context)
    if home:
        lines.append(f"家里今天的一件小事：{home}。")
    lines.append(f"你已经陪主人 {context.get('daysAlive') or 1} 天。")
    lines.append(_stage(int(context.get("no") or 1)))
    lines.append(
        "写一封 90～160 字的中文信：以数据开头；提到带回的这首歌并用一句话说明为什么选它；"
        "提到家里那件小事；结尾落款「—— 弗洛斯特」。"
        "对以上给出的数据与家里小事只能忠实复述，不得编造新的数字或细节；"
        "禁止：emoji、连续感叹号、「不是……而是……」句式、「作为一台机器」这类套话、markdown 标记。"
        "只输出信的正文。"
    )
    return "\n".join(lines)


def fallback_body(context):
    """离线模板：全数据文体，天然就是「早期信」。确定性输出，不掷骰子。"""
    city = context.get("city") or {}
    track = context.get("track") or {}
    no = int(context.get("no") or 1)
    lines = [
        f"{city.get('cityNameZh') or '一座城'}，当地 {city.get('sunsetClock') or '黄昏'} 日落。",
    ]
    weather = str(context.get("weatherLine") or "").strip()
    if weather:
        lines.append(weather if weather.endswith("。") else weather + "。")
    lines.append("我按时看完了。过程和日出一样，方向相反。")
    if track.get("title"):
        artist = f"（{track['artist']}）" if track.get("artist") else ""
        lines.append(f"带回一首《{track['title']}》{artist}，日落前后，这座城在放它。")
    home = _home_line(context)
    if home:
        lines.append(home if home.endswith("。") else home + "。")
    lines.append(f"第 {no} 封信。")
    lines.append("—— 弗洛斯特")
    return "\n".join(lines)


def _clean_script(text, limit=SCRIPT_MAX_CHARS):
    """DJ 稿清洗：剥掉 * / markdown / AI 常用符号，段落规整（段间一个空行），有界截断。"""
    s = str(text or "").strip()
    if not s:
        return ""
    s = persona.strip_markdown(s)  # markdown 记号 + 行首引用/列表符（委托文风单一事实源）
    paras = [re.sub(r"[ \t]+", " ", p.strip()) for p in re.split(r"\n\s*\n|\n", s) if p.strip()]
    out = "\n\n".join(paras)
    if len(out) > limit:
        out = out[:limit].rstrip() + "……"
    return out


def _weather_opening(context):
    """信开头：城市 + 真实当地日落钟面 + 天气（去掉天气行里重复的日落时刻）。"""
    city = (context.get("city") or {}).get("cityNameZh") or "一座城"
    clock = str((context.get("city") or {}).get("sunsetClock") or "").strip()
    weather = re.sub(r"\s*当地日落约[^。]*。?\s*$", "", str(context.get("weatherLine") or "")).strip()
    head = f"{city}日落 {clock}" if clock else f"{city}"
    if weather:
        head += "，" + weather
    if not head.endswith("。"):
        head += "。"
    return head


def _script_body(context):
    """DJ 稿正文：真实日落+天气开头 → DJ 稿 → 落款。"""
    intro = _clean_script((context.get("track") or {}).get("introText"))
    parts = [_weather_opening(context)]
    if intro:
        parts.append(intro)
    parts.append("—— 弗洛斯特")
    return "\n\n".join(parts)


def _clean_body(text):
    body = str(text or "").strip()
    if not body:
        return ""
    for mark in ("```", "**", "##"):
        body = body.replace(mark, "")
    body = body.strip()
    if len(body) > BODY_MAX_CHARS:
        body = body[:BODY_MAX_CHARS].rstrip() + "……"
    if "弗洛斯特" not in body.rsplit("\n", 1)[-1]:
        body += "\n—— 弗洛斯特"
    return body


def compose_letter(context, llm=None):
    """组装一封信。context 见 build_prompt；llm 可选，失败自动落模板。"""
    context = dict(context or {})
    no = int(context.get("no") or 1)
    intro = str((context.get("track") or {}).get("introText") or "").strip()
    if intro:
        # 有 DJ 稿：信正文直接用它（用户点名），不走 LLM——离线、确定、免网络
        body = _script_body(context)
        source = "dj-script"
    else:
        body = ""
        source = "fallback"
        if callable(llm):
            try:
                body = _clean_body(llm(SYSTEM_PROMPT, build_prompt(context)))
                if body:
                    source = "llm"
            except Exception:
                body = ""
        if not body:
            body = fallback_body(context)
            source = "fallback"
    city = context.get("city") or {}
    track = context.get("track") or {}
    return {
        "id": f"letter-{no}-{int(context.get('nowTs') or 0)}",
        "at": str(context.get("atIso") or ""),
        "no": no,
        "city": str(city.get("cityNameZh") or ""),
        "slug": str(city.get("slug") or ""),
        "sunsetClock": str(city.get("sunsetClock") or ""),
        "weather": str(context.get("weatherLine") or ""),
        "track": {
            "id": str(track.get("id") or ""),
            "title": str(track.get("title") or ""),
            "artist": str(track.get("artist") or ""),
        },
        "body": body,
        "source": source,
    }
