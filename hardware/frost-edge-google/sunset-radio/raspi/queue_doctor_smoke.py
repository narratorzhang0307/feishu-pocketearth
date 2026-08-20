#!/usr/bin/env python3
import json
import urllib.error

import queue_doctor


def collect_with(commands=None, state=None, by_source=None, fail=False):
    commands = commands if isinstance(commands, list) else []
    state = state if isinstance(state, dict) else {"pending": len(commands), "label": "静音中"}
    by_source = by_source if isinstance(by_source, dict) else {}
    original_fetch = queue_doctor.fetch_json
    try:
        def fake_fetch(path, timeout=4):
            if fail:
                raise urllib.error.URLError("offline")
            if path.startswith("/api/pi-state"):
                return {"state": dict(state)}
            if path == "/api/pi-control":
                return {"commands": [dict(item) for item in commands]}
            if path.startswith("/api/pi-control?"):
                source = path.split("source=", 1)[-1]
                return {"commands": [dict(item) for item in by_source.get(source, [])]}
            return {}

        queue_doctor.fetch_json = fake_fetch
        return queue_doctor.collect_queue_doctor()
    finally:
        queue_doctor.fetch_json = original_fetch


def command(cid, source, text, age=1200):
    return {
        "id": cid,
        "source": source,
        "text": text,
        "ageMs": age,
        "createdAt": "2026-06-22T23:59:00Z",
    }


def main():
    clean = collect_with(commands=[], state={"pending": 0, "label": "静音中"})
    button = command("b1", "button", "下一首", 2400)
    voice = command("v1", "voice", "弗洛斯特暂停", 3200)
    unknown = command("x1", "dashboard", "status", 1800)
    busy = collect_with(
        commands=[button, voice, unknown],
        state={"pending": 3, "label": "对话待命"},
        by_source={"button": [button], "voice": [voice]},
    )
    stale_button = command("b2", "button", "换个城市", queue_doctor.STALE_MS + 1000)
    stale = collect_with(
        commands=[stale_button],
        state={"pending": 1, "label": "静音中"},
        by_source={"button": [stale_button]},
    )
    bad_payload = collect_with(
        commands=[],
        state={"pending": "not-a-number", "label": "静音中"},
        by_source={},
    )
    offline = collect_with(fail=True)

    cases = [
        {
            "name": "clean queue passes",
            "passed": clean.get("ok") is True
            and clean.get("pending") == 0
            and clean.get("unclaimedCount") == 0
            and "命令队列干净" in clean.get("message", ""),
            "detail": clean,
        },
        {
            "name": "button and voice commands are grouped without claiming",
            "passed": busy.get("ok") is False
            and busy.get("sourceCounts", {}).get("button") == 1
            and busy.get("sourceCounts", {}).get("voice") == 1
            and busy.get("unknownCount") == 1
            and "button:1" in busy.get("message", "")
            and "voice:1" in busy.get("message", "")
            and "unknown:1" in busy.get("message", ""),
            "detail": busy,
        },
        {
            "name": "stale commands are surfaced by source",
            "passed": stale.get("ok") is False
            and stale.get("checks", {}).get("noStaleCommands") is False
            and stale.get("stale", [{}])[0].get("source") == "button"
            and "button" in stale.get("message", ""),
            "detail": stale,
        },
        {
            "name": "bad pending values fall back to command count",
            "passed": bad_payload.get("pending") == 0 and bad_payload.get("ok") is True,
            "detail": bad_payload,
        },
        {
            "name": "api failure is readable and blocks unattended success",
            "passed": offline.get("ok") is False
            and offline.get("checks", {}).get("api") is False
            and "队列接口暂时不可达" in offline.get("message", ""),
            "detail": offline,
        },
    ]

    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
