#!/usr/bin/env python3
import glob
import json
import os
import subprocess
import sys
import urllib.request

from device_status import collect_device_status
from ambient_observer import load_ambient_state
from ambient_policy import load_ambient_policy
from audio_mode import audio_allows_music, is_soft_or_hard_mute, load_audio_mode
from camera_status import collect_camera_status

API_BASE = "http://127.0.0.1:8080"
CITIES_DIR = os.environ.get("SUNSET_CITIES_DIR", "/home/pi/sunset-radio/resource-library/cities")
SERVICES = [
    "sunset-radio",
    "sunset-radio-pi-native",
    "sunset-radio-pisugar-button",
    "sunset-radio-voice",
    "sunset-radio-whisplay",
    "sunset-radio-kiosk",
    "sunset-radio-mute-guard",
    "whisplay-daemon",
]
OPTIONAL_SERVICES = {"sunset-radio-voice"}
SILENT_COMPATIBLE_LABELS = {
    "muted",
    "listening",
    "asr",
    "heard",
    "standby",
    "voice command",
    "voice offline",
    "静音中",
    "对话待命",
    "语音待命",
    "转文字",
    "已听到",
    "语音点播",
    "语音待查",
    "安静待命",
    "暂停中",
}


def service_required(name, enabled_services=None):
    if name not in OPTIONAL_SERVICES:
        return True
    return bool((enabled_services or {}).get(name))


def required_services_ok(services, enabled_services=None):
    return all(ok for name, ok in services.items() if service_required(name, enabled_services))


def required_enabled_services_ok(enabled_services):
    return all(ok for name, ok in enabled_services.items() if name not in OPTIONAL_SERVICES)


def run(args):
    try:
        return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    except OSError as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def active_service(name):
    result = run(["systemctl", "is-active", name])
    return result.stdout.strip() == "active"


def enabled_service(name):
    result = run(["systemctl", "is-enabled", name])
    return result.stdout.strip() == "enabled"


def pi_state():
    with urllib.request.urlopen(f"{API_BASE}/api/pi-state", timeout=3) as response:
        return json.loads(response.read().decode("utf-8")).get("state", {})


def pending_count(state):
    try:
        return int((state or {}).get("pending") or 0)
    except (TypeError, ValueError):
        return -1


def volume_state():
    result = run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])
    return result.stdout.strip()


def player_processes():
    result = run(["pgrep", "-ax", "ffplay"])
    ffplay = [line for line in result.stdout.splitlines() if line.strip()]
    result = run(["pgrep", "-ax", "cvlc"])
    cvlc = [line for line in result.stdout.splitlines() if line.strip()]
    return ffplay + cvlc


def silent_label_ok(state):
    label = str((state or {}).get("label") or "").strip().lower()
    return label in SILENT_COMPATIBLE_LABELS or label.startswith("muted") or label.startswith("静音")


def service_environment(name):
    result = run(["systemctl", "show", f"{name}.service", "--property=Environment", "--value"])
    return result.stdout.strip()


def native_silent_environment():
    environment = service_environment("sunset-radio-pi-native")
    has_volume = "SUNSET_PLAYER_VOLUME=" in environment
    has_mute_flag = "SUNSET_MUTE=" in environment
    return {
        "ok": has_volume and has_mute_flag,
        "dynamicAudioMode": "SUNSET_MUTE=0" in environment,
        "environment": environment,
    }


def voice_environment():
    environment = service_environment("sunset-radio-voice")
    return {
        "ok": "SUNSET_ASR_PROVIDER=" in environment and "SUNSET_MIC_DEVICE=" in environment,
        "environment": environment,
        "arecord": shutil_which("arecord"),
    }


def shutil_which(name):
    result = run(["/usr/bin/env", "bash", "-lc", f"command -v {name} || true"])
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def catalog_status(cities_dir=CITIES_DIR):
    files = sorted(glob.glob(os.path.join(cities_dir, "*.json")))
    city_count = 0
    track_count = 0
    playable_count = 0
    errors = []

    for path in files:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                city = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{os.path.basename(path)}: {exc}")
            continue

        city_count += 1
        tracks = city.get("tracks") or []
        track_count += len(tracks)
        playable_count += sum(1 for track in tracks if track.get("audioUrl"))

    return {
        "ok": city_count >= 1 and playable_count >= city_count and not errors,
        "cityCount": city_count,
        "trackCount": track_count,
        "playableCount": playable_count,
        "path": cities_dir,
        "errors": errors[:5],
    }


def screen_render_status(state, device):
    try:
        from whisplay_status import HEIGHT, WIDTH, draw_status

        image = draw_status(state, device)
        size = list(image.size)
        return {"ok": size == [WIDTH, HEIGHT], "size": size}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def main():
    checks = {}
    active_by_service = {}
    enabled_by_service = {}
    for service in SERVICES:
        active_by_service[service] = active_service(service)
        enabled_by_service[service] = enabled_service(service)
    for service in SERVICES:
        required = service_required(service, enabled_by_service)
        checks[f"service:{service}"] = active_by_service[service] if required else True
        checks[f"service-enabled:{service}"] = enabled_by_service[service] if service not in OPTIONAL_SERVICES else True

    try:
        state = pi_state()
        checks["api:pi-state"] = True
    except Exception as exc:
        state = {"error": str(exc)}
        checks["api:pi-state"] = False

    volume = volume_state()
    players = player_processes()
    audio_mode = load_audio_mode()
    expect_silence = is_soft_or_hard_mute(audio_mode) or not audio_allows_music(audio_mode)
    muted_volume = "MUTED" in volume and "0.00" in volume
    no_players = len(players) == 0
    checks["audio:muted"] = muted_volume if expect_silence else True
    checks["audio:no-player-process"] = no_players if expect_silence else True
    checks["audio:mode-safe"] = (muted_volume and no_players) if expect_silence else True
    checks["state:silent-label"] = silent_label_ok(state) if expect_silence else True
    pending = pending_count(state)
    checks["state:no-pending"] = pending == 0
    native_silent = native_silent_environment()
    catalog = catalog_status()
    device = collect_device_status()
    camera = collect_camera_status()
    ambient = load_ambient_state()
    ambient_policy = load_ambient_policy()
    screen = screen_render_status(state, device)
    temp = device.get("temperatureC")
    disk = device.get("diskPercent")
    checks["device:status"] = bool(device.get("ok"))
    checks["device:temperature-ok"] = temp is None or float(temp) < 80
    checks["device:disk-ok"] = disk is None or float(disk) < 90
    checks["screen:render"] = bool(screen.get("ok"))
    checks["native:silent-env"] = bool(native_silent.get("ok"))
    voice = voice_environment()
    voice_required = service_required("sunset-radio-voice", enabled_by_service)
    checks["voice:service-env"] = bool(voice.get("ok")) if voice_required else True
    checks["voice:arecord"] = bool(voice.get("arecord")) if voice_required else True
    checks["catalog:playable"] = bool(catalog.get("ok"))

    ok = all(checks.values())
    print(json.dumps({
        "ok": ok,
        "checks": checks,
        "services": active_by_service,
        "enabledServices": enabled_by_service,
        "state": state,
        "volume": volume,
        "players": players,
        "audioMode": audio_mode,
        "pending": pending,
        "device": device,
        "camera": camera,
        "ambient": ambient,
        "ambientPolicy": ambient_policy,
        "screen": screen,
        "native": native_silent,
        "voice": voice,
        "catalog": catalog,
    }, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
