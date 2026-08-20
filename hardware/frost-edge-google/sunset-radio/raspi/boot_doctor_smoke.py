#!/usr/bin/env python3
import json

import boot_doctor


def props(load="loaded", active="active", enabled="enabled", result="success", restarts=0, status="0"):
    return {
        "LoadState": load,
        "ActiveState": active,
        "SubState": "running" if active == "active" else "dead",
        "UnitFileState": enabled,
        "Result": result,
        "NRestarts": str(restarts),
        "ExecMainStatus": status,
    }


def collect_with(system=None, service_props=None, uptime=1234):
    system = system if isinstance(system, dict) else {"ok": True, "state": "running", "returnCode": 0}
    service_props = service_props if isinstance(service_props, dict) else {}
    originals = {
        "system_running_state": boot_doctor.system_running_state,
        "service_properties": boot_doctor.service_properties,
        "uptime_seconds": boot_doctor.uptime_seconds,
    }
    try:
        boot_doctor.system_running_state = lambda: dict(system)
        boot_doctor.service_properties = lambda name: dict(service_props.get(name) or props())
        boot_doctor.uptime_seconds = lambda: uptime
        return boot_doctor.collect_boot_doctor()
    finally:
        for name, original in originals.items():
            setattr(boot_doctor, name, original)


def main():
    healthy = collect_with()
    optional_voice_off = collect_with(service_props={"sunset-radio-voice": props(load="loaded", active="inactive", enabled="disabled")})
    required_inactive = collect_with(service_props={"sunset-radio": props(load="loaded", active="inactive", enabled="enabled")})
    required_disabled = collect_with(service_props={"sunset-radio-mute-guard": props(load="loaded", active="active", enabled="disabled")})
    restart_warning = collect_with(service_props={"sunset-radio-whisplay": props(restarts=5)})
    degraded_system = collect_with(system={"ok": True, "state": "degraded", "returnCode": 1})
    failed_system = collect_with(system={"ok": False, "state": "offline", "returnCode": 1})

    cases = [
        {
            "name": "healthy boot chain passes",
            "passed": healthy.get("ok") is True
            and healthy.get("failedRequired") == []
            and "开机服务链路在线" in healthy.get("message", ""),
            "detail": healthy.get("message"),
        },
        {
            "name": "optional voice service does not block boot readiness",
            "passed": optional_voice_off.get("ok") is True
            and optional_voice_off.get("failedRequired") == [],
            "detail": optional_voice_off.get("failedRequired"),
        },
        {
            "name": "inactive required service blocks readiness",
            "passed": required_inactive.get("ok") is False
            and "sunset-radio" in required_inactive.get("failedRequired", []),
            "detail": required_inactive.get("failedRequired"),
        },
        {
            "name": "disabled required mute guard blocks boot readiness",
            "passed": required_disabled.get("ok") is False
            and "sunset-radio-mute-guard" in required_disabled.get("failedRequired", []),
            "detail": required_disabled.get("failedRequired"),
        },
        {
            "name": "restart-heavy services warn without failing readiness",
            "passed": restart_warning.get("ok") is True
            and any("sunset-radio-whisplay restarted 5 times" == item for item in restart_warning.get("warnings", []))
            and "重启偏多" in restart_warning.get("message", ""),
            "detail": restart_warning.get("warnings"),
        },
        {
            "name": "systemd degraded state is accepted for device boot",
            "passed": degraded_system.get("ok") is True,
            "detail": degraded_system.get("system"),
        },
        {
            "name": "bad system state fails boot readiness",
            "passed": failed_system.get("ok") is False
            and "开机链路需要继续复查" in failed_system.get("message", ""),
            "detail": failed_system.get("message"),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
