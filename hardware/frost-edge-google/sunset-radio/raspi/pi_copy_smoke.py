#!/usr/bin/env python3
import json

from ambient_privacy import ambient_privacy_message_from_parts
from boot_snapshot import boot_snapshot_message_from_parts
from camera_doctor import camera_doctor_message, camera_repair_message
from camera_status import ambient_message, camera_message
from pi_command_daemon import user_label


FORBIDDEN = ("待接入", "大脑未接入", "不可用", "未识别", "Player needed")


def no_forbidden(text):
    return [item for item in FORBIDDEN if item in str(text or "")]


def main():
    camera_tools_only = {
        "ok": True,
        "available": False,
        "model": "",
        "tools": {"hello": "/usr/bin/rpicam-hello", "still": "/usr/bin/rpicam-still"},
    }
    doctor_report = {
        "checks": {
            "cameraTools": True,
            "cameraDetected": False,
            "configReadable": True,
            "cam109ManualConfigReady": False,
        },
        "camera": camera_tools_only,
        "config": {},
    }
    samples = {
        "camera_message": camera_message(camera_tools_only),
        "ambient_message": ambient_message(camera_tools_only),
        "camera_doctor_message": camera_doctor_message(doctor_report),
        "camera_repair_message": camera_repair_message(doctor_report),
        "ambient_privacy": ambient_privacy_message_from_parts(camera_tools_only, {"mode": "adaptive"}),
        "boot_snapshot": boot_snapshot_message_from_parts(
            {"muted": True, "noPlayers": True},
            {"battery": {"available": False}},
            camera_tools_only,
            {"ok": True},
            {"sunset-radio-mute-guard": True, "sunset-radio-pi-native": True, "sunset-radio-voice": True},
        ),
    }
    cases = [
        {
            "name": name,
            "passed": not no_forbidden(text),
            "detail": {"text": text, "forbidden": no_forbidden(text)},
        }
        for name, text in samples.items()
    ]
    labels = [
        "Muted",
        "Now playing",
        "DJ request",
        "Camera doctor",
        "Ambient memory",
        "Voice offline",
        "Player needed",
    ]
    cases.append(
        {
            "name": "pi command labels are localized before publishing",
            "passed": all(user_label(label) != label and not user_label(label).isascii() for label in labels),
            "detail": {label: user_label(label) for label in labels},
        }
    )
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
