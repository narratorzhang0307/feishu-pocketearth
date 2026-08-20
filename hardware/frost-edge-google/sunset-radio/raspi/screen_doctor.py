#!/usr/bin/env python3
import json
import os
import sys

from device_status import collect_device_status
from health_check import active_service, enabled_service, screen_render_status

WHISPLAY_RUNTIME = os.environ.get("WHISPLAY_RUNTIME", "/home/pi/Whisplay/runtime")
SCREEN_SERVICES = [
    "whisplay-daemon",
    "sunset-radio-whisplay",
    "sunset-radio-kiosk",
]


def runtime_status(path=WHISPLAY_RUNTIME):
    files = {}
    for name in ("whisplay.py", "whisplay_client.py"):
        full = os.path.join(path, name)
        files[name] = os.path.exists(full)
    return {
        "path": path,
        "exists": os.path.isdir(path),
        "files": files,
        "ok": os.path.isdir(path) and all(files.values()),
    }


def device_nodes():
    return {
        "spi": [node for node in ("/dev/spidev0.0", "/dev/spidev0.1", "/dev/spidev10.0") if os.path.exists(node)],
        "framebuffer": [node for node in ("/dev/fb0", "/dev/fb1") if os.path.exists(node)],
    }


def collect_screen_doctor():
    runtime = runtime_status()
    services = {name: active_service(name) for name in SCREEN_SERVICES}
    enabled = {name: enabled_service(name) for name in SCREEN_SERVICES}
    device = collect_device_status()
    state = {
        "status": "idle",
        "label": "静音中",
        "city": "屏幕医生",
        "track": "Whisplay",
        "message": "静音中：屏幕复查。",
        "pending": 0,
    }
    screen = screen_render_status(state, device)
    nodes = device_nodes()
    report = {
        "ok": all(services.values()) and runtime.get("ok") and bool(screen.get("ok")) and bool(nodes.get("spi")),
        "services": services,
        "enabledServices": enabled,
        "runtime": runtime,
        "screen": screen,
        "nodes": nodes,
        "device": {
            "temperatureC": device.get("temperatureC"),
            "ip": device.get("ip"),
            "audio": device.get("audio"),
        },
    }
    report["message"] = screen_doctor_message(report)
    return report


def screen_doctor_message(report=None):
    report = report if isinstance(report, dict) else collect_screen_doctor()
    services = report.get("services") or {}
    runtime = report.get("runtime") or {}
    screen = report.get("screen") or {}
    nodes = report.get("nodes") or {}
    if report.get("ok"):
        return "Whisplay 屏幕正常；短按下一首，双击换城市；待机/静音长按先试手机热点并播放当前日落城市，播放中长按关闭并安静待命；结果写状态卡。"
    if not runtime.get("ok"):
        return "Whisplay 运行文件不完整；先检查 runtime 目录。"
    if not nodes.get("spi"):
        return "屏幕 SPI 通道未出现；先检查屏幕 HAT 接触。"
    inactive = [name for name, ok in services.items() if not ok]
    if inactive:
        return f"屏幕后台待重启：{', '.join(inactive[:2])}。"
    if not screen.get("ok"):
        return "屏幕画面生成失败；先看 Whisplay 渲染日志。"
    return "屏幕链路待复查；音乐DJ 会保持静音。"


def main():
    report = collect_screen_doctor()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
