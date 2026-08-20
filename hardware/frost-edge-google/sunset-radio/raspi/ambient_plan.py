#!/usr/bin/env python3
import argparse
import json
import math
import os
import time

from ambient_memory import memory_report
from ambient_mode import ambient_mode_message, load_ambient_mode
from ambient_observer import load_ambient_state
from ambient_policy import POLICY_TTL_SEC, build_ambient_policy
from camera_status import camera_message, collect_camera_status

PLAN_PATH = os.environ.get(
    "SUNSET_AMBIENT_PLAN_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "ambient-plan.json"),
)


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def minutes_text(seconds):
    try:
        value = max(0, int(seconds))
    except (TypeError, ValueError):
        value = 0
    minutes = int(math.ceil(value / 60)) if value else 0
    if minutes <= 0:
        return "片刻"
    return f"{minutes}分钟"


def build_ambient_plan(camera=None, mode_state=None, state=None, memory=None, policy=None):
    camera = camera if isinstance(camera, dict) else collect_camera_status()
    mode_state = mode_state if isinstance(mode_state, dict) else load_ambient_mode()
    state = state if isinstance(state, dict) else load_ambient_state()
    memory = memory if isinstance(memory, dict) else memory_report()
    policy = policy if isinstance(policy, dict) else build_ambient_policy(state=state, memory=memory, mode_state=mode_state)

    mode = mode_state.get("mode") or "adaptive"
    cooldown = policy.get("cooldown") if isinstance(policy.get("cooldown"), dict) else {}
    camera_available = bool(camera.get("available"))
    state_ok = bool(state.get("ok"))
    state_age = policy.get("stateAgeSec")
    state_stale = bool(policy.get("isStale"))

    plan = {
        "ok": True,
        "updatedAt": now_iso(),
        "mode": mode_state,
        "camera": {
            "available": camera_available,
            "model": camera.get("model") or "",
            "message": camera_message(camera),
        },
        "state": {
            "ok": state_ok,
            "updatedAt": state.get("updatedAt") or "",
            "ageSec": state_age,
            "ttlSec": POLICY_TTL_SEC,
            "isStale": state_stale,
            "stage": state.get("stage") or "unknown",
            "summary": state.get("summary") or state.get("scene") or "",
        },
        "memory": {
            "count": int(memory.get("count") or 0),
            "usableCount": int(memory.get("usableCount") or 0),
            "blockedCount": int(memory.get("blockedCount") or 0),
            "lightTrend": memory.get("lightTrend") or "unknown",
        },
        "policy": {
            "action": policy.get("action") or "",
            "ok": bool(policy.get("ok")),
            "message": policy.get("message") or "",
            "cooldownActive": bool(cooldown.get("active")),
            "cooldownRemainingSec": int(cooldown.get("remainingSec") or 0),
        },
        "privacy": {
            "capture": "manual_only",
            "imageRetention": "deleted_after_analysis",
            "identity": "not_used",
            "emotion": "not_inferred",
        },
        "canInterrupt": False,
        "canStartAudio": False,
    }

    if mode == "classic":
        plan.update({
            "nextAction": "hold_program",
            "message": ambient_mode_message(mode_state),
            "reason": "用户选择原声电台，环境层只待命。",
        })
    elif not camera_available:
        plan.update({
            "nextAction": "check_camera",
            "message": "环境计划：先保持 24H 主线；相机识别后再接环境调音。",
            "reason": camera_message(camera),
        })
    elif mode == "scan_once":
        plan.update({
            "nextAction": "wait_for_manual_scan",
            "message": "环境计划：等用户说“扫描此刻”，只观察一帧再调下一段。",
            "reason": "当前是一次性扫描模式，不自动拍照。",
        })
    elif cooldown.get("active"):
        plan.update({
            "nextAction": "hold_cooldown",
            "message": f"环境计划：刚调过下一段，{minutes_text(cooldown.get('remainingSec'))}后再看。",
            "reason": "避免环境变化让电台频繁跳动。",
        })
    elif not state_ok or state_stale:
        plan.update({
            "nextAction": "wait_for_fresh_scan",
            "message": "环境计划：相机可用；下一次先扫描此刻，再轻调下一段。",
            "reason": "还没有新鲜、可用的环境状态。",
        })
    elif policy.get("ok") and policy.get("action") == "modulate_next_block":
        plan.update({
            "nextAction": "apply_next_block_policy",
            "message": "环境计划：已有可用场景，只在下一段轻调节目。",
            "reason": policy.get("reason") or "环境状态可用。",
        })
    else:
        plan.update({
            "nextAction": "hold_program",
            "message": "环境计划：先稳住 24H 主线，等待更清楚的环境信号。",
            "reason": policy.get("reason") or policy.get("message") or "环境信号暂不够稳定。",
        })
    return plan


def ambient_plan_message(plan=None):
    plan = plan if isinstance(plan, dict) else build_ambient_plan()
    return plan.get("message") or "环境计划：先保持 24H 主线。"


def save_ambient_plan(plan=None, path=PLAN_PATH):
    plan = plan if isinstance(plan, dict) else build_ambient_plan()
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(plan, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return plan


def main():
    parser = argparse.ArgumentParser(description="Plan the next safe Ambient DJ step.")
    parser.add_argument("--message", action="store_true", help="Print only the user-facing message.")
    parser.add_argument("--save", action="store_true", help="Persist the latest plan JSON.")
    args = parser.parse_args()

    plan = build_ambient_plan()
    if args.save:
        plan = save_ambient_plan(plan)
    if args.message:
        print(ambient_plan_message(plan))
    else:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
