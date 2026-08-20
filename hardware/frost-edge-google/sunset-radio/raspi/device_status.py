#!/usr/bin/env python3
import glob
import json
import os
import re
import shutil
import socket
import subprocess
from pathlib import Path

PISUGAR_SOCKET_CANDIDATES = tuple(
    item.strip()
    for item in os.environ.get("PISUGAR_SOCKET_PATHS", "/tmp/pisugar-server.sock:/run/pisugar-server.sock").split(":")
    if item.strip()
)


def run(args, timeout=1.5):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)


def read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def read_number(path, scale=1.0):
    value = read_text(path)
    try:
        return round(float(value) / scale, 1)
    except ValueError:
        return None


def pisugar_request(sock_path, command, timeout=1.5):
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(timeout)
            client.connect(sock_path)
            client.sendall((command.strip() + "\n").encode("utf-8"))
            chunks = []
            while True:
                try:
                    data = client.recv(4096)
                except socket.timeout:
                    break
                if not data:
                    break
                chunks.append(data)
                if b"\n" in data:
                    break
    except OSError:
        return ""
    text = b"".join(chunks).decode("utf-8", "replace")
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


def pisugar_battery_status():
    for sock_path in PISUGAR_SOCKET_CANDIDATES:
        if not os.path.exists(sock_path):
            continue
        line = pisugar_request(sock_path, "get battery")
        match = re.search(r"battery:\s*(-?\d+)", line, flags=re.I)
        if not match:
            return {
                "available": False,
                "source": "pisugar_socket",
                "socket": sock_path,
                "raw": line[:120],
            }
        level = max(0, min(100, int(match.group(1))))
        return {
            "available": True,
            "name": "PiSugar",
            "capacity": level,
            "status": "Unknown",
            "model": "PiSugar",
            "source": "pisugar_socket",
            "socket": sock_path,
        }
    return {
        "available": False,
        "source": "pisugar_socket",
        "socket": "",
    }


def battery_status():
    for root in sorted(glob.glob("/sys/class/power_supply/*")):
        kind = read_text(os.path.join(root, "type")).lower()
        capacity = read_number(os.path.join(root, "capacity"))
        if kind != "battery" and capacity is None:
            continue
        return {
            "available": True,
            "name": os.path.basename(root),
            "capacity": capacity,
            "status": read_text(os.path.join(root, "status")) or "Unknown",
            "model": read_text(os.path.join(root, "model_name")),
            "source": "sysfs",
        }
    status = pisugar_battery_status()
    if status.get("available"):
        return status
    return {
        "available": False,
        "source": "",
        "pisugar": status,
    }


def temperature_c():
    if shutil.which("vcgencmd"):
        try:
            result = run(["vcgencmd", "measure_temp"])
            match = re.search(r"temp=([0-9.]+)", result.stdout)
            if match:
                return round(float(match.group(1)), 1)
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    return read_number("/sys/class/thermal/thermal_zone0/temp", scale=1000)


def ipv4_address():
    try:
        result = run(["hostname", "-I"])
        for item in result.stdout.split():
            if "." in item and not item.startswith("127."):
                return item
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        result = run(["ip", "-4", "route", "get", "1.1.1.1"])
        match = re.search(r"\bsrc\s+([0-9.]+)", result.stdout)
        if match:
            return match.group(1)
    except (OSError, subprocess.SubprocessError):
        pass
    return ""


def uptime_minutes():
    raw = read_text("/proc/uptime").split()
    try:
        return int(float(raw[0]) // 60)
    except (IndexError, ValueError):
        return None


def disk_percent(path="/"):
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return None
    return round((usage.used / usage.total) * 100, 1)


def audio_status():
    if not shutil.which("wpctl"):
        return {"available": False, "muted": False, "volume": ""}
    try:
        result = run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])
        text = result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        text = ""
    return {
        "available": bool(text),
        "muted": "MUTED" in text,
        "volume": text,
    }


def collect_device_status():
    battery = battery_status()
    temp = temperature_c()
    address = ipv4_address()
    return {
        "ok": True,
        "battery": battery,
        "temperatureC": temp,
        "ip": address,
        "ipShort": address.rsplit(".", 1)[-1] if address else "",
        "uptimeMinutes": uptime_minutes(),
        "diskPercent": disk_percent(),
        "audio": audio_status(),
    }


def display_summary(status):
    battery = (status or {}).get("battery") or {}
    if battery.get("available") and battery.get("capacity") is not None:
        suffix = "+" if str(battery.get("status") or "").lower() == "charging" else "%"
        return f"BAT {int(round(battery['capacity']))}{suffix}"
    temp = (status or {}).get("temperatureC")
    ip_short = (status or {}).get("ipShort") or ""
    if temp is not None and ip_short:
        return f"{int(round(temp))}C .{ip_short}"
    if temp is not None:
        return f"{int(round(temp))}C"
    if ip_short:
        return f"WiFi .{ip_short}"
    return ""


def main():
    status = collect_device_status()
    status["summary"] = display_summary(status)
    print(json.dumps(status, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
