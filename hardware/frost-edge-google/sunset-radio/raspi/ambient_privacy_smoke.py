#!/usr/bin/env python3
import json
import os
import tempfile

import ambient_privacy


def report_for(mode, camera_available=True):
    return ambient_privacy.build_ambient_privacy_report(
        camera={"available": camera_available, "model": "IMX708" if camera_available else ""},
        mode_state={"mode": mode, "label": mode},
    )


def main():
    adaptive = report_for("adaptive")
    scan_once = report_for("scan_once")
    classic = report_for("classic", camera_available=False)
    with tempfile.TemporaryDirectory(prefix="sunset-ambient-privacy-") as tmp:
        path = os.path.join(tmp, "privacy.json")
        saved = ambient_privacy.save_ambient_privacy_report(adaptive, path=path)
        saved_exists = os.path.exists(path) and saved.get("rules", {}).get("autoCapture") is False

    rules = adaptive.get("rules") or {}
    cases = [
        {
            "name": "ambient camera capture remains manual only",
            "passed": rules.get("capture") == "manual_only"
            and rules.get("autoCapture") is False
            and "不会自动拍照" in adaptive.get("message", ""),
        },
        {
            "name": "privacy forbids identity and facial emotion inference",
            "passed": rules.get("identity") == "not_used"
            and rules.get("emotion") == "not_inferred",
        },
        {
            "name": "privacy copy names visual sensitive data boundaries",
            "passed": all(
                marker in adaptive.get("message", "")
                for marker in ("车牌", "证件号", "二维码", "门牌号", "屏幕文字")
            ),
        },
        {
            "name": "ambient layer never starts audio",
            "passed": rules.get("audio") == "not_started_by_ambient_layer",
        },
        {
            "name": "ambient layer never directly controls the player",
            "passed": rules.get("playerControl") == "not_direct"
            and rules.get("programControl") == "next_block_modulation_only",
        },
        {
            "name": "scan once copy waits for explicit scan",
            "passed": "只等用户主动扫描" in scan_once.get("message", ""),
        },
        {
            "name": "classic mode copy says ambient tuning is off",
            "passed": "不使用环境调音" in classic.get("message", ""),
        },
        {
            "name": "privacy report can be saved for screen/API status",
            "passed": saved_exists,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
