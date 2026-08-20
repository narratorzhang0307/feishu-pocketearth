#!/usr/bin/env python3
import json
import os
import socket
import subprocess
import sys

from button_events import collect_button_events
from health_check import active_service, enabled_service
from pisugar_button import socket_path as pisugar_socket_path, status as pisugar_status
import wifi_failover


WHISPLAY_SOCKET = os.environ.get("WHISPLAY_DAEMON_SOCKET", "/tmp/whisplay-daemon.sock")
WHISPLAY_SETTINGS_PATH = os.environ.get(
    "WHISPLAY_DAEMON_SETTINGS_PATH",
    os.path.join(os.path.expanduser("~"), ".whisplay-daemon", "settings.json"),
)
BUTTON_CONTROLS = {
    "single": "下一首",
    "double": "换个城市",
    "long": "开/关电台",
}
BUTTON_MAPPING_SUMMARY = "短按下一首，双击换城市；待机/静音长按先试手机热点并播放当前日落城市，播放中长按关闭并安静待命；结果写状态卡。"
ACTION_MESSAGES = {
    "下一首": f"按键已接入；最近一次短按会切到下一首；{BUTTON_MAPPING_SUMMARY}",
    "换个城市": f"按键已接入；最近一次双击会换到下一座城市；{BUTTON_MAPPING_SUMMARY}",
    "切换声音": f"按键已接入；最近一次长按：待机/静音会先尝试手机热点并播放当前日落城市，播放中会关闭并安静待命；{BUTTON_MAPPING_SUMMARY}",
    "开/关电台": f"按键已接入；最近一次长按：待机/静音会先尝试手机热点并播放当前日落城市，播放中会关闭并安静待命；{BUTTON_MAPPING_SUMMARY}",
}


def wifi_failover_enabled_on_button():
    return os.environ.get("SUNSET_WIFI_FAILOVER_ON_BUTTON", "1").lower() not in {"0", "false", "no", "off"}


