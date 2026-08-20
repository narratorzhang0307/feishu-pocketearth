#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys

from health_check import player_processes, volume_state
from audio_mode import load_audio_mode


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))

QUICK_STEP_NAMES = {
    "silence doctor",
    "service doctor",
    "collaboration guard",
    "capability doctor",
    "queue doctor",
    "audio mode smoke",
    "screen doctor",
    "avatar smoke",
    "button doctor",
    "pi command wake smoke",
    "chat agent smoke",
    "ambient privacy",
    "voice doctor",
    "tts doctor",
    "health check",
}
QUICK_STEP_TIMEOUT = 12


def read_pi_model():
    try:
        with open("/proc/device-tree/model", "r", encoding="utf-8", errors="ignore") as handle:
            return handle.read().replace("\x00", "").strip()
    except OSError:
        return ""


def is_pi_runtime():
    model = read_pi_model()
    if "Raspberry Pi" in model:
        return True
    return sys.platform.startswith("linux") and ROOT.startswith("/home/pi/")


def local_guard_report():
    return {
        "ok": False,
        "message": "unattended_check 需要在树莓派上运行；本机已跳过会改动运行状态的巡检。",
        "host": {
            "platform": sys.platform,
            "root": ROOT,
            "piModel": read_pi_model(),
        },
        "audio": {
            "mode": "",
            "label": "",
            "volume": "",
            "players": [],
            "ok": False,
        },
        "steps": [],
    }


def run_step(name, args, timeout=90):
    script = os.path.join(HERE, args[0])
    command = [sys.executable, script] + list(args[1:])
    try:
        result = subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "name": name,
            "ok": False,
            "returnCode": -1,
            "error": f"timeout after {timeout}s",
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
        }
    payload = {
        "name": name,
        "ok": result.returncode == 0,
        "returnCode": result.returncode,
    }
    stdout = result.stdout.strip()
    stderr = result.stderr.strip()
    if stdout:
        payload["stdout"] = stdout[-2400:]
        try:
            parsed = json.loads(stdout)
            payload["summary"] = summarize_json(parsed)
            if isinstance(parsed, dict) and "ok" in parsed:
                payload["ok"] = result.returncode == 0 and bool(parsed.get("ok"))
        except json.JSONDecodeError:
            pass
    if stderr:
        payload["stderr"] = stderr[-1200:]
    return payload


