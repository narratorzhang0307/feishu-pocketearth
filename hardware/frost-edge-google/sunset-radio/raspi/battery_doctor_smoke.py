#!/usr/bin/env python3
import json

import battery_doctor


def collect_with(device=None, sysfs=None, sockets=None, units=None, services=None, i2c=None, binaries=None):
    device = device if isinstance(device, dict) else {
        "ok": True,
        "battery": {"available": False, "source": "", "pisugar": {"available": False, "source": "pisugar_socket"}},
        "temperatureC": 50.1,
        "ip": "192.168.18.118",
        "audio": {"muted": True, "volume": "Volume: 0.00 [MUTED]"},
    }
    sysfs = sysfs if isinstance(sysfs, list) else []
    sockets = sockets if isinstance(sockets, list) else []
    units = units if isinstance(units, list) else []
    services = services if isinstance(services, list) else []
    i2c = i2c if isinstance(i2c, list) else ["/dev/i2c-1"]
    binaries = binaries if isinstance(binaries, dict) else {}
    originals = {
        "collect_device_status": battery_doctor.collect_device_status,
        "power_supply_nodes": battery_doctor.power_supply_nodes,
        "pisugar_units": battery_doctor.pisugar_units,
        "pisugar_services": battery_doctor.pisugar_services,
        "glob": battery_doctor.glob.glob,
        "exists": battery_doctor.os.path.exists,
        "which": battery_doctor.shutil.which,
    }

    def fake_glob(pattern):
        if pattern == "/dev/i2c-*":
            return list(i2c)
        return originals["glob"](pattern)

    def fake_exists(path):
        return path in set(sockets)

    def fake_which(name):
        return binaries.get(name) or None

    try:
        battery_doctor.collect_device_status = lambda: dict(device)
        battery_doctor.power_supply_nodes = lambda: list(sysfs)
        battery_doctor.pisugar_units = lambda: list(units)
        battery_doctor.pisugar_services = lambda: list(services)
        battery_doctor.glob.glob = fake_glob
        battery_doctor.os.path.exists = fake_exists
        battery_doctor.shutil.which = fake_which
        return battery_doctor.collect_battery_doctor()
    finally:
        battery_doctor.collect_device_status = originals["collect_device_status"]
        battery_doctor.power_supply_nodes = originals["power_supply_nodes"]
        battery_doctor.pisugar_units = originals["pisugar_units"]
        battery_doctor.pisugar_services = originals["pisugar_services"]
        battery_doctor.glob.glob = originals["glob"]
        battery_doctor.os.path.exists = originals["exists"]
        battery_doctor.shutil.which = originals["which"]


def main():
    readable_sysfs = collect_with(
        device={
            "ok": True,
            "battery": {
                "available": True,
                "name": "BAT0",
                "capacity": 82,
                "status": "Charging",
                "source": "sysfs",
            },
        },
        sysfs=[{"name": "BAT0", "type": "Battery", "capacity": 82, "status": "Charging"}],
    )
    readable_socket = collect_with(
        device={
            "ok": True,
            "battery": {
                "available": True,
                "name": "PiSugar",
                "capacity": 67,
                "status": "Unknown",
                "source": "pisugar_socket",
                "socket": "/tmp/pisugar-server.sock",
            },
        },
        sockets=["/tmp/pisugar-server.sock"],
    )
    service_hint = collect_with(
        units=[{"unit": "sunset-radio-pisugar-button.service", "state": "enabled"}],
        services=[{"unit": "sunset-radio-pisugar-button.service", "active": "active"}],
    )
    battery_reader_hint = collect_with(
        units=[{"unit": "pisugar-server.service", "state": "enabled"}],
        services=[{"unit": "pisugar-server.service", "active": "active"}],
    )
    binary_only = collect_with(
        binaries={"pisugar-server": "/usr/bin/pisugar-server"},
    )
    power_only = collect_with()
    no_i2c = collect_with(i2c=[])

    cases = [
        {
            "name": "readable sysfs battery reports level",
            "passed": readable_sysfs.get("readable") is True
            and "PiSugar 电量 82%" in readable_sysfs.get("message", "")
            and "无需处理" in readable_sysfs.get("nextAction", ""),
            "detail": readable_sysfs.get("message"),
        },
        {
            "name": "readable PiSugar socket reports level",
            "passed": readable_socket.get("readable") is True
            and readable_socket.get("pisugar", {}).get("source") == "pisugar_socket"
            and "67%" in readable_socket.get("message", ""),
            "detail": readable_socket.get("message"),
        },
        {
            "name": "button service without battery reading stays nonblocking",
            "passed": service_hint.get("ok") is True
            and service_hint.get("readable") is False
            and service_hint.get("hints", {}).get("pisugarButtonServicePresent") is True
            and service_hint.get("hints", {}).get("pisugarBatteryServicePresent") is False
            and service_hint.get("hints", {}).get("pisugarServerBinaryPresent") is False
            and "还没安装 pisugar-server" in service_hint.get("message", "")
            and "先安装 pisugar-server" in service_hint.get("nextAction", ""),
            "detail": service_hint.get("nextAction"),
        },
        {
            "name": "battery reader service without level stays actionable",
            "passed": battery_reader_hint.get("ok") is True
            and battery_reader_hint.get("readable") is False
            and battery_reader_hint.get("hints", {}).get("pisugarBatteryServicePresent") is True
            and "读数服务有线索" in battery_reader_hint.get("message", "")
            and "get battery" in battery_reader_hint.get("nextAction", ""),
            "detail": battery_reader_hint.get("nextAction"),
        },
        {
            "name": "pisugar-server binary without service asks for service enablement",
            "passed": binary_only.get("ok") is True
            and binary_only.get("readable") is False
            and binary_only.get("hints", {}).get("pisugarServerBinaryPresent") is True
            and "电量程序存在" in binary_only.get("message", "")
            and "安装/启用 systemd 服务" in binary_only.get("nextAction", ""),
            "detail": binary_only.get("nextAction"),
        },
        {
            "name": "i2c power without service remains usable",
            "passed": power_only.get("ok") is True
            and "电台可继续运行" in power_only.get("message", "")
            and "/tmp/pisugar-server.sock" in power_only.get("nextAction", ""),
            "detail": power_only.get("nextAction"),
        },
        {
            "name": "missing i2c asks for physical check",
            "passed": no_i2c.get("ok") is True
            and "I2C 通道" in no_i2c.get("message", "")
            and "/dev/i2c-*" in no_i2c.get("nextAction", ""),
            "detail": no_i2c.get("nextAction"),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