def load_settings():
    try:
        with open(WHISPLAY_SETTINGS_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def whisplay_request(cmd, payload=None, timeout=1.5):
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(timeout)
            client.connect(WHISPLAY_SOCKET)
            body = {"version": 1, "cmd": cmd, "payload": payload or {}}
            client.sendall((json.dumps(body) + "\n").encode("utf-8"))
            line = client.makefile("r").readline().strip()
        if not line:
            return {"ok": False, "error": "empty response"}
        response = json.loads(line)
        return response if isinstance(response, dict) else {"ok": False, "error": "invalid response"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def summarize_pisugar(settings, sock_path, hooks):
    hook_items = hooks if isinstance(hooks, list) else []
    ok_count = sum(1 for item in hook_items if isinstance(item, dict) and item.get("ok"))
    missing_count = sum(1 for item in hook_items if isinstance(item, dict) and item.get("missing"))
    home_button = settings.get("pisugar_home_button")
    if home_button == "none":
        mode = "whisplay_button"
        message = "橙色键由 Whisplay 接管；PiSugar Home 已关闭，不会抢短按。"
    elif ok_count:
        mode = "pisugar_fallback"
        message = "PiSugar 备用按键快捷键可用。"
    else:
        mode = "needs_attention"
        message = "PiSugar Home 仍可能抢短按；需要设为 none。"
    return {
        "mode": mode,
        "message": message,
        "socketAvailable": bool(sock_path),
        "homeButton": home_button,
        "hookOkCount": ok_count,
        "hookMissingCount": missing_count,
    }


def collect_wifi_failover_status():
    env = wifi_failover.load_env()
    profiles = wifi_failover.load_profiles(env)
    if not profiles:
        profiles = collect_sudo_wifi_profiles()
    enabled = wifi_failover_enabled_on_button()
    first = profiles[0].ssid if profiles else ""
    if enabled and first:
        message = f"待机/静音长按打开电台前会优先尝试连接热点：{first}；播放中长按只会关闭播放并安静待命；结果写状态卡。"
    elif enabled:
        message = "待机/静音长按打开电台前会尝试热点，但还没有配置热点档案；播放中长按只会关闭播放并安静待命；结果写状态卡。"
    else:
        message = "待机/静音长按打开电台时不会自动切热点；播放中长按只会关闭播放并安静待命；结果写状态卡。"
    return {
        "enabledOnLongPress": enabled,
        "configured": bool(profiles),
        "profileCount": len(profiles),
        "profiles": wifi_failover.sanitized_profiles(profiles),
        "message": message,
    }


def collect_sudo_wifi_profiles():
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wifi_failover.py")
    try:
        result = subprocess.run(
            ["sudo", "-n", sys.executable, script, "--profiles-json"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    profiles = []
    items = payload.get("profiles", []) if isinstance(payload, dict) else []
    if not isinstance(items, list):
        return []
    for item in items:
        if not isinstance(item, dict):
            continue
        ssid = str(item.get("ssid") or "").strip()
        if not ssid:
            continue
        profiles.append(
            wifi_failover.Profile(
                ssid=ssid,
                password="set" if item.get("passwordSet") else "",
                priority=wifi_failover.int_value(item.get("priority"), 0),
                connection=str(item.get("connection") or "").strip() or f"{wifi_failover.CONNECTION_PREFIX}{ssid}",
            )
        )
    return profiles


def collect_button_doctor():
    services = {
        "whisplay-daemon": active_service("whisplay-daemon"),
        "sunset-radio-whisplay": active_service("sunset-radio-whisplay"),
        "sunset-radio-pisugar-button": active_service("sunset-radio-pisugar-button"),
    }
    enabled = {
        "whisplay-daemon": enabled_service("whisplay-daemon"),
        "sunset-radio-whisplay": enabled_service("sunset-radio-whisplay"),
        "sunset-radio-pisugar-button": enabled_service("sunset-radio-pisugar-button"),
    }
    settings = load_settings()
    whisplay_ping = whisplay_request("health.ping")
    button_state = whisplay_request("button.get_state")
    pisugar_socket = pisugar_socket_path()
    pisugar_hooks = pisugar_status()
    events = collect_button_events(limit=12)
    wifi = collect_wifi_failover_status()
    report = {
        "ok": bool(
            services["whisplay-daemon"]
            and services["sunset-radio-whisplay"]
            and services["sunset-radio-pisugar-button"]
            and whisplay_ping.get("ok")
            and settings.get("pisugar_home_button") == "none"
        ),
        "services": services,
        "enabledServices": enabled,
        "settings": {
            "path": WHISPLAY_SETTINGS_PATH,
            "pisugarHomeButton": settings.get("pisugar_home_button"),
        },
        "controls": dict(BUTTON_CONTROLS),
        "whisplay": {
            "socket": WHISPLAY_SOCKET,
            "ping": whisplay_ping,
            "buttonState": button_state.get("payload") if button_state.get("ok") else button_state,
        },
        "pisugar": {
            "socket": pisugar_socket,
            "hooks": pisugar_hooks,
            "summary": summarize_pisugar(settings, pisugar_socket, pisugar_hooks),
        },
        "wifiFailover": wifi,
        "events": events,
    }
    report["message"] = button_doctor_message(report)
    return report


def button_doctor_message(report=None):
    report = report if isinstance(report, dict) else collect_button_doctor()
    inactive = [name for name, ok in (report.get("services") or {}).items() if not ok]
    if inactive:
        return f"按键后台待重启：{', '.join(inactive[:2])}。"
    if report.get("settings", {}).get("pisugarHomeButton") != "none":
        return "PiSugar 返回键还会抢单击；需要设为 none。"
    if not (report.get("whisplay") or {}).get("ping", {}).get("ok"):
        return "按键通道待复查；Whisplay 按键 socket 没有回应。"
    latest = (report.get("events") or {}).get("latest") or {}
    if latest:
        action = latest.get("action") or latest.get("event")
        if action in ACTION_MESSAGES:
            return ACTION_MESSAGES[action]
        return f"按键已接入；最近一次是 {action}。"
    wifi = report.get("wifiFailover") or {}
    if wifi.get("enabledOnLongPress"):
        return f"按键映射已接入；{BUTTON_MAPPING_SUMMARY}"
    return "按键映射已接入；短按下一首，双击换城市；待机/静音长按打开电台，播放中长按关闭并安静待命；结果写状态卡。"


def main():
    print(json.dumps(collect_button_doctor(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