def summarize_json(payload):
    if not isinstance(payload, dict):
        return payload
    summary = {"ok": payload.get("ok")}
    for key in (
        "message",
        "pending",
        "volume",
        "players",
        "unclaimedCount",
        "sourceCounts",
        "unknownCount",
        "stale",
        "readyCapabilities",
        "pendingCapabilities",
        "nextAction",
        "canStartAudio",
        "canInterrupt",
        "poseCount",
        "minimumPoseCount",
        "showcaseCount",
        "rotateSec",
    ):
        if key in payload:
            summary[key] = payload.get(key)
    if "camera" in payload and isinstance(payload["camera"], dict):
        camera = payload["camera"]
        summary["camera"] = {
            "available": bool(camera.get("available")),
            "model": camera.get("model") or "",
        }
    if isinstance(payload.get("runtime"), dict):
        runtime = payload.get("runtime") or {}
        files = runtime.get("files") if isinstance(runtime.get("files"), dict) else {}
        summary["screenRuntime"] = {
            "path": runtime.get("path") or "",
            "exists": bool(runtime.get("exists")),
            "ok": bool(runtime.get("ok")),
            "files": files,
        }
    if isinstance(payload.get("screen"), dict):
        screen = payload.get("screen") or {}
        summary["screenRender"] = {
            "ok": bool(screen.get("ok")),
            "size": screen.get("size") or [],
            "error": screen.get("error") or "",
        }
    if isinstance(payload.get("nodes"), dict):
        nodes = payload.get("nodes") or {}
        summary["screenNodes"] = {
            "spi": nodes.get("spi") if isinstance(nodes.get("spi"), list) else [],
            "framebuffer": nodes.get("framebuffer") if isinstance(nodes.get("framebuffer"), list) else [],
        }
    if isinstance(payload.get("capabilities"), dict):
        capabilities = {}
        for name, item in payload.get("capabilities", {}).items():
            if not isinstance(item, dict):
                continue
            capabilities[name] = {
                "ready": bool(item.get("ready")),
                "label": item.get("label") or "",
                "provider": item.get("provider") or "",
            }
        summary["capabilities"] = capabilities
    if isinstance(payload.get("checks"), dict) and "nativeControl" in payload.get("checks", {}):
        checks = payload.get("checks") or {}
        summary["capabilityChecks"] = {
            "api": bool(checks.get("api")),
            "envReadable": bool(checks.get("envReadable")),
            "nativeControl": bool(checks.get("nativeControl")),
        }
    if "readable" in payload and isinstance(payload.get("hints"), dict):
        battery = ((payload.get("device") or {}).get("battery") or {})
        summary["readable"] = bool(payload.get("readable"))
        summary["battery"] = {
            "available": bool(battery.get("available")),
            "name": battery.get("name") or "",
            "capacity": battery.get("capacity"),
            "status": battery.get("status") or "",
            "source": battery.get("source") or "",
            "socket": battery.get("socket") or "",
        }
        summary["hints"] = payload.get("hints") or {}
        summary["pisugar"] = payload.get("pisugar") if isinstance(payload.get("pisugar"), dict) else {}
        if isinstance(payload.get("sockets"), list):
            summary["sockets"] = [
                {
                    "path": item.get("path") or "",
                    "exists": bool(item.get("exists")),
                }
                for item in payload.get("sockets")
                if isinstance(item, dict)
            ][:4]
        if isinstance(payload.get("binaries"), list):
            summary["binaries"] = [
                {
                    "name": item.get("name") or "",
                    "path": item.get("path") or "",
                    "present": bool(item.get("path")),
                }
                for item in payload.get("binaries")
                if isinstance(item, dict)
            ][:4]
        battery_services = []
        for item in payload.get("services") or []:
            if isinstance(item, dict):
                battery_services.append({
                    "unit": item.get("unit") or "",
                    "active": item.get("active") or "",
                    "sub": item.get("sub") or "",
                })
        for item in payload.get("unitFiles") or []:
            if isinstance(item, dict):
                battery_services.append({
                    "unit": item.get("unit") or "",
                    "state": item.get("state") or "",
                })
        if battery_services:
            summary["batteryServices"] = battery_services[:6]
    if "config" in payload and isinstance(payload["config"], dict):
        config = payload["config"]
        if "cam109ManualConfigReady" in config:
            summary["cameraConfig"] = {
                "path": config.get("path") or "",
                "readable": bool(config.get("readable")),
                "cam109ManualConfigReady": bool(config.get("cam109ManualConfigReady")),
                "cameraAutoDetectValue": config.get("cameraAutoDetectValue") or "",
                "imx708Cam0Overlay": bool(config.get("imx708Cam0Overlay")),
                "imx708Cam1Overlay": bool(config.get("imx708Cam1Overlay")),
            }
    if "checks" in payload and isinstance(payload["checks"], dict):
        failed = [key for key, ok in payload["checks"].items() if not ok]
        if (payload.get("config") or {}).get("cam109ManualConfigReady"):
            failed = [key for key in failed if key != "cameraAutoDetect"]
        summary["failedChecks"] = failed
        services = summarize_services(payload)
        if services:
            summary["services"] = services
            failed_services = failed_services_from_checks(failed)
            if failed_services:
                summary["failedServices"] = failed_services
    services = summarize_services(payload)
    if services and "services" not in summary:
        summary["services"] = services
    if isinstance(payload.get("controls"), dict):
        summary["controls"] = payload.get("controls")
    if isinstance(payload.get("settings"), dict):
        settings = payload.get("settings") or {}
        summary["buttonSettings"] = {
            "pisugarHomeButton": settings.get("pisugarHomeButton"),
        }
    if isinstance(payload.get("whisplay"), dict):
        whisplay = payload.get("whisplay") or {}
        ping = whisplay.get("ping") if isinstance(whisplay.get("ping"), dict) else {}
        summary["buttonWhisplay"] = {
            "pingOk": bool(ping.get("ok")),
            "buttonState": whisplay.get("buttonState") or {},
        }
    if isinstance(payload.get("pisugar"), dict):
        pisugar = payload.get("pisugar") or {}
        summary["buttonPiSugar"] = {
            "socket": pisugar.get("socket") or "",
            "summary": pisugar.get("summary") or {},
        }
    if isinstance(payload.get("wifiFailover"), dict):
        wifi = payload.get("wifiFailover") or {}
        profiles = wifi.get("profiles") if isinstance(wifi.get("profiles"), list) else []
        summary["buttonWifiFailover"] = {
            "enabledOnLongPress": bool(wifi.get("enabledOnLongPress")),
            "configured": bool(wifi.get("configured")),
            "profileCount": wifi.get("profileCount", len(profiles)),
            "profiles": profiles[:3],
            "message": wifi.get("message") or "",
        }
    if isinstance(payload.get("events"), dict):
        events = payload.get("events") or {}
        summary["buttonEvents"] = {
            "latest": events.get("latest") or {},
            "count": events.get("count", 0),
        }
    for key in ("failedRequired", "warnings"):
        if key in payload:
            summary[key] = payload.get(key)
    if isinstance(payload.get("blockedRefs"), list):
        summary["blockedRefs"] = payload.get("blockedRefs")
    if isinstance(payload.get("experimentalFiles"), dict):
        summary["experimentalFiles"] = payload.get("experimentalFiles")
    if isinstance(payload.get("experimentalServices"), dict):
        summary["experimentalServices"] = payload.get("experimentalServices")
    if isinstance(payload.get("localWarnings"), list):
        summary["localWarnings"] = payload.get("localWarnings")
    if "localWarningCount" in payload:
        summary["localWarningCount"] = payload.get("localWarningCount")
    if "refs" in payload and isinstance(payload["refs"], dict):
        refs = {}
        for name, ref in payload["refs"].items():
            if not isinstance(ref, dict):
                continue
            protected_changes = ref.get("protectedChanges")
            deletes = ref.get("deletesProtectedFiles")
            refs[name] = {
                "available": bool(ref.get("available")),
                "protectedChangeCount": len(protected_changes) if isinstance(protected_changes, list) else 0,
                "deleteCount": len(deletes) if isinstance(deletes, list) else 0,
                "poseCount": ref.get("poseCount"),
            }
        summary["refs"] = refs
    if "severity" in payload:
        summary["severity"] = payload.get("severity")
    for key in ("service", "microphone", "asr", "wake"):
        if isinstance(payload.get(key), dict):
            summary[key] = payload.get(key)
    if isinstance(payload.get("mode"), dict):
        summary["mode"] = payload.get("mode")
    if isinstance(payload.get("rules"), dict):
        rules = payload.get("rules") or {}
        summary["rules"] = {
            "capture": rules.get("capture") or "",
            "trigger": rules.get("trigger") or "",
            "autoCapture": rules.get("autoCapture") if "autoCapture" in rules else None,
            "imageRetention": rules.get("imageRetention") or "",
            "identity": rules.get("identity") or "",
            "emotion": rules.get("emotion") or "",
            "audio": rules.get("audio") or "",
        }
    if isinstance(payload.get("status"), dict):
        status = payload.get("status") or {}
        summary["ttsStatus"] = {
            "configured": bool(status.get("configured")),
            "cacheReady": bool(status.get("cacheReady")),
            "provider": status.get("provider") or "",
            "model": status.get("model") or "",
            "voice": status.get("voice") or "",
        }
    if isinstance(payload.get("dryRun"), dict):
        dry_run = payload.get("dryRun") or {}
        summary["ttsDryRun"] = {
            "ok": bool(dry_run.get("ok", dry_run.get("dryRun"))),
            "dryRun": bool(dry_run.get("dryRun")),
            "configured": bool(dry_run.get("configured")),
        }
    if isinstance(payload.get("audioMode"), dict):
        audio_mode = payload.get("audioMode") or {}
        summary["audioMode"] = {
            "mode": audio_mode.get("mode") or "",
            "label": audio_mode.get("label") or "",
        }
    if isinstance(payload.get("nativeTtsEnv"), dict):
        native_tts = payload.get("nativeTtsEnv") or {}
        summary["nativeTtsEnv"] = {
            "present": bool(native_tts.get("present")),
            "provider": native_tts.get("provider") or "",
        }
    if "cases" in payload and isinstance(payload["cases"], list):
        summary["cases"] = [
            {"name": item.get("name"), "ok": item.get("passed", item.get("ok"))}
            for item in payload["cases"]
            if isinstance(item, dict)
        ]
    if "results" in payload and isinstance(payload["results"], list):
        failed = [
            item.get("name") or item.get("text")
            for item in payload["results"]
            if isinstance(item, dict) and not item.get("passed", item.get("ok", True))
        ]
        summary["failedResults"] = failed
    return summary


