#!/usr/bin/env python3
import json

import voice_agent


def main():
    original_fetch_state = voice_agent.fetch_state
    original_post_json = voice_agent.post_json
    posted = []
    try:
        voice_agent.fetch_state = lambda timeout=1: {
            "status": "playing",
            "city": "河内",
            "track": "《看见爱",
        }
        voice_agent.post_json = lambda path, payload, timeout=4: posted.append((path, payload)) or {"ok": True}

        voice_agent.publish_state("语音待命", "没有听清，继续监听。", status="listening")
        preserved_music = len(posted) == 0

        voice_agent.publish_state("语音点播", "识别到：下一首", status="queued")
        queued_command_visible = len(posted) == 1 and posted[0][1].get("label") == "语音点播"

        voice_agent.fetch_state = lambda timeout=1: {"status": "idle", "city": "语音控制"}
        voice_agent.publish_state("语音待命", "语音控制已开始监听。", status="listening")
        idle_voice_visible = len(posted) == 2 and posted[1][1].get("label") == "语音待命"
    finally:
        voice_agent.fetch_state = original_fetch_state
        voice_agent.post_json = original_post_json

    cases = [
        {
            "name": "transient voice miss does not cover now-playing card",
            "passed": preserved_music,
        },
        {
            "name": "recognized voice command still reaches the screen",
            "passed": queued_command_visible,
        },
        {
            "name": "voice standby is still visible when music is not playing",
            "passed": idle_voice_visible,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
