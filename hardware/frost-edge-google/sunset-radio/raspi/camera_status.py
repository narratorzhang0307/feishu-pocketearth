#!/usr/bin/env python3
import glob
import json
import re
import shutil
import subprocess


HELLO_COMMANDS = ("rpicam-hello", "libcamera-hello")
STILL_COMMANDS = ("rpicam-still", "libcamera-still")


def first_command(names):
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    return ""


def run(args, timeout=4):
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


def parse_camera_model(text):
    lower = text.lower()
    if "imx708" in lower:
        return "IMX708"
    match = re.search(r"\b(imx\d{3,4}|ov\d{4}|arducam[\w-]*)\b", lower)
    return match.group(1).upper() if match else ""


def collect_camera_status():
    hello = first_command(HELLO_COMMANDS)
    still = first_command(STILL_COMMANDS)
    result = run([hello, "--list-cameras"], timeout=5) if hello else None
    raw = ""
    return_code = None
    if result:
        raw = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
        return_code = result.returncode

    lower = raw.lower()
    unavailable = "no cameras available" in lower or "no cameras were detected" in lower
    has_camera_line = bool(re.search(r"(^|\n)\s*\d+\s*:", raw))
    model = parse_camera_model(raw)
    available = bool(hello and not unavailable and (has_camera_line or model))

    return {
        "ok": bool(hello or still),
        "available": available,
        "model": model,
        "tools": {
            "hello": hello,
            "still": still,
        },
        "devices": {
            "video": sorted(glob.glob("/dev/video*")),
            "media": sorted(glob.glob("/dev/media*")),
        },
        "listCommand": [hello, "--list-cameras"] if hello else [],
        "listReturnCode": return_code,
        "raw": raw[:1200],
    }


def camera_message(status):
    tools = status.get("tools") or {}
    if not tools.get("hello") and not tools.get("still"):
        return "相机工具还没装好，先补 rpicam 工具。"
    if status.get("available"):
        model = status.get("model") or "相机"
        return f"{model} 已识别，可以进入环境感知支线。"
    return "当前没看到 IMX708；电台先保持可用，需要拍照时再检查排线和接口。"


def ambient_message(status):
    if status.get("available"):
        return "环境DJ可先观察一帧，提取光线、活动和空间标签，再只调下一段节目。"
    return "环境DJ支线已预留；相机准备好后，再接云端视觉标签和24H节目调音。"


def main():
    status = collect_camera_status()
    print(json.dumps({
        "ok": bool(status.get("ok")),
        "available": bool(status.get("available")),
        "message": camera_message(status),
        "ambient": ambient_message(status),
        "status": status,
    }, ensure_ascii=False, indent=2))
    return 0 if status.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