def summarize_services(payload):
    services = payload.get("services")
    enabled = payload.get("enabledServices")
    if isinstance(services, dict) or isinstance(enabled, dict):
        return summarize_services_from_maps(
            services if isinstance(services, dict) else {},
            enabled if isinstance(enabled, dict) else {},
        )
    checks = payload.get("checks")
    if isinstance(checks, dict):
        return summarize_services_from_checks(checks)
    return {}


def summarize_services_from_checks(checks):
    services = {}
    enabled = {}
    for key, ok in checks.items():
        if key.startswith("service:"):
            services[key.split(":", 1)[1]] = bool(ok)
        elif key.startswith("service-enabled:"):
            enabled[key.split(":", 1)[1]] = bool(ok)
    return summarize_services_from_maps(services, enabled)


def summarize_services_from_maps(services, enabled):
    names = sorted(set(services) | set(enabled))
    if not names:
        return {}
    return {
        name: {
            "active": services.get(name),
            "enabled": enabled.get(name),
        }
        for name in names
    }


def failed_services_from_checks(failed_checks):
    failed = set()
    for key in failed_checks:
        if key.startswith("service:"):
            failed.add(key.split(":", 1)[1])
        elif key.startswith("service-enabled:"):
            failed.add(key.split(":", 1)[1])
    return sorted(failed)


