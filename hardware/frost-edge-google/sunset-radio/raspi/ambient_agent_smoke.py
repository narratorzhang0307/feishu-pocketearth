#!/usr/bin/env python3
import json
import os
import tempfile

import ambient_agent


def fake_observation(capture):
    return {
        "ok": True,
        "stage": "sensor" if capture else "ready",
        "message": "ok",
        "camera": {"available": True, "model": "IMX708"},
        "signals": {
            "ok": True,
            "brightness": 0.32,
            "contrast": 0.1,
            "light": "dim",
            "activity": "unknown",
            "tags": ["室内光线"],
        },
        "ambientState": {
            "ok": True,
            "stage": "sensor" if capture else "ready",
            "summary": "空间光线偏暗；环境DJ 只轻调下一段节目。",
            "light": "dim",
            "activity": "unknown",
            "confidence": 0.48,
            "privacy": ambient_agent.AGENT_PRIVACY,
        },
    }


def main():
    observed = []
    saved = []
    original_observe_once = ambient_agent.ambient_observer.observe_once
    original_load_state = ambient_agent.ambient_observer.load_ambient_state
    original_memory_report = ambient_agent.ambient_memory.memory_report
    original_load_mode = ambient_agent.ambient_mode.load_ambient_mode
    original_collect_camera_status = ambient_agent.collect_camera_status
    original_camera_message = ambient_agent.camera_message
    original_save_privacy = ambient_agent.ambient_privacy.save_ambient_privacy_report
    original_save_policy = ambient_agent.ambient_policy.save_ambient_policy
    original_save_plan = ambient_agent.ambient_plan.save_ambient_plan
    try:
        ambient_agent.ambient_observer.observe_once = lambda capture=False: observed.append(capture) or fake_observation(capture)
        ambient_agent.ambient_memory.memory_report = lambda: {
            "ok": True,
            "count": 1,
            "usableCount": 1,
            "blockedCount": 0,
            "dominantLight": "dim",
            "dominantActivity": "unknown",
            "lightTrend": "steady",
        }
        ambient_agent.ambient_mode.load_ambient_mode = lambda: {
            "mode": "scan_once",
            "label": "扫描此刻",
            "updatedAt": "2026-06-23T01:00:00Z",
        }
        ambient_agent.ambient_observer.load_ambient_state = lambda: {
            "ok": True,
            "stage": "sensor",
            "summary": "已有环境状态。",
            "light": "dim",
            "activity": "unknown",
            "confidence": 0.42,
            "privacy": ambient_agent.AGENT_PRIVACY,
        }
        ambient_agent.collect_camera_status = lambda: {"available": True, "model": "IMX708"}
        ambient_agent.camera_message = lambda _camera: "IMX708 已识别，可以进入环境感知支线。"
        ambient_agent.ambient_privacy.save_ambient_privacy_report = lambda payload=None, path=None: saved.append("privacy") or payload
        ambient_agent.ambient_policy.save_ambient_policy = lambda payload=None, path=None: saved.append("policy") or payload
        ambient_agent.ambient_plan.save_ambient_plan = lambda payload=None, path=None: saved.append("plan") or payload
        with tempfile.TemporaryDirectory(prefix="sunset-ambient-agent-") as tmp:
            ambient_agent.AGENT_STATE_PATH = os.path.join(tmp, "agent.json")
            passive = ambient_agent.build_agent_report(capture=False, persist=False)
            active = ambient_agent.build_agent_report(capture=True, persist=True)
            saved_agent = os.path.exists(ambient_agent.AGENT_STATE_PATH)
    finally:
        ambient_agent.ambient_observer.observe_once = original_observe_once
        ambient_agent.ambient_observer.load_ambient_state = original_load_state
        ambient_agent.ambient_memory.memory_report = original_memory_report
        ambient_agent.ambient_mode.load_ambient_mode = original_load_mode
        ambient_agent.collect_camera_status = original_collect_camera_status
        ambient_agent.camera_message = original_camera_message
        ambient_agent.ambient_privacy.save_ambient_privacy_report = original_save_privacy
        ambient_agent.ambient_policy.save_ambient_policy = original_save_policy
        ambient_agent.ambient_plan.save_ambient_plan = original_save_plan

    cases = [
        {
            "name": "ambient agent does not capture by default",
            "passed": observed == [True] and passive.get("captureRequested") is False,
        },
        {
            "name": "manual capture is explicit and privacy bounded",
            "passed": observed[0] is True
            and active.get("capture") == "manual_only"
            and active.get("autoCapture") is False
            and active.get("imageRetention") == "deleted_after_analysis"
            and active.get("identity") == "not_used"
            and active.get("emotion") == "not_inferred",
        },
        {
            "name": "ambient agent cannot command playback directly",
            "passed": active.get("canInterrupt") is False
            and active.get("canStartAudio") is False
            and active.get("directPlayerCommand") is False
            and active.get("plan", {}).get("canInterrupt") is False
            and active.get("plan", {}).get("canStartAudio") is False,
        },
        {
            "name": "ambient agent persists only structured status",
            "passed": saved_agent and saved == ["privacy", "policy", "plan"],
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases, "observed": observed}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
