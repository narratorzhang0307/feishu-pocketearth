#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import unattended_check


def with_runtime(model="", root="", platform=None):
    original_model = unattended_check.read_pi_model
    original_root = unattended_check.ROOT
    original_platform = unattended_check.sys.platform
    try:
        unattended_check.read_pi_model = lambda: model
        unattended_check.ROOT = root or original_root
        if platform is not None:
            unattended_check.sys.platform = platform
        return unattended_check.is_pi_runtime(), unattended_check.local_guard_report()
    finally:
        unattended_check.read_pi_model = original_model
        unattended_check.ROOT = original_root
        unattended_check.sys.platform = original_platform


def main():
    current_is_pi = unattended_check.is_pi_runtime()
    current_guard = unattended_check.local_guard_report()
    pi_model_runtime, _ = with_runtime(model="Raspberry Pi 5 Model B Rev 1.0")
    pi_path_runtime, _ = with_runtime(model="", root="/home/pi/sunset-radio", platform="linux")
    local_runtime, local_guard = with_runtime(model="", root="/Users/example/sunset-radio", platform="darwin")
    manual_camera_summary = unattended_check.summarize_json(
        {
            "ok": True,
            "checks": {
                "cameraTools": True,
                "cameraDetected": True,
                "cameraAutoDetect": False,
                "cam109ManualConfigReady": True,
            },
            "camera": {"available": True, "model": "IMX708"},
            "config": {
                "path": "/boot/firmware/config.txt",
                "readable": True,
                "cam109ManualConfigReady": True,
                "cameraAutoDetectValue": "0",
                "imx708Cam0Overlay": True,
                "imx708Cam1Overlay": True,
            },
        }
    )
    missing_auto_capture_summary = unattended_check.summarize_json(
        {
            "ok": True,
            "rules": {
                "capture": "manual_only",
                "trigger": "扫描此刻",
                "imageRetention": "deleted_after_analysis",
            },
        }
    )
    button_doctor_summary = unattended_check.summarize_json(
        {
            "ok": True,
            "message": "按键映射已接入；短按下一首，双击换城市；待机/静音长按先试手机热点并播放当前日落城市，播放中长按关闭并安静待命；结果写状态卡。",
            "services": {
                "whisplay-daemon": True,
                "sunset-radio-whisplay": True,
                "sunset-radio-pisugar-button": True,
            },
            "enabledServices": {
                "whisplay-daemon": True,
                "sunset-radio-whisplay": True,
                "sunset-radio-pisugar-button": True,
            },
            "controls": {
                "single": "下一首",
                "double": "换个城市",
                "long": "开/关电台",
            },
            "settings": {"pisugarHomeButton": "none"},
            "whisplay": {"ping": {"ok": True}, "buttonState": {"pressed": False}},
            "pisugar": {
                "socket": "",
                "hooks": [
                    {"ok": False, "missing": True, "name": "single-enable"},
                    {"ok": False, "missing": True, "name": "double-enable"},
                ],
                "summary": {
                    "mode": "whisplay_button",
                    "message": "橙色键由 Whisplay 接管；PiSugar Home 已关闭，不会抢短按。",
                    "socketAvailable": False,
                    "homeButton": "none",
                    "hookOkCount": 0,
                    "hookMissingCount": 2,
                },
            },
            "wifiFailover": {
                "enabledOnLongPress": True,
                "configured": True,
                "profileCount": 2,
                "profiles": [
                    {
                        "ssid": "phone hotspot",
                        "priority": 100,
                        "connection": "Sunset Radio - phone hotspot",
                        "passwordSet": True,
                    },
                    {
                        "ssid": "backup hotspot",
                        "priority": 90,
                        "connection": "Sunset Radio - backup hotspot",
                        "passwordSet": True,
                    },
                ],
                "message": "长按打开电台前会优先尝试连接热点：phone hotspot。",
            },
            "events": {
                "latest": {"event": "single", "source": "whisplay", "action": "下一首"},
                "count": 3,
            },
        }
    )
    button_services = button_doctor_summary.get("services", {})
    queue_doctor_summary = unattended_check.summarize_json(
        {
            "ok": True,
            "message": "命令队列干净；没有待处理按钮、语音或测试命令。",
            "pending": 0,
            "unclaimedCount": 0,
            "sourceCounts": {"button": 0, "voice": 0, "smoke": 0, "raspi": 0},
            "unknownCount": 0,
            "stale": [],
        }
    )
    queue_pressure_summary = unattended_check.compact_queue_summary(
        [
            {
                "name": "queue doctor",
                "ok": False,
                "summary": unattended_check.summarize_json(
                    {
                        "ok": False,
                        "message": "队列里有较久未处理命令，来源：button。",
                        "pending": 1,
                        "unclaimedCount": 1,
                        "sourceCounts": {"button": 1, "voice": 0, "smoke": 0, "raspi": 0},
                        "unknownCount": 0,
                        "stale": [
                            {
                                "id": "b2",
                                "source": "button",
                                "text": "换个城市",
                                "ageMs": 31000,
                            }
                        ],
                    }
                ),
            }
        ]
    )
    capability_doctor_summary = unattended_check.summarize_json(
        {
            "ok": True,
            "message": "已就绪：Gemini 云端补全、本地语音回复、本机控制；待配置：麦克风识别。",
            "checks": {"api": True, "envReadable": True, "nativeControl": True},
            "readyCapabilities": ["cloudGemini", "localTts", "nativeControl", "chatFallback"],
            "pendingCapabilities": ["asrWake"],
            "capabilities": {
                "cloudGemini": {"ready": True, "label": "Gemini 云端补全", "provider": "google-gemini"},
                "localTts": {"ready": True, "label": "本地语音回复", "provider": "device-local"},
                "asrWake": {"ready": False, "label": "麦克风识别", "provider": "command"},
                "nativeControl": {"ready": True, "label": "本机控制", "provider": "raspi"},
                "chatFallback": {"ready": True, "label": "对话兜底", "provider": "google-gemma/local-cache"},
            },
        }
    )
    screen_doctor_summary = unattended_check.summarize_json(
        {
            "ok": True,
            "message": "Whisplay 屏幕正常；短按下一首，双击换城市；待机/静音长按先试手机热点并播放当前日落城市，播放中长按关闭并安静待命；结果写状态卡。",
            "services": {
                "whisplay-daemon": True,
                "sunset-radio-whisplay": True,
                "sunset-radio-kiosk": True,
            },
            "enabledServices": {
                "whisplay-daemon": True,
                "sunset-radio-whisplay": True,
                "sunset-radio-kiosk": True,
            },
            "runtime": {
                "path": "/home/pi/Whisplay/runtime",
                "exists": True,
                "files": {"whisplay.py": True, "whisplay_client.py": True},
                "ok": True,
            },
            "screen": {"ok": True, "size": [240, 280]},
            "nodes": {"spi": ["/dev/spidev0.0"], "framebuffer": []},
        }
    )
    battery_doctor_summary = unattended_check.summarize_json(
        {
            "ok": True,
            "readable": False,
            "message": "PiSugar 按键服务在线；还没安装 pisugar-server 电量读数程序，电台可继续运行。",
            "nextAction": "橙色键服务已独立在线；若要显示电量，先安装 pisugar-server，再启用服务暴露 /tmp/pisugar-server.sock。",
            "device": {
                "ok": True,
                "battery": {
                    "available": False,
                    "source": "",
                    "pisugar": {
                        "available": False,
                        "source": "pisugar_socket",
                    },
                },
            },
            "hints": {
                "i2cPresent": True,
                "pisugarServicePresent": True,
                "pisugarBatteryServicePresent": False,
                "pisugarButtonServicePresent": True,
                "pisugarServerBinaryPresent": False,
                "pisugarSocketPresent": False,
                "sysfsBatteryPresent": False,
            },
            "sockets": [
                {"path": "/tmp/pisugar-server.sock", "exists": False},
                {"path": "/run/pisugar-server.sock", "exists": False},
            ],
            "services": [
                {
                    "unit": "sunset-radio-pisugar-button.service",
                    "active": "active",
                    "sub": "exited",
                }
            ],
            "unitFiles": [
                {
                    "unit": "sunset-radio-pisugar-button.service",
                    "state": "enabled",
                }
            ],
            "binaries": [
                {"name": "pisugar-server", "path": ""},
                {"name": "pisugar-programmer", "path": ""},
            ],
        }
    )
    compact = unattended_check.compact_report(
        {
            "ok": True,
            "message": "ok",
            "audio": {"ok": True, "mode": "soft_mute"},
            "services": {"sunset-radio": {"active": True, "enabled": True}},
            "steps": [
                {"name": "good", "ok": True},
                {
                    "name": "voice doctor",
                    "ok": False,
                    "optional": True,
                    "summary": {
                        "severity": "needs_credentials",
                        "message": "missing key",
                        "failedChecks": ["asrConfigured"],
                        "service": {"active": True, "enabled": True},
                        "microphone": {"arecord": True, "listOk": True, "device": "default"},
                        "asr": {"provider": "command", "configured": False},
                        "wake": {"required": True, "windowSec": 35.0},
                    },
                },
                {
                    "name": "tts doctor",
                    "ok": True,
                    "optional": True,
                    "summary": {
                        "ok": True,
                        "severity": "ok",
                        "message": "TTS 链路已待命，当前仍保持静音。",
                        "failedChecks": [],
                        "ttsStatus": {
                            "configured": True,
                            "cacheReady": True,
                            "provider": "device-local",
                            "model": "speech-02-turbo",
                            "voice": "male-qn-jingying-jingpin",
                        },
                        "ttsDryRun": {"ok": True, "dryRun": True, "configured": True},
                        "audioMode": {"mode": "soft_mute", "label": "安静待命"},
                        "nativeTtsEnv": {"present": True, "provider": "auto"},
                        "volume": "Volume: 0.00 [MUTED]",
                        "players": [],
                    },
                },
                {
                    "name": "deploy doctor",
                    "ok": False,
                    "summary": {"message": "runtime drift"},
                },
                {
                    "name": "avatar smoke",
                    "ok": True,
                    "summary": {"poseCount": 483, "showcaseCount": 483, "rotateSec": 6.0},
                },
                {
                    "name": "battery doctor",
                    "ok": True,
                    "summary": battery_doctor_summary,
                },
                {
                    "name": "queue doctor",
                    "ok": True,
                    "summary": queue_doctor_summary,
                },
                {
                    "name": "capability doctor",
                    "ok": True,
                    "summary": capability_doctor_summary,
                },
                {
                    "name": "screen doctor",
                    "ok": True,
                    "summary": screen_doctor_summary,
                },
                {
                    "name": "button doctor",
                    "ok": True,
                    "summary": {
                        "ok": True,
                        "message": "按键已接入；短按会切到下一首。",
                        "services": {
                            "whisplay-daemon": {"active": True, "enabled": True},
                            "sunset-radio-whisplay": {"active": True, "enabled": True},
                            "sunset-radio-pisugar-button": {"active": True, "enabled": True},
                        },
                        "controls": {
                            "single": "下一首",
                            "double": "换个城市",
                            "long": "开/关电台",
                        },
                        "buttonSettings": {"pisugarHomeButton": "none"},
                        "buttonWhisplay": {
                            "pingOk": True,
                            "buttonState": {"pressed": False},
                        },
                        "buttonPiSugar": {
                            "socket": "",
                            "summary": {
                                "mode": "whisplay_button",
                                "message": "橙色键由 Whisplay 接管；PiSugar Home 已关闭，不会抢短按。",
                                "socketAvailable": False,
                                "homeButton": "none",
                            },
                        },
                        "buttonWifiFailover": {
                            "enabledOnLongPress": True,
                            "configured": True,
                            "profileCount": 2,
                            "profiles": [
                                {
                                    "ssid": "phone hotspot",
                                    "priority": 100,
                                    "connection": "Sunset Radio - phone hotspot",
                                    "passwordSet": True,
                                }
                            ],
                            "message": "长按打开电台前会优先尝试连接热点：phone hotspot。",
                        },
                        "buttonEvents": {
                            "latest": {
                                "event": "long",
                                "action": "切换声音",
                                "source": "whisplay",
                            },
                            "count": 12,
                        },
                    },
                },
                {
                    "name": "camera doctor",
                    "ok": True,
                    "summary": {
                        "ok": True,
                        "message": "IMX708 已识别。",
                        "failedChecks": [],
                        "camera": {"available": True, "model": "imx708"},
                        "cameraConfig": {
                            "path": "/boot/firmware/config.txt",
                            "readable": True,
                            "cam109ManualConfigReady": True,
                        },
                    },
                },
                {
                    "name": "ambient privacy",
                    "ok": True,
                    "summary": {
                        "ok": True,
                        "message": "隐私边界在线。",
                        "mode": {"mode": "adaptive", "label": "环境自适应"},
                        "camera": {"available": True, "model": "IMX708"},
                        "rules": {
                            "capture": "manual_only",
                            "trigger": "扫描此刻",
                            "autoCapture": False,
                            "imageRetention": "deleted_after_analysis",
                            "identity": "not_used",
                            "emotion": "not_inferred",
                            "audio": "not_started_by_ambient_layer",
                        },
                    },
                },
                {
                    "name": "collaboration guard",
                    "ok": True,
                    "summary": {
                        "ok": True,
                        "poseCount": 483,
                        "minimumPoseCount": 483,
                        "blockedRefs": ["sunset-radio-plus/legacy-pi-work"],
                        "localWarningCount": 1,
                        "localWarnings": [
                            "current main adds a continuous ambient camera daemon; require explicit manual/consent capture before merging.",
                        ],
                        "warnings": [
                            "pr-1 would reduce Whisplay avatar poses from 483 to 444",
                            "legacy-pi-work would delete protected guard files",
                        ],
                        "refs": {
                            "sunset-radio-plus/legacy-pi-work": {
                                "available": True,
                                "protectedChangeCount": 4,
                                "deleteCount": 2,
                                "poseCount": 483,
                            },
                            "sunset-radio-plus/pr-1": {
                                "available": False,
                                "protectedChangeCount": 0,
                                "deleteCount": 0,
                            },
                        },
                    },
                },
            ],
        }
    )
    deploy_warning_summary = unattended_check.compact_deploy_summary(
        [
            {
                "name": "deploy doctor",
                "ok": True,
                "summary": {
                    "ok": True,
                    "message": "树莓派部署指向一致；相机实验服务已接入：sunset-radio-ambient",
                    "warnings": [
                        "隔离环境相机实验文件存在；未纳入主线服务前只作为观察对象。",
                    ],
                    "experimentalFiles": {
                        "raspi/ambient_daemon.py": {
                            "exists": True,
                            "message": "隔离环境相机实验文件存在；未纳入主线服务前只作为观察对象。",
                        },
                        "raspi/AMBIENT.md": {
                            "exists": False,
                            "message": "未发现 隔离环境相机说明；合并前仍需通过隐私和手动触发守卫。",
                        },
                    },
                    "experimentalServices": {
                        "sunset-radio-ambient": {
                            "loaded": True,
                            "active": True,
                            "enabled": True,
                            "message": "隔离环境相机实验服务已安装；合并前需确认只允许手动观察。",
                        },
                        "sunset-radio-camera": {
                            "loaded": False,
                            "active": False,
                            "enabled": False,
                            "message": "未接入常驻相机服务；仍只是观察项。",
                        },
                    },
                },
            }
        ]
    )
    deploy_experimental_files = deploy_warning_summary.get("experimentalFiles", {})
    deploy_experimental_services = deploy_warning_summary.get("experimentalServices", {})
    ambient_daemon_seen = deploy_experimental_files.get("raspi/ambient_daemon.py", {}).get("exists") is True
    ambient_doc_absent = deploy_experimental_files.get("raspi/AMBIENT.md", {}).get("exists") is False
    ambient_service_seen = deploy_experimental_services.get("sunset-radio-ambient", {}).get("loaded") is True
    camera_service_absent = deploy_experimental_services.get("sunset-radio-camera", {}).get("loaded") is False
    unavailable_collaboration = unattended_check.compact_collaboration_summary(
        [
            {
                "name": "collaboration guard",
                "ok": True,
                "summary": {
                    "ok": True,
                    "poseCount": 483,
                    "minimumPoseCount": 483,
                    "blockedRefs": [],
                    "warnings": [],
                    "refs": {
                        "sunset-radio-plus/legacy-pi-work": {"available": False},
                        "sunset-radio-plus/pr-1": {"available": False},
                    },
                },
            }
        ]
    )
    source = Path(unattended_check.__file__).read_text(encoding="utf-8")
    required_steps = (
        "silence_doctor_smoke.py",
        "service_doctor.py",
        "service_doctor_smoke.py",
        "boot_doctor_smoke.py",
        "capability_doctor_smoke.py",
        "screen_doctor.py",
        "screen_doctor_smoke.py",
        "button_doctor_smoke.py",
        "battery_doctor.py",
        "battery_doctor_smoke.py",
        "queue_doctor_smoke.py",
        "camera_doctor.py",
        "camera_status_smoke.py",
        "camera_doctor_smoke.py",
        "ambient_mode.py",
        "ambient_plan.py",
        "ambient_privacy.py",
        "ambient_plan_smoke.py",
        "ambient_privacy_smoke.py",
        "voice_doctor_smoke.py",
        "chat_agent_smoke.py",
        "tts_doctor_smoke.py",
    )
    all_step_sample = [
        ("silence doctor", ["silence_doctor.py", "--enforce", "--mode", "soft_mute"], 20, False),
        ("service doctor", ["service_doctor.py"], 45, False),
        ("service doctor smoke", ["service_doctor_smoke.py"], 20, False),
        ("collaboration guard", ["collaboration_guard.py"], 20, False),
        ("button doctor", ["button_doctor.py"], 20, False),
        ("button doctor smoke", ["button_doctor_smoke.py"], 20, False),
        ("voice doctor", ["voice_doctor.py"], 20, True),
        ("tts doctor", ["tts_doctor.py"], 20, True),
        ("health check", ["health_check.py"], 45, False),
    ]
    quick_step_sample = [
        (name, step_args, min(timeout, unattended_check.QUICK_STEP_TIMEOUT), optional)
        for name, step_args, timeout, optional in all_step_sample
        if name in unattended_check.QUICK_STEP_NAMES
    ]

    cases = [
        {
            "name": "current host classification is boolean",
            "passed": isinstance(current_is_pi, bool),
            "detail": current_is_pi,
        },
        {
            "name": "raspberry pi model is accepted",
            "passed": pi_model_runtime is True,
        },
        {
            "name": "linux pi deploy path is accepted",
            "passed": pi_path_runtime is True,
        },
        {
            "name": "mac/local path is rejected before runtime checks",
            "passed": local_runtime is False
            and local_guard.get("ok") is False
            and local_guard.get("steps") == []
            and "跳过" in local_guard.get("message", ""),
            "detail": local_guard,
        },
        {
            "name": "local guard never reports audio-safe success",
            "passed": current_guard.get("audio", {}).get("ok") is False
            and current_guard.get("steps") == [],
            "detail": current_guard,
        },
        {
            "name": "unattended bundle includes boot, service, battery, screen, button, camera, and ambient privacy checks",
            "passed": all(step in source for step in required_steps),
            "detail": [step for step in required_steps if step not in source],
        },
        {
            "name": "unattended bundle enforces soft mute before other checks",
            "passed": '"silence_doctor.py", "--enforce", "--mode", "soft_mute"' in source,
            "detail": "silence_doctor.py --enforce --mode soft_mute",
        },
        {
            "name": "compact report keeps blocking failures separate from optional configuration gaps",
            "passed": compact.get("ok") is True
            and [item.get("name") for item in compact.get("failed", [])] == ["deploy doctor"]
            and [item.get("name") for item in compact.get("optional", [])] == ["voice doctor"]
            and compact.get("audio", {}).get("mode") == "soft_mute"
            and compact.get("services", {}).get("sunset-radio", {}).get("active") is True,
            "detail": compact,
        },
        {
            "name": "compact deploy summary reports experimental camera files without failing",
            "passed": deploy_warning_summary.get("ok") is True
            and deploy_warning_summary.get("warningCount") == 1
            and ambient_daemon_seen
            and ambient_doc_absent
            and ambient_service_seen
            and camera_service_absent,
            "detail": deploy_warning_summary,
        },
        {
            "name": "compact report carries the Whisplay avatar catalog count",
            "passed": compact.get("avatars", {}).get("poseCount") == 483
            and compact.get("avatars", {}).get("showcaseCount") == 483,
            "detail": compact.get("avatars"),
        },
        {
            "name": "compact report carries PiSugar battery and button hints",
            "passed": compact.get("battery", {}).get("ok") is True
            and compact.get("battery", {}).get("readable") is False
            and compact.get("battery", {}).get("hints", {}).get("pisugarButtonServicePresent") is True
            and compact.get("battery", {}).get("hints", {}).get("pisugarBatteryServicePresent") is False
            and compact.get("battery", {}).get("hints", {}).get("pisugarServerBinaryPresent") is False
            and "按键服务在线" in compact.get("battery", {}).get("message", "")
            and "先安装 pisugar-server" in compact.get("battery", {}).get("nextAction", "")
            and compact.get("battery", {}).get("services", [])[0].get("unit") == "sunset-radio-pisugar-button.service",
            "detail": compact.get("battery"),
        },
        {
            "name": "compact report carries clean command queue state",
            "passed": compact.get("queue", {}).get("ok") is True
            and compact.get("queue", {}).get("pending") == 0
            and compact.get("queue", {}).get("sourceCounts", {}).get("button") == 0
            and compact.get("queue", {}).get("staleCount") == 0,
            "detail": compact.get("queue"),
        },
        {
            "name": "compact queue summary carries command pressure",
            "passed": queue_pressure_summary.get("ok") is False
            and queue_pressure_summary.get("pending") == 1
            and queue_pressure_summary.get("sourceCounts", {}).get("button") == 1
            and queue_pressure_summary.get("staleCount") == 1
            and queue_pressure_summary.get("staleSources") == ["button"],
            "detail": queue_pressure_summary,
        },
        {
            "name": "compact report carries Pi capability readiness",
            "passed": compact.get("capabilities", {}).get("ok") is True
            and compact.get("capabilities", {}).get("checks", {}).get("nativeControl") is True
            and "localTts" in compact.get("capabilities", {}).get("ready", [])
            and "chatFallback" in compact.get("capabilities", {}).get("ready", [])
            and "asrWake" in compact.get("capabilities", {}).get("pending", [])
            and compact.get("capabilities", {}).get("items", {}).get("localTts", {}).get("provider") == "device-local",
            "detail": compact.get("capabilities"),
        },
        {
            "name": "compact report carries Whisplay screen health",
            "passed": compact.get("screen", {}).get("ok") is True
            and compact.get("screen", {}).get("runtime", {}).get("ok") is True
            and compact.get("screen", {}).get("render", {}).get("size") == [240, 280]
            and compact.get("screen", {}).get("nodes", {}).get("spi") == ["/dev/spidev0.0"]
            and compact.get("screen", {}).get("services", {}).get("sunset-radio-whisplay", {}).get("active") is True
            and "结果写状态卡" in compact.get("screen", {}).get("message", ""),
            "detail": compact.get("screen"),
        },
        {
            "name": "compact report carries orange button controls",
            "passed": compact.get("button", {}).get("ok") is True
            and compact.get("button", {}).get("controls", {}).get("single") == "下一首"
            and compact.get("button", {}).get("controls", {}).get("double") == "换个城市"
            and compact.get("button", {}).get("controls", {}).get("long") == "开/关电台"
            and compact.get("button", {}).get("settings", {}).get("pisugarHomeButton") == "none"
            and compact.get("button", {}).get("whisplay", {}).get("pingOk") is True
            and compact.get("button", {}).get("pisugar", {}).get("summary", {}).get("mode") == "whisplay_button"
            and compact.get("button", {}).get("wifiFailover", {}).get("enabledOnLongPress") is True
            and compact.get("button", {}).get("wifiFailover", {}).get("profileCount") == 2
            and compact.get("button", {}).get("events", {}).get("latest", {}).get("action") == "切换声音"
            and "待机/静音长按" in compact.get("button", {}).get("message", "")
            and "播放中长按" in compact.get("button", {}).get("message", "")
            and "结果写状态卡" in compact.get("button", {}).get("message", ""),
            "detail": compact.get("button"),
        },
        {
            "name": "button doctor summary keeps active/enabled service states",
            "passed": button_services.get("whisplay-daemon", {}).get("active") is True
            and button_services.get("sunset-radio-pisugar-button", {}).get("enabled") is True
            and button_doctor_summary.get("controls", {}).get("long") == "开/关电台"
            and button_doctor_summary.get("buttonWhisplay", {}).get("pingOk") is True
            and button_doctor_summary.get("buttonPiSugar", {}).get("summary", {}).get("mode") == "whisplay_button"
            and button_doctor_summary.get("buttonWifiFailover", {}).get("configured") is True
            and "结果写状态卡" in button_doctor_summary.get("message", ""),
            "detail": button_doctor_summary,
        },
        {
            "name": "compact report carries voice readiness layers",
            "passed": compact.get("voice", {}).get("severity") == "needs_credentials"
            and compact.get("voice", {}).get("service", {}).get("active") is True
            and compact.get("voice", {}).get("microphone", {}).get("arecord") is True
            and compact.get("voice", {}).get("asr", {}).get("configured") is False
            and compact.get("voice", {}).get("wake", {}).get("required") is True,
            "detail": compact.get("voice"),
        },
        {
            "name": "compact report carries silent TTS readiness layers",
            "passed": compact.get("tts", {}).get("ok") is True
            and compact.get("tts", {}).get("status", {}).get("configured") is True
            and compact.get("tts", {}).get("status", {}).get("cacheReady") is True
            and compact.get("tts", {}).get("status", {}).get("model") == "speech-02-turbo"
            and compact.get("tts", {}).get("dryRun", {}).get("dryRun") is True
            and compact.get("tts", {}).get("nativeTtsEnv", {}).get("present") is True
            and compact.get("tts", {}).get("audioMode", {}).get("mode") == "soft_mute"
            and compact.get("tts", {}).get("players") == [],
            "detail": compact.get("tts"),
        },
        {
            "name": "compact report carries camera readiness without capture",
            "passed": compact.get("camera", {}).get("ok") is True
            and compact.get("camera", {}).get("camera", {}).get("available") is True
            and compact.get("camera", {}).get("camera", {}).get("model") == "imx708"
            and compact.get("camera", {}).get("config", {}).get("cam109ManualConfigReady") is True,
            "detail": compact.get("camera"),
        },
        {
            "name": "manual CAM109 config does not report auto-detect as failed",
            "passed": "cameraAutoDetect" not in manual_camera_summary.get("failedChecks", [])
            and manual_camera_summary.get("cameraConfig", {}).get("cam109ManualConfigReady") is True,
            "detail": manual_camera_summary,
        },
        {
            "name": "compact report carries Ambient DJ privacy boundaries",
            "passed": compact.get("ambient", {}).get("mode", {}).get("mode") == "adaptive"
            and compact.get("ambient", {}).get("rules", {}).get("capture") == "manual_only"
            and compact.get("ambient", {}).get("rules", {}).get("autoCapture") is False
            and compact.get("ambient", {}).get("rules", {}).get("imageRetention") == "deleted_after_analysis"
            and compact.get("ambient", {}).get("rules", {}).get("identity") == "not_used"
            and compact.get("ambient", {}).get("rules", {}).get("emotion") == "not_inferred"
            and compact.get("ambient", {}).get("rules", {}).get("audio") == "not_started_by_ambient_layer",
            "detail": compact.get("ambient"),
        },
        {
            "name": "missing ambient autoCapture is reported as unknown, not safe",
            "passed": missing_auto_capture_summary.get("rules", {}).get("autoCapture") is None,
            "detail": missing_auto_capture_summary,
        },
        {
            "name": "compact report carries collaboration branch risk warnings",
            "passed": compact.get("collaboration", {}).get("warningCount") == 2
            and compact.get("collaboration", {}).get("poseCount") == 483
            and compact.get("collaboration", {}).get("blockedRefs") == ["sunset-radio-plus/legacy-pi-work"]
            and compact.get("collaboration", {}).get("blockedCount") == 1
            and compact.get("collaboration", {}).get("mergeSafe") is False
            and compact.get("collaboration", {}).get("localWarningCount") == 1
            and any("continuous ambient camera daemon" in item for item in compact.get("collaboration", {}).get("localWarnings", []))
            and compact.get("collaboration", {}).get("remoteRefsAvailable") is False
            and compact.get("collaboration", {}).get("unavailableRefs") == ["sunset-radio-plus/pr-1"],
            "detail": compact.get("collaboration"),
        },
        {
            "name": "unavailable collaboration refs are not marked merge-safe",
            "passed": unavailable_collaboration.get("blockedRefs") == []
            and unavailable_collaboration.get("mergeSafe") is False
            and unavailable_collaboration.get("remoteRefsAvailable") is False
            and unavailable_collaboration.get("unavailableRefs") == [
                "sunset-radio-plus/legacy-pi-work",
                "sunset-radio-plus/pr-1",
            ],
            "detail": unavailable_collaboration,
        },
        {
            "name": "quick unattended bundle keeps only essential heartbeat checks",
            "passed": [item[0] for item in quick_step_sample] == [
                "silence doctor",
                "service doctor",
                "collaboration guard",
                "button doctor",
                "voice doctor",
                "tts doctor",
                "health check",
            ]
            and all(item[2] <= unattended_check.QUICK_STEP_TIMEOUT for item in quick_step_sample)
            and "service doctor smoke" not in [item[0] for item in quick_step_sample],
            "detail": quick_step_sample,
        },
    ]

    ok = all(case["passed"] for case in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
