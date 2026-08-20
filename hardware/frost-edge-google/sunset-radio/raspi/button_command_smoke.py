#!/usr/bin/env python3
import contextlib
import io
import json
import os
import sys
import tempfile

import button_command
import button_events


def run_cli(args, fake_result):
    posted = []

    def fake_post(text, source="button"):
        posted.append({"text": text, "source": source})
        return dict(fake_result)

    original_argv = sys.argv
    original_post = button_command.post_command
    try:
        sys.argv = ["button_command.py"] + args
        button_command.post_command = fake_post
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = button_command.main()
        output = json.loads(stdout.getvalue())
        return {"code": code, "posted": posted, "output": output}
    finally:
        sys.argv = original_argv
        button_command.post_command = original_post


def main():
    original_events_path = button_events.EVENTS_PATH
    original_latest_path = button_events.LATEST_PATH
    try:
        with tempfile.TemporaryDirectory(prefix="sunset-button-command-") as tmp:
            button_events.EVENTS_PATH = os.path.join(tmp, "button-events.jsonl")
            button_events.LATEST_PATH = os.path.join(tmp, "button-latest.json")

            ok_case = run_cli(["--source", "pisugar", "--event", "double", "换个城市"], {"ok": True})
            ok_latest = button_events.load_latest()
            ok_recent = button_events.load_recent(10)

            fail_case = run_cli(["--source", "pisugar", "--event", "single", "下一首"], {"ok": False})
            fail_latest = button_events.load_latest()
    finally:
        button_events.EVENTS_PATH = original_events_path
        button_events.LATEST_PATH = original_latest_path

    cases = [
        {
            "name": "successful command posts as button source",
            "passed": ok_case["code"] == 0
            and ok_case["posted"] == [{"text": "换个城市", "source": "button"}],
        },
        {
            "name": "successful command records queued and posted events",
            "passed": len(ok_recent) == 2
            and ok_latest.get("event") == "double"
            and ok_latest.get("action") == "换个城市"
            and (ok_latest.get("detail") or {}).get("ok") is True,
        },
        {
            "name": "failed command returns nonzero",
            "passed": fail_case["code"] == 1 and fail_case["output"].get("ok") is False,
        },
        {
            "name": "failed command records failed posted event",
            "passed": fail_latest.get("event") == "single"
            and fail_latest.get("action") == "下一首"
            and (fail_latest.get("detail") or {}).get("ok") is False,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
