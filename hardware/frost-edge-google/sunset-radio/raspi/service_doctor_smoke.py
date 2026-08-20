#!/usr/bin/env python3
import json

import service_doctor


def collect_with(
    services=None,
    enabled=None,
    state=None,
    pending=0,
    volume="Volume: 0.00 [MUTED]",
    players=None,
    native=None,
    catalog=None,
    device=None,
    screen=None,
):
    services = services if isinstance(services, dict) else {name: True for name in service_doctor.SERVICES}
    enabled = enabled if isinstance(enabled, dict) else {name: True for name in service_doctor.SERVICES}
    state = state if isinstance(state, dict) else {"label": "静音中", "pending": pending}
    players = players if isinstance(players, list) else []
    native = native if isinstance(native, dict) else {"ok": True, "environment": "SUNSET_MUTE=0 SUNSET_PLAYER_VOLUME=60"}
    catalog = catalog if isinstance(catalog, dict) else {"ok": True, "path": "/home/pi/sunset-radio/resource-library/cities", "cityCount": 96, "playableCount": 621}
    device = device if isinstance(device, dict) else {"temperatureC": 55.0, "diskPercent": 12.0, "audio": {"muted": True}}
    screen = screen if isinstance(screen, dict) else {"ok": True, "size": [240, 280]}
    originals = {
        "active_service": service_doctor.active_service,
        "enabled_service": service_doctor.enabled_service,
        "pi_state": service_doctor.pi_state,
        "pending_count": service_doctor.pending_count,
        "volume_state": service_doctor.volume_state,
        "player_processes": service_doctor.player_processes,
        "load_audio_mode": service_doctor.load_audio_mode,
        "is_soft_or_hard_mute": service_doctor.is_soft_or_hard_mute,
        "audio_allows_music": service_doctor.audio_allows_music,
        "native_silent_environment": service_doctor.native_silent_environment,
        "catalog_status": service_doctor.catalog_status,
        "collect_device_status": service_doctor.collect_device_status,
        "collect_camera_status": service_doctor.collect_camera_status,
        "load_ambient_state": service_doctor.load_ambient_state,
        "load_ambient_policy": service_doctor.load_ambient_policy,
        "load_boot_snapshot": service_doctor.load_boot_snapshot,
        "screen_render_status": service_doctor.screen_render_status,
    }
    try:
        service_doctor.active_service = lambda name: bool(services.get(name))
        service_doctor.enabled_service = lambda name: bool(enabled.get(name))
        service_doctor.pi_state = lambda: dict(state)
        service_doctor.pending_count = lambda _state: int(pending)
        service_doctor.volume_state = lambda: volume
        service_doctor.player_processes = lambda: list(players)
        service_doctor.load_audio_mode = lambda: {"mode": "soft_mute", "label": "安静待命"}
        service_doctor.is_soft_or_hard_mute = lambda mode: True
        service_doctor.audio_allows_music = lambda mode: False
        service_doctor.native_silent_environment = lambda: dict(native)
        service_doctor.catalog_status = lambda: dict(catalog)
        service_doctor.collect_device_status = lambda: dict(device)
        service_doctor.collect_camera_status = lambda: {"ok": True, "available": True, "model": "IMX708"}
        service_doctor.load_ambient_state = lambda: {"ok": True, "stage": "ready"}
        service_doctor.load_ambient_policy = lambda: {"ok": True, "action": "hold"}
        service_doctor.load_boot_snapshot = lambda: {"ok": True, "checks": {"muted": True}}
        service_doctor.screen_render_status = lambda _state, _device: dict(screen)
        return service_doctor.collect()
    finally:
        for name, original in originals.items():
            setattr(service_doctor, name, original)


def main():
    healthy = collect_with()
    inactive = collect_with(services={**{name: True for name in service_doctor.SERVICES}, "sunset-radio": False})
    unsafe_audio = collect_with(volume="Volume: 0.58", players=["123 ffplay song.mp3"])
    queued = collect_with(state={"label": "Now playing", "pending": 2}, pending=2)
    resource_issue = collect_with(
        native={"ok": False, "environment": "SUNSET_PLAYER_VOLUME=60"},
        catalog={"ok": False, "path": "/missing/cities", "cityCount": 0, "playableCount": 0},
        device={"temperatureC": 82.0, "diskPercent": 94.0},
        screen={"ok": False, "error": "render failed"},
    )

    cases = [
        {
            "name": "healthy quiet service state passes",
            "passed": healthy.get("ok") is True
            and not healthy.get("suggestions")
            and "通过" in healthy.get("message", ""),
            "detail": healthy.get("message"),
        },
        {
            "name": "inactive required service suggests restart",
            "passed": inactive.get("ok") is False
            and any("sunset-radio" in item for item in inactive.get("suggestions", [])),
            "detail": inactive.get("suggestions"),
        },
        {
            "name": "unsafe audio is blocked while in quiet mode",
            "passed": unsafe_audio.get("ok") is False
            and any("mute" in item.lower() for item in unsafe_audio.get("suggestions", []))
            and any("player" in item.lower() for item in unsafe_audio.get("suggestions", [])),
            "detail": unsafe_audio.get("suggestions"),
        },
        {
            "name": "pending commands and nonsilent label are surfaced",
            "passed": queued.get("ok") is False
            and any("pending count is 2" in item for item in queued.get("suggestions", []))
            and any("silent state label" in item for item in queued.get("suggestions", [])),
            "detail": queued.get("suggestions"),
        },
        {
            "name": "resource problems produce specific repair hints",
            "passed": resource_issue.get("ok") is False
            and any("SUNSET_MUTE" in item for item in resource_issue.get("suggestions", []))
            and any("city catalog" in item for item in resource_issue.get("suggestions", []))
            and any("cool down" in item for item in resource_issue.get("suggestions", []))
            and any("disk space" in item for item in resource_issue.get("suggestions", []))
            and any("Whisplay" in item for item in resource_issue.get("suggestions", [])),
            "detail": resource_issue.get("suggestions"),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