def service_summary_from_results(results):
    for item in results:
        if item.get("name") == "health check":
            summary = item.get("summary") or {}
            services = summary.get("services")
            if isinstance(services, dict):
                return services
    return {}


def step_blocks_unattended(step):
    if step.get("ok"):
        return False
    summary = step.get("summary") or {}
    if step.get("optional") and summary.get("severity") in {"needs_credentials", "not_configured"}:
        return False
    return True


def report_message(results, audio):
    blocking = [item for item in results if step_blocks_unattended(item)]
    optional_missing = [
        item
        for item in results
        if item.get("optional")
        and not item.get("ok")
        and (item.get("summary") or {}).get("severity") in {"needs_credentials", "not_configured"}
    ]
    if blocking:
        names = "、".join(item.get("name", "check") for item in blocking[:3])
        return f"树莓派需要复查：{names}。"
    if not audio.get("ok"):
        return "树莓派后台基本在线，但静音状态需要复查。"
    if optional_missing:
        missing_names = {item.get("name") for item in optional_missing}
        if missing_names == {"tts doctor"}:
            return "树莓派静默巡检通过；语音回复还缺云端语音密钥，先保持安静。"
        if missing_names == {"voice doctor"}:
            return "树莓派静默巡检通过；麦克风唤醒还在待配置，按钮和文字控制可用。"
        return "树莓派静默巡检通过；语音唤醒/语音回复还缺云端配置，先保持安静。"
    return "树莓派静默巡检通过；后台、屏幕、按键、语音路由和静音保护都在线。"


def compact_step_message(step):
    summary = step.get("summary") or {}
    if isinstance(summary, dict):
        for key in ("message", "severity", "pending"):
            value = summary.get(key)
            if value:
                return str(value)[:240]
    for key in ("error", "stderr", "stdout"):
        value = step.get(key)
        if value:
            return str(value).replace("\n", " ")[:240]
    return ""


