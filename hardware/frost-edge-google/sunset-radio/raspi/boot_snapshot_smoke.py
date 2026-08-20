#!/usr/bin/env python3
import json

import boot_snapshot


def main():
    originals = {
        "active_service": boot_snapshot.active_service,
        "enabled_service": boot_snapshot.enabled_service,
        "pi_state": boot_snapshot.pi_state,
        "pending_count": boot_snapshot.pending_count,
        "volume_state": boot_snapshot.volume_state,
        "player_processes": boot_snapshot.player_processes,
        "native_silent_environment": boot_snapshot.native_silent_environment,
        "catalog_status": boot_snapshot.catalog_status,
        "collect_device_status": boot_snapshot.collect_device_status,
        "collect_camera_status": boot_snapshot.collect_camera_status,
        "load_ambient_state": boot_snapshot.load_ambient_state,
        "load_ambient_policy": boot_snapshot.load_ambient_policy,
        "build_ambient_plan": boot_snapshot.build_ambient_plan,
        "build_ambient_privacy_report": boot_snapshot.build_ambient_privacy_report,
        "screen_render_status": boot_snapshot.screen_render_status,
        "load_audio_mode": boot_snapshot.load_audio_mode,
        "is_soft_or_hard_mute": boot_snapshot.is_soft_or_hard_mute,
        "audio_allows_music": boot_snapshot.audio_allows_music,
    }
    try:
        boot_snapshot.active_service = lambda service: True
        boot_snapshot.enabled_service = lambda service: True
        boot_snapshot.pi_state = lambda: {"label": "静音中", "pending": 0}
        boot_snapshot.pending_count = lambda state: int(state.get("pending") or 0)
        boot_snapshot.volume_state = lambda: "Volume: 0.00 [MUTED]"
        boot_snapshot.player_processes = lambda: []
        boot_snapshot.native_silent_environment = lambda: {"ok": True}
        boot_snapshot.catalog_status = lambda: {"ok": True, "cityCount": 96, "playableCount": 96}
        boot_snapshot.collect_device_status = lambda: {
            "battery": {"available": True, "capacity": 88},
            "audio": {"muted": True, "volume": "0.00"},
            "temperatureC": 42,
            "diskPercent": 38,
        }
        boot_snapshot.collect_camera_status = lambda: {"ok": True, "available": True, "model": "IMX708"}
        boot_snapshot.load_ambient_state = lambda: {"ok": True, "stage": "sensor", "summary": "测试环境"}
        boot_snapshot.load_ambient_policy = lambda: {"ok": True, "action": "modulate_next_block"}
        boot_snapshot.build_ambient_plan = lambda **kwargs: {
            "ok": True,
            "nextAction": "apply_next_block_policy",
            "canStartAudio": False,
            "canInterrupt": False,
        }
        boot_snapshot.build_ambient_privacy_report = lambda **kwargs: {
            "ok": True,
            "rules": {
                "capture": "manual_only",
                "autoCapture": False,
                "identity": "not_used",
                "emotion": "not_inferred",
                "audio": "not_started_by_ambient_layer",
            },
        }
        boot_snapshot.screen_render_status = lambda state, device: {"ok": True, "size": [240, 240]}
        boot_snapshot.load_audio_mode = lambda: {"mode": "soft_mute", "label": "安静待命"}
        boot_snapshot.is_soft_or_hard_mute = lambda mode: True
        boot_snapshot.audio_allows_music = lambda mode: False
        snapshot = boot_snapshot.collect_boot_snapshot()
    finally:
        for name, original in originals.items():
            setattr(boot_snapshot, name, original)

    checks = snapshot.get("checks") or {}
    cases = [
        {
            "name": "boot snapshot records ambient plan safety",
            "passed": checks.get("ambientPlanSafe") is True
            and snapshot.get("ambientPlan", {}).get("canStartAudio") is False
            and snapshot.get("ambientPlan", {}).get("canInterrupt") is False,
        },
        {
            "name": "boot snapshot records ambient privacy rules",
            "passed": checks.get("ambientPrivacyManual") is True
            and snapshot.get("ambientPrivacy", {}).get("rules", {}).get("capture") == "manual_only",
        },
        {
            "name": "boot snapshot remains ok in quiet standby",
            "passed": snapshot.get("ok") is True and checks.get("muted") is True and checks.get("noPlayers") is True,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
