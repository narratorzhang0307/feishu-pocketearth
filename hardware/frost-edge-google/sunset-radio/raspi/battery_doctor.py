#!/usr/bin/env python3
import glob
import json
import os
import shutil
import subprocess

from device_status import PISUGAR_SOCKET_CANDIDATES, collect_device_status, read_number, read_text


PISUGAR_BINARY_NAMES = ("pisugar-server", "pisugar-programmer")


def run(args, timeout=1.5):
    try:
        return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def power_supply_nodes():
    nodes = []
    for root in sorted(glob.glob("/sys/class/power_supply/*")):
        nodes.append({
            "name": os.path.basename(root),
            "type": read_text(os.path.join(root, "type")),
            "capacity": read_number(os.path.join(root, "capacity")),
            "status": read_text(os.path.join(root, "status")),
            "model": read_text(os.path.join(root, "model_name")),
        })
    return nodes


def pisugar_units():
    result = run(["systemctl", "list-unit-files", "*pisugar*", "--no-legend", "--no-pager"])
    units = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            units.append({"unit": parts[0], "state": parts[1]})
    return units


def pisugar_services():
    result = run(["systemctl", "list-units", "*pisugar*", "--all", "--no-legend", "--no-pager"])
    services = []
    for line in result.stdout.splitlines():
        parts = line.split(None, 4)
        if len(parts) >= 4:
            services.append({
                "unit": parts[0],
                "load": parts[1],
                "active": parts[2],
                "sub": parts[3],
                "description": parts[4] if len(parts) > 4 else "",
            })
    return services


def pisugar_binaries():
    return [
        {"name": name, "path": shutil.which(name) or ""}
        for name in PISUGAR_BINARY_NAMES
    ]


def pisugar_unit_name(item):
    return str((item or {}).get("unit") or "").lower()


def pisugar_description(item):
    return str((item or {}).get("description") or "").lower()


def is_pisugar_button_unit(item):
    name = pisugar_unit_name(item)
    description = pisugar_description(item)
    return "pisugar-button" in name or ("button" in name and "pisugar" in name) or "side button" in description


def is_pisugar_battery_reader_unit(item):
    name = pisugar_unit_name(item)
    if not name or is_pisugar_button_unit(item):
        return False
    return "pisugar" in name


def collect_battery_doctor():
    device = collect_device_status()
    battery = device.get("battery") or {}
    sockets = [{"path": path, "exists": os.path.exists(path)} for path in PISUGAR_SOCKET_CANDIDATES]
    i2c = sorted(glob.glob("/dev/i2c-*"))
    sysfs = power_supply_nodes()
    units = pisugar_units()
    services = pisugar_services()
    binaries = pisugar_binaries()
    readable = bool(battery.get("available") and battery.get("capacity") is not None)
    socket_hint = any(item.get("exists") for item in sockets)
    server_binary_hint = any(
        item.get("name") == "pisugar-server" and item.get("path")
        for item in binaries
    )
    button_service_hint = any(is_pisugar_button_unit(item) for item in units + services)
    battery_service_hint = socket_hint or any(is_pisugar_battery_reader_unit(item) for item in units + services)
    report = {
        "ok": True,
        "readable": readable,
        "device": device,
        "sysfs": sysfs,
        "pisugar": battery.get("pisugar") or battery if battery.get("source") == "pisugar_socket" else {},
        "sockets": sockets,
        "services": services,
        "unitFiles": units,
        "binaries": binaries,
        "i2c": i2c,
        "hints": {
            "i2cPresent": bool(i2c),
            "pisugarServicePresent": bool(units or services or socket_hint),
            "pisugarBatteryServicePresent": battery_service_hint,
            "pisugarButtonServicePresent": button_service_hint,
            "pisugarServerBinaryPresent": server_binary_hint,
            "pisugarSocketPresent": socket_hint,
            "sysfsBatteryPresent": bool(sysfs),
        },
    }
    report["message"] = battery_doctor_message(report)
    report["nextAction"] = battery_doctor_next_action(report)
    return report


def battery_doctor_message(report=None):
    report = report if isinstance(report, dict) else collect_battery_doctor()
    battery = ((report.get("device") or {}).get("battery") or {})
    if report.get("readable"):
        level = int(round(battery.get("capacity") or 0))
        status = str(battery.get("status") or "Unknown")
        return f"PiSugar 电量 {level}% · {status}。"

    hints = report.get("hints") or {}
    if hints.get("i2cPresent") and hints.get("pisugarBatteryServicePresent"):
        return "PiSugar 电量读数服务有线索，但还没有返回电量。"
    if hints.get("i2cPresent") and hints.get("pisugarButtonServicePresent") and not hints.get("pisugarServerBinaryPresent"):
        return "PiSugar 按键服务在线；还没安装 pisugar-server 电量读数程序，电台可继续运行。"
    if hints.get("i2cPresent") and hints.get("pisugarServerBinaryPresent"):
        return "PiSugar 电量程序存在；服务或 socket 还没接入，电台可继续运行。"
    if hints.get("i2cPresent") and hints.get("pisugarButtonServicePresent"):
        return "PiSugar 按键服务在线；电量读数服务或 socket 还没接入，电台可继续运行。"
    if hints.get("i2cPresent") and not hints.get("pisugarServicePresent"):
        return "PiSugar 在供电；电量读数服务还没接入，电台可继续运行。"
    if not hints.get("i2cPresent"):
        return "还看不到 I2C 通道；先确认 HAT 接触和系统接口。"
    if hints.get("pisugarServicePresent"):
        return "PiSugar 服务有线索，但还没有返回电量。"
    return "电池读数还没出来；先保持供电稳定。"


def battery_doctor_next_action(report=None):
    report = report if isinstance(report, dict) else collect_battery_doctor()
    if report.get("readable"):
        return "电量读数可用；无需处理。"

    hints = report.get("hints") or {}
    if not hints.get("i2cPresent"):
        return "检查 HAT 接触和系统 I2C 接口；恢复 /dev/i2c-* 后再看电量。"
    if hints.get("pisugarBatteryServicePresent"):
        return "检查 PiSugar 电量服务日志和 socket 权限，确认 get battery 能返回百分比。"
    if hints.get("pisugarButtonServicePresent") and not hints.get("pisugarServerBinaryPresent"):
        return "橙色键服务已独立在线；若要显示电量，先安装 pisugar-server，再启用服务暴露 /tmp/pisugar-server.sock。"
    if hints.get("pisugarServerBinaryPresent"):
        return "pisugar-server 程序存在；为它安装/启用 systemd 服务并暴露 /tmp/pisugar-server.sock。"
    if hints.get("pisugarButtonServicePresent"):
        return "橙色键服务已独立在线；若要显示电量，启用 PiSugar 电量服务或暴露 pisugar-server socket。"
    if not hints.get("pisugarServicePresent"):
        return "启用 PiSugar 电量服务或提供 /tmp/pisugar-server.sock；电台可继续静默运行。"
    return "检查 PiSugar 服务状态和 socket 权限。"


def main():
    report = collect_battery_doctor()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
