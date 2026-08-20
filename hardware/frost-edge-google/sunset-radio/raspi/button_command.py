#!/usr/bin/env python3
import argparse
import json
import os
import urllib.request

from button_events import record_button_event


API_BASE = os.environ.get("SUNSET_API", "http://127.0.0.1:8080").rstrip("/")


def post_command(text, source="button"):
    payload = json.dumps({"text": text, "source": source}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{API_BASE}/api/pi-control",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=4) as response:
        body = response.read().decode("utf-8")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {"ok": True, "raw": body}


def main():
    parser = argparse.ArgumentParser(description="Log a hardware button event and queue the mapped Pi command.")
    parser.add_argument("text", nargs="+", help="Command text to send.")
    parser.add_argument("--event", default="shortcut", help="Button event name, e.g. single or double.")
    parser.add_argument("--source", default="pisugar", help="Physical source name.")
    args = parser.parse_args()

    text = " ".join(args.text).strip()
    record_button_event(args.event, source=args.source, action=text, detail={"phase": "queued"})
    result = post_command(text, "button")
    ok = bool(result.get("ok", True))
    record_button_event(args.event, source=args.source, action=text, detail={"phase": "posted", "ok": ok})
    print(json.dumps({"ok": ok, "text": text, "result": result}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
