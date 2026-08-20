#!/usr/bin/env python3
import argparse
import json
import os
import time
from collections import deque


STATE_DIR = os.environ.get(
    "SUNSET_STATE_DIR",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio"),
)
EVENTS_PATH = os.environ.get("SUNSET_BUTTON_EVENTS_PATH", os.path.join(STATE_DIR, "button-events.jsonl"))
LATEST_PATH = os.environ.get("SUNSET_BUTTON_LATEST_PATH", os.path.join(STATE_DIR, "button-latest.json"))


def safe_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


EVENTS_LIMIT = max(50, safe_int(os.environ.get("SUNSET_BUTTON_EVENTS_LIMIT"), 500))


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def ensure_state_dir():
    os.makedirs(os.path.dirname(EVENTS_PATH) or ".", exist_ok=True)
    os.makedirs(os.path.dirname(LATEST_PATH) or ".", exist_ok=True)


def record_button_event(event, source="", action="", detail=None):
    payload = {
        "at": now_iso(),
        "event": str(event or ""),
        "source": str(source or ""),
        "action": str(action or ""),
        "detail": detail if isinstance(detail, dict) else {},
    }
    ensure_state_dir()
    with open(EVENTS_PATH, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    compact_button_events(EVENTS_LIMIT)
    with open(LATEST_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return payload


def load_latest():
    try:
        with open(LATEST_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def load_recent(limit=20):
    limit = max(1, min(1000, safe_int(limit, 20)))
    recent = deque(maxlen=limit)
    try:
        with open(EVENTS_PATH, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    recent.append(payload)
    except OSError:
        pass
    return list(recent)


def compact_button_events(limit=EVENTS_LIMIT):
    limit = max(1, min(1000, safe_int(limit, EVENTS_LIMIT)))
    recent = load_recent(limit)
    if len(recent) < limit:
        return {"ok": True, "path": EVENTS_PATH, "kept": len(recent), "compacted": False}
    try:
        original_count = 0
        with open(EVENTS_PATH, "r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    original_count += 1
    except OSError:
        original_count = len(recent)
    if original_count <= limit:
        return {"ok": True, "path": EVENTS_PATH, "kept": len(recent), "compacted": False}
    with open(EVENTS_PATH, "w", encoding="utf-8") as handle:
        for item in recent:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    return {"ok": True, "path": EVENTS_PATH, "kept": len(recent), "originalCount": original_count, "compacted": True}


def collect_button_events(limit=20):
    latest = load_latest()
    recent = load_recent(limit)
    return {
        "ok": True,
        "path": EVENTS_PATH,
        "latest": latest,
        "recent": recent,
        "count": len(recent),
    }


def main():
    parser = argparse.ArgumentParser(description="Read or append Sunset Radio button events.")
    parser.add_argument("--event", default="", help="Event name to append.")
    parser.add_argument("--source", default="", help="Event source.")
    parser.add_argument("--action", default="", help="Mapped command/action.")
    parser.add_argument("--limit", type=int, default=20, help="Number of recent events to print.")
    parser.add_argument("--compact", action="store_true", help="Trim the event log to the configured recent-event limit.")
    args = parser.parse_args()
    if args.event:
        payload = record_button_event(args.event, source=args.source, action=args.action)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    elif args.compact:
        print(json.dumps(compact_button_events(), ensure_ascii=False, indent=2))
    else:
        print(json.dumps(collect_button_events(args.limit), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