def compact_report(report):
    steps = report.get("steps") if isinstance(report.get("steps"), list) else []
    failed = [
        {
            "name": step.get("name", "check"),
            "message": compact_step_message(step),
        }
        for step in steps
        if step_blocks_unattended(step)
    ]
    optional = [
        {
            "name": step.get("name", "check"),
            "message": compact_step_message(step),
        }
        for step in steps
        if step.get("optional") and not step.get("ok") and not step_blocks_unattended(step)
    ]
    compact = {
        "ok": bool(report.get("ok")),
        "message": report.get("message") or "",
        "audio": report.get("audio") or {},
        "failed": failed,
        "optional": optional,
        "services": report.get("services") or {},
    }
    avatar = compact_avatar_summary(steps)
    if avatar:
        compact["avatars"] = avatar
    battery = compact_battery_summary(steps)
    if battery:
        compact["battery"] = battery
    queue = compact_queue_summary(steps)
    if queue:
        compact["queue"] = queue
    capabilities = compact_capability_summary(steps)
    if capabilities:
        compact["capabilities"] = capabilities
    screen = compact_screen_summary(steps)
    if screen:
        compact["screen"] = screen
    button = compact_button_summary(steps)
    if button:
        compact["button"] = button
    voice = compact_voice_summary(steps)
    if voice:
        compact["voice"] = voice
    tts = compact_tts_summary(steps)
    if tts:
        compact["tts"] = tts
    deploy = compact_deploy_summary(steps)
    if deploy:
        compact["deploy"] = deploy
    camera = compact_camera_summary(steps)
    if camera:
        compact["camera"] = camera
    ambient = compact_ambient_summary(steps)
    if ambient:
        compact["ambient"] = ambient
    collaboration = compact_collaboration_summary(steps)
    if collaboration:
        compact["collaboration"] = collaboration
    return compact


def compact_avatar_summary(steps):
    for step in steps:
        if step.get("name") != "avatar smoke":
            continue
        summary = step.get("summary") or {}
        pose_count = summary.get("poseCount")
        if pose_count is None:
            return {}
        return {
            "poseCount": pose_count,
            "showcaseCount": summary.get("showcaseCount"),
            "rotateSec": summary.get("rotateSec"),
        }
    return {}


def compact_battery_summary(steps):
    for step in steps:
        if step.get("name") != "battery doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": summary.get("message") or "",
            "readable": bool(summary.get("readable")),
            "battery": summary.get("battery") or {},
            "hints": summary.get("hints") or {},
            "nextAction": summary.get("nextAction") or "",
            "pisugar": summary.get("pisugar") or {},
            "sockets": summary.get("sockets") or [],
            "binaries": summary.get("binaries") or [],
            "services": summary.get("batteryServices") or [],
        }
    return {}


def compact_queue_summary(steps):
    for step in steps:
        if step.get("name") != "queue doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        stale = summary.get("stale") if isinstance(summary.get("stale"), list) else []
        stale_sources = sorted({
            str(item.get("source") or "unknown")
            for item in stale
            if isinstance(item, dict)
        })
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": summary.get("message") or "",
            "pending": summary.get("pending"),
            "unclaimedCount": summary.get("unclaimedCount"),
            "sourceCounts": summary.get("sourceCounts") or {},
            "unknownCount": summary.get("unknownCount") or 0,
            "staleCount": len(stale),
            "staleSources": stale_sources,
        }
    return {}


def compact_capability_summary(steps):
    for step in steps:
        if step.get("name") != "capability doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": summary.get("message") or "",
            "ready": summary.get("readyCapabilities") or [],
            "pending": summary.get("pendingCapabilities") or [],
            "checks": summary.get("capabilityChecks") or {},
            "items": summary.get("capabilities") or {},
        }
    return {}


def compact_screen_summary(steps):
    for step in steps:
        if step.get("name") != "screen doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": summary.get("message") or "",
            "services": summary.get("services") or {},
            "runtime": summary.get("screenRuntime") or {},
            "render": summary.get("screenRender") or {},
            "nodes": summary.get("screenNodes") or {},
        }
    return {}


