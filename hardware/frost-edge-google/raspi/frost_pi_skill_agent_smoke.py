#!/usr/bin/env python3
"""Offline checks for the Google-edition Frost Edge skill router."""

import json

import frost_pi_skill_agent as agent


def main() -> int:
    names = [skill["name"] for skill in agent.SKILLS]
    assert len(names) == len(set(names))
    assert {"open_podcast", "open_earth_answer", "public_knowledge"} <= set(names)

    expected = {
        "换一首吧": "next_track",
        "别放了": "pause",
        "打开口袋播客": "open_podcast",
        "今天的地球答案": "open_earth_answer",
        "现在播什么": "music_now_playing",
        "播报今日公共知识": "public_knowledge",
    }
    for text, skill in expected.items():
        assert agent.decide(text)["skill"] == skill

    gemma_router = lambda system, prompt: '{"skill":"open_podcast","args":{},"reply":"好"}'
    assert agent.decide("听今天的内容", brain_fn=gemma_router)["skill"] == "open_podcast"
    hallucinated = lambda system, prompt: '{"skill":"send_private_key","args":{}}'
    assert agent.decide("换歌", brain_fn=hallucinated)["skill"] == "next_track"

    music = agent.route("现在播什么", context={"track": {"title": "Midnight City", "artist": "Frost Radio", "city": "杭州"}})
    assert music["event"]["kind"] == "music_now_playing"

    context = {
        "title": "Gemma 3n E2B 端侧推理",
        "body": "Gemma 3n 可在日常设备上运行；完整证据请查看来源。",
        "sourceUrls": ["https://ai.google.dev/gemma/docs/gemma-3n", "https://ai.google.dev/edge/litert"],
        "truthScore": 86,
        "verdict": "review_required",
    }
    knowledge = agent.route("今日公共知识", context=context)
    assert knowledge["event"]["kind"] == "public_knowledge_brief"
    assert len(knowledge["event"]["sourceUrls"]) == 2
    assert json.loads(agent.to_json_line(knowledge))["truthScore"] == 86
    assert not agent.route("今日公共知识", context={"sourceUrls": ["https://example.com/one"]})["ok"]

    posted, emitted = [], []
    assert agent.apply("打开口袋播客", post_command_fn=posted.append, emit_event_fn=emitted.append)
    assert posted == ["口袋播客"] and not emitted
    assert agent.apply("今日公共知识", post_command_fn=posted.append, emit_event_fn=emitted.append, context=context)
    assert emitted[0]["verdict"] == "review_required"

    try:
        agent.create_public_knowledge_event({**context, "verdict": "approved"})
    except ValueError:
        pass
    else:
        raise AssertionError("hardware skill claimed automatic approval")

    print("frost_pi_skill_agent smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
