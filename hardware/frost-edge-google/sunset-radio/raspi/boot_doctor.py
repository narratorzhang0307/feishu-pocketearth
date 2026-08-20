#!/usr/bin/env python3
import json
import os
import subprocess


DEFAULT_SERVICES = [
    "sunset-radio",
    "sunset-radio-pi-native",
    "sunset-radio-pisugar-button",
    "sunset-radio-whisplay",
    "sunset-radio-kiosk",
    "sunset-radio-mute-guard",
    "whisplay-daemon",
]
OPTIONAL_SERVICES = {"sunset-radio-voice"}
WATCHED_SERVICES = DEFAULT_SERVICES + sorted(OPTIONAL_SERVICES)
RESTART_WARN_THRESHOLD = int(os.environ.get("SUNSET_BOOT_RESTART_WARN_THRESHOLD", "3"))


def run(args):
    try:
        return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    except OSError as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def system_running_state():
    result = run(["systemctl", "is-system-running"])
    state = result.stdout.strip() or result.stderr.strip()
    return {
        "ok": result.returncode == 0 or state in {"running", "degraded"},
        "state": state,
        "returnCode": result.returncode,
    }


def service_properties(name):
    result = run([
        "systemctl",
        "show",
        f"{name}.service",
        "--property=LoadState,ActiveState,SubState,UnitFileState,Result,NRestarts,ExecMainStatus",
    ])
    props = {}
    for line in result.stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        props[key] = value
    if not props:
        props["error"] = (result.stderr or result.stdout).strip()
    return props


def service_status(name):
    props = service_properties(name)
    restart_count = 0
    try:
        restart_count = int(props.get("NRestarts") or 0)
    except ValueError:
        restart_count = 0
    optional = name in OPTIONAL_SERVICES
    active = props.get("ActiveState") == "active"
    enabled = props.get("UnitFileState") == "enabled"
    loaded = props.get("LoadState") == "loaded"
    required_ok = optional or (loaded and active and enabled)
    return {
        "name": name,
        "optional": optional,
        "ok": required_ok,
        "loaded": loaded,
        "active": active,
        "enabled": enabled,
        "loadState": props.get("LoadState", ""),
        "activeState": props.get("ActiveState", ""),
        "subState": props.get("SubState", ""),
        "unitFileState": props.get("UnitFileState", ""),
        "result": props.get("Result", ""),
        "restartCount": restart_count,
        "execMainStatus": props.get("ExecMainStatus", ""),
        "warning": restart_count > RESTART_WARN_THRESHOLD,
    }


def uptime_seconds():
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as handle:
            return int(float(handle.read().split()[0]))
    except (OSError, ValueError, IndexError):
        return -1


def collect_boot_doctor():
    system_state = system_running_state()
    services = [service_status(name) for name in WATCHED_SERVICES]
    failed_required = [item["name"] for item in services if not item["ok"] and not item["optional"]]
    warnings = [
        f"{item['name']} restarted {item['restartCount']} times"
        for item in services
        if item.get("warning")
    ]
    report = {
        "ok": not failed_required and bool(system_state.get("ok")),
        "system": system_state,
        "uptimeSec": uptime_seconds(),
        "services": services,
        "failedRequired": failed_required,
        "warnings": warnings,
    }
    report["message"] = boot_doctor_message(report)
    return report


def boot_doctor_message(report):
    if report.get("ok") and not report.get("warnings"):
        return "开机服务链路在线；核心后台都已启用并运行。"
    if report.get("failedRequired"):
        return f"有后台服务需要恢复：{', '.join(report['failedRequired'])}"
    if report.get("warnings"):
        return "后台服务在线，但有重启偏多的迹象；继续观察。"
    return "开机链路需要继续复查。"


def main():
    report = collect_boot_doctor()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
