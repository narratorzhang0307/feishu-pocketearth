#!/usr/bin/env python3
import json
import subprocess

import camera_doctor


def main():
    config_text = """
    # Camera config
    camera_auto_detect=1
    camera_auto_detect=0
    dtoverlay=imx708,cam0
    dtoverlay = imx708,cam1
    """
    lines = camera_doctor.active_config_lines(config_text)

    original_collect_camera = camera_doctor.collect_camera_status
    original_config_report = camera_doctor.config_report
    original_model_report = camera_doctor.model_report
    original_dmesg_report = camera_doctor.dmesg_report
    try:
        camera_doctor.collect_camera_status = lambda: {
            "available": False,
            "model": "",
            "tools": {"hello": "/usr/bin/rpicam-hello", "still": "/usr/bin/rpicam-still"},
        }
        camera_doctor.config_report = lambda: {
            "readable": True,
            "path": "/boot/firmware/config.txt",
            "cameraAutoDetect": False,
            "cam109ManualConfigReady": False,
        }
        camera_doctor.model_report = lambda: {"model": "Raspberry Pi 5 Model B", "uname": "Linux sunset-pi"}
        camera_doctor.dmesg_report = lambda: {"readable": True, "matches": ["imx708 probe"], "returnCode": 0}
        tools_no_camera = camera_doctor.collect_camera_doctor()
    finally:
        camera_doctor.collect_camera_status = original_collect_camera
        camera_doctor.config_report = original_config_report
        camera_doctor.model_report = original_model_report
        camera_doctor.dmesg_report = original_dmesg_report

    detected_report = {
        "checks": {"cameraDetected": True},
        "camera": {"available": True, "model": "IMX708"},
        "config": {},
    }
    tools_missing_report = {
        "checks": {"cameraTools": False, "cameraDetected": False},
        "camera": {"tools": {}, "available": False},
        "config": {},
    }
    unreadable_dmesg = camera_doctor.suggestions(
        {"cameraTools": True, "cameraDetected": True, "configReadable": True, "cam109ManualConfigReady": True, "dmesgReadable": False},
        {"available": True, "model": "IMX708"},
        {"path": "/boot/firmware/config.txt"},
        {"readable": False},
    )
    cases = [
        {
            "name": "CAM109 config parser treats last camera_auto_detect value as active",
            "passed": camera_doctor.config_value(lines, "camera_auto_detect") == "0",
        },
        {
            "name": "CAM109 overlay parser tolerates whitespace",
            "passed": camera_doctor.has_overlay(lines, "dtoverlay=imx708,cam0")
            and camera_doctor.has_overlay(lines, "dtoverlay=imx708,cam1"),
        },
        {
            "name": "camera tools without detection suggest manual CAM109 checks",
            "passed": tools_no_camera.get("ok") is True
            and tools_no_camera.get("checks", {}).get("cameraTools") is True
            and tools_no_camera.get("checks", {}).get("cameraDetected") is False
            and any("CAM109" in item for item in tools_no_camera.get("suggestions", [])),
        },
        {
            "name": "detected IMX708 message enters observation chain",
            "passed": "IMX708 已识别" in camera_doctor.camera_doctor_message(detected_report),
        },
        {
            "name": "missing tools message stays actionable",
            "passed": "相机工具" in camera_doctor.camera_doctor_message(tools_missing_report),
        },
        {
            "name": "dmesg permission issues are warnings, not camera blockers",
            "passed": any("内核日志" in item for item in unreadable_dmesg),
        },
        {
            "name": "CAM109 reference mirrors manual essentials",
            "passed": camera_doctor.CAM109_REFERENCE.get("sensor") == "Sony 12MP IMX708"
            and camera_doctor.CAM109_REFERENCE.get("activePixels") == "4608x2592"
            and camera_doctor.CAM109_REFERENCE.get("interface") == "2-Lane MIPI"
            and camera_doctor.CAM109_REFERENCE.get("ribbonCable") == "150 mm"
            and camera_doctor.CAM109_REFERENCE.get("pi5ManualConfig") == camera_doctor.CAM109_CONFIG_LINES
            and "Power off" in camera_doctor.CAM109_REFERENCE.get("safety", ""),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