def compact_button_summary(steps):
    for step in steps:
        if step.get("name") != "button doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        controls = summary.get("controls") or {}
        wifi = summary.get("buttonWifiFailover") or {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": button_controls_message(controls, wifi) or summary.get("message") or "",
            "services": summary.get("services") or {},
            "controls": controls,
            "settings": summary.get("buttonSettings") or {},
            "whisplay": summary.get("buttonWhisplay") or {},
            "pisugar": summary.get("buttonPiSugar") or {},
            "wifiFailover": wifi,
            "events": summary.get("buttonEvents") or {},
        }
    return {}


def button_controls_message(controls, wifi=None):
    controls = controls if isinstance(controls, dict) else {}
    if (
        controls.get("single") == "下一首"
        and controls.get("double") == "换个城市"
        and controls.get("long") in {"切换声音", "开/关电台"}
    ):
        wifi = wifi if isinstance(wifi, dict) else {}
        if wifi.get("enabledOnLongPress"):
            return "按键映射已接入；短按下一首，双击换城市；待机/静音长按先试手机热点并播放当前日落城市，播放中长按关闭并安静待命；结果写状态卡。"
        return "按键映射已接入；短按下一首，双击换城市；待机/静音长按打开电台，播放中长按关闭并安静待命；结果写状态卡。"
    return ""


def compact_voice_summary(steps):
    for step in steps:
        if step.get("name") != "voice doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "severity": summary.get("severity") or "",
            "message": summary.get("message") or "",
            "failedChecks": summary.get("failedChecks") or [],
            "service": summary.get("service") or {},
            "microphone": summary.get("microphone") or {},
            "asr": summary.get("asr") or {},
            "wake": summary.get("wake") or {},
        }
    return {}


def compact_tts_summary(steps):
    for step in steps:
        if step.get("name") != "tts doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "severity": summary.get("severity") or "",
            "message": summary.get("message") or "",
            "failedChecks": summary.get("failedChecks") or [],
            "status": summary.get("ttsStatus") or {},
            "dryRun": summary.get("ttsDryRun") or {},
            "audioMode": summary.get("audioMode") or {},
            "nativeTtsEnv": summary.get("nativeTtsEnv") or {},
            "volume": summary.get("volume") or "",
            "players": summary.get("players") or [],
        }
    return {}


def compact_camera_summary(steps):
    for step in steps:
        if step.get("name") != "camera doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": summary.get("message") or "",
            "failedChecks": summary.get("failedChecks") or [],
            "camera": summary.get("camera") or {},
            "config": summary.get("cameraConfig") or {},
        }
    return {}


def compact_deploy_summary(steps):
    for step in steps:
        if step.get("name") != "deploy doctor":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        warnings = summary.get("warnings")
        if not isinstance(warnings, list):
            warnings = []
        experimental = summary.get("experimentalFiles")
        if not isinstance(experimental, dict):
            experimental = {}
        experimental_files = {}
        for relpath, status in experimental.items():
            if not isinstance(status, dict):
                continue
            experimental_files[relpath] = {
                "exists": bool(status.get("exists")),
                "message": status.get("message") or "",
            }
        experimental_services = summary.get("experimentalServices")
        if not isinstance(experimental_services, dict):
            experimental_services = {}
        services = {}
        for name, status in experimental_services.items():
            if not isinstance(status, dict):
                continue
            services[name] = {
                "loaded": bool(status.get("loaded")),
                "active": bool(status.get("active")),
                "enabled": bool(status.get("enabled")),
                "message": status.get("message") or "",
            }
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": summary.get("message") or "",
            "warningCount": len(warnings),
            "warnings": [str(item)[:240] for item in warnings[:3]],
            "experimentalFiles": experimental_files,
            "experimentalServices": services,
        }
    return {}


def compact_ambient_summary(steps):
    for step in steps:
        if step.get("name") != "ambient privacy":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "message": summary.get("message") or "",
            "failedChecks": summary.get("failedChecks") or [],
            "mode": summary.get("mode") or {},
            "camera": summary.get("camera") or {},
            "rules": summary.get("rules") or {},
        }
    return {}


