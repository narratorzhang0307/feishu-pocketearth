#!/usr/bin/env python3
import json

import ambient_plan


CAMERA_READY = {"available": True, "model": "IMX708"}
CAMERA_MISSING = {"available": False, "model": ""}
EMPTY_MEMORY = {"count": 0, "usableCount": 0, "blockedCount": 0, "lightTrend": "unknown"}
BASE_STATE = {
    "ok": True,
    "updatedAt": "2026-06-22T10:00:00Z",
    "stage": "sensor",
    "scene": "昏暗书桌",
    "summary": "室内光线变暗，活动较少。",
}
BASE_POLICY = {
    "ok": True,
    "action": "modulate_next_block",
    "message": "环境DJ 会在下一段节目里微调能量、人声比例和转场速度。",
    "cooldown": {"active": False, "remainingSec": 0},
}


def plan_for(mode, camera=CAMERA_READY, state=None, policy=None):
    return ambient_plan.build_ambient_plan(
        camera=dict(camera),
        mode_state={"mode": mode, "label": mode},
        state=dict(state or {}),
        memory=dict(EMPTY_MEMORY),
        policy=dict(policy or {}),
    )


def main():
    classic = plan_for("classic")
    missing_camera = plan_for("adaptive", camera=CAMERA_MISSING)
    scan_once = plan_for("scan_once")
    fresh_policy = plan_for("adaptive", state=BASE_STATE, policy=BASE_POLICY)
    cooldown = plan_for(
        "adaptive",
        state=BASE_STATE,
        policy={
            **BASE_POLICY,
            "ok": False,
            "action": "hold_cooldown",
            "cooldown": {"active": True, "remainingSec": 420},
        },
    )

    cases = [
        {
            "name": "classic mode never asks camera to act",
            "passed": classic.get("nextAction") == "hold_program"
            and classic.get("canStartAudio") is False
            and classic.get("canInterrupt") is False,
        },
        {
            "name": "missing camera keeps 24H main program",
            "passed": missing_camera.get("nextAction") == "check_camera"
            and missing_camera.get("canStartAudio") is False
            and missing_camera.get("camera", {}).get("available") is False,
        },
        {
            "name": "scan once waits for explicit user scan",
            "passed": scan_once.get("nextAction") == "wait_for_manual_scan"
            and scan_once.get("privacy", {}).get("capture") == "manual_only",
        },
        {
            "name": "fresh policy only applies to next block",
            "passed": fresh_policy.get("nextAction") == "apply_next_block_policy"
            and fresh_policy.get("canInterrupt") is False
            and fresh_policy.get("canStartAudio") is False,
        },
        {
            "name": "cooldown prevents repeated ambient retuning",
            "passed": cooldown.get("nextAction") == "hold_cooldown"
            and cooldown.get("policy", {}).get("cooldownActive") is True,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
