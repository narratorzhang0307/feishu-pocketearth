#!/usr/bin/env python3
"""Secret-free live readiness report for the physical Frost Edge Node."""

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


def _command(*args):
    try:
        return subprocess.run(args, text=True, capture_output=True, timeout=5, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def _active(unit):
    return _command("systemctl", "is-active", unit).stdout.strip() == "active"


def _enabled(unit):
    return _command("systemctl", "is-enabled", unit).stdout.strip() == "enabled"


def _wifi():
    result = _command("nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi")
    for line in result.stdout.splitlines():
        if line.startswith("yes:"):
            return line[4:]
    return ""


def _whisplay_request(cmd="health.ping", payload=None):
    path = "/tmp/whisplay-daemon.sock"
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(3)
            client.connect(path)
            request = json.dumps({"version": 1, "cmd": cmd, "payload": payload or {}}) + "\n"
            client.sendall(request.encode())
            response = json.loads(client.makefile("r").readline())
        return response if response.get("ok") is True else {}
    except (OSError, ValueError, json.JSONDecodeError):
        return {}


def _whisplay_state():
    health = _whisplay_request()
    apps = _whisplay_request("app.list").get("payload", {}).get("apps", [])
    selected = next((app.get("app_id", "") for app in apps if app.get("selected")), "")
    return {
        "responding": bool(health),
        "foreground": health.get("payload", {}).get("foreground_app_id", ""),
        "safeForeground": health.get("payload", {}).get("foreground_app_id", "") in {
            "sunset-radio-status", "pocket-earth-launcher", "pocket-earth-edge"
        },
        "desktopDefault": selected,
        "safeDesktopDefault": selected == "pocket-earth-launcher",
    }


def _cjk_font():
    try:
        from frost_pi_device_driver import cjk_font_status
        ok, path = cjk_font_status()
        return {"glyphs": ok, "path": path}
    except (ImportError, OSError, ValueError) as exc:
        return {"glyphs": False, "path": str(exc)}


def _vendor_desktop_suppressed():
    try:
        from whisplay_pi_home_guard import guarded
        return guarded(Path("/home/pi/Whisplay/daemon/whisplay_daemon.py"))
    except (ImportError, OSError, ValueError):
        return False


def _mirror():
    try:
        with urlopen("http://127.0.0.1:8766/healthz", timeout=3) as response:
            return response.status == 200 and json.loads(response.read()).get("ok") is True
    except (URLError, TimeoutError, OSError, ValueError):
        return False


def _gemma_model_ids(payload):
    rows = payload.get("data", []) if isinstance(payload, dict) else []
    return [str(row.get("id") or "") for row in rows if isinstance(row, dict) and row.get("id")]


def _gemma_state():
    model_path = Path("/var/lib/pocket-earth-gemma/gemma-4-E4B_q4_0-it.gguf")
    model_ids = []
    try:
        with urlopen("http://127.0.0.1:8787/v1/models", timeout=3) as response:
            payload = json.loads(response.read())
            if response.status == 200:
                model_ids = _gemma_model_ids(payload)
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        pass
    return {
        "serviceActive": _active("pocket-earth-gemma.service"),
        "modelFile": str(model_path),
        "modelInstalled": model_path.is_file() and model_path.stat().st_size > 5_000_000_000,
        "loopbackResponding": "gemma-4-e4b-it" in model_ids,
        "modelIds": model_ids,
        "provider": "local-gemma",
        "modelOwner": "Google",
        "transport": "loopback",
    }


def _pisugar_request(command):
    path = os.environ.get("PISUGAR_SOCKET_PATH", "/tmp/pisugar-server.sock")
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(2)
            client.connect(path)
            client.sendall((command.strip() + "\n").encode())
            return client.recv(4096).decode("utf-8", "replace").strip()
    except OSError:
        return ""


def _metric(response, name):
    match = re.fullmatch(rf"{re.escape(name)}:\s*(-?\d+(?:\.\d+)?)", response.strip(), re.I)
    return float(match.group(1)) if match else None


def _boolean_metric(response, name):
    match = re.fullmatch(rf"{re.escape(name)}:\s*(true|false)", response.strip(), re.I)
    return match.group(1).lower() == "true" if match else None


def _text_metric(response, name):
    match = re.fullmatch(rf"{re.escape(name)}:\s*(.+)", response.strip(), re.I)
    return match.group(1).strip() if match else ""


def _cpu_temperature():
    result = _command("vcgencmd", "measure_temp")
    match = re.search(r"temp=([0-9.]+)", result.stdout)
    if match:
        return round(float(match.group(1)), 1)
    try:
        return round(float(Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()) / 1000, 1)
    except (OSError, ValueError):
        return None


def _pisugar_config():
    path = Path(os.environ.get("PISUGAR_CONFIG_PATH", "/etc/pisugar-server/config.json"))
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, json.JSONDecodeError):
        return {}


def _safe_shutdown(config, hook_enabled):
    level = config.get("auto_shutdown_level")
    delay = config.get("auto_shutdown_delay")
    soft_poweroff = config.get("soft_poweroff") is True
    shell = str(config.get("soft_poweroff_shell") or "").strip()
    command = "expected" if shell == "shutdown --poweroff 0" else ("custom" if shell else "missing")
    return {
        "levelPercent": level,
        "delaySeconds": delay,
        "softPoweroff": soft_poweroff,
        "command": command,
        "shutdownHookEnabled": hook_enabled,
        "configured": (
            level == 10
            and delay == 30
            and soft_poweroff
            and command == "expected"
            and hook_enabled
        ),
    }


