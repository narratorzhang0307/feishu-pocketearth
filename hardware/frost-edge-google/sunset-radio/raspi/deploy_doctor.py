#!/usr/bin/env python3
import argparse
import json
import os
import time

from health_check import run


ROOT = os.environ.get("SUNSET_PI_ROOT", "/home/pi/sunset-radio")
REQUIRED_PATHS = [
    "package.json",
    "server.mjs",
    "dist/index.html",
    "resource-library/cities",
    "raspi/pi_command_daemon.py",
    "raspi/whisplay_status.py",
    "raspi/health_check.py",
    "raspi/silence_doctor.py",
    "raspi/silence_doctor_smoke.py",
    "raspi/service_doctor.py",
    "raspi/service_doctor_smoke.py",
    "raspi/boot_doctor.py",
    "raspi/boot_doctor_smoke.py",
    "raspi/deploy_doctor_smoke.py",
    "raspi/capability_doctor.py",
    "raspi/capability_doctor_smoke.py",
    "raspi/battery_doctor.py",
    "raspi/battery_doctor_smoke.py",
    "raspi/collaboration_guard.py",
    "raspi/collaboration_guard_smoke.py",
    "raspi/AVATAR.md",
    "raspi/frost_avatar.py",
    "raspi/frost_poses.json",
    "raspi/queue_doctor.py",
    "raspi/queue_doctor_smoke.py",
    "raspi/screen_doctor.py",
    "raspi/screen_doctor_smoke.py",
    "raspi/whisplay_preview.py",
    "raspi/whisplay_font_smoke.py",
    "raspi/button_doctor.py",
    "raspi/button_doctor_smoke.py",
    "raspi/voice_doctor.py",
    "raspi/tts_doctor.py",
    "raspi/chat_agent.py",
    "raspi/chat_agent_smoke.py",
    "raspi/avatar_smoke.py",
    "raspi/whisplay_media_smoke.py",
    "raspi/button_logic_smoke.py",
    "raspi/button_command_smoke.py",
    "raspi/button_events_smoke.py",
    "raspi/pi_command_wake_smoke.py",
    "raspi/pi_copy_smoke.py",
    "raspi/voice_route_smoke.py",
    "raspi/audio_mode_smoke.py",
    "raspi/runtime_maintenance_smoke.py",
    "raspi/silent_command_smoke.py",
    "raspi/ambient_observer_smoke.py",
    "raspi/ambient_memory_smoke.py",
    "raspi/pisugar_button.py",
    "raspi/mute_guard.sh",
    "raspi/unattended_check.py",
    "raspi/unattended_check_smoke.py",
    "raspi/pi_remote_quick_check.py",
    "raspi/pi_remote_quick_check_smoke.py",
    "raspi/pi_outdoor_ready_check.py",
    "raspi/pi_outdoor_ready_check_smoke.py",
    "raspi/runtime_maintenance.py",
    "raspi/ambient_agent.py",
    "raspi/ambient_agent_smoke.py",
    "raspi/ambient_policy.py",
    "raspi/ambient_policy_smoke.py",
    "raspi/ambient_plan.py",
    "raspi/ambient_plan_smoke.py",
    "raspi/ambient_privacy.py",
    "raspi/ambient_privacy_smoke.py",
    "raspi/ambient_memory.py",
    "raspi/camera_status.py",
    "raspi/camera_status_smoke.py",
    "raspi/camera_doctor.py",
    "raspi/camera_doctor_smoke.py",
]

SERVICE_REFERENCES = {
    "sunset-radio": ["server.mjs", ".env.runtime"],
    "sunset-radio-pi-native": ["raspi/pi_command_daemon.py", "resource-library/cities"],
    "sunset-radio-whisplay": ["raspi/whisplay_status.py"],
    "sunset-radio-kiosk": ["raspi/sunset_kiosk.sh"],
    "sunset-radio-mute-guard": ["raspi/mute_guard.sh"],
}

CONTENT_GUARDS = {
    "raspi/ambient_agent.py": [
        '"capture": "manual_only"',
        '"autoCapture": False',
        '"imageRetention": "deleted_after_analysis"',
        '"directPlayerCommand": False',
        "observe_once(capture=True)",
    ],
    "raspi/ambient_policy.py": [
        "evaluate_state_confirmation",
        "hold_evaluate",
        "POLICY_CONFIRM_MIN_USABLE",
    ],
    "raspi/ambient_privacy.py": [
        '"capture": "manual_only"',
        '"autoCapture": False',
        '"imageRetention": "deleted_after_analysis"',
        '"identity": "not_used"',
        '"emotion": "not_inferred"',
    ],
}

EXPERIMENTAL_PATHS = {
    "raspi/ambient_daemon.py": "隔离环境相机实验文件存在；未纳入主线服务前只作为观察对象。",
    "raspi/AMBIENT.md": "隔离环境相机说明存在；合并前仍需通过隐私和手动触发守卫。",
}

EXPERIMENTAL_PATH_ABSENT_MESSAGES = {
    "raspi/ambient_daemon.py": "未发现隔离环境相机实验文件；仍只作为观察对象。",
    "raspi/AMBIENT.md": "未发现隔离环境相机说明；合并前仍需通过隐私和手动触发守卫。",
}

EXPERIMENTAL_SERVICES = {
    "sunset-radio-ambient": "隔离环境相机实验服务已安装；合并前需确认只允许手动观察。",
    "sunset-radio-ambient-daemon": "隔离环境相机实验守护服务已安装；合并前需确认只允许手动观察。",
    "sunset-radio-camera": "隔离环境相机实验服务已安装；合并前需确认只允许手动观察。",
}


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def path_status(root, relpath):
    path = os.path.join(root, relpath)
    exists = os.path.exists(path)
    payload = {
        "path": path,
        "exists": exists,
        "kind": "missing",
    }
    if not exists:
        return payload
    payload["kind"] = "dir" if os.path.isdir(path) else "file"
    try:
        stat = os.stat(path)
        payload["mtime"] = int(stat.st_mtime)
        payload["size"] = stat.st_size
    except OSError as exc:
        payload["error"] = str(exc)
    return payload


