#!/usr/bin/env python3
import calendar
import json
import time

import ambient_policy


NOW = calendar.timegm(time.strptime("2026-06-22T10:05:00Z", "%Y-%m-%dT%H:%M:%SZ"))

BASE_STATE = {
    "ok": True,
    "updatedAt": "2026-06-22T10:00:00Z",
    "stage": "sensor",
    "scene": "昏暗书桌",
    "summary": "室内光线变暗，活动较少。",
    "light": "dim",
    "activity": "working",
    "confidence": 0.42,
    "privacy": {"capture": "manual_only"},
}


def build(mode, memory, state=None):
    return ambient_policy.build_ambient_policy(
        state=dict(state or BASE_STATE),
        memory=dict(memory),
        mode_state={"mode": mode, "label": mode},
        previous_policy={},
        now=NOW,
    )


def main():
    single_adaptive = build(
        "adaptive",
        {"count": 1, "usableCount": 1, "dominantLight": "dim", "lightTrend": "unknown"},
    )
    manual_scan = build(
        "scan_once",
        {"count": 1, "usableCount": 1, "dominantLight": "dim", "lightTrend": "unknown"},
    )
    remembered_adaptive = build(
        "adaptive",
        {"count": 3, "usableCount": 3, "dominantLight": "dim", "lightTrend": "dimming"},
    )
    confident_adaptive = build(
        "adaptive",
        {"count": 1, "usableCount": 1, "dominantLight": "normal", "lightTrend": "unknown"},
        {**BASE_STATE, "confidence": 0.76},
    )

    cases = [
        {
            "name": "adaptive mode waits for one more confirmation on weak single signal",
            "passed": single_adaptive.get("action") == "hold_evaluate"
            and single_adaptive.get("canInterrupt") is False
            and single_adaptive.get("evaluation", {}).get("ok") is False,
        },
        {
            "name": "manual scan may tune the next block after explicit consent",
            "passed": manual_scan.get("action") == "modulate_next_block"
            and manual_scan.get("evaluation", {}).get("ok") is True,
        },
        {
            "name": "ambient policy cannot interrupt or directly control playback",
            "passed": manual_scan.get("applyAt") == "next_block"
            and manual_scan.get("canInterrupt") is False
            and manual_scan.get("directPlayerControl") is False,
        },
        {
            "name": "short-term memory confirms adaptive tuning",
            "passed": remembered_adaptive.get("action") == "modulate_next_block"
            and remembered_adaptive.get("ambientMemory", {}).get("usableCount") == 3,
        },
        {
            "name": "high confidence adaptive signal can tune without waiting",
            "passed": confident_adaptive.get("action") == "modulate_next_block"
            and confident_adaptive.get("evaluation", {}).get("confidence") >= 0.6,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
