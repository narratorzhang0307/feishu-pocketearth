#!/usr/bin/env python3
import json

import button_doctor


def collect_with(services=None, settings=None, latest=None, ping=None, pisugar_hooks=None, pisugar_socket=None, wifi=None):
    services = services if isinstance(services, dict) else {
        "whisplay-daemon": True,
        "sunset-radio-whisplay": True,
        "sunset-radio-pisugar-button": True,
    }
    settings = settings if isinstance(settings, dict) else {"pisugar_home_button": "none"}
    latest = latest if isinstance(latest, dict) else {}
    ping = ping if isinstance(ping, dict) else {"ok": True}
    pisugar_hooks = pisugar_hooks if pisugar_hooks is not None else {"ok": True, "source": "smoke"}
    pisugar_socket = "/tmp/pisugar-server.sock" if pisugar_socket is None else pisugar_socket
    wifi = wifi if isinstance(wifi, dict) else {
        "enabledOnLongPress": True,
        "configured": True,
        "profileCount": 2,
        "profiles": [
            {"ssid": "phone hotspot", "priority": 100, "connection": "Sunset Radio - phone hotspot", "passwordSet": True},
            {"ssid": "backup hotspot", "priority": 90, "connection": "Sunset Radio - backup hotspot", "passwordSet": True},
        ],
        "message": "长按打开电台前会优先尝试连接热点：phone hotspot。",
    }
    originals = {
        "active_service": button_doctor.active_service,
        "enabled_service": button_doctor.enabled_service,
        "load_settings": button_doctor.load_settings,
        "whisplay_request": button_doctor.whisplay_request,
        "collect_button_events": button_doctor.collect_button_events,
        "pisugar_status": button_doctor.pisugar_status,
        "pisugar_socket_path": button_doctor.pisugar_socket_path,
        "collect_wifi_failover_status": button_doctor.collect_wifi_failover_status,
    }

    def fake_whisplay_request(cmd, payload=None, timeout=1.5):
        if cmd == "health.ping":
            return dict(ping)
        if cmd == "button.get_state":
            return {"ok": True, "payload": {"pressed": False, "source": "smoke"}}
        return {"ok": False, "error": "unknown smoke command"}

    try:
        button_doctor.active_service = lambda name: bool(services.get(name))
        button_doctor.enabled_service = lambda name: bool(services.get(name))
        button_doctor.load_settings = lambda: dict(settings)
        button_doctor.whisplay_request = fake_whisplay_request
        button_doctor.collect_button_events = lambda limit=12: {
            "ok": True,
            "latest": dict(latest),
            "recent": [dict(latest)] if latest else [],
            "count": 1 if latest else 0,
        }
        button_doctor.pisugar_status = lambda: pisugar_hooks
        button_doctor.pisugar_socket_path = lambda: pisugar_socket
        button_doctor.collect_wifi_failover_status = lambda: dict(wifi)
        return button_doctor.collect_button_doctor()
    finally:
        for name, original in originals.items():
            setattr(button_doctor, name, original)


def main():
    healthy = collect_with()
    long_press = collect_with(latest={"event": "long", "action": "切换声音"})
    single_press = collect_with(latest={"event": "single", "action": "下一首"})
    double_press = collect_with(latest={"event": "double", "action": "换个城市"})
    stolen_home = collect_with(settings={"pisugar_home_button": "single"})
    inactive = collect_with(services={"whisplay-daemon": True, "sunset-radio-whisplay": False})
    socket_down = collect_with(ping={"ok": False, "error": "offline"})
    whisplay_only = collect_with(
        pisugar_socket="",
        pisugar_hooks=[
            {"ok": False, "missing": True, "name": "single-enable"},
            {"ok": False, "missing": True, "name": "double-enable"},
        ],
    )

    cases = [
        {
            "name": "healthy button doctor shows all physical controls",
            "passed": healthy.get("ok") is True
            and healthy.get("controls", {}).get("single") == "下一首"
            and healthy.get("controls", {}).get("double") == "换个城市"
            and healthy.get("controls", {}).get("long") == "开/关电台"
            and all(text in healthy.get("message", "") for text in ("短按下一首", "双击换城市", "待机/静音长按", "播放中长按", "结果写状态卡")),
            "detail": healthy.get("message"),
        },
        {
            "name": "long press status explains radio power behavior",
            "passed": "手机热点" in long_press.get("message", "")
            and "待机/静音" in long_press.get("message", "")
            and "播放当前日落城市" in long_press.get("message", "")
            and "安静待命" in long_press.get("message", "")
            and "结果写状态卡" in long_press.get("message", ""),
            "detail": long_press.get("message"),
        },
        {
            "name": "button doctor exposes hotspot failover without passwords",
            "passed": healthy.get("wifiFailover", {}).get("enabledOnLongPress") is True
            and healthy.get("wifiFailover", {}).get("profileCount") == 2
            and healthy.get("wifiFailover", {}).get("profiles", [{}])[0].get("passwordSet") is True
            and "secret" not in json.dumps(healthy.get("wifiFailover"), ensure_ascii=False),
            "detail": healthy.get("wifiFailover"),
        },
        {
            "name": "single and double press statuses stay concrete",
            "passed": "下一首" in single_press.get("message", "")
            and "双击换城市" in single_press.get("message", "")
            and "下一座城市" in double_press.get("message", "")
            and "待机/静音长按" in double_press.get("message", ""),
            "detail": {"single": single_press.get("message"), "double": double_press.get("message")},
        },
        {
            "name": "PiSugar default home action warning remains explicit",
            "passed": stolen_home.get("ok") is False and "设为 none" in stolen_home.get("message", ""),
            "detail": stolen_home.get("message"),
        },
        {
            "name": "missing PiSugar socket is not scary when Whisplay owns the orange button",
            "passed": whisplay_only.get("ok") is True
            and whisplay_only.get("pisugar", {}).get("summary", {}).get("mode") == "whisplay_button"
            and whisplay_only.get("pisugar", {}).get("summary", {}).get("socketAvailable") is False
            and "不会抢短按" in whisplay_only.get("pisugar", {}).get("summary", {}).get("message", ""),
            "detail": whisplay_only.get("pisugar", {}).get("summary"),
        },
        {
            "name": "inactive button service is reported by name",
            "passed": inactive.get("ok") is False and "sunset-radio-whisplay" in inactive.get("message", ""),
            "detail": inactive.get("message"),
        },
        {
            "name": "Whisplay socket failure is not described as ready",
            "passed": socket_down.get("ok") is False and "socket" in socket_down.get("message", ""),
            "detail": socket_down.get("message"),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
