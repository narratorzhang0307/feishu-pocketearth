#!/usr/bin/env python3
import json
import os
import re
import subprocess

from camera_status import camera_message, collect_camera_status


CONFIG_PATHS = ("/boot/firmware/config.txt", "/boot/config.txt")
DMESG_PATTERNS = re.compile(r"(imx708|camera|unicam|csi|cam0|cam1|rp1-cfe|i2c)", re.I)
CAM109_CONFIG_LINES = [
    "camera_auto_detect=0",
    "dtoverlay=imx708,cam0",
    "dtoverlay=imx708,cam1",
]
CAM109_REFERENCE = {
    "product": "CAM109 IMX708AF-75",
    "sensor": "Sony 12MP IMX708",
    "activePixels": "4608x2592",
    "interface": "2-Lane MIPI",
    "ribbonCable": "150 mm",
    "fieldOfView": "75 deg diagonal",
    "pi5ManualConfig": CAM109_CONFIG_LINES,
    "captureExamples": {
        "preview": "rpicam-hello",
        "still": "rpicam-jpeg -o test.jpg -t 2000 --width 640 --height 480",
    },
    "safety": "Power off the Raspberry Pi before checking or reseating the ribbon cable.",
}


def run(args, timeout=5):
    try:
        return subprocess.run(
            args,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def read_first(paths):
    for path in paths:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                return path, handle.read()
        except OSError:
            continue
    return "", ""


def active_config_lines(text):
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def config_value(lines, key):
    key = key.lower()
    for line in reversed(lines):
        normalized = line.replace(" ", "").lower()
        if normalized.startswith(f"{key}="):
            return normalized.split("=", 1)[1]
    return ""


def has_overlay(lines, overlay):
    overlay = overlay.replace(" ", "").lower()
    return any(line.replace(" ", "").lower() == overlay for line in lines)


def config_report():
    path, text = read_first(CONFIG_PATHS)
    lines = active_config_lines(text)
    interesting = [
        line for line in lines
        if "camera" in line.lower()
        or "dtoverlay" in line.lower()
        or "imx708" in line.lower()
        or line.lower().startswith(("start_x", "gpu_mem"))
    ]
    auto_detect_value = config_value(lines, "camera_auto_detect")
    imx708_cam0 = has_overlay(lines, "dtoverlay=imx708,cam0")
    imx708_cam1 = has_overlay(lines, "dtoverlay=imx708,cam1")
    manual_ready = auto_detect_value == "0" and imx708_cam0 and imx708_cam1
    return {
        "path": path,
        "readable": bool(path),
        "cameraAutoDetect": auto_detect_value == "1",
        "cameraAutoDetectValue": auto_detect_value,
        "imx708Cam0Overlay": imx708_cam0,
        "imx708Cam1Overlay": imx708_cam1,
        "cam109ManualConfigReady": manual_ready,
        "cam109ExpectedLines": CAM109_CONFIG_LINES,
        "interestingLines": interesting[:20],
    }


def model_report():
    try:
        with open("/proc/device-tree/model", "rb") as handle:
            model = handle.read().decode("utf-8", "ignore").replace("\x00", "").strip()
    except OSError:
        model = ""
    uname = run(["uname", "-a"], timeout=3).stdout.strip()
    return {"model": model, "uname": uname}


def dmesg_report():
    result = run(["dmesg"], timeout=5)
    raw = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
    matches = [line for line in raw.splitlines() if DMESG_PATTERNS.search(line)]
    return {
        "readable": result.returncode == 0,
        "returnCode": result.returncode,
        "matches": matches[-30:],
        "error": "" if result.returncode == 0 else raw[:300],
    }


def collect_camera_doctor():
    camera = collect_camera_status()
    config = config_report()
    model = model_report()
    dmesg = dmesg_report()
    checks = {
        "cameraTools": bool((camera.get("tools") or {}).get("hello") or (camera.get("tools") or {}).get("still")),
        "cameraDetected": bool(camera.get("available")),
        "configReadable": bool(config.get("readable")),
        "cameraAutoDetect": bool(config.get("cameraAutoDetect")),
        "cam109ManualConfigReady": bool(config.get("cam109ManualConfigReady")),
        "dmesgReadable": bool(dmesg.get("readable")),
    }
    return {
        "ok": checks["cameraTools"],
        "checks": checks,
        "message": camera_doctor_message({"checks": checks, "camera": camera, "config": config}),
        "camera": camera,
        "config": config,
        "reference": CAM109_REFERENCE,
        "system": model,
        "dmesg": dmesg,
        "suggestions": suggestions(checks, camera, config, dmesg),
    }


def suggestions(checks, camera, config, dmesg):
    out = []
    if not checks["cameraTools"]:
        out.append("先安装或修复 rpicam 工具。")
    if checks["cameraTools"] and not checks["cameraDetected"]:
        out.append("关机断电后检查相机排线方向、是否插到底、是否接在相机接口。")
        out.append("确认 Pi 5 与 IMX708 使用匹配的细排线或转接线。")
        if checks["configReadable"] and not checks["cam109ManualConfigReady"]:
            out.append(f"CAM109 文档建议把 {config.get('path')} 改为手动 IMX708 overlay 后重启。")
        out.append("重新开机后再说“相机医生”或“相机状态”。")
    if not checks["dmesgReadable"]:
        out.append("内核日志当前不可读；相机仍可用 rpicam 检测结果判断。")
    return out[:5]


def camera_doctor_message(report):
    checks = report.get("checks") or {}
    camera = report.get("camera") or {}
    if checks.get("cameraDetected"):
        model = camera.get("model") or "相机"
        return f"{model} 已识别，环境DJ 可以进入观察链路。"
    config = report.get("config") or {}
    if checks.get("cameraTools") and checks.get("configReadable") and not checks.get("cam109ManualConfigReady"):
        return "相机工具正常；需要扫描此刻时，再按 CAM109 文档切到 IMX708 配置。"
    if checks.get("cameraTools"):
        return "当前没看到 IMX708；电台先保持可用，需要拍照时再断电检查排线和接口。"
    return camera_message(camera)


def camera_repair_message(report):
    checks = report.get("checks") or {}
    if checks.get("cameraDetected"):
        model = (report.get("camera") or {}).get("model") or "相机"
        return f"{model} 已经能用了；下一步可以试“扫描此刻”。"
    if checks.get("cameraTools") and checks.get("configReadable") and not checks.get("cam109ManualConfigReady"):
        return "需要拍照时，再断电确认排线并按 CAM109 文档切到 imx708 配置。"
    if checks.get("cameraTools"):
        return "关机断电；检查两端排线接点对接、插到底、锁扣压紧；再开机说相机医生。"
    return "先补好 rpicam 工具；相机硬件修复先不用急。"


def main():
    report = collect_camera_doctor()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