def compact_collaboration_summary(steps):
    for step in steps:
        if step.get("name") != "collaboration guard":
            continue
        summary = step.get("summary") or {}
        if not isinstance(summary, dict):
            return {}
        warnings = summary.get("warnings")
        if not isinstance(warnings, list):
            warnings = []
        local_warnings = summary.get("localWarnings")
        if not isinstance(local_warnings, list):
            local_warnings = []
        blocked_refs = summary.get("blockedRefs")
        if not isinstance(blocked_refs, list):
            blocked_refs = []
        refs = summary.get("refs") if isinstance(summary.get("refs"), dict) else {}
        unavailable = [name for name, ref in refs.items() if isinstance(ref, dict) and not ref.get("available")]
        remote_refs_available = bool(refs) and not unavailable
        return {
            "ok": bool(step.get("ok")) and summary.get("ok") is not False,
            "poseCount": summary.get("poseCount"),
            "minimumPoseCount": summary.get("minimumPoseCount"),
            "blockedRefs": blocked_refs,
            "blockedCount": len(blocked_refs),
            "mergeSafe": remote_refs_available and not blocked_refs,
            "localWarningCount": summary.get("localWarningCount", len(local_warnings)),
            "localWarnings": [str(item)[:240] for item in local_warnings[:3]],
            "warningCount": len(warnings),
            "warnings": [str(item)[:240] for item in warnings[:3]],
            "remoteRefsAvailable": remote_refs_available,
            "unavailableRefs": unavailable,
        }
    return {}


def final_audio_state():
    mode = load_audio_mode()
    volume = volume_state()
    players = player_processes()
    return {
        "mode": mode.get("mode"),
        "label": mode.get("label"),
        "volume": volume,
        "players": players,
        "ok": "MUTED" in volume and "0.00" in volume and not players and mode.get("mode") in {"soft_mute", "hard_mute"},
    }


