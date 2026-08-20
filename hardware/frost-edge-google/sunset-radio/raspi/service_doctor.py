#!/usr/bin/env python3
import argparse
import json
import subprocess
import time

from device_status import collect_device_status
from ambient_observer import load_ambient_state
from ambient_policy import load_ambient_policy
from audio_mode import audio_allows_music, is_soft_or_hard_mute, load_audio_mode, save_audio_mode
from boot_snapshot import load_boot_snapshot
from camera_status import camera_message, collect_camera_status
from health_check import OPTIONAL_SERVICES, SERVICES, active_service, catalog_status, enabled_service, native_silent_environment, pending_count, pi_state, player_processes, required_enabled_services_ok, required_services_ok, screen_render_status, service_required, silent_label_ok, volume_state


REPAIRABLE_SERVICES = [
    "sunset-radio-mute-guard",
    "sunset-radio",
    "sunset-radio-pi-native",
    "sunset-radio-pisugar-button",
    "sunset-radio-voice",
    "whisplay-daemon",
    "sunset-radio-whisplay",
    "sunset-radio-kiosk",
]


def run(args):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def silence_audio():
    save_audio_mode("hard_mute", reason="service doctor repair")
    run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "1"])
    run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "0%"])
    run(["pkill", "-x", "ffplay"])
    run(["pkill", "-x", "cvlc"])


def collect():
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
    audio_mode = load_audio_mode()
    expect_silence = is_soft_or_hard_mute(audio_mode) or not audio_allows_music(audio_mode)
    native_silent = native_silent_environment()
    catalog = catalog_status()
    device = collect_device_status()
    camera = collect_camera_status()
    ambient = load_ambient_state()
    ambient_policy = load_ambient_policy()
    boot_snapshot = load_boot_snapshot()
    screen = screen_render_status(state, device)
    temp = device.get("temperatureC")
    disk = device.get("diskPercent")
    checks = {
        "services": required_services_ok(services, enabled_services),
        "servicesEnabled": required_enabled_services_ok(enabled_services),
        "api": api_ok,
        "muted": ("MUTED" in volume and "0.00" in volume) if expect_silence else True,
        "noPlayers": (not players) if expect_silence else True,
        "silentLabel": silent_label_ok(state) if expect_silence else True,
        "noPending": pending == 0,
        "temperature": temp is None or float(temp) < 80,
        "disk": disk is None or float(disk) < 90,
        "screenRender": bool(screen.get("ok")),
        "nativeSilentEnv": bool(native_silent.get("ok")),
        "catalog": bool(catalog.get("ok")),
    }
    report = {
        "ok": all(checks.values()),
        "checks": checks,
        "services": services,
        "enabledServices": enabled_services,
        "state": state,
        "pending": pending,
        "volume": volume,
        "players": players,
        "audioMode": audio_mode,
        "native": native_silent,
        "catalog": catalog,
        "device": device,
        "camera": {
            **camera,
            "message": camera_message(camera),
        },
        "ambient": ambient,
        "ambientPolicy": ambient_policy,
        "bootSnapshot": boot_snapshot,
        "screen": screen,
        "suggestions": suggestions(checks, services, enabled_services, state, pending, players, native_silent, catalog, device, screen, expect_silence),
    }
    report["message"] = service_doctor_message(report)
    return report


def service_doctor_message(report):
    if report.get("ok"):
        return "服务医生通过；后台、静音、屏幕和曲库都稳定。"
    suggestions_list = report.get("suggestions") or []
    if suggestions_list:
        return f"服务医生发现需要复查：{suggestions_list[0]}"
    return "服务医生发现需要复查的运行状态。"


def suggestions(checks, services, enabled_services, state, pending, players, native_silent, catalog, device, screen, expect_silence=True):
    out = []
    inactive = [name for name, ok in services.items() if not ok]
    inactive = [name for name in inactive if service_required(name, enabled_services)]
    if inactive:
        out.append(f"Restart inactive services: {', '.join(inactive)}")
    disabled = [name for name, ok in enabled_services.items() if not ok]
    disabled = [name for name in disabled if name not in OPTIONAL_SERVICES]
    if disabled:
        out.append(f"Enable services for boot: {', '.join(disabled)}")
    if expect_silence and not checks["muted"]:
        out.append("Re-apply mute guard and set output volume to zero.")
    if expect_silence and players:
        out.append("Stop player processes before continuing unattended work.")
    if not checks["api"]:
        out.append("Restart sunset-radio.service so the Pi control API comes back.")
    if not checks["silentLabel"]:
        out.append(f"Refresh silent state label; current label is {state.get('label')!r}.")
    if not checks["noPending"]:
        out.append(f"Clear or process queued Pi commands; current pending count is {pending}.")
    if not checks["nativeSilentEnv"]:
        out.append(f"Check SUNSET_MUTE and SUNSET_PLAYER_VOLUME for sunset-radio-pi-native; current environment is {native_silent.get('environment')!r}.")
    if not checks["catalog"]:
        out.append(f"Restore playable city catalog at {catalog.get('path')}; cities={catalog.get('cityCount')}, playable={catalog.get('playableCount')}.")
    temp = device.get("temperatureC")
    if temp is not None and float(temp) >= 80:
        out.append(f"Let the Pi cool down; current temperature is {temp}C.")
    disk = device.get("diskPercent")
    if disk is not None and float(disk) >= 90:
        out.append(f"Free disk space before continuing unattended work; current usage is {disk}%.")
    if not checks["screenRender"]:
        out.append(f"Fix Whisplay status rendering; current error is {screen.get('error')!r}.")
    return out


def repair(report):
    repaired = []
    if not report["services"].get("sunset-radio-mute-guard"):
        run(["sudo", "systemctl", "restart", "sunset-radio-mute-guard.service"])
        repaired.append("sunset-radio-mute-guard")
        time.sleep(0.5)
    silence_audio()
    for service in REPAIRABLE_SERVICES:
        if service in OPTIONAL_SERVICES and not report["enabledServices"].get(service):
            continue
        if not report["services"].get(service):
            run(["sudo", "systemctl", "restart", f"{service}.service"])
            repaired.append(service)
    return repaired


def main():
    parser = argparse.ArgumentParser(description="Diagnose the Sunset Radio Raspberry Pi runtime.")
    parser.add_argument("--repair", action="store_true", help="Restart inactive services and re-apply silent mode.")
    args = parser.parse_args()

    report = collect()
    repaired = []
    if args.repair and not report["ok"]:
        repaired = repair(report)
        time.sleep(1)
        report = collect()
    report["repaired"] = repaired
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
