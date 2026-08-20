#!/usr/bin/env python3
"""letter_writer 离线自测：模板信可用且确定、LLM 注入与失败降级、文体禁忌、字段契约、截断保护。"""
import letter_writer


CONTEXT = {
    "no": 1,
    "nowTs": 1751980000,
    "atIso": "2026-07-08T19:32",
    "daysAlive": 3,
    "city": {"cityNameZh": "里斯本", "slug": "lisbon", "sunsetClock": "20:52"},
    "weatherLine": "24°C 晴，几乎无云。",
    "track": {"id": "t1", "title": "Saudade", "artist": "Amália"},
    "homeEvents": [{"t": "15:02", "kind": "touch", "text": "被摸了摸头"}],
    "homeLight": "dim",
}


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    # ---- 离线模板：不注入 LLM 也有信，且确定性 ----
    letter = letter_writer.compose_letter(CONTEXT)
    again = letter_writer.compose_letter(CONTEXT)
    check("fallback_used", letter["source"] == "fallback")
    check("deterministic", letter["body"] == again["body"])
    body = letter["body"]
    check("data_first", body.startswith("里斯本，当地 20:52 日落。"))
    check("novel_homage", "过程和日出一样，方向相反" in body)
    check("track_mentioned", "Saudade" in body and "Amália" in body)
    check("home_mentioned", "被摸了摸头" in body)
    check("signed", body.rstrip().endswith("—— 弗洛斯特"))
    check("letter_no", "第 1 封信" in body)

    # ---- 文体禁忌：模板信自身不许违禁 ----
    check("no_banned_pattern", "不是" not in body or "而是" not in body)
    check("no_exclaim_run", "！！" not in body)
    check("no_markdown", "```" not in body and "**" not in body)

    # ---- 字段契约：手机信箱要渲染的字段一个不缺 ----
    for key in ("id", "at", "no", "city", "slug", "sunsetClock", "weather", "track", "body", "source"):
        check(f"has_{key}", key in letter)
    check("track_shape", set(letter["track"]) == {"id", "title", "artist"})

    # ---- LLM 注入：正常返回则采用，并补落款/去 markdown ----
    fake = lambda system, prompt: "里斯本，当地 20:52 日落。**云量 12%。**我带回一首歌。"
    llm_letter = letter_writer.compose_letter(CONTEXT, llm=fake)
    check("llm_used", llm_letter["source"] == "llm")
    check("llm_markdown_stripped", "**" not in llm_letter["body"])
    check("llm_signed", llm_letter["body"].rstrip().endswith("—— 弗洛斯特"))

    # ---- LLM 抛异常 / 返回空：安全落回模板 ----
    def boom(system, prompt):
        raise RuntimeError("network down")

    check("llm_error_falls_back", letter_writer.compose_letter(CONTEXT, llm=boom)["source"] == "fallback")
    check("llm_empty_falls_back", letter_writer.compose_letter(CONTEXT, llm=lambda s, p: "")["source"] == "fallback")

    # ---- 截断保护 ----
    long_letter = letter_writer.compose_letter(CONTEXT, llm=lambda s, p: "字" * 2000)
    check("body_bounded", len(long_letter["body"]) <= letter_writer.BODY_MAX_CHARS + 20)

    # ---- 成长曲线：三档提示语不同 ----
    p1 = letter_writer.build_prompt({**CONTEXT, "no": 1})
    p8 = letter_writer.build_prompt({**CONTEXT, "no": 8})
    p30 = letter_writer.build_prompt({**CONTEXT, "no": 30})
    check("stage_early", "几乎只会度量" in p1)
    check("stage_middle", "比喻" in p8)
    check("stage_warm", "想念" in p30)

    # ---- 无家事上下文时用光线兜底；全无则不写空行 ----
    bare = dict(CONTEXT, homeEvents=[], homeLight="dark")
    check("light_fallback", "很暗" in letter_writer.compose_letter(bare)["body"])
    none_home = dict(CONTEXT, homeEvents=[], homeLight="")
    check("no_empty_home_line", "离开前" not in letter_writer.compose_letter(none_home)["body"])

    # ---- DJ 稿模式：track 带 introText 时，正文=真实日落+天气开头 + DJ 稿 + 落款，去星号 ----
    script_ctx = dict(
        CONTEXT,
        weatherLine="24°C 晴，几乎无云。 当地日落约 20:52。",
        track={"id": "t1", "title": "Saudade", "artist": "Amália",
               "introText": "*Amália* 是法多的化身。\n\n这首 **Saudade** 讲的是里斯本的乡愁。\n## 尾段\n潮水退去，灯还亮着。"},
    )
    dj = letter_writer.compose_letter(script_ctx)
    dj_body = dj["body"]
    check("dj_source", dj["source"] == "dj-script")
    check("dj_opens_sunset", dj_body.startswith("里斯本日落 20:52，"))
    check("dj_no_double_sunset", dj_body.count("日落") >= 1 and "当地日落约" not in dj_body.split("\n")[0])
    check("dj_script_used", "法多的化身" in dj_body and "潮水退去" in dj_body)
    check("dj_stars_stripped", "*" not in dj_body and "#" not in dj_body)
    check("dj_signed", dj_body.rstrip().endswith("—— 弗洛斯特"))
    check("dj_no_llm_needed", letter_writer.compose_letter(script_ctx, llm=boom)["source"] == "dj-script")
    check("dj_track_shape", set(dj["track"]) == {"id", "title", "artist"})  # introText 不落盘
    # 无稿仍回落模板（向后兼容）
    check("no_intro_still_fallback", letter_writer.compose_letter(CONTEXT)["source"] == "fallback")
    # 超长稿截断
    long_ctx = dict(script_ctx, track={**script_ctx["track"], "introText": "词" * 5000})
    check("dj_bounded", len(letter_writer.compose_letter(long_ctx)["body"]) <= letter_writer.SCRIPT_MAX_CHARS + 80)

    if failures:
        print("LETTER WRITER SMOKE FAILED:", ", ".join(failures))
        return 1
    print("LETTER WRITER SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