def systemd_properties(service):
    result = run([
        "systemctl",
        "show",
        f"{service}.service",
        "--property=LoadState,ActiveState,UnitFileState,FragmentPath,ExecStart,Environment,EnvironmentFiles",
        "--no-pager",
    ])
    props = {
        "ok": result.returncode == 0,
        "returnCode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }
    for line in result.stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        props[key] = value
    return props


def service_status(root, service, required_refs):
    props = systemd_properties(service)
    haystack = "\n".join(
        str(props.get(key) or "")
        for key in ("FragmentPath", "ExecStart", "Environment", "EnvironmentFiles")
    )
    refs = {}
    for relpath in required_refs:
        refs[relpath] = os.path.join(root, relpath) in haystack
    loaded = props.get("LoadState") == "loaded"
    return {
        "ok": bool(props.get("ok")) and loaded and all(refs.values()),
        "loaded": loaded,
        "fragment": props.get("FragmentPath", ""),
        "references": refs,
    }


def content_guard_status(root, relpath, tokens):
    path = os.path.join(root, relpath)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read()
    except OSError as exc:
        return {"ok": False, "missing": list(tokens), "error": str(exc)}
    missing = [token for token in tokens if token not in text]
    return {"ok": not missing, "missing": missing}


def experimental_file_warnings(root):
    files = {}
    warnings = []
    for relpath, message in EXPERIMENTAL_PATHS.items():
        status = path_status(root, relpath)
        status["message"] = message if status.get("exists") else EXPERIMENTAL_PATH_ABSENT_MESSAGES.get(relpath, "")
        files[relpath] = status
        if status.get("exists"):
            warnings.append(message)
    return files, warnings


def experimental_service_warnings(check_systemd=True):
    services = {}
    warnings = []
    if not check_systemd:
        return services, warnings
    for service, message in EXPERIMENTAL_SERVICES.items():
        props = systemd_properties(service)
        loaded = props.get("LoadState") == "loaded"
        services[service] = {
            "loaded": loaded,
            "active": props.get("ActiveState") == "active",
            "enabled": props.get("UnitFileState") == "enabled",
            "fragment": props.get("FragmentPath", ""),
            "execStart": props.get("ExecStart", ""),
            "message": message if loaded else "未接入常驻相机服务；仍只是观察项。",
        }
        if loaded:
            warnings.append(message)
    return services, warnings


def collect_deploy_doctor(root=ROOT, check_systemd=True):
    root = os.path.abspath(root)
    paths = {relpath: path_status(root, relpath) for relpath in REQUIRED_PATHS}
    path_ok = all(item.get("exists") for item in paths.values())
    content_guards = {
        relpath: content_guard_status(root, relpath, tokens)
        for relpath, tokens in CONTENT_GUARDS.items()
    }
    content_ok = all(item.get("ok") for item in content_guards.values())
    services = {}
    if check_systemd:
        services = {
            service: service_status(root, service, refs)
            for service, refs in SERVICE_REFERENCES.items()
        }
    service_ok = all(item.get("ok") for item in services.values()) if check_systemd else True
    experimental_files, file_warnings = experimental_file_warnings(root)
    experimental_services, service_warnings = experimental_service_warnings(check_systemd=check_systemd)
    warnings = file_warnings + service_warnings
    dist = paths.get("dist/index.html") or {}
    report = {
        "ok": bool(path_ok and content_ok and service_ok),
        "checkedAt": now_iso(),
        "root": root,
        "paths": paths,
        "contentGuards": content_guards,
        "experimentalFiles": experimental_files,
        "experimentalServices": experimental_services,
        "warnings": warnings,
        "services": services,
        "dist": {
            "exists": bool(dist.get("exists")),
            "mtime": dist.get("mtime"),
            "size": dist.get("size"),
        },
    }
    report["message"] = deploy_doctor_message(report)
    return report


def deploy_doctor_message(report):
    missing = [name for name, item in (report.get("paths") or {}).items() if not item.get("exists")]
    if missing:
        return f"树莓派部署缺少文件：{', '.join(missing[:3])}"
    drifted = [name for name, item in (report.get("contentGuards") or {}).items() if not item.get("ok")]
    if drifted:
        return f"树莓派运行文件疑似被覆盖：{', '.join(drifted[:3])}"
    broken = [name for name, item in (report.get("services") or {}).items() if not item.get("ok")]
    if broken:
        return f"树莓派服务指向需要复查：{', '.join(broken[:3])}"
    experimental_services = [
        name for name, item in (report.get("experimentalServices") or {}).items() if item.get("loaded")
    ]
    if experimental_services:
        return f"树莓派部署指向一致；相机实验服务已接入：{', '.join(experimental_services[:3])}"
    if report.get("warnings"):
        return "树莓派部署指向一致；发现未接入的相机实验内容，已标记为观察对象。"
    return "树莓派部署指向一致；构建、脚本和服务入口都在位。"


def main():
    parser = argparse.ArgumentParser(description="Check Raspberry Pi deploy paths without changing runtime state.")
    parser.add_argument("--root", default=ROOT, help="Sunset Radio root on the Pi.")
    parser.add_argument("--no-systemd", action="store_true", help="Skip systemd reference checks.")
    args = parser.parse_args()
    report = collect_deploy_doctor(root=args.root, check_systemd=not args.no_systemd)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