def _power_state():
    config = _pisugar_config()
    server_active = _active("pisugar-server.service")
    server_enabled = _enabled("pisugar-server.service")
    hook_enabled = _enabled("pisugar-poweroff.service")
    model_raw = _pisugar_request("get model") if server_active else ""
    battery_raw = _pisugar_request("get battery") if server_active else ""
    plugged_raw = _pisugar_request("get battery_power_plugged") if server_active else ""
    temperature_raw = _pisugar_request("get temperature") if server_active else ""
    battery = _metric(battery_raw, "battery")
    cpu_temperature = _cpu_temperature()
    safe_shutdown = _safe_shutdown(config, hook_enabled)
    model = _text_metric(model_raw, "model")
    model_ok = model == "PiSugar 3"
    bus_ok = config.get("i2c_bus") == 1
    battery_readable = battery is not None and 0 <= battery <= 100
    temperature_healthy = cpu_temperature is not None and cpu_temperature < 80
    portable_ready = all([
        server_active,
        server_enabled,
        model_ok,
        bus_ok,
        battery_readable,
        safe_shutdown["configured"],
    ])
    return {
        "serverActive": server_active,
        "serverEnabled": server_enabled,
        "model": model,
        "modelCorrect": model_ok,
        "i2cBus": config.get("i2c_bus"),
        "i2cBusCorrect": bus_ok,
        "batteryReadable": battery_readable,
        "batteryPercent": round(battery, 1) if battery_readable else None,
        "batteryRaw": battery_raw[:120],
        "externalPower": _boolean_metric(plugged_raw, "battery_power_plugged"),
        "pisugarTemperatureC": _metric(temperature_raw, "temperature"),
        "cpuTemperatureC": cpu_temperature,
        "temperatureHealthy": temperature_healthy,
        "safeShutdown": safe_shutdown,
        "enduranceTelemetryReady": battery_readable,
        "portableReady": portable_ready,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check the live Pocket Earth Raspberry Pi lane")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args(argv)
    state_cursor = Path("/var/lib/pocket-earth-edge/frost-feed.cursor")
    legacy_cursor = Path.home() / ".local" / "state" / "pocket-earth" / "frost-feed.cursor"
    cursor = state_cursor if state_cursor.exists() else legacy_cursor
    runtime_snapshot = Path("/run/pocket-earth-edge/live.png")
    legacy_snapshot = Path("/tmp/pocket-earth-edge-live.png")
    snapshot = Path(os.environ.get(
        "FROST_MIRROR_PATH",
        str(runtime_snapshot if runtime_snapshot.exists() else legacy_snapshot),
    ))
    whisplay = _whisplay_state()
    cjk = _cjk_font()
    power = _power_state()
    gemma = _gemma_state()
    report = {
        "ok": True,
        "hostname": socket.gethostname(),
        "wifi": _wifi(),
        "services": {
            "networkManager": _active("NetworkManager.service"),
            "ssh": _active("ssh.service"),
            "whisplay": _active("whisplay-daemon.service"),
            "sunsetRadio": _active("sunset-radio.service"),
            "pocketEarthEdge": _active("pocket-earth-edge.service"),
            "projectLauncher": _active("pocket-earth-launcher.service"),
            "pocketEarthGemma": gemma["serviceActive"],
        },
        "hardware": {
            "whisplayResponding": whisplay["responding"],
            "foreground": whisplay["foreground"],
            "safeForeground": whisplay["safeForeground"],
            "desktopDefault": whisplay["desktopDefault"],
            "safeDesktopDefault": whisplay["safeDesktopDefault"],
            "vendorDesktopSuppressed": _vendor_desktop_suppressed(),
            "cjkFont": cjk["path"],
            "cjkGlyphs": cjk["glyphs"],
            "speakerPlayer": bool(shutil.which("ffplay")),
            "offlineTts": bool(shutil.which("espeak-ng") or shutil.which("espeak")),
        },
        "power": power,
        "localInference": gemma,
        "eventLane": {
            "cursorPath": str(cursor),
            "snapshotPath": str(snapshot),
            "mirrorResponding": _mirror(),
            "snapshotReady": snapshot.is_file() and snapshot.stat().st_size > 1024,
            "cursorCommitted": cursor.is_file() and cursor.stat().st_size > 8,
        },
    }
    critical = [
        report["services"]["networkManager"],
        report["services"]["ssh"],
        report["services"]["whisplay"],
        report["services"]["pocketEarthEdge"],
        report["services"]["projectLauncher"],
        report["localInference"]["modelInstalled"],
        report["localInference"]["loopbackResponding"],
        report["hardware"]["whisplayResponding"],
        report["hardware"]["safeForeground"],
        report["hardware"]["vendorDesktopSuppressed"],
        report["hardware"]["cjkGlyphs"],
        report["hardware"]["speakerPlayer"],
        report["hardware"]["offlineTts"],
        report["power"]["portableReady"],
        report["power"]["temperatureHealthy"],
        report["eventLane"]["mirrorResponding"],
    ]
    report["ok"] = all(critical)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] or not args.strict else 2


if __name__ == "__main__":
    raise SystemExit(main())
