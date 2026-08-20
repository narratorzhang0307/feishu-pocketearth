#!/usr/bin/env python3
import argparse
import json
import os
import time

from ambient_mode import ambient_mode_message, load_ambient_mode
from camera_status import camera_message, collect_camera_status

PRIVACY_PATH = os.environ.get(
    "SUNSET_AMBIENT_PRIVACY_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "ambient-privacy.json"),
)

PRIVACY_RULES = {
    "capture": "manual_only",
    "trigger": "扫描此刻",
    "autoCapture": False,
    "imageRetention": "deleted_after_analysis",
    "identity": "not_used",
    "emotion": "not_inferred",
    "audio": "not_started_by_ambient_layer",
    "playerControl": "not_direct",
    "programControl": "next_block_modulation_only",
}


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def build_ambient_privacy_report(camera=None, mode_state=None):
    camera = camera if isinstance(camera, dict) else collect_camera_status()
    mode_state = mode_state if isinstance(mode_state, dict) else load_ambient_mode()
    return {
        "ok": True,
        "updatedAt": now_iso(),
        "mode": mode_state,
        "camera": {
            "available": bool(camera.get("available")),
            "model": camera.get("model") or "",
            "message": camera_message(camera),
        },
        "rules": PRIVACY_RULES,
        "message": ambient_privacy_message_from_parts(camera, mode_state),
    }


def ambient_privacy_message_from_parts(camera, mode_state):
    mode = (mode_state or {}).get("mode") or "adaptive"
    camera_text = "相机已就绪" if (camera or {}).get("available") else "相机未开启"
    if mode == "classic":
        mode_text = "当前原声电台，不使用环境调音"
    elif mode == "scan_once":
        mode_text = "当前扫描此刻，只等用户主动扫描"
    else:
        mode_text = "当前环境自适应，只轻调下一段"
    return (
        f"隐私：{camera_text}；不会自动拍照，只在“扫描此刻”观察一帧，分析后删图；"
        f"不识别身份或表情，也不读、保存或上传车牌、证件号、二维码、门牌号或屏幕文字；"
        f"语音只用于唤醒和指令识别，不做环境录音；{mode_text}。"
    )


def ambient_privacy_message(report=None):
    report = report if isinstance(report, dict) else build_ambient_privacy_report()
    return report.get("message") or ambient_mode_message(report.get("mode") or {})


def save_ambient_privacy_report(report=None, path=PRIVACY_PATH):
    report = report if isinstance(report, dict) else build_ambient_privacy_report()
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return report


def main():
    parser = argparse.ArgumentParser(description="Explain Ambient DJ camera privacy boundaries.")
    parser.add_argument("--message", action="store_true", help="Print only the user-facing message.")
    parser.add_argument("--save", action="store_true", help="Persist the latest privacy report JSON.")
    args = parser.parse_args()

    report = build_ambient_privacy_report()
    if args.save:
        report = save_ambient_privacy_report(report)
    if args.message:
        print(ambient_privacy_message(report))
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
