#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from ambient_plan import build_ambient_plan
from ambient_observer import load_ambient_state
from ambient_policy import load_ambient_policy
from ambient_privacy import build_ambient_privacy_report
from audio_mode import audio_allows_music, is_soft_or_hard_mute, load_audio_mode
from camera_status import camera_message, collect_camera_status
from device_status import collect_device_status, display_summary
from health_check import (
    SERVICES,
    active_service,
    catalog_status,
    enabled_service,
    native_silent_environment,
    pending_count,
    pi_state,
    player_processes,
    required_enabled_services_ok,
    required_services_ok,
    screen_render_status,
    silent_label_ok,
    volume_state,
)

SNAPSHOT_PATH = os.environ.get(
    "SUNSET_BOOT_SNAPSHOT_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "boot-snapshot.json"),
)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load_boot_snapshot(path=SNAPSHOT_PATH):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def save_boot_snapshot(snapshot=None, path=SNAPSHOT_PATH):
    snapshot = snapshot if isinstance(snapshot, dict) else collect_boot_snapshot()
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return {**snapshot, "path": str(target)}


def collect_boot_snapshot():
    services = {service: active_service(service) for service in SERVICES}
    enabled_services = {service: enabled_service(service) for service in SERVICES}
    try:
        state = pi_state()
        api_ok = True
    except Exception as exc:
        state = {"error": str(exc)}
        api_ok = False

    pending = pending_count(state)
    volume = volume_state()
    players = player_processes()
    native = native_silent_environment()
    catalog = catalog_status()
    device = collect_device_status()
    camera = collect_camera_status()
    ambient = load_ambient_state()
    ambient_policy = load_ambient_policy()
    ambient_plan = build_ambient_plan(camera=camera, state=ambient, policy=ambient_policy)
    ambient_privacy = build_ambient_privacy_report(camera=camera)
    screen = screen_render_status(state, device)
    battery = device.get("battery") or {}
    audio = device.get("audio") or {}
    temp = device.get("temperatureC")
    disk = device.get("diskPercent")
    volume_muted = "MUTED" in volume and "0.00" in volume
    device_muted = bool(audio.get("muted")) and "0.00" in str(audio.get("volume") or "")
    audio_mode = load_audio_mode()
    expect_silence = is_soft_or_hard_mute(audio_mode) or not audio_allows_music(audio_mode)
    env_muted = os.environ.get("SUNSET_MUTE", "").lower() in {"1", "true", "yes", "on"}
    env_volume_zero = os.environ.get("SUNSET_PLAYER_VOLUME") == "0"
    silent_intent = env_muted and env_volume_zero and not players and bool(services.get("sunset-radio-mute-guard"))

    checks = {
        "servicesActive": required_services_ok(services, enabled_services),
        "servicesEnabled": required_enabled_services_ok(enabled_services),
        "api": api_ok,
        "muteGuardActive": bool(services.get("sunset-radio-mute-guard")),
        "voiceServiceActive": bool(services.get("sunset-radio-voice")),
        "muted": (volume_muted or device_muted or silent_intent) if expect_silence else True,
        "noPlayers": (not players) if expect_silence else True,
        "silentLabel": silent_label_ok(state) if expect_silence else True,
        "nativeSilentEnv": bool(native.get("ok")),
        "noPending": pending == 0,
        "screenRender": bool(screen.get("ok")),
        "catalog": bool(catalog.get("ok")),
        "temperature": temp is None or float(temp) < 80,
        "disk": disk is None or float(disk) < 90,
        "cameraDetected": bool(camera.get("available")),
        "batteryReadable": bool(battery.get("available")),
        "ambientPlanSafe": ambient_plan.get("canStartAudio") is False and ambient_plan.get("canInterrupt") is False,
        "ambientPrivacyManual": (ambient_privacy.get("rules") or {}).get("capture") == "manual_only"
        and (ambient_privacy.get("rules") or {}).get("autoCapture") is False
        and (ambient_privacy.get("rules") or {}).get("identity") == "not_used"
        and (ambient_privacy.get("rules") or {}).get("emotion") == "not_inferred",
    }
    required = [
        "servicesActive",
        "servicesEnabled",
        "api",
        "muteGuardActive",
        "muted",
        "noPlayers",
        "nativeSilentEnv",
        "screenRender",
        "catalog",
        "temperature",
        "disk",
    ]
    ok = all(checks[name] for name in required)
    return {
        "ok": ok,
        "capturedAt": now_iso(),
        "checks": checks,
        "services": services,
        "enabledServices": enabled_services,
        "state": state,
        "pending": pending,
        "volume": volume,
        "players": players,
        "native": native,
        "audioMode": audio_mode,
        "device": device,
        "camera": {**camera, "message": camera_message(camera)},
        "ambient": ambient,
        "ambientPolicy": ambient_policy,
        "ambientPlan": ambient_plan,
        "ambientPrivacy": ambient_privacy,
        "screen": screen,
        "catalog": catalog,
        "summary": boot_snapshot_message_from_parts(checks, device, camera, screen, services),
    }


def boot_snapshot_message_from_parts(checks, device, camera, screen, services):
    parts = []
    parts.append("声音模式正常" if checks.get("muted") and checks.get("noPlayers") else "需要确认声音")
    parts.append("屏幕正常" if screen.get("ok") else "屏幕待查")
    parts.append("后台在线" if services.get("sunset-radio-mute-guard") and services.get("sunset-radio-pi-native") else "后台待查")
    parts.append("语音在线" if services.get("sunset-radio-voice") else "语音待配置")
    parts.append("相机已识别" if camera.get("available") else "相机待排线")

    battery = (device or {}).get("battery") or {}
    if battery.get("available") and battery.get("capacity") is not None:
        parts.append(f"电量{int(round(battery['capacity']))}%")
    else:
        summary = display_summary(device)
        if summary:
            parts.append(summary)
        parts.append("供电守护在线")
    return " · ".join(parts)


def boot_snapshot_message(snapshot=None):
    snapshot = snapshot if isinstance(snapshot, dict) else load_boot_snapshot()
    if not snapshot:
        return "还没有开机快照；音乐DJ 会先做一次硬件复查。"
    summary = snapshot.get("summary")
    if summary:
        return summary
    checks = snapshot.get("checks") or {}
    device = snapshot.get("device") or {}
    camera = snapshot.get("camera") or {}
    screen = snapshot.get("screen") or {}
    services = snapshot.get("services") or {}
    return boot_snapshot_message_from_parts(checks, device, camera, screen, services)


def main():
    parser = argparse.ArgumentParser(description="Capture a Sunset Radio Raspberry Pi boot snapshot.")
    parser.add_argument("--save", action="store_true", help="Write the snapshot JSON to disk.")
    parser.add_argument("--message", action="store_true", help="Print the short DJ-facing summary only.")
    parser.add_argument("--strict", action="store_true", help="Exit with an error when required checks fail.")
    args = parser.parse_args()

    snapshot = collect_boot_snapshot()
    if args.save:
        snapshot = save_boot_snapshot(snapshot)
    if args.message:
        print(boot_snapshot_message(snapshot))
    else:
        print(json.dumps(snapshot, ensure_ascii=False, indent=2))
    return 0 if snapshot.get("ok") or not args.strict else 1


if __name__ == "__main__":
    raise SystemExit(main())