def main():
    parser = argparse.ArgumentParser(description="Silent unattended validation bundle for Sunset Radio on Raspberry Pi.")
    parser.add_argument("--full", action="store_true", help="Also run the longer silent command queue smoke test.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument("--summary", action="store_true", help="Print compact machine-readable JSON for recurring checks.")
    parser.add_argument("--quick", action="store_true", help="Run only the essential silent checks for heartbeat/field use.")
    parser.add_argument("--allow-local", action="store_true", help="Allow running the Pi bundle away from the Pi for manual debugging.")
    args = parser.parse_args()

    if not args.allow_local and not is_pi_runtime():
        report = local_guard_report()
        if args.summary:
            print(json.dumps(compact_report(report), ensure_ascii=False, indent=2))
        elif args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print("unattended check skipped")
            print(report["message"])
        return 2

    steps = [
        ("silence doctor", ["silence_doctor.py", "--enforce", "--mode", "soft_mute"], 20, False),
        ("silence doctor smoke", ["silence_doctor_smoke.py"], 20, False),
        ("service doctor", ["service_doctor.py"], 45, False),
        ("service doctor smoke", ["service_doctor_smoke.py"], 20, False),
        ("boot doctor", ["boot_doctor.py"], 20, False),
        ("boot doctor smoke", ["boot_doctor_smoke.py"], 20, False),
        ("boot snapshot smoke", ["boot_snapshot_smoke.py"], 20, False),
        ("deploy doctor", ["deploy_doctor.py"], 20, False),
        ("deploy doctor smoke", ["deploy_doctor_smoke.py"], 20, False),
        ("unattended check smoke", ["unattended_check_smoke.py"], 20, False),
        ("collaboration guard", ["collaboration_guard.py"], 20, False),
        ("collaboration guard smoke", ["collaboration_guard_smoke.py"], 20, False),
        ("capability doctor", ["capability_doctor.py"], 20, False),
        ("capability doctor smoke", ["capability_doctor_smoke.py"], 20, False),
        ("battery doctor", ["battery_doctor.py"], 20, False),
        ("battery doctor smoke", ["battery_doctor_smoke.py"], 20, False),
        ("queue doctor", ["queue_doctor.py"], 20, False),
        ("queue doctor smoke", ["queue_doctor_smoke.py"], 20, False),
        ("audio mode smoke", ["audio_mode_smoke.py"], 20, False),
        ("screen doctor", ["screen_doctor.py"], 20, False),
        ("screen doctor smoke", ["screen_doctor_smoke.py"], 20, False),
        ("whisplay preview smoke", ["whisplay_preview.py"], 20, False),
        ("whisplay media smoke", ["whisplay_media_smoke.py"], 20, False),
        ("whisplay font smoke", ["whisplay_font_smoke.py"], 20, False),
        ("avatar smoke", ["avatar_smoke.py"], 20, False),
        ("pi copy smoke", ["pi_copy_smoke.py"], 20, False),
        ("button doctor", ["button_doctor.py"], 20, False),
        ("button doctor smoke", ["button_doctor_smoke.py"], 20, False),
        ("button command smoke", ["button_command_smoke.py"], 20, False),
        ("button events smoke", ["button_events_smoke.py"], 20, False),
        ("button logic smoke", ["button_logic_smoke.py", "--json"], 20, False),
        ("pi command wake smoke", ["pi_command_wake_smoke.py"], 20, False),
        ("runtime maintenance smoke", ["runtime_maintenance_smoke.py"], 20, False),
        ("runtime maintenance", ["runtime_maintenance.py"], 20, False),
        ("camera status smoke", ["camera_status_smoke.py"], 20, False),
        ("camera doctor smoke", ["camera_doctor_smoke.py"], 20, False),
        ("camera doctor", ["camera_doctor.py"], 20, False),
        ("ambient mode", ["ambient_mode.py"], 20, False),
        ("ambient agent smoke", ["ambient_agent_smoke.py"], 20, False),
        ("ambient policy smoke", ["ambient_policy_smoke.py"], 20, False),
        ("ambient plan", ["ambient_plan.py"], 20, False),
        ("ambient privacy", ["ambient_privacy.py"], 20, False),
        ("ambient plan smoke", ["ambient_plan_smoke.py"], 20, False),
        ("ambient privacy smoke", ["ambient_privacy_smoke.py"], 20, False),
        ("ambient observer smoke", ["ambient_observer_smoke.py"], 20, False),
        ("ambient memory smoke", ["ambient_memory_smoke.py"], 20, False),
        ("voice doctor", ["voice_doctor.py"], 20, True),
        ("voice doctor smoke", ["voice_doctor_smoke.py"], 20, False),
        ("voice route smoke", ["voice_route_smoke.py"], 20, False),
        ("chat agent smoke", ["chat_agent_smoke.py"], 20, False),
        ("tts doctor", ["tts_doctor.py"], 20, True),
        ("tts doctor smoke", ["tts_doctor_smoke.py"], 20, False),
        ("health check", ["health_check.py"], 45, False),
    ]
    if args.full:
        steps.append(("silent command smoke", ["silent_command_smoke.py"], 180, False))
    if args.quick:
        steps = [
            (name, step_args, min(timeout, QUICK_STEP_TIMEOUT), optional)
            for name, step_args, timeout, optional in steps
            if name in QUICK_STEP_NAMES
        ]

    results = []
    for name, step_args, timeout, optional in steps:
        result = run_step(name, step_args, timeout)
        if optional:
            result["optional"] = True
        results.append(result)
    audio = final_audio_state()
    service_summary = service_summary_from_results(results)
    report = {
        "ok": not any(step_blocks_unattended(item) for item in results) and audio["ok"],
        "message": report_message(results, audio),
        "audio": audio,
        "steps": results,
    }
    if service_summary:
        report["services"] = service_summary

    if args.summary:
        print(json.dumps(compact_report(report), ensure_ascii=False, indent=2))
    elif args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"unattended check {'ok' if report['ok'] else 'failed'}")
        print(report["message"])
        for item in results:
            print(f"- {item['name']}: {'ok' if item.get('ok') else 'failed'}")
        print(f"- audio: {'ok' if audio['ok'] else 'failed'}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
