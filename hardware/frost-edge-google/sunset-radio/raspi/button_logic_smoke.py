#!/usr/bin/env python3
import argparse
import json
import os
import tempfile
import time

import button_events
import whisplay_status


def reset_button_state():
    if whisplay_status.button_single_timer:
        whisplay_status.button_single_timer.cancel()
    whisplay_status.button_pressed_at = 0.0
    whisplay_status.button_click_count = 0
    whisplay_status.button_click_generation = 0
    whisplay_status.button_single_timer = None


def press_for(seconds):
    whisplay_status.on_button_press()
    time.sleep(seconds)
    whisplay_status.on_button_release()


def run_case(name, gesture):
    commands = []

    def capture_command(text, source="button"):
        commands.append({"text": text, "source": source})

    original_post = whisplay_status.post_command
    original_double = whisplay_status.DOUBLE_CLICK_SEC
    original_long = whisplay_status.LONG_PRESS_SEC
    try:
        reset_button_state()
        whisplay_status.post_command = capture_command
        # Keep the smoke timing close to the real Whisplay values while leaving
        # enough gap for parallel heartbeat checks to deschedule synthetic taps.
        whisplay_status.DOUBLE_CLICK_SEC = 0.42
        whisplay_status.LONG_PRESS_SEC = 0.8

        if gesture == "single":
            press_for(0.01)
            time.sleep(0.52)
            expected = ["下一首"]
        elif gesture == "double":
            press_for(0.01)
            time.sleep(0.05)
            press_for(0.01)
            time.sleep(0.52)
            expected = ["换个城市"]
        elif gesture == "long":
            press_for(0.9)
            time.sleep(0.05)
            expected = ["切换声音"]
        else:
            raise ValueError(f"unknown gesture: {gesture}")

        actual = [item["text"] for item in commands]
        sources = [item["source"] for item in commands]
        expected_sources = ["button" for _ in expected]
        return {
            "name": name,
            "ok": actual == expected and sources == expected_sources,
            "expected": expected,
            "actual": actual,
            "expectedSources": expected_sources,
            "actualSources": sources,
        }
    finally:
        whisplay_status.post_command = original_post
        whisplay_status.DOUBLE_CLICK_SEC = original_double
        whisplay_status.LONG_PRESS_SEC = original_long
        reset_button_state()


def main():
    parser = argparse.ArgumentParser(description="Offline smoke test for Whisplay orange button gesture mapping.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        button_events.EVENTS_PATH = os.path.join(tmp, "button-events.jsonl")
        button_events.LATEST_PATH = os.path.join(tmp, "button-latest.json")
        cases = [
            run_case("single press queues next song", "single"),
            run_case("double press queues next city", "double"),
            run_case("long press queues radio power", "long"),
        ]
        latest = button_events.load_latest()
        recent = button_events.load_recent(20)

    event_ok = (
        latest.get("event") == "long"
        and latest.get("action") == "切换声音"
        and len(recent) >= 14
    )
    report = {
        "ok": all(case["ok"] for case in cases) and event_ok,
        "cases": cases,
        "latest": latest,
        "eventCount": len(recent),
        "eventLogOk": event_ok,
    }
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        status = "ok" if report["ok"] else "failed"
        print(f"button logic smoke {status}")
        for case in cases:
            print(f"- {case['name']}: {'ok' if case['ok'] else 'failed'}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
