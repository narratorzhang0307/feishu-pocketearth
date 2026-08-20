#!/usr/bin/env python3
import argparse
import json
import os
import time

import ambient_memory
import ambient_mode
import ambient_observer
import ambient_plan
import ambient_policy
import ambient_privacy
from camera_status import camera_message, collect_camera_status


AGENT_STATE_PATH = os.environ.get(
    "SUNSET_AMBIENT_AGENT_STATE_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "ambient-agent.json"),
)

AGENT_PRIVACY = {
    "capture": "manual_only",
    "trigger": "扫描此刻",
    "autoCapture": False,
    "imageRetention": "deleted_after_analysis",
    "identity": "not_used",
    "emotion": "not_inferred",
    "audio": "not_started_by_ambient_layer",
}


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def save_json(payload, path):
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(tmp, path)
    return payload


def build_agent_report(capture=False, persist=False):
    mode_state = ambient_mode.load_ambient_mode()
    capture = bool(capture)
    if capture:
        observation = ambient_observer.observe_once(capture=True)
        state = observation.get("ambientState") if isinstance(observation.get("ambientState"), dict) else {}
        if not state:
            state = ambient_observer.state_from_report(observation)
    else:
        camera = collect_camera_status()
        observation = {
            "ok": bool(camera.get("available")),
            "stage": "ready" if camera.get("available") else "camera",
            "message": camera_message(camera),
            "camera": camera,
        }
        state = ambient_observer.load_ambient_state()
    memory = ambient_memory.memory_report()
    policy = ambient_policy.build_ambient_policy(state=state, memory=memory, mode_state=mode_state)
    plan = ambient_plan.build_ambient_plan(
        camera=observation.get("camera") or {},
        mode_state=mode_state,
        state=state,
        memory=memory,
        policy=policy,
    )
    privacy = ambient_privacy.build_ambient_privacy_report(
        camera=observation.get("camera") or {},
        mode_state=mode_state,
    )
    report = {
        "ok": bool(plan.get("ok")) and bool(privacy.get("ok")),
        "updatedAt": now_iso(),
        "mode": mode_state,
        "captureRequested": capture,
        "capture": "manual_only",
        "autoCapture": False,
        "imageRetention": "deleted_after_analysis",
        "identity": "not_used",
        "emotion": "not_inferred",
        "canInterrupt": False,
        "canStartAudio": False,
        "directPlayerCommand": False,
        "programRole": "24H 主线优先，Ambient DJ 只调下一段节目",
        "privacy": {**AGENT_PRIVACY, **(privacy.get("rules") or {})},
        "observation": {
            "ok": bool(observation.get("ok")),
            "stage": observation.get("stage") or "",
            "message": observation.get("message") or "",
            "summary": ambient_observer.ambient_summary(observation) if capture else observation.get("message", ""),
        },
        "state": {
            "ok": bool(state.get("ok")),
            "stage": state.get("stage") or "",
            "summary": state.get("summary") or state.get("scene") or "",
            "light": state.get("light") or (state.get("signals") or {}).get("light") or "unknown",
            "activity": state.get("activity") or "unknown",
            "confidence": state.get("confidence", 0.0),
        },
        "policy": {
            "ok": bool(policy.get("ok")),
            "action": policy.get("action") or "",
            "applyAt": policy.get("applyAt") or "next_block",
            "message": policy.get("message") or "",
            "reason": policy.get("reason") or "",
            "adjustment": policy.get("adjustment") or {},
        },
        "plan": {
            "nextAction": plan.get("nextAction") or "",
            "message": plan.get("message") or "",
            "reason": plan.get("reason") or "",
            "canInterrupt": bool(plan.get("canInterrupt")),
            "canStartAudio": bool(plan.get("canStartAudio")),
        },
        "message": plan.get("message") or privacy.get("message") or "环境DJ 已待命。",
    }
    if persist:
        ambient_privacy.save_ambient_privacy_report(privacy)
        ambient_policy.save_ambient_policy(policy)
        ambient_plan.save_ambient_plan(plan)
        save_json(report, AGENT_STATE_PATH)
    return report


def main():
    parser = argparse.ArgumentParser(description="Safe one-shot Ambient DJ coordinator.")
    parser.add_argument("--capture", action="store_true", help="Run one explicit manual scan; source frame is deleted.")
    parser.add_argument("--save", action="store_true", help="Persist the current privacy, policy, plan and agent status JSON.")
    parser.add_argument("--message", action="store_true", help="Print only the short user-facing message.")
    args = parser.parse_args()

    report = build_agent_report(capture=args.capture, persist=args.save)
    if args.message:
        print(report.get("message") or "环境DJ 已待命。")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
