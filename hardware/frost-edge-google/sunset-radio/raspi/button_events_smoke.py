#!/usr/bin/env python3
import json
import os
import tempfile

import button_events


def main():
    original_events_path = button_events.EVENTS_PATH
    original_latest_path = button_events.LATEST_PATH
    original_limit = button_events.EVENTS_LIMIT
    try:
        with tempfile.TemporaryDirectory(prefix="sunset-button-events-") as tmp:
            button_events.EVENTS_PATH = os.path.join(tmp, "button-events.jsonl")
            button_events.LATEST_PATH = os.path.join(tmp, "button-latest.json")
            button_events.EVENTS_LIMIT = 5
            for index in range(12):
                button_events.record_button_event(
                    f"event-{index}",
                    source="smoke",
                    action=f"action-{index}",
                )
            recent = button_events.load_recent(20)
            latest = button_events.load_latest()
            compacted = button_events.compact_button_events(5)
    finally:
        button_events.EVENTS_PATH = original_events_path
        button_events.LATEST_PATH = original_latest_path
        button_events.EVENTS_LIMIT = original_limit

    cases = [
        {
            "name": "button event log keeps configured recent limit",
            "passed": len(recent) == 5,
        },
        {
            "name": "button event log keeps newest event",
            "passed": recent[-1].get("event") == "event-11" and latest.get("event") == "event-11",
        },
        {
            "name": "manual compaction is idempotent",
            "passed": compacted.get("ok") and compacted.get("kept") == 5,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases, "latest": latest, "count": len(recent)}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
