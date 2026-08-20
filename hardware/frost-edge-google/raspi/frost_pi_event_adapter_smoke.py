#!/usr/bin/env python3
"""Offline checks for the Google-edition public-event adapter."""

import json
import subprocess
import sys
from pathlib import Path

import frost_pi_event_adapter as adapter


def main() -> int:
    events = [
        {
            "version": "0.1.0",
            "kind": "music_now_playing",
            "source": "music-agent",
            "state": "busy",
            "priority": "normal",
            "title": "Midnight City",
            "body": "Frost Radio · 杭州",
            "speak": "Frost 正在播放 Midnight City。",
            "track": {"title": "Midnight City", "artist": "Frost Radio", "city": "杭州"},
            "createdAt": "2026-07-19T00:00:00.000Z",
        },
        {
            "version": "0.1.0",
            "kind": "public_knowledge_brief",
            "source": "pocket-earth-google-knowledge",
            "state": "attention",
            "priority": "normal",
            "title": "Gemma 3n E2B 端侧推理",
            "body": "请在文字模式查看完整来源与人工审核状态。",
            "speak": "有一条关于端侧 Gemma 的公共知识等待复核。",
            "sourceUrls": ["https://ai.google.dev/gemma/docs/gemma-3n", "https://ai.google.dev/edge/litert"],
            "truthScore": 86,
            "verdict": "review_required",
            "createdAt": "2026-07-19T00:00:01.000Z",
        },
        {
            "version": "0.1.0",
            "kind": "buddy_status",
            "source": "frost-edge",
            "state": "idle",
            "priority": "normal",
            "title": "Frost Edge",
            "body": "本地待机",
            "createdAt": "2026-07-19T00:00:02.000Z",
        },
    ]

    for event in events:
        parsed = adapter.load_event(json.dumps(event, ensure_ascii=False))
        actions = adapter.event_to_actions(parsed)
        types = [item["type"] for item in actions]
        assert types[0] == "state" and types[-1] == "display"
        for action in actions:
            assert json.loads(adapter.action_to_json_line(action))["version"] == adapter.ACTION_VERSION

    knowledge_actions = adapter.event_to_actions(events[1])
    display = next(item for item in knowledge_actions if item["type"] == "display")
    assert display["truthScore"] == 86
    assert display["verdict"] == "review_required"
    assert len(display["sourceUrls"]) == 2

    for bad in [
        {**events[1], "apiKey": "AIza-test"},
        {**events[1], "body": "leak PRIVATE_KEY"},
        {**events[1], "kind": "chain_dispatch"},
    ]:
        try:
            adapter.load_event(json.dumps(bad))
        except ValueError:
            pass
        else:
            raise AssertionError("unsafe or obsolete event was accepted")

    proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("frost_pi_event_adapter.py"))],
        input=json.dumps(events[1], ensure_ascii=False) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )
    assert [json.loads(line)["type"] for line in proc.stdout.splitlines()] == ["state", "tts", "display"]
    assert not proc.stderr.strip()
    print("frost_pi_event_adapter smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
