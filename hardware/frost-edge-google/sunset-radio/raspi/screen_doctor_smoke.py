#!/usr/bin/env python3
import json

import screen_doctor


def collect_with(runtime=None, services=None, enabled=None, nodes=None, screen=None, device=None):
    runtime = runtime if isinstance(runtime, dict) else {
        "path": "/home/pi/Whisplay/runtime",
        "exists": True,
        "files": {"whisplay.py": True, "whisplay_client.py": True},
        "ok": True,
    }
    services = services if isinstance(services, dict) else {
        "whisplay-daemon": True,
        "sunset-radio-whisplay": True,
        "sunset-radio-kiosk": True,
    }
    enabled = enabled if isinstance(enabled, dict) else dict(services)
    nodes = nodes if isinstance(nodes, dict) else {
        "spi": ["/dev/spidev0.0"],
        "framebuffer": [],
    }
    screen = screen if isinstance(screen, dict) else {"ok": True, "size": [240, 280]}
    device = device if isinstance(device, dict) else {
        "temperatureC": 48.2,
        "ip": "192.168.18.118",
        "audio": {"muted": True, "volume": "Volume: 0.00 [MUTED]"},
    }
    captured = {}
    originals = {
        "runtime_status": screen_doctor.runtime_status,
        "active_service": screen_doctor.active_service,
        "enabled_service": screen_doctor.enabled_service,
        "collect_device_status": screen_doctor.collect_device_status,
        "screen_render_status": screen_doctor.screen_render_status,
        "device_nodes": screen_doctor.device_nodes,
    }

    def fake_screen_render(state, _device):
        captured["state"] = dict(state)
        return dict(screen)

    try:
        screen_doctor.runtime_status = lambda: dict(runtime)
        screen_doctor.active_service = lambda name: bool(services.get(name))
        screen_doctor.enabled_service = lambda name: bool(enabled.get(name))
        screen_doctor.collect_device_status = lambda: dict(device)
        screen_doctor.screen_render_status = fake_screen_render
        screen_doctor.device_nodes = lambda: dict(nodes)
        report = screen_doctor.collect_screen_doctor()
        report["renderedState"] = captured.get("state", {})
        return report
    finally:
        for name, original in originals.items():
            setattr(screen_doctor, name, original)


def main():
    healthy = collect_with()
    missing_runtime = collect_with(
        runtime={
            "path": "/home/pi/Whisplay/runtime",
            "exists": False,
            "files": {"whisplay.py": False, "whisplay_client.py": False},
            "ok": False,
        }
    )
    missing_spi = collect_with(nodes={"spi": [], "framebuffer": []})
    inactive_service = collect_with(
        services={
            "whisplay-daemon": True,
            "sunset-radio-whisplay": False,
            "sunset-radio-kiosk": True,
        }
    )
    render_failed = collect_with(screen={"ok": False, "error": "smoke render failed"})
    forbidden_copy = ("待接入", "大脑未接入", "不可用", "未识别")
    healthy_message = healthy.get("message", "")
    rendered_state = healthy.get("renderedState") or {}

    cases = [
        {
            "name": "healthy Whisplay path explains all orange-button gestures",
            "passed": healthy.get("ok") is True
            and "短按下一首" in healthy_message
            and "双击换城市" in healthy_message
            and "待机/静音长按" in healthy_message
            and "播放中长按" in healthy_message
            and "结果写状态卡" in healthy_message,
            "detail": healthy_message,
        },
        {
            "name": "screen doctor renders a quiet diagnostic card",
            "passed": rendered_state.get("label") == "静音中"
            and rendered_state.get("track") == "Whisplay"
            and rendered_state.get("pending") == 0
            and "静音中" in rendered_state.get("message", ""),
            "detail": rendered_state,
        },
        {
            "name": "missing runtime is actionable",
            "passed": missing_runtime.get("ok") is False
            and "运行文件不完整" in missing_runtime.get("message", ""),
            "detail": missing_runtime.get("message"),
        },
        {
            "name": "missing SPI is separated from runtime failure",
            "passed": missing_spi.get("ok") is False
            and "SPI 通道" in missing_spi.get("message", ""),
            "detail": missing_spi.get("message"),
        },
        {
            "name": "inactive Whisplay service asks for restart",
            "passed": inactive_service.get("ok") is False
            and "屏幕后台待重启" in inactive_service.get("message", ""),
            "detail": inactive_service.get("message"),
        },
        {
            "name": "render failures keep the diagnosis on screen rendering",
            "passed": render_failed.get("ok") is False
            and "画面生成失败" in render_failed.get("message", ""),
            "detail": render_failed.get("message"),
        },
        {
            "name": "ready screen copy does not use setup placeholders",
            "passed": not any(text in healthy_message for text in forbidden_copy),
            "detail": healthy_message,
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
