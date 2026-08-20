#!/usr/bin/env python3
import json
import tempfile

import audio_mode
import pi_command_daemon


def main():
    states = []
    spoken = []
    handled = []

    original_publish_state = pi_command_daemon.publish_state
    original_speak_text = pi_command_daemon.speak_text
    original_load_audio_mode = pi_command_daemon.load_audio_mode
    original_save_audio_mode = pi_command_daemon.save_audio_mode
    original_match_city = pi_command_daemon.match_city
    original_switch_city = pi_command_daemon.switch_city
    original_wake_scan = pi_command_daemon.WAKE_AMBIENT_SCAN
    original_player_active = pi_command_daemon.player_active
    original_stop_player = pi_command_daemon.stop_player
    original_play_next = pi_command_daemon.play_next
    original_hop_city = pi_command_daemon.hop_city
    original_apply_cloud_agent = pi_command_daemon.apply_cloud_agent
    original_adjust_radio_volume = pi_command_daemon.adjust_radio_volume
    original_ensure_radio_audio_output = pi_command_daemon.ensure_radio_audio_output
    original_trigger_wifi_failover = pi_command_daemon.trigger_wifi_failover_from_button
    original_shutil_which = pi_command_daemon.shutil.which
    original_subprocess_run = pi_command_daemon.subprocess.run
    original_volume_state_path = pi_command_daemon.VOLUME_STATE_PATH
    original_playlist = list(pi_command_daemon.playlist)
    original_current_index = pi_command_daemon.current_index
    original_catalog = list(pi_command_daemon.catalog)
    original_collect_device_status = pi_command_daemon.collect_device_status
    original_collect_button_doctor = pi_command_daemon.collect_button_doctor
    original_collect_capability_doctor = pi_command_daemon.collect_capability_doctor
    original_collect_deploy_doctor = pi_command_daemon.collect_deploy_doctor
    original_collect_boot_doctor = pi_command_daemon.collect_boot_doctor
    original_collect_battery_doctor = pi_command_daemon.collect_battery_doctor
    original_collect_queue_doctor = pi_command_daemon.collect_queue_doctor
    original_collect_service_doctor = pi_command_daemon.collect_service_doctor
    original_collect_runtime_maintenance = pi_command_daemon.collect_runtime_maintenance
    original_collect_tts_doctor = pi_command_daemon.collect_tts_doctor
    original_collect_screen_doctor = pi_command_daemon.collect_screen_doctor
    original_collect_voice_doctor = pi_command_daemon.collect_voice_doctor
    original_collect_camera_status = pi_command_daemon.collect_camera_status
    original_collect_camera_doctor = pi_command_daemon.collect_camera_doctor
    original_load_ambient_mode = pi_command_daemon.load_ambient_mode
    original_save_ambient_mode = pi_command_daemon.save_ambient_mode
    original_build_ambient_privacy_report = pi_command_daemon.build_ambient_privacy_report
    original_observe_once = pi_command_daemon.observe_once
    original_memory_report = pi_command_daemon.memory_report
    original_build_ambient_plan = pi_command_daemon.build_ambient_plan
    original_save_ambient_policy = pi_command_daemon.save_ambient_policy
    original_last_published_state = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
    original_last_voice_text = pi_command_daemon.LAST_VOICE_TEXT

    def capture_state(**state):
        states.append(state)

    def capture_speech(text, *args, **kwargs):
        spoken.append(text)
        return True

    def capture_handle(text):
        handled.append(text)

    def fake_match_city(text):
        if "东京" in str(text or ""):
            return {
                "slug": "tokyo",
                "nameZh": "东京",
                "cityNameZh": "东京",
                "cityName": "Tokyo",
                "description": "霓虹、晚风和城市流行的黄昏",
                "tracks": [
                    {"title": "Plastic Love", "artist": "竹内まりや", "cityNameZh": "东京"},
                    {"title": "真夜中のドア", "artist": "松原みき", "cityNameZh": "东京"},
                ],
            }
        return None

    try:
        with tempfile.TemporaryDirectory(prefix="sunset-pi-command-wake-") as tmp:
            mode_path = f"{tmp}/audio-mode.json"

            def load_mode(*args, **kwargs):
                kwargs["path"] = mode_path
                return audio_mode.load_audio_mode(*args, **kwargs)

            def save_mode(mode, ttl_sec=0, reason="", path=None):
                return audio_mode.save_audio_mode(mode, ttl_sec=ttl_sec, reason=reason, path=mode_path)

            pi_command_daemon.load_audio_mode = load_mode
            pi_command_daemon.save_audio_mode = save_mode
            pi_command_daemon.WAKE_AMBIENT_SCAN = False
            pi_command_daemon.publish_state = capture_state
            pi_command_daemon.speak_text = capture_speech
            pi_command_daemon.match_city = fake_match_city
            pi_command_daemon.switch_city = lambda city: capture_handle(city.get("nameZh") or city.get("slug"))
            button_actions = []
            pi_command_daemon.stop_player = lambda: button_actions.append("stop")
            pi_command_daemon.play_next = lambda step=1: button_actions.append(f"play_next:{step}")
            pi_command_daemon.hop_city = lambda step=1: button_actions.append(f"hop_city:{step}")
            pi_command_daemon.apply_cloud_agent = lambda text: False
            pi_command_daemon.ensure_radio_audio_output = lambda: button_actions.append("audio_output")
            def fake_wifi_failover():
                button_actions.append("wifi_failover")
                pi_command_daemon.speak_text("正在尝试手机热点。")
                return True

            pi_command_daemon.trigger_wifi_failover_from_button = fake_wifi_failover
            pi_command_daemon.collect_device_status = lambda: {
                "ok": True,
                "ip": "192.168.50.23",
                "ipShort": "23",
                "temperatureC": 42.0,
                "diskPercent": 35.0,
                "battery": {"available": False},
                "audio": {"muted": True, "volume": "Volume: 0.00 [MUTED]"},
            }
            pi_command_daemon.collect_button_doctor = lambda: {
                "services": {
                    "whisplay-daemon": True,
                    "sunset-radio-whisplay": True,
                    "sunset-radio-pisugar-button": True,
                },
                "settings": {"pisugarHomeButton": "none"},
                "whisplay": {"ping": {"ok": True}},
                "events": {"latest": {"event": "long", "action": "切换声音"}},
                "wifiFailover": {
                    "enabledOnLongPress": True,
                    "configured": True,
                    "profileCount": 2,
                    "profiles": [
                        {"ssid": "PocketEarth-iPhone", "priority": 120, "connection": "Sunset Radio - PocketEarth-iPhone", "passwordSet": True},
                        {"ssid": "PocketEarth-Android", "priority": 110, "connection": "Sunset Radio - PocketEarth-Android", "passwordSet": True},
                    ],
                }
            }
            pi_command_daemon.collect_capability_doctor = lambda: {
                "checks": {"api": True},
                "capabilities": {
                    "nativeControl": {"ready": True, "label": "本机控制"},
                    "chatFallback": {"ready": True, "label": "对话兜底"},
                    "asrWake": {"ready": False, "label": "麦克风识别"},
                },
                "readyCapabilities": ["nativeControl", "chatFallback"],
                "pendingCapabilities": ["asrWake"],
            }
            pi_command_daemon.collect_deploy_doctor = lambda: {
                "ok": True,
                "paths": {"server.mjs": {"exists": True}, "dist/index.html": {"exists": True}},
                "contentGuards": {"raspi/ambient_agent.py": {"ok": True}},
                "services": {"sunset-radio": {"ok": True}},
                "warnings": [],
                "message": "树莓派部署指向一致；构建、脚本和服务入口都在位。",
            }
            pi_command_daemon.collect_boot_doctor = lambda: {
                "ok": True,
                "system": {"ok": True, "state": "running", "returnCode": 0},
                "uptimeSec": 1234,
                "services": [],
                "failedRequired": [],
                "warnings": [],
                "message": "开机服务链路在线；核心后台都已启用并运行。",
            }
            pi_command_daemon.collect_battery_doctor = lambda: {
                "ok": True,
                "readable": True,
                "device": {"battery": {"available": True, "capacity": 82, "status": "Charging"}},
                "hints": {"pisugarBatteryServicePresent": True, "i2cPresent": True},
                "message": "PiSugar 电量 82% · Charging。",
                "nextAction": "电量读数可用；无需处理。",
            }
            pi_command_daemon.collect_screen_doctor = lambda: {
                "ok": True,
                "services": {"whisplay-daemon": True, "sunset-radio-whisplay": True, "sunset-radio-kiosk": True},
                "runtime": {"ok": True},
                "screen": {"ok": True},
                "nodes": {"spi": ["/dev/spidev0.0"]},
                "message": "Whisplay 屏幕正常；短按下一首，双击换城市；待机/静音长按先试手机热点并播放当前日落城市，播放中长按关闭并安静待命。",
            }
            pi_command_daemon.collect_queue_doctor = lambda: {
                "ok": False,
                "checks": {"api": True, "noPending": False, "noUnclaimedCommands": False, "noStaleCommands": True},
                "pending": 1,
                "unclaimedCount": 1,
                "sourceCounts": {"button": 0, "voice": 1, "smoke": 0, "raspi": 0},
                "unknownCount": 0,
                "stale": [],
                "commands": [{"id": "v1", "source": "voice", "text": "讲讲这座城市", "ageMs": 1600}],
            }
            pi_command_daemon.collect_service_doctor = lambda: {
                "ok": False,
                "suggestions": ["Restart inactive services: sunset-radio-voice"],
            }
            pi_command_daemon.collect_runtime_maintenance = lambda: {
                "ok": True,
                "removed": 2,
                "checks": {"ttsCache": {"ok": True, "removed": 1}, "voiceTemp": {"ok": True, "removed": 1}},
            }
            pi_command_daemon.collect_tts_doctor = lambda: {
                "ok": True,
                "severity": "ok",
                "status": {"model": "speech-02-turbo", "voice": "male-qn-jingying-jingpin"},
                "checks": {"stillSilent": True},
                "message": "TTS 链路已待命：speech-02-turbo / male-qn-jingying-jingpin，当前仍保持静音。",
            }
            pi_command_daemon.collect_voice_doctor = lambda: {
                "ok": True,
                "message": "语音唤醒链路已待命：麦克风、ASR 配置和唤醒窗口都在线。",
                "microphone": {"device": "default"},
            }
            fake_camera_status = {
                "ok": True,
                "available": True,
                "model": "IMX708",
                "tools": {"hello": "/usr/bin/rpicam-hello", "still": "/usr/bin/rpicam-still"},
                "devices": {"video": ["/dev/video0"], "media": ["/dev/media0"]},
            }
            fake_ambient_mode = {
                "mode": "adaptive",
                "label": "环境自适应",
                "updatedAt": "2026-07-02T00:00:00Z",
            }
            pi_command_daemon.collect_camera_status = lambda: dict(fake_camera_status)
            pi_command_daemon.collect_camera_doctor = lambda: {
                "ok": True,
                "checks": {
                    "cameraTools": True,
                    "cameraDetected": True,
                    "configReadable": True,
                    "cam109ManualConfigReady": True,
                },
                "camera": dict(fake_camera_status),
                "config": {"readable": True, "cam109ManualConfigReady": True},
            }
            pi_command_daemon.load_ambient_mode = lambda: dict(fake_ambient_mode)
            pi_command_daemon.save_ambient_mode = lambda mode=None: {
                **fake_ambient_mode,
                "mode": mode or fake_ambient_mode["mode"],
                "label": {
                    "classic": "原声电台",
                    "adaptive": "环境自适应",
                    "scan_once": "扫描此刻",
                }.get(mode or fake_ambient_mode["mode"], "环境自适应"),
            }
            pi_command_daemon.build_ambient_privacy_report = lambda: {
                "ok": True,
                "mode": dict(fake_ambient_mode),
                "camera": {"available": True, "model": "IMX708", "message": "IMX708 已识别，可以进入环境感知支线。"},
                "rules": {
                    "capture": "manual_only",
                    "autoCapture": False,
                    "imageRetention": "deleted_after_analysis",
                    "identity": "not_used",
                    "audio": "not_started_by_ambient_layer",
                },
                "message": (
                    "隐私：相机已就绪；不会自动拍照，只在“扫描此刻”观察一帧，分析后删图；"
                    "不识别身份或表情，也不读、保存或上传车牌、证件号、二维码、门牌号或屏幕文字；"
                    "语音只用于唤醒和指令识别，不做环境录音；"
                    "当前环境自适应，只轻调下一段。"
                ),
            }
            pi_command_daemon.observe_once = lambda capture=False: {
                "ok": True,
                "stage": "sensor",
                "message": "柔和室内光；环境DJ 只轻调下一段节目。",
                "camera": dict(fake_camera_status),
                "signals": {"light": "normal", "brightness": 0.52, "contrast": 0.12},
            }
            pi_command_daemon.memory_report = lambda: {
                "count": 2,
                "usableCount": 2,
                "blockedCount": 0,
                "latest": {"scene": "桌面旁的柔和室内光"},
                "dominantLight": "normal",
                "dominantActivity": "working",
                "lightTrend": "steady",
            }
            pi_command_daemon.build_ambient_plan = lambda: {
                "ok": True,
                "mode": dict(fake_ambient_mode),
                "message": "环境计划：相机可用；下一次先扫描此刻，再轻调下一段。",
                "nextAction": "wait_for_fresh_scan",
                "canInterrupt": False,
                "canStartAudio": False,
            }
            pi_command_daemon.save_ambient_policy = lambda: {
                "ok": True,
                "action": "modulate_next_block",
                "adjustment": {
                    "energyDelta": 0.0,
                    "instrumentalPreference": 0.7,
                    "transitionSpeed": "steady",
                },
                "ambientMemory": {"lightTrend": "steady"},
            }

            volume_calls = []
            volume_state_path = f"{tmp}/volume-state.json"
            pi_command_daemon.VOLUME_STATE_PATH = volume_state_path

            class FakeRunResult:
                def __init__(self, stdout="", stderr="", returncode=0):
                    self.stdout = stdout
                    self.stderr = stderr
                    self.returncode = returncode

            def fake_run(cmd, *args, **kwargs):
                volume_calls.append(tuple(cmd))
                if "get-volume" in cmd:
                    return FakeRunResult("Volume: 0.61")
                return FakeRunResult("")

            pi_command_daemon.shutil.which = lambda name: "/usr/bin/wpctl" if name == "wpctl" else original_shutil_which(name)
            pi_command_daemon.subprocess.run = fake_run
            pi_command_daemon.playlist = [
                {
                    "title": "Plastic Love",
                    "artist": "竹内まりや",
                    "cityNameZh": "东京",
                    "citySlug": "tokyo",
                    "introText": "city pop like neon rain on a late train",
                    "audioUrl": "https://example.com/plastic.mp3",
                }
            ]
            pi_command_daemon.catalog = [
                {
                    "slug": "tokyo",
                    "cityNameZh": "东京",
                    "cityName": "Tokyo",
                    "description": "霓虹、晚风和城市流行的黄昏",
                    "tzOffset": 0,
                    "tracks": [
                        {"title": "Plastic Love", "artist": "竹内まりや", "cityNameZh": "东京", "citySlug": "tokyo", "audioUrl": "https://example.com/plastic.mp3"},
                        {"title": "真夜中のドア", "artist": "松原みき", "cityNameZh": "东京", "citySlug": "tokyo", "audioUrl": "https://example.com/mayonaka.mp3"},
                    ],
                },
                {
                    "slug": "berlin",
                    "cityNameZh": "柏林",
                    "cityName": "Berlin",
                    "tzOffset": 0,
                    "tracks": [{"title": "Heroes", "artist": "David Bowie", "cityNameZh": "柏林", "citySlug": "berlin", "audioUrl": "https://example.com/heroes.mp3"}],
                },
                {
                    "slug": "paris",
                    "cityNameZh": "巴黎",
                    "cityName": "Paris",
                    "tzOffset": 0,
                    "tracks": [
                        {"title": "Digital Love", "artist": "Daft Punk", "cityNameZh": "巴黎", "citySlug": "paris", "introText": "sea shore water sunset open air", "audioUrl": "https://example.com/digital.mp3"},
                        {"title": "夜车灯线", "artist": "Drive", "cityNameZh": "巴黎", "citySlug": "paris", "introText": "night road trip driving highway pulse", "audioUrl": "https://example.com/road.mp3"},
                    ],
                },
            ]
            pi_command_daemon.current_index = 0

            audio_mode.save_audio_mode("soft_mute", reason="volume boundary smoke", path=mode_path)
            volume_calls.clear()
            before_volume_block_states = len(states)
            blocked_volume_ok = pi_command_daemon.adjust_radio_volume("up")
            blocked_volume_calls = list(volume_calls)
            blocked_volume_states = states[before_volume_block_states:]

            audio_mode.save_audio_mode("radio", reason="volume allowed smoke", path=mode_path)
            volume_calls.clear()
            before_volume_allowed_states = len(states)
            allowed_volume_ok = pi_command_daemon.adjust_radio_volume("up")
            allowed_volume_calls = list(volume_calls)
            allowed_volume_states = states[before_volume_allowed_states:]
            try:
                with open(volume_state_path, "r", encoding="utf-8") as handle:
                    allowed_volume_overlay = json.load(handle)
            except (OSError, json.JSONDecodeError):
                allowed_volume_overlay = {}

            pi_command_daemon.adjust_radio_volume = lambda direction: button_actions.append(f"volume:{direction}")

            audio_mode.save_audio_mode("soft_mute", reason="smoke", path=mode_path)
            wake_ok = pi_command_daemon.publish_wake("弗洛斯特")
            wake_state = audio_mode.load_audio_mode(path=mode_path)

            pi_command_daemon.handle_command("弗洛斯特 播放下东京的歌曲")
            inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("弗罗斯特 播放下东京的歌曲")
            ro_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("佛洛斯特 播放下东京的歌曲")
            fo_luo_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("佛罗斯特 播放下东京的歌曲")
            fo_ro_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("福洛斯特 播放下东京的歌曲")
            fu_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("弗洛思特 播放下东京的歌曲")
            thinking_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("弗洛特 播放下东京的歌曲")
            dropped_si_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("弗洛丝特 播放下东京的歌曲")
            silk_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("弗洛斯得 播放下东京的歌曲")
            de_suffix_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("弗洛斯特得 播放下东京的歌曲")
            full_de_suffix_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("小弗洛斯的 播放下东京的歌曲")
            small_de_suffix_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("小弗洛斯特的 播放下东京的歌曲")
            small_full_de_suffix_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("嘿弗洛斯特 播放下东京的歌曲")
            hey_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("嗨弗洛斯特德 播放下东京的歌曲")
            hi_de_suffix_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("弗洛斯特啊 播放下东京的歌曲")
            particle_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("音乐迪杰啊 播放下东京的歌曲")
            spoken_dj_particle_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("日落电台呀 播放下东京的歌曲")
            product_particle_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("日落电台 播放下东京的歌曲")
            product_wake_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("音乐迪杰 播放下东京的歌曲")
            spoken_dj_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("小福洛特 播放下东京的歌曲")
            small_fu_nickname_inline_handled = list(handled)
            handled.clear()
            pi_command_daemon.handle_command("嘿小福 播放下东京的歌曲")
            hey_fu_nickname_inline_handled = list(handled)
            terse_wake_tails = {
                phrase: pi_command_daemon.strip_wake_word(phrase)
                for phrase in [
                    "弗洛斯特",
                    "弗罗斯特",
                    "弗洛思特",
                    "弗洛丝特",
                    "佛洛斯特",
                    "佛罗斯特",
                    "福洛斯特",
                    "弗洛斯特在吗",
                    "佛洛斯特在吗",
                    "佛罗斯特在吗",
                    "弗洛斯特你在吗",
                    "佛洛斯特你在吗",
                    "佛罗斯特你在吗",
                    "嘿弗洛斯特",
                    "嘿佛洛斯特",
                    "嘿佛罗斯特",
                    "喂弗洛斯特",
                    "喂佛洛斯特",
                    "喂佛罗斯特",
                    "小福",
                    "小福在吗",
                    "小福你在吗",
                    "嘿小福",
                    "喂小福",
                    "弗洛斯特醒醒",
                    "小福醒醒",
                    "弗洛斯特出来一下",
                    "小福出来一下",
                    "弗洛斯特帮我一下",
                    "小福帮我一下",
                ]
            }
            pi_command_daemon.handle_command("你好")
            pi_command_daemon.handle_command("解除 进入")
            unlock_state = audio_mode.load_audio_mode(path=mode_path)
            pi_command_daemon.handle_command("欢迎 打开 了")
            radio_state = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="cancel mute smoke", path=mode_path)
            cancel_mute_spoken_before = len(spoken)
            pi_command_daemon.handle_command("取消静音")
            cancel_mute_state = audio_mode.load_audio_mode(path=mode_path)
            cancel_mute_spoken = spoken[cancel_mute_spoken_before:]
            audio_mode.save_audio_mode("soft_mute", reason="restore audio smoke", path=mode_path)
            restore_audio_spoken_before = len(spoken)
            pi_command_daemon.handle_command("恢复声音")
            restore_audio_state = audio_mode.load_audio_mode(path=mode_path)
            restore_audio_spoken = spoken[restore_audio_spoken_before:]
            audio_mode.save_audio_mode("soft_mute", reason="bring sound back smoke", path=mode_path)
            button_actions.clear()
            bring_sound_back_spoken_before = len(spoken)
            pi_command_daemon.handle_command("把声音开回来")
            bring_sound_back_state = audio_mode.load_audio_mode(path=mode_path)
            bring_sound_back_spoken = spoken[bring_sound_back_spoken_before:]
            bring_sound_back_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="keep sounding smoke", path=mode_path)
            keep_sounding_spoken_before = len(spoken)
            pi_command_daemon.handle_command("继续响")
            keep_sounding_state = audio_mode.load_audio_mode(path=mode_path)
            keep_sounding_spoken = spoken[keep_sounding_spoken_before:]
            audio_mode.save_audio_mode("soft_mute", reason="dialog unmute smoke", path=mode_path)
            dialog_unmute_spoken_before = len(spoken)
            pi_command_daemon.handle_command("你可以说话了")
            dialog_unmute_state = audio_mode.load_audio_mode(path=mode_path)
            dialog_unmute_spoken = spoken[dialog_unmute_spoken_before:]
            audio_mode.save_audio_mode("soft_mute", reason="can speak smoke", path=mode_path)
            can_speak_spoken_before = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("可以出声了")
            can_speak_state = audio_mode.load_audio_mode(path=mode_path)
            can_speak_spoken = spoken[can_speak_spoken_before:]
            can_speak_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="can talk smoke", path=mode_path)
            can_talk_spoken_before = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("可以讲话了")
            can_talk_state = audio_mode.load_audio_mode(path=mode_path)
            can_talk_spoken = spoken[can_talk_spoken_before:]
            can_talk_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="start talking smoke", path=mode_path)
            start_talking_spoken_before = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("开口说话")
            start_talking_state = audio_mode.load_audio_mode(path=mode_path)
            start_talking_spoken = spoken[start_talking_spoken_before:]
            start_talking_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="speak now smoke", path=mode_path)
            speak_now_spoken_before = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("你说吧")
            speak_now_state = audio_mode.load_audio_mode(path=mode_path)
            speak_now_spoken = spoken[speak_now_spoken_before:]
            speak_now_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="natural radio smoke", path=mode_path)
            natural_spoken_before = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("开始放歌")
            natural_radio_state = audio_mode.load_audio_mode(path=mode_path)
            natural_radio_spoken = spoken[natural_spoken_before:]
            natural_radio_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="resume radio smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("继续播放音乐")
            resume_radio_state = audio_mode.load_audio_mode(path=mode_path)
            resume_radio_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="terse resume broadcast smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("继续播吧")
            terse_resume_broadcast_state = audio_mode.load_audio_mode(path=mode_path)
            terse_resume_broadcast_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="terse resume singing smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("继续唱吧")
            terse_resume_singing_state = audio_mode.load_audio_mode(path=mode_path)
            terse_resume_singing_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="terse resume play smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("继续放吧")
            terse_resume_play_state = audio_mode.load_audio_mode(path=mode_path)
            terse_resume_play_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="terse follow-up broadcast smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("接着播吧")
            terse_followup_broadcast_state = audio_mode.load_audio_mode(path=mode_path)
            terse_followup_broadcast_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="terse follow-up singing smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("接着唱吧")
            terse_followup_singing_state = audio_mode.load_audio_mode(path=mode_path)
            terse_followup_singing_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="terse follow-up play smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("接着放吧")
            terse_followup_play_state = audio_mode.load_audio_mode(path=mode_path)
            terse_followup_play_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="continue listening smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("接着听吧")
            continue_listening_state = audio_mode.load_audio_mode(path=mode_path)
            continue_listening_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="continue previous song smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("接着刚才的歌")
            continue_previous_song_state = audio_mode.load_audio_mode(path=mode_path)
            continue_previous_song_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="continue that song smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("继续刚才那首")
            continue_that_song_state = audio_mode.load_audio_mode(path=mode_path)
            continue_that_song_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="continue just-now song smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("接着刚刚那首")
            continue_just_now_song_state = audio_mode.load_audio_mode(path=mode_path)
            continue_just_now_song_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="continue previous music smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("接着刚才的音乐")
            continue_previous_music_state = audio_mode.load_audio_mode(path=mode_path)
            continue_previous_music_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="music comeback smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("音乐回来吧")
            music_comeback_state = audio_mode.load_audio_mode(path=mode_path)
            music_comeback_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="restore previous radio smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("恢复刚才的电台")
            restore_previous_radio_state = audio_mode.load_audio_mode(path=mode_path)
            restore_previous_radio_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="previous track continue smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("刚才那首继续")
            previous_track_continue_state = audio_mode.load_audio_mode(path=mode_path)
            previous_track_continue_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="reopen music smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("再开音乐")
            reopen_music_state = audio_mode.load_audio_mode(path=mode_path)
            reopen_music_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="reopen radio filler smoke", path=mode_path)
            button_actions.clear()
            pi_command_daemon.handle_command("再开一下电台")
            reopen_radio_filler_state = audio_mode.load_audio_mode(path=mode_path)
            reopen_radio_filler_actions = list(button_actions)
            audio_mode.save_audio_mode("hard_mute", reason="start blocked smoke", path=mode_path)
            hard_start_spoken_before = len(spoken)
            before_hard_start_states = len(states)
            button_actions.clear()
            pi_command_daemon.handle_command("开始放歌")
            hard_start_state = audio_mode.load_audio_mode(path=mode_path)
            hard_start_spoken = spoken[hard_start_spoken_before:]
            hard_start_states = states[before_hard_start_states:]
            hard_start_actions = list(button_actions)
            natural_city_before = len(handled)
            pi_command_daemon.handle_command("开始播放东京的歌曲")
            natural_city_handled = handled[natural_city_before:]
            colloquial_city_before = len(handled)
            pi_command_daemon.handle_command("给我整点东京的歌")
            colloquial_city_handled = handled[colloquial_city_before:]
            arrange_one_city_before = len(handled)
            pi_command_daemon.handle_command("给我安排一首东京的歌")
            arrange_one_city_handled = handled[arrange_one_city_before:]
            city_gate_city = {"slug": "tokyo", "nameZh": "东京", "cityName": "Tokyo"}
            city_gate = {
                "bare_zh": pi_command_daemon.should_switch_city_command("东京", city_gate_city),
                "bare_en": pi_command_daemon.should_switch_city_command("Tokyo", city_gate_city),
                "play_city": pi_command_daemon.should_switch_city_command("开始播放东京的歌曲", city_gate_city),
                "colloquial_play_city": pi_command_daemon.should_switch_city_command("给我整点东京的歌", city_gate_city),
                "colloquial_one_song": pi_command_daemon.should_switch_city_command("给我安排一首东京的歌", city_gate_city),
                "colloquial_non_song": pi_command_daemon.should_switch_city_command("东京整点材料", city_gate_city),
                "negative_arrange": pi_command_daemon.should_switch_city_command("别安排一首东京的歌", city_gate_city),
                "city_time": pi_command_daemon.should_switch_city_command("东京时间到了", city_gate_city),
                "city_question": pi_command_daemon.should_switch_city_command("讲讲东京", city_gate_city),
                "negative": pi_command_daemon.should_switch_city_command("别放东京了", city_gate_city),
                "negative_go": pi_command_daemon.should_switch_city_command("不要去东京", city_gate_city),
                "visit_question": pi_command_daemon.should_switch_city_command("东京去过吗", city_gate_city),
            }
            audio_mode.save_audio_mode("radio", reason="quiet speech smoke", path=mode_path)
            pi_command_daemon.handle_command("别说话")
            quiet_speech_state = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("radio", reason="natural quiet speech smoke", path=mode_path)
            pi_command_daemon.handle_command("不用说话")
            natural_quiet_speech_state = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("radio", reason="casual no talking smoke", path=mode_path)
            pi_command_daemon.handle_command("先不要讲话")
            casual_no_talking_state = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("radio", reason="no open mouth smoke", path=mode_path)
            before_no_open_mouth_states = len(states)
            before_no_open_mouth_spoken = len(spoken)
            before_no_open_mouth_actions = len(button_actions)
            pi_command_daemon.handle_command("别开口说话")
            no_open_mouth_state = audio_mode.load_audio_mode(path=mode_path)
            no_open_mouth_states = states[before_no_open_mouth_states:]
            no_open_mouth_spoken = spoken[before_no_open_mouth_spoken:]
            no_open_mouth_actions = button_actions[before_no_open_mouth_actions:]
            audio_mode.save_audio_mode("radio", reason="no sound emission smoke", path=mode_path)
            before_no_sound_emission_states = len(states)
            before_no_sound_emission_spoken = len(spoken)
            before_no_sound_emission_actions = len(button_actions)
            pi_command_daemon.handle_command("别发出声音")
            no_sound_emission_state = audio_mode.load_audio_mode(path=mode_path)
            no_sound_emission_states = states[before_no_sound_emission_states:]
            no_sound_emission_spoken = spoken[before_no_sound_emission_spoken:]
            no_sound_emission_actions = button_actions[before_no_sound_emission_actions:]
            audio_mode.save_audio_mode("radio", reason="no disturb others smoke", path=mode_path)
            before_no_disturb_others_states = len(states)
            before_no_disturb_others_spoken = len(spoken)
            before_no_disturb_others_actions = len(button_actions)
            pi_command_daemon.handle_command("别打扰别人")
            no_disturb_others_state = audio_mode.load_audio_mode(path=mode_path)
            no_disturb_others_states = states[before_no_disturb_others_states:]
            no_disturb_others_spoken = spoken[before_no_disturb_others_spoken:]
            no_disturb_others_actions = button_actions[before_no_disturb_others_actions:]
            audio_mode.save_audio_mode("radio", reason="quiet voice smoke", path=mode_path)
            pi_command_daemon.handle_command("别出声")
            quiet_voice_state = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("radio", reason="hush voice smoke", path=mode_path)
            before_hush_voice_states = len(states)
            before_hush_voice_spoken = len(spoken)
            before_hush_voice_actions = len(button_actions)
            pi_command_daemon.handle_command("别吭声")
            hush_voice_state = audio_mode.load_audio_mode(path=mode_path)
            hush_voice_states = states[before_hush_voice_states:]
            hush_voice_spoken = spoken[before_hush_voice_spoken:]
            hush_voice_actions = button_actions[before_hush_voice_actions:]
            audio_mode.save_audio_mode("radio", reason="casual quiet smoke", path=mode_path)
            before_casual_quiet_states = len(states)
            before_casual_quiet_spoken = len(spoken)
            before_casual_quiet_actions = len(button_actions)
            pi_command_daemon.handle_command("别吵我了")
            casual_quiet_state = audio_mode.load_audio_mode(path=mode_path)
            casual_quiet_states = states[before_casual_quiet_states:]
            casual_quiet_spoken = spoken[before_casual_quiet_spoken:]
            casual_quiet_actions = button_actions[before_casual_quiet_actions:]
            audio_mode.save_audio_mode("radio", reason="casual no noise smoke", path=mode_path)
            before_casual_no_noise_states = len(states)
            before_casual_no_noise_spoken = len(spoken)
            before_casual_no_noise_actions = len(button_actions)
            pi_command_daemon.handle_command("不要吵了")
            casual_no_noise_state = audio_mode.load_audio_mode(path=mode_path)
            casual_no_noise_states = states[before_casual_no_noise_states:]
            casual_no_noise_spoken = spoken[before_casual_no_noise_spoken:]
            casual_no_noise_actions = button_actions[before_casual_no_noise_actions:]
            audio_mode.save_audio_mode("radio", reason="private listener quiet smoke", path=mode_path)
            before_private_listener_states = len(states)
            before_private_listener_spoken = len(spoken)
            before_private_listener_actions = len(button_actions)
            pi_command_daemon.handle_command("别让旁边人听见")
            private_listener_state = audio_mode.load_audio_mode(path=mode_path)
            private_listener_states = states[before_private_listener_states:]
            private_listener_spoken = spoken[before_private_listener_spoken:]
            private_listener_actions = button_actions[before_private_listener_actions:]
            audio_mode.save_audio_mode("radio", reason="terse private listener quiet smoke", path=mode_path)
            before_terse_private_listener_states = len(states)
            before_terse_private_listener_spoken = len(spoken)
            before_terse_private_listener_actions = len(button_actions)
            pi_command_daemon.handle_command("别让旁边听到")
            terse_private_listener_state = audio_mode.load_audio_mode(path=mode_path)
            terse_private_listener_states = states[before_terse_private_listener_states:]
            terse_private_listener_spoken = spoken[before_terse_private_listener_spoken:]
            terse_private_listener_actions = button_actions[before_terse_private_listener_actions:]
            audio_mode.save_audio_mode("radio", reason="public listener quiet smoke", path=mode_path)
            before_public_listener_states = len(states)
            before_public_listener_spoken = len(spoken)
            before_public_listener_actions = len(button_actions)
            pi_command_daemon.handle_command("别让司机听到")
            public_listener_state = audio_mode.load_audio_mode(path=mode_path)
            public_listener_states = states[before_public_listener_states:]
            public_listener_spoken = spoken[before_public_listener_spoken:]
            public_listener_actions = button_actions[before_public_listener_actions:]
            audio_mode.save_audio_mode("radio", reason="venue listener quiet smoke", path=mode_path)
            before_venue_listener_states = len(states)
            before_venue_listener_spoken = len(spoken)
            before_venue_listener_actions = len(button_actions)
            pi_command_daemon.handle_command("别让店员听见")
            venue_listener_state = audio_mode.load_audio_mode(path=mode_path)
            venue_listener_states = states[before_venue_listener_states:]
            venue_listener_spoken = spoken[before_venue_listener_spoken:]
            venue_listener_actions = button_actions[before_venue_listener_actions:]
            audio_mode.save_audio_mode("radio", reason="sleeping child quiet smoke", path=mode_path)
            before_child_sleep_states = len(states)
            before_child_sleep_spoken = len(spoken)
            before_child_sleep_actions = len(button_actions)
            pi_command_daemon.handle_command("孩子刚睡着不要响")
            child_sleep_state = audio_mode.load_audio_mode(path=mode_path)
            child_sleep_states = states[before_child_sleep_states:]
            child_sleep_spoken = spoken[before_child_sleep_spoken:]
            child_sleep_actions = button_actions[before_child_sleep_actions:]
            audio_mode.save_audio_mode("radio", reason="short no-ring smoke", path=mode_path)
            before_no_ring_states = len(states)
            before_no_ring_spoken = len(spoken)
            before_no_ring_actions = len(button_actions)
            pi_command_daemon.handle_command("别响")
            no_ring_state = audio_mode.load_audio_mode(path=mode_path)
            no_ring_states = states[before_no_ring_states:]
            no_ring_spoken = spoken[before_no_ring_spoken:]
            no_ring_actions = button_actions[before_no_ring_actions:]
            audio_mode.save_audio_mode("radio", reason="subway no-ring smoke", path=mode_path)
            before_subway_no_ring_states = len(states)
            before_subway_no_ring_spoken = len(spoken)
            before_subway_no_ring_actions = len(button_actions)
            pi_command_daemon.handle_command("我在地铁上别响")
            subway_no_ring_state = audio_mode.load_audio_mode(path=mode_path)
            subway_no_ring_states = states[before_subway_no_ring_states:]
            subway_no_ring_spoken = spoken[before_subway_no_ring_spoken:]
            subway_no_ring_actions = button_actions[before_subway_no_ring_actions:]
            audio_mode.save_audio_mode("radio", reason="library no-ring smoke", path=mode_path)
            before_library_no_ring_states = len(states)
            before_library_no_ring_spoken = len(spoken)
            before_library_no_ring_actions = len(button_actions)
            pi_command_daemon.handle_command("图书馆别响")
            library_no_ring_state = audio_mode.load_audio_mode(path=mode_path)
            library_no_ring_states = states[before_library_no_ring_states:]
            library_no_ring_spoken = spoken[before_library_no_ring_spoken:]
            library_no_ring_actions = button_actions[before_library_no_ring_actions:]
            audio_mode.save_audio_mode("radio", reason="shush smoke", path=mode_path)
            before_shush_states = len(states)
            before_shush_spoken = len(spoken)
            before_shush_actions = len(button_actions)
            pi_command_daemon.handle_command("嘘")
            shush_state = audio_mode.load_audio_mode(path=mode_path)
            shush_states = states[before_shush_states:]
            shush_spoken = spoken[before_shush_spoken:]
            shush_actions = button_actions[before_shush_actions:]
            audio_mode.save_audio_mode("radio", reason="shush a bit smoke", path=mode_path)
            before_shush_a_bit_states = len(states)
            before_shush_a_bit_spoken = len(spoken)
            before_shush_a_bit_actions = len(button_actions)
            pi_command_daemon.handle_command("嘘一下")
            shush_a_bit_state = audio_mode.load_audio_mode(path=mode_path)
            shush_a_bit_states = states[before_shush_a_bit_states:]
            shush_a_bit_spoken = spoken[before_shush_a_bit_spoken:]
            shush_a_bit_actions = button_actions[before_shush_a_bit_actions:]
            audio_mode.save_audio_mode("radio", reason="english shush smoke", path=mode_path)
            before_english_shush_states = len(states)
            before_english_shush_spoken = len(spoken)
            before_english_shush_actions = len(button_actions)
            pi_command_daemon.handle_command("shh")
            english_shush_state = audio_mode.load_audio_mode(path=mode_path)
            english_shush_states = states[before_english_shush_states:]
            english_shush_spoken = spoken[before_english_shush_spoken:]
            english_shush_actions = button_actions[before_english_shush_actions:]
            audio_mode.save_audio_mode("radio", reason="hard no-audio smoke", path=mode_path)
            pi_command_daemon.handle_command("不要出声")
            hard_no_audio_state = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("radio", reason="no autoplay smoke", path=mode_path)
            before_no_autoplay_states = len(states)
            before_no_autoplay_spoken = len(spoken)
            before_no_autoplay_actions = len(button_actions)
            pi_command_daemon.handle_command("不要自动播放")
            no_autoplay_state = audio_mode.load_audio_mode(path=mode_path)
            no_autoplay_states = states[before_no_autoplay_states:]
            no_autoplay_spoken = spoken[before_no_autoplay_spoken:]
            no_autoplay_actions = button_actions[before_no_autoplay_actions:]
            audio_mode.save_audio_mode("radio", reason="no surprise play smoke", path=mode_path)
            before_no_surprise_play_states = len(states)
            before_no_surprise_play_spoken = len(spoken)
            before_no_surprise_play_actions = len(button_actions)
            pi_command_daemon.handle_command("别突然放歌")
            no_surprise_play_state = audio_mode.load_audio_mode(path=mode_path)
            no_surprise_play_states = states[before_no_surprise_play_states:]
            no_surprise_play_spoken = spoken[before_no_surprise_play_spoken:]
            no_surprise_play_actions = button_actions[before_no_surprise_play_actions:]
            negative_playback_action_cases = []
            for prompt in [
                "不要下一首",
                "别切下一首",
                "别继续播放",
                "不要恢复播放",
                "别恢复刚才的电台",
                "别接上刚才那首",
                "先别打开电台声音",
            ]:
                audio_mode.save_audio_mode("soft_mute", reason="negative playback action smoke", path=mode_path)
                before_negative_playback_states = len(states)
                before_negative_playback_spoken = len(spoken)
                before_negative_playback_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                negative_playback_action_cases.append(
                    {
                        "prompt": prompt,
                        "mode": audio_mode.load_audio_mode(path=mode_path),
                        "states": states[before_negative_playback_states:],
                        "spoken": spoken[before_negative_playback_spoken:],
                        "actions": button_actions[before_negative_playback_actions:],
                    }
                )
            negative_playback_query_cases = []
            for prompt, expected_label in [
                ("别切歌，我只是问下一首是什么", "City songs"),
                ("不要换歌，只想知道下一首谁唱的", "City songs"),
                ("别回上一首，我只是问上一首是什么", "Now playing"),
                ("先别倒回去，我问上个啥", "Now playing"),
                ("别切歌，我只是问现在播什么歌", "Now playing"),
                ("不要换歌，只想知道这首谁唱的", "Now playing"),
            ]:
                audio_mode.save_audio_mode("radio", reason="negative playback query smoke", path=mode_path)
                before_negative_playback_query_states = len(states)
                before_negative_playback_query_spoken = len(spoken)
                before_negative_playback_query_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                negative_playback_query_cases.append(
                    {
                        "prompt": prompt,
                        "expectedLabel": expected_label,
                        "states": states[before_negative_playback_query_states:],
                        "spoken": spoken[before_negative_playback_query_spoken:],
                        "actions": button_actions[before_negative_playback_query_actions:],
                    }
                )
            quiet_prefixed_command_cases = []
            for prompt, expected_city, expected_message, expected_actions in [
                ("别出声告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("不要出声告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("别吱声告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("不要说出来告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("嘘一下告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("现在不方便出声告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("旁边有人别出声告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("旁边人多只打字告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("别让旁边人听见告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("我没戴耳机告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("怕吵到别人告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("我在公交上别出声告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("图书馆别播报告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("别用语音回我现在播什么歌", "东京", "Plastic Love", []),
                ("不要用语音回答我现在这首是谁唱的", "东京", "Plastic Love", []),
                ("用文字告诉我现在放的是什么", "东京", "Plastic Love", []),
                ("用屏幕告诉我现在放的是什么", "东京", "Plastic Love", []),
                ("在屏幕上告诉我现在放的是什么", "东京", "Plastic Love", []),
                ("在屏幕上写一下现在放的是什么", "东京", "Plastic Love", []),
                ("把现在放的是什么写在屏幕上", "东京", "Plastic Love", []),
                ("小声点告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("小点声告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("写在屏幕上告诉我现在播什么歌", "东京", "Plastic Love", []),
                ("答案写屏幕上现在播什么歌", "东京", "Plastic Love", []),
                ("文字回我下一首是哪儿的", "城市歌单", "Plastic Love", []),
                ("我没戴耳机告诉我这站歌单里有什么", "城市歌单", "Plastic Love", []),
                ("旁边人多只打字告诉我接下来还有哪些歌", "城市歌单", "Plastic Love", []),
                ("屏幕上说这首歌为啥选", "歌曲故事", "Plastic Love", []),
                ("不用读出来讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("不方便说话讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("别让同事听到讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("耳机没戴讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("小声讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("声音压低一点讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("地铁里别讲话讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("别吭声讲讲这首歌", "歌曲故事", "Plastic Love", []),
                ("别出声讲讲这座城", "城市故事", "东京", []),
                ("别讲出来这座城有啥故事", "城市故事", "东京", []),
                ("人多别说出来这座城有啥故事", "城市故事", "东京", []),
                ("不要让别人听清这座城有啥故事", "城市故事", "东京", []),
                ("不想外放这座城有啥故事", "城市故事", "东京", []),
                ("出租车上不要说话这座城有啥故事", "城市故事", "东京", []),
                ("不用语音回复告诉我这座城有啥故事", "城市故事", "东京", []),
                ("不要播放只看屏幕现在网络通了吗", "出门网络", "当前网络在线", []),
                ("别播报一下网络还在吗", "出门网络", "当前网络在线", []),
                ("不要出声帮我连接手机热点", "出门网络", "正在尝试手机热点", ["wifi_failover"]),
                ("别让路人听见帮我连接手机热点", "出门网络", "正在尝试手机热点", ["wifi_failover"]),
                ("宝宝睡着了帮我连接手机热点", "出门网络", "正在尝试手机热点", ["wifi_failover"]),
                ("别出声告诉我这趟路线是什么", "日落路线", "后面3站", []),
                ("宝宝睡着了告诉我后面还经过哪里", "日落路线", "后面3站", []),
            ]:
                audio_mode.save_audio_mode("dialog", reason="quiet prefixed command intent smoke", path=mode_path)
                before_quiet_prefixed_states = len(states)
                before_quiet_prefixed_spoken = len(spoken)
                before_quiet_prefixed_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                quiet_prefixed_command_cases.append({
                    "prompt": prompt,
                    "states": states[before_quiet_prefixed_states:],
                    "spoken": spoken[before_quiet_prefixed_spoken:],
                    "actions": button_actions[before_quiet_prefixed_actions:],
                    "expectedCity": expected_city,
                    "expectedMessage": expected_message,
                    "expectedActions": expected_actions,
                })
            quiet_suffixed_command_cases = []
            for prompt, expected_city, expected_message in [
                ("现在播什么歌别出声", "东京", "Plastic Love"),
                ("这座城有啥故事别出声", "城市故事", "东京"),
                ("这趟路线是什么别出声", "日落路线", "后面3站"),
                ("电量还够吗别出声", "电池医生", "PiSugar 电量 82%"),
                ("现在走哪张网别出声", "出门网络", "192.168.50.23"),
            ]:
                audio_mode.save_audio_mode("dialog", reason="quiet suffixed command intent smoke", path=mode_path)
                before_quiet_suffixed_states = len(states)
                before_quiet_suffixed_spoken = len(spoken)
                before_quiet_suffixed_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                quiet_suffixed_command_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_quiet_suffixed_states:],
                        "spoken": spoken[before_quiet_suffixed_spoken:],
                        "actions": button_actions[before_quiet_suffixed_actions:],
                        "expectedCity": expected_city,
                        "expectedMessage": expected_message,
                    }
                )
            quiet_suffixed_hotspot_connect_cases = []
            for prompt in (
                "帮我连接手机热点别出声",
                "Wi-Fi掉了帮我连回热点别念出来",
                "手机热点开好了不要播报",
                "切到vivo热点别出声",
            ):
                audio_mode.save_audio_mode("dialog", reason="quiet suffixed hotspot connect smoke", path=mode_path)
                before_quiet_suffixed_hotspot_connect_states = len(states)
                before_quiet_suffixed_hotspot_connect_spoken = len(spoken)
                before_quiet_suffixed_hotspot_connect_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                quiet_suffixed_hotspot_connect_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_quiet_suffixed_hotspot_connect_states:],
                        "spoken": spoken[before_quiet_suffixed_hotspot_connect_spoken:],
                        "actions": button_actions[before_quiet_suffixed_hotspot_connect_actions:],
                    }
                )
                button_actions.clear()
            before_privacy_states = len(states)
            pi_command_daemon.handle_command("你会不会一直拍我，或者识别人脸")
            natural_privacy_states = states[before_privacy_states:]
            before_spy_privacy_states = len(states)
            pi_command_daemon.handle_command("你会偷拍吗")
            spy_privacy_states = states[before_spy_privacy_states:]
            before_eavesdrop_privacy_states = len(states)
            pi_command_daemon.handle_command("你会偷听吗")
            eavesdrop_privacy_states = states[before_eavesdrop_privacy_states:]
            before_stealth_record_privacy_states = len(states)
            before_stealth_record_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你会不会偷录")
            stealth_record_privacy_states = states[before_stealth_record_privacy_states:]
            stealth_record_privacy_actions = button_actions[before_stealth_record_privacy_actions:]
            before_stealth_watch_privacy_states = len(states)
            before_stealth_watch_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你会不会偷看")
            stealth_watch_privacy_states = states[before_stealth_watch_privacy_states:]
            stealth_watch_privacy_actions = button_actions[before_stealth_watch_privacy_actions:]
            before_short_record_privacy_states = len(states)
            before_short_record_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你在录吗")
            short_record_privacy_states = states[before_short_record_privacy_states:]
            short_record_privacy_actions = button_actions[before_short_record_privacy_actions:]
            before_recorded_privacy_states = len(states)
            before_recorded_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你录了吗")
            recorded_privacy_states = states[before_recorded_privacy_states:]
            recorded_privacy_actions = button_actions[before_recorded_privacy_actions:]
            before_recorded_me_privacy_states = len(states)
            before_recorded_me_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你有没有录我")
            recorded_me_privacy_states = states[before_recorded_me_privacy_states:]
            recorded_me_privacy_actions = button_actions[before_recorded_me_privacy_actions:]
            before_previous_record_privacy_states = len(states)
            before_previous_record_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("刚才有录音吗")
            previous_record_privacy_states = states[before_previous_record_privacy_states:]
            previous_record_privacy_actions = button_actions[before_previous_record_privacy_actions:]
            before_short_shoot_privacy_states = len(states)
            before_short_shoot_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你在拍吗")
            short_shoot_privacy_states = states[before_short_shoot_privacy_states:]
            short_shoot_privacy_actions = button_actions[before_short_shoot_privacy_actions:]
            before_shot_privacy_states = len(states)
            before_shot_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你拍了吗")
            shot_privacy_states = states[before_shot_privacy_states:]
            shot_privacy_actions = button_actions[before_shot_privacy_actions:]
            before_shot_me_privacy_states = len(states)
            before_shot_me_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你有没有拍我")
            shot_me_privacy_states = states[before_shot_me_privacy_states:]
            shot_me_privacy_actions = button_actions[before_shot_me_privacy_actions:]
            before_previous_photo_privacy_states = len(states)
            before_previous_photo_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("刚才拍照了吗")
            previous_photo_privacy_states = states[before_previous_photo_privacy_states:]
            previous_photo_privacy_actions = button_actions[before_previous_photo_privacy_actions:]
            before_always_listening_privacy_states = len(states)
            before_always_listening_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你是不是一直在听")
            always_listening_privacy_states = states[before_always_listening_privacy_states:]
            always_listening_privacy_actions = button_actions[before_always_listening_privacy_actions:]
            before_no_always_listening_privacy_states = len(states)
            before_no_always_listening_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("不要一直听我")
            no_always_listening_privacy_states = states[before_no_always_listening_privacy_states:]
            no_always_listening_privacy_actions = button_actions[before_no_always_listening_privacy_actions:]
            before_always_watching_privacy_states = len(states)
            before_always_watching_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你是不是一直在看")
            always_watching_privacy_states = states[before_always_watching_privacy_states:]
            always_watching_privacy_actions = button_actions[before_always_watching_privacy_actions:]
            before_always_record_privacy_states = len(states)
            before_always_record_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("会不会一直录")
            always_record_privacy_states = states[before_always_record_privacy_states:]
            always_record_privacy_actions = button_actions[before_always_record_privacy_actions:]
            before_always_shoot_privacy_states = len(states)
            before_always_shoot_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("会不会一直拍")
            always_shoot_privacy_states = states[before_always_shoot_privacy_states:]
            always_shoot_privacy_actions = button_actions[before_always_shoot_privacy_actions:]
            before_mic_off_privacy_states = len(states)
            before_mic_off_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("麦克风关了吗")
            mic_off_privacy_states = states[before_mic_off_privacy_states:]
            mic_off_privacy_actions = button_actions[before_mic_off_privacy_actions:]
            before_mic_on_privacy_states = len(states)
            before_mic_on_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("麦克风开着吗")
            mic_on_privacy_states = states[before_mic_on_privacy_states:]
            mic_on_privacy_actions = button_actions[before_mic_on_privacy_actions:]
            before_short_open_mic_privacy_states = len(states)
            before_short_open_mic_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你一直开着麦吗")
            short_open_mic_privacy_states = states[before_short_open_mic_privacy_states:]
            short_open_mic_privacy_actions = button_actions[before_short_open_mic_privacy_actions:]
            before_short_mic_still_on_privacy_states = len(states)
            before_short_mic_still_on_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("现在麦还开着吗")
            short_mic_still_on_privacy_states = states[before_short_mic_still_on_privacy_states:]
            short_mic_still_on_privacy_actions = button_actions[before_short_mic_still_on_privacy_actions:]
            before_short_mic_off_privacy_states = len(states)
            before_short_mic_off_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("麦关了吗")
            short_mic_off_privacy_states = states[before_short_mic_off_privacy_states:]
            short_mic_off_privacy_actions = button_actions[before_short_mic_off_privacy_actions:]
            extra_short_mic_privacy_cases = []
            for prompt in ("开麦了吗", "关麦了吗"):
                before_extra_short_mic_privacy_states = len(states)
                before_extra_short_mic_privacy_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                extra_short_mic_privacy_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_extra_short_mic_privacy_states:],
                        "actions": button_actions[before_extra_short_mic_privacy_actions:],
                    }
                )
            before_reverse_mic_on_privacy_states = len(states)
            before_reverse_mic_on_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你现在有没有开麦克风")
            reverse_mic_on_privacy_states = states[before_reverse_mic_on_privacy_states:]
            reverse_mic_on_privacy_actions = button_actions[before_reverse_mic_on_privacy_actions:]
            before_short_reverse_mic_on_privacy_states = len(states)
            before_short_reverse_mic_on_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("有没有打开麦克风")
            short_reverse_mic_on_privacy_states = states[before_short_reverse_mic_on_privacy_states:]
            short_reverse_mic_on_privacy_actions = button_actions[before_short_reverse_mic_on_privacy_actions:]
            before_mic_record_privacy_states = len(states)
            pi_command_daemon.handle_command("麦克风会一直录音吗")
            mic_record_privacy_states = states[before_mic_record_privacy_states:]
            before_record_down_privacy_states = len(states)
            before_record_down_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你会不会录下来")
            record_down_privacy_states = states[before_record_down_privacy_states:]
            record_down_privacy_actions = button_actions[before_record_down_privacy_actions:]
            before_audio_retention_privacy_states = len(states)
            before_audio_retention_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("录音会保存吗")
            audio_retention_privacy_states = states[before_audio_retention_privacy_states:]
            audio_retention_privacy_actions = button_actions[before_audio_retention_privacy_actions:]
            before_spoken_words_retention_privacy_states = len(states)
            before_spoken_words_retention_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("我说的话会保存吗")
            spoken_words_retention_privacy_states = states[before_spoken_words_retention_privacy_states:]
            spoken_words_retention_privacy_actions = button_actions[before_spoken_words_retention_privacy_actions:]
            before_voice_upload_privacy_states = len(states)
            before_voice_upload_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("我的语音会上传吗")
            voice_upload_privacy_states = states[before_voice_upload_privacy_states:]
            voice_upload_privacy_actions = button_actions[before_voice_upload_privacy_actions:]
            before_voice_save_privacy_states = len(states)
            before_voice_save_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你会保存我的声音吗")
            voice_save_privacy_states = states[before_voice_save_privacy_states:]
            voice_save_privacy_actions = button_actions[before_voice_save_privacy_actions:]
            location_privacy_cases = []
            for prompt in (
                "别记住我的位置",
                "别把我的位置记下来",
                "会保存我的位置吗",
                "不要上传我的定位",
                "别记我的路线",
                "不要保存我的行程",
                "会保存我的路线吗",
                "会不会保存我的目的地",
                "目的地会不会传云端",
                "我今天去哪儿会不会被记住",
                "别跟踪我",
                "不要追踪我的轨迹",
                "会跟踪我吗",
                "我跟朋友同路会不会一直记住",
                "我和同事在一起会保存吗",
                "别记录我和朋友在一起",
                "我和朋友在一起这件事别存",
                "别记我跟谁在一起",
                "这段别写进日志",
                "不要把我的路线写进日志",
                "别把我去哪儿写进日志",
                "错误日志会不会有我的位置",
                "别把我和朋友在一起写到log里",
            ):
                before_location_privacy_states = len(states)
                before_location_privacy_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                location_privacy_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_location_privacy_states:],
                        "actions": button_actions[before_location_privacy_actions:],
                    }
                )
            visual_privacy_cases = []
            for prompt in (
                "不要识别二维码",
                "别扫描二维码",
                "别看身份证号",
                "别记门牌号",
                "别保存车牌",
                "别识别车牌",
                "别读屏幕文字",
                "屏幕文字别读出来",
            ):
                before_visual_privacy_states = len(states)
                before_visual_privacy_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                visual_privacy_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_visual_privacy_states:],
                        "actions": button_actions[before_visual_privacy_actions:],
                    }
                )
            extra_audio_privacy_cases = []
            for prompt in (
                "你会把我的声音存起来吗",
                "你会不会存我的声音",
                "会不会存聊天记录",
                "会不会把我的语音传云端",
                "这段会不会上传",
                "别把声音传到云端",
                "别传云端",
                "不要传到云端",
                "这句不要上传",
                "这段话会保存吗",
                "你会把我的声音发给别人吗",
                "会不会把聊天记录发给别人",
                "别把这段话发给别人",
                "会不会传到服务器",
                "别传到服务器",
                "不要同步到云端",
                "你会拿我的声音训练模型吗",
                "别拿我的话训练模型",
                "这段会拿去训练吗",
                "别记住我说的话",
                "别记我刚才的话",
                "别保存我刚说的",
                "刚刚那段别存",
                "刚刚那段别存档",
                "别留档我刚才说的",
                "别偷录",
                "别留聊天记录",
                "别存档",
            ):
                before_extra_audio_privacy_states = len(states)
                before_extra_audio_privacy_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                extra_audio_privacy_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_extra_audio_privacy_states:],
                        "actions": button_actions[before_extra_audio_privacy_actions:],
                    }
                )
            context_memory_cases = []
            for prompt in (
                "上下文会保留多久",
                "刚才的上下文还在吗",
                "这一轮会记住什么",
                "会保存我的偏好吗",
                "别记我的偏好",
                "下次还会记得我喜欢的歌吗",
                "上一句还在上下文里吗",
                "我刚说喜欢不吵的歌你还记得吗",
                "我刚说想听安静的歌你会记得吗",
                "我喜欢不吵的歌这件事会保存吗",
                "你会一直记着我喜欢的歌吗",
                "下次还记得我爱听海边的歌吗",
                "你能接着上一句聊吗",
            ):
                before_context_memory_states = len(states)
                before_context_memory_spoken = len(spoken)
                before_context_memory_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                context_memory_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_context_memory_states:],
                        "spoken": spoken[before_context_memory_spoken:],
                        "actions": button_actions[before_context_memory_actions:],
                    }
                )
            quiet_context_memory_cases = []
            for prompt in ("别出声上下文会保留多久", "只写屏会保存我的偏好吗"):
                before_quiet_context_memory_states = len(states)
                before_quiet_context_memory_spoken = len(spoken)
                before_quiet_context_memory_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                quiet_context_memory_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_quiet_context_memory_states:],
                        "spoken": spoken[before_quiet_context_memory_spoken:],
                        "actions": button_actions[before_quiet_context_memory_actions:],
                    }
                )
            before_no_audio_recording_privacy_states = len(states)
            pi_command_daemon.handle_command("别录音")
            no_audio_recording_privacy_states = states[before_no_audio_recording_privacy_states:]
            before_no_short_recording_privacy_states = len(states)
            pi_command_daemon.handle_command("别录了")
            no_short_recording_privacy_states = states[before_no_short_recording_privacy_states:]
            before_no_open_mic_privacy_states = len(states)
            pi_command_daemon.handle_command("别开麦")
            no_open_mic_privacy_states = states[before_no_open_mic_privacy_states:]
            before_no_monitoring_privacy_states = len(states)
            pi_command_daemon.handle_command("不要监听我")
            no_monitoring_privacy_states = states[before_no_monitoring_privacy_states:]
            before_auto_camera_privacy_states = len(states)
            pi_command_daemon.handle_command("相机会自动开吗")
            auto_camera_privacy_states = states[before_auto_camera_privacy_states:]
            before_can_see_me_privacy_states = len(states)
            before_can_see_me_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你现在看得到我吗")
            can_see_me_privacy_states = states[before_can_see_me_privacy_states:]
            can_see_me_privacy_actions = button_actions[before_can_see_me_privacy_actions:]
            before_camera_off_privacy_states = len(states)
            before_camera_off_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("摄像头关着吗")
            camera_off_privacy_states = states[before_camera_off_privacy_states:]
            camera_off_privacy_actions = button_actions[before_camera_off_privacy_actions:]
            before_camera_on_privacy_states = len(states)
            before_camera_on_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("摄像头开着吗")
            camera_on_privacy_states = states[before_camera_on_privacy_states:]
            camera_on_privacy_actions = button_actions[before_camera_on_privacy_actions:]
            before_reverse_camera_on_privacy_states = len(states)
            before_reverse_camera_on_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("你现在有没有开摄像头")
            reverse_camera_on_privacy_states = states[before_reverse_camera_on_privacy_states:]
            reverse_camera_on_privacy_actions = button_actions[before_reverse_camera_on_privacy_actions:]
            before_short_reverse_camera_on_privacy_states = len(states)
            before_short_reverse_camera_on_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("有没有打开相机")
            short_reverse_camera_on_privacy_states = states[before_short_reverse_camera_on_privacy_states:]
            short_reverse_camera_on_privacy_actions = button_actions[before_short_reverse_camera_on_privacy_actions:]
            before_face_privacy_states = len(states)
            pi_command_daemon.handle_command("会识别人脸吗")
            face_privacy_states = states[before_face_privacy_states:]
            identity_privacy_cases = []
            for prompt in ("你会认出我是谁吗", "不要识别我是谁", "会判断我是谁吗"):
                before_identity_privacy_states = len(states)
                before_identity_privacy_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                identity_privacy_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_identity_privacy_states:],
                        "actions": button_actions[before_identity_privacy_actions:],
                    }
                )
            before_photo_retention_privacy_states = len(states)
            before_photo_retention_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("照片会保存吗")
            photo_retention_privacy_states = states[before_photo_retention_privacy_states:]
            photo_retention_privacy_actions = button_actions[before_photo_retention_privacy_actions:]
            photo_delete_privacy_cases = []
            for prompt in ("拍完会删吗", "照片会删掉吗", "分析后会删图吗"):
                before_photo_delete_privacy_states = len(states)
                before_photo_delete_privacy_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                photo_delete_privacy_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_photo_delete_privacy_states:],
                        "actions": button_actions[before_photo_delete_privacy_actions:],
                    }
                )
            before_photo_capture_privacy_states = len(states)
            before_photo_capture_privacy_actions = len(button_actions)
            pi_command_daemon.handle_command("会不会拍下来")
            photo_capture_privacy_states = states[before_photo_capture_privacy_states:]
            photo_capture_privacy_actions = button_actions[before_photo_capture_privacy_actions:]
            extra_camera_privacy_cases = []
            for prompt in ("别偷看", "别偷拍", "相机会不会偷偷开", "镜头关了吗"):
                before_extra_camera_privacy_states = len(states)
                before_extra_camera_privacy_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                extra_camera_privacy_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_extra_camera_privacy_states:],
                        "actions": button_actions[before_extra_camera_privacy_actions:],
                    }
                )
            before_no_photo_privacy_states = len(states)
            pi_command_daemon.handle_command("别拍我")
            no_photo_privacy_states = states[before_no_photo_privacy_states:]
            before_no_short_photo_privacy_states = len(states)
            pi_command_daemon.handle_command("别拍了")
            no_short_photo_privacy_states = states[before_no_short_photo_privacy_states:]
            before_no_watch_privacy_states = len(states)
            pi_command_daemon.handle_command("不要看我")
            no_watch_privacy_states = states[before_no_watch_privacy_states:]
            before_no_record_privacy_states = len(states)
            pi_command_daemon.handle_command("别录像")
            no_record_privacy_states = states[before_no_record_privacy_states:]
            quiet_privacy_status_cases = []
            for prompt, expected_city, expected_message in (
                ("别出声环境模式", "环境模式", "环境自适应"),
                ("只写屏原声电台", "环境模式", "原声电台"),
                ("别出声环境自适应", "环境模式", "环境自适应"),
                ("只写屏扫描此刻", "环境观察", "环境DJ 只轻调"),
                ("别出声环境感知", "环境DJ", "环境DJ 只轻调"),
                ("别出声环境记忆", "环境记忆", "光线较稳定"),
                ("只写屏环境计划", "环境计划", "环境计划"),
                ("别出声环境调音", "环境调音", "下一段"),
                ("只写屏隐私状态", "隐私状态", "不会自动拍照"),
                ("别出声相机状态", "相机状态", "IMX708"),
                ("只写屏相机排线怎么插", "相机排线", "IMX708"),
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                quiet_privacy_status_cases.append(
                    {
                        "prompt": prompt,
                        "expectedCity": expected_city,
                        "expectedMessage": expected_message,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            audio_mode.save_audio_mode("radio", reason="repeat stop smoke", path=mode_path)
            pi_command_daemon.handle_command("该 这 歌曲 停 停止")
            audio_mode.save_audio_mode("radio", reason="natural stop speech smoke", path=mode_path)
            button_actions.clear()
            before_stop_states = len(states)
            pi_command_daemon.handle_command("别播了")
            natural_stop_states = states[before_stop_states:]
            natural_stop_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="casual stop song smoke", path=mode_path)
            button_actions.clear()
            before_stop_song_states = len(states)
            pi_command_daemon.handle_command("把歌停了")
            stop_song_states = states[before_stop_song_states:]
            stop_song_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="casual stop music smoke", path=mode_path)
            button_actions.clear()
            before_stop_music_states = len(states)
            pi_command_daemon.handle_command("先把音乐停一下")
            stop_music_states = states[before_stop_music_states:]
            stop_music_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="casual no more songs smoke", path=mode_path)
            button_actions.clear()
            before_no_more_song_states = len(states)
            pi_command_daemon.handle_command("别放歌了")
            no_more_song_states = states[before_no_more_song_states:]
            no_more_song_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="casual no more broadcast smoke", path=mode_path)
            button_actions.clear()
            before_no_more_broadcast_states = len(states)
            pi_command_daemon.handle_command("先别播了")
            no_more_broadcast_states = states[before_no_more_broadcast_states:]
            no_more_broadcast_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="casual no more singing smoke", path=mode_path)
            button_actions.clear()
            before_no_more_singing_states = len(states)
            pi_command_daemon.handle_command("先别唱了")
            no_more_singing_states = states[before_no_more_singing_states:]
            no_more_singing_actions = list(button_actions)
            no_more_singing_variant_cases = []
            for phrase in ("不要唱了", "先不要唱了", "别继续唱了", "别接着播了", "别接着放了", "先别续播", "别再唱了"):
                audio_mode.save_audio_mode("radio", reason="casual no more singing variant smoke", path=mode_path)
                button_actions.clear()
                before_variant_states = len(states)
                pi_command_daemon.handle_command(phrase)
                no_more_singing_variant_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_variant_states:],
                        "actions": list(button_actions),
                    }
                )
            audio_mode.save_audio_mode("radio", reason="pause music reversed smoke", path=mode_path)
            button_actions.clear()
            before_pause_music_reversed_states = len(states)
            pi_command_daemon.handle_command("暂停一下音乐")
            pause_music_reversed_states = states[before_pause_music_reversed_states:]
            pause_music_reversed_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="direct no broadcast smoke", path=mode_path)
            button_actions.clear()
            before_no_broadcast_states = len(states)
            pi_command_daemon.handle_command("不要播了")
            no_broadcast_states = states[before_no_broadcast_states:]
            no_broadcast_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="stop a while smoke", path=mode_path)
            button_actions.clear()
            before_stop_a_while_states = len(states)
            pi_command_daemon.handle_command("先停会儿")
            stop_a_while_states = states[before_stop_a_while_states:]
            stop_a_while_actions = list(button_actions)
            rest_or_collect_sound_cases = []
            for phrase in (
                "先歇会儿",
                "歇一会儿吧",
                "收声一下",
                "声音收一下",
                "声音先收住",
                "音乐先收一下",
                "把音乐收一收",
                "音乐收一下",
                "歌先收一下",
                "歌曲先收一下",
                "把电台先收一下",
                "电台先安静一下",
                "先停一下别播了",
                "音乐先收一收",
            ):
                audio_mode.save_audio_mode("radio", reason="rest or collect sound smoke", path=mode_path)
                button_actions.clear()
                before_case_states = len(states)
                pi_command_daemon.handle_command(phrase)
                rest_or_collect_sound_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": list(button_actions),
                    }
                )
            audio_mode.save_audio_mode("radio", reason="casual music stop first smoke", path=mode_path)
            button_actions.clear()
            before_music_stop_first_states = len(states)
            pi_command_daemon.handle_command("音乐先停一下")
            music_stop_first_states = states[before_music_stop_first_states:]
            music_stop_first_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="casual sound off first smoke", path=mode_path)
            button_actions.clear()
            before_sound_off_first_states = len(states)
            pi_command_daemon.handle_command("声音先关一下")
            sound_off_first_states = states[before_sound_off_first_states:]
            sound_off_first_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="casual radio off first smoke", path=mode_path)
            button_actions.clear()
            before_radio_off_first_states = len(states)
            pi_command_daemon.handle_command("电台先关一会儿")
            radio_off_first_states = states[before_radio_off_first_states:]
            radio_off_first_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="close station smoke", path=mode_path)
            button_actions.clear()
            before_close_states = len(states)
            pi_command_daemon.handle_command("关掉电台")
            close_station_states = states[before_close_states:]
            close_station_actions = list(button_actions)
            stop_broadcast_cases = []
            for phrase in ("停播一下", "先停播一会儿", "先把电台收了"):
                audio_mode.save_audio_mode("radio", reason="stop broadcast smoke", path=mode_path)
                button_actions.clear()
                before_case_states = len(states)
                pi_command_daemon.handle_command(phrase)
                stop_broadcast_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": list(button_actions),
                    }
                )
            audio_mode.save_audio_mode("radio", reason="negative stop broadcast smoke", path=mode_path)
            button_actions.clear()
            before_negative_stop_broadcast_states = len(states)
            pi_command_daemon.handle_command("不要停播")
            negative_stop_broadcast_states = states[before_negative_stop_broadcast_states:]
            negative_stop_broadcast_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("再来一首")
            natural_next_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("这首先跳过吧")
            natural_skip_this_actions = list(button_actions)
            natural_skip_current_cases = []
            for phrase in ("别播这首了", "这首别播了", "把这首切掉", "切歌", "切一下歌", "换个歌", "跳一首"):
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                natural_skip_current_cases.append(
                    {
                        "phrase": phrase,
                        "actions": list(button_actions),
                    }
                )
            button_actions.clear()
            pi_command_daemon.handle_command("上一曲")
            natural_prev_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("回刚才那首")
            natural_previous_this_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("换个地方")
            natural_next_city_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("去别处")
            natural_next_place_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("回上一站")
            natural_prev_city_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("回上个地方")
            natural_prev_place_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("回到刚才那站")
            natural_prev_recent_stop_actions = list(button_actions)
            negative_city_action_cases = []
            for phrase in ("别去下一站", "不要换到下个城市", "先别去别的城市", "别回上一站", "不要回刚才那站", "别离开这里"):
                button_actions.clear()
                before_negative_city_states = len(states)
                pi_command_daemon.handle_command(phrase)
                negative_city_action_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_negative_city_states:],
                        "actions": list(button_actions),
                    }
                )
            button_actions.clear()
            pi_command_daemon.handle_command("再听一遍")
            natural_replay_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("从头来")
            natural_restart_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("声音小一点")
            natural_volume_down_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("声音太大了")
            natural_too_loud_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("小点声")
            natural_quieter_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("小点儿声")
            colloquial_quieter_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("小声点")
            casual_quieter_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("别那么响")
            casual_too_loud_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("不要那么大声")
            casual_too_loud_voice_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("小声回复我")
            quiet_reply_volume_actions = list(button_actions)
            natural_volume_down_variant_cases = []
            for phrase in ("声音调低点", "音量调低点", "调小一点", "轻声一点", "低声一点", "声音轻一点", "声音压低一点", "小一点声"):
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                natural_volume_down_variant_cases.append({"phrase": phrase, "actions": list(button_actions)})
            button_actions.clear()
            pi_command_daemon.handle_command("大声一点")
            natural_volume_up_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("大声点")
            casual_louder_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("大点儿声")
            colloquial_louder_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("声音太小了")
            natural_too_soft_actions = list(button_actions)
            button_actions.clear()
            pi_command_daemon.handle_command("听不清")
            natural_louder_actions = list(button_actions)
            natural_volume_up_variant_cases = []
            for phrase in ("声音调高点", "音量调高点", "调大一点"):
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                natural_volume_up_variant_cases.append({"phrase": phrase, "actions": list(button_actions)})
            before_now_title_states = len(states)
            before_now_title_spoken = len(spoken)
            pi_command_daemon.handle_command("这首歌叫什么")
            now_title_states = states[before_now_title_states:]
            now_title_spoken = spoken[before_now_title_spoken:]
            before_casual_title_states = len(states)
            before_casual_title_spoken = len(spoken)
            pi_command_daemon.handle_command("这歌叫啥")
            casual_title_states = states[before_casual_title_states:]
            casual_title_spoken = spoken[before_casual_title_spoken:]
            before_casual_song_name_states = len(states)
            before_casual_song_name_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这歌什么名字")
            casual_song_name_states = states[before_casual_song_name_states:]
            casual_song_name_spoken = spoken[before_casual_song_name_spoken:]
            casual_song_name_actions = list(button_actions)
            before_short_song_name_states = len(states)
            before_short_song_name_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这首啥名字")
            short_song_name_states = states[before_short_song_name_states:]
            short_song_name_spoken = spoken[before_short_song_name_spoken:]
            short_song_name_actions = list(button_actions)
            before_natural_song_name_states = len(states)
            before_natural_song_name_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这首歌啥名字")
            natural_song_name_states = states[before_natural_song_name_states:]
            natural_song_name_spoken = spoken[before_natural_song_name_spoken:]
            natural_song_name_actions = list(button_actions)
            before_direct_song_title_states = len(states)
            before_direct_song_title_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("歌名是什么")
            direct_song_title_states = states[before_direct_song_title_states:]
            direct_song_title_spoken = spoken[before_direct_song_title_spoken:]
            direct_song_title_actions = list(button_actions)
            before_current_song_title_states = len(states)
            before_current_song_title_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("现在歌叫什么名字")
            current_song_title_states = states[before_current_song_title_states:]
            current_song_title_spoken = spoken[before_current_song_title_spoken:]
            current_song_title_actions = list(button_actions)
            before_this_is_song_states = len(states)
            before_this_is_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这是什么歌")
            this_is_song_states = states[before_this_is_song_states:]
            this_is_song_spoken = spoken[before_this_is_song_spoken:]
            this_is_song_actions = list(button_actions)
            before_casual_this_is_song_states = len(states)
            before_casual_this_is_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这是啥歌")
            casual_this_is_song_states = states[before_casual_this_is_song_states:]
            casual_this_is_song_spoken = spoken[before_casual_this_is_song_spoken:]
            casual_this_is_song_actions = list(button_actions)
            song_city_origin_cases = []
            for phrase in (
                "这首歌是哪座城市的",
                "这是哪座城的歌",
                "这是哪站的歌",
                "这歌是哪儿的",
                "这首歌来自哪里",
                "这歌从哪儿来",
                "这歌什么地方的",
                "这歌属于哪座城",
                "这歌是不是这座城的",
                "这歌属于哪个城市",
                "这首歌对应哪一站",
                "这首归哪一站",
                "这歌归哪站",
                "这一首是哪站的歌",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                song_city_origin_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_just_played_song_states = len(states)
            before_just_played_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚刚放的是啥歌")
            just_played_song_states = states[before_just_played_song_states:]
            just_played_song_spoken = spoken[before_just_played_song_spoken:]
            just_played_song_actions = list(button_actions)
            before_terse_just_broadcast_states = len(states)
            before_terse_just_broadcast_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚播啥")
            terse_just_broadcast_states = states[before_terse_just_broadcast_states:]
            terse_just_broadcast_spoken = spoken[before_terse_just_broadcast_spoken:]
            terse_just_broadcast_actions = list(button_actions)
            before_terse_just_put_on_states = len(states)
            before_terse_just_put_on_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚放啥")
            terse_just_put_on_states = states[before_terse_just_put_on_states:]
            terse_just_put_on_spoken = spoken[before_terse_just_put_on_spoken:]
            terse_just_put_on_actions = list(button_actions)
            saved_playlist = list(pi_command_daemon.playlist)
            saved_current_index = pi_command_daemon.current_index
            pi_command_daemon.playlist = [
                {
                    "title": "真夜中のドア",
                    "artist": "松原みき",
                    "cityNameZh": "东京",
                    "citySlug": "tokyo",
                    "introText": "another neon city pop after dusk",
                    "audioUrl": "https://example.com/mayonaka.mp3",
                },
                {
                    "title": "Plastic Love",
                    "artist": "竹内まりや",
                    "cityNameZh": "东京",
                    "citySlug": "tokyo",
                    "introText": "city pop like neon rain on a late train",
                    "audioUrl": "https://example.com/plastic.mp3",
                },
            ]
            pi_command_daemon.current_index = 1
            before_previous_track_query_states = len(states)
            before_previous_track_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一首是什么")
            previous_track_query_states = states[before_previous_track_query_states:]
            previous_track_query_spoken = spoken[before_previous_track_query_spoken:]
            previous_track_query_actions = list(button_actions)
            before_terse_previous_track_query_states = len(states)
            before_terse_previous_track_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一首呢")
            terse_previous_track_query_states = states[before_terse_previous_track_query_states:]
            terse_previous_track_query_spoken = spoken[before_terse_previous_track_query_spoken:]
            terse_previous_track_query_actions = list(button_actions)
            before_short_previous_track_query_states = len(states)
            before_short_previous_track_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上首呢")
            short_previous_track_query_states = states[before_short_previous_track_query_states:]
            short_previous_track_query_spoken = spoken[before_short_previous_track_query_spoken:]
            short_previous_track_query_actions = list(button_actions)
            before_previous_track_artist_states = len(states)
            before_previous_track_artist_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一首谁唱的")
            previous_track_artist_states = states[before_previous_track_artist_states:]
            previous_track_artist_spoken = spoken[before_previous_track_artist_spoken:]
            previous_track_artist_actions = list(button_actions)
            before_previous_track_city_origin_states = len(states)
            before_previous_track_city_origin_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一首是哪座城市的")
            previous_track_city_origin_states = states[before_previous_track_city_origin_states:]
            previous_track_city_origin_spoken = spoken[before_previous_track_city_origin_spoken:]
            previous_track_city_origin_actions = list(button_actions)
            previous_track_place_origin_cases = []
            for phrase in (
                "刚才那首是哪儿的",
                "刚才那首来自哪里",
                "刚才那歌从哪儿来",
                "刚才播的那首来自哪里",
                "刚才听的那歌从哪儿来",
                "前面那首是哪里的",
                "刚刚那歌是哪个地方的",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                previous_track_place_origin_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_previous_track_casual_title_states = len(states)
            before_previous_track_casual_title_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚才那首歌叫什么")
            previous_track_casual_title_states = states[before_previous_track_casual_title_states:]
            previous_track_casual_title_spoken = spoken[before_previous_track_casual_title_spoken:]
            previous_track_casual_title_actions = list(button_actions)
            before_previous_track_casual_song_states = len(states)
            before_previous_track_casual_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚才那歌叫什么")
            previous_track_casual_song_states = states[before_previous_track_casual_song_states:]
            previous_track_casual_song_spoken = spoken[before_previous_track_casual_song_spoken:]
            previous_track_casual_song_actions = list(button_actions)
            previous_track_just_which_song_cases = []
            for phrase in ("刚才播的是哪首歌", "刚才放的是哪首歌", "刚才听的是哪首歌"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                previous_track_just_which_song_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_previous_track_earlier_title_states = len(states)
            before_previous_track_earlier_title_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("前面那首歌叫什么")
            previous_track_earlier_title_states = states[before_previous_track_earlier_title_states:]
            previous_track_earlier_title_spoken = spoken[before_previous_track_earlier_title_spoken:]
            previous_track_earlier_title_actions = list(button_actions)
            before_previous_track_previous_one_states = len(states)
            before_previous_track_previous_one_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一个歌叫什么")
            previous_track_previous_one_states = states[before_previous_track_previous_one_states:]
            previous_track_previous_one_spoken = spoken[before_previous_track_previous_one_spoken:]
            previous_track_previous_one_actions = list(button_actions)
            bare_previous_track_query_cases = []
            for phrase in (
                "上一个呢",
                "上一个是什么",
                "上一个啥",
                "上个呢",
                "上个是什么",
                "上个啥",
                "前一个呢",
                "前一个是什么",
                "前一个啥",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                bare_previous_track_query_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            pi_command_daemon.playlist = saved_playlist
            pi_command_daemon.current_index = saved_current_index
            before_casual_now_states = len(states)
            before_casual_now_spoken = len(spoken)
            pi_command_daemon.handle_command("现在放的是啥")
            casual_now_states = states[before_casual_now_states:]
            casual_now_spoken = spoken[before_casual_now_spoken:]
            before_currently_playing_states = len(states)
            before_currently_playing_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("现在播什么")
            currently_playing_states = states[before_currently_playing_states:]
            currently_playing_spoken = spoken[before_currently_playing_spoken:]
            currently_playing_actions = list(button_actions)
            before_current_song_states = len(states)
            before_current_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("现在听的是哪首歌")
            current_song_states = states[before_current_song_states:]
            current_song_spoken = spoken[before_current_song_spoken:]
            current_song_actions = list(button_actions)
            before_casual_current_song_states = len(states)
            before_casual_current_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("现在听什么歌")
            casual_current_song_states = states[before_casual_current_song_states:]
            casual_current_song_spoken = spoken[before_casual_current_song_spoken:]
            casual_current_song_actions = list(button_actions)
            present_is_song_cases = []
            for phrase in (
                "现在是什么歌",
                "这会儿是什么歌",
                "此刻是啥歌",
                "这会儿放哪一首",
                "这会儿播哪一首",
                "这会儿响的是哪首",
                "这会儿谁在唱",
                "现在是谁在唱",
                "正在唱的是谁",
                "这会儿唱的是谁",
                "这首歌歌手叫啥",
                "这首什么名字",
                "这歌是谁的",
                "现在第几首",
                "当前第几首",
                "现在播到第几首了",
                "第几首了",
                "到第几首了",
                "播到第几首了",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                present_is_song_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_current_singing_states = len(states)
            before_current_singing_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("现在唱的是啥")
            current_singing_states = states[before_current_singing_states:]
            current_singing_spoken = spoken[before_current_singing_spoken:]
            current_singing_actions = list(button_actions)
            before_current_singing_song_states = len(states)
            before_current_singing_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("现在唱什么歌")
            current_singing_song_states = states[before_current_singing_song_states:]
            current_singing_song_spoken = spoken[before_current_singing_song_spoken:]
            current_singing_song_actions = list(button_actions)
            before_currently_singing_song_states = len(states)
            before_currently_singing_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("正在唱什么歌")
            currently_singing_song_states = states[before_currently_singing_song_states:]
            currently_singing_song_spoken = spoken[before_currently_singing_song_spoken:]
            currently_singing_song_actions = list(button_actions)
            before_demonstrative_current_song_states = len(states)
            before_demonstrative_current_song_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这一首是什么歌")
            demonstrative_current_song_states = states[before_demonstrative_current_song_states:]
            demonstrative_current_song_spoken = spoken[before_demonstrative_current_song_spoken:]
            demonstrative_current_song_actions = list(button_actions)
            before_playback_position_states = len(states)
            before_playback_position_spoken = len(spoken)
            pi_command_daemon.handle_command("播到哪了")
            playback_position_states = states[before_playback_position_states:]
            playback_position_spoken = spoken[before_playback_position_spoken:]
            before_now_artist_states = len(states)
            pi_command_daemon.handle_command("谁唱的")
            now_artist_states = states[before_now_artist_states:]
            before_who_sings_this_states = len(states)
            pi_command_daemon.handle_command("这是谁唱的")
            who_sings_this_states = states[before_who_sings_this_states:]
            before_terse_whose_song_states = len(states)
            button_actions.clear()
            pi_command_daemon.handle_command("这谁的歌")
            terse_whose_song_states = states[before_terse_whose_song_states:]
            terse_whose_song_actions = list(button_actions)
            before_short_artist_states = len(states)
            button_actions.clear()
            pi_command_daemon.handle_command("这首谁唱的")
            short_artist_states = states[before_short_artist_states:]
            short_artist_actions = list(button_actions)
            before_shorter_artist_states = len(states)
            button_actions.clear()
            pi_command_daemon.handle_command("这歌谁唱的")
            shorter_artist_states = states[before_shorter_artist_states:]
            shorter_artist_actions = list(button_actions)
            before_casual_artist_states = len(states)
            pi_command_daemon.handle_command("现在这首谁唱的")
            casual_artist_states = states[before_casual_artist_states:]
            before_casual_song_artist_states = len(states)
            button_actions.clear()
            pi_command_daemon.handle_command("现在这歌谁唱的")
            casual_song_artist_states = states[before_casual_song_artist_states:]
            casual_song_artist_actions = list(button_actions)
            current_owner_origin_cases = []
            for phrase in (
                "谁唱的来着",
                "谁的歌来着",
                "这是谁的歌",
                "这首是谁的歌",
                "这是哪儿的歌",
                "这首哪儿的歌",
                "现在这个歌是哪儿来的",
                "现在这个歌从哪儿来",
                "现在这个歌来自哪里",
                "现在这个歌是哪里的",
                "现在这首是哪座城来的",
                "这会儿在听哪儿的歌",
            ):
                before_case_states = len(states)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                current_owner_origin_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": list(button_actions),
                    }
                )
            before_now_city_states = len(states)
            before_now_city_spoken = len(spoken)
            pi_command_daemon.handle_command("现在在哪座城市")
            now_city_states = states[before_now_city_states:]
            now_city_spoken = spoken[before_now_city_spoken:]
            before_this_moment_broadcast_city_states = len(states)
            before_this_moment_broadcast_city_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这会儿播哪座城")
            this_moment_broadcast_city_states = states[before_this_moment_broadcast_city_states:]
            this_moment_broadcast_city_spoken = spoken[before_this_moment_broadcast_city_spoken:]
            this_moment_broadcast_city_actions = list(button_actions)
            before_now_here_casual_states = len(states)
            before_now_here_casual_spoken = len(spoken)
            before_now_here_casual_actions = len(button_actions)
            pi_command_daemon.handle_command("现在在哪儿")
            now_here_casual_states = states[before_now_here_casual_states:]
            now_here_casual_spoken = spoken[before_now_here_casual_spoken:]
            now_here_casual_actions = button_actions[before_now_here_casual_actions:]
            before_now_place_states = len(states)
            pi_command_daemon.handle_command("我们在哪")
            now_place_states = states[before_now_place_states:]
            before_where_are_we_states = len(states)
            before_where_are_we_spoken = len(spoken)
            before_where_are_we_actions = len(button_actions)
            pi_command_daemon.handle_command("咱们到哪儿了")
            where_are_we_states = states[before_where_are_we_states:]
            where_are_we_spoken = spoken[before_where_are_we_spoken:]
            where_are_we_actions = button_actions[before_where_are_we_actions:]
            before_short_where_are_we_states = len(states)
            before_short_where_are_we_spoken = len(spoken)
            before_short_where_are_we_actions = len(button_actions)
            pi_command_daemon.handle_command("咱到哪了")
            short_where_are_we_states = states[before_short_where_are_we_states:]
            short_where_are_we_spoken = spoken[before_short_where_are_we_spoken:]
            short_where_are_we_actions = button_actions[before_short_where_are_we_actions:]
            terse_stop_index_cases = []
            for phrase in ("第几站了", "走到第几站了", "到第几站了", "这趟到第几站了"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                terse_stop_index_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_now_where_states = len(states)
            before_now_where_spoken = len(spoken)
            before_now_where_actions = len(button_actions)
            pi_command_daemon.handle_command("现在到哪了")
            now_where_states = states[before_now_where_states:]
            now_where_spoken = spoken[before_now_where_spoken:]
            now_where_actions = button_actions[before_now_where_actions:]
            presently_where_cases = []
            for phrase in (
                "目前到哪一站了",
                "目前走到哪了",
                "走到哪一站了",
                "走到哪站了",
                "目前在哪座城市",
                "这会儿到哪儿了",
                "这会儿在哪儿",
                "这一站现在是哪座城",
                "别换城市，只问现在到哪了",
                "追到哪场日落了",
                "现在落在哪座城",
                "这场日落是哪座城",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                presently_where_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            terse_arrived_where_cases = []
            for phrase in ("到哪了", "到哪儿啦", "到哪里啦"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                terse_arrived_where_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_now_place_no_verb_states = len(states)
            before_now_place_no_verb_spoken = len(spoken)
            before_now_place_no_verb_actions = len(button_actions)
            pi_command_daemon.handle_command("现在什么地方")
            now_place_no_verb_states = states[before_now_place_no_verb_states:]
            now_place_no_verb_spoken = spoken[before_now_place_no_verb_spoken:]
            now_place_no_verb_actions = button_actions[before_now_place_no_verb_actions:]
            before_arrival_city_states = len(states)
            before_arrival_city_spoken = len(spoken)
            before_arrival_city_actions = len(button_actions)
            pi_command_daemon.handle_command("到哪个城市了")
            arrival_city_states = states[before_arrival_city_states:]
            arrival_city_spoken = spoken[before_arrival_city_spoken:]
            arrival_city_actions = button_actions[before_arrival_city_actions:]
            before_current_stop_index_states = len(states)
            before_current_stop_index_spoken = len(spoken)
            before_current_stop_index_actions = len(button_actions)
            pi_command_daemon.handle_command("现在是第几站了")
            current_stop_index_states = states[before_current_stop_index_states:]
            current_stop_index_spoken = spoken[before_current_stop_index_spoken:]
            current_stop_index_actions = button_actions[before_current_stop_index_actions:]
            before_current_stop_which_states = len(states)
            before_current_stop_which_spoken = len(spoken)
            before_current_stop_which_actions = len(button_actions)
            pi_command_daemon.handle_command("咱们是哪站")
            current_stop_which_states = states[before_current_stop_which_states:]
            current_stop_which_spoken = spoken[before_current_stop_which_spoken:]
            current_stop_which_actions = button_actions[before_current_stop_which_actions:]
            before_current_stop_short_states = len(states)
            before_current_stop_short_spoken = len(spoken)
            before_current_stop_short_actions = len(button_actions)
            pi_command_daemon.handle_command("这站是哪儿")
            current_stop_short_states = states[before_current_stop_short_states:]
            current_stop_short_spoken = spoken[before_current_stop_short_spoken:]
            current_stop_short_actions = button_actions[before_current_stop_short_actions:]
            before_current_stop_name_states = len(states)
            before_current_stop_name_spoken = len(spoken)
            before_current_stop_name_actions = len(button_actions)
            pi_command_daemon.handle_command("这站叫什么")
            current_stop_name_states = states[before_current_stop_name_states:]
            current_stop_name_spoken = spoken[before_current_stop_name_spoken:]
            current_stop_name_actions = button_actions[before_current_stop_name_actions:]
            before_current_stop_casual_name_states = len(states)
            before_current_stop_casual_name_spoken = len(spoken)
            before_current_stop_casual_name_actions = len(button_actions)
            pi_command_daemon.handle_command("这站叫啥")
            current_stop_casual_name_states = states[before_current_stop_casual_name_states:]
            current_stop_casual_name_spoken = spoken[before_current_stop_casual_name_spoken:]
            current_stop_casual_name_actions = button_actions[before_current_stop_casual_name_actions:]
            before_current_stop_explicit_name_states = len(states)
            before_current_stop_explicit_name_spoken = len(spoken)
            before_current_stop_explicit_name_actions = len(button_actions)
            pi_command_daemon.handle_command("这站名字叫什么")
            current_stop_explicit_name_states = states[before_current_stop_explicit_name_states:]
            current_stop_explicit_name_spoken = spoken[before_current_stop_explicit_name_spoken:]
            current_stop_explicit_name_actions = button_actions[before_current_stop_explicit_name_actions:]
            before_first_person_current_stop_states = len(states)
            before_first_person_current_stop_spoken = len(spoken)
            before_first_person_current_stop_actions = len(button_actions)
            pi_command_daemon.handle_command("我们这是哪站")
            first_person_current_stop_states = states[before_first_person_current_stop_states:]
            first_person_current_stop_spoken = spoken[before_first_person_current_stop_spoken:]
            first_person_current_stop_actions = button_actions[before_first_person_current_stop_actions:]
            before_terse_current_stop_states = len(states)
            before_terse_current_stop_spoken = len(spoken)
            before_terse_current_stop_actions = len(button_actions)
            pi_command_daemon.handle_command("这是哪站")
            terse_current_stop_states = states[before_terse_current_stop_states:]
            terse_current_stop_spoken = spoken[before_terse_current_stop_spoken:]
            terse_current_stop_actions = button_actions[before_terse_current_stop_actions:]
            before_current_city_name_states = len(states)
            before_current_city_name_spoken = len(spoken)
            before_current_city_name_actions = len(button_actions)
            pi_command_daemon.handle_command("这座城市叫什么")
            current_city_name_states = states[before_current_city_name_states:]
            current_city_name_spoken = spoken[before_current_city_name_spoken:]
            current_city_name_actions = button_actions[before_current_city_name_actions:]
            extra_current_place_name_cases = []
            for prompt in (
                "这座城市叫什么名字",
                "这地方叫什么",
                "现在站名是什么",
                "现在城市名字是什么",
                "这站名字是什么",
                "现在在地球哪边",
                "这一站是哪儿",
                "现在这一站是哪",
                "你在哪个城市",
                "小福在哪座城",
                "弗洛斯特到哪座城了",
            ):
                before_extra_current_place_name_states = len(states)
                before_extra_current_place_name_spoken = len(spoken)
                before_extra_current_place_name_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                extra_current_place_name_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_extra_current_place_name_states:],
                        "spoken": spoken[before_extra_current_place_name_spoken:],
                        "actions": button_actions[before_extra_current_place_name_actions:],
                    }
                )
            audio_mode.save_audio_mode("radio", reason="current place followups smoke", path=mode_path)
            before_current_city_casual_name_states = len(states)
            before_current_city_casual_name_spoken = len(spoken)
            before_current_city_casual_name_actions = len(button_actions)
            pi_command_daemon.handle_command("现在这座城叫啥")
            current_city_casual_name_states = states[before_current_city_casual_name_states:]
            current_city_casual_name_spoken = spoken[before_current_city_casual_name_spoken:]
            current_city_casual_name_actions = button_actions[before_current_city_casual_name_actions:]
            before_now_here_states = len(states)
            before_now_here_spoken = len(spoken)
            pi_command_daemon.handle_command("这里是哪座城市")
            now_here_states = states[before_now_here_states:]
            now_here_spoken = spoken[before_now_here_spoken:]
            before_here_casual_name_states = len(states)
            before_here_casual_name_spoken = len(spoken)
            before_here_casual_name_actions = len(button_actions)
            pi_command_daemon.handle_command("这里叫啥")
            here_casual_name_states = states[before_here_casual_name_states:]
            here_casual_name_spoken = spoken[before_here_casual_name_spoken:]
            here_casual_name_actions = button_actions[before_here_casual_name_actions:]
            before_short_this_place_states = len(states)
            before_short_this_place_spoken = len(spoken)
            before_short_this_place_actions = len(button_actions)
            pi_command_daemon.handle_command("这儿是哪")
            short_this_place_states = states[before_short_this_place_states:]
            short_this_place_spoken = spoken[before_short_this_place_spoken:]
            short_this_place_actions = button_actions[before_short_this_place_actions:]
            before_short_here_place_states = len(states)
            before_short_here_place_spoken = len(spoken)
            before_short_here_place_actions = len(button_actions)
            pi_command_daemon.handle_command("这里是哪")
            short_here_place_states = states[before_short_here_place_states:]
            short_here_place_spoken = spoken[before_short_here_place_spoken:]
            short_here_place_actions = button_actions[before_short_here_place_actions:]
            before_short_here_location_states = len(states)
            before_short_here_location_spoken = len(spoken)
            before_short_here_location_actions = len(button_actions)
            pi_command_daemon.handle_command("这里是哪儿")
            short_here_location_states = states[before_short_here_location_states:]
            short_here_location_spoken = spoken[before_short_here_location_spoken:]
            short_here_location_actions = button_actions[before_short_here_location_actions:]
            before_place_location_states = len(states)
            before_place_location_spoken = len(spoken)
            before_place_location_actions = len(button_actions)
            pi_command_daemon.handle_command("这地方是哪儿")
            place_location_states = states[before_place_location_states:]
            place_location_spoken = spoken[before_place_location_spoken:]
            place_location_actions = button_actions[before_place_location_actions:]
            before_story_states = len(states)
            before_story_spoken = len(spoken)
            pi_command_daemon.handle_command("讲讲这首歌")
            story_states = states[before_story_states:]
            story_spoken = spoken[before_story_spoken:]
            before_text_only_story_states = len(states)
            before_text_only_story_spoken = len(spoken)
            before_text_only_story_actions = len(button_actions)
            pi_command_daemon.handle_command("这首歌故事别念出来")
            text_only_story_states = states[before_text_only_story_states:]
            text_only_story_spoken = spoken[before_text_only_story_spoken:]
            text_only_story_actions = button_actions[before_text_only_story_actions:]
            story_variant_cases = []
            for phrase in ("说说这首歌", "聊聊这首歌", "这首说说", "这歌讲讲", "这曲介绍一下"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                story_variant_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_song_origin_states = len(states)
            before_song_origin_spoken = len(spoken)
            pi_command_daemon.handle_command("这首歌什么来头")
            song_origin_states = states[before_song_origin_states:]
            song_origin_spoken = spoken[before_song_origin_spoken:]
            before_song_casual_origin_states = len(states)
            before_song_casual_origin_spoken = len(spoken)
            before_song_casual_origin_actions = len(button_actions)
            pi_command_daemon.handle_command("这歌什么来历")
            song_casual_origin_states = states[before_song_casual_origin_states:]
            song_casual_origin_spoken = spoken[before_song_casual_origin_spoken:]
            song_casual_origin_actions = button_actions[before_song_casual_origin_actions:]
            song_origin_extra_cases = []
            for phrase in (
                "这歌啥来头",
                "这歌什么来头",
                "这首歌什么来路",
                "这歌背后什么故事",
                "这歌是什么来历",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                song_origin_extra_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_why_song_states = len(states)
            before_why_song_spoken = len(spoken)
            pi_command_daemon.handle_command("为什么放这首")
            why_song_states = states[before_why_song_states:]
            why_song_spoken = spoken[before_why_song_spoken:]
            before_casual_why_song_states = len(states)
            before_casual_why_song_spoken = len(spoken)
            before_casual_why_song_actions = len(button_actions)
            pi_command_daemon.handle_command("为啥放这首")
            casual_why_song_states = states[before_casual_why_song_states:]
            casual_why_song_spoken = spoken[before_casual_why_song_spoken:]
            casual_why_song_actions = button_actions[before_casual_why_song_actions:]
            casual_song_choice_cases = []
            for phrase in ("这首为啥播", "这首怎么选的", "怎么选的这首"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                casual_song_choice_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            song_city_relation_cases = []
            for phrase in (
                "这首歌和这座城市有什么关系",
                "这首和这里有什么关系",
                "这首歌跟东京有什么关系",
                "这首歌和当前城市有什么关系",
                "这歌和这里有关吗",
                "这首歌跟这个城市有关吗",
                "这首歌和这场日落有什么关系",
                "这首跟当前日落有啥联系",
                "这座城跟歌有什么关系",
                "这首歌适合东京吗",
                "这歌配这里吗",
                "这首歌放在东京合适吗",
                "这歌搭东京吗",
                "这首歌适不适合东京",
                "这歌合不合适这里",
                "这歌适合现在这场日落吗",
                "这歌配当前日落吗",
                "这歌跟这个地方有什么联系",
                "这首适合这个地方吗",
                "这歌为啥适合这一站",
                "这首歌像不像这座城",
                "这歌有这座城的感觉吗",
                "这首歌有没有这个城市的味道",
                "这歌和这座城对味吗",
                "这首放这里对味吗",
                "这歌放这站对吗",
                "这首歌为什么给这一站",
                "为什么给这座城配这首歌",
                "为什么这个城市用这首歌",
                "这座城为什么配这首歌",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                song_city_relation_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_song_writer_states = len(states)
            before_song_writer_spoken = len(spoken)
            before_song_writer_actions = len(button_actions)
            pi_command_daemon.handle_command("这首歌谁写的")
            song_writer_states = states[before_song_writer_states:]
            song_writer_spoken = spoken[before_song_writer_spoken:]
            song_writer_actions = button_actions[before_song_writer_actions:]
            before_song_composer_states = len(states)
            before_song_composer_spoken = len(spoken)
            before_song_composer_actions = len(button_actions)
            pi_command_daemon.handle_command("这首谁作曲")
            song_composer_states = states[before_song_composer_states:]
            song_composer_spoken = spoken[before_song_composer_spoken:]
            song_composer_actions = button_actions[before_song_composer_actions:]
            before_song_lyricist_states = len(states)
            before_song_lyricist_spoken = len(spoken)
            before_song_lyricist_actions = len(button_actions)
            pi_command_daemon.handle_command("这首谁填词")
            song_lyricist_states = states[before_song_lyricist_states:]
            song_lyricist_spoken = spoken[before_song_lyricist_spoken:]
            song_lyricist_actions = button_actions[before_song_lyricist_actions:]
            before_this_composer_states = len(states)
            before_this_composer_spoken = len(spoken)
            before_this_composer_actions = len(button_actions)
            pi_command_daemon.handle_command("这是谁作曲的")
            this_composer_states = states[before_this_composer_states:]
            this_composer_spoken = spoken[before_this_composer_spoken:]
            this_composer_actions = button_actions[before_this_composer_actions:]
            before_song_meaning_states = len(states)
            before_song_meaning_spoken = len(spoken)
            before_song_meaning_actions = len(button_actions)
            pi_command_daemon.handle_command("这首歌讲什么")
            song_meaning_states = states[before_song_meaning_states:]
            song_meaning_spoken = spoken[before_song_meaning_spoken:]
            song_meaning_actions = button_actions[before_song_meaning_actions:]
            song_meaning_variant_cases = []
            for phrase in (
                "这歌讲的什么",
                "这首歌想表达什么",
                "这首歌想表达啥",
                "这歌想表达什么",
                "这歌什么意思",
                "这首歌在唱啥",
                "这个歌在唱什么",
                "这歌主题是啥",
                "这歌写的什么",
                "这歌讲啥",
                "这歌在讲什么",
                "歌词什么意思",
                "歌词讲啥",
                "讲讲歌词",
                "副歌什么意思",
                "副歌讲啥",
                "这句歌词什么意思",
                "这句词讲啥",
                "这段词在讲什么",
                "这段词讲啥",
                "这个歌唱的什么",
                "这首歌说的是什么",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                song_meaning_variant_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_current_city_story_states = len(states)
            before_current_city_story_spoken = len(spoken)
            pi_command_daemon.handle_command("讲讲这座城市")
            current_city_story_states = states[before_current_city_story_states:]
            current_city_story_spoken = spoken[before_current_city_story_spoken:]
            before_text_only_city_story_states = len(states)
            before_text_only_city_story_spoken = len(spoken)
            before_text_only_city_story_actions = len(button_actions)
            pi_command_daemon.handle_command("把这座城市故事写在屏幕上")
            text_only_city_story_states = states[before_text_only_city_story_states:]
            text_only_city_story_spoken = spoken[before_text_only_city_story_spoken:]
            text_only_city_story_actions = button_actions[before_text_only_city_story_actions:]
            before_here_story_states = len(states)
            before_here_story_spoken = len(spoken)
            pi_command_daemon.handle_command("讲讲这里")
            here_story_states = states[before_here_story_states:]
            here_story_spoken = spoken[before_here_story_spoken:]
            current_sunset_story_cases = []
            for phrase in (
                "讲讲这场日落",
                "这站讲讲",
                "这场日落什么来头",
                "当前日落有啥故事",
                "这场日落是什么感觉",
                "为什么是这座城市",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                current_sunset_story_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_current_stop_meaning_states = len(states)
            before_current_stop_meaning_spoken = len(spoken)
            before_current_stop_meaning_actions = len(button_actions)
            pi_command_daemon.handle_command("这一站讲什么")
            current_stop_meaning_states = states[before_current_stop_meaning_states:]
            current_stop_meaning_spoken = spoken[before_current_stop_meaning_spoken:]
            current_stop_meaning_actions = button_actions[before_current_stop_meaning_actions:]
            before_here_feeling_states = len(states)
            before_here_feeling_spoken = len(spoken)
            pi_command_daemon.handle_command("这里什么感觉")
            here_feeling_states = states[before_here_feeling_states:]
            here_feeling_spoken = spoken[before_here_feeling_spoken:]
            before_here_origin_states = len(states)
            before_here_origin_spoken = len(spoken)
            pi_command_daemon.handle_command("这里有什么来头")
            here_origin_states = states[before_here_origin_states:]
            here_origin_spoken = spoken[before_here_origin_spoken:]
            before_place_origin_states = len(states)
            before_place_origin_spoken = len(spoken)
            pi_command_daemon.handle_command("这地方什么来头")
            place_origin_states = states[before_place_origin_states:]
            place_origin_spoken = spoken[before_place_origin_spoken:]
            before_short_city_origin_states = len(states)
            before_short_city_origin_spoken = len(spoken)
            before_short_city_origin_actions = len(button_actions)
            pi_command_daemon.handle_command("这城什么来头")
            short_city_origin_states = states[before_short_city_origin_states:]
            short_city_origin_spoken = spoken[before_short_city_origin_spoken:]
            short_city_origin_actions = button_actions[before_short_city_origin_actions:]
            before_casual_city_story_states = len(states)
            before_casual_city_story_spoken = len(spoken)
            before_casual_city_story_actions = len(button_actions)
            pi_command_daemon.handle_command("这座城有啥故事")
            casual_city_story_states = states[before_casual_city_story_states:]
            casual_city_story_spoken = spoken[before_casual_city_story_spoken:]
            casual_city_story_actions = button_actions[before_casual_city_story_actions:]
            last_reply_seed = {
                "status": "idle",
                "label": "City story",
                "city": "城市故事",
                "track": "东京",
                "message": "东京：霓虹、晚风和城市流行的黄昏。",
            }
            pi_command_daemon.LAST_PUBLISHED_STATE = dict(last_reply_seed)
            audio_mode.save_audio_mode("radio", reason="repeat last reply smoke", path=mode_path)
            before_repeat_last_states = len(states)
            before_repeat_last_spoken = len(spoken)
            pi_command_daemon.handle_command("再说一遍")
            repeat_last_states = states[before_repeat_last_states:]
            repeat_last_spoken = spoken[before_repeat_last_spoken:]
            repeat_last_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_quiet_repeat_last_states = len(states)
            before_quiet_repeat_last_spoken = len(spoken)
            pi_command_daemon.handle_command("别出声再说一遍")
            quiet_repeat_last_states = states[before_quiet_repeat_last_states:]
            quiet_repeat_last_spoken = spoken[before_quiet_repeat_last_spoken:]
            quiet_repeat_last_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_screen_repeat_last_states = len(states)
            before_screen_repeat_last_spoken = len(spoken)
            pi_command_daemon.handle_command("只写屏再说一遍")
            screen_repeat_last_states = states[before_screen_repeat_last_states:]
            screen_repeat_last_spoken = spoken[before_screen_repeat_last_spoken:]
            screen_repeat_last_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            audio_mode.save_audio_mode("soft_mute", reason="repeat last mute boundary smoke", path=mode_path)
            before_muted_repeat_last_states = len(states)
            before_muted_repeat_last_spoken = len(spoken)
            pi_command_daemon.handle_command("再说一遍")
            muted_repeat_last_states = states[before_muted_repeat_last_states:]
            muted_repeat_last_spoken = spoken[before_muted_repeat_last_spoken:]
            muted_repeat_last_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            audio_mode.save_audio_mode("radio", reason="repeat last reply followups smoke", path=mode_path)
            before_casual_repeat_states = len(states)
            before_casual_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚说啥")
            casual_repeat_states = states[before_casual_repeat_states:]
            casual_repeat_spoken = spoken[before_casual_repeat_spoken:]
            casual_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_just_said_repeat_states = len(states)
            before_just_said_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚刚说啥")
            just_said_repeat_states = states[before_just_said_repeat_states:]
            just_said_repeat_spoken = spoken[before_just_said_repeat_spoken:]
            just_said_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_casual_reply_repeat_states = len(states)
            before_casual_reply_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚才回我啥")
            casual_reply_repeat_states = states[before_casual_reply_repeat_states:]
            casual_reply_repeat_spoken = spoken[before_casual_reply_repeat_spoken:]
            casual_reply_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_just_replied_repeat_states = len(states)
            before_just_replied_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚刚回我啥")
            just_replied_repeat_states = states[before_just_replied_repeat_states:]
            just_replied_repeat_spoken = spoken[before_just_replied_repeat_spoken:]
            just_replied_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_terse_replied_repeat_states = len(states)
            before_terse_replied_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚回我啥")
            terse_replied_repeat_states = states[before_terse_replied_repeat_states:]
            terse_replied_repeat_spoken = spoken[before_terse_replied_repeat_spoken:]
            terse_replied_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_inverted_replied_repeat_states = len(states)
            before_inverted_replied_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才你回啥")
            inverted_replied_repeat_states = states[before_inverted_replied_repeat_states:]
            inverted_replied_repeat_spoken = spoken[before_inverted_replied_repeat_spoken:]
            inverted_replied_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_reply_what_repeat_states = len(states)
            before_reply_what_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("刚回复了什么")
            reply_what_repeat_states = states[before_reply_what_repeat_states:]
            reply_what_repeat_spoken = spoken[before_reply_what_repeat_spoken:]
            reply_what_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_replied_repeat_states = len(states)
            before_previous_replied_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("上一句你回我啥")
            previous_replied_repeat_states = states[before_previous_replied_repeat_states:]
            previous_replied_repeat_spoken = spoken[before_previous_replied_repeat_spoken:]
            previous_replied_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_short_previous_replied_repeat_states = len(states)
            before_short_previous_replied_repeat_spoken = len(spoken)
            pi_command_daemon.handle_command("上一句回啥")
            short_previous_replied_repeat_states = states[before_short_previous_replied_repeat_states:]
            short_previous_replied_repeat_spoken = spoken[before_short_previous_replied_repeat_spoken:]
            short_previous_replied_repeat_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_reply_states = len(states)
            before_previous_reply_spoken = len(spoken)
            pi_command_daemon.handle_command("你上一句说什么")
            previous_reply_states = states[before_previous_reply_states:]
            previous_reply_spoken = spoken[before_previous_reply_spoken:]
            previous_reply_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_text_only_repeat_last_states = len(states)
            before_text_only_repeat_last_spoken = len(spoken)
            pi_command_daemon.handle_command("上一句你回我啥写在屏幕上")
            text_only_repeat_last_states = states[before_text_only_repeat_last_states:]
            text_only_repeat_last_spoken = spoken[before_text_only_repeat_last_spoken:]
            text_only_repeat_last_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_last_action_states = len(states)
            before_last_action_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才调用了什么技能")
            last_action_states = states[before_last_action_states:]
            last_action_spoken = spoken[before_last_action_spoken:]
            last_action_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_text_only_last_action_states = len(states)
            before_text_only_last_action_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才调用了什么技能写在屏幕上")
            text_only_last_action_states = states[before_text_only_last_action_states:]
            text_only_last_action_spoken = spoken[before_text_only_last_action_spoken:]
            text_only_last_action_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            quiet_last_action_cases = []
            for phrase in ("别出声刚才调用了什么技能", "只写屏上条路由到哪了"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase)
                quiet_last_action_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "memory": dict(pi_command_daemon.LAST_PUBLISHED_STATE),
                    }
                )
            before_natural_last_action_states = len(states)
            before_natural_last_action_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚才做了什么")
            natural_last_action_states = states[before_natural_last_action_states:]
            natural_last_action_spoken = spoken[before_natural_last_action_spoken:]
            natural_last_action_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_casual_last_action_states = len(states)
            before_casual_last_action_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才干啥了")
            casual_last_action_states = states[before_casual_last_action_states:]
            casual_last_action_spoken = spoken[before_casual_last_action_spoken:]
            casual_last_action_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_terse_just_action_states = len(states)
            before_terse_just_action_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚干啥了")
            terse_just_action_states = states[before_terse_just_action_states:]
            terse_just_action_spoken = spoken[before_terse_just_action_spoken:]
            terse_just_action_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_executed_action_states = len(states)
            before_executed_action_spoken = len(spoken)
            pi_command_daemon.handle_command("执行了什么动作")
            executed_action_states = states[before_executed_action_states:]
            executed_action_spoken = spoken[before_executed_action_spoken:]
            executed_action_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_last_capability_states = len(states)
            before_last_capability_spoken = len(spoken)
            pi_command_daemon.handle_command("用了哪个能力")
            last_capability_states = states[before_last_capability_states:]
            last_capability_spoken = spoken[before_last_capability_spoken:]
            last_capability_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_last_tool_states = len(states)
            before_last_tool_spoken = len(spoken)
            pi_command_daemon.handle_command("你用了什么工具")
            last_tool_states = states[before_last_tool_states:]
            last_tool_spoken = spoken[before_last_tool_spoken:]
            last_tool_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_casual_previous_tool_states = len(states)
            before_casual_previous_tool_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才用的什么工具")
            casual_previous_tool_states = states[before_casual_previous_tool_states:]
            casual_previous_tool_spoken = spoken[before_casual_previous_tool_spoken:]
            casual_previous_tool_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_terse_previous_tool_states = len(states)
            before_terse_previous_tool_spoken = len(spoken)
            pi_command_daemon.handle_command("刚用啥工具")
            terse_previous_tool_states = states[before_terse_previous_tool_states:]
            terse_previous_tool_spoken = spoken[before_terse_previous_tool_spoken:]
            terse_previous_tool_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_terse_previous_capability_states = len(states)
            before_terse_previous_capability_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚用了啥能力")
            terse_previous_capability_states = states[before_terse_previous_capability_states:]
            terse_previous_capability_spoken = spoken[before_terse_previous_capability_spoken:]
            terse_previous_capability_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_last_route_tool_states = len(states)
            before_last_route_tool_spoken = len(spoken)
            pi_command_daemon.handle_command("上一条走了哪个工具")
            last_route_tool_states = states[before_last_route_tool_states:]
            last_route_tool_spoken = spoken[before_last_route_tool_spoken:]
            last_route_tool_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_short_route_tool_states = len(states)
            before_short_route_tool_spoken = len(spoken)
            pi_command_daemon.handle_command("上条走了哪个工具")
            short_route_tool_states = states[before_short_route_tool_states:]
            short_route_tool_spoken = spoken[before_short_route_tool_spoken:]
            short_route_tool_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_short_used_tool_states = len(states)
            before_short_used_tool_spoken = len(spoken)
            pi_command_daemon.handle_command("上条用了什么工具")
            short_used_tool_states = states[before_short_used_tool_states:]
            short_used_tool_spoken = spoken[before_short_used_tool_spoken:]
            short_used_tool_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            route_destination_cases = []
            for phrase in ("上条路由到哪了", "上一条路由到哪里了", "上一步路由到哪了", "这次路由到哪了"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase)
                route_destination_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "memory": dict(pi_command_daemon.LAST_PUBLISHED_STATE),
                    }
                )
            before_last_result_states = len(states)
            before_last_result_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才结果怎么样")
            last_result_states = states[before_last_result_states:]
            last_result_spoken = spoken[before_last_result_spoken:]
            last_result_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_result_states = len(states)
            before_previous_result_spoken = len(spoken)
            pi_command_daemon.handle_command("上一条结果怎么样")
            previous_result_states = states[before_previous_result_states:]
            previous_result_spoken = spoken[before_previous_result_spoken:]
            previous_result_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_short_previous_result_states = len(states)
            before_short_previous_result_spoken = len(spoken)
            pi_command_daemon.handle_command("上条结果怎么样")
            short_previous_result_states = states[before_short_previous_result_states:]
            short_previous_result_spoken = spoken[before_short_previous_result_spoken:]
            short_previous_result_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_step_result_states = len(states)
            before_previous_step_result_spoken = len(spoken)
            pi_command_daemon.handle_command("上一步结果呢")
            previous_step_result_states = states[before_previous_step_result_states:]
            previous_step_result_spoken = spoken[before_previous_step_result_spoken:]
            previous_step_result_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_item_result_states = len(states)
            before_previous_item_result_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才那条有结果吗")
            previous_item_result_states = states[before_previous_item_result_states:]
            previous_item_result_spoken = spoken[before_previous_item_result_spoken:]
            previous_item_result_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_item_status_states = len(states)
            before_previous_item_status_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才那条怎么样")
            previous_item_status_states = states[before_previous_item_status_states:]
            previous_item_status_spoken = spoken[before_previous_item_status_spoken:]
            previous_item_status_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            previous_thing_status_cases = []
            for phrase in (
                "上一条怎么样",
                "上条怎么样",
                "上一轮怎么样",
                "刚才那个怎么样",
                "刚刚那个怎么样",
                "刚才那步怎么样",
                "刚刚那步怎么样",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase)
                previous_thing_status_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "memory": dict(pi_command_daemon.LAST_PUBLISHED_STATE),
                    }
                )
            before_last_success_states = len(states)
            before_last_success_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才成功了吗")
            last_success_states = states[before_last_success_states:]
            last_success_spoken = spoken[before_last_success_spoken:]
            last_success_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_casual_success_states = len(states)
            before_casual_success_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才搞定了吗")
            casual_success_states = states[before_casual_success_states:]
            casual_success_spoken = spoken[before_casual_success_spoken:]
            casual_success_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_step_success_states = len(states)
            before_previous_step_success_spoken = len(spoken)
            pi_command_daemon.handle_command("上一步成功了吗")
            previous_step_success_states = states[before_previous_step_success_states:]
            previous_step_success_spoken = spoken[before_previous_step_success_spoken:]
            previous_step_success_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            previous_step_done_cases = []
            for phrase in ("上一步办成了吗", "上一步搞定了吗"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase)
                previous_step_done_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "memory": dict(pi_command_daemon.LAST_PUBLISHED_STATE),
                    }
                )
            last_action_followup_cases = []
            for phrase in (
                "刚才顺利吗",
                "上一步顺利吗",
                "上一条有问题吗",
                "上一步出问题了吗",
                "刚才没问题吧",
                "刚才调了哪个skill",
                "你刚才调了啥工具",
                "刚才走的是哪个skill",
                "上个动作有报错吗",
                "上个请求怎么样",
                "这次跑通了吗",
                "这次成功了吗",
                "刚刚有报错吗",
                "刚才OK吗",
                "上条OK吗",
                "上个弄好了没",
                "刚才报错了吗",
                "刚才有报错吗",
                "刚才处理了吗",
                "上个请求走通没",
                "上条走通没",
                "刚才走通没",
                "刚那个行了吗",
                "刚才成了吗",
                "刚才完成没",
                "上个请求完成没",
                "刚刚那次成了没",
                "上回搞定了吗",
                "上一回路由到哪了",
                "上回报错了吗",
                "刚才那次调用走完了吗",
                "上次那个工具有没有回写状态",
                "刚才那个用到什么工具",
                "上一步用到哪个能力",
                "刚才动作结果再显示一下",
                "刚才那次skill跑成没",
                "刚刚那个动作结果回来了没",
                "刚才那个调用结果写回来了吗",
                "上一回skill有没有把状态写回来",
                "刚才那次技能跑完没有",
                "你刚才调用完了吗",
                "上一轮有没有写回状态",
                "刚才那个结果还在屏幕上吗",
                "上次报错还看得到吗",
                "刚刚那个动作卡哪了",
                "上个技能有没有跑完",
                "刚才那步有写回屏幕吗",
                "刚才那个状态卡还在吗",
                "上个动作状态还留着吗",
                "刚才那次路由走哪了",
                "这回成了吗",
                "这次搞定了吗",
                "这步成了吗",
                "刚才那个skill写屏了吗",
                "刚才那个工具写回屏幕了吗",
                "刚才那个动作写回状态了吗",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase)
                last_action_followup_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "memory": dict(pi_command_daemon.LAST_PUBLISHED_STATE),
                    }
                )
            before_terse_previous_item_success_states = len(states)
            before_terse_previous_item_success_spoken = len(spoken)
            pi_command_daemon.handle_command("刚那个成功没")
            terse_previous_item_success_states = states[before_terse_previous_item_success_states:]
            terse_previous_item_success_spoken = spoken[before_terse_previous_item_success_spoken:]
            terse_previous_item_success_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_success_states = len(states)
            before_previous_success_spoken = len(spoken)
            pi_command_daemon.handle_command("上一条执行成功了吗")
            previous_success_states = states[before_previous_success_states:]
            previous_success_spoken = spoken[before_previous_success_spoken:]
            previous_success_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_short_previous_success_states = len(states)
            before_short_previous_success_spoken = len(spoken)
            pi_command_daemon.handle_command("上条成功了吗")
            short_previous_success_states = states[before_short_previous_success_states:]
            short_previous_success_spoken = spoken[before_short_previous_success_spoken:]
            short_previous_success_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_item_done_states = len(states)
            before_previous_item_done_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才那条跑完了吗")
            previous_item_done_states = states[before_previous_item_done_states:]
            previous_item_done_spoken = spoken[before_previous_item_done_spoken:]
            previous_item_done_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_terse_previous_item_done_states = len(states)
            before_terse_previous_item_done_spoken = len(spoken)
            pi_command_daemon.handle_command("刚那条跑完没")
            terse_previous_item_done_states = states[before_terse_previous_item_done_states:]
            terse_previous_item_done_spoken = spoken[before_terse_previous_item_done_spoken:]
            terse_previous_item_done_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_last_failure_states = len(states)
            before_last_failure_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才失败了吗")
            last_failure_states = states[before_last_failure_states:]
            last_failure_spoken = spoken[before_last_failure_spoken:]
            last_failure_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_previous_failure_states = len(states)
            before_previous_failure_spoken = len(spoken)
            pi_command_daemon.handle_command("上一条失败了吗")
            previous_failure_states = states[before_previous_failure_states:]
            previous_failure_spoken = spoken[before_previous_failure_spoken:]
            previous_failure_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_short_previous_failure_states = len(states)
            before_short_previous_failure_spoken = len(spoken)
            pi_command_daemon.handle_command("上条失败了吗")
            short_previous_failure_states = states[before_short_previous_failure_states:]
            short_previous_failure_spoken = spoken[before_short_previous_failure_spoken:]
            short_previous_failure_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            before_short_previous_not_success_states = len(states)
            before_short_previous_not_success_spoken = len(spoken)
            pi_command_daemon.handle_command("上条没成功吗")
            short_previous_not_success_states = states[before_short_previous_not_success_states:]
            short_previous_not_success_spoken = spoken[before_short_previous_not_success_spoken:]
            short_previous_not_success_memory = dict(pi_command_daemon.LAST_PUBLISHED_STATE)
            pi_command_daemon.LAST_VOICE_TEXT = ""
            before_voice_seed_states = len(states)
            pi_command_daemon.handle_command("讲讲这座城市", source="voice")
            voice_seed_states = states[before_voice_seed_states:]
            last_voice_seed_text = pi_command_daemon.LAST_VOICE_TEXT
            before_last_heard_states = len(states)
            before_last_heard_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚才听到什么", source="voice")
            last_heard_states = states[before_last_heard_states:]
            last_heard_spoken = spoken[before_last_heard_spoken:]
            last_voice_text_after_query = pi_command_daemon.LAST_VOICE_TEXT
            before_last_heard_clarity_states = len(states)
            before_last_heard_clarity_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚才听清了吗", source="voice")
            last_heard_clarity_states = states[before_last_heard_clarity_states:]
            last_heard_clarity_spoken = spoken[before_last_heard_clarity_spoken:]
            last_voice_text_after_clarity_query = pi_command_daemon.LAST_VOICE_TEXT
            before_direct_last_heard_clarity_states = len(states)
            before_direct_last_heard_clarity_spoken = len(spoken)
            pi_command_daemon.handle_command("你听清我刚才说的吗", source="voice")
            direct_last_heard_clarity_states = states[before_direct_last_heard_clarity_states:]
            direct_last_heard_clarity_spoken = spoken[before_direct_last_heard_clarity_spoken:]
            last_voice_text_after_direct_clarity_query = pi_command_daemon.LAST_VOICE_TEXT
            quiet_last_heard_cases = []
            for phrase in ("别出声你刚才听到什么", "只写屏你刚才听清了吗", "你刚才听到什么写在屏幕上"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase, source="voice")
                quiet_last_heard_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "memory": pi_command_daemon.LAST_VOICE_TEXT,
                    }
                )
            natural_last_heard_status_cases = []
            for phrase in (
                "你刚才听懂了吗",
                "你刚刚听明白了吗",
                "我刚说的你听懂没",
                "刚刚我说的是啥",
                "我刚说什么",
                "我刚讲啥",
                "刚刚我说啥来着",
                "我刚刚说了啥",
                "刚才我让你干啥来着",
                "上一句话是什么",
                "你刚刚收到啥",
                "你上一句听成什么了",
                "你刚才识别成啥",
                "你刚刚理解成啥",
                "你刚刚识别成啥",
                "刚刚这个你理解了吗",
                "还记得我上一句吗",
                "刚才我交代了什么",
                "我刚刚提了什么需求",
                "我刚才交代你什么来着",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase, source="voice")
                natural_last_heard_status_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "memory": pi_command_daemon.LAST_VOICE_TEXT,
                    }
                )
            before_understood_as_states = len(states)
            before_understood_as_spoken = len(spoken)
            pi_command_daemon.handle_command("你刚才理解成啥了", source="voice")
            understood_as_states = states[before_understood_as_states:]
            understood_as_spoken = spoken[before_understood_as_spoken:]
            last_voice_text_after_understood_as = pi_command_daemon.LAST_VOICE_TEXT
            before_previous_understood_as_states = len(states)
            before_previous_understood_as_spoken = len(spoken)
            pi_command_daemon.handle_command("上一句你明白成啥了", source="voice")
            previous_understood_as_states = states[before_previous_understood_as_states:]
            previous_understood_as_spoken = spoken[before_previous_understood_as_spoken:]
            last_voice_text_after_previous_understood_as = pi_command_daemon.LAST_VOICE_TEXT
            before_natural_last_heard_states = len(states)
            before_natural_last_heard_spoken = len(spoken)
            pi_command_daemon.handle_command("我刚才说啥", source="voice")
            natural_last_heard_states = states[before_natural_last_heard_states:]
            natural_last_heard_spoken = spoken[before_natural_last_heard_spoken:]
            last_voice_text_after_natural_query = pi_command_daemon.LAST_VOICE_TEXT
            before_casual_last_spoken_states = len(states)
            before_casual_last_spoken_spoken = len(spoken)
            pi_command_daemon.handle_command("我刚说啥", source="voice")
            casual_last_spoken_states = states[before_casual_last_spoken_states:]
            casual_last_spoken_spoken = spoken[before_casual_last_spoken_spoken:]
            last_voice_text_after_casual_last_spoken = pi_command_daemon.LAST_VOICE_TEXT
            before_previous_sentence_states = len(states)
            before_previous_sentence_spoken = len(spoken)
            pi_command_daemon.handle_command("上句话是什么", source="voice")
            previous_sentence_states = states[before_previous_sentence_states:]
            previous_sentence_spoken = spoken[before_previous_sentence_spoken:]
            last_voice_text_after_previous_sentence = pi_command_daemon.LAST_VOICE_TEXT
            before_just_said_sentence_states = len(states)
            before_just_said_sentence_spoken = len(spoken)
            pi_command_daemon.handle_command("刚刚那句是什么", source="voice")
            just_said_sentence_states = states[before_just_said_sentence_states:]
            just_said_sentence_spoken = spoken[before_just_said_sentence_spoken:]
            last_voice_text_after_just_said_sentence = pi_command_daemon.LAST_VOICE_TEXT
            before_what_asked_states = len(states)
            before_what_asked_spoken = len(spoken)
            pi_command_daemon.handle_command("我刚才让你干嘛", source="voice")
            what_asked_states = states[before_what_asked_states:]
            what_asked_spoken = spoken[before_what_asked_spoken:]
            last_voice_text_after_what_asked = pi_command_daemon.LAST_VOICE_TEXT
            before_previous_ask_states = len(states)
            before_previous_ask_spoken = len(spoken)
            pi_command_daemon.handle_command("上一条我让你做啥", source="voice")
            previous_ask_states = states[before_previous_ask_states:]
            previous_ask_spoken = spoken[before_previous_ask_spoken:]
            last_voice_text_after_previous_ask = pi_command_daemon.LAST_VOICE_TEXT
            before_short_previous_ask_states = len(states)
            before_short_previous_ask_spoken = len(spoken)
            pi_command_daemon.handle_command("上条我让你干嘛", source="voice")
            short_previous_ask_states = states[before_short_previous_ask_states:]
            short_previous_ask_spoken = spoken[before_short_previous_ask_spoken:]
            last_voice_text_after_short_previous_ask = pi_command_daemon.LAST_VOICE_TEXT
            before_previous_instruction_states = len(states)
            before_previous_instruction_spoken = len(spoken)
            pi_command_daemon.handle_command("上一条指令是什么", source="voice")
            previous_instruction_states = states[before_previous_instruction_states:]
            previous_instruction_spoken = spoken[before_previous_instruction_spoken:]
            last_voice_text_after_previous_instruction = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_voice_correction_states = len(states)
            before_voice_correction_spoken = len(spoken)
            pi_command_daemon.handle_command("你听错了", source="voice")
            voice_correction_states = states[before_voice_correction_states:]
            voice_correction_spoken = spoken[before_voice_correction_spoken:]
            voice_correction_actions = list(button_actions)
            last_voice_text_after_correction = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_meaning_correction_states = len(states)
            before_meaning_correction_spoken = len(spoken)
            pi_command_daemon.handle_command("不是刚才那个意思", source="voice")
            meaning_correction_states = states[before_meaning_correction_states:]
            meaning_correction_spoken = spoken[before_meaning_correction_spoken:]
            meaning_correction_actions = list(button_actions)
            last_voice_text_after_meaning_correction = pi_command_daemon.LAST_VOICE_TEXT
            quiet_voice_correction_cases = []
            for phrase in ("别出声你听错了", "只写屏不是刚才那个意思", "你听错了写在屏幕上"):
                button_actions.clear()
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase, source="voice")
                quiet_voice_correction_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                        "lastVoiceText": pi_command_daemon.LAST_VOICE_TEXT,
                    }
                )
            button_actions.clear()
            before_never_mind_last_states = len(states)
            before_never_mind_last_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才那句算了", source="voice")
            never_mind_last_states = states[before_never_mind_last_states:]
            never_mind_last_spoken = spoken[before_never_mind_last_spoken:]
            never_mind_last_actions = list(button_actions)
            last_voice_text_after_never_mind = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_cancel_previous_instruction_states = len(states)
            before_cancel_previous_instruction_spoken = len(spoken)
            pi_command_daemon.handle_command("上一条别执行了", source="voice")
            cancel_previous_instruction_states = states[before_cancel_previous_instruction_states:]
            cancel_previous_instruction_spoken = spoken[before_cancel_previous_instruction_spoken:]
            cancel_previous_instruction_actions = list(button_actions)
            last_voice_text_after_cancel_previous_instruction = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_short_cancel_previous_instruction_states = len(states)
            before_short_cancel_previous_instruction_spoken = len(spoken)
            pi_command_daemon.handle_command("上条别执行了", source="voice")
            short_cancel_previous_instruction_states = states[before_short_cancel_previous_instruction_states:]
            short_cancel_previous_instruction_spoken = spoken[before_short_cancel_previous_instruction_spoken:]
            short_cancel_previous_instruction_actions = list(button_actions)
            last_voice_text_after_short_cancel_previous_instruction = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_retract_short_previous_instruction_states = len(states)
            before_retract_short_previous_instruction_spoken = len(spoken)
            pi_command_daemon.handle_command("撤销上条", source="voice")
            retract_short_previous_instruction_states = states[before_retract_short_previous_instruction_states:]
            retract_short_previous_instruction_spoken = spoken[before_retract_short_previous_instruction_spoken:]
            retract_short_previous_instruction_actions = list(button_actions)
            last_voice_text_after_retract_short_previous_instruction = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_reverse_retract_last_sentence_states = len(states)
            before_reverse_retract_last_sentence_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才那句撤销", source="voice")
            reverse_retract_last_sentence_states = states[before_reverse_retract_last_sentence_states:]
            reverse_retract_last_sentence_spoken = spoken[before_reverse_retract_last_sentence_spoken:]
            reverse_retract_last_sentence_actions = list(button_actions)
            last_voice_text_after_reverse_retract_last_sentence = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_do_not_execute_last_states = len(states)
            before_do_not_execute_last_spoken = len(spoken)
            pi_command_daemon.handle_command("不要执行刚才那句", source="voice")
            do_not_execute_last_states = states[before_do_not_execute_last_states:]
            do_not_execute_last_spoken = spoken[before_do_not_execute_last_spoken:]
            do_not_execute_last_actions = list(button_actions)
            last_voice_text_after_do_not_execute_last = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_ignore_last_sentence_states = len(states)
            before_ignore_last_sentence_spoken = len(spoken)
            pi_command_daemon.handle_command("忽略刚才那句", source="voice")
            ignore_last_sentence_states = states[before_ignore_last_sentence_states:]
            ignore_last_sentence_spoken = spoken[before_ignore_last_sentence_spoken:]
            ignore_last_sentence_actions = list(button_actions)
            last_voice_text_after_ignore_last_sentence = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_do_not_listen_last_sentence_states = len(states)
            before_do_not_listen_last_sentence_spoken = len(spoken)
            pi_command_daemon.handle_command("不要听刚才那句", source="voice")
            do_not_listen_last_sentence_states = states[before_do_not_listen_last_sentence_states:]
            do_not_listen_last_sentence_spoken = spoken[before_do_not_listen_last_sentence_spoken:]
            do_not_listen_last_sentence_actions = list(button_actions)
            last_voice_text_after_do_not_listen_last_sentence = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_reverse_do_not_execute_previous_states = len(states)
            before_reverse_do_not_execute_previous_spoken = len(spoken)
            pi_command_daemon.handle_command("别执行上一条了", source="voice")
            reverse_do_not_execute_previous_states = states[before_reverse_do_not_execute_previous_states:]
            reverse_do_not_execute_previous_spoken = spoken[before_reverse_do_not_execute_previous_spoken:]
            reverse_do_not_execute_previous_actions = list(button_actions)
            last_voice_text_after_reverse_do_not_execute_previous = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_ignore_previous_thing_states = len(states)
            before_ignore_previous_thing_spoken = len(spoken)
            pi_command_daemon.handle_command("刚才那个别管了", source="voice")
            ignore_previous_thing_states = states[before_ignore_previous_thing_states:]
            ignore_previous_thing_spoken = spoken[before_ignore_previous_thing_spoken:]
            ignore_previous_thing_actions = list(button_actions)
            last_voice_text_after_ignore_previous_thing = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_just_now_ignore_previous_thing_states = len(states)
            before_just_now_ignore_previous_thing_spoken = len(spoken)
            pi_command_daemon.handle_command("刚刚那个别管了", source="voice")
            just_now_ignore_previous_thing_states = states[before_just_now_ignore_previous_thing_states:]
            just_now_ignore_previous_thing_spoken = spoken[before_just_now_ignore_previous_thing_spoken:]
            just_now_ignore_previous_thing_actions = list(button_actions)
            last_voice_text_after_just_now_ignore_previous_thing = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_reverse_ignore_previous_thing_states = len(states)
            before_reverse_ignore_previous_thing_spoken = len(spoken)
            pi_command_daemon.handle_command("别管刚才那个了", source="voice")
            reverse_ignore_previous_thing_states = states[before_reverse_ignore_previous_thing_states:]
            reverse_ignore_previous_thing_spoken = spoken[before_reverse_ignore_previous_thing_spoken:]
            reverse_ignore_previous_thing_actions = list(button_actions)
            last_voice_text_after_reverse_ignore_previous_thing = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_short_reverse_ignore_previous_thing_states = len(states)
            before_short_reverse_ignore_previous_thing_spoken = len(spoken)
            pi_command_daemon.handle_command("别管上个了", source="voice")
            short_reverse_ignore_previous_thing_states = states[before_short_reverse_ignore_previous_thing_states:]
            short_reverse_ignore_previous_thing_spoken = spoken[before_short_reverse_ignore_previous_thing_spoken:]
            short_reverse_ignore_previous_thing_actions = list(button_actions)
            last_voice_text_after_short_reverse_ignore_previous_thing = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_retract_previous_instruction_states = len(states)
            before_retract_previous_instruction_spoken = len(spoken)
            pi_command_daemon.handle_command("撤回上一条", source="voice")
            retract_previous_instruction_states = states[before_retract_previous_instruction_states:]
            retract_previous_instruction_spoken = spoken[before_retract_previous_instruction_spoken:]
            retract_previous_instruction_actions = list(button_actions)
            last_voice_text_after_retract_previous_instruction = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_casual_never_mind_sentence_states = len(states)
            before_casual_never_mind_sentence_spoken = len(spoken)
            pi_command_daemon.handle_command("那句算了", source="voice")
            casual_never_mind_sentence_states = states[before_casual_never_mind_sentence_states:]
            casual_never_mind_sentence_spoken = spoken[before_casual_never_mind_sentence_spoken:]
            casual_never_mind_sentence_actions = list(button_actions)
            last_voice_text_after_casual_never_mind_sentence = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_misspoke_states = len(states)
            before_misspoke_spoken = len(spoken)
            pi_command_daemon.handle_command("我刚才说错了", source="voice")
            misspoke_states = states[before_misspoke_states:]
            misspoke_spoken = spoken[before_misspoke_spoken:]
            misspoke_actions = list(button_actions)
            last_voice_text_after_misspoke = pi_command_daemon.LAST_VOICE_TEXT
            button_actions.clear()
            before_short_misspoke_states = len(states)
            before_short_misspoke_spoken = len(spoken)
            pi_command_daemon.handle_command("我说错了", source="voice")
            short_misspoke_states = states[before_short_misspoke_states:]
            short_misspoke_spoken = spoken[before_short_misspoke_spoken:]
            short_misspoke_actions = list(button_actions)
            last_voice_text_after_short_misspoke = pi_command_daemon.LAST_VOICE_TEXT
            extra_voice_correction_cases = []
            for phrase in (
                "刚才那句当我没说",
                "上个请求作废",
                "刚才那条别跑了",
                "刚才那句别按了",
                "上条别按了",
                "上个请求别按了",
                "你是不是听错我了",
                "你理解错了",
                "你没懂我意思",
                "你误会我了",
                "你没明白我的意思",
                "不是我意思",
            ):
                button_actions.clear()
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase, source="voice")
                extra_voice_correction_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                        "lastVoiceText": pi_command_daemon.LAST_VOICE_TEXT,
                    }
                )
            before_city_tracks_states = len(states)
            before_city_tracks_spoken = len(spoken)
            pi_command_daemon.handle_command("这座城市有什么歌")
            city_tracks_states = states[before_city_tracks_states:]
            city_tracks_spoken = spoken[before_city_tracks_spoken:]
            before_text_only_city_tracks_states = len(states)
            before_text_only_city_tracks_spoken = len(spoken)
            before_text_only_city_tracks_actions = len(button_actions)
            pi_command_daemon.handle_command("把现在这座城歌单写在屏幕上")
            text_only_city_tracks_states = states[before_text_only_city_tracks_states:]
            text_only_city_tracks_spoken = spoken[before_text_only_city_tracks_spoken:]
            text_only_city_tracks_actions = button_actions[before_text_only_city_tracks_actions:]
            before_here_city_tracks_states = len(states)
            before_here_city_tracks_spoken = len(spoken)
            pi_command_daemon.handle_command("这里有哪些歌")
            here_city_tracks_states = states[before_here_city_tracks_states:]
            here_city_tracks_spoken = spoken[before_here_city_tracks_spoken:]
            before_place_city_tracks_states = len(states)
            before_place_city_tracks_spoken = len(spoken)
            pi_command_daemon.handle_command("这地方有什么歌")
            place_city_tracks_states = states[before_place_city_tracks_states:]
            place_city_tracks_spoken = spoken[before_place_city_tracks_spoken:]
            before_short_city_tracks_states = len(states)
            before_short_city_tracks_spoken = len(spoken)
            before_short_city_tracks_actions = len(button_actions)
            pi_command_daemon.handle_command("这城有啥歌")
            short_city_tracks_states = states[before_short_city_tracks_states:]
            short_city_tracks_spoken = spoken[before_short_city_tracks_spoken:]
            short_city_tracks_actions = button_actions[before_short_city_tracks_actions:]
            casual_city_tracks_more_cases = []
            for phrase in (
                "这站还能听啥",
                "这站还有啥听的",
                "这站还有哪些歌",
                "这站还剩哪些歌",
                "这站还能播哪些歌",
                "这座城还有哪些歌",
                "这座城还剩什么歌",
                "这座城还能放啥",
                "这场日落还有什么歌",
                "当前日落歌单里有什么",
                "这场日落还能听啥",
                "这场日落还有几首歌",
                "等下还有啥歌",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                casual_city_tracks_more_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_here_song_count_states = len(states)
            before_here_song_count_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这里还有几首歌")
            here_song_count_states = states[before_here_song_count_states:]
            here_song_count_spoken = spoken[before_here_song_count_spoken:]
            here_song_count_actions = list(button_actions)
            before_stop_playlist_states = len(states)
            before_stop_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("这站歌单里有什么")
            stop_playlist_states = states[before_stop_playlist_states:]
            stop_playlist_spoken = spoken[before_stop_playlist_spoken:]
            before_stop_song_count_states = len(states)
            before_stop_song_count_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这站还有几首歌")
            stop_song_count_states = states[before_stop_song_count_states:]
            stop_song_count_spoken = spoken[before_stop_song_count_spoken:]
            stop_song_count_actions = list(button_actions)
            before_current_playlist_states = len(states)
            before_current_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("现在歌单里有什么")
            current_playlist_states = states[before_current_playlist_states:]
            current_playlist_spoken = spoken[before_current_playlist_spoken:]
            future_playlist_order_cases = []
            for phrase in (
                "后面歌单怎么排",
                "等会儿歌怎么排",
                "接下来歌单怎么走",
                "今天歌怎么排的",
                "今天歌单怎么排",
                "今天的歌单能给我看一眼吗",
                "这趟歌单顺序是什么",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                future_playlist_order_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_no_play_today_playlist_states = len(states)
            before_no_play_today_playlist_spoken = len(spoken)
            before_no_play_today_playlist_actions = len(button_actions)
            pi_command_daemon.handle_command("不要播放，只想看今天歌单")
            no_play_today_playlist_states = states[before_no_play_today_playlist_states:]
            no_play_today_playlist_spoken = spoken[before_no_play_today_playlist_spoken:]
            no_play_today_playlist_actions = button_actions[before_no_play_today_playlist_actions:]
            before_next_track_query_states = len(states)
            before_next_track_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一首是什么")
            next_track_query_states = states[before_next_track_query_states:]
            next_track_query_spoken = spoken[before_next_track_query_spoken:]
            next_track_query_actions = list(button_actions)
            before_next_track_future_query_states = len(states)
            before_next_track_future_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一首会放什么")
            next_track_future_query_states = states[before_next_track_future_query_states:]
            next_track_future_query_spoken = spoken[before_next_track_future_query_spoken:]
            next_track_future_query_actions = list(button_actions)
            before_next_track_play_query_states = len(states)
            before_next_track_play_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一首播什么")
            next_track_play_query_states = states[before_next_track_play_query_states:]
            next_track_play_query_spoken = spoken[before_next_track_play_query_spoken:]
            next_track_play_query_actions = list(button_actions)
            before_next_track_artist_query_states = len(states)
            before_next_track_artist_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一首谁唱的")
            next_track_artist_query_states = states[before_next_track_artist_query_states:]
            next_track_artist_query_spoken = spoken[before_next_track_artist_query_spoken:]
            next_track_artist_query_actions = list(button_actions)
            before_next_track_owner_query_states = len(states)
            before_next_track_owner_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一首是谁的歌")
            next_track_owner_query_states = states[before_next_track_owner_query_states:]
            next_track_owner_query_spoken = spoken[before_next_track_owner_query_spoken:]
            next_track_owner_query_actions = list(button_actions)
            next_track_origin_query_cases = []
            for phrase in (
                "下一首是哪座城市的",
                "下一首是哪儿的",
                "下一首来自哪里",
                "下一首从哪儿来",
                "下首从哪儿来",
                "下首来自哪里",
                "下首是什么地方来的",
                "接下来那首是哪儿的",
                "后面那首是哪儿的",
                "后面那首从哪儿来",
                "后面那首是什么地方来的",
                "待会那首从哪儿来",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                next_track_origin_query_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_terse_next_track_query_states = len(states)
            before_terse_next_track_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一首呢")
            terse_next_track_query_states = states[before_terse_next_track_query_states:]
            terse_next_track_query_spoken = spoken[before_terse_next_track_query_spoken:]
            terse_next_track_query_actions = list(button_actions)
            before_terse_short_next_track_query_states = len(states)
            before_terse_short_next_track_query_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下首呢")
            terse_short_next_track_query_states = states[before_terse_short_next_track_query_states:]
            terse_short_next_track_query_spoken = spoken[before_terse_short_next_track_query_spoken:]
            terse_short_next_track_query_actions = list(button_actions)
            bare_next_track_query_cases = []
            for phrase in (
                "下一个呢",
                "下一个是什么",
                "下一个啥",
                "下个呢",
                "下个是什么",
                "下个啥",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                bare_next_track_query_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            future_that_song_query_cases = []
            for phrase in ("待会儿那首什么时候到", "待会那首啥时候来", "后面那首是谁唱的", "之后那首叫什么"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                future_that_song_query_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_later_songs_states = len(states)
            before_later_songs_spoken = len(spoken)
            pi_command_daemon.handle_command("后面还有什么歌")
            later_songs_states = states[before_later_songs_states:]
            later_songs_spoken = spoken[before_later_songs_spoken:]
            before_after_songs_states = len(states)
            before_after_songs_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("之后还有什么曲子")
            after_songs_states = states[before_after_songs_states:]
            after_songs_spoken = spoken[before_after_songs_spoken:]
            after_songs_actions = list(button_actions)
            before_upcoming_songs_states = len(states)
            before_upcoming_songs_spoken = len(spoken)
            pi_command_daemon.handle_command("接下来还有哪些歌")
            upcoming_songs_states = states[before_upcoming_songs_states:]
            upcoming_songs_spoken = spoken[before_upcoming_songs_spoken:]
            before_upcoming_song_count_states = len(states)
            before_upcoming_song_count_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("接下来还剩几首")
            upcoming_song_count_states = states[before_upcoming_song_count_states:]
            upcoming_song_count_spoken = spoken[before_upcoming_song_count_spoken:]
            upcoming_song_count_actions = list(button_actions)
            before_casual_later_songs_states = len(states)
            before_casual_later_songs_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("等会儿还有什么歌")
            casual_later_songs_states = states[before_casual_later_songs_states:]
            casual_later_songs_spoken = spoken[before_casual_later_songs_spoken:]
            casual_later_songs_actions = list(button_actions)
            before_casual_later_play_states = len(states)
            before_casual_later_play_spoken = len(spoken)
            pi_command_daemon.handle_command("等下放啥")
            casual_later_play_states = states[before_casual_later_play_states:]
            casual_later_play_spoken = spoken[before_casual_later_play_spoken:]
            before_soon_song_states = len(states)
            before_soon_song_spoken = len(spoken)
            pi_command_daemon.handle_command("待会儿放什么歌")
            soon_song_states = states[before_soon_song_states:]
            soon_song_spoken = spoken[before_soon_song_spoken:]
            before_soon_play_casual_states = len(states)
            before_soon_play_casual_spoken = len(spoken)
            before_soon_play_casual_actions = len(button_actions)
            pi_command_daemon.handle_command("待会播啥")
            soon_play_casual_states = states[before_soon_play_casual_states:]
            soon_play_casual_spoken = spoken[before_soon_play_casual_spoken:]
            soon_play_casual_actions = button_actions[before_soon_play_casual_actions:]
            before_soon_more_songs_states = len(states)
            before_soon_more_songs_spoken = len(spoken)
            before_soon_more_songs_actions = len(button_actions)
            pi_command_daemon.handle_command("待会还有啥歌")
            soon_more_songs_states = states[before_soon_more_songs_states:]
            soon_more_songs_spoken = spoken[before_soon_more_songs_spoken:]
            soon_more_songs_actions = button_actions[before_soon_more_songs_actions:]
            before_soon_count_states = len(states)
            before_soon_count_spoken = len(spoken)
            before_soon_count_actions = len(button_actions)
            pi_command_daemon.handle_command("待会还剩几首")
            soon_count_states = states[before_soon_count_states:]
            soon_count_spoken = spoken[before_soon_count_spoken:]
            soon_count_actions = button_actions[before_soon_count_actions:]
            before_today_more_songs_states = len(states)
            before_today_more_songs_spoken = len(spoken)
            before_today_more_songs_actions = len(button_actions)
            pi_command_daemon.handle_command("今天还有啥歌")
            today_more_songs_states = states[before_today_more_songs_states:]
            today_more_songs_spoken = spoken[before_today_more_songs_spoken:]
            today_more_songs_actions = button_actions[before_today_more_songs_actions:]
            before_tonight_more_songs_states = len(states)
            before_tonight_more_songs_spoken = len(spoken)
            before_tonight_more_songs_actions = len(button_actions)
            pi_command_daemon.handle_command("今晚还有什么歌")
            tonight_more_songs_states = states[before_tonight_more_songs_states:]
            tonight_more_songs_spoken = spoken[before_tonight_more_songs_spoken:]
            tonight_more_songs_actions = button_actions[before_tonight_more_songs_actions:]
            before_remaining_playlist_states = len(states)
            before_remaining_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("歌单还剩什么")
            remaining_playlist_states = states[before_remaining_playlist_states:]
            remaining_playlist_spoken = spoken[before_remaining_playlist_spoken:]
            before_playlist_anything_states = len(states)
            before_playlist_anything_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("歌单还有啥")
            playlist_anything_states = states[before_playlist_anything_states:]
            playlist_anything_spoken = spoken[before_playlist_anything_spoken:]
            playlist_anything_actions = list(button_actions)
            before_remaining_playlist_anything_states = len(states)
            before_remaining_playlist_anything_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("歌单还剩啥")
            remaining_playlist_anything_states = states[before_remaining_playlist_anything_states:]
            remaining_playlist_anything_spoken = spoken[before_remaining_playlist_anything_spoken:]
            remaining_playlist_anything_actions = list(button_actions)
            before_tracks_anything_states = len(states)
            before_tracks_anything_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("曲目还有啥")
            tracks_anything_states = states[before_tracks_anything_states:]
            tracks_anything_spoken = spoken[before_tracks_anything_spoken:]
            tracks_anything_actions = list(button_actions)
            before_remaining_playlist_count_states = len(states)
            before_remaining_playlist_count_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("歌单还剩几首")
            remaining_playlist_count_states = states[before_remaining_playlist_count_states:]
            remaining_playlist_count_spoken = spoken[before_remaining_playlist_count_spoken:]
            remaining_playlist_count_actions = list(button_actions)
            before_casual_playlist_count_states = len(states)
            before_casual_playlist_count_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("歌单还有几首")
            casual_playlist_count_states = states[before_casual_playlist_count_states:]
            casual_playlist_count_spoken = spoken[before_casual_playlist_count_spoken:]
            casual_playlist_count_actions = list(button_actions)
            before_direct_remaining_song_count_states = len(states)
            before_direct_remaining_song_count_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("还剩多少首歌")
            direct_remaining_song_count_states = states[before_direct_remaining_song_count_states:]
            direct_remaining_song_count_spoken = spoken[before_direct_remaining_song_count_spoken:]
            direct_remaining_song_count_actions = list(button_actions)
            before_direct_more_song_count_states = len(states)
            before_direct_more_song_count_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("还有多少首歌")
            direct_more_song_count_states = states[before_direct_more_song_count_states:]
            direct_more_song_count_spoken = spoken[before_direct_more_song_count_spoken:]
            direct_more_song_count_actions = list(button_actions)
            current_remaining_count_cases = []
            for phrase in ("这个城市还剩几首", "这里还能听几首"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                current_remaining_count_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_current_good_songs_states = len(states)
            before_current_good_songs_spoken = len(spoken)
            pi_command_daemon.handle_command("这一站有什么好听的")
            current_good_songs_states = states[before_current_good_songs_states:]
            current_good_songs_spoken = spoken[before_current_good_songs_spoken:]
            before_next_stop_songs_states = len(states)
            before_next_stop_songs_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一站有什么歌")
            next_stop_songs_states = states[before_next_stop_songs_states:]
            next_stop_songs_spoken = spoken[before_next_stop_songs_spoken:]
            next_stop_songs_actions = list(button_actions)
            before_long_next_city_songs_states = len(states)
            before_long_next_city_songs_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一个城市有什么歌")
            long_next_city_songs_states = states[before_long_next_city_songs_states:]
            long_next_city_songs_spoken = spoken[before_long_next_city_songs_spoken:]
            long_next_city_songs_actions = list(button_actions)
            next_city_play_cases = []
            for phrase in ("下站放啥", "下个城市放啥", "下一个城市播啥"):
                before_next_city_play_states = len(states)
                before_next_city_play_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                next_city_play_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_next_city_play_states:],
                        "spoken": spoken[before_next_city_play_spoken:],
                        "actions": list(button_actions),
                    }
                )
            negative_next_city_tracks_cases = []
            for phrase in (
                "别去下一站，我只是问下一站有什么歌",
                "不要跳到下个城市，只想知道下个城市放啥",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                negative_next_city_tracks_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            next_city_story_cases = []
            for phrase in (
                "下一站有什么故事",
                "别去下一站，我只是问下一站有什么故事",
                "不要跳到下个城市，只想知道下个城市什么来头",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                next_city_story_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_prev_stop_songs_states = len(states)
            before_prev_stop_songs_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一站有什么歌")
            prev_stop_songs_states = states[before_prev_stop_songs_states:]
            prev_stop_songs_spoken = spoken[before_prev_stop_songs_spoken:]
            prev_stop_songs_actions = list(button_actions)
            before_long_prev_city_songs_states = len(states)
            before_long_prev_city_songs_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一个城市有什么歌")
            long_prev_city_songs_states = states[before_long_prev_city_songs_states:]
            long_prev_city_songs_spoken = spoken[before_long_prev_city_songs_spoken:]
            long_prev_city_songs_actions = list(button_actions)
            prev_city_play_cases = []
            for phrase in ("上站放啥", "上一个城市播啥", "前一个城市放啥"):
                before_prev_city_play_states = len(states)
                before_prev_city_play_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                prev_city_play_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_prev_city_play_states:],
                        "spoken": spoken[before_prev_city_play_spoken:],
                        "actions": list(button_actions),
                    }
                )
            negative_prev_city_tracks_cases = []
            for phrase in (
                "别回上一站，我只是问上一站有什么歌",
                "不要跳回上个城市，只想知道上个城市放啥",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                negative_prev_city_tracks_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            prev_city_story_cases = []
            for phrase in (
                "上一站有什么故事",
                "别回上一站，我只是问上一站有什么故事",
                "不要跳回上个城市，只想知道上个城市什么来头",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                prev_city_story_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_named_city_tracks_states = len(states)
            before_named_city_tracks_spoken = len(spoken)
            pi_command_daemon.handle_command("东京有什么歌")
            named_city_tracks_states = states[before_named_city_tracks_states:]
            named_city_tracks_spoken = spoken[before_named_city_tracks_spoken:]
            before_named_city_tracks_alt_states = len(states)
            before_named_city_tracks_alt_spoken = len(spoken)
            pi_command_daemon.handle_command("东京有哪些歌")
            named_city_tracks_alt_states = states[before_named_city_tracks_alt_states:]
            named_city_tracks_alt_spoken = spoken[before_named_city_tracks_alt_spoken:]
            named_city_recommendation_cases = []
            for phrase in (
                "东京适合什么歌",
                "东京配什么歌",
                "东京推荐什么歌",
                "推荐几首东京的歌",
                "东京来几首安静的歌",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                named_city_recommendation_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            negative_named_city_tracks_cases = []
            for phrase in (
                "别放东京了，我只是问东京有哪些歌",
                "不要去东京，只想知道东京有什么歌",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                negative_named_city_tracks_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_named_city_story_states = len(states)
            before_named_city_story_spoken = len(spoken)
            pi_command_daemon.handle_command("讲讲东京")
            named_city_story_states = states[before_named_city_story_states:]
            named_city_story_spoken = spoken[before_named_city_story_spoken:]
            negative_named_city_story_cases = []
            for phrase in (
                "别放东京了，我只是问东京有什么故事",
                "不要去东京，只想知道东京什么来头",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                negative_named_city_story_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_next_up_states = len(states)
            before_next_up_spoken = len(spoken)
            pi_command_daemon.handle_command("下一站是哪")
            next_up_states = states[before_next_up_states:]
            next_up_spoken = spoken[before_next_up_spoken:]
            before_terse_next_up_states = len(states)
            before_terse_next_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一站呢")
            terse_next_up_states = states[before_terse_next_up_states:]
            terse_next_up_spoken = spoken[before_terse_next_up_spoken:]
            terse_next_up_actions = list(button_actions)
            before_short_next_up_states = len(states)
            before_short_next_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下站是哪")
            short_next_up_states = states[before_short_next_up_states:]
            short_next_up_spoken = spoken[before_short_next_up_spoken:]
            short_next_up_actions = list(button_actions)
            before_terse_short_next_up_states = len(states)
            before_terse_short_next_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下站呢")
            terse_short_next_up_states = states[before_terse_short_next_up_states:]
            terse_short_next_up_spoken = spoken[before_terse_short_next_up_spoken:]
            terse_short_next_up_actions = list(button_actions)
            before_next_sunset_event_states = len(states)
            before_next_sunset_event_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一场日落在哪儿")
            next_sunset_event_states = states[before_next_sunset_event_states:]
            next_sunset_event_spoken = spoken[before_next_sunset_event_spoken:]
            next_sunset_event_actions = list(button_actions)
            before_subjectless_next_sunset_states = len(states)
            before_subjectless_next_sunset_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一场在哪儿")
            subjectless_next_sunset_states = states[before_subjectless_next_sunset_states:]
            subjectless_next_sunset_spoken = spoken[before_subjectless_next_sunset_spoken:]
            subjectless_next_sunset_actions = list(button_actions)
            before_short_next_city_states = len(states)
            before_short_next_city_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下个城市是哪")
            short_next_city_states = states[before_short_next_city_states:]
            short_next_city_spoken = spoken[before_short_next_city_spoken:]
            short_next_city_actions = list(button_actions)
            before_long_next_city_states = len(states)
            before_long_next_city_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一个城市是哪")
            long_next_city_states = states[before_long_next_city_states:]
            long_next_city_spoken = spoken[before_long_next_city_spoken:]
            long_next_city_actions = list(button_actions)
            negative_next_up_cases = []
            for phrase in (
                "我只是想看看下一站，别跳过去",
                "我只是问下个城市，不要切过去",
                "别去下一站，先告诉我下一站是哪",
            ):
                before_negative_next_up_states = len(states)
                before_negative_next_up_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                negative_next_up_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_negative_next_up_states:],
                        "spoken": spoken[before_negative_next_up_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_later_next_place_states = len(states)
            before_later_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("等会儿去哪儿")
            later_next_place_states = states[before_later_next_place_states:]
            later_next_place_spoken = spoken[before_later_next_place_spoken:]
            later_next_place_actions = list(button_actions)
            before_short_soon_next_place_states = len(states)
            before_short_soon_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("等下去哪儿")
            short_soon_next_place_states = states[before_short_soon_next_place_states:]
            short_soon_next_place_spoken = spoken[before_short_soon_next_place_spoken:]
            short_soon_next_place_actions = list(button_actions)
            before_short_soon_will_next_place_states = len(states)
            before_short_soon_will_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("等下会去哪儿")
            short_soon_will_next_place_states = states[before_short_soon_will_next_place_states:]
            short_soon_will_next_place_spoken = spoken[before_short_soon_will_next_place_spoken:]
            short_soon_will_next_place_actions = list(button_actions)
            before_casual_later_next_place_states = len(states)
            before_casual_later_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("待会去哪")
            casual_later_next_place_states = states[before_casual_later_next_place_states:]
            casual_later_next_place_spoken = spoken[before_casual_later_next_place_spoken:]
            casual_later_next_place_actions = list(button_actions)
            before_soon_next_place_states = len(states)
            before_soon_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("一会儿去哪")
            soon_next_place_states = states[before_soon_next_place_states:]
            soon_next_place_spoken = spoken[before_soon_next_place_spoken:]
            soon_next_place_actions = list(button_actions)
            before_after_next_place_states = len(states)
            before_after_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("之后去哪儿")
            after_next_place_states = states[before_after_next_place_states:]
            after_next_place_spoken = spoken[before_after_next_place_spoken:]
            after_next_place_actions = list(button_actions)
            before_next_segment_place_states = len(states)
            before_next_segment_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一段去哪儿")
            next_segment_place_states = states[before_next_segment_place_states:]
            next_segment_place_spoken = spoken[before_next_segment_place_spoken:]
            next_segment_place_actions = list(button_actions)
            before_then_next_place_states = len(states)
            before_then_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("然后去哪")
            then_next_place_states = states[before_then_next_place_states:]
            then_next_place_spoken = spoken[before_then_next_place_spoken:]
            then_next_place_actions = list(button_actions)
            before_further_next_place_states = len(states)
            before_further_next_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("再往后去哪")
            further_next_place_states = states[before_further_next_place_states:]
            further_next_place_spoken = spoken[before_further_next_place_spoken:]
            further_next_place_actions = list(button_actions)
            before_next_eta_states = len(states)
            before_next_eta_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一站还有多久")
            next_eta_states = states[before_next_eta_states:]
            next_eta_spoken = spoken[before_next_eta_spoken:]
            next_eta_actions = list(button_actions)
            before_next_eta_casual_states = len(states)
            before_next_eta_casual_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("多久到下一站")
            next_eta_casual_states = states[before_next_eta_casual_states:]
            next_eta_casual_spoken = spoken[before_next_eta_casual_spoken:]
            next_eta_casual_actions = list(button_actions)
            before_next_eta_when_states = len(states)
            before_next_eta_when_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一站什么时候到")
            next_eta_when_states = states[before_next_eta_when_states:]
            next_eta_when_spoken = spoken[before_next_eta_when_spoken:]
            next_eta_when_actions = list(button_actions)
            before_next_city_eta_states = len(states)
            before_next_city_eta_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下个城市还有多久")
            next_city_eta_states = states[before_next_city_eta_states:]
            next_city_eta_spoken = spoken[before_next_city_eta_spoken:]
            next_city_eta_actions = list(button_actions)
            before_long_next_city_eta_states = len(states)
            before_long_next_city_eta_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一个城市还有多久")
            long_next_city_eta_states = states[before_long_next_city_eta_states:]
            long_next_city_eta_spoken = spoken[before_long_next_city_eta_spoken:]
            long_next_city_eta_actions = list(button_actions)
            before_next_eta_nearly_states = len(states)
            before_next_eta_nearly_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("快到下一站了吗")
            next_eta_nearly_states = states[before_next_eta_nearly_states:]
            next_eta_nearly_spoken = spoken[before_next_eta_nearly_spoken:]
            next_eta_nearly_actions = list(button_actions)
            before_minute_next_eta_states = len(states)
            before_minute_next_eta_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("还有几分钟到下一站")
            minute_next_eta_states = states[before_minute_next_eta_states:]
            minute_next_eta_spoken = spoken[before_minute_next_eta_spoken:]
            minute_next_eta_actions = list(button_actions)
            before_text_only_next_up_states = len(states)
            before_text_only_next_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("下一站还有多久写在屏幕上")
            text_only_next_up_states = states[before_text_only_next_up_states:]
            text_only_next_up_spoken = spoken[before_text_only_next_up_spoken:]
            text_only_next_up_actions = list(button_actions)
            before_prev_up_states = len(states)
            before_prev_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一站是哪")
            prev_up_states = states[before_prev_up_states:]
            prev_up_spoken = spoken[before_prev_up_spoken:]
            prev_up_actions = list(button_actions)
            before_text_only_prev_up_states = len(states)
            before_text_only_prev_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一站是哪写在屏幕上")
            text_only_prev_up_states = states[before_text_only_prev_up_states:]
            text_only_prev_up_spoken = spoken[before_text_only_prev_up_spoken:]
            text_only_prev_up_actions = list(button_actions)
            before_terse_prev_up_states = len(states)
            before_terse_prev_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一站呢")
            terse_prev_up_states = states[before_terse_prev_up_states:]
            terse_prev_up_spoken = spoken[before_terse_prev_up_spoken:]
            terse_prev_up_actions = list(button_actions)
            before_terse_short_prev_up_states = len(states)
            before_terse_short_prev_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上站呢")
            terse_short_prev_up_states = states[before_terse_short_prev_up_states:]
            terse_short_prev_up_spoken = spoken[before_terse_short_prev_up_spoken:]
            terse_short_prev_up_actions = list(button_actions)
            before_long_prev_city_states = len(states)
            before_long_prev_city_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("上一个城市是哪")
            long_prev_city_states = states[before_long_prev_city_states:]
            long_prev_city_spoken = spoken[before_long_prev_city_spoken:]
            long_prev_city_actions = list(button_actions)
            negative_prev_up_cases = []
            for phrase in (
                "只是问上一站别跳回去",
                "别回上一站，告诉我上一站是哪",
            ):
                before_negative_prev_up_states = len(states)
                before_negative_prev_up_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                negative_prev_up_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_negative_prev_up_states:],
                        "spoken": spoken[before_negative_prev_up_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_former_city_states = len(states)
            before_former_city_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("前一个城市是哪")
            former_city_states = states[before_former_city_states:]
            former_city_spoken = spoken[before_former_city_spoken:]
            former_city_actions = list(button_actions)
            before_casual_prev_up_states = len(states)
            before_casual_prev_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚才那站是哪")
            casual_prev_up_states = states[before_casual_prev_up_states:]
            casual_prev_up_spoken = spoken[before_casual_prev_up_spoken:]
            casual_prev_up_actions = list(button_actions)
            before_terse_casual_prev_up_states = len(states)
            before_terse_casual_prev_up_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚才那站呢")
            terse_casual_prev_up_states = states[before_terse_casual_prev_up_states:]
            terse_casual_prev_up_spoken = spoken[before_terse_casual_prev_up_spoken:]
            terse_casual_prev_up_actions = list(button_actions)
            before_casual_pointing_prev_city_states = len(states)
            before_casual_pointing_prev_city_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚才那个城市是哪")
            casual_pointing_prev_city_states = states[before_casual_pointing_prev_city_states:]
            casual_pointing_prev_city_spoken = spoken[before_casual_pointing_prev_city_spoken:]
            casual_pointing_prev_city_actions = list(button_actions)
            before_previous_place_states = len(states)
            before_previous_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("之前在哪")
            previous_place_states = states[before_previous_place_states:]
            previous_place_spoken = spoken[before_previous_place_spoken:]
            previous_place_actions = list(button_actions)
            before_previous_city_states = len(states)
            before_previous_city_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("刚才在哪个城市")
            previous_city_states = states[before_previous_city_states:]
            previous_city_spoken = spoken[before_previous_city_spoken:]
            previous_city_actions = list(button_actions)
            before_route_states = len(states)
            before_route_spoken = len(spoken)
            pi_command_daemon.handle_command("日落路线")
            route_states = states[before_route_states:]
            route_spoken = spoken[before_route_spoken:]
            before_route_places_states = len(states)
            before_route_places_spoken = len(spoken)
            pi_command_daemon.handle_command("后面还有哪些地方")
            route_places_states = states[before_route_places_states:]
            route_places_spoken = spoken[before_route_places_spoken:]
            before_tonight_route_states = len(states)
            before_tonight_route_spoken = len(spoken)
            pi_command_daemon.handle_command("今晚会经过哪些城市")
            tonight_route_states = states[before_tonight_route_states:]
            tonight_route_spoken = spoken[before_tonight_route_spoken:]
            before_today_route_states = len(states)
            before_today_route_spoken = len(spoken)
            pi_command_daemon.handle_command("今天会去哪些城市")
            today_route_states = states[before_today_route_states:]
            today_route_spoken = spoken[before_today_route_spoken:]
            named_route_presence_cases = []
            for phrase in (
                "今天会去东京吗",
                "后面会路过东京吗",
                "东京在今天路线里吗",
                "今天会不会去东京",
                "后面会不会路过东京啊",
                "这趟有没有东京",
                "路线里有没有东京",
                "今天有没有东京",
                "这趟会经过东京吗",
                "今天会不会路过东京",
                "后面有没有东京",
                "后面是不是还有东京",
                "下一站是不是东京",
                "下个城市是不是东京",
                "东京什么时候到",
                "还有多久到东京",
                "东京排第几站",
                "这趟还追不追东京的日落",
            ):
                before_named_route_states = len(states)
                before_named_route_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                named_route_presence_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_named_route_states:],
                        "spoken": spoken[before_named_route_spoken:],
                        "actions": list(button_actions),
                    }
                )
            quiet_named_route_presence_cases = []
            for phrase in ("别出声告诉我今天会不会去东京", "今天会不会去东京别出声"):
                before_quiet_named_route_states = len(states)
                before_quiet_named_route_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                quiet_named_route_presence_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_quiet_named_route_states:],
                        "spoken": spoken[before_quiet_named_route_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_text_only_route_states = len(states)
            before_text_only_route_spoken = len(spoken)
            before_text_only_route_actions = len(button_actions)
            pi_command_daemon.handle_command("把今天路线写在屏幕上")
            text_only_route_states = states[before_text_only_route_states:]
            text_only_route_spoken = spoken[before_text_only_route_spoken:]
            text_only_route_actions = button_actions[before_text_only_route_actions:]
            before_today_where_route_states = len(states)
            before_today_where_route_spoken = len(spoken)
            pi_command_daemon.handle_command("今天还会去哪")
            today_where_route_states = states[before_today_where_route_states:]
            today_where_route_spoken = spoken[before_today_where_route_spoken:]
            before_casual_route_states = len(states)
            before_casual_route_spoken = len(spoken)
            pi_command_daemon.handle_command("今天电台怎么走")
            casual_route_states = states[before_casual_route_states:]
            casual_route_spoken = spoken[before_casual_route_spoken:]
            before_trip_route_name_states = len(states)
            before_trip_route_name_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这趟路线是什么")
            trip_route_name_states = states[before_trip_route_name_states:]
            trip_route_name_spoken = spoken[before_trip_route_name_spoken:]
            trip_route_name_actions = list(button_actions)
            before_radio_route_name_states = len(states)
            before_radio_route_name_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("电台路线是什么")
            radio_route_name_states = states[before_radio_route_name_states:]
            radio_route_name_spoken = spoken[before_radio_route_name_spoken:]
            radio_route_name_actions = list(button_actions)
            before_trip_route_states = len(states)
            before_trip_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这趟怎么走")
            trip_route_states = states[before_trip_route_states:]
            trip_route_spoken = spoken[before_trip_route_spoken:]
            trip_route_actions = list(button_actions)
            before_route_arrangement_states = len(states)
            before_route_arrangement_spoken = len(spoken)
            pi_command_daemon.handle_command("今天这趟电台怎么安排")
            route_arrangement_states = states[before_route_arrangement_states:]
            route_arrangement_spoken = spoken[before_route_arrangement_spoken:]
            before_later_route_states = len(states)
            before_later_route_spoken = len(spoken)
            pi_command_daemon.handle_command("这趟电台后面去哪")
            later_route_states = states[before_later_route_states:]
            later_route_spoken = spoken[before_later_route_spoken:]
            before_later_route_plan_states = len(states)
            before_later_route_plan_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("后面怎么走")
            later_route_plan_states = states[before_later_route_plan_states:]
            later_route_plan_spoken = spoken[before_later_route_plan_spoken:]
            later_route_plan_actions = list(button_actions)
            zha_route_cases = []
            for phrase in (
                "后面咋走",
                "后边咋走",
                "接下来咋走",
                "接下来往哪走",
                "后面咋安排",
                "路线咋安排",
                "这趟为什么这么安排",
                "今天为什么这么走",
                "为什么今天先去东京",
                "为什么接下来去东京",
                "这条路线为啥先去东京",
                "为什么今天是这座城",
                "这站为什么排在这里",
                "现在这站为什么在这儿",
                "这一站为什么是这里",
                "为什么现在到东京",
                "为什么东京排在这里",
                "东京为什么排这里",
                "这趟为什么把东京放前面",
            ):
                before_zha_route_states = len(states)
                before_zha_route_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                zha_route_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_zha_route_states:],
                        "spoken": spoken[before_zha_route_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_next_route_arrangement_states = len(states)
            before_next_route_arrangement_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("接下来怎么安排")
            next_route_arrangement_states = states[before_next_route_arrangement_states:]
            next_route_arrangement_spoken = spoken[before_next_route_arrangement_spoken:]
            next_route_arrangement_actions = list(button_actions)
            before_later_what_place_states = len(states)
            before_later_what_place_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("后面还有什么地方")
            later_what_place_states = states[before_later_what_place_states:]
            later_what_place_spoken = spoken[before_later_what_place_spoken:]
            later_what_place_actions = list(button_actions)
            before_passby_route_states = len(states)
            before_passby_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这趟还会路过哪儿")
            passby_route_states = states[before_passby_route_states:]
            passby_route_spoken = spoken[before_passby_route_spoken:]
            passby_route_actions = list(button_actions)
            before_next_passby_route_states = len(states)
            before_next_passby_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("接下来路过哪儿")
            next_passby_route_states = states[before_next_passby_route_states:]
            next_passby_route_spoken = spoken[before_next_passby_route_spoken:]
            next_passby_route_actions = list(button_actions)
            before_later_passby_route_states = len(states)
            before_later_passby_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("后面路过哪里")
            later_passby_route_states = states[before_later_passby_route_states:]
            later_passby_route_spoken = spoken[before_later_passby_route_spoken:]
            later_passby_route_actions = list(button_actions)
            before_remaining_where_route_states = len(states)
            before_remaining_where_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("剩下会去哪儿")
            remaining_where_route_states = states[before_remaining_where_route_states:]
            remaining_where_route_spoken = spoken[before_remaining_where_route_spoken:]
            remaining_where_route_actions = list(button_actions)
            casual_route_followup_cases = []
            for phrase in (
                "还会去哪儿",
                "后面还去哪",
                "后边还去哪",
                "接下来还走哪儿",
                "后面还经过哪里",
                "后面还有啥城市",
                "后续还有啥城市",
                "剩下啥城市",
                "后面还有哪几个日落",
                "接下来还有哪些日落",
                "今天还追哪些日落",
                "今晚还追几场日落",
                "今天还追几场日落",
                "今天还去哪儿",
                "还要追几座城市",
                "剩下还经过哪里",
                "再往后还有哪几站",
                "再往后还有几场日落",
                "再往后会到哪",
                "剩下几座城市",
                "这趟还有多久",
                "今天电台什么时候结束",
                "这趟什么时候收台",
                "今晚几点收台",
                "后面还要多久",
                "路线还长吗",
                "这趟还长不长",
                "后面还长吗",
                "接下来还有多少路",
                "再往后还有多少路",
                "今天还要走多远",
            ):
                before_casual_route_followup_states = len(states)
                before_casual_route_followup_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                casual_route_followup_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_casual_route_followup_states:],
                        "spoken": spoken[before_casual_route_followup_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_remaining_stops_route_states = len(states)
            before_remaining_stops_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这趟还有几站")
            remaining_stops_route_states = states[before_remaining_stops_route_states:]
            remaining_stops_route_spoken = spoken[before_remaining_stops_route_spoken:]
            remaining_stops_route_actions = list(button_actions)
            before_casual_remaining_stops_route_states = len(states)
            before_casual_remaining_stops_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这趟还剩几站")
            casual_remaining_stops_route_states = states[before_casual_remaining_stops_route_states:]
            casual_remaining_stops_route_spoken = spoken[before_casual_remaining_stops_route_spoken:]
            casual_remaining_stops_route_actions = list(button_actions)
            before_subjectless_remaining_stops_route_states = len(states)
            before_subjectless_remaining_stops_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("还剩几站")
            subjectless_remaining_stops_route_states = states[before_subjectless_remaining_stops_route_states:]
            subjectless_remaining_stops_route_spoken = spoken[before_subjectless_remaining_stops_route_spoken:]
            subjectless_remaining_stops_route_actions = list(button_actions)
            before_subjectless_remaining_count_route_states = len(states)
            before_subjectless_remaining_count_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("剩下多少站")
            subjectless_remaining_count_route_states = states[before_subjectless_remaining_count_route_states:]
            subjectless_remaining_count_route_spoken = spoken[before_subjectless_remaining_count_route_spoken:]
            subjectless_remaining_count_route_actions = list(button_actions)
            before_subjectless_remaining_place_count_route_states = len(states)
            before_subjectless_remaining_place_count_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("剩下还有几个地方")
            subjectless_remaining_place_count_route_states = states[before_subjectless_remaining_place_count_route_states:]
            subjectless_remaining_place_count_route_spoken = spoken[before_subjectless_remaining_place_count_route_spoken:]
            subjectless_remaining_place_count_route_actions = list(button_actions)
            remaining_which_stations_route_cases = []
            for phrase in ("剩下还有哪些站", "余下还有哪些站", "后面还有哪些站", "后边还有哪些站", "接下来还有哪几站"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                remaining_which_stations_route_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_remaining_cities_route_states = len(states)
            before_remaining_cities_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这趟还剩几个城市")
            remaining_cities_route_states = states[before_remaining_cities_route_states:]
            remaining_cities_route_spoken = spoken[before_remaining_cities_route_spoken:]
            remaining_cities_route_actions = list(button_actions)
            before_remaining_which_cities_route_states = len(states)
            before_remaining_which_cities_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("这趟还剩哪些城市")
            remaining_which_cities_route_states = states[before_remaining_which_cities_route_states:]
            remaining_which_cities_route_spoken = spoken[before_remaining_which_cities_route_spoken:]
            remaining_which_cities_route_actions = list(button_actions)
            remaining_city_route_cases = []
            for phrase in ("这趟还剩几座城", "这一路还剩几座城", "后面还剩哪些城", "接下来还路过哪几座城"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                remaining_city_route_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_today_remaining_stations_route_states = len(states)
            before_today_remaining_stations_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("今天还剩哪些站")
            today_remaining_stations_route_states = states[before_today_remaining_stations_route_states:]
            today_remaining_stations_route_spoken = spoken[before_today_remaining_stations_route_spoken:]
            today_remaining_stations_route_actions = list(button_actions)
            remaining_sunset_count_route_cases = []
            for phrase in (
                "今天还剩多少日落",
                "这趟还剩多少日落",
                "后面还有几个日落",
                "接下来还有几个日落",
                "后面还剩多少个日落",
                "后面还剩多少场日落",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                button_actions.clear()
                pi_command_daemon.handle_command(phrase)
                remaining_sunset_count_route_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
            before_radio_later_remaining_stations_route_states = len(states)
            before_radio_later_remaining_stations_route_spoken = len(spoken)
            button_actions.clear()
            pi_command_daemon.handle_command("电台后面还剩哪些站")
            radio_later_remaining_stations_route_states = states[before_radio_later_remaining_stations_route_states:]
            radio_later_remaining_stations_route_spoken = spoken[before_radio_later_remaining_stations_route_spoken:]
            radio_later_remaining_stations_route_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="day program smoke", path=mode_path)
            button_actions.clear()
            before_day_program_states = len(states)
            before_day_program_spoken = len(spoken)
            pi_command_daemon.handle_command("帮我安排一档24小时音乐电台")
            day_program_states = states[before_day_program_states:]
            day_program_spoken = spoken[before_day_program_spoken:]
            day_program_actions = list(button_actions)
            day_program_titles = [track.get("title") for track in pi_command_daemon.playlist]
            day_program_index = pi_command_daemon.current_index
            button_actions.clear()
            before_daylong_program_states = len(states)
            pi_command_daemon.handle_command("规划一整天的日落电台")
            daylong_program_states = states[before_daylong_program_states:]
            daylong_program_actions = list(button_actions)
            audio_mode.save_audio_mode("soft_mute", reason="open playlist smoke", path=mode_path)
            button_actions.clear()
            before_sea_sunset_playlist_states = len(states)
            before_sea_sunset_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("帮我挑几首海边日落的歌")
            sea_sunset_playlist_states = states[before_sea_sunset_playlist_states:]
            sea_sunset_playlist_spoken = spoken[before_sea_sunset_playlist_spoken:]
            sea_sunset_playlist_actions = list(button_actions)
            sea_sunset_playlist_titles = [track.get("title") for track in pi_command_daemon.playlist]
            audio_mode.save_audio_mode("soft_mute", reason="way-home playlist smoke", path=mode_path)
            button_actions.clear()
            before_way_home_playlist_states = len(states)
            before_way_home_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("回家路上来点稳的歌")
            way_home_playlist_states = states[before_way_home_playlist_states:]
            way_home_playlist_spoken = spoken[before_way_home_playlist_spoken:]
            way_home_playlist_actions = list(button_actions)
            way_home_playlist_titles = [track.get("title") for track in pi_command_daemon.playlist]
            audio_mode.save_audio_mode("soft_mute", reason="commute playlist smoke", path=mode_path)
            button_actions.clear()
            before_commute_playlist_states = len(states)
            before_commute_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("通勤路上来点稳的歌")
            commute_playlist_states = states[before_commute_playlist_states:]
            commute_playlist_spoken = spoken[before_commute_playlist_spoken:]
            commute_playlist_actions = list(button_actions)
            commute_playlist_titles = [track.get("title") for track in pi_command_daemon.playlist]
            audio_mode.save_audio_mode("soft_mute", reason="rainy playlist smoke", path=mode_path)
            button_actions.clear()
            before_rainy_playlist_states = len(states)
            before_rainy_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("雨天来点歌")
            rainy_playlist_states = states[before_rainy_playlist_states:]
            rainy_playlist_spoken = spoken[before_rainy_playlist_spoken:]
            rainy_playlist_actions = list(button_actions)
            rainy_playlist_titles = [track.get("title") for track in pi_command_daemon.playlist]
            casual_context_playlist_cases = []
            for phrase in (
                "雨夜别太吵来点歌",
                "睡前来点慢的",
                "压力有点大来点柔和的",
                "别太吵的歌",
                "小声点的歌",
                "轻声一点的歌",
                "我有点累别太吵的歌",
                "别吵，来点轻一点的音乐",
                "来点轻一点的",
                "工作时来点不抢注意力的",
            ):
                audio_mode.save_audio_mode("soft_mute", reason="casual context playlist smoke", path=mode_path)
                button_actions.clear()
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase)
                casual_context_playlist_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                        "titles": [track.get("title") for track in pi_command_daemon.playlist],
                    }
                )
            audio_mode.save_audio_mode("soft_mute", reason="qualified switch playlist smoke", path=mode_path)
            button_actions.clear()
            before_switch_quiet_playlist_states = len(states)
            before_switch_quiet_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("换首安静点的歌")
            switch_quiet_playlist_states = states[before_switch_quiet_playlist_states:]
            switch_quiet_playlist_spoken = spoken[before_switch_quiet_playlist_spoken:]
            switch_quiet_playlist_actions = list(button_actions)
            switch_quiet_playlist_titles = [track.get("title") for track in pi_command_daemon.playlist]
            audio_mode.save_audio_mode("soft_mute", reason="qualified scene switch playlist smoke", path=mode_path)
            button_actions.clear()
            before_switch_way_home_playlist_states = len(states)
            before_switch_way_home_playlist_spoken = len(spoken)
            pi_command_daemon.handle_command("换首回家路上的歌")
            switch_way_home_playlist_states = states[before_switch_way_home_playlist_states:]
            switch_way_home_playlist_spoken = spoken[before_switch_way_home_playlist_spoken:]
            switch_way_home_playlist_actions = list(button_actions)
            switch_way_home_playlist_titles = [track.get("title") for track in pi_command_daemon.playlist]
            del states[before_day_program_states:]
            audio_mode.save_audio_mode("radio", reason="post day program smoke", path=mode_path)
            before_catalog_states = len(states)
            before_catalog_spoken = len(spoken)
            pi_command_daemon.handle_command("曲库多少城市")
            catalog_states = states[before_catalog_states:]
            catalog_spoken = spoken[before_catalog_spoken:]
            before_skill_overview_states = len(states)
            before_skill_overview_actions = len(button_actions)
            pi_command_daemon.handle_command("你能调用什么技能")
            skill_overview_states = states[before_skill_overview_states:]
            skill_overview_actions = button_actions[before_skill_overview_actions:]
            before_help_me_skill_states = len(states)
            before_help_me_skill_actions = len(button_actions)
            pi_command_daemon.handle_command("你可以帮我做什么")
            help_me_skill_states = states[before_help_me_skill_states:]
            help_me_skill_actions = button_actions[before_help_me_skill_actions:]
            before_casual_skill_states = len(states)
            before_casual_skill_actions = len(button_actions)
            pi_command_daemon.handle_command("现在能干啥")
            casual_skill_states = states[before_casual_skill_states:]
            casual_skill_actions = button_actions[before_casual_skill_actions:]
            before_casual_can_do_something_states = len(states)
            before_casual_can_do_something_actions = len(button_actions)
            pi_command_daemon.handle_command("你能干点啥")
            casual_can_do_something_states = states[before_casual_can_do_something_states:]
            casual_can_do_something_actions = button_actions[before_casual_can_do_something_actions:]
            before_short_can_do_something_states = len(states)
            before_short_can_do_something_actions = len(button_actions)
            pi_command_daemon.handle_command("你能做点啥")
            short_can_do_something_states = states[before_short_can_do_something_states:]
            short_can_do_something_actions = button_actions[before_short_can_do_something_actions:]
            before_can_do_which_things_states = len(states)
            before_can_do_which_things_actions = len(button_actions)
            pi_command_daemon.handle_command("你能做哪些事")
            can_do_which_things_states = states[before_can_do_which_things_states:]
            can_do_which_things_actions = button_actions[before_can_do_which_things_actions:]
            before_casual_help_do_something_states = len(states)
            before_casual_help_do_something_actions = len(button_actions)
            pi_command_daemon.handle_command("你能帮我做点啥")
            casual_help_do_something_states = states[before_casual_help_do_something_states:]
            casual_help_do_something_actions = button_actions[before_casual_help_do_something_actions:]
            before_help_which_ways_states = len(states)
            before_help_which_ways_actions = len(button_actions)
            pi_command_daemon.handle_command("你能帮我哪些忙")
            help_which_ways_states = states[before_help_which_ways_states:]
            help_which_ways_actions = button_actions[before_help_which_ways_actions:]
            before_casual_what_do_states = len(states)
            before_casual_what_do_actions = len(button_actions)
            pi_command_daemon.handle_command("你会干嘛")
            casual_what_do_states = states[before_casual_what_do_states:]
            casual_what_do_actions = button_actions[before_casual_what_do_actions:]
            before_what_all_can_do_states = len(states)
            before_what_all_can_do_actions = len(button_actions)
            pi_command_daemon.handle_command("你都会什么")
            what_all_can_do_states = states[before_what_all_can_do_states:]
            what_all_can_do_actions = button_actions[before_what_all_can_do_actions:]
            before_all_capabilities_states = len(states)
            before_all_capabilities_actions = len(button_actions)
            pi_command_daemon.handle_command("你都能干什么")
            all_capabilities_states = states[before_all_capabilities_states:]
            all_capabilities_actions = button_actions[before_all_capabilities_actions:]
            before_function_list_states = len(states)
            before_function_list_actions = len(button_actions)
            pi_command_daemon.handle_command("有什么功能")
            function_list_states = states[before_function_list_states:]
            function_list_actions = button_actions[before_function_list_actions:]
            before_what_else_can_do_states = len(states)
            before_what_else_can_do_actions = len(button_actions)
            pi_command_daemon.handle_command("你会些什么")
            what_else_can_do_states = states[before_what_else_can_do_states:]
            what_else_can_do_actions = button_actions[before_what_else_can_do_actions:]
            before_ability_talent_states = len(states)
            before_ability_talent_actions = len(button_actions)
            pi_command_daemon.handle_command("你有什么本领")
            ability_talent_states = states[before_ability_talent_states:]
            ability_talent_actions = button_actions[before_ability_talent_actions:]
            before_ability_skills_states = len(states)
            before_ability_skills_actions = len(button_actions)
            pi_command_daemon.handle_command("你有哪些本事")
            ability_skills_states = states[before_ability_skills_states:]
            ability_skills_actions = button_actions[before_ability_skills_actions:]
            before_can_help_states = len(states)
            before_can_help_actions = len(button_actions)
            pi_command_daemon.handle_command("你能帮上什么忙")
            can_help_states = states[before_can_help_states:]
            can_help_actions = button_actions[before_can_help_actions:]
            before_casual_help_me_do_states = len(states)
            before_casual_help_me_do_actions = len(button_actions)
            pi_command_daemon.handle_command("你能帮我干啥")
            casual_help_me_do_states = states[before_casual_help_me_do_states:]
            casual_help_me_do_actions = button_actions[before_casual_help_me_do_actions:]
            before_natural_help_me_do_something_states = len(states)
            before_natural_help_me_do_something_actions = len(button_actions)
            pi_command_daemon.handle_command("你能帮我干点什么")
            natural_help_me_do_something_states = states[before_natural_help_me_do_something_states:]
            natural_help_me_do_something_actions = button_actions[before_natural_help_me_do_something_actions:]
            casual_skill_overview_cases = []
            for phrase in ("你会干啥", "你会做啥", "你能帮我啥", "你到底能干嘛"):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                casual_skill_overview_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_tool_skill_states = len(states)
            before_tool_skill_actions = len(button_actions)
            pi_command_daemon.handle_command("你有哪些工具")
            tool_skill_states = states[before_tool_skill_states:]
            tool_skill_actions = button_actions[before_tool_skill_actions:]
            mixed_language_tool_cases = []
            for phrase in (
                "你有哪些skill",
                "你有什么skill",
                "你能调哪些工具",
                "你能调哪些skill",
                "你都有哪些能力",
                "你有什么能力",
                "你支持哪些能力",
                "你支持什么技能",
                "能用什么工具",
                "现在能调用什么",
                "你现在能调用啥",
                "你能调用什么",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                mixed_language_tool_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_tool_calling_skill_states = len(states)
            before_tool_calling_skill_actions = len(button_actions)
            pi_command_daemon.handle_command("会调用哪些工具")
            tool_calling_skill_states = states[before_tool_calling_skill_states:]
            tool_calling_skill_actions = button_actions[before_tool_calling_skill_actions:]
            action_skill_cases = []
            for phrase in ("你可以调用哪些动作", "你有哪些动作能力", "你会做哪些操作", "你会哪些操作"):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                action_skill_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            natural_language_skill_cases = []
            for phrase in ("你能听懂自然语言吗", "不用关键词你能懂吗", "我说人话你能懂吗", "随便说你能理解吗", "不用固定句式可以吗"):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                natural_language_skill_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            quiet_skill_overview_cases = []
            for phrase in ("别出声你能做什么", "只写屏你有哪些工具"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                quiet_skill_overview_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_text_only_tool_skill_states = len(states)
            before_text_only_tool_skill_spoken = len(spoken)
            before_text_only_tool_skill_actions = len(button_actions)
            pi_command_daemon.handle_command("你有哪些工具写在屏幕上")
            text_only_tool_skill_states = states[before_text_only_tool_skill_states:]
            text_only_tool_skill_spoken = spoken[before_text_only_tool_skill_spoken:]
            text_only_tool_skill_actions = button_actions[before_text_only_tool_skill_actions:]
            before_text_only_capability_states = len(states)
            before_text_only_capability_spoken = len(spoken)
            before_text_only_capability_actions = len(button_actions)
            pi_command_daemon.handle_command("能力状态写在屏幕上")
            text_only_capability_states = states[before_text_only_capability_states:]
            text_only_capability_spoken = spoken[before_text_only_capability_spoken:]
            text_only_capability_actions = button_actions[before_text_only_capability_actions:]
            skill_fallback_cases = []
            for phrase in (
                "失败了咋办",
                "没听懂咋办",
                "工具挂了会怎样",
                "你会不会瞎执行",
                "低置信度会不会执行",
                "路由不确定就只写屏",
                "听不准就问我一下",
                "只听到半句会不会播放",
                "没说完整会不会乱执行",
                "上个技能别再试了",
                "技能失败会不会一直重试",
                "工具挂了会不会偷偷再跑",
                "动作失败会不会自己再点一次",
                "如果能力不可用会不会乱播",
                "听半截会不会直接执行",
                "技能报错别悄悄重试",
                "skill失败会怎么回我",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                skill_fallback_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            quiet_skill_fallback_cases = []
            for phrase in ("别出声失败了咋办", "只写屏低置信度会不会执行"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                quiet_skill_fallback_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_self_check_states = len(states)
            pi_command_daemon.handle_command("帮我自检一下")
            self_check_states = states[before_self_check_states:]
            before_self_check_yourself_states = len(states)
            before_self_check_yourself_actions = len(button_actions)
            pi_command_daemon.handle_command("你自己检查一下")
            self_check_yourself_states = states[before_self_check_yourself_states:]
            self_check_yourself_actions = button_actions[before_self_check_yourself_actions:]
            before_health_check_states = len(states)
            before_health_check_actions = len(button_actions)
            pi_command_daemon.handle_command("体检一下")
            health_check_states = states[before_health_check_states:]
            health_check_actions = button_actions[before_health_check_actions:]
            before_agent_health_states = len(states)
            before_agent_health_actions = len(button_actions)
            pi_command_daemon.handle_command("你现在健康吗")
            agent_health_states = states[before_agent_health_states:]
            agent_health_actions = button_actions[before_agent_health_actions:]
            before_natural_health_check_states = len(states)
            before_natural_health_check_actions = len(button_actions)
            pi_command_daemon.handle_command("帮我做个健康检查")
            natural_health_check_states = states[before_natural_health_check_states:]
            natural_health_check_actions = button_actions[before_natural_health_check_actions:]
            before_troubleshoot_check_states = len(states)
            before_troubleshoot_check_actions = len(button_actions)
            pi_command_daemon.handle_command("帮我排查一下")
            troubleshoot_check_states = states[before_troubleshoot_check_states:]
            troubleshoot_check_actions = button_actions[before_troubleshoot_check_actions:]
            before_where_broken_states = len(states)
            before_where_broken_actions = len(button_actions)
            pi_command_daemon.handle_command("哪里坏了")
            where_broken_states = states[before_where_broken_states:]
            where_broken_actions = button_actions[before_where_broken_actions:]
            before_self_inspect_states = len(states)
            before_self_inspect_actions = len(button_actions)
            pi_command_daemon.handle_command("你能不能自己看一下")
            self_inspect_states = states[before_self_inspect_states:]
            self_inspect_actions = button_actions[before_self_inspect_actions:]
            before_queue_doctor_states = len(states)
            before_queue_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("命令队列卡住了吗")
            queue_doctor_states = states[before_queue_doctor_states:]
            queue_doctor_actions = button_actions[before_queue_doctor_actions:]
            before_natural_stuck_queue_states = len(states)
            before_natural_stuck_queue_actions = len(button_actions)
            pi_command_daemon.handle_command("你是不是卡住了")
            natural_stuck_queue_states = states[before_natural_stuck_queue_states:]
            natural_stuck_queue_actions = button_actions[before_natural_stuck_queue_actions:]
            before_natural_not_executed_queue_states = len(states)
            before_natural_not_executed_queue_actions = len(button_actions)
            pi_command_daemon.handle_command("刚才怎么还没执行")
            natural_not_executed_queue_states = states[before_natural_not_executed_queue_states:]
            natural_not_executed_queue_actions = button_actions[before_natural_not_executed_queue_actions:]
            before_previous_command_queue_states = len(states)
            before_previous_command_queue_actions = len(button_actions)
            pi_command_daemon.handle_command("上一条还在排队吗")
            previous_command_queue_states = states[before_previous_command_queue_states:]
            previous_command_queue_actions = button_actions[before_previous_command_queue_actions:]
            casual_queue_followup_cases = []
            for phrase in ("上条没反应", "刚才那条没动静", "上条卡住了吗", "刚才卡住了吗", "怎么还不动"):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                casual_queue_followup_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_service_doctor_states = len(states)
            pi_command_daemon.handle_command("后台服务正常吗")
            service_doctor_states = states[before_service_doctor_states:]
            service_doctor_variant_cases = []
            for phrase in ("后台还正常吗", "服务是不是挂了", "进程还活着吗"):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                service_doctor_variant_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_tts_doctor_states = len(states)
            before_tts_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("语音回复正常吗")
            tts_doctor_states = states[before_tts_doctor_states:]
            tts_doctor_actions = button_actions[before_tts_doctor_actions:]
            tts_doctor_variant_cases = []
            for phrase in (
                "能朗读吗",
                "你能念出来吗",
                "能播报回复吗",
                "什么时候会出声回复",
                "重要回复会朗读吗",
                "普通闲聊会不会朗读",
                "不重要的回复会不会出声",
                "旁边有人重要回复会不会只写屏",
                "你怎么判断回复重不重要",
                "这句重要吗会不会读",
                "哪些回复会走语音",
                "普通聊天会不会走pi-tts",
                "低电量提醒会不会走pi-tts",
                "普通回复要不要走TTS",
                "/api/pi-tts 什么时候调用",
                "工具挂了会不会朗读",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                tts_doctor_variant_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            tts_doctor_quiet_channel_cases = []
            for phrase in (
                "低电量提醒别走pi-tts",
                "夜路提醒不用/api/pi-tts",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                tts_doctor_quiet_channel_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            local_control_cases = []
            for phrase in (
                "控制面板会不会被外面的人乱按",
                "外网能直接打开本地控制吗",
                "api能看到播放状态吗",
                "网页控制会不会绕过静音播放",
                "局域网面板能暂停电台吗",
                "本地接口会不会泄露热点密码",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                local_control_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_deploy_doctor_states = len(states)
            before_deploy_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("部署正常吗")
            deploy_doctor_states = states[before_deploy_doctor_states:]
            deploy_doctor_actions = button_actions[before_deploy_doctor_actions:]
            deploy_doctor_variant_cases = []
            for phrase in ("部署有没有问题", "更新成功了吗", "代码是不是完整"):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                deploy_doctor_variant_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_boot_doctor_states = len(states)
            before_boot_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("开机服务正常吗")
            boot_doctor_states = states[before_boot_doctor_states:]
            boot_doctor_actions = button_actions[before_boot_doctor_actions:]
            boot_doctor_variant_cases = []
            for phrase in ("开机有没有问题", "开机后都起来了吗", "重启后会自动起来吗"):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                boot_doctor_variant_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            quiet_doctor_cases = []
            for phrase, expected_city, expected_message in (
                ("别出声屏幕医生", "屏幕医生", "Whisplay 屏幕正常"),
                ("只写屏长按橙色按钮会做什么", "按键医生", "待机/静音长按"),
                ("别出声语音医生", "语音医生", "麦克风"),
                ("只写屏后台服务正常吗", "后台服务", "服务医生发现需要复查"),
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                quiet_doctor_cases.append(
                    {
                        "phrase": phrase,
                        "expectedCity": expected_city,
                        "expectedMessage": expected_message,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_text_only_queue_doctor_states = len(states)
            before_text_only_queue_doctor_spoken = len(spoken)
            before_text_only_queue_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("命令队列卡住了吗写在屏幕上")
            text_only_queue_doctor_states = states[before_text_only_queue_doctor_states:]
            text_only_queue_doctor_spoken = spoken[before_text_only_queue_doctor_spoken:]
            text_only_queue_doctor_actions = button_actions[before_text_only_queue_doctor_actions:]
            before_text_only_service_doctor_states = len(states)
            before_text_only_service_doctor_spoken = len(spoken)
            before_text_only_service_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("后台服务正常吗写在屏幕上")
            text_only_service_doctor_states = states[before_text_only_service_doctor_states:]
            text_only_service_doctor_spoken = spoken[before_text_only_service_doctor_spoken:]
            text_only_service_doctor_actions = button_actions[before_text_only_service_doctor_actions:]
            before_text_only_tts_doctor_states = len(states)
            before_text_only_tts_doctor_spoken = len(spoken)
            before_text_only_tts_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("语音回复正常吗写在屏幕上")
            text_only_tts_doctor_states = states[before_text_only_tts_doctor_states:]
            text_only_tts_doctor_spoken = spoken[before_text_only_tts_doctor_spoken:]
            text_only_tts_doctor_actions = button_actions[before_text_only_tts_doctor_actions:]
            before_text_only_button_doctor_states = len(states)
            before_text_only_button_doctor_spoken = len(spoken)
            before_text_only_button_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("长按橙色按钮会做什么写在屏幕上")
            text_only_button_doctor_states = states[before_text_only_button_doctor_states:]
            text_only_button_doctor_spoken = spoken[before_text_only_button_doctor_spoken:]
            text_only_button_doctor_actions = button_actions[before_text_only_button_doctor_actions:]
            before_battery_sufficiency_states = len(states)
            before_battery_sufficiency_actions = len(button_actions)
            pi_command_daemon.handle_command("电量还够吗")
            battery_sufficiency_states = states[before_battery_sufficiency_states:]
            battery_sufficiency_actions = button_actions[before_battery_sufficiency_actions:]
            before_battery_runtime_states = len(states)
            before_battery_runtime_actions = len(button_actions)
            pi_command_daemon.handle_command("还能撑多久")
            battery_runtime_states = states[before_battery_runtime_states:]
            battery_runtime_actions = button_actions[before_battery_runtime_actions:]
            before_battery_charging_states = len(states)
            before_battery_charging_actions = len(button_actions)
            pi_command_daemon.handle_command("要不要充电")
            battery_charging_states = states[before_battery_charging_states:]
            battery_charging_actions = button_actions[before_battery_charging_actions:]
            quiet_battery_doctor_cases = []
            for phrase in ("别出声电量还够吗", "只写屏要不要充电"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                quiet_battery_doctor_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_screen_dark_states = len(states)
            before_screen_dark_actions = len(button_actions)
            pi_command_daemon.handle_command("屏幕黑了")
            screen_dark_states = states[before_screen_dark_states:]
            screen_dark_actions = button_actions[before_screen_dark_actions:]
            before_status_invisible_states = len(states)
            before_status_invisible_actions = len(button_actions)
            pi_command_daemon.handle_command("看不到状态")
            status_invisible_states = states[before_status_invisible_states:]
            status_invisible_actions = button_actions[before_status_invisible_actions:]
            before_avatar_stuck_states = len(states)
            before_avatar_stuck_actions = len(button_actions)
            pi_command_daemon.handle_command("头像不动了")
            avatar_stuck_states = states[before_avatar_stuck_states:]
            avatar_stuck_actions = button_actions[before_avatar_stuck_actions:]
            before_button_doctor_states = len(states)
            before_button_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("长按橙色按钮会做什么")
            button_doctor_states = states[before_button_doctor_states:]
            button_doctor_actions = button_actions[before_button_doctor_actions:]
            before_button_pressing_states = len(states)
            before_button_pressing_actions = len(button_actions)
            pi_command_daemon.handle_command("长摁橙色键会干嘛")
            button_pressing_states = states[before_button_pressing_states:]
            button_pressing_actions = button_actions[before_button_pressing_actions:]
            before_button_hold_pressing_states = len(states)
            before_button_hold_pressing_actions = len(button_actions)
            pi_command_daemon.handle_command("摁住橙色按钮会干嘛")
            button_hold_pressing_states = states[before_button_hold_pressing_states:]
            button_hold_pressing_actions = button_actions[before_button_hold_pressing_actions:]
            before_button_no_response_states = len(states)
            before_button_no_response_actions = len(button_actions)
            pi_command_daemon.handle_command("按钮没反应")
            button_no_response_states = states[before_button_no_response_states:]
            button_no_response_actions = button_actions[before_button_no_response_actions:]
            before_long_press_no_response_states = len(states)
            before_long_press_no_response_actions = len(button_actions)
            pi_command_daemon.handle_command("长按没反应")
            long_press_no_response_states = states[before_long_press_no_response_states:]
            long_press_no_response_actions = button_actions[before_long_press_no_response_actions:]
            before_orange_button_flaky_states = len(states)
            before_orange_button_flaky_actions = len(button_actions)
            pi_command_daemon.handle_command("橙色键不灵了")
            orange_button_flaky_states = states[before_orange_button_flaky_states:]
            orange_button_flaky_actions = button_actions[before_orange_button_flaky_actions:]
            before_voice_doctor_states = len(states)
            before_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("你听得到我吗")
            voice_doctor_states = states[before_voice_doctor_states:]
            voice_doctor_actions = button_actions[before_voice_doctor_actions:]
            before_casual_hear_voice_doctor_states = len(states)
            before_casual_hear_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("你听见了吗")
            casual_hear_voice_doctor_states = states[before_casual_hear_voice_doctor_states:]
            casual_hear_voice_doctor_actions = button_actions[before_casual_hear_voice_doctor_actions:]
            before_speaking_heard_voice_doctor_states = len(states)
            before_speaking_heard_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("你听到我说话了吗")
            speaking_heard_voice_doctor_states = states[before_speaking_heard_voice_doctor_states:]
            speaking_heard_voice_doctor_actions = button_actions[before_speaking_heard_voice_doctor_actions:]
            before_inverted_heard_voice_doctor_states = len(states)
            before_inverted_heard_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("我说话你能听见吗")
            inverted_heard_voice_doctor_states = states[before_inverted_heard_voice_doctor_states:]
            inverted_heard_voice_doctor_actions = button_actions[before_inverted_heard_voice_doctor_actions:]
            before_talking_heard_voice_doctor_states = len(states)
            before_talking_heard_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("我讲话你听得到吗")
            talking_heard_voice_doctor_states = states[before_talking_heard_voice_doctor_states:]
            talking_heard_voice_doctor_actions = button_actions[before_talking_heard_voice_doctor_actions:]
            before_handset_broken_voice_doctor_states = len(states)
            before_handset_broken_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("话筒是不是坏了")
            handset_broken_voice_doctor_states = states[before_handset_broken_voice_doctor_states:]
            handset_broken_voice_doctor_actions = button_actions[before_handset_broken_voice_doctor_actions:]
            before_receiver_my_voice_doctor_states = len(states)
            before_receiver_my_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("你收得到我的声音吗")
            receiver_my_voice_doctor_states = states[before_receiver_my_voice_doctor_states:]
            receiver_my_voice_doctor_actions = button_actions[before_receiver_my_voice_doctor_actions:]
            voice_self_check_cases = []
            for phrase in (
                "你听得清我吗",
                "我说话清楚吗",
                "你听不到我吗",
                "你是不是听不清我",
                "我声音清楚吗",
                "我这边声音正常吗",
                "麦有声音吗",
                "能收到我声音吗",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                voice_self_check_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_understand_voice_doctor_states = len(states)
            before_understand_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("你能听懂我吗")
            understand_voice_doctor_states = states[before_understand_voice_doctor_states:]
            understand_voice_doctor_actions = button_actions[before_understand_voice_doctor_actions:]
            before_no_response_voice_doctor_states = len(states)
            before_no_response_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("你怎么没反应")
            no_response_voice_doctor_states = states[before_no_response_voice_doctor_states:]
            no_response_voice_doctor_actions = button_actions[before_no_response_voice_doctor_actions:]
            before_wake_no_response_voice_doctor_states = len(states)
            before_wake_no_response_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("叫你没反应")
            wake_no_response_voice_doctor_states = states[before_wake_no_response_voice_doctor_states:]
            wake_no_response_voice_doctor_actions = button_actions[before_wake_no_response_voice_doctor_actions:]
            wake_name_voice_doctor_cases = []
            for phrase in (
                "唤醒词是什么",
                "我该叫你什么",
                "我应该喊你什么",
                "怎么叫醒你",
                "喊你什么能唤醒",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                wake_name_voice_doctor_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_not_heard_voice_doctor_states = len(states)
            before_not_heard_voice_doctor_actions = len(button_actions)
            pi_command_daemon.handle_command("你是不是没听见我")
            not_heard_voice_doctor_states = states[before_not_heard_voice_doctor_states:]
            not_heard_voice_doctor_actions = button_actions[before_not_heard_voice_doctor_actions:]
            before_mic_doctor_states = len(states)
            pi_command_daemon.handle_command("麦克风正常吗")
            mic_doctor_states = states[before_mic_doctor_states:]
            before_low_power_states = len(states)
            before_low_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机快没电了，先文字提醒我")
            low_power_states = states[before_low_power_states:]
            low_power_actions = button_actions[before_low_power_actions:]
            before_first_person_low_power_states = len(states)
            before_first_person_low_power_actions = len(button_actions)
            pi_command_daemon.handle_command("我手机快没电了")
            first_person_low_power_states = states[before_first_person_low_power_states:]
            first_person_low_power_actions = button_actions[before_first_person_low_power_actions:]
            before_phone_power_nearly_gone_states = len(states)
            before_phone_power_nearly_gone_actions = len(button_actions)
            pi_command_daemon.handle_command("手机电快没了")
            phone_power_nearly_gone_states = states[before_phone_power_nearly_gone_states:]
            phone_power_nearly_gone_actions = button_actions[before_phone_power_nearly_gone_actions:]
            before_phone_nearly_off_states = len(states)
            before_phone_nearly_off_actions = len(button_actions)
            pi_command_daemon.handle_command("手机快关机了")
            phone_nearly_off_states = states[before_phone_nearly_off_states:]
            phone_nearly_off_actions = button_actions[before_phone_nearly_off_actions:]
            before_phone_cannot_last_states = len(states)
            before_phone_cannot_last_actions = len(button_actions)
            pi_command_daemon.handle_command("手机撑不住了")
            phone_cannot_last_states = states[before_phone_cannot_last_states:]
            phone_cannot_last_actions = button_actions[before_phone_cannot_last_actions:]
            before_battery_draining_out_states = len(states)
            before_battery_draining_out_actions = len(button_actions)
            pi_command_daemon.handle_command("电快耗光了")
            battery_draining_out_states = states[before_battery_draining_out_states:]
            battery_draining_out_actions = button_actions[before_battery_draining_out_actions:]
            before_phone_has_percent_low_power_states = len(states)
            before_phone_has_percent_low_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机还有10%电")
            phone_has_percent_low_power_states = states[before_phone_has_percent_low_power_states:]
            phone_has_percent_low_power_actions = button_actions[before_phone_has_percent_low_power_actions:]
            before_battery_has_spoken_percent_states = len(states)
            before_battery_has_spoken_percent_actions = len(button_actions)
            pi_command_daemon.handle_command("电量还有百分之十")
            battery_has_spoken_percent_states = states[before_battery_has_spoken_percent_states:]
            battery_has_spoken_percent_actions = button_actions[before_battery_has_spoken_percent_actions:]
            before_phone_has_one_bar_power_states = len(states)
            before_phone_has_one_bar_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机还有一格电")
            phone_has_one_bar_power_states = states[before_phone_has_one_bar_power_states:]
            phone_has_one_bar_power_actions = button_actions[before_phone_has_one_bar_power_actions:]
            before_terse_first_person_one_bar_power_states = len(states)
            before_terse_first_person_one_bar_power_actions = len(button_actions)
            pi_command_daemon.handle_command("我手机一格电了")
            terse_first_person_one_bar_power_states = states[before_terse_first_person_one_bar_power_states:]
            terse_first_person_one_bar_power_actions = button_actions[before_terse_first_person_one_bar_power_actions:]
            before_bare_only_one_bar_power_states = len(states)
            before_bare_only_one_bar_power_actions = len(button_actions)
            pi_command_daemon.handle_command("只有一格电了")
            bare_only_one_bar_power_states = states[before_bare_only_one_bar_power_states:]
            bare_only_one_bar_power_actions = button_actions[before_bare_only_one_bar_power_actions:]
            before_bare_just_one_bar_power_states = len(states)
            before_bare_just_one_bar_power_actions = len(button_actions)
            pi_command_daemon.handle_command("就一格电了")
            bare_just_one_bar_power_states = states[before_bare_just_one_bar_power_states:]
            bare_just_one_bar_power_actions = button_actions[before_bare_just_one_bar_power_actions:]
            before_bare_has_one_bar_power_states = len(states)
            before_bare_has_one_bar_power_actions = len(button_actions)
            pi_command_daemon.handle_command("还有一格电")
            bare_has_one_bar_power_states = states[before_bare_has_one_bar_power_states:]
            bare_has_one_bar_power_actions = button_actions[before_bare_has_one_bar_power_actions:]
            before_terse_spoken_five_percent_power_states = len(states)
            before_terse_spoken_five_percent_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机百分之五了")
            terse_spoken_five_percent_power_states = states[before_terse_spoken_five_percent_power_states:]
            terse_spoken_five_percent_power_actions = button_actions[before_terse_spoken_five_percent_power_actions:]
            before_terse_digit_five_percent_power_states = len(states)
            before_terse_digit_five_percent_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机5%了")
            terse_digit_five_percent_power_states = states[before_terse_digit_five_percent_power_states:]
            terse_digit_five_percent_power_actions = button_actions[before_terse_digit_five_percent_power_actions:]
            before_colloquial_five_points_power_states = len(states)
            before_colloquial_five_points_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机剩五个点了")
            colloquial_five_points_power_states = states[before_colloquial_five_points_power_states:]
            colloquial_five_points_power_actions = button_actions[before_colloquial_five_points_power_actions:]
            before_bare_digit_points_power_states = len(states)
            before_bare_digit_points_power_actions = len(button_actions)
            pi_command_daemon.handle_command("就剩5个点电了")
            bare_digit_points_power_states = states[before_bare_digit_points_power_states:]
            bare_digit_points_power_actions = button_actions[before_bare_digit_points_power_actions:]
            colloquial_power_point_cases = []
            for phrase in (
                "我手机剩10个电了",
                "电量就剩10个电了",
                "手机只有10个电了",
                "电量3%了",
                "我手机只剩八个点还能回家吗",
                "手机就八个点了要省电吗",
                "电量剩八个点能撑到家吗",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                colloquial_power_point_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_phone_high_percent_power_states = len(states)
            before_phone_high_percent_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机还有80%电")
            phone_high_percent_power_states = states[before_phone_high_percent_power_states:]
            phone_high_percent_power_actions = button_actions[before_phone_high_percent_power_actions:]
            before_phone_signal_has_bar_states = len(states)
            before_phone_signal_has_bar_actions = len(button_actions)
            pi_command_daemon.handle_command("手机信号还有一格")
            phone_signal_has_bar_states = states[before_phone_signal_has_bar_states:]
            phone_signal_has_bar_actions = button_actions[before_phone_signal_has_bar_actions:]
            before_phone_percent_low_power_states = len(states)
            before_phone_percent_low_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机剩10%了")
            phone_percent_low_power_states = states[before_phone_percent_low_power_states:]
            phone_percent_low_power_actions = button_actions[before_phone_percent_low_power_actions:]
            before_spoken_phone_percent_low_power_states = len(states)
            before_spoken_phone_percent_low_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机还剩百分之十了")
            spoken_phone_percent_low_power_states = states[before_spoken_phone_percent_low_power_states:]
            spoken_phone_percent_low_power_actions = button_actions[before_spoken_phone_percent_low_power_actions:]
            natural_percent_low_power_cases = []
            for phrase in (
                "我只剩百分之十电了",
                "我只有10%电了",
                "只剩百分之十电了",
                "就剩10%电了",
                "手机剩百分之八还能到家吗",
                "就8%电还能听多久",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                natural_percent_low_power_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_phone_bar_low_power_states = len(states)
            before_phone_bar_low_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机就剩两格电了")
            phone_bar_low_power_states = states[before_phone_bar_low_power_states:]
            phone_bar_low_power_actions = button_actions[before_phone_bar_low_power_actions:]
            before_short_phone_bar_low_power_states = len(states)
            before_short_phone_bar_low_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机就剩两格了")
            short_phone_bar_low_power_states = states[before_short_phone_bar_low_power_states:]
            short_phone_bar_low_power_actions = button_actions[before_short_phone_bar_low_power_actions:]
            before_phone_signal_bar_states = len(states)
            before_phone_signal_bar_actions = len(button_actions)
            pi_command_daemon.handle_command("手机信号只有两格了")
            phone_signal_bar_states = states[before_phone_signal_bar_states:]
            phone_signal_bar_actions = button_actions[before_phone_signal_bar_actions:]
            phone_signal_problem_cases = []
            for phrase in (
                "我手机信号不好",
                "手机没信号了",
                "我手机网络太差",
                "手机网络不太行",
                "信号一格了",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                phone_signal_problem_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_low_phone_power_states = len(states)
            before_low_phone_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机电不多了")
            low_phone_power_states = states[before_low_phone_power_states:]
            low_phone_power_actions = button_actions[before_low_phone_power_actions:]
            guarded_portable_hotspot_advice_cases = []
            for phrase in (
                "手机信号只有一格，还要不要连热点",
                "手机信号太差，别连热点，只想知道还能不能出门",
                "带你出去但手机快没电，别连热点，只说建议",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                guarded_portable_hotspot_advice_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            hotspot_connect_safety_cases = []
            for phrase in (
                "手机只剩一格信号，会不会乱连热点",
                "Wi-Fi失败后会不会重复切换",
                "出门时会不会自己切到手机热点",
                "只写屏告诉我会不会自动连手机热点",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                hotspot_connect_safety_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_phone_power_not_enough_states = len(states)
            before_phone_power_not_enough_actions = len(button_actions)
            pi_command_daemon.handle_command("手机电不够了")
            phone_power_not_enough_states = states[before_phone_power_not_enough_states:]
            phone_power_not_enough_actions = button_actions[before_phone_power_not_enough_actions:]
            before_phone_power_enough_question_states = len(states)
            before_phone_power_enough_question_actions = len(button_actions)
            pi_command_daemon.handle_command("手机电还够吗")
            phone_power_enough_question_states = states[before_phone_power_enough_question_states:]
            phone_power_enough_question_actions = button_actions[before_phone_power_enough_question_actions:]
            low_power_question_cases = []
            for phrase in (
                "手机还有多少电",
                "手机还剩多少电",
                "我手机还剩多少电",
                "手机还能撑吗",
                "手机还能撑多久",
                "手机撑得住吗",
                "手机电量撑得回家吗",
                "电够回去吗",
                "还能撑回去吗",
                "撑不到家了",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                low_power_question_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_battery_enough_way_home_states = len(states)
            before_battery_enough_way_home_actions = len(button_actions)
            pi_command_daemon.handle_command("电够不够撑到回家")
            battery_enough_way_home_states = states[before_battery_enough_way_home_states:]
            battery_enough_way_home_actions = button_actions[before_battery_enough_way_home_actions:]
            before_battery_enough_direct_home_states = len(states)
            before_battery_enough_direct_home_actions = len(button_actions)
            pi_command_daemon.handle_command("电够不够回家")
            battery_enough_direct_home_states = states[before_battery_enough_direct_home_states:]
            battery_enough_direct_home_actions = button_actions[before_battery_enough_direct_home_actions:]
            before_battery_enough_home_states = len(states)
            before_battery_enough_home_actions = len(button_actions)
            pi_command_daemon.handle_command("电够撑到家吗")
            battery_enough_home_states = states[before_battery_enough_home_states:]
            battery_enough_home_actions = button_actions[before_battery_enough_home_actions:]
            before_phone_last_home_states = len(states)
            before_phone_last_home_actions = len(button_actions)
            pi_command_daemon.handle_command("手机撑不撑得到家")
            phone_last_home_states = states[before_phone_last_home_states:]
            phone_last_home_actions = button_actions[before_phone_last_home_actions:]
            before_can_last_way_home_states = len(states)
            before_can_last_way_home_actions = len(button_actions)
            pi_command_daemon.handle_command("还能撑到回家吗")
            can_last_way_home_states = states[before_can_last_way_home_states:]
            can_last_way_home_actions = button_actions[before_can_last_way_home_actions:]
            before_battery_failing_states = len(states)
            before_battery_failing_actions = len(button_actions)
            pi_command_daemon.handle_command("手机电池快不行了")
            battery_failing_states = states[before_battery_failing_states:]
            battery_failing_actions = button_actions[before_battery_failing_actions:]
            before_little_phone_power_states = len(states)
            before_little_phone_power_actions = len(button_actions)
            pi_command_daemon.handle_command("手机只剩一点电了")
            little_phone_power_states = states[before_little_phone_power_states:]
            little_phone_power_actions = button_actions[before_little_phone_power_actions:]
            before_power_saving_states = len(states)
            before_power_saving_actions = len(button_actions)
            pi_command_daemon.handle_command("省电一点")
            power_saving_states = states[before_power_saving_states:]
            power_saving_actions = button_actions[before_power_saving_actions:]
            before_casual_power_saving_states = len(states)
            before_casual_power_saving_actions = len(button_actions)
            pi_command_daemon.handle_command("省点电")
            casual_power_saving_states = states[before_casual_power_saving_states:]
            casual_power_saving_actions = button_actions[before_casual_power_saving_actions:]
            before_careful_power_saving_states = len(states)
            before_careful_power_saving_actions = len(button_actions)
            pi_command_daemon.handle_command("省着点用电")
            careful_power_saving_states = states[before_careful_power_saving_states:]
            careful_power_saving_actions = button_actions[before_careful_power_saving_actions:]
            low_battery_colloquial_cases = []
            for phrase in (
                "省着点用吧",
                "只剩5%了",
                "只剩百分之十了",
                "就剩五个点了",
                "电量快见底了",
                "电量见底了",
                "电量告急了",
                "快关机了",
                "我手机快撑不住了",
                "手机马上没电了",
                "电快没了怎么办",
                "我手机没电了",
                "手机只有10%还能听多久",
                "手机个位数了",
                "只剩个位数电了",
                "手机电量红了",
                "电量红了",
                "低电模式吧",
                "手机进低电模式了",
                "我快没电了还能带你出去吗",
                "电量不多要不要省电",
                "我手机还有一点电要省着用",
                "我电不够了",
                "我电还够吗",
                "我电量不多了",
                "省点手机电",
                "我只有一点点电了",
                "电快见底了",
                "快没电了先别播歌",
                "快没电了只在屏幕上回我",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                low_battery_colloquial_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_late_home_states = len(states)
            before_late_home_actions = len(button_actions)
            pi_command_daemon.handle_command("夜路有点晚了，我要打车回家")
            late_home_states = states[before_late_home_states:]
            late_home_actions = button_actions[before_late_home_actions:]
            before_too_late_outside_states = len(states)
            before_too_late_outside_actions = len(button_actions)
            pi_command_daemon.handle_command("外面太晚了")
            too_late_outside_states = states[before_too_late_outside_states:]
            too_late_outside_actions = button_actions[before_too_late_outside_actions:]
            portable_dark_route_cases = []
            for phrase in (
                "路太黑了",
                "夜路太黑了",
                "天黑了想回家",
                "路上太黑了我想打车",
                "找条亮一点的路",
                "帮我找亮一点的路",
                "避开小巷回家",
                "别走小巷",
                "找人多一点的路",
                "找人多一点的地方",
                "别带我走太黑的小路",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                portable_dark_route_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_going_home_states = len(states)
            before_going_home_actions = len(button_actions)
            pi_command_daemon.handle_command("我要回家了")
            going_home_states = states[before_going_home_states:]
            going_home_actions = button_actions[before_going_home_actions:]
            before_unsafe_route_states = len(states)
            before_unsafe_route_actions = len(button_actions)
            pi_command_daemon.handle_command("路上有点害怕，陪我回家")
            unsafe_route_states = states[before_unsafe_route_states:]
            unsafe_route_actions = button_actions[before_unsafe_route_actions:]
            before_dangerous_route_states = len(states)
            before_dangerous_route_actions = len(button_actions)
            pi_command_daemon.handle_command("路上有点危险")
            dangerous_route_states = states[before_dangerous_route_states:]
            dangerous_route_actions = button_actions[before_dangerous_route_actions:]
            portable_following_safety_cases = []
            for phrase in (
                "感觉有人跟着我",
                "后面好像有人跟着",
                "后面好像有人",
                "有人跟着",
                "有人尾随",
                "好像有人尾随我",
                "有人跟我走",
                "后面有人跟我走",
                "我有点不安心",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                portable_following_safety_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_short_fear_states = len(states)
            before_short_fear_actions = len(button_actions)
            pi_command_daemon.handle_command("我有点怕")
            short_fear_states = states[before_short_fear_states:]
            short_fear_actions = button_actions[before_short_fear_actions:]
            before_route_fear_states = len(states)
            before_route_fear_actions = len(button_actions)
            pi_command_daemon.handle_command("路上有点怕")
            route_fear_states = states[before_route_fear_states:]
            route_fear_actions = button_actions[before_route_fear_actions:]
            before_way_home_worried_states = len(states)
            before_way_home_worried_actions = len(button_actions)
            pi_command_daemon.handle_command("回家路上有点慌")
            way_home_worried_states = states[before_way_home_worried_states:]
            way_home_worried_actions = button_actions[before_way_home_worried_actions:]
            before_walk_me_back_states = len(states)
            before_walk_me_back_actions = len(button_actions)
            pi_command_daemon.handle_command("陪我走回去")
            walk_me_back_states = states[before_walk_me_back_states:]
            walk_me_back_actions = button_actions[before_walk_me_back_actions:]
            before_walk_me_subway_states = len(states)
            before_walk_me_subway_actions = len(button_actions)
            pi_command_daemon.handle_command("陪我走到地铁口")
            walk_me_subway_states = states[before_walk_me_subway_states:]
            walk_me_subway_actions = button_actions[before_walk_me_subway_actions:]
            portable_wayfinding_cases = []
            for phrase in (
                "回家怎么走",
                "怎么回家比较安全",
                "我有点迷路了",
                "我迷路了",
                "找不到路了",
                "有点找不到路了",
                "我不知道怎么回去了",
                "带我回家",
                "我想回去了",
                "送我回去",
                "带我回去",
                "快到家了吗",
                "到家还要多久",
                "还有多久到家",
                "回去还要多久",
                "还有几分钟到家",
                "还要多长时间到家",
                "还差多久到家",
                "到家要多久",
                "多久能回家",
                "几点能到家",
                "预计几点到家",
                "什么时候能回去",
                "还赶得上末班车吗",
                "回家还来得及吗",
                "赶不上末班车怎么办",
                "帮我叫个车",
                "我想叫车回家",
                "打不到车怎么办",
                "附近好打车吗",
                "能不能叫到车",
                "现在还能打到车吗",
                "网约车叫不到怎么办",
                "出租车在哪",
                "带我去地铁站",
                "带我回地铁站",
                "陪我去地铁口",
                "地铁站怎么走",
                "附近地铁站在哪",
                "找个地铁站",
                "带我去便利店",
                "下雨了找个地方躲躲",
                "下雨了找个地方躲一下",
                "外面下雨了怎么办",
                "我没带伞",
                "哪里可以买伞",
                "雨太大先找个室内",
                "我有点口渴",
                "我渴了",
                "想买瓶水",
                "哪里可以买水",
                "附近有水买吗",
                "太热了找个室内歇一下",
                "外面太热了怎么办",
                "我好像中暑了",
                "找个地方补水",
                "我有点冷",
                "外面太冷了怎么办",
                "太冷了找个室内歇一下",
                "找个暖和地方",
                "哪里可以买热饮",
                "附近有热饮买吗",
                "想买杯热水",
                "风太大了怎么办",
                "外面风好大找个避风地方",
                "找个避风的地方",
                "风大想找室内",
                "找个没风的地方",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                portable_wayfinding_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_surroundings_safety_states = len(states)
            before_surroundings_safety_actions = len(button_actions)
            pi_command_daemon.handle_command("周围安全吗")
            surroundings_safety_states = states[before_surroundings_safety_states:]
            surroundings_safety_actions = button_actions[before_surroundings_safety_actions:]
            before_nearby_safety_states = len(states)
            before_nearby_safety_actions = len(button_actions)
            pi_command_daemon.handle_command("这附近安全吗")
            nearby_safety_states = states[before_nearby_safety_states:]
            nearby_safety_actions = button_actions[before_nearby_safety_actions:]
            before_side_safety_states = len(states)
            before_side_safety_actions = len(button_actions)
            pi_command_daemon.handle_command("旁边好像不太安全")
            side_safety_states = states[before_side_safety_states:]
            side_safety_actions = button_actions[before_side_safety_actions:]
            before_route_safety_states = len(states)
            before_route_safety_actions = len(button_actions)
            pi_command_daemon.handle_command("这条路安全吗")
            route_safety_states = states[before_route_safety_states:]
            route_safety_actions = button_actions[before_route_safety_actions:]
            before_taxi_request_states = len(states)
            before_taxi_request_actions = len(button_actions)
            pi_command_daemon.handle_command("我想打车")
            taxi_request_states = states[before_taxi_request_states:]
            taxi_request_actions = button_actions[before_taxi_request_actions:]
            before_safe_place_states = len(states)
            before_safe_place_actions = len(button_actions)
            pi_command_daemon.handle_command("找个安全的地方")
            safe_place_states = states[before_safe_place_states:]
            safe_place_actions = button_actions[before_safe_place_actions:]
            before_rain_shelter_states = len(states)
            before_rain_shelter_actions = len(button_actions)
            pi_command_daemon.handle_command("找个地方躲雨")
            rain_shelter_states = states[before_rain_shelter_states:]
            rain_shelter_actions = button_actions[before_rain_shelter_actions:]
            before_nearby_station_states = len(states)
            before_nearby_station_actions = len(button_actions)
            pi_command_daemon.handle_command("最近有地铁口吗")
            nearby_station_states = states[before_nearby_station_states:]
            nearby_station_actions = button_actions[before_nearby_station_actions:]
            before_find_subway_station_states = len(states)
            before_find_subway_station_actions = len(button_actions)
            pi_command_daemon.handle_command("我想找地铁站")
            find_subway_station_states = states[before_find_subway_station_states:]
            find_subway_station_actions = button_actions[before_find_subway_station_actions:]
            before_subway_station_location_states = len(states)
            before_subway_station_location_actions = len(button_actions)
            pi_command_daemon.handle_command("地铁站在哪")
            subway_station_location_states = states[before_subway_station_location_states:]
            subway_station_location_actions = button_actions[before_subway_station_location_actions:]
            before_find_bus_stop_states = len(states)
            before_find_bus_stop_actions = len(button_actions)
            pi_command_daemon.handle_command("我想找公交站")
            find_bus_stop_states = states[before_find_bus_stop_states:]
            find_bus_stop_actions = button_actions[before_find_bus_stop_actions:]
            before_bus_stop_location_states = len(states)
            before_bus_stop_location_actions = len(button_actions)
            pi_command_daemon.handle_command("公交站在哪")
            bus_stop_location_states = states[before_bus_stop_location_states:]
            bus_stop_location_actions = button_actions[before_bus_stop_location_actions:]
            before_bus_station_alias_location_states = len(states)
            before_bus_station_alias_location_actions = len(button_actions)
            pi_command_daemon.handle_command("巴士站在哪")
            bus_station_alias_location_states = states[before_bus_station_alias_location_states:]
            bus_station_alias_location_actions = button_actions[before_bus_station_alias_location_actions:]
            before_convenience_store_states = len(states)
            before_convenience_store_actions = len(button_actions)
            pi_command_daemon.handle_command("附近有便利店吗")
            convenience_store_states = states[before_convenience_store_states:]
            convenience_store_actions = button_actions[before_convenience_store_actions:]
            before_any_convenience_store_states = len(states)
            before_any_convenience_store_actions = len(button_actions)
            pi_command_daemon.handle_command("哪里有便利店")
            any_convenience_store_states = states[before_any_convenience_store_states:]
            any_convenience_store_actions = button_actions[before_any_convenience_store_actions:]
            before_convenience_store_location_states = len(states)
            before_convenience_store_location_actions = len(button_actions)
            pi_command_daemon.handle_command("便利店在哪")
            convenience_store_location_states = states[before_convenience_store_location_states:]
            convenience_store_location_actions = button_actions[before_convenience_store_location_actions:]
            before_nearby_pharmacy_states = len(states)
            before_nearby_pharmacy_actions = len(button_actions)
            pi_command_daemon.handle_command("附近有药店吗")
            nearby_pharmacy_states = states[before_nearby_pharmacy_states:]
            nearby_pharmacy_actions = button_actions[before_nearby_pharmacy_actions:]
            before_pharmacy_location_states = len(states)
            before_pharmacy_location_actions = len(button_actions)
            pi_command_daemon.handle_command("药店在哪")
            pharmacy_location_states = states[before_pharmacy_location_states:]
            pharmacy_location_actions = button_actions[before_pharmacy_location_actions:]
            first_aid_pharmacy_cases = []
            for phrase in [
                "哪里可以买创可贴",
                "附近能买创可贴吗",
                "我擦破皮了找个药店",
                "我有点头疼想找药店",
                "肚子疼附近有药店吗",
                "想买点药",
                "找个药店买药",
            ]:
                before_first_aid_pharmacy_states = len(states)
                before_first_aid_pharmacy_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                first_aid_pharmacy_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_first_aid_pharmacy_states:],
                        "actions": button_actions[before_first_aid_pharmacy_actions:],
                    }
                )
            before_restroom_need_states = len(states)
            before_restroom_need_actions = len(button_actions)
            pi_command_daemon.handle_command("洗手间在哪")
            restroom_need_states = states[before_restroom_need_states:]
            restroom_need_actions = button_actions[before_restroom_need_actions:]
            before_casual_restroom_location_states = len(states)
            before_casual_restroom_location_actions = len(button_actions)
            pi_command_daemon.handle_command("厕所在哪儿")
            casual_restroom_location_states = states[before_casual_restroom_location_states:]
            casual_restroom_location_actions = button_actions[before_casual_restroom_location_actions:]
            before_any_restroom_states = len(states)
            before_any_restroom_actions = len(button_actions)
            pi_command_daemon.handle_command("哪里有厕所")
            any_restroom_states = states[before_any_restroom_states:]
            any_restroom_actions = button_actions[before_any_restroom_actions:]
            before_natural_restroom_need_states = len(states)
            before_natural_restroom_need_actions = len(button_actions)
            pi_command_daemon.handle_command("我想上厕所")
            natural_restroom_need_states = states[before_natural_restroom_need_states:]
            natural_restroom_need_actions = button_actions[before_natural_restroom_need_actions:]
            portable_restroom_direction_cases = []
            for phrase in (
                "厕所怎么走",
                "带我去厕所",
                "我想去洗手间",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                portable_restroom_direction_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_subjectless_restroom_need_states = len(states)
            before_subjectless_restroom_need_actions = len(button_actions)
            pi_command_daemon.handle_command("想上厕所")
            subjectless_restroom_need_states = states[before_subjectless_restroom_need_states:]
            subjectless_restroom_need_actions = button_actions[before_subjectless_restroom_need_actions:]
            before_urgent_restroom_need_states = len(states)
            before_urgent_restroom_need_actions = len(button_actions)
            pi_command_daemon.handle_command("要上厕所")
            urgent_restroom_need_states = states[before_urgent_restroom_need_states:]
            urgent_restroom_need_actions = button_actions[before_urgent_restroom_need_actions:]
            before_urgent_pee_states = len(states)
            before_urgent_pee_actions = len(button_actions)
            pi_command_daemon.handle_command("尿急了")
            urgent_pee_states = states[before_urgent_pee_states:]
            urgent_pee_actions = button_actions[before_urgent_pee_actions:]
            before_casual_pee_states = len(states)
            before_casual_pee_actions = len(button_actions)
            pi_command_daemon.handle_command("想尿尿")
            casual_pee_states = states[before_casual_pee_states:]
            casual_pee_actions = button_actions[before_casual_pee_actions:]
            before_charge_spot_states = len(states)
            before_charge_spot_actions = len(button_actions)
            pi_command_daemon.handle_command("找个地方充电")
            charge_spot_states = states[before_charge_spot_states:]
            charge_spot_actions = button_actions[before_charge_spot_actions:]
            before_any_charge_spot_states = len(states)
            before_any_charge_spot_actions = len(button_actions)
            pi_command_daemon.handle_command("哪里能充电")
            any_charge_spot_states = states[before_any_charge_spot_states:]
            any_charge_spot_actions = button_actions[before_any_charge_spot_actions:]
            before_subjectless_charge_need_states = len(states)
            before_subjectless_charge_need_actions = len(button_actions)
            pi_command_daemon.handle_command("想充电")
            subjectless_charge_need_states = states[before_subjectless_charge_need_states:]
            subjectless_charge_need_actions = button_actions[before_subjectless_charge_need_actions:]
            before_urgent_charge_need_states = len(states)
            before_urgent_charge_need_actions = len(button_actions)
            pi_command_daemon.handle_command("得充电了")
            urgent_charge_need_states = states[before_urgent_charge_need_states:]
            urgent_charge_need_actions = button_actions[before_urgent_charge_need_actions:]
            before_charge_place_location_states = len(states)
            before_charge_place_location_actions = len(button_actions)
            pi_command_daemon.handle_command("充电的地方在哪")
            charge_place_location_states = states[before_charge_place_location_states:]
            charge_place_location_actions = button_actions[before_charge_place_location_actions:]
            portable_charge_casual_cases = []
            for phrase in (
                "附近有没有地方充会电",
                "找个地方充会电",
                "附近哪能充电",
                "附近能充会电吗",
                "找个充电宝",
                "哪里能借充电宝",
                "附近有共享充电宝吗",
                "我想借个充电宝",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                portable_charge_casual_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_sit_down_states = len(states)
            before_sit_down_actions = len(button_actions)
            pi_command_daemon.handle_command("我想坐一下")
            sit_down_states = states[before_sit_down_states:]
            sit_down_actions = button_actions[before_sit_down_actions:]
            portable_rest_break_cases = []
            for phrase in (
                "我想找个地方坐会儿",
                "找个地方歇会儿",
                "找个地方歇一下",
                "找个地方坐一下",
                "附近能坐一下吗",
                "我想歇一下",
                "有点累想坐一下",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                portable_rest_break_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_rest_break_states = len(states)
            before_rest_break_actions = len(button_actions)
            pi_command_daemon.handle_command("走累了找地方休息")
            rest_break_states = states[before_rest_break_states:]
            rest_break_actions = button_actions[before_rest_break_actions:]
            before_outdoor_ready_states = len(states)
            before_outdoor_ready_actions = len(button_actions)
            pi_command_daemon.handle_command("出门前帮我检查一下")
            outdoor_ready_states = states[before_outdoor_ready_states:]
            outdoor_ready_actions = button_actions[before_outdoor_ready_actions:]
            before_take_out_states = len(states)
            before_take_out_actions = len(button_actions)
            pi_command_daemon.handle_command("能不能带你出去")
            take_out_states = states[before_take_out_states:]
            take_out_actions = button_actions[before_take_out_actions:]
            before_walk_out_states = len(states)
            before_walk_out_actions = len(button_actions)
            pi_command_daemon.handle_command("我想出去走走")
            walk_out_states = states[before_walk_out_states:]
            walk_out_actions = button_actions[before_walk_out_actions:]
            before_take_walk_states = len(states)
            before_take_walk_actions = len(button_actions)
            pi_command_daemon.handle_command("带你出去走一圈")
            take_walk_states = states[before_take_walk_states:]
            take_walk_actions = button_actions[before_take_walk_actions:]
            portable_readiness_cases = []
            for phrase in (
                "出门前要检查什么",
                "低电量出门要注意什么",
                "只写屏低电量出门要注意什么",
                "手机快没电出门怎么办",
                "带你出门前要看什么",
                "出去前检查一下",
                "出门之前看一下状态",
                "我能带你出去吗",
                "你适合带出门吗",
                "我准备出门溜达一下",
                "带你出门溜达",
                "出去溜达一圈",
                "准备走了",
                "我要出发了",
                "要带你出发了",
                "我们要上路了",
                "准备离家了",
                "该出发了",
                "可以出发了吗",
                "我们出发吧",
                "咱们走吧",
                "要走啦",
                "带你走了",
                "我要回酒店了",
                "回宿舍的路安全吗",
                "准备回住处",
                "怎么回民宿安全",
                "陪我回酒店",
            ):
                before_case_states = len(states)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                portable_readiness_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            before_text_only_portable_briefing_states = len(states)
            before_text_only_portable_briefing_spoken = len(spoken)
            before_text_only_portable_briefing_actions = len(button_actions)
            pi_command_daemon.handle_command("低电量出门要注意什么写在屏幕上")
            text_only_portable_briefing_states = states[before_text_only_portable_briefing_states:]
            text_only_portable_briefing_spoken = spoken[before_text_only_portable_briefing_spoken:]
            text_only_portable_briefing_actions = button_actions[before_text_only_portable_briefing_actions:]
            text_only_portable_suffix_cases = []
            for phrase in ("外面太晚了只写屏", "带你出门前只写屏检查状态"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                before_case_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                text_only_portable_suffix_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": button_actions[before_case_actions:],
                    }
                )
            audio_mode.save_audio_mode("radio", reason="text only smoke", path=mode_path)
            before_text_only_states = len(states)
            before_text_only_spoken = len(spoken)
            pi_command_daemon.handle_command("文字回我就行")
            text_only_state = audio_mode.load_audio_mode(path=mode_path)
            text_only_states = states[before_text_only_states:]
            text_only_spoken = spoken[before_text_only_spoken:]
            audio_mode.save_audio_mode("radio", reason="short text only smoke", path=mode_path)
            before_short_text_only_states = len(states)
            before_short_text_only_spoken = len(spoken)
            before_short_text_only_actions = len(button_actions)
            pi_command_daemon.handle_command("文字就行")
            short_text_only_state = audio_mode.load_audio_mode(path=mode_path)
            short_text_only_states = states[before_short_text_only_states:]
            short_text_only_spoken = spoken[before_short_text_only_spoken:]
            short_text_only_actions = button_actions[before_short_text_only_actions:]
            audio_mode.save_audio_mode("radio", reason="post text only smoke", path=mode_path)
            before_post_text_only_states = len(states)
            before_post_text_only_spoken = len(spoken)
            before_post_text_only_actions = len(button_actions)
            pi_command_daemon.handle_command("发文字就行")
            post_text_only_state = audio_mode.load_audio_mode(path=mode_path)
            post_text_only_states = states[before_post_text_only_states:]
            post_text_only_spoken = spoken[before_post_text_only_spoken:]
            post_text_only_actions = button_actions[before_post_text_only_actions:]
            audio_mode.save_audio_mode("radio", reason="typing only smoke", path=mode_path)
            before_typing_only_states = len(states)
            before_typing_only_spoken = len(spoken)
            before_typing_only_actions = len(button_actions)
            pi_command_daemon.handle_command("打字就行")
            typing_only_state = audio_mode.load_audio_mode(path=mode_path)
            typing_only_states = states[before_typing_only_states:]
            typing_only_spoken = spoken[before_typing_only_spoken:]
            typing_only_actions = button_actions[before_typing_only_actions:]
            audio_mode.save_audio_mode("radio", reason="typing tell smoke", path=mode_path)
            before_typing_tell_states = len(states)
            before_typing_tell_spoken = len(spoken)
            before_typing_tell_actions = len(button_actions)
            pi_command_daemon.handle_command("打字告诉我")
            typing_tell_state = audio_mode.load_audio_mode(path=mode_path)
            typing_tell_states = states[before_typing_tell_states:]
            typing_tell_spoken = spoken[before_typing_tell_spoken:]
            typing_tell_actions = button_actions[before_typing_tell_actions:]
            audio_mode.save_audio_mode("radio", reason="quiet text reply smoke", path=mode_path)
            before_quiet_text_reply_states = len(states)
            before_quiet_text_reply_spoken = len(spoken)
            before_quiet_text_reply_actions = len(button_actions)
            pi_command_daemon.handle_command("默默回我")
            quiet_text_reply_state = audio_mode.load_audio_mode(path=mode_path)
            quiet_text_reply_states = states[before_quiet_text_reply_states:]
            quiet_text_reply_spoken = spoken[before_quiet_text_reply_spoken:]
            quiet_text_reply_actions = button_actions[before_quiet_text_reply_actions:]
            audio_mode.save_audio_mode("radio", reason="whisper text reply smoke", path=mode_path)
            before_whisper_text_reply_states = len(states)
            before_whisper_text_reply_spoken = len(spoken)
            before_whisper_text_reply_actions = len(button_actions)
            pi_command_daemon.handle_command("悄悄回我")
            whisper_text_reply_state = audio_mode.load_audio_mode(path=mode_path)
            whisper_text_reply_states = states[before_whisper_text_reply_states:]
            whisper_text_reply_spoken = spoken[before_whisper_text_reply_spoken:]
            whisper_text_reply_actions = button_actions[before_whisper_text_reply_actions:]
            audio_mode.save_audio_mode("radio", reason="screen only smoke", path=mode_path)
            before_screen_only_states = len(states)
            before_screen_only_spoken = len(spoken)
            pi_command_daemon.handle_command("只在屏幕上回我，不要朗读")
            screen_only_state = audio_mode.load_audio_mode(path=mode_path)
            screen_only_states = states[before_screen_only_states:]
            screen_only_spoken = spoken[before_screen_only_spoken:]
            audio_mode.save_audio_mode("radio", reason="screen tell smoke", path=mode_path)
            before_screen_tell_states = len(states)
            before_screen_tell_spoken = len(spoken)
            pi_command_daemon.handle_command("屏幕上告诉我")
            screen_tell_state = audio_mode.load_audio_mode(path=mode_path)
            screen_tell_states = states[before_screen_tell_states:]
            screen_tell_spoken = spoken[before_screen_tell_spoken:]
            audio_mode.save_audio_mode("radio", reason="casual screen tell smoke", path=mode_path)
            before_screen_tell_casual_states = len(states)
            before_screen_tell_casual_spoken = len(spoken)
            before_screen_tell_casual_actions = len(button_actions)
            pi_command_daemon.handle_command("屏幕告诉我就行")
            screen_tell_casual_state = audio_mode.load_audio_mode(path=mode_path)
            screen_tell_casual_states = states[before_screen_tell_casual_states:]
            screen_tell_casual_spoken = spoken[before_screen_tell_casual_spoken:]
            screen_tell_casual_actions = button_actions[before_screen_tell_casual_actions:]
            audio_mode.save_audio_mode("radio", reason="direct screen reply smoke", path=mode_path)
            before_screen_reply_direct_states = len(states)
            before_screen_reply_direct_spoken = len(spoken)
            before_screen_reply_direct_actions = len(button_actions)
            pi_command_daemon.handle_command("屏幕回复我")
            screen_reply_direct_state = audio_mode.load_audio_mode(path=mode_path)
            screen_reply_direct_states = states[before_screen_reply_direct_states:]
            screen_reply_direct_spoken = spoken[before_screen_reply_direct_spoken:]
            screen_reply_direct_actions = button_actions[before_screen_reply_direct_actions:]
            audio_mode.save_audio_mode("radio", reason="casual screen say smoke", path=mode_path)
            before_screen_say_casual_states = len(states)
            before_screen_say_casual_spoken = len(spoken)
            before_screen_say_casual_actions = len(button_actions)
            pi_command_daemon.handle_command("屏幕上说就行")
            screen_say_casual_state = audio_mode.load_audio_mode(path=mode_path)
            screen_say_casual_states = states[before_screen_say_casual_states:]
            screen_say_casual_spoken = spoken[before_screen_say_casual_spoken:]
            screen_say_casual_actions = button_actions[before_screen_say_casual_actions:]
            audio_mode.save_audio_mode("radio", reason="screen post casual smoke", path=mode_path)
            before_screen_post_casual_states = len(states)
            before_screen_post_casual_spoken = len(spoken)
            before_screen_post_casual_actions = len(button_actions)
            pi_command_daemon.handle_command("发屏幕上就好")
            screen_post_casual_state = audio_mode.load_audio_mode(path=mode_path)
            screen_post_casual_states = states[before_screen_post_casual_states:]
            screen_post_casual_spoken = spoken[before_screen_post_casual_spoken:]
            screen_post_casual_actions = button_actions[before_screen_post_casual_actions:]
            audio_mode.save_audio_mode("radio", reason="display screen casual smoke", path=mode_path)
            before_display_screen_casual_states = len(states)
            before_display_screen_casual_spoken = len(spoken)
            before_display_screen_casual_actions = len(button_actions)
            pi_command_daemon.handle_command("显示屏上就行")
            display_screen_casual_state = audio_mode.load_audio_mode(path=mode_path)
            display_screen_casual_states = states[before_display_screen_casual_states:]
            display_screen_casual_spoken = spoken[before_display_screen_casual_spoken:]
            display_screen_casual_actions = button_actions[before_display_screen_casual_actions:]
            extra_text_only_cases = []
            for phrase in (
                "只回文字",
                "打在屏幕上",
                "打屏幕上",
                "屏幕打出来",
                "在屏幕打出来",
                "显示屏打出来",
                "显示一下就好",
                "显示在屏幕上就行",
                "屏幕上显示一下",
                "文字就好别说话",
                "文字模式",
                "文字显示就行",
                "打字模式",
                "只看文字",
                "只看屏幕",
                "只写屏",
                "只写屏幕",
                "写屏就行",
                "写屏幕就好",
                "旁边有人只显示",
                "打字给我就好",
                "悄悄告诉我",
                "安静一点回复",
                "安静回我一下",
                "静音回答我",
                "静音文字回复",
                "别读出声",
                "不要说出声",
                "旁边有人别出声",
                "旁边有人文字回我",
                "附近有人别出声",
                "老板在旁边别说话",
                "老板在旁边打字回",
                "旁边有人别读",
                "同事在旁边别说",
                "别让身边的人听到",
                "别让周围人听见",
                "别让路人听见",
                "只亮屏回复",
                "不要语音回答",
                "不要语音播出来",
                "不要声音回复",
                "别用声音回答",
                "别用声音说",
                "我在会议上只写屏",
                "医院里只写屏",
                "会议室文字回我",
            ):
                audio_mode.save_audio_mode("radio", reason="extra text only smoke", path=mode_path)
                before_extra_text_only_states = len(states)
                before_extra_text_only_spoken = len(spoken)
                before_extra_text_only_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                extra_text_only_cases.append(
                    {
                        "phrase": phrase,
                        "state": audio_mode.load_audio_mode(path=mode_path),
                        "states": states[before_extra_text_only_states:],
                        "spoken": spoken[before_extra_text_only_spoken:],
                        "actions": button_actions[before_extra_text_only_actions:],
                    }
                )
            extra_soft_mute_cases = []
            for phrase in ("我在开会别出声", "会议室别说话", "电影院别外放", "影院别响"):
                audio_mode.save_audio_mode("radio", reason="extra soft mute smoke", path=mode_path)
                before_extra_soft_mute_states = len(states)
                before_extra_soft_mute_spoken = len(spoken)
                before_extra_soft_mute_actions = len(button_actions)
                pi_command_daemon.handle_command(phrase)
                extra_soft_mute_cases.append(
                    {
                        "phrase": phrase,
                        "state": audio_mode.load_audio_mode(path=mode_path),
                        "states": states[before_extra_soft_mute_states:],
                        "spoken": spoken[before_extra_soft_mute_spoken:],
                        "actions": button_actions[before_extra_soft_mute_actions:],
                    }
                )
            audio_mode.save_audio_mode("radio", reason="display only no speak smoke", path=mode_path)
            before_display_only_no_speak_states = len(states)
            before_display_only_no_speak_spoken = len(spoken)
            before_display_only_no_speak_actions = len(button_actions)
            pi_command_daemon.handle_command("只显示别说")
            display_only_no_speak_state = audio_mode.load_audio_mode(path=mode_path)
            display_only_no_speak_states = states[before_display_only_no_speak_states:]
            display_only_no_speak_spoken = spoken[before_display_only_no_speak_spoken:]
            display_only_no_speak_actions = button_actions[before_display_only_no_speak_actions:]
            audio_mode.save_audio_mode("radio", reason="no voice reply smoke", path=mode_path)
            before_no_voice_reply_states = len(states)
            before_no_voice_reply_spoken = len(spoken)
            before_no_voice_reply_actions = len(button_actions)
            pi_command_daemon.handle_command("别用语音回")
            no_voice_reply_state = audio_mode.load_audio_mode(path=mode_path)
            no_voice_reply_states = states[before_no_voice_reply_states:]
            no_voice_reply_spoken = spoken[before_no_voice_reply_spoken:]
            no_voice_reply_actions = button_actions[before_no_voice_reply_actions:]
            audio_mode.save_audio_mode("radio", reason="no voice output smoke", path=mode_path)
            before_no_voice_output_states = len(states)
            before_no_voice_output_spoken = len(spoken)
            before_no_voice_output_actions = len(button_actions)
            pi_command_daemon.handle_command("别出语音")
            no_voice_output_state = audio_mode.load_audio_mode(path=mode_path)
            no_voice_output_states = states[before_no_voice_output_states:]
            no_voice_output_spoken = spoken[before_no_voice_output_spoken:]
            no_voice_output_actions = button_actions[before_no_voice_output_actions:]
            audio_mode.save_audio_mode("radio", reason="no voice response smoke", path=mode_path)
            before_no_voice_response_states = len(states)
            before_no_voice_response_spoken = len(spoken)
            before_no_voice_response_actions = len(button_actions)
            pi_command_daemon.handle_command("不要语音回复")
            no_voice_response_state = audio_mode.load_audio_mode(path=mode_path)
            no_voice_response_states = states[before_no_voice_response_states:]
            no_voice_response_spoken = spoken[before_no_voice_response_spoken:]
            no_voice_response_actions = button_actions[before_no_voice_response_actions:]
            audio_mode.save_audio_mode("radio", reason="private readout smoke", path=mode_path)
            before_private_readout_states = len(states)
            before_private_readout_spoken = len(spoken)
            before_private_readout_actions = len(button_actions)
            pi_command_daemon.handle_command("别把我的话念出来")
            private_readout_state = audio_mode.load_audio_mode(path=mode_path)
            private_readout_states = states[before_private_readout_states:]
            private_readout_spoken = spoken[before_private_readout_spoken:]
            private_readout_actions = button_actions[before_private_readout_actions:]
            audio_mode.save_audio_mode("radio", reason="do not read smoke", path=mode_path)
            before_no_read_out_states = len(states)
            before_no_read_out_spoken = len(spoken)
            pi_command_daemon.handle_command("别读出来")
            no_read_out_state = audio_mode.load_audio_mode(path=mode_path)
            no_read_out_states = states[before_no_read_out_states:]
            no_read_out_spoken = spoken[before_no_read_out_spoken:]
            audio_mode.save_audio_mode("radio", reason="do not say out smoke", path=mode_path)
            before_no_say_out_states = len(states)
            before_no_say_out_spoken = len(spoken)
            before_no_say_out_actions = len(button_actions)
            pi_command_daemon.handle_command("别讲出来")
            no_say_out_state = audio_mode.load_audio_mode(path=mode_path)
            no_say_out_states = states[before_no_say_out_states:]
            no_say_out_spoken = spoken[before_no_say_out_spoken:]
            no_say_out_actions = button_actions[before_no_say_out_actions:]
            audio_mode.save_audio_mode("radio", reason="do not broadcast smoke", path=mode_path)
            before_no_broadcast_states = len(states)
            before_no_broadcast_spoken = len(spoken)
            pi_command_daemon.handle_command("别播报")
            no_broadcast_state = audio_mode.load_audio_mode(path=mode_path)
            no_broadcast_states = states[before_no_broadcast_states:]
            no_broadcast_spoken = spoken[before_no_broadcast_spoken:]
            audio_mode.save_audio_mode("radio", reason="do not play out smoke", path=mode_path)
            before_no_play_out_states = len(states)
            before_no_play_out_spoken = len(spoken)
            before_no_play_out_actions = len(button_actions)
            pi_command_daemon.handle_command("别播出来")
            no_play_out_state = audio_mode.load_audio_mode(path=mode_path)
            no_play_out_states = states[before_no_play_out_states:]
            no_play_out_spoken = spoken[before_no_play_out_spoken:]
            no_play_out_actions = button_actions[before_no_play_out_actions:]
            audio_mode.save_audio_mode("radio", reason="do not put out smoke", path=mode_path)
            before_no_put_out_states = len(states)
            before_no_put_out_spoken = len(spoken)
            before_no_put_out_actions = len(button_actions)
            pi_command_daemon.handle_command("不要放出来")
            no_put_out_state = audio_mode.load_audio_mode(path=mode_path)
            no_put_out_states = states[before_no_put_out_states:]
            no_put_out_spoken = spoken[before_no_put_out_spoken:]
            no_put_out_actions = button_actions[before_no_put_out_actions:]
            audio_mode.save_audio_mode("radio", reason="quiet screen reply smoke", path=mode_path)
            before_quiet_screen_reply_states = len(states)
            before_quiet_screen_reply_spoken = len(spoken)
            before_quiet_screen_reply_actions = len(button_actions)
            pi_command_daemon.handle_command("安静在屏幕上回我")
            quiet_screen_reply_state = audio_mode.load_audio_mode(path=mode_path)
            quiet_screen_reply_states = states[before_quiet_screen_reply_states:]
            quiet_screen_reply_spoken = spoken[before_quiet_screen_reply_spoken:]
            quiet_screen_reply_actions = button_actions[before_quiet_screen_reply_actions:]
            audio_mode.save_audio_mode("radio", reason="inconvenient speech smoke", path=mode_path)
            before_inconvenient_speech_states = len(states)
            before_inconvenient_speech_spoken = len(spoken)
            before_inconvenient_speech_actions = len(button_actions)
            pi_command_daemon.handle_command("现在不方便出声")
            inconvenient_speech_state = audio_mode.load_audio_mode(path=mode_path)
            inconvenient_speech_states = states[before_inconvenient_speech_states:]
            inconvenient_speech_spoken = spoken[before_inconvenient_speech_spoken:]
            inconvenient_speech_actions = button_actions[before_inconvenient_speech_actions:]
            audio_mode.save_audio_mode("radio", reason="no external speaker smoke", path=mode_path)
            before_no_external_speaker_states = len(states)
            before_no_external_speaker_spoken = len(spoken)
            before_no_external_speaker_actions = len(button_actions)
            pi_command_daemon.handle_command("别外放")
            no_external_speaker_state = audio_mode.load_audio_mode(path=mode_path)
            no_external_speaker_states = states[before_no_external_speaker_states:]
            no_external_speaker_spoken = spoken[before_no_external_speaker_spoken:]
            no_external_speaker_actions = button_actions[before_no_external_speaker_actions:]
            audio_mode.save_audio_mode("radio", reason="speaker device smoke", path=mode_path)
            before_speaker_device_states = len(states)
            before_speaker_device_spoken = len(spoken)
            before_speaker_device_actions = len(button_actions)
            pi_command_daemon.handle_command("别从喇叭放出来")
            speaker_device_state = audio_mode.load_audio_mode(path=mode_path)
            speaker_device_states = states[before_speaker_device_states:]
            speaker_device_spoken = spoken[before_speaker_device_spoken:]
            speaker_device_actions = button_actions[before_speaker_device_actions:]
            speaker_speech_cases = []
            for prompt in ("别在扬声器里说", "不要通过扬声器说话", "别用外放说话"):
                audio_mode.save_audio_mode("radio", reason="speaker speech smoke", path=mode_path)
                before_speaker_speech_states = len(states)
                before_speaker_speech_spoken = len(spoken)
                before_speaker_speech_actions = len(button_actions)
                pi_command_daemon.handle_command(prompt)
                speaker_speech_cases.append(
                    {
                        "prompt": prompt,
                        "state": audio_mode.load_audio_mode(path=mode_path),
                        "states": states[before_speaker_speech_states:],
                        "spoken": spoken[before_speaker_speech_spoken:],
                        "actions": button_actions[before_speaker_speech_actions:],
                    }
                )
            audio_mode.save_audio_mode("radio", reason="screen light only smoke", path=mode_path)
            before_screen_light_only_states = len(states)
            before_screen_light_only_spoken = len(spoken)
            before_screen_light_only_actions = len(button_actions)
            pi_command_daemon.handle_command("屏幕亮一下就行")
            screen_light_only_state = audio_mode.load_audio_mode(path=mode_path)
            screen_light_only_states = states[before_screen_light_only_states:]
            screen_light_only_spoken = spoken[before_screen_light_only_spoken:]
            screen_light_only_actions = button_actions[before_screen_light_only_actions:]
            audio_mode.save_audio_mode("radio", reason="screen light no speak smoke", path=mode_path)
            before_screen_light_no_speak_states = len(states)
            before_screen_light_no_speak_spoken = len(spoken)
            before_screen_light_no_speak_actions = len(button_actions)
            pi_command_daemon.handle_command("只亮屏别说话")
            screen_light_no_speak_state = audio_mode.load_audio_mode(path=mode_path)
            screen_light_no_speak_states = states[before_screen_light_no_speak_states:]
            screen_light_no_speak_spoken = spoken[before_screen_light_no_speak_spoken:]
            screen_light_no_speak_actions = button_actions[before_screen_light_no_speak_actions:]
            audio_mode.save_audio_mode("soft_mute", reason="audio status smoke", path=mode_path)
            before_soft_audio_status_states = len(states)
            before_soft_audio_status_spoken = len(spoken)
            pi_command_daemon.handle_command("为什么没声音")
            soft_audio_status_states = states[before_soft_audio_status_states:]
            soft_audio_status_spoken = spoken[before_soft_audio_status_spoken:]
            audio_mode.save_audio_mode("soft_mute", reason="muted status smoke", path=mode_path)
            before_muted_audio_status_states = len(states)
            before_muted_audio_status_spoken = len(spoken)
            pi_command_daemon.handle_command("你是不是静音了")
            muted_audio_status_states = states[before_muted_audio_status_states:]
            muted_audio_status_spoken = spoken[before_muted_audio_status_spoken:]
            muted_audio_status_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="can speak status smoke", path=mode_path)
            before_can_speak_status_states = len(states)
            before_can_speak_status_spoken = len(spoken)
            pi_command_daemon.handle_command("你能不能出声")
            can_speak_status_states = states[before_can_speak_status_states:]
            can_speak_status_spoken = spoken[before_can_speak_status_spoken:]
            can_speak_status_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="sound off status smoke", path=mode_path)
            before_sound_off_status_states = len(states)
            before_sound_off_status_spoken = len(spoken)
            pi_command_daemon.handle_command("声音关了吗")
            sound_off_status_states = states[before_sound_off_status_states:]
            sound_off_status_spoken = spoken[before_sound_off_status_spoken:]
            sound_off_status_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="mute mode status smoke", path=mode_path)
            before_mute_mode_status_states = len(states)
            before_mute_mode_status_spoken = len(spoken)
            pi_command_daemon.handle_command("现在是静音模式吗")
            mute_mode_status_states = states[before_mute_mode_status_states:]
            mute_mode_status_spoken = spoken[before_mute_mode_status_spoken:]
            mute_mode_status_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="mute-or-speak status smoke", path=mode_path)
            before_mute_or_speak_status_states = len(states)
            before_mute_or_speak_status_spoken = len(spoken)
            pi_command_daemon.handle_command("现在是静音还是能出声")
            mute_or_speak_status_states = states[before_mute_or_speak_status_states:]
            mute_or_speak_status_spoken = spoken[before_mute_or_speak_status_spoken:]
            mute_or_speak_status_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="can-talk status question smoke", path=mode_path)
            before_can_talk_question_states = len(states)
            before_can_talk_question_spoken = len(spoken)
            pi_command_daemon.handle_command("现在可以讲话吗")
            can_talk_question_states = states[before_can_talk_question_states:]
            can_talk_question_spoken = spoken[before_can_talk_question_spoken:]
            can_talk_question_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="can-speak-yet status question smoke", path=mode_path)
            before_can_speak_yet_question_states = len(states)
            before_can_speak_yet_question_spoken = len(spoken)
            pi_command_daemon.handle_command("可以说话了吗")
            can_speak_yet_question_states = states[before_can_speak_yet_question_states:]
            can_speak_yet_question_spoken = spoken[before_can_speak_yet_question_spoken:]
            can_speak_yet_question_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="convenient-speak status question smoke", path=mode_path)
            before_convenient_speak_question_states = len(states)
            before_convenient_speak_question_spoken = len(spoken)
            pi_command_daemon.handle_command("现在方便说话吗")
            convenient_speak_question_states = states[before_convenient_speak_question_states:]
            convenient_speak_question_spoken = spoken[before_convenient_speak_question_spoken:]
            convenient_speak_question_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("soft_mute", reason="convenient-speaker status question smoke", path=mode_path)
            before_convenient_speaker_question_states = len(states)
            before_convenient_speaker_question_spoken = len(spoken)
            pi_command_daemon.handle_command("方不方便外放")
            convenient_speaker_question_states = states[before_convenient_speaker_question_states:]
            convenient_speaker_question_spoken = spoken[before_convenient_speaker_question_spoken:]
            convenient_speaker_question_mode = audio_mode.load_audio_mode(path=mode_path)
            audio_mode.save_audio_mode("radio", reason="audio status radio smoke", path=mode_path)
            before_radio_audio_status_states = len(states)
            before_radio_audio_status_spoken = len(spoken)
            pi_command_daemon.handle_command("你现在能说话吗")
            radio_audio_status_states = states[before_radio_audio_status_states:]
            radio_audio_status_spoken = spoken[before_radio_audio_status_spoken:]
            audio_mode.save_audio_mode("radio", reason="audio mode question smoke", path=mode_path)
            before_audio_mode_status_states = len(states)
            before_audio_mode_status_spoken = len(spoken)
            pi_command_daemon.handle_command("现在是什么声音模式")
            audio_mode_status_states = states[before_audio_mode_status_states:]
            audio_mode_status_spoken = spoken[before_audio_mode_status_spoken:]
            audio_mode.save_audio_mode("dialog", reason="text-only audio status smoke", path=mode_path)
            before_text_only_audio_status_states = len(states)
            before_text_only_audio_status_spoken = len(spoken)
            pi_command_daemon.handle_command("声音状态写在屏幕上")
            text_only_audio_status_states = states[before_text_only_audio_status_states:]
            text_only_audio_status_spoken = spoken[before_text_only_audio_status_spoken:]
            button_actions.clear()
            before_text_only_hotspot_status_states = len(states)
            before_text_only_hotspot_status_spoken = len(spoken)
            pi_command_daemon.handle_command("现在热点状态写在屏幕上")
            text_only_hotspot_status_states = states[before_text_only_hotspot_status_states:]
            text_only_hotspot_status_spoken = spoken[before_text_only_hotspot_status_spoken:]
            text_only_hotspot_status_actions = list(button_actions)
            button_actions.clear()
            before_text_only_device_status_states = len(states)
            before_text_only_device_status_spoken = len(spoken)
            pi_command_daemon.handle_command("设备状态写在屏幕上")
            text_only_device_status_states = states[before_text_only_device_status_states:]
            text_only_device_status_spoken = spoken[before_text_only_device_status_spoken:]
            text_only_device_status_actions = list(button_actions)
            audio_mode.save_audio_mode("radio", reason="post text-only status smoke", path=mode_path)
            button_actions.clear()
            before_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("连接手机热点")
            hotspot_connect_states = states[before_hotspot_connect_states:]
            hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_named_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("连接PocketEarth-iPhone")
            named_hotspot_connect_states = states[before_named_hotspot_connect_states:]
            named_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_generic_iphone_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("连一下iPhone热点")
            generic_iphone_hotspot_connect_states = states[before_generic_iphone_hotspot_connect_states:]
            generic_iphone_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_apple_phone_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("用苹果手机热点")
            apple_phone_hotspot_connect_states = states[before_apple_phone_hotspot_connect_states:]
            apple_phone_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_backup_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("PocketEarth-Android连一下")
            backup_hotspot_connect_states = states[before_backup_hotspot_connect_states:]
            backup_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_phone_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("连我手机")
            phone_hotspot_connect_states = states[before_phone_hotspot_connect_states:]
            phone_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            text_only_hotspot_connect_cases = []
            for prompt in (
                "Wi-Fi掉了帮我连回热点写在屏幕上",
                "手机热点开好了只写屏",
                "帮我连PocketEarth-iPhone写在屏幕上",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(prompt)
                text_only_hotspot_connect_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            negative_hotspot_connect_cases = []
            for prompt in (
                "别连我的热点",
                "不要连手机热点",
                "先别切到热点",
                "手机热点别连",
                "别出声别连我的热点",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(prompt)
                negative_hotspot_connect_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            guarded_hotspot_status_cases = []
            for prompt in (
                "别连接热点，我只是问热点连上了吗",
                "不要切到vivo热点，只想知道vivo排第几",
                "别连手机热点，问一下现在用的是哪个Wi-Fi",
                "别出声别连接热点，我只是问热点连上了吗",
            ):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(prompt)
                guarded_hotspot_status_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_my_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("用我的热点")
            my_hotspot_connect_states = states[before_my_hotspot_connect_states:]
            my_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_cellular_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("用手机流量")
            cellular_hotspot_connect_states = states[before_cellular_hotspot_connect_states:]
            cellular_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_attach_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("帮我接上热点")
            attach_hotspot_connect_states = states[before_attach_hotspot_connect_states:]
            attach_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_switch_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("帮我换到手机热点")
            switch_hotspot_connect_states = states[before_switch_hotspot_connect_states:]
            switch_hotspot_connect_actions = list(button_actions)
            button_actions.clear()
            before_cutover_hotspot_connect_states = len(states)
            pi_command_daemon.handle_command("切去手机热点")
            cutover_hotspot_connect_states = states[before_cutover_hotspot_connect_states:]
            cutover_hotspot_connect_actions = list(button_actions)
            extra_named_hotspot_connect_cases = []
            for prompt in (
                "帮我连PocketEarth-iPhone",
                "帮我连PocketEarth-Android",
                "切到vivo热点",
                "换到vivo热点",
                "我的热点好了",
                "我把热点弄好了",
                "我弄好热点了",
            ):
                button_actions.clear()
                before_extra_named_hotspot_connect_states = len(states)
                pi_command_daemon.handle_command(prompt)
                extra_named_hotspot_connect_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_extra_named_hotspot_connect_states:],
                        "actions": list(button_actions),
                    }
                )
            button_actions.clear()
            before_hotspot_ready_connect_states = len(states)
            pi_command_daemon.handle_command("我手机热点开好了")
            hotspot_ready_connect_states = states[before_hotspot_ready_connect_states:]
            hotspot_ready_connect_actions = list(button_actions)
            button_actions.clear()
            before_hotspot_opened_connect_states = len(states)
            pi_command_daemon.handle_command("热点已经打开了")
            hotspot_opened_connect_states = states[before_hotspot_opened_connect_states:]
            hotspot_opened_connect_actions = list(button_actions)
            button_actions.clear()
            before_phone_hotspot_open_connect_states = len(states)
            pi_command_daemon.handle_command("手机热点开了")
            phone_hotspot_open_connect_states = states[before_phone_hotspot_open_connect_states:]
            phone_hotspot_open_connect_actions = list(button_actions)
            button_actions.clear()
            before_cellular_ready_connect_states = len(states)
            pi_command_daemon.handle_command("手机流量开了")
            cellular_ready_connect_states = states[before_cellular_ready_connect_states:]
            cellular_ready_connect_actions = list(button_actions)
            button_actions.clear()
            before_cellular_ready_done_connect_states = len(states)
            pi_command_daemon.handle_command("手机流量开好了")
            cellular_ready_done_connect_states = states[before_cellular_ready_done_connect_states:]
            cellular_ready_done_connect_actions = list(button_actions)
            button_actions.clear()
            before_phone_network_ready_connect_states = len(states)
            pi_command_daemon.handle_command("手机网络开好了")
            phone_network_ready_connect_states = states[before_phone_network_ready_connect_states:]
            phone_network_ready_connect_actions = list(button_actions)
            button_actions.clear()
            before_phone_cellular_use_connect_states = len(states)
            pi_command_daemon.handle_command("用我手机流量")
            phone_cellular_use_connect_states = states[before_phone_cellular_use_connect_states:]
            phone_cellular_use_connect_actions = list(button_actions)
            button_actions.clear()
            before_my_cellular_use_connect_states = len(states)
            pi_command_daemon.handle_command("用我的流量吧")
            my_cellular_use_connect_states = states[before_my_cellular_use_connect_states:]
            my_cellular_use_connect_actions = list(button_actions)
            button_actions.clear()
            before_my_cellular_route_connect_states = len(states)
            pi_command_daemon.handle_command("走我的流量")
            my_cellular_route_connect_states = states[before_my_cellular_route_connect_states:]
            my_cellular_route_connect_actions = list(button_actions)
            button_actions.clear()
            before_personal_hotspot_route_connect_states = len(states)
            pi_command_daemon.handle_command("走我的个人热点")
            personal_hotspot_route_connect_states = states[before_personal_hotspot_route_connect_states:]
            personal_hotspot_route_connect_actions = list(button_actions)
            button_actions.clear()
            before_phone_network_switch_connect_states = len(states)
            pi_command_daemon.handle_command("换我手机网络")
            phone_network_switch_connect_states = states[before_phone_network_switch_connect_states:]
            phone_network_switch_connect_actions = list(button_actions)
            button_actions.clear()
            before_hotspot_states = len(states)
            pi_command_daemon.handle_command("热点连上了吗")
            hotspot_states = states[before_hotspot_states:]
            hotspot_actions = list(button_actions)
            button_actions.clear()
            before_phone_hotspot_status_states = len(states)
            pi_command_daemon.handle_command("连上我手机了吗")
            phone_hotspot_status_states = states[before_phone_hotspot_status_states:]
            phone_hotspot_status_actions = list(button_actions)
            button_actions.clear()
            before_bare_phone_hotspot_status_states = len(states)
            pi_command_daemon.handle_command("连我的手机了吗")
            bare_phone_hotspot_status_states = states[before_bare_phone_hotspot_status_states:]
            bare_phone_hotspot_status_actions = list(button_actions)
            button_actions.clear()
            before_short_phone_connected_status_states = len(states)
            pi_command_daemon.handle_command("现在连上手机没")
            short_phone_connected_status_states = states[before_short_phone_connected_status_states:]
            short_phone_connected_status_actions = list(button_actions)
            button_actions.clear()
            before_no_not_phone_connected_status_states = len(states)
            pi_command_daemon.handle_command("现在连没连我手机")
            no_not_phone_connected_status_states = states[before_no_not_phone_connected_status_states:]
            no_not_phone_connected_status_actions = list(button_actions)
            button_actions.clear()
            before_direct_no_not_phone_connected_status_states = len(states)
            pi_command_daemon.handle_command("你连没连我手机")
            direct_no_not_phone_connected_status_states = states[
                before_direct_no_not_phone_connected_status_states:
            ]
            direct_no_not_phone_connected_status_actions = list(button_actions)
            button_actions.clear()
            iphone_hotspot_status_cases = []
            for prompt in (
                "连上iPhone了吗",
                "我的iPhone连上了吗",
                "苹果手机连上了吗",
                "iPhone连不上会不会试vivo",
                "PocketEarth-iPhone没找到会不会找vivo",
                "苹果热点没找到会不会再找PocketEarth-Android",
                "先找苹果再找vivo对吗",
                "PocketEarth-iPhone排第一吗",
                "PocketEarth-iPhone是不是排第一",
                "PocketEarth-iPhone优先吗",
            ):
                before_iphone_hotspot_status_states = len(states)
                pi_command_daemon.handle_command(prompt)
                iphone_hotspot_status_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_iphone_hotspot_status_states:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            vivo_hotspot_status_cases = []
            for prompt in (
                "现在接的是vivo吗",
                "连到PocketEarth-Android了吗",
                "PocketEarth-Android连上了吗",
                "PocketEarth-Android排第二吗",
                "PocketEarth-Android是不是排第二",
                "vivo热点排第几",
                "vivo也没找到会不会回家里Wi-Fi",
            ):
                before_vivo_hotspot_status_states = len(states)
                pi_command_daemon.handle_command(prompt)
                vivo_hotspot_status_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_vivo_hotspot_status_states:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_reverse_phone_connected_status_states = len(states)
            pi_command_daemon.handle_command("手机连上了吗")
            reverse_phone_connected_status_states = states[before_reverse_phone_connected_status_states:]
            reverse_phone_connected_status_actions = list(button_actions)
            button_actions.clear()
            before_phone_attached_status_states = len(states)
            pi_command_daemon.handle_command("现在接上手机了吗")
            phone_attached_status_states = states[before_phone_attached_status_states:]
            phone_attached_status_actions = list(button_actions)
            button_actions.clear()
            before_phone_still_attached_status_states = len(states)
            pi_command_daemon.handle_command("现在是不是连着手机")
            phone_still_attached_status_states = states[before_phone_still_attached_status_states:]
            phone_still_attached_status_actions = list(button_actions)
            button_actions.clear()
            before_casual_phone_tether_status_states = len(states)
            pi_command_daemon.handle_command("你现在蹭的是我手机吗")
            casual_phone_tether_status_states = states[before_casual_phone_tether_status_states:]
            casual_phone_tether_status_actions = list(button_actions)
            button_actions.clear()
            before_casual_phone_network_tether_status_states = len(states)
            pi_command_daemon.handle_command("现在蹭我手机网吗")
            casual_phone_network_tether_status_states = states[
                before_casual_phone_network_tether_status_states:
            ]
            casual_phone_network_tether_status_actions = list(button_actions)
            button_actions.clear()
            before_explicit_phone_network_tether_status_states = len(states)
            pi_command_daemon.handle_command("现在是不是蹭我手机网")
            explicit_phone_network_tether_status_states = states[
                before_explicit_phone_network_tether_status_states:
            ]
            explicit_phone_network_tether_status_actions = list(button_actions)
            button_actions.clear()
            before_my_network_tether_status_states = len(states)
            pi_command_daemon.handle_command("你蹭上我的网了吗")
            my_network_tether_status_states = states[before_my_network_tether_status_states:]
            my_network_tether_status_actions = list(button_actions)
            button_actions.clear()
            before_my_hotspot_route_status_states = len(states)
            pi_command_daemon.handle_command("有没有走我的热点")
            my_hotspot_route_status_states = states[before_my_hotspot_route_status_states:]
            my_hotspot_route_status_actions = list(button_actions)
            button_actions.clear()
            ambiguous_hotspot_status_cases = []
            for prompt in (
                "现在是不是走的我手机热点",
                "有没有用上我的热点",
                "现在连的是我手机吗",
                "现在走的是蜂窝吗",
                "现在连的是家里网还是手机热点",
                "现在走家里网还是手机流量",
                "现在还蹭着我的流量吗",
                "还走着我手机网吗",
                "是不是还用着我的个人热点",
                "是不是还连着我的手机",
                "现在是不是还连着我的手机",
                "还连着我的手机吗",
                "连的是vivo还是苹果",
                "现在连的是vivo还是苹果",
            ):
                before_ambiguous_hotspot_status_states = len(states)
                pi_command_daemon.handle_command(prompt)
                ambiguous_hotspot_status_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_ambiguous_hotspot_status_states:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_casual_hotspot_status_states = len(states)
            pi_command_daemon.handle_command("帮我看看热点连上没")
            casual_hotspot_status_states = states[before_casual_hotspot_status_states:]
            casual_hotspot_status_actions = list(button_actions)
            button_actions.clear()
            before_current_phone_hotspot_states = len(states)
            pi_command_daemon.handle_command("现在用的是手机热点吗")
            current_phone_hotspot_states = states[before_current_phone_hotspot_states:]
            current_phone_hotspot_actions = list(button_actions)
            button_actions.clear()
            before_named_hotspot_status_states = len(states)
            pi_command_daemon.handle_command("现在连的是PocketEarth-iPhone吗")
            named_hotspot_status_states = states[before_named_hotspot_status_states:]
            named_hotspot_status_actions = list(button_actions)
            button_actions.clear()
            before_phone_cellular_status_states = len(states)
            pi_command_daemon.handle_command("用上手机流量了吗")
            phone_cellular_status_states = states[before_phone_cellular_status_states:]
            phone_cellular_status_actions = list(button_actions)
            button_actions.clear()
            before_no_not_phone_network_status_states = len(states)
            pi_command_daemon.handle_command("你用没用上我手机网")
            no_not_phone_network_status_states = states[before_no_not_phone_network_status_states:]
            no_not_phone_network_status_actions = list(button_actions)
            button_actions.clear()
            before_phone_cellular_connected_status_states = len(states)
            pi_command_daemon.handle_command("连上手机流量没")
            phone_cellular_connected_status_states = states[before_phone_cellular_connected_status_states:]
            phone_cellular_connected_status_actions = list(button_actions)
            button_actions.clear()
            before_phone_cellular_route_status_states = len(states)
            pi_command_daemon.handle_command("现在走手机流量吗")
            phone_cellular_route_status_states = states[before_phone_cellular_route_status_states:]
            phone_cellular_route_status_actions = list(button_actions)
            button_actions.clear()
            before_cellular_connected_status_states = len(states)
            pi_command_daemon.handle_command("流量连上了吗")
            cellular_connected_status_states = states[before_cellular_connected_status_states:]
            cellular_connected_status_actions = list(button_actions)
            button_actions.clear()
            before_my_phone_cellular_cutover_status_states = len(states)
            pi_command_daemon.handle_command("有没有切到我手机流量")
            my_phone_cellular_cutover_status_states = states[
                before_my_phone_cellular_cutover_status_states:
            ]
            my_phone_cellular_cutover_status_actions = list(button_actions)
            button_actions.clear()
            before_my_cellular_cutover_status_states = len(states)
            pi_command_daemon.handle_command("有没有切到我的流量")
            my_cellular_cutover_status_states = states[before_my_cellular_cutover_status_states:]
            my_cellular_cutover_status_actions = list(button_actions)
            button_actions.clear()
            before_wifi_dropped_status_states = len(states)
            pi_command_daemon.handle_command("Wi-Fi是不是掉了")
            wifi_dropped_status_states = states[before_wifi_dropped_status_states:]
            wifi_dropped_status_actions = list(button_actions)
            button_actions.clear()
            before_wireless_broken_status_states = len(states)
            pi_command_daemon.handle_command("无线是不是断了")
            wireless_broken_status_states = states[before_wireless_broken_status_states:]
            wireless_broken_status_actions = list(button_actions)
            button_actions.clear()
            before_cellular_reachable_status_states = len(states)
            pi_command_daemon.handle_command("手机流量通了吗")
            cellular_reachable_status_states = states[before_cellular_reachable_status_states:]
            cellular_reachable_status_actions = list(button_actions)
            button_actions.clear()
            before_casual_cellular_reachable_status_states = len(states)
            pi_command_daemon.handle_command("流量是不是通了")
            casual_cellular_reachable_status_states = states[before_casual_cellular_reachable_status_states:]
            casual_cellular_reachable_status_actions = list(button_actions)
            button_actions.clear()
            connectivity_probe_status_cases = []
            for prompt in ("帮我看看手机网络通不通", "个人热点通不通", "帮我确认网络恢复没"):
                before_connectivity_probe_status_states = len(states)
                pi_command_daemon.handle_command(prompt)
                connectivity_probe_status_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_connectivity_probe_status_states:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_current_wifi_states = len(states)
            pi_command_daemon.handle_command("现在连的是哪个 Wi-Fi")
            current_wifi_states = states[before_current_wifi_states:]
            current_wifi_actions = list(button_actions)
            button_actions.clear()
            before_current_wifi_use_states = len(states)
            pi_command_daemon.handle_command("现在用哪个Wi-Fi")
            current_wifi_use_states = states[before_current_wifi_use_states:]
            current_wifi_use_actions = list(button_actions)
            button_actions.clear()
            before_current_network_route_states = len(states)
            pi_command_daemon.handle_command("走的是哪个网络")
            current_network_route_states = states[before_current_network_route_states:]
            current_network_route_actions = list(button_actions)
            button_actions.clear()
            before_current_network_card_route_states = len(states)
            pi_command_daemon.handle_command("现在走哪张网")
            current_network_card_route_states = states[before_current_network_card_route_states:]
            current_network_card_route_actions = list(button_actions)
            button_actions.clear()
            before_current_network_card_use_states = len(states)
            pi_command_daemon.handle_command("你现在用哪张网")
            current_network_card_use_states = states[before_current_network_card_use_states:]
            current_network_card_use_actions = list(button_actions)
            button_actions.clear()
            before_outdoor_hotspot_ready_states = len(states)
            pi_command_daemon.handle_command("出门热点准备好了吗")
            outdoor_hotspot_ready_states = states[before_outdoor_hotspot_ready_states:]
            outdoor_hotspot_ready_actions = list(button_actions)
            button_actions.clear()
            before_current_wifi_name_states = len(states)
            pi_command_daemon.handle_command("当前WiFi叫什么")
            current_wifi_name_states = states[before_current_wifi_name_states:]
            current_wifi_name_actions = list(button_actions)
            button_actions.clear()
            before_wifi_which_states = len(states)
            pi_command_daemon.handle_command("Wi-Fi连的哪个")
            wifi_which_states = states[before_wifi_which_states:]
            wifi_which_actions = list(button_actions)
            button_actions.clear()
            before_phone_hotspot_priority_states = len(states)
            pi_command_daemon.handle_command("手机热点现在排第一吗")
            phone_hotspot_priority_states = states[before_phone_hotspot_priority_states:]
            phone_hotspot_priority_actions = list(button_actions)
            button_actions.clear()
            before_network_route_states = len(states)
            pi_command_daemon.handle_command("网络走哪儿")
            network_route_states = states[before_network_route_states:]
            network_route_actions = list(button_actions)
            button_actions.clear()
            home_wifi_status_cases = []
            for prompt in (
                "还在家里Wi-Fi上吗",
                "现在用的还是家里Wi-Fi吗",
                "有没有从家里wifi切出来",
                "现在还在家里网吗",
                "有没有从家庭Wi-Fi切出来",
                "家里网还是手机热点",
            ):
                before_home_wifi_status_states = len(states)
                pi_command_daemon.handle_command(prompt)
                home_wifi_status_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_home_wifi_status_states:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_online_status_states = len(states)
            pi_command_daemon.handle_command("你能上网吗")
            online_status_states = states[before_online_status_states:]
            online_status_actions = list(button_actions)
            button_actions.clear()
            before_online_now_status_states = len(states)
            pi_command_daemon.handle_command("现在还在线吗")
            online_now_status_states = states[before_online_now_status_states:]
            online_now_status_actions = list(button_actions)
            button_actions.clear()
            before_is_online_status_states = len(states)
            pi_command_daemon.handle_command("是不是在线")
            is_online_status_states = states[before_is_online_status_states:]
            is_online_status_actions = list(button_actions)
            button_actions.clear()
            before_connected_network_states = len(states)
            pi_command_daemon.handle_command("现在联网了吗")
            connected_network_states = states[before_connected_network_states:]
            connected_network_actions = list(button_actions)
            button_actions.clear()
            before_network_presence_states = len(states)
            pi_command_daemon.handle_command("现在有没有网")
            network_presence_states = states[before_network_presence_states:]
            network_presence_actions = list(button_actions)
            button_actions.clear()
            before_terse_network_presence_states = len(states)
            pi_command_daemon.handle_command("还有网吗")
            terse_network_presence_states = states[before_terse_network_presence_states:]
            terse_network_presence_actions = list(button_actions)
            button_actions.clear()
            before_terse_network_alive_states = len(states)
            pi_command_daemon.handle_command("网还在吗")
            terse_network_alive_states = states[before_terse_network_alive_states:]
            terse_network_alive_actions = list(button_actions)
            button_actions.clear()
            before_colloquial_network_alive_states = len(states)
            pi_command_daemon.handle_command("网还活着吗")
            colloquial_network_alive_states = states[before_colloquial_network_alive_states:]
            colloquial_network_alive_actions = list(button_actions)
            button_actions.clear()
            before_network_stability_states = len(states)
            pi_command_daemon.handle_command("网络现在稳吗")
            network_stability_states = states[before_network_stability_states:]
            network_stability_actions = list(button_actions)
            button_actions.clear()
            casual_network_quality_cases = []
            for prompt in ("现在网咋样", "现在网络咋样", "网怎么样", "网络怎么样", "网还稳吗"):
                before_casual_network_quality_states = len(states)
                pi_command_daemon.handle_command(prompt)
                casual_network_quality_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_casual_network_quality_states:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_offline_status_states = len(states)
            pi_command_daemon.handle_command("没网了")
            offline_status_states = states[before_offline_status_states:]
            offline_status_actions = list(button_actions)
            button_actions.clear()
            natural_network_outage_status_cases = []
            for prompt in ("网是不是挂了", "网坏了吗", "现在是不是没联网", "你是不是掉线了", "还能不能上网"):
                before_natural_network_outage_status_states = len(states)
                pi_command_daemon.handle_command(prompt)
                natural_network_outage_status_cases.append(
                    {
                        "prompt": prompt,
                        "states": states[before_natural_network_outage_status_states:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_dropped_wifi_repair_states = len(states)
            pi_command_daemon.handle_command("Wi-Fi 掉了，帮我连回热点")
            dropped_wifi_repair_states = states[before_dropped_wifi_repair_states:]
            dropped_wifi_repair_actions = list(button_actions)
            button_actions.clear()
            before_unstable_network_repair_states = len(states)
            pi_command_daemon.handle_command("网络不稳，帮我修一下")
            unstable_network_repair_states = states[before_unstable_network_repair_states:]
            unstable_network_repair_actions = list(button_actions)
            button_actions.clear()
            before_runtime_maintenance_states = len(states)
            pi_command_daemon.handle_command("帮我维护一下")
            runtime_maintenance_states = states[before_runtime_maintenance_states:]
            runtime_maintenance_actions = list(button_actions)
            button_actions.clear()
            text_only_runtime_maintenance_cases = []
            for phrase in ("帮我维护一下只写屏", "清理一下缓存写屏就行"):
                before_case_states = len(states)
                before_case_spoken = len(spoken)
                pi_command_daemon.handle_command(phrase)
                text_only_runtime_maintenance_cases.append(
                    {
                        "phrase": phrase,
                        "states": states[before_case_states:],
                        "spoken": spoken[before_case_spoken:],
                        "actions": list(button_actions),
                    }
                )
                button_actions.clear()
            before_cache_cleanup_states = len(states)
            pi_command_daemon.handle_command("清理一下缓存")
            cache_cleanup_states = states[before_cache_cleanup_states:]
            cache_cleanup_actions = list(button_actions)
            button_actions.clear()
            before_restore_state_states = len(states)
            pi_command_daemon.handle_command("帮我恢复一下状态")
            restore_state_states = states[before_restore_state_states:]
            restore_state_actions = list(button_actions)
            button_actions.clear()
            before_tidy_runtime_states = len(states)
            pi_command_daemon.handle_command("后台收拾一下")
            tidy_runtime_states = states[before_tidy_runtime_states:]
            tidy_runtime_actions = list(button_actions)
            button_actions.clear()
            before_self_repair_states = len(states)
            pi_command_daemon.handle_command("你自己修复一下")
            self_repair_states = states[before_self_repair_states:]
            self_repair_actions = list(button_actions)

            pi_command_daemon.player_active = lambda: False
            pi_command_daemon.playlist = [{"title": "Stale Song", "artist": "Old", "cityNameZh": "旧城市", "citySlug": "old"}]
            pi_command_daemon.current_index = 12
            audio_mode.save_audio_mode("soft_mute", reason="button smoke", path=mode_path)
            button_actions.clear()
            before_button_radio_states = len(states)
            pi_command_daemon.toggle_audio_from_button()
            button_radio_state = audio_mode.load_audio_mode(path=mode_path)
            button_radio_states = states[before_button_radio_states:]
            button_radio_actions = list(button_actions)
            button_radio_titles = [track.get("title") for track in pi_command_daemon.playlist]
            button_radio_index = pi_command_daemon.current_index

            pi_command_daemon.player_active = lambda: True
            audio_mode.save_audio_mode("radio", reason="button smoke", path=mode_path)
            button_actions.clear()
            before_button_pause_states = len(states)
            pi_command_daemon.toggle_audio_from_button()
            button_pause_state = audio_mode.load_audio_mode(path=mode_path)
            button_pause_states = states[before_button_pause_states:]
            button_pause_actions = list(button_actions)

            audio_mode.save_audio_mode("hard_mute", reason="smoke", path=mode_path)
            hard_ok = pi_command_daemon.publish_wake("弗洛斯特")
            hard_state = audio_mode.load_audio_mode(path=mode_path)
    finally:
        pi_command_daemon.publish_state = original_publish_state
        pi_command_daemon.speak_text = original_speak_text
        pi_command_daemon.load_audio_mode = original_load_audio_mode
        pi_command_daemon.save_audio_mode = original_save_audio_mode
        pi_command_daemon.match_city = original_match_city
        pi_command_daemon.switch_city = original_switch_city
        pi_command_daemon.WAKE_AMBIENT_SCAN = original_wake_scan
        pi_command_daemon.player_active = original_player_active
        pi_command_daemon.stop_player = original_stop_player
        pi_command_daemon.play_next = original_play_next
        pi_command_daemon.hop_city = original_hop_city
        pi_command_daemon.apply_cloud_agent = original_apply_cloud_agent
        pi_command_daemon.adjust_radio_volume = original_adjust_radio_volume
        pi_command_daemon.ensure_radio_audio_output = original_ensure_radio_audio_output
        pi_command_daemon.trigger_wifi_failover_from_button = original_trigger_wifi_failover
        pi_command_daemon.shutil.which = original_shutil_which
        pi_command_daemon.subprocess.run = original_subprocess_run
        pi_command_daemon.VOLUME_STATE_PATH = original_volume_state_path
        pi_command_daemon.playlist = original_playlist
        pi_command_daemon.current_index = original_current_index
        pi_command_daemon.catalog = original_catalog
        pi_command_daemon.collect_device_status = original_collect_device_status
        pi_command_daemon.collect_button_doctor = original_collect_button_doctor
        pi_command_daemon.collect_capability_doctor = original_collect_capability_doctor
        pi_command_daemon.collect_deploy_doctor = original_collect_deploy_doctor
        pi_command_daemon.collect_boot_doctor = original_collect_boot_doctor
        pi_command_daemon.collect_battery_doctor = original_collect_battery_doctor
        pi_command_daemon.collect_queue_doctor = original_collect_queue_doctor
        pi_command_daemon.collect_service_doctor = original_collect_service_doctor
        pi_command_daemon.collect_runtime_maintenance = original_collect_runtime_maintenance
        pi_command_daemon.collect_tts_doctor = original_collect_tts_doctor
        pi_command_daemon.collect_screen_doctor = original_collect_screen_doctor
        pi_command_daemon.collect_voice_doctor = original_collect_voice_doctor
        pi_command_daemon.collect_camera_status = original_collect_camera_status
        pi_command_daemon.collect_camera_doctor = original_collect_camera_doctor
        pi_command_daemon.load_ambient_mode = original_load_ambient_mode
        pi_command_daemon.save_ambient_mode = original_save_ambient_mode
        pi_command_daemon.build_ambient_privacy_report = original_build_ambient_privacy_report
        pi_command_daemon.observe_once = original_observe_once
        pi_command_daemon.memory_report = original_memory_report
        pi_command_daemon.build_ambient_plan = original_build_ambient_plan
        pi_command_daemon.save_ambient_policy = original_save_ambient_policy
        pi_command_daemon.LAST_PUBLISHED_STATE = original_last_published_state
        pi_command_daemon.LAST_VOICE_TEXT = original_last_voice_text

    def queue_doctor_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "Queue doctor"
                and state.get("city") == "命令队列"
                and state.get("track") == "pending 1"
                and "队列还有待处理命令" in str(state.get("message") or "")
                and "voice:1" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def screen_doctor_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "Screen doctor"
                and state.get("city") == "屏幕医生"
                and state.get("track") == "Whisplay"
                and "Whisplay 屏幕正常" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def button_doctor_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "Button doctor"
                and state.get("city") == "按键医生"
                and state.get("track") == "切换声音"
                and "待机/静音长按" in str(state.get("message") or "")
                and "手机热点" in str(state.get("message") or "")
                and "播放当前日落城市" in str(state.get("message") or "")
                and "播放中长按" in str(state.get("message") or "")
                and "安静待命" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def service_doctor_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "Service doctor"
                and state.get("city") == "后台服务"
                and state.get("track") == "needs 1"
                and "服务医生发现需要复查" in str(state.get("message") or "")
                and "sunset-radio-voice" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def tts_doctor_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "TTS doctor"
                and state.get("city") == "语音回复"
                and state.get("track") == "speech-02-turbo"
                and "TTS 链路已待命" in str(state.get("message") or "")
                and "当前仍保持静音" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def deploy_doctor_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "Deploy doctor"
                and state.get("city") == "部署医生"
                and state.get("track") == "ok"
                and "部署指向一致" in str(state.get("message") or "")
                and "服务入口都在位" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def boot_doctor_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "Boot doctor"
                and state.get("city") == "开机医生"
                and state.get("track") == "running"
                and "开机服务链路在线" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def portable_briefing_case(name, case_states, case_actions):
        return {
            "name": name,
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in case_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions),
            "detail": {"states": case_states, "actions": case_actions},
        }

    def soft_mute_boundary_state(case_states):
        return any(
            state.get("label") == "静音中"
            and state.get("city") == "声音入口"
            and state.get("track") == "安静待命"
            and "当前只回屏幕" in str(state.get("message") or "")
            and "叫我“弗洛斯特”" in str(state.get("message") or "")
            for state in case_states
        )

    def radio_boundary_state(case_states):
        return any(
            state.get("label") == "声音状态"
            and state.get("city") == "声音入口"
            and state.get("track") == "电台播放"
            and "当前允许电台外放" in str(state.get("message") or "")
            and "明确点歌" in str(state.get("message") or "")
            for state in case_states
        )

    cases = [
        {
            "name": "wake returns true when dialog mode opens",
            "passed": wake_ok is True and wake_state.get("mode") == "dialog",
        },
        {
            "name": "wake says a short greeting",
            "passed": "你好，我在。" in spoken,
        },
        {
            "name": "inline wake command forwards the tail after wake",
            "passed": inline_handled == ["东京"],
            "detail": inline_handled,
        },
        {
            "name": "luo/ro homophone inline wake forwards the tail after wake",
            "passed": ro_inline_handled == ["东京"],
            "detail": ro_inline_handled,
        },
        {
            "name": "fo-luo ASR wake forwards the tail after wake",
            "passed": fo_luo_inline_handled == ["东京"],
            "detail": fo_luo_inline_handled,
        },
        {
            "name": "fo-ro ASR wake forwards the tail after wake",
            "passed": fo_ro_inline_handled == ["东京"],
            "detail": fo_ro_inline_handled,
        },
        {
            "name": "fu-luo homophone inline wake forwards the tail after wake",
            "passed": fu_inline_handled == ["东京"],
            "detail": fu_inline_handled,
        },
        {
            "name": "thinking-sound ASR wake forwards the tail after wake",
            "passed": thinking_inline_handled == ["东京"],
            "detail": thinking_inline_handled,
        },
        {
            "name": "dropped-si inline wake forwards the tail after wake",
            "passed": dropped_si_inline_handled == ["东京"],
            "detail": dropped_si_inline_handled,
        },
        {
            "name": "silk-sound inline wake command forwards the tail after wake",
            "passed": silk_inline_handled == ["东京"],
            "detail": silk_inline_handled,
        },
        {
            "name": "de-suffix inline wake command forwards the tail after wake",
            "passed": de_suffix_inline_handled == ["东京"],
            "detail": de_suffix_inline_handled,
        },
        {
            "name": "full de-suffix inline wake command forwards the tail after wake",
            "passed": full_de_suffix_inline_handled == ["东京"],
            "detail": full_de_suffix_inline_handled,
        },
        {
            "name": "small de-suffix inline wake command forwards the tail after wake",
            "passed": small_de_suffix_inline_handled == ["东京"],
            "detail": small_de_suffix_inline_handled,
        },
        {
            "name": "small full de-suffix inline wake command forwards the tail after wake",
            "passed": small_full_de_suffix_inline_handled == ["东京"],
            "detail": small_full_de_suffix_inline_handled,
        },
        {
            "name": "Chinese hey inline wake forwards the tail after wake",
            "passed": hey_inline_handled == ["东京"],
            "detail": hey_inline_handled,
        },
        {
            "name": "Chinese hi de-suffix inline wake forwards the tail after wake",
            "passed": hi_de_suffix_inline_handled == ["东京"],
            "detail": hi_de_suffix_inline_handled,
        },
        {
            "name": "spoken-particle inline wake forwards the tail after wake",
            "passed": particle_inline_handled == ["东京"],
            "detail": particle_inline_handled,
        },
        {
            "name": "spoken DJ particle inline wake forwards the tail after wake",
            "passed": spoken_dj_particle_inline_handled == ["东京"],
            "detail": spoken_dj_particle_inline_handled,
        },
        {
            "name": "product particle inline wake forwards the tail after wake",
            "passed": product_particle_inline_handled == ["东京"],
            "detail": product_particle_inline_handled,
        },
        {
            "name": "product-name wake forwards the tail after wake",
            "passed": product_wake_handled == ["东京"],
            "detail": product_wake_handled,
        },
        {
            "name": "spoken Chinese DJ wake forwards the tail after wake",
            "passed": spoken_dj_handled == ["东京"],
            "detail": spoken_dj_handled,
        },
        {
            "name": "fu nickname inline wake forwards the tail after wake",
            "passed": small_fu_nickname_inline_handled == ["东京"],
            "detail": small_fu_nickname_inline_handled,
        },
        {
            "name": "prefixed fu nickname inline wake forwards the tail after wake",
            "passed": hey_fu_nickname_inline_handled == ["东京"],
            "detail": hey_fu_nickname_inline_handled,
        },
        {
            "name": "terse wake phrases pass the wake parser",
            "passed": all(tail is not None for tail in terse_wake_tails.values()),
            "detail": terse_wake_tails,
        },
        {
            "name": "greeting command answers without becoming a DJ request",
            "passed": "我在。" in spoken and any(state.get("label") == "对话待命" for state in states),
        },
        {
            "name": "unlock misrecognition opens dialog mode",
            "passed": unlock_state.get("mode") == "dialog",
            "detail": unlock_state,
        },
        {
            "name": "open-sound misrecognition opens radio mode",
            "passed": radio_state.get("mode") == "radio" and "电台声音已打开。" in spoken,
            "detail": radio_state,
        },
        {
            "name": "cancel-mute phrase opens radio mode",
            "passed": cancel_mute_state.get("mode") == "radio" and "电台声音已打开。" in cancel_mute_spoken,
            "detail": {"state": cancel_mute_state, "spoken": cancel_mute_spoken},
        },
        {
            "name": "restore-audio phrase opens radio mode",
            "passed": restore_audio_state.get("mode") == "radio" and "电台声音已打开。" in restore_audio_spoken,
            "detail": {"state": restore_audio_state, "spoken": restore_audio_spoken},
        },
        {
            "name": "bring-sound-back phrase resumes playback",
            "passed": bring_sound_back_state.get("mode") == "radio"
            and "audio_output" in bring_sound_back_actions
            and "play_next:0" in bring_sound_back_actions,
            "detail": {"state": bring_sound_back_state, "spoken": bring_sound_back_spoken, "actions": bring_sound_back_actions},
        },
        {
            "name": "keep-sounding phrase opens radio mode",
            "passed": keep_sounding_state.get("mode") == "radio" and "电台声音已打开。" in keep_sounding_spoken,
            "detail": {"state": keep_sounding_state, "spoken": keep_sounding_spoken},
        },
        {
            "name": "dialog-only unmute phrase opens dialog mode",
            "passed": dialog_unmute_state.get("mode") == "dialog" and "我在。" in dialog_unmute_spoken,
            "detail": {"state": dialog_unmute_state, "spoken": dialog_unmute_spoken},
        },
        {
            "name": "can-speak phrase opens dialog mode without playback",
            "passed": can_speak_state.get("mode") == "dialog"
            and "我在。" in can_speak_spoken
            and not any(action.startswith("play_next:") or action == "audio_output" for action in can_speak_actions),
            "detail": {"state": can_speak_state, "spoken": can_speak_spoken, "actions": can_speak_actions},
        },
        {
            "name": "can-talk phrase opens dialog mode without playback",
            "passed": can_talk_state.get("mode") == "dialog"
            and "我在。" in can_talk_spoken
            and not any(action.startswith("play_next:") or action == "audio_output" for action in can_talk_actions),
            "detail": {"state": can_talk_state, "spoken": can_talk_spoken, "actions": can_talk_actions},
        },
        {
            "name": "start-talking phrase opens dialog mode without playback",
            "passed": start_talking_state.get("mode") == "dialog"
            and "我在。" in start_talking_spoken
            and not any(action.startswith("play_next:") or action == "audio_output" for action in start_talking_actions),
            "detail": {"state": start_talking_state, "spoken": start_talking_spoken, "actions": start_talking_actions},
        },
        {
            "name": "speak-now phrase opens dialog mode without playback",
            "passed": speak_now_state.get("mode") == "dialog"
            and "我在。" in speak_now_spoken
            and not any(action.startswith("play_next:") or action == "audio_output" for action in speak_now_actions),
            "detail": {"state": speak_now_state, "spoken": speak_now_spoken, "actions": speak_now_actions},
        },
        {
            "name": "natural start-radio phrase opens radio mode and starts playback",
            "passed": natural_radio_state.get("mode") == "radio"
            and "audio_output" in natural_radio_actions
            and "play_next:0" in natural_radio_actions,
            "detail": {"state": natural_radio_state, "spoken": natural_radio_spoken, "actions": natural_radio_actions},
        },
        {
            "name": "natural resume-music phrase opens radio mode and starts playback",
            "passed": resume_radio_state.get("mode") == "radio"
            and "audio_output" in resume_radio_actions
            and "play_next:0" in resume_radio_actions,
            "detail": {"state": resume_radio_state, "actions": resume_radio_actions},
        },
        {
            "name": "terse resume phrases open radio mode and start playback",
            "passed": all(
                state.get("mode") == "radio"
                and "audio_output" in actions
                and "play_next:0" in actions
                and "play_next:-1" not in actions
                for state, actions in [
                    (terse_resume_broadcast_state, terse_resume_broadcast_actions),
                    (terse_resume_singing_state, terse_resume_singing_actions),
                    (terse_resume_play_state, terse_resume_play_actions),
                ]
            ),
            "detail": {
                "broadcast": {"state": terse_resume_broadcast_state, "actions": terse_resume_broadcast_actions},
                "singing": {"state": terse_resume_singing_state, "actions": terse_resume_singing_actions},
                "play": {"state": terse_resume_play_state, "actions": terse_resume_play_actions},
            },
        },
        {
            "name": "terse follow-up phrases open radio mode and start playback",
            "passed": all(
                state.get("mode") == "radio"
                and "audio_output" in actions
                and "play_next:0" in actions
                and "play_next:-1" not in actions
                for state, actions in [
                    (terse_followup_broadcast_state, terse_followup_broadcast_actions),
                    (terse_followup_singing_state, terse_followup_singing_actions),
                    (terse_followup_play_state, terse_followup_play_actions),
                ]
            ),
            "detail": {
                "broadcast": {"state": terse_followup_broadcast_state, "actions": terse_followup_broadcast_actions},
                "singing": {"state": terse_followup_singing_state, "actions": terse_followup_singing_actions},
                "play": {"state": terse_followup_play_state, "actions": terse_followup_play_actions},
            },
        },
        {
            "name": "casual continue-listening phrase opens radio mode and starts playback",
            "passed": continue_listening_state.get("mode") == "radio"
            and "audio_output" in continue_listening_actions
            and "play_next:0" in continue_listening_actions,
            "detail": {"state": continue_listening_state, "actions": continue_listening_actions},
        },
        {
            "name": "continue-previous-song phrase opens radio mode and starts playback",
            "passed": continue_previous_song_state.get("mode") == "radio"
            and "audio_output" in continue_previous_song_actions
            and "play_next:0" in continue_previous_song_actions,
            "detail": {"state": continue_previous_song_state, "actions": continue_previous_song_actions},
        },
        {
            "name": "continue-that-song phrase opens radio mode without previous-track skip",
            "passed": continue_that_song_state.get("mode") == "radio"
            and "audio_output" in continue_that_song_actions
            and "play_next:0" in continue_that_song_actions
            and "play_next:-1" not in continue_that_song_actions,
            "detail": {"state": continue_that_song_state, "actions": continue_that_song_actions},
        },
        {
            "name": "continue-just-now-song phrase opens radio mode without previous-track skip",
            "passed": continue_just_now_song_state.get("mode") == "radio"
            and "audio_output" in continue_just_now_song_actions
            and "play_next:0" in continue_just_now_song_actions
            and "play_next:-1" not in continue_just_now_song_actions,
            "detail": {"state": continue_just_now_song_state, "actions": continue_just_now_song_actions},
        },
        {
            "name": "continue-previous-music phrase opens radio mode and starts playback",
            "passed": continue_previous_music_state.get("mode") == "radio"
            and "audio_output" in continue_previous_music_actions
            and "play_next:0" in continue_previous_music_actions,
            "detail": {"state": continue_previous_music_state, "actions": continue_previous_music_actions},
        },
        {
            "name": "natural comeback resume phrases open radio mode and start playback",
            "passed": all(
                state.get("mode") == "radio"
                and "audio_output" in actions
                and "play_next:0" in actions
                and "play_next:-1" not in actions
                for state, actions in [
                    (music_comeback_state, music_comeback_actions),
                    (bring_sound_back_state, bring_sound_back_actions),
                    (restore_previous_radio_state, restore_previous_radio_actions),
                    (previous_track_continue_state, previous_track_continue_actions),
                ]
            ),
            "detail": {
                "music_comeback": {"state": music_comeback_state, "actions": music_comeback_actions},
                "bring_sound_back": {"state": bring_sound_back_state, "actions": bring_sound_back_actions},
                "restore_previous_radio": {"state": restore_previous_radio_state, "actions": restore_previous_radio_actions},
                "previous_track_continue": {"state": previous_track_continue_state, "actions": previous_track_continue_actions},
            },
        },
        {
            "name": "reopen-music phrase opens radio mode and starts playback",
            "passed": reopen_music_state.get("mode") == "radio"
            and "audio_output" in reopen_music_actions
            and "play_next:0" in reopen_music_actions,
            "detail": {"state": reopen_music_state, "actions": reopen_music_actions},
        },
        {
            "name": "reopen-radio filler phrase opens radio mode and starts playback",
            "passed": reopen_radio_filler_state.get("mode") == "radio"
            and "audio_output" in reopen_radio_filler_actions
            and "play_next:0" in reopen_radio_filler_actions,
            "detail": {"state": reopen_radio_filler_state, "actions": reopen_radio_filler_actions},
        },
        {
            "name": "hard mute blocks natural start-radio playback",
            "passed": hard_start_state.get("mode") == "hard_mute"
            and hard_start_actions == []
            and hard_start_spoken == []
            and any(
                state.get("label") == "静音中"
                and state.get("track") == "硬静音"
                and "不会自动开始播放" in str(state.get("message") or "")
                for state in hard_start_states
            ),
            "detail": {"state": hard_start_state, "states": hard_start_states, "actions": hard_start_actions, "spoken": hard_start_spoken},
        },
        {
            "name": "natural city play phrase still switches city",
            "passed": natural_city_handled == ["东京"],
            "detail": natural_city_handled,
        },
        {
            "name": "colloquial city play phrase switches city",
            "passed": colloquial_city_handled == ["东京"],
            "detail": colloquial_city_handled,
        },
        {
            "name": "colloquial one-song city play phrase switches city",
            "passed": arrange_one_city_handled == ["东京"],
            "detail": arrange_one_city_handled,
        },
        {
            "name": "city switch gate ignores city questions",
            "passed": city_gate
            == {
                "bare_zh": True,
                "bare_en": True,
                "play_city": True,
                "colloquial_play_city": True,
                "colloquial_one_song": True,
                "colloquial_non_song": False,
                "negative_arrange": False,
                "city_time": False,
                "city_question": False,
                "negative": False,
                "negative_go": False,
                "visit_question": False,
            },
            "detail": city_gate,
        },
        {
            "name": "no-speaking phrase enters soft mute",
            "passed": quiet_speech_state.get("mode") == "soft_mute"
            and quiet_speech_state.get("reason") == "user soft mute",
            "detail": quiet_speech_state,
        },
        {
            "name": "natural no-talking phrase enters soft mute",
            "passed": natural_quiet_speech_state.get("mode") == "soft_mute"
            and natural_quiet_speech_state.get("reason") == "user soft mute",
            "detail": natural_quiet_speech_state,
        },
        {
            "name": "casual no-talking phrase enters soft mute",
            "passed": casual_no_talking_state.get("mode") == "soft_mute"
            and casual_no_talking_state.get("reason") == "user soft mute",
            "detail": casual_no_talking_state,
        },
        {
            "name": "no-open-mouth phrase enters soft mute without unmuting",
            "passed": no_open_mouth_state.get("mode") == "soft_mute"
            and no_open_mouth_state.get("reason") == "user soft mute"
            and no_open_mouth_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_open_mouth_actions)
            and any("安静待命" in str(state.get("message") or "") for state in no_open_mouth_states),
            "detail": {
                "state": no_open_mouth_state,
                "states": no_open_mouth_states,
                "spoken": no_open_mouth_spoken,
                "actions": no_open_mouth_actions,
            },
        },
        {
            "name": "no-sound-emission phrase enters soft mute without actions",
            "passed": no_sound_emission_state.get("mode") == "soft_mute"
            and no_sound_emission_state.get("reason") == "user soft mute"
            and no_sound_emission_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_sound_emission_actions)
            and any("安静待命" in str(state.get("message") or "") for state in no_sound_emission_states),
            "detail": {
                "state": no_sound_emission_state,
                "states": no_sound_emission_states,
                "spoken": no_sound_emission_spoken,
                "actions": no_sound_emission_actions,
            },
        },
        {
            "name": "no-disturb-others phrase enters soft mute without actions",
            "passed": no_disturb_others_state.get("mode") == "soft_mute"
            and no_disturb_others_state.get("reason") == "user soft mute"
            and no_disturb_others_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_disturb_others_actions)
            and any("安静待命" in str(state.get("message") or "") for state in no_disturb_others_states),
            "detail": {
                "state": no_disturb_others_state,
                "states": no_disturb_others_states,
                "spoken": no_disturb_others_spoken,
                "actions": no_disturb_others_actions,
            },
        },
        {
            "name": "hush phrase enters soft mute without actions",
            "passed": hush_voice_state.get("mode") == "soft_mute"
            and hush_voice_state.get("reason") == "user soft mute"
            and hush_voice_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in hush_voice_actions)
            and any("安静待命" in str(state.get("message") or "") for state in hush_voice_states),
            "detail": {
                "state": hush_voice_state,
                "states": hush_voice_states,
                "spoken": hush_voice_spoken,
                "actions": hush_voice_actions,
            },
        },
        {
            "name": "casual do-not-bother phrase enters soft mute without actions",
            "passed": casual_quiet_state.get("mode") == "soft_mute"
            and casual_quiet_state.get("reason") == "user soft mute"
            and casual_quiet_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_quiet_actions)
            and any("安静待命" in str(state.get("message") or "") for state in casual_quiet_states),
            "detail": {
                "state": casual_quiet_state,
                "states": casual_quiet_states,
                "spoken": casual_quiet_spoken,
                "actions": casual_quiet_actions,
            },
        },
        {
            "name": "casual no-noise phrase enters soft mute without actions",
            "passed": casual_no_noise_state.get("mode") == "soft_mute"
            and casual_no_noise_state.get("reason") == "user soft mute"
            and casual_no_noise_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_no_noise_actions)
            and any("安静待命" in str(state.get("message") or "") for state in casual_no_noise_states),
            "detail": {
                "state": casual_no_noise_state,
                "states": casual_no_noise_states,
                "spoken": casual_no_noise_spoken,
                "actions": casual_no_noise_actions,
            },
        },
        {
            "name": "private-listener phrase enters text-only mode without actions",
            "passed": private_listener_state.get("mode") == "soft_mute"
            and private_listener_state.get("reason") == "user text only"
            and private_listener_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in private_listener_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in private_listener_states),
            "detail": {
                "state": private_listener_state,
                "states": private_listener_states,
                "spoken": private_listener_spoken,
                "actions": private_listener_actions,
            },
        },
        {
            "name": "terse private-listener phrase enters soft mute without actions",
            "passed": terse_private_listener_state.get("mode") == "soft_mute"
            and terse_private_listener_state.get("reason") == "user soft mute"
            and terse_private_listener_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in terse_private_listener_actions)
            and any("安静待命" in str(state.get("message") or "") for state in terse_private_listener_states),
            "detail": {
                "state": terse_private_listener_state,
                "states": terse_private_listener_states,
                "spoken": terse_private_listener_spoken,
                "actions": terse_private_listener_actions,
            },
        },
        {
            "name": "public-listener phrase enters soft mute without actions",
            "passed": public_listener_state.get("mode") == "soft_mute"
            and public_listener_state.get("reason") == "user soft mute"
            and public_listener_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in public_listener_actions)
            and any("安静待命" in str(state.get("message") or "") for state in public_listener_states),
            "detail": {
                "state": public_listener_state,
                "states": public_listener_states,
                "spoken": public_listener_spoken,
                "actions": public_listener_actions,
            },
        },
        {
            "name": "venue-listener phrase enters soft mute without actions",
            "passed": venue_listener_state.get("mode") == "soft_mute"
            and venue_listener_state.get("reason") == "user soft mute"
            and venue_listener_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in venue_listener_actions)
            and any("安静待命" in str(state.get("message") or "") for state in venue_listener_states),
            "detail": {
                "state": venue_listener_state,
                "states": venue_listener_states,
                "spoken": venue_listener_spoken,
                "actions": venue_listener_actions,
            },
        },
        {
            "name": "sleeping-child phrase enters soft mute without actions",
            "passed": child_sleep_state.get("mode") == "soft_mute"
            and child_sleep_state.get("reason") == "user soft mute"
            and child_sleep_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in child_sleep_actions)
            and any("安静待命" in str(state.get("message") or "") for state in child_sleep_states),
            "detail": {
                "state": child_sleep_state,
                "states": child_sleep_states,
                "spoken": child_sleep_spoken,
                "actions": child_sleep_actions,
            },
        },
        {
            "name": "no-autoplay phrase enters soft mute without actions",
            "passed": no_autoplay_state.get("mode") == "soft_mute"
            and no_autoplay_state.get("reason") == "user soft mute"
            and no_autoplay_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_autoplay_actions)
            and any("安静待命" in str(state.get("message") or "") for state in no_autoplay_states),
            "detail": {
                "state": no_autoplay_state,
                "states": no_autoplay_states,
                "spoken": no_autoplay_spoken,
                "actions": no_autoplay_actions,
            },
        },
        {
            "name": "no-surprise-play phrase enters soft mute without actions",
            "passed": no_surprise_play_state.get("mode") == "soft_mute"
            and no_surprise_play_state.get("reason") == "user soft mute"
            and no_surprise_play_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_surprise_play_actions)
            and any("安静待命" in str(state.get("message") or "") for state in no_surprise_play_states),
            "detail": {
                "state": no_surprise_play_state,
                "states": no_surprise_play_states,
                "spoken": no_surprise_play_spoken,
                "actions": no_surprise_play_actions,
            },
        },
        {
            "name": "negative playback action phrases do not trigger player or audio unlock",
            "passed": all(
                case["mode"].get("mode") == "soft_mute"
                and case["spoken"] == []
                and not any(
                    action.startswith("play_next:")
                    or action.startswith("hop_city:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                and any(
                    state.get("city") == "音乐DJ"
                    and state.get("track") == "未执行播放动作"
                    and "不会切歌或恢复播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                for case in negative_playback_action_cases
            ),
            "detail": negative_playback_action_cases,
        },
        {
            "name": "negative playback query phrases answer without changing playback",
            "passed": all(
                any(
                    state.get("label") == case["expectedLabel"]
                    and state.get("track") != "未执行播放动作"
                    and "不会切歌或恢复播放" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] != []
                and not any(
                    action.startswith("play_next:")
                    or action.startswith("hop_city:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in negative_playback_query_cases
            ),
            "detail": negative_playback_query_cases,
        },
        {
            "name": "quiet-prefixed command intents answer content without speech",
            "passed": all(
                any(
                    state.get("city") == case["expectedCity"]
                    and case["expectedMessage"] in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and case["actions"] == case["expectedActions"]
                for case in quiet_prefixed_command_cases
            ),
            "detail": quiet_prefixed_command_cases,
        },
        {
            "name": "quiet-suffixed command intents answer content without speech",
            "passed": all(
                any(
                    state.get("city") == case["expectedCity"]
                    and case["expectedMessage"] in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in quiet_suffixed_command_cases
            ),
            "detail": quiet_suffixed_command_cases,
        },
        {
            "name": "quiet-suffixed hotspot commands trigger failover without speech",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "手机热点" in str(state.get("track") or "")
                    and "正在尝试手机热点" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and "wifi_failover" in case["actions"]
                and "play_next:0" not in case["actions"]
                for case in quiet_suffixed_hotspot_connect_cases
            ),
            "detail": quiet_suffixed_hotspot_connect_cases,
        },
        {
            "name": "text-only phrase enters soft mute without speaking",
            "passed": text_only_state.get("mode") == "soft_mute"
            and text_only_state.get("reason") == "user text only"
            and text_only_spoken == []
            and any("屏幕回复" in str(state.get("message") or "") for state in text_only_states),
            "detail": {"state": text_only_state, "states": text_only_states, "spoken": text_only_spoken},
        },
        {
            "name": "short text-only phrase enters soft mute without speaking or actions",
            "passed": short_text_only_state.get("mode") == "soft_mute"
            and short_text_only_state.get("reason") == "user text only"
            and short_text_only_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_text_only_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in short_text_only_states),
            "detail": {
                "state": short_text_only_state,
                "states": short_text_only_states,
                "spoken": short_text_only_spoken,
                "actions": short_text_only_actions,
            },
        },
        {
            "name": "post-text phrase enters soft mute without speaking or actions",
            "passed": post_text_only_state.get("mode") == "soft_mute"
            and post_text_only_state.get("reason") == "user text only"
            and post_text_only_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in post_text_only_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in post_text_only_states),
            "detail": {
                "state": post_text_only_state,
                "states": post_text_only_states,
                "spoken": post_text_only_spoken,
                "actions": post_text_only_actions,
            },
        },
        {
            "name": "typing-only phrase enters soft mute without speaking",
            "passed": typing_only_state.get("mode") == "soft_mute"
            and typing_only_state.get("reason") == "user text only"
            and typing_only_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in typing_only_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in typing_only_states),
            "detail": {
                "state": typing_only_state,
                "states": typing_only_states,
                "spoken": typing_only_spoken,
                "actions": typing_only_actions,
            },
        },
        {
            "name": "typing-tell phrase enters soft mute without speaking or actions",
            "passed": typing_tell_state.get("mode") == "soft_mute"
            and typing_tell_state.get("reason") == "user text only"
            and typing_tell_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in typing_tell_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in typing_tell_states),
            "detail": {
                "state": typing_tell_state,
                "states": typing_tell_states,
                "spoken": typing_tell_spoken,
                "actions": typing_tell_actions,
            },
        },
        {
            "name": "quiet-text reply phrase enters soft mute without speaking",
            "passed": quiet_text_reply_state.get("mode") == "soft_mute"
            and quiet_text_reply_state.get("reason") == "user text only"
            and quiet_text_reply_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in quiet_text_reply_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in quiet_text_reply_states),
            "detail": {
                "state": quiet_text_reply_state,
                "states": quiet_text_reply_states,
                "spoken": quiet_text_reply_spoken,
                "actions": quiet_text_reply_actions,
            },
        },
        {
            "name": "whisper-text reply phrase enters soft mute without speaking",
            "passed": whisper_text_reply_state.get("mode") == "soft_mute"
            and whisper_text_reply_state.get("reason") == "user text only"
            and whisper_text_reply_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in whisper_text_reply_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in whisper_text_reply_states),
            "detail": {
                "state": whisper_text_reply_state,
                "states": whisper_text_reply_states,
                "spoken": whisper_text_reply_spoken,
                "actions": whisper_text_reply_actions,
            },
        },
        {
            "name": "screen-only no-reading phrase enters soft mute without speaking",
            "passed": screen_only_state.get("mode") == "soft_mute"
            and screen_only_state.get("reason") == "user text only"
            and screen_only_spoken == []
            and any("不朗读" in str(state.get("message") or "") for state in screen_only_states),
            "detail": {"state": screen_only_state, "states": screen_only_states, "spoken": screen_only_spoken},
        },
        {
            "name": "screen-tell phrase enters text-only mode without speaking",
            "passed": screen_tell_state.get("mode") == "soft_mute"
            and screen_tell_state.get("reason") == "user text only"
            and screen_tell_spoken == []
            and any("屏幕回复" in str(state.get("message") or "") for state in screen_tell_states),
            "detail": {"state": screen_tell_state, "states": screen_tell_states, "spoken": screen_tell_spoken},
        },
        {
            "name": "casual screen-tell phrase enters text-only mode without speaking or actions",
            "passed": screen_tell_casual_state.get("mode") == "soft_mute"
            and screen_tell_casual_state.get("reason") == "user text only"
            and screen_tell_casual_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in screen_tell_casual_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in screen_tell_casual_states),
            "detail": {
                "state": screen_tell_casual_state,
                "states": screen_tell_casual_states,
                "spoken": screen_tell_casual_spoken,
                "actions": screen_tell_casual_actions,
            },
        },
        {
            "name": "direct screen-reply phrase enters text-only mode without speaking or actions",
            "passed": screen_reply_direct_state.get("mode") == "soft_mute"
            and screen_reply_direct_state.get("reason") == "user text only"
            and screen_reply_direct_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in screen_reply_direct_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in screen_reply_direct_states),
            "detail": {
                "state": screen_reply_direct_state,
                "states": screen_reply_direct_states,
                "spoken": screen_reply_direct_spoken,
                "actions": screen_reply_direct_actions,
            },
        },
        {
            "name": "casual screen-say phrase enters text-only mode without speaking or playback/network actions",
            "passed": screen_say_casual_state.get("mode") == "soft_mute"
            and screen_say_casual_state.get("reason") == "user text only"
            and screen_say_casual_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in screen_say_casual_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in screen_say_casual_states),
            "detail": {
                "state": screen_say_casual_state,
                "states": screen_say_casual_states,
                "spoken": screen_say_casual_spoken,
                "actions": screen_say_casual_actions,
            },
        },
        {
            "name": "screen-post phrase enters text-only mode without speaking or playback/network actions",
            "passed": screen_post_casual_state.get("mode") == "soft_mute"
            and screen_post_casual_state.get("reason") == "user text only"
            and screen_post_casual_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in screen_post_casual_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in screen_post_casual_states),
            "detail": {
                "state": screen_post_casual_state,
                "states": screen_post_casual_states,
                "spoken": screen_post_casual_spoken,
                "actions": screen_post_casual_actions,
            },
        },
        {
            "name": "display-screen phrase enters text-only mode without speaking or playback/network actions",
            "passed": display_screen_casual_state.get("mode") == "soft_mute"
            and display_screen_casual_state.get("reason") == "user text only"
            and display_screen_casual_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in display_screen_casual_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in display_screen_casual_states),
            "detail": {
                "state": display_screen_casual_state,
                "states": display_screen_casual_states,
                "spoken": display_screen_casual_spoken,
                "actions": display_screen_casual_actions,
            },
        },
        {
            "name": "display-only no-speaking phrase enters text-only mode without speaking or playback/network actions",
            "passed": display_only_no_speak_state.get("mode") == "soft_mute"
            and display_only_no_speak_state.get("reason") == "user text only"
            and display_only_no_speak_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in display_only_no_speak_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in display_only_no_speak_states),
            "detail": {
                "state": display_only_no_speak_state,
                "states": display_only_no_speak_states,
                "spoken": display_only_no_speak_spoken,
                "actions": display_only_no_speak_actions,
            },
        },
        {
            "name": "no-voice-reply phrase enters text-only mode without speaking or actions",
            "passed": no_voice_reply_state.get("mode") == "soft_mute"
            and no_voice_reply_state.get("reason") == "user text only"
            and no_voice_reply_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_voice_reply_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in no_voice_reply_states),
            "detail": {
                "state": no_voice_reply_state,
                "states": no_voice_reply_states,
                "spoken": no_voice_reply_spoken,
                "actions": no_voice_reply_actions,
            },
        },
        {
            "name": "no-voice-output phrase enters text-only mode without speaking or actions",
            "passed": no_voice_output_state.get("mode") == "soft_mute"
            and no_voice_output_state.get("reason") == "user text only"
            and no_voice_output_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_voice_output_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in no_voice_output_states),
            "detail": {
                "state": no_voice_output_state,
                "states": no_voice_output_states,
                "spoken": no_voice_output_spoken,
                "actions": no_voice_output_actions,
            },
        },
        {
            "name": "extra text-only phrases enter a silent mode without playback or network actions",
            "passed": all(
                case["state"].get("mode") in {"soft_mute", "hard_mute"}
                and case["state"].get("reason") in {"user text only", "user hard mute"}
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                and any(
                    "屏幕回复" in str(state.get("message") or "")
                    or "屏幕上响应" in str(state.get("message") or "")
                    for state in case["states"]
                )
                for case in extra_text_only_cases
            ),
            "detail": extra_text_only_cases,
        },
        {
            "name": "extra soft-mute phrases enter quiet mode without speaking or playback/network actions",
            "passed": all(
                case["state"].get("mode") == "soft_mute"
                and case["state"].get("reason") == "user soft mute"
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                and any("安静待命" in str(state.get("message") or "") for state in case["states"])
                for case in extra_soft_mute_cases
            ),
            "detail": extra_soft_mute_cases,
        },
        {
            "name": "no-voice-response phrase enters text-only mode without speaking or actions",
            "passed": no_voice_response_state.get("mode") == "soft_mute"
            and no_voice_response_state.get("reason") == "user text only"
            and no_voice_response_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_voice_response_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in no_voice_response_states),
            "detail": {
                "state": no_voice_response_state,
                "states": no_voice_response_states,
                "spoken": no_voice_response_spoken,
                "actions": no_voice_response_actions,
            },
        },
        {
            "name": "private-readout phrase enters text-only mode without speaking or actions",
            "passed": private_readout_state.get("mode") == "soft_mute"
            and private_readout_state.get("reason") == "user text only"
            and private_readout_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in private_readout_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in private_readout_states),
            "detail": {
                "state": private_readout_state,
                "states": private_readout_states,
                "spoken": private_readout_spoken,
                "actions": private_readout_actions,
            },
        },
        {
            "name": "do-not-read-out phrase enters text-only mode without speaking",
            "passed": no_read_out_state.get("mode") == "soft_mute"
            and no_read_out_state.get("reason") == "user text only"
            and no_read_out_spoken == []
            and any("屏幕回复" in str(state.get("message") or "") for state in no_read_out_states),
            "detail": {"state": no_read_out_state, "states": no_read_out_states, "spoken": no_read_out_spoken},
        },
        {
            "name": "do-not-say-out phrase enters text-only mode without speaking or actions",
            "passed": no_say_out_state.get("mode") == "soft_mute"
            and no_say_out_state.get("reason") == "user text only"
            and no_say_out_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_say_out_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in no_say_out_states),
            "detail": {
                "state": no_say_out_state,
                "states": no_say_out_states,
                "spoken": no_say_out_spoken,
                "actions": no_say_out_actions,
            },
        },
        {
            "name": "do-not-broadcast phrase enters text-only mode without speaking",
            "passed": no_broadcast_state.get("mode") == "soft_mute"
            and no_broadcast_state.get("reason") == "user text only"
            and no_broadcast_spoken == []
            and any("屏幕回复" in str(state.get("message") or "") for state in no_broadcast_states),
            "detail": {"state": no_broadcast_state, "states": no_broadcast_states, "spoken": no_broadcast_spoken},
        },
        {
            "name": "do-not-play-out phrase enters text-only mode without speaking or actions",
            "passed": no_play_out_state.get("mode") == "soft_mute"
            and no_play_out_state.get("reason") == "user text only"
            and no_play_out_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_play_out_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in no_play_out_states),
            "detail": {
                "state": no_play_out_state,
                "states": no_play_out_states,
                "spoken": no_play_out_spoken,
                "actions": no_play_out_actions,
            },
        },
        {
            "name": "do-not-put-out phrase enters text-only mode without speaking or actions",
            "passed": no_put_out_state.get("mode") == "soft_mute"
            and no_put_out_state.get("reason") == "user text only"
            and no_put_out_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_put_out_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in no_put_out_states),
            "detail": {
                "state": no_put_out_state,
                "states": no_put_out_states,
                "spoken": no_put_out_spoken,
                "actions": no_put_out_actions,
            },
        },
        {
            "name": "quiet screen reply phrase enters text-only mode without speaking",
            "passed": quiet_screen_reply_state.get("mode") == "soft_mute"
            and quiet_screen_reply_state.get("reason") == "user text only"
            and quiet_screen_reply_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in quiet_screen_reply_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in quiet_screen_reply_states),
            "detail": {
                "state": quiet_screen_reply_state,
                "states": quiet_screen_reply_states,
                "spoken": quiet_screen_reply_spoken,
                "actions": quiet_screen_reply_actions,
            },
        },
        {
            "name": "inconvenient-to-speak phrase enters soft mute without speaking or actions",
            "passed": inconvenient_speech_state.get("mode") == "soft_mute"
            and inconvenient_speech_state.get("reason") == "user soft mute"
            and inconvenient_speech_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in inconvenient_speech_actions)
            and any("安静待命" in str(state.get("message") or "") for state in inconvenient_speech_states),
            "detail": {
                "state": inconvenient_speech_state,
                "states": inconvenient_speech_states,
                "spoken": inconvenient_speech_spoken,
                "actions": inconvenient_speech_actions,
            },
        },
        {
            "name": "no-external-speaker phrase enters soft mute without speaking or actions",
            "passed": no_external_speaker_state.get("mode") == "soft_mute"
            and no_external_speaker_state.get("reason") == "user soft mute"
            and no_external_speaker_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_external_speaker_actions)
            and any("安静待命" in str(state.get("message") or "") for state in no_external_speaker_states),
            "detail": {
                "state": no_external_speaker_state,
                "states": no_external_speaker_states,
                "spoken": no_external_speaker_spoken,
                "actions": no_external_speaker_actions,
            },
        },
        {
            "name": "speaker-device phrase enters soft mute without speaking or actions",
            "passed": speaker_device_state.get("mode") == "soft_mute"
            and speaker_device_state.get("reason") == "user soft mute"
            and speaker_device_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in speaker_device_actions)
            and any("安静待命" in str(state.get("message") or "") for state in speaker_device_states),
            "detail": {
                "state": speaker_device_state,
                "states": speaker_device_states,
                "spoken": speaker_device_spoken,
                "actions": speaker_device_actions,
            },
        },
        {
            "name": "speaker speech phrases enter soft mute without speaking or actions",
            "passed": all(
                case["state"].get("mode") == "soft_mute"
                and case["state"].get("reason") == "user soft mute"
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                and any("安静待命" in str(state.get("message") or "") for state in case["states"])
                for case in speaker_speech_cases
            ),
            "detail": speaker_speech_cases,
        },
        {
            "name": "screen-light-only phrase enters text-only mode without speaking or actions",
            "passed": screen_light_only_state.get("mode") == "soft_mute"
            and screen_light_only_state.get("reason") == "user text only"
            and screen_light_only_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in screen_light_only_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in screen_light_only_states),
            "detail": {
                "state": screen_light_only_state,
                "states": screen_light_only_states,
                "spoken": screen_light_only_spoken,
                "actions": screen_light_only_actions,
            },
        },
        {
            "name": "screen-light-no-speak phrase enters text-only mode without speaking or actions",
            "passed": screen_light_no_speak_state.get("mode") == "soft_mute"
            and screen_light_no_speak_state.get("reason") == "user text only"
            and screen_light_no_speak_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in screen_light_no_speak_actions)
            and any("屏幕回复" in str(state.get("message") or "") for state in screen_light_no_speak_states),
            "detail": {
                "state": screen_light_no_speak_state,
                "states": screen_light_no_speak_states,
                "spoken": screen_light_no_speak_spoken,
                "actions": screen_light_no_speak_actions,
            },
        },
        {
            "name": "audio-status question explains soft mute boundary",
            "passed": soft_audio_status_spoken == []
            and soft_mute_boundary_state(soft_audio_status_states),
            "detail": {"states": soft_audio_status_states, "spoken": soft_audio_status_spoken},
        },
        {
            "name": "muted-status question explains soft mute boundary",
            "passed": muted_audio_status_spoken == []
            and muted_audio_status_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(muted_audio_status_states),
            "detail": {"states": muted_audio_status_states, "spoken": muted_audio_status_spoken, "mode": muted_audio_status_mode},
        },
        {
            "name": "can-speak status question does not unmute",
            "passed": can_speak_status_spoken == []
            and can_speak_status_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(can_speak_status_states),
            "detail": {"states": can_speak_status_states, "spoken": can_speak_status_spoken, "mode": can_speak_status_mode},
        },
        {
            "name": "sound-off status question does not unmute",
            "passed": sound_off_status_spoken == []
            and sound_off_status_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(sound_off_status_states),
            "detail": {"states": sound_off_status_states, "spoken": sound_off_status_spoken, "mode": sound_off_status_mode},
        },
        {
            "name": "mute-mode status question does not unmute",
            "passed": mute_mode_status_spoken == []
            and mute_mode_status_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(mute_mode_status_states),
            "detail": {"states": mute_mode_status_states, "spoken": mute_mode_status_spoken, "mode": mute_mode_status_mode},
        },
        {
            "name": "mute-or-speak status question does not unmute",
            "passed": mute_or_speak_status_spoken == []
            and mute_or_speak_status_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(mute_or_speak_status_states),
            "detail": {
                "states": mute_or_speak_status_states,
                "spoken": mute_or_speak_status_spoken,
                "mode": mute_or_speak_status_mode,
            },
        },
        {
            "name": "can-talk status question does not unmute",
            "passed": can_talk_question_spoken == []
            and can_talk_question_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(can_talk_question_states),
            "detail": {
                "states": can_talk_question_states,
                "spoken": can_talk_question_spoken,
                "mode": can_talk_question_mode,
            },
        },
        {
            "name": "can-speak-yet status question does not unmute",
            "passed": can_speak_yet_question_spoken == []
            and can_speak_yet_question_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(can_speak_yet_question_states),
            "detail": {
                "states": can_speak_yet_question_states,
                "spoken": can_speak_yet_question_spoken,
                "mode": can_speak_yet_question_mode,
            },
        },
        {
            "name": "convenient-speak status question does not unmute",
            "passed": convenient_speak_question_spoken == []
            and convenient_speak_question_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(convenient_speak_question_states),
            "detail": {
                "states": convenient_speak_question_states,
                "spoken": convenient_speak_question_spoken,
                "mode": convenient_speak_question_mode,
            },
        },
        {
            "name": "convenient-speaker status question does not soft-mute command",
            "passed": convenient_speaker_question_spoken == []
            and convenient_speaker_question_mode.get("mode") == "soft_mute"
            and soft_mute_boundary_state(convenient_speaker_question_states),
            "detail": {
                "states": convenient_speaker_question_states,
                "spoken": convenient_speaker_question_spoken,
                "mode": convenient_speaker_question_mode,
            },
        },
        {
            "name": "audio-status question explains radio speech boundary",
            "passed": radio_audio_status_spoken == [
                "电台播放：允许按你的指令出声播放。 当前允许电台外放；可以按明确点歌、切城或播放需求执行。"
            ]
            and radio_boundary_state(radio_audio_status_states),
            "detail": {"states": radio_audio_status_states, "spoken": radio_audio_status_spoken},
        },
        {
            "name": "audio-mode question explains current speech boundary",
            "passed": audio_mode_status_spoken == [
                "电台播放：允许按你的指令出声播放。 当前允许电台外放；可以按明确点歌、切城或播放需求执行。"
            ]
            and radio_boundary_state(audio_mode_status_states),
            "detail": {"states": audio_mode_status_states, "spoken": audio_mode_status_spoken},
        },
        {
            "name": "text-only audio-status suffix stays screen-only in dialog mode",
            "passed": text_only_audio_status_spoken == []
            and any(
                state.get("city") == "声音入口"
                and "当前可以短句出声回答" in str(state.get("message") or "")
                for state in text_only_audio_status_states
            ),
            "detail": {"states": text_only_audio_status_states, "spoken": text_only_audio_status_spoken},
        },
        {
            "name": "no-voice phrase enters soft mute",
            "passed": quiet_voice_state.get("mode") == "soft_mute"
            and quiet_voice_state.get("reason") == "user soft mute",
            "detail": quiet_voice_state,
        },
        {
            "name": "short no-ring phrase enters soft mute without speaking or actions",
            "passed": no_ring_state.get("mode") == "soft_mute"
            and no_ring_state.get("reason") == "user soft mute"
            and no_ring_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_ring_actions)
            and any("安静待命" in str(state.get("message") or "") for state in no_ring_states),
            "detail": {
                "state": no_ring_state,
                "states": no_ring_states,
                "spoken": no_ring_spoken,
                "actions": no_ring_actions,
            },
        },
        {
            "name": "subway no-ring phrase enters soft mute without speaking or actions",
            "passed": subway_no_ring_state.get("mode") == "soft_mute"
            and subway_no_ring_state.get("reason") == "user soft mute"
            and subway_no_ring_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in subway_no_ring_actions
            )
            and any("安静待命" in str(state.get("message") or "") for state in subway_no_ring_states),
            "detail": {
                "state": subway_no_ring_state,
                "states": subway_no_ring_states,
                "spoken": subway_no_ring_spoken,
                "actions": subway_no_ring_actions,
            },
        },
        {
            "name": "library no-ring phrase enters soft mute without speaking or actions",
            "passed": library_no_ring_state.get("mode") == "soft_mute"
            and library_no_ring_state.get("reason") == "user soft mute"
            and library_no_ring_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in library_no_ring_actions
            )
            and any("安静待命" in str(state.get("message") or "") for state in library_no_ring_states),
            "detail": {
                "state": library_no_ring_state,
                "states": library_no_ring_states,
                "spoken": library_no_ring_spoken,
                "actions": library_no_ring_actions,
            },
        },
        {
            "name": "shush phrase enters soft mute without speaking or actions",
            "passed": shush_state.get("mode") == "soft_mute"
            and shush_state.get("reason") == "user soft mute"
            and shush_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in shush_actions)
            and any("安静待命" in str(state.get("message") or "") for state in shush_states),
            "detail": {
                "state": shush_state,
                "states": shush_states,
                "spoken": shush_spoken,
                "actions": shush_actions,
            },
        },
        {
            "name": "shush-a-bit phrase enters soft mute without speaking or actions",
            "passed": shush_a_bit_state.get("mode") == "soft_mute"
            and shush_a_bit_state.get("reason") == "user soft mute"
            and shush_a_bit_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in shush_a_bit_actions
            )
            and any("安静待命" in str(state.get("message") or "") for state in shush_a_bit_states),
            "detail": {
                "state": shush_a_bit_state,
                "states": shush_a_bit_states,
                "spoken": shush_a_bit_spoken,
                "actions": shush_a_bit_actions,
            },
        },
        {
            "name": "english shush phrase enters soft mute without speaking or actions",
            "passed": english_shush_state.get("mode") == "soft_mute"
            and english_shush_state.get("reason") == "user soft mute"
            and english_shush_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in english_shush_actions
            )
            and any("安静待命" in str(state.get("message") or "") for state in english_shush_states),
            "detail": {
                "state": english_shush_state,
                "states": english_shush_states,
                "spoken": english_shush_spoken,
                "actions": english_shush_actions,
            },
        },
        {
            "name": "hard no-audio phrase enters hard mute",
            "passed": hard_no_audio_state.get("mode") == "hard_mute"
            and hard_no_audio_state.get("reason") == "user hard mute",
            "detail": hard_no_audio_state,
        },
        {
            "name": "natural camera privacy question explains manual-only boundary",
            "passed": bool(natural_privacy_states)
            and natural_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in natural_privacy_states[-1].get("message", ""),
            "detail": natural_privacy_states[-1:] if natural_privacy_states else [],
        },
        {
            "name": "no-spy privacy question explains manual-only boundary",
            "passed": bool(spy_privacy_states)
            and spy_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in spy_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in spy_privacy_states[-1].get("message", ""),
            "detail": spy_privacy_states[-1:] if spy_privacy_states else [],
        },
        {
            "name": "no-eavesdrop privacy question explains audio boundary",
            "passed": bool(eavesdrop_privacy_states)
            and eavesdrop_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in eavesdrop_privacy_states[-1].get("message", ""),
            "detail": eavesdrop_privacy_states[-1:] if eavesdrop_privacy_states else [],
        },
        {
            "name": "colloquial stealth privacy questions explain audio/camera boundaries without actions",
            "passed": all(
                bool(case_states)
                and case_states[-1].get("city") == "隐私状态"
                and message_check(case_states[-1].get("message", ""))
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions)
                for case_states, case_actions, message_check in [
                    (
                        stealth_record_privacy_states,
                        stealth_record_privacy_actions,
                        lambda message: "不做环境录音" in str(message),
                    ),
                    (
                        short_record_privacy_states,
                        short_record_privacy_actions,
                        lambda message: "不做环境录音" in str(message),
                    ),
                    (
                        recorded_privacy_states,
                        recorded_privacy_actions,
                        lambda message: "不做环境录音" in str(message),
                    ),
                    (
                        recorded_me_privacy_states,
                        recorded_me_privacy_actions,
                        lambda message: "不做环境录音" in str(message),
                    ),
                    (
                        previous_record_privacy_states,
                        previous_record_privacy_actions,
                        lambda message: "不做环境录音" in str(message),
                    ),
                    (
                        always_record_privacy_states,
                        always_record_privacy_actions,
                        lambda message: "不做环境录音" in str(message),
                    ),
                    (
                        stealth_watch_privacy_states,
                        stealth_watch_privacy_actions,
                        lambda message: "不会自动拍照" in str(message)
                        and "不识别身份或表情" in str(message),
                    ),
                    (
                        always_shoot_privacy_states,
                        always_shoot_privacy_actions,
                        lambda message: "不会自动拍照" in str(message)
                        and "不识别身份或表情" in str(message),
                    ),
                    (
                        short_shoot_privacy_states,
                        short_shoot_privacy_actions,
                        lambda message: "不会自动拍照" in str(message)
                        and "不识别身份或表情" in str(message),
                    ),
                    (
                        shot_privacy_states,
                        shot_privacy_actions,
                        lambda message: "不会自动拍照" in str(message)
                        and "不识别身份或表情" in str(message),
                    ),
                    (
                        shot_me_privacy_states,
                        shot_me_privacy_actions,
                        lambda message: "不会自动拍照" in str(message)
                        and "不识别身份或表情" in str(message),
                    ),
                    (
                        previous_photo_privacy_states,
                        previous_photo_privacy_actions,
                        lambda message: "不会自动拍照" in str(message)
                        and "不识别身份或表情" in str(message),
                    ),
                ]
            ),
            "detail": {
                "stealthRecord": {
                    "states": stealth_record_privacy_states[-1:] if stealth_record_privacy_states else [],
                    "actions": stealth_record_privacy_actions,
                },
                "shortRecord": {
                    "states": short_record_privacy_states[-1:] if short_record_privacy_states else [],
                    "actions": short_record_privacy_actions,
                },
                "recorded": {
                    "states": recorded_privacy_states[-1:] if recorded_privacy_states else [],
                    "actions": recorded_privacy_actions,
                },
                "recordedMe": {
                    "states": recorded_me_privacy_states[-1:] if recorded_me_privacy_states else [],
                    "actions": recorded_me_privacy_actions,
                },
                "previousRecord": {
                    "states": previous_record_privacy_states[-1:] if previous_record_privacy_states else [],
                    "actions": previous_record_privacy_actions,
                },
                "alwaysRecord": {
                    "states": always_record_privacy_states[-1:] if always_record_privacy_states else [],
                    "actions": always_record_privacy_actions,
                },
                "stealthWatch": {
                    "states": stealth_watch_privacy_states[-1:] if stealth_watch_privacy_states else [],
                    "actions": stealth_watch_privacy_actions,
                },
                "alwaysShoot": {
                    "states": always_shoot_privacy_states[-1:] if always_shoot_privacy_states else [],
                    "actions": always_shoot_privacy_actions,
                },
                "shortShoot": {
                    "states": short_shoot_privacy_states[-1:] if short_shoot_privacy_states else [],
                    "actions": short_shoot_privacy_actions,
                },
                "shot": {
                    "states": shot_privacy_states[-1:] if shot_privacy_states else [],
                    "actions": shot_privacy_actions,
                },
                "shotMe": {
                    "states": shot_me_privacy_states[-1:] if shot_me_privacy_states else [],
                    "actions": shot_me_privacy_actions,
                },
                "previousPhoto": {
                    "states": previous_photo_privacy_states[-1:] if previous_photo_privacy_states else [],
                    "actions": previous_photo_privacy_actions,
                },
            },
        },
        {
            "name": "always-listening privacy question explains audio boundary without actions",
            "passed": bool(always_listening_privacy_states)
            and always_listening_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in always_listening_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in always_listening_privacy_actions
            ),
            "detail": {
                "states": always_listening_privacy_states[-1:] if always_listening_privacy_states else [],
                "actions": always_listening_privacy_actions,
            },
        },
        {
            "name": "direct no-always-listening phrase explains audio boundary without actions",
            "passed": bool(no_always_listening_privacy_states)
            and no_always_listening_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in no_always_listening_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in no_always_listening_privacy_actions
            ),
            "detail": {
                "states": no_always_listening_privacy_states[-1:] if no_always_listening_privacy_states else [],
                "actions": no_always_listening_privacy_actions,
            },
        },
        {
            "name": "always-watching privacy question explains camera boundary without actions",
            "passed": bool(always_watching_privacy_states)
            and always_watching_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in always_watching_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in always_watching_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in always_watching_privacy_actions
            ),
            "detail": {
                "states": always_watching_privacy_states[-1:] if always_watching_privacy_states else [],
                "actions": always_watching_privacy_actions,
            },
        },
        {
            "name": "microphone recording privacy question explains audio boundary before voice doctor",
            "passed": bool(mic_record_privacy_states)
            and mic_record_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in mic_record_privacy_states[-1].get("message", ""),
            "detail": mic_record_privacy_states[-1:] if mic_record_privacy_states else [],
        },
        {
            "name": "casual record-down privacy question explains audio boundary without actions",
            "passed": bool(record_down_privacy_states)
            and record_down_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in record_down_privacy_states[-1].get("message", "")
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in record_down_privacy_actions),
            "detail": {
                "states": record_down_privacy_states[-1:] if record_down_privacy_states else [],
                "actions": record_down_privacy_actions,
            },
        },
        {
            "name": "audio retention privacy questions explain no-recording boundary without actions",
            "passed": all(
                bool(case_states)
                and case_states[-1].get("city") == "隐私状态"
                and "不做环境录音" in case_states[-1].get("message", "")
                for case_states in [
                    audio_retention_privacy_states,
                    spoken_words_retention_privacy_states,
                    voice_upload_privacy_states,
                    voice_save_privacy_states,
                    *(case["states"] for case in extra_audio_privacy_cases),
                ]
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for case_actions in [
                    audio_retention_privacy_actions,
                    spoken_words_retention_privacy_actions,
                    voice_upload_privacy_actions,
                    voice_save_privacy_actions,
                    *(case["actions"] for case in extra_audio_privacy_cases),
                ]
                for action in case_actions
            ),
            "detail": {
                "audioRetention": {
                    "states": audio_retention_privacy_states[-1:] if audio_retention_privacy_states else [],
                    "actions": audio_retention_privacy_actions,
                },
                "spokenWordsRetention": {
                    "states": spoken_words_retention_privacy_states[-1:]
                    if spoken_words_retention_privacy_states
                    else [],
                    "actions": spoken_words_retention_privacy_actions,
                },
                "voiceUpload": {
                    "states": voice_upload_privacy_states[-1:] if voice_upload_privacy_states else [],
                    "actions": voice_upload_privacy_actions,
                },
                "voiceSave": {
                    "states": voice_save_privacy_states[-1:] if voice_save_privacy_states else [],
                    "actions": voice_save_privacy_actions,
                },
                "extraAudioPrivacy": [
                    {
                        "prompt": case["prompt"],
                        "states": case["states"][-1:] if case["states"] else [],
                        "actions": case["actions"],
                    }
                    for case in extra_audio_privacy_cases
                ],
            },
        },
        {
            "name": "context and preference memory questions explain short-term boundary without actions",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == "上下文记忆"
                and "当前对话" in str(case["states"][-1].get("message") or "")
                and "不会把你的偏好" in str(case["states"][-1].get("message") or "")
                and "上一动作" in str(case["states"][-1].get("message") or "")
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in context_memory_cases
            ),
            "detail": [
                {
                    "prompt": case["prompt"],
                    "states": case["states"][-1:] if case["states"] else [],
                    "spoken": case["spoken"],
                    "actions": case["actions"],
                }
                for case in context_memory_cases
            ],
        },
        {
            "name": "quiet-prefixed context memory questions stay screen-only",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == "上下文记忆"
                and "不会把你的偏好" in str(case["states"][-1].get("message") or "")
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in quiet_context_memory_cases
            ),
            "detail": [
                {
                    "prompt": case["prompt"],
                    "states": case["states"][-1:] if case["states"] else [],
                    "spoken": case["spoken"],
                    "actions": case["actions"],
                }
                for case in quiet_context_memory_cases
            ],
        },
        {
            "name": "location, companion, and log privacy questions explain boundary without actions",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == "隐私状态"
                and "不会自动拍照" in str(case["states"][-1].get("message") or "")
                and "不做环境录音" in str(case["states"][-1].get("message") or "")
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in location_privacy_cases
            ),
            "detail": [
                {
                    "prompt": case["prompt"],
                    "states": case["states"][-1:] if case["states"] else [],
                    "actions": case["actions"],
                }
                for case in location_privacy_cases
            ],
        },
        {
            "name": "visual privacy boundary phrases explain scan limits without actions",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == "隐私状态"
                and "不会自动拍照" in str(case["states"][-1].get("message") or "")
                and "二维码" in str(case["states"][-1].get("message") or "")
                and "屏幕文字" in str(case["states"][-1].get("message") or "")
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in visual_privacy_cases
            ),
            "detail": [
                {
                    "prompt": case["prompt"],
                    "states": case["states"][-1:] if case["states"] else [],
                    "actions": case["actions"],
                }
                for case in visual_privacy_cases
            ],
        },
        {
            "name": "microphone-off privacy question explains audio boundary without actions",
            "passed": bool(mic_off_privacy_states)
            and mic_off_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in mic_off_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in mic_off_privacy_actions
            ),
            "detail": {
                "states": mic_off_privacy_states[-1:] if mic_off_privacy_states else [],
                "actions": mic_off_privacy_actions,
            },
        },
        {
            "name": "microphone-on privacy question explains audio boundary without actions",
            "passed": bool(mic_on_privacy_states)
            and mic_on_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in mic_on_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in mic_on_privacy_actions
            ),
            "detail": {
                "states": mic_on_privacy_states[-1:] if mic_on_privacy_states else [],
                "actions": mic_on_privacy_actions,
            },
        },
        {
            "name": "short mic privacy questions explain audio boundary without actions",
            "passed": all(
                bool(case_states)
                and case_states[-1].get("city") == "隐私状态"
                and "不做环境录音" in case_states[-1].get("message", "")
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions)
                for case_states, case_actions in [
                    (short_open_mic_privacy_states, short_open_mic_privacy_actions),
                    (short_mic_still_on_privacy_states, short_mic_still_on_privacy_actions),
                    (short_mic_off_privacy_states, short_mic_off_privacy_actions),
                    *((case["states"], case["actions"]) for case in extra_short_mic_privacy_cases),
                ]
            ),
            "detail": {
                "openMic": {
                    "states": short_open_mic_privacy_states[-1:] if short_open_mic_privacy_states else [],
                    "actions": short_open_mic_privacy_actions,
                },
                "stillOn": {
                    "states": short_mic_still_on_privacy_states[-1:] if short_mic_still_on_privacy_states else [],
                    "actions": short_mic_still_on_privacy_actions,
                },
                "off": {
                    "states": short_mic_off_privacy_states[-1:] if short_mic_off_privacy_states else [],
                    "actions": short_mic_off_privacy_actions,
                },
                "extra": [
                    {
                        "prompt": case["prompt"],
                        "states": case["states"][-1:] if case["states"] else [],
                        "actions": case["actions"],
                    }
                    for case in extra_short_mic_privacy_cases
                ],
            },
        },
        {
            "name": "reverse microphone-open privacy question explains audio boundary without actions",
            "passed": bool(reverse_mic_on_privacy_states)
            and reverse_mic_on_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in reverse_mic_on_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in reverse_mic_on_privacy_actions
            ),
            "detail": {
                "states": reverse_mic_on_privacy_states[-1:] if reverse_mic_on_privacy_states else [],
                "actions": reverse_mic_on_privacy_actions,
            },
        },
        {
            "name": "short reverse microphone-open privacy question explains audio boundary without actions",
            "passed": bool(short_reverse_mic_on_privacy_states)
            and short_reverse_mic_on_privacy_states[-1].get("city") == "隐私状态"
            and "不做环境录音" in short_reverse_mic_on_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in short_reverse_mic_on_privacy_actions
            ),
            "detail": {
                "states": short_reverse_mic_on_privacy_states[-1:] if short_reverse_mic_on_privacy_states else [],
                "actions": short_reverse_mic_on_privacy_actions,
            },
        },
        {
            "name": "direct audio privacy phrases explain no-recording boundary",
            "passed": bool(no_audio_recording_privacy_states)
            and bool(no_short_recording_privacy_states)
            and bool(no_open_mic_privacy_states)
            and bool(no_monitoring_privacy_states)
            and all(
                states[-1].get("city") == "隐私状态"
                and "不做环境录音" in states[-1].get("message", "")
                for states in [
                    no_audio_recording_privacy_states,
                    no_short_recording_privacy_states,
                    no_open_mic_privacy_states,
                    no_monitoring_privacy_states,
                ]
            ),
            "detail": {
                "noAudioRecording": no_audio_recording_privacy_states[-1:] if no_audio_recording_privacy_states else [],
                "noShortRecording": no_short_recording_privacy_states[-1:] if no_short_recording_privacy_states else [],
                "noOpenMic": no_open_mic_privacy_states[-1:] if no_open_mic_privacy_states else [],
                "noMonitoring": no_monitoring_privacy_states[-1:] if no_monitoring_privacy_states else [],
            },
        },
        {
            "name": "camera auto-on question explains manual-only boundary",
            "passed": bool(auto_camera_privacy_states)
            and auto_camera_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in auto_camera_privacy_states[-1].get("message", ""),
            "detail": auto_camera_privacy_states[-1:] if auto_camera_privacy_states else [],
        },
        {
            "name": "can-see-me privacy question explains manual-only boundary without actions",
            "passed": bool(can_see_me_privacy_states)
            and can_see_me_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in can_see_me_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in can_see_me_privacy_states[-1].get("message", "")
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in can_see_me_privacy_actions),
            "detail": {
                "states": can_see_me_privacy_states[-1:] if can_see_me_privacy_states else [],
                "actions": can_see_me_privacy_actions,
            },
        },
        {
            "name": "camera-off privacy question explains manual-only boundary without actions",
            "passed": bool(camera_off_privacy_states)
            and camera_off_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in camera_off_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in camera_off_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in camera_off_privacy_actions
            ),
            "detail": {
                "states": camera_off_privacy_states[-1:] if camera_off_privacy_states else [],
                "actions": camera_off_privacy_actions,
            },
        },
        {
            "name": "camera-on privacy question explains manual-only boundary without actions",
            "passed": bool(camera_on_privacy_states)
            and camera_on_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in camera_on_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in camera_on_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in camera_on_privacy_actions
            ),
            "detail": {
                "states": camera_on_privacy_states[-1:] if camera_on_privacy_states else [],
                "actions": camera_on_privacy_actions,
            },
        },
        {
            "name": "reverse camera-open privacy question explains manual-only boundary without actions",
            "passed": bool(reverse_camera_on_privacy_states)
            and reverse_camera_on_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in reverse_camera_on_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in reverse_camera_on_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in reverse_camera_on_privacy_actions
            ),
            "detail": {
                "states": reverse_camera_on_privacy_states[-1:] if reverse_camera_on_privacy_states else [],
                "actions": reverse_camera_on_privacy_actions,
            },
        },
        {
            "name": "short reverse camera-open privacy question explains manual-only boundary without actions",
            "passed": bool(short_reverse_camera_on_privacy_states)
            and short_reverse_camera_on_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in short_reverse_camera_on_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in short_reverse_camera_on_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in short_reverse_camera_on_privacy_actions
            ),
            "detail": {
                "states": short_reverse_camera_on_privacy_states[-1:]
                if short_reverse_camera_on_privacy_states
                else [],
                "actions": short_reverse_camera_on_privacy_actions,
            },
        },
        {
            "name": "face-recognition question explains identity boundary",
            "passed": bool(face_privacy_states)
            and face_privacy_states[-1].get("city") == "隐私状态"
            and "不识别身份或表情" in face_privacy_states[-1].get("message", ""),
            "detail": face_privacy_states[-1:] if face_privacy_states else [],
        },
        {
            "name": "identity-recognition privacy questions explain identity boundary without actions",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == "隐私状态"
                and "不识别身份或表情" in case["states"][-1].get("message", "")
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in identity_privacy_cases
            ),
            "detail": identity_privacy_cases,
        },
        {
            "name": "photo-retention privacy question explains deletion boundary without actions",
            "passed": bool(photo_retention_privacy_states)
            and photo_retention_privacy_states[-1].get("city") == "隐私状态"
            and "分析后删图" in photo_retention_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in photo_retention_privacy_states[-1].get("message", "")
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in photo_retention_privacy_actions
            ),
            "detail": {
                "states": photo_retention_privacy_states[-1:] if photo_retention_privacy_states else [],
                "actions": photo_retention_privacy_actions,
            },
        },
        {
            "name": "photo-delete privacy questions explain deletion boundary without actions",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == "隐私状态"
                and "分析后删图" in case["states"][-1].get("message", "")
                and "不会自动拍照" in case["states"][-1].get("message", "")
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in photo_delete_privacy_cases
            ),
            "detail": photo_delete_privacy_cases,
        },
        {
            "name": "photo-capture privacy question explains manual-only boundary without actions",
            "passed": bool(photo_capture_privacy_states)
            and photo_capture_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in photo_capture_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in photo_capture_privacy_states[-1].get("message", "")
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in photo_capture_privacy_actions),
            "detail": {
                "states": photo_capture_privacy_states[-1:] if photo_capture_privacy_states else [],
                "actions": photo_capture_privacy_actions,
            },
        },
        {
            "name": "direct no-stealth-camera phrases explain privacy boundary",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == "隐私状态"
                and "不会自动拍照" in str(case["states"][-1].get("message") or "")
                and "不识别身份或表情" in str(case["states"][-1].get("message") or "")
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in extra_camera_privacy_cases
            ),
            "detail": extra_camera_privacy_cases,
        },
        {
            "name": "direct no-photo phrase explains privacy boundary",
            "passed": bool(no_photo_privacy_states)
            and no_photo_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in no_photo_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in no_photo_privacy_states[-1].get("message", ""),
            "detail": no_photo_privacy_states[-1:] if no_photo_privacy_states else [],
        },
        {
            "name": "casual no-photo phrase explains privacy boundary",
            "passed": bool(no_short_photo_privacy_states)
            and no_short_photo_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in no_short_photo_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in no_short_photo_privacy_states[-1].get("message", ""),
            "detail": no_short_photo_privacy_states[-1:] if no_short_photo_privacy_states else [],
        },
        {
            "name": "direct no-camera-watch phrase explains privacy boundary",
            "passed": bool(no_watch_privacy_states)
            and no_watch_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in no_watch_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in no_watch_privacy_states[-1].get("message", ""),
            "detail": no_watch_privacy_states[-1:] if no_watch_privacy_states else [],
        },
        {
            "name": "direct no-recording phrase explains privacy boundary",
            "passed": bool(no_record_privacy_states)
            and no_record_privacy_states[-1].get("city") == "隐私状态"
            and "不会自动拍照" in no_record_privacy_states[-1].get("message", "")
            and "不识别身份或表情" in no_record_privacy_states[-1].get("message", ""),
            "detail": no_record_privacy_states[-1:] if no_record_privacy_states else [],
        },
        {
            "name": "quiet-prefixed environment and camera status queries stay screen-only",
            "passed": all(
                bool(case["states"])
                and case["states"][-1].get("city") == case["expectedCity"]
                and case["expectedMessage"] in str(case["states"][-1].get("message") or "")
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in quiet_privacy_status_cases
            ),
            "detail": quiet_privacy_status_cases,
        },
        {
            "name": "repeated stop misrecognition pauses cleanly",
            "passed": any(
                state.get("label") == "已暂停"
                and state.get("city") == "音乐DJ"
                and "音乐DJ 先把声音停在这里" in str(state.get("message") or "")
                for state in states
            ),
        },
        {
            "name": "natural stop-radio phrase pauses cleanly",
            "passed": "stop" in natural_stop_actions
            and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in natural_stop_states),
            "detail": {"states": natural_stop_states, "actions": natural_stop_actions},
        },
        {
            "name": "casual stop-song phrase pauses cleanly",
            "passed": stop_song_actions == ["stop"]
            and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in stop_song_states),
            "detail": {"states": stop_song_states, "actions": stop_song_actions},
        },
        {
            "name": "casual stop-music phrase pauses cleanly",
            "passed": stop_music_actions == ["stop"]
            and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in stop_music_states),
            "detail": {"states": stop_music_states, "actions": stop_music_actions},
        },
        {
            "name": "casual no-more-song phrase pauses cleanly",
            "passed": no_more_song_actions == ["stop"]
            and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in no_more_song_states),
            "detail": {"states": no_more_song_states, "actions": no_more_song_actions},
        },
        {
            "name": "casual no-more broadcast/singing phrases pause cleanly",
            "passed": all(
                case_actions == ["stop"]
                and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in case_states)
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions)
                for case_states, case_actions in [
                    (no_more_broadcast_states, no_more_broadcast_actions),
                    (no_more_singing_states, no_more_singing_actions),
                    (pause_music_reversed_states, pause_music_reversed_actions),
                ]
                + [(case["states"], case["actions"]) for case in no_more_singing_variant_cases]
            ),
            "detail": {
                "broadcast": {"states": no_more_broadcast_states, "actions": no_more_broadcast_actions},
                "singing": {"states": no_more_singing_states, "actions": no_more_singing_actions},
                "singingVariants": no_more_singing_variant_cases,
                "pauseMusic": {"states": pause_music_reversed_states, "actions": pause_music_reversed_actions},
            },
        },
        {
            "name": "direct no-broadcast phrase stops and stays quiet",
            "passed": no_broadcast_actions == ["stop"]
            and any(
                state.get("label") in {"已暂停", "静音中"}
                and state.get("city") in {"音乐DJ", "声音入口"}
                for state in no_broadcast_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_broadcast_actions),
            "detail": {"states": no_broadcast_states, "actions": no_broadcast_actions},
        },
        {
            "name": "stop-a-while phrase pauses cleanly",
            "passed": stop_a_while_actions == ["stop"]
            and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in stop_a_while_states),
            "detail": {"states": stop_a_while_states, "actions": stop_a_while_actions},
        },
        {
            "name": "rest-or-collect-sound phrases pause cleanly",
            "passed": all(
                case["actions"] == ["stop"]
                and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in case["states"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in rest_or_collect_sound_cases
            ),
            "detail": rest_or_collect_sound_cases,
        },
        {
            "name": "casual music-stop-first phrase pauses cleanly",
            "passed": music_stop_first_actions == ["stop"]
            and any(
                state.get("label") == "已暂停" and state.get("city") == "音乐DJ"
                for state in music_stop_first_states
            ),
            "detail": {"states": music_stop_first_states, "actions": music_stop_first_actions},
        },
        {
            "name": "casual sound-off-first phrase pauses cleanly",
            "passed": sound_off_first_actions == ["stop"]
            and any(
                state.get("label") == "已暂停" and state.get("city") == "音乐DJ"
                for state in sound_off_first_states
            ),
            "detail": {"states": sound_off_first_states, "actions": sound_off_first_actions},
        },
        {
            "name": "casual radio-off-first phrase pauses cleanly",
            "passed": radio_off_first_actions == ["stop"]
            and any(
                state.get("label") == "已暂停" and state.get("city") == "音乐DJ"
                for state in radio_off_first_states
            ),
            "detail": {"states": radio_off_first_states, "actions": radio_off_first_actions},
        },
        {
            "name": "close-station phrase pauses cleanly",
            "passed": "stop" in close_station_actions
            and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in close_station_states),
            "detail": {"states": close_station_states, "actions": close_station_actions},
        },
        {
            "name": "colloquial stop-broadcast phrases pause cleanly",
            "passed": all(
                case["actions"] == ["stop"]
                and any(state.get("label") == "已暂停" and state.get("city") == "音乐DJ" for state in case["states"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in stop_broadcast_cases
            ),
            "detail": stop_broadcast_cases,
        },
        {
            "name": "negative stop-broadcast phrase keeps playback",
            "passed": negative_stop_broadcast_actions == []
            and any(state.get("label") == "播放保持" for state in negative_stop_broadcast_states),
            "detail": {
                "states": negative_stop_broadcast_states,
                "actions": negative_stop_broadcast_actions,
            },
        },
        {
            "name": "natural next-track phrase advances one track",
            "passed": "play_next:1" in natural_next_actions,
            "detail": natural_next_actions,
        },
        {
            "name": "natural skip-this-track phrase advances one track",
            "passed": "play_next:1" in natural_skip_this_actions,
            "detail": natural_skip_this_actions,
        },
        {
            "name": "natural skip-current-track variants advance one track",
            "passed": all(case["actions"] == ["play_next:1"] for case in natural_skip_current_cases),
            "detail": natural_skip_current_cases,
        },
        {
            "name": "natural previous-track phrase goes back one track",
            "passed": "play_next:-1" in natural_prev_actions,
            "detail": natural_prev_actions,
        },
        {
            "name": "natural previous-this-track phrase goes back one track",
            "passed": "play_next:-1" in natural_previous_this_actions,
            "detail": natural_previous_this_actions,
        },
        {
            "name": "natural next-city phrase hops forward",
            "passed": natural_next_city_actions == ["hop_city:1"],
            "detail": natural_next_city_actions,
        },
        {
            "name": "natural next-place phrase hops forward",
            "passed": natural_next_place_actions == ["hop_city:1"],
            "detail": natural_next_place_actions,
        },
        {
            "name": "natural previous-city phrase hops backward",
            "passed": natural_prev_city_actions == ["hop_city:-1"],
            "detail": natural_prev_city_actions,
        },
        {
            "name": "natural previous-place phrase hops backward",
            "passed": natural_prev_place_actions == ["hop_city:-1"],
            "detail": natural_prev_place_actions,
        },
        {
            "name": "natural previous-recent-stop phrase hops backward",
            "passed": natural_prev_recent_stop_actions == ["hop_city:-1"],
            "detail": natural_prev_recent_stop_actions,
        },
        {
            "name": "negative city-hop phrases keep current city",
            "passed": all(
                case["actions"] == []
                and any(
                    state.get("label") == "城市保持"
                    and state.get("track") == "未切换城市"
                    and "保持当前城市" in str(state.get("message") or "")
                    for state in case["states"]
                )
                for case in negative_city_action_cases
            ),
            "detail": negative_city_action_cases,
        },
        {
            "name": "natural replay phrase restarts current track",
            "passed": natural_replay_actions == ["play_next:0"],
            "detail": natural_replay_actions,
        },
        {
            "name": "natural restart phrase restarts current track",
            "passed": natural_restart_actions == ["play_next:0"],
            "detail": natural_restart_actions,
        },
        {
            "name": "volume command is blocked by soft mute boundary",
            "passed": blocked_volume_ok is False
            and blocked_volume_calls == []
            and any("不会在这个模式里调响" in str(state.get("message") or "") for state in blocked_volume_states),
            "detail": {"calls": blocked_volume_calls, "states": blocked_volume_states},
        },
        {
            "name": "radio volume command adjusts sink and writes overlay",
            "passed": allowed_volume_ok is True
            and ("set-volume" in [part for call in allowed_volume_calls for part in call])
            and allowed_volume_overlay.get("volume") == 61
            and allowed_volume_overlay.get("dir") == "up"
            and any("音量已调高" in str(state.get("message") or "") for state in allowed_volume_states),
            "detail": {
                "calls": allowed_volume_calls,
                "overlay": allowed_volume_overlay,
                "states": allowed_volume_states,
            },
        },
        {
            "name": "natural volume-down phrase reaches volume handler",
            "passed": natural_volume_down_actions == ["volume:down"],
            "detail": natural_volume_down_actions,
        },
        {
            "name": "natural too-loud phrase reaches volume-down handler",
            "passed": natural_too_loud_actions == ["volume:down"],
            "detail": natural_too_loud_actions,
        },
        {
            "name": "natural quieter phrase reaches volume handler",
            "passed": natural_quieter_actions == ["volume:down"],
            "detail": natural_quieter_actions,
        },
        {
            "name": "colloquial quieter phrase reaches volume handler",
            "passed": colloquial_quieter_actions == ["volume:down"],
            "detail": colloquial_quieter_actions,
        },
        {
            "name": "casual quieter phrase reaches volume handler",
            "passed": casual_quieter_actions == ["volume:down"],
            "detail": casual_quieter_actions,
        },
        {
            "name": "casual too-loud phrase reaches volume-down handler",
            "passed": casual_too_loud_actions == ["volume:down"],
            "detail": casual_too_loud_actions,
        },
        {
            "name": "casual too-loud voice phrase reaches volume-down handler",
            "passed": casual_too_loud_voice_actions == ["volume:down"],
            "detail": casual_too_loud_voice_actions,
        },
        {
            "name": "quiet-reply phrase reaches volume-down handler",
            "passed": quiet_reply_volume_actions == ["volume:down"],
            "detail": quiet_reply_volume_actions,
        },
        {
            "name": "natural volume-down variants reach volume handler",
            "passed": all(case["actions"] == ["volume:down"] for case in natural_volume_down_variant_cases),
            "detail": natural_volume_down_variant_cases,
        },
        {
            "name": "natural volume-up phrase reaches volume handler",
            "passed": natural_volume_up_actions == ["volume:up"],
            "detail": natural_volume_up_actions,
        },
        {
            "name": "casual louder phrase reaches volume handler",
            "passed": casual_louder_actions == ["volume:up"],
            "detail": casual_louder_actions,
        },
        {
            "name": "colloquial louder phrase reaches volume handler",
            "passed": colloquial_louder_actions == ["volume:up"],
            "detail": colloquial_louder_actions,
        },
        {
            "name": "natural too-soft phrase reaches volume-up handler",
            "passed": natural_too_soft_actions == ["volume:up"],
            "detail": natural_too_soft_actions,
        },
        {
            "name": "natural louder phrase reaches volume handler",
            "passed": natural_louder_actions == ["volume:up"],
            "detail": natural_louder_actions,
        },
        {
            "name": "natural volume-up variants reach volume handler",
            "passed": all(case["actions"] == ["volume:up"] for case in natural_volume_up_variant_cases),
            "detail": natural_volume_up_variant_cases,
        },
        {
            "name": "natural title question returns current track",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_title_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in now_title_spoken),
            "detail": {"states": now_title_states, "spoken": now_title_spoken},
        },
        {
            "name": "casual title question returns current track",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in casual_title_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in casual_title_spoken),
            "detail": {"states": casual_title_states, "spoken": casual_title_spoken},
        },
        {
            "name": "casual song-name question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in casual_song_name_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in casual_song_name_spoken)
            and casual_song_name_actions == [],
            "detail": {
                "states": casual_song_name_states,
                "spoken": casual_song_name_spoken,
                "actions": casual_song_name_actions,
            },
        },
        {
            "name": "short song-name question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in short_song_name_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in short_song_name_spoken)
            and short_song_name_actions == [],
            "detail": {
                "states": short_song_name_states,
                "spoken": short_song_name_spoken,
                "actions": short_song_name_actions,
            },
        },
        {
            "name": "natural song-name question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in natural_song_name_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in natural_song_name_spoken)
            and natural_song_name_actions == [],
            "detail": {
                "states": natural_song_name_states,
                "spoken": natural_song_name_spoken,
                "actions": natural_song_name_actions,
            },
        },
        {
            "name": "direct song-title question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in direct_song_title_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in direct_song_title_spoken)
            and direct_song_title_actions == [],
            "detail": {
                "states": direct_song_title_states,
                "spoken": direct_song_title_spoken,
                "actions": direct_song_title_actions,
            },
        },
        {
            "name": "current song-title question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_song_title_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_song_title_spoken)
            and current_song_title_actions == [],
            "detail": {
                "states": current_song_title_states,
                "spoken": current_song_title_spoken,
                "actions": current_song_title_actions,
            },
        },
        {
            "name": "this-is-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in this_is_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in this_is_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in this_is_song_actions
            ),
            "detail": {
                "states": this_is_song_states,
                "spoken": this_is_song_spoken,
                "actions": this_is_song_actions,
            },
        },
        {
            "name": "casual this-is-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in casual_this_is_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in casual_this_is_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in casual_this_is_song_actions
            ),
            "detail": {
                "states": casual_this_is_song_states,
                "spoken": casual_this_is_song_spoken,
                "actions": casual_this_is_song_actions,
            },
        },
        {
            "name": "song city-origin questions return current track without actions",
            "passed": all(
                any(
                    state.get("track") == "Plastic Love"
                    and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                    and "东京" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("现在在东京" in text and "Plastic Love" in text for text in case["spoken"])
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in song_city_origin_cases
            ),
            "detail": song_city_origin_cases,
        },
        {
            "name": "just-played-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in just_played_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in just_played_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in just_played_song_actions
            ),
            "detail": {
                "states": just_played_song_states,
                "spoken": just_played_song_spoken,
                "actions": just_played_song_actions,
            },
        },
        {
            "name": "terse just-broadcast question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in terse_just_broadcast_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in terse_just_broadcast_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in terse_just_broadcast_actions
            ),
            "detail": {
                "states": terse_just_broadcast_states,
                "spoken": terse_just_broadcast_spoken,
                "actions": terse_just_broadcast_actions,
            },
        },
        {
            "name": "terse just-put-on question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in terse_just_put_on_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in terse_just_put_on_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in terse_just_put_on_actions
            ),
            "detail": {
                "states": terse_just_put_on_states,
                "spoken": terse_just_put_on_spoken,
                "actions": terse_just_put_on_actions,
            },
        },
        {
            "name": "previous-track question returns previous track without actions",
            "passed": any(
                state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                for state in previous_track_query_states
            )
            and any("上一首是东京" in text and "真夜中のドア" in text for text in previous_track_query_spoken)
            and previous_track_query_actions == [],
            "detail": {
                "states": previous_track_query_states,
                "spoken": previous_track_query_spoken,
                "actions": previous_track_query_actions,
            },
        },
        {
            "name": "terse previous-track query returns previous track without actions",
            "passed": any(
                state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                for state in terse_previous_track_query_states
            )
            and any("上一首是东京" in text and "真夜中のドア" in text for text in terse_previous_track_query_spoken)
            and terse_previous_track_query_actions == [],
            "detail": {
                "states": terse_previous_track_query_states,
                "spoken": terse_previous_track_query_spoken,
                "actions": terse_previous_track_query_actions,
            },
        },
        {
            "name": "terse short previous-track query returns previous track without actions",
            "passed": any(
                state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                for state in short_previous_track_query_states
            )
            and any("上一首是东京" in text and "真夜中のドア" in text for text in short_previous_track_query_spoken)
            and short_previous_track_query_actions == [],
            "detail": {
                "states": short_previous_track_query_states,
                "spoken": short_previous_track_query_spoken,
                "actions": short_previous_track_query_actions,
            },
        },
        {
            "name": "previous-track artist question returns previous track without actions",
            "passed": any(
                state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                for state in previous_track_artist_states
            )
            and any("松原みき" in text and "真夜中のドア" in text for text in previous_track_artist_spoken)
            and previous_track_artist_actions == [],
            "detail": {
                "states": previous_track_artist_states,
                "spoken": previous_track_artist_spoken,
                "actions": previous_track_artist_actions,
            },
        },
        {
            "name": "previous-track city-origin question returns previous track without actions",
            "passed": any(
                state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                for state in previous_track_city_origin_states
            )
            and any("上一首是东京" in text and "真夜中のドア" in text for text in previous_track_city_origin_spoken)
            and previous_track_city_origin_actions == [],
            "detail": {
                "states": previous_track_city_origin_states,
                "spoken": previous_track_city_origin_spoken,
                "actions": previous_track_city_origin_actions,
            },
        },
        {
            "name": "previous-track place-origin questions return previous track without actions",
            "passed": all(
                any(
                    state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                    for state in case["states"]
                )
                and any("上一首是东京" in text and "真夜中のドア" in text for text in case["spoken"])
                and case["actions"] == []
                for case in previous_track_place_origin_cases
            ),
            "detail": previous_track_place_origin_cases,
        },
        {
            "name": "previous-track casual title question returns previous track without actions",
            "passed": any(
                state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                for state in previous_track_casual_title_states
            )
            and any("上一首是东京" in text and "真夜中のドア" in text for text in previous_track_casual_title_spoken)
            and previous_track_casual_title_actions == [],
            "detail": {
                "states": previous_track_casual_title_states,
                "spoken": previous_track_casual_title_spoken,
                "actions": previous_track_casual_title_actions,
            },
        },
        {
            "name": "previous-track colloquial title variants return previous track without actions",
            "passed": all(
                any(
                    state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                    for state in case_states
                )
                and any("上一首是东京" in text and "真夜中のドア" in text for text in case_spoken)
                and case_actions == []
                for case_states, case_spoken, case_actions in [
                    (
                        previous_track_casual_song_states,
                        previous_track_casual_song_spoken,
                        previous_track_casual_song_actions,
                    ),
                    (
                        previous_track_earlier_title_states,
                        previous_track_earlier_title_spoken,
                        previous_track_earlier_title_actions,
                    ),
                    (
                        previous_track_previous_one_states,
                        previous_track_previous_one_spoken,
                        previous_track_previous_one_actions,
                    ),
                ]
            ),
            "detail": {
                "casualSong": {
                    "states": previous_track_casual_song_states,
                    "spoken": previous_track_casual_song_spoken,
                    "actions": previous_track_casual_song_actions,
                },
                "earlierTitle": {
                    "states": previous_track_earlier_title_states,
                    "spoken": previous_track_earlier_title_spoken,
                    "actions": previous_track_earlier_title_actions,
                },
                "previousOne": {
                    "states": previous_track_previous_one_states,
                    "spoken": previous_track_previous_one_spoken,
                    "actions": previous_track_previous_one_actions,
                },
            },
        },
        {
            "name": "bare previous-track questions return previous track without actions",
            "passed": all(
                any(
                    state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                    for state in case["states"]
                )
                and any("上一首是东京" in text and "真夜中のドア" in text for text in case["spoken"])
                and case["actions"] == []
                for case in bare_previous_track_query_cases
            ),
            "detail": bare_previous_track_query_cases,
        },
        {
            "name": "previous-track just-which-song questions return previous track without actions",
            "passed": all(
                any(
                    state.get("label") == "Now playing" and state.get("track") == "真夜中のドア"
                    for state in case["states"]
                )
                and any("上一首是东京" in text and "真夜中のドア" in text for text in case["spoken"])
                and case["actions"] == []
                for case in previous_track_just_which_song_cases
            ),
            "detail": previous_track_just_which_song_cases,
        },
        {
            "name": "casual now-playing phrase returns current track",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in casual_now_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in casual_now_spoken),
            "detail": {"states": casual_now_states, "spoken": casual_now_spoken},
        },
        {
            "name": "casual currently-playing question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in currently_playing_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in currently_playing_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in currently_playing_actions
            ),
            "detail": {
                "states": currently_playing_states,
                "spoken": currently_playing_spoken,
                "actions": currently_playing_actions,
            },
        },
        {
            "name": "natural current-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in current_song_actions
            ),
            "detail": {
                "states": current_song_states,
                "spoken": current_song_spoken,
                "actions": current_song_actions,
            },
        },
        {
            "name": "casual current-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in casual_current_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in casual_current_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in casual_current_song_actions
            ),
            "detail": {
                "states": casual_current_song_states,
                "spoken": casual_current_song_spoken,
                "actions": casual_current_song_actions,
            },
        },
        {
            "name": "present-is-song questions return current track without actions",
            "passed": all(
                any(
                    state.get("track") == "Plastic Love"
                    and state.get("label") == "Now playing"
                    and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("现在在东京" in text and "Plastic Love" in text for text in case["spoken"])
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in present_is_song_cases
            ),
            "detail": present_is_song_cases,
        },
        {
            "name": "casual current-singing question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_singing_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_singing_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in current_singing_actions
            ),
            "detail": {
                "states": current_singing_states,
                "spoken": current_singing_spoken,
                "actions": current_singing_actions,
            },
        },
        {
            "name": "current-singing-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_singing_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_singing_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in current_singing_song_actions
            ),
            "detail": {
                "states": current_singing_song_states,
                "spoken": current_singing_song_spoken,
                "actions": current_singing_song_actions,
            },
        },
        {
            "name": "currently-singing-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in currently_singing_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in currently_singing_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in currently_singing_song_actions
            ),
            "detail": {
                "states": currently_singing_song_states,
                "spoken": currently_singing_song_spoken,
                "actions": currently_singing_song_actions,
            },
        },
        {
            "name": "demonstrative current-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in demonstrative_current_song_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in demonstrative_current_song_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in demonstrative_current_song_actions
            ),
            "detail": {
                "states": demonstrative_current_song_states,
                "spoken": demonstrative_current_song_spoken,
                "actions": demonstrative_current_song_actions,
            },
        },
        {
            "name": "playback-position phrase returns current track",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in playback_position_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in playback_position_spoken),
            "detail": {"states": playback_position_states, "spoken": playback_position_spoken},
        },
        {
            "name": "natural artist question returns current track",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_artist_states
            ),
            "detail": now_artist_states,
        },
        {
            "name": "casual who-sings-this question returns current track",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in who_sings_this_states
            ),
            "detail": who_sings_this_states,
        },
        {
            "name": "terse whose-song question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in terse_whose_song_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in terse_whose_song_actions),
            "detail": {"states": terse_whose_song_states, "actions": terse_whose_song_actions},
        },
        {
            "name": "short current-artist question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in short_artist_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_artist_actions),
            "detail": {"states": short_artist_states, "actions": short_artist_actions},
        },
        {
            "name": "shorter current-artist question returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in shorter_artist_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in shorter_artist_actions),
            "detail": {"states": shorter_artist_states, "actions": shorter_artist_actions},
        },
        {
            "name": "casual current-artist phrase returns current track",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in casual_artist_states
            ),
            "detail": casual_artist_states,
        },
        {
            "name": "casual current-song-artist phrase returns current track without actions",
            "passed": any(
                state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in casual_song_artist_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_song_artist_actions),
            "detail": {"states": casual_song_artist_states, "actions": casual_song_artist_actions},
        },
        {
            "name": "owner/origin current-song followups return current track without actions",
            "passed": all(
                any(
                    state.get("track") == "Plastic Love"
                    and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in current_owner_origin_cases
            ),
            "detail": current_owner_origin_cases,
        },
        {
            "name": "natural current-city question returns current track",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_city_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in now_city_spoken),
            "detail": {"states": now_city_states, "spoken": now_city_spoken},
        },
        {
            "name": "this-moment broadcast-city question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in this_moment_broadcast_city_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in this_moment_broadcast_city_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in this_moment_broadcast_city_actions
            ),
            "detail": {
                "states": this_moment_broadcast_city_states,
                "spoken": this_moment_broadcast_city_spoken,
                "actions": this_moment_broadcast_city_actions,
            },
        },
        {
            "name": "casual where-here question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_here_casual_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in now_here_casual_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in now_here_casual_actions),
            "detail": {
                "states": now_here_casual_states,
                "spoken": now_here_casual_spoken,
                "actions": now_here_casual_actions,
            },
        },
        {
            "name": "natural current-place question returns current track",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_place_states
            ),
            "detail": now_place_states,
        },
        {
            "name": "natural where-are-we-now question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in where_are_we_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in where_are_we_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in where_are_we_actions),
            "detail": {"states": where_are_we_states, "spoken": where_are_we_spoken, "actions": where_are_we_actions},
        },
        {
            "name": "short where-are-we-now question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in short_where_are_we_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in short_where_are_we_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_where_are_we_actions),
            "detail": {
                "states": short_where_are_we_states,
                "spoken": short_where_are_we_spoken,
                "actions": short_where_are_we_actions,
            },
        },
        {
            "name": "terse current-stop-index questions return current track without actions",
            "passed": all(
                any(
                    state.get("city") == "东京"
                    and state.get("track") == "Plastic Love"
                    and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("现在在东京" in text and "Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in terse_stop_index_cases
            ),
            "detail": terse_stop_index_cases,
        },
        {
            "name": "casual where-now question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_where_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in now_where_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in now_where_actions),
            "detail": {"states": now_where_states, "spoken": now_where_spoken, "actions": now_where_actions},
        },
        {
            "name": "presently-current-location questions return current track without actions",
            "passed": all(
                any(
                    state.get("city") == "东京"
                    and state.get("track") == "Plastic Love"
                    and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("现在在东京" in text and "Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in presently_where_cases
            ),
            "detail": presently_where_cases,
        },
        {
            "name": "terse arrived-where questions return current track without actions",
            "passed": all(
                any(
                    state.get("city") == "东京"
                    and state.get("track") == "Plastic Love"
                    and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("现在在东京" in text and "Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in terse_arrived_where_cases
            ),
            "detail": terse_arrived_where_cases,
        },
        {
            "name": "current-place no-verb question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_place_no_verb_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in now_place_no_verb_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in now_place_no_verb_actions),
            "detail": {
                "states": now_place_no_verb_states,
                "spoken": now_place_no_verb_spoken,
                "actions": now_place_no_verb_actions,
            },
        },
        {
            "name": "arrival-city question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in arrival_city_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in arrival_city_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in arrival_city_actions),
            "detail": {
                "states": arrival_city_states,
                "spoken": arrival_city_spoken,
                "actions": arrival_city_actions,
            },
        },
        {
            "name": "current-stop-index question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_stop_index_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_stop_index_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in current_stop_index_actions),
            "detail": {
                "states": current_stop_index_states,
                "spoken": current_stop_index_spoken,
                "actions": current_stop_index_actions,
            },
        },
        {
            "name": "current-stop-which question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_stop_which_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_stop_which_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in current_stop_which_actions),
            "detail": {
                "states": current_stop_which_states,
                "spoken": current_stop_which_spoken,
                "actions": current_stop_which_actions,
            },
        },
        {
            "name": "current-stop-short question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_stop_short_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_stop_short_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in current_stop_short_actions),
            "detail": {
                "states": current_stop_short_states,
                "spoken": current_stop_short_spoken,
                "actions": current_stop_short_actions,
            },
        },
        {
            "name": "current-stop-name question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_stop_name_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_stop_name_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in current_stop_name_actions),
            "detail": {
                "states": current_stop_name_states,
                "spoken": current_stop_name_spoken,
                "actions": current_stop_name_actions,
            },
        },
        {
            "name": "current-city-name question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in current_city_name_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in current_city_name_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in current_city_name_actions),
            "detail": {
                "states": current_city_name_states,
                "spoken": current_city_name_spoken,
                "actions": current_city_name_actions,
            },
        },
        {
            "name": "terse current-stop question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in terse_current_stop_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in terse_current_stop_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in terse_current_stop_actions),
            "detail": {
                "states": terse_current_stop_states,
                "spoken": terse_current_stop_spoken,
                "actions": terse_current_stop_actions,
            },
        },
        {
            "name": "casual current-place name questions return current track without actions",
            "passed": all(
                any(
                    state.get("city") == "东京"
                    and state.get("track") == "Plastic Love"
                    and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                    for state in case_states
                )
                and any("现在在东京" in text and "Plastic Love" in text for text in case_spoken)
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions)
                for case_states, case_spoken, case_actions in [
                    (current_stop_casual_name_states, current_stop_casual_name_spoken, current_stop_casual_name_actions),
                    (current_stop_explicit_name_states, current_stop_explicit_name_spoken, current_stop_explicit_name_actions),
                    (first_person_current_stop_states, first_person_current_stop_spoken, first_person_current_stop_actions),
                    (current_city_casual_name_states, current_city_casual_name_spoken, current_city_casual_name_actions),
                    (here_casual_name_states, here_casual_name_spoken, here_casual_name_actions),
                    *[
                        (case["states"], case["spoken"], case["actions"])
                        for case in extra_current_place_name_cases
                    ],
                ]
            ),
            "detail": {
                "stopCasual": {"states": current_stop_casual_name_states, "spoken": current_stop_casual_name_spoken, "actions": current_stop_casual_name_actions},
                "stopExplicit": {"states": current_stop_explicit_name_states, "spoken": current_stop_explicit_name_spoken, "actions": current_stop_explicit_name_actions},
                "firstPersonStop": {"states": first_person_current_stop_states, "spoken": first_person_current_stop_spoken, "actions": first_person_current_stop_actions},
                "cityCasual": {"states": current_city_casual_name_states, "spoken": current_city_casual_name_spoken, "actions": current_city_casual_name_actions},
                "hereCasual": {"states": here_casual_name_states, "spoken": here_casual_name_spoken, "actions": here_casual_name_actions},
                "extraCurrentPlaceNames": extra_current_place_name_cases,
            },
        },
        {
            "name": "natural here-city question returns current track",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in now_here_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in now_here_spoken),
            "detail": {"states": now_here_states, "spoken": now_here_spoken},
        },
        {
            "name": "short this-place question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in short_this_place_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in short_this_place_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_this_place_actions),
            "detail": {
                "states": short_this_place_states,
                "spoken": short_this_place_spoken,
                "actions": short_this_place_actions,
            },
        },
        {
            "name": "short here-place question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in short_here_place_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in short_here_place_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_here_place_actions),
            "detail": {
                "states": short_here_place_states,
                "spoken": short_here_place_spoken,
                "actions": short_here_place_actions,
            },
        },
        {
            "name": "short here-location question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in short_here_location_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in short_here_location_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_here_location_actions),
            "detail": {
                "states": short_here_location_states,
                "spoken": short_here_location_spoken,
                "actions": short_here_location_actions,
            },
        },
        {
            "name": "casual place-location question returns current track without actions",
            "passed": any(
                state.get("city") == "东京"
                and state.get("track") == "Plastic Love"
                and "竹内まりや - Plastic Love" in str(state.get("message") or "")
                for state in place_location_states
            )
            and any("现在在东京" in text and "Plastic Love" in text for text in place_location_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in place_location_actions),
            "detail": {
                "states": place_location_states,
                "spoken": place_location_spoken,
                "actions": place_location_actions,
            },
        },
        {
            "name": "song story question speaks the current track story",
            "passed": any(state.get("label") == "Song story" and state.get("track") == "Plastic Love" for state in story_states)
            and any("Plastic Love" in text for text in story_spoken),
            "detail": {"states": story_states, "spoken": story_spoken},
        },
        {
            "name": "text-only song story question writes the current track story without speech",
            "passed": any(
                state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                for state in text_only_story_states
            )
            and text_only_story_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in text_only_story_actions),
            "detail": {
                "states": text_only_story_states,
                "spoken": text_only_story_spoken,
                "actions": text_only_story_actions,
            },
        },
        {
            "name": "casual song story variants speak the current track story without actions",
            "passed": all(
                any(
                    state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                    for state in case["states"]
                )
                and any("Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in story_variant_cases
            ),
            "detail": story_variant_cases,
        },
        {
            "name": "song-origin question speaks the current track story",
            "passed": any(state.get("label") == "Song story" and state.get("track") == "Plastic Love" for state in song_origin_states)
            and any("Plastic Love" in text for text in song_origin_spoken),
            "detail": {"states": song_origin_states, "spoken": song_origin_spoken},
        },
        {
            "name": "casual song-origin question speaks the current track story without actions",
            "passed": any(
                state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                for state in song_casual_origin_states
            )
            and any("Plastic Love" in text for text in song_casual_origin_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in song_casual_origin_actions),
            "detail": {
                "states": song_casual_origin_states,
                "spoken": song_casual_origin_spoken,
                "actions": song_casual_origin_actions,
            },
        },
        {
            "name": "casual song-origin variants speak the current track story without actions",
            "passed": all(
                any(
                    state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                    for state in case["states"]
                )
                and any("Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in song_origin_extra_cases
            ),
            "detail": song_origin_extra_cases,
        },
        {
            "name": "why-this-song question speaks the current track story",
            "passed": any(state.get("label") == "Song story" and state.get("track") == "Plastic Love" for state in why_song_states)
            and any("Plastic Love" in text for text in why_song_spoken),
            "detail": {"states": why_song_states, "spoken": why_song_spoken},
        },
        {
            "name": "casual why-this-song question speaks the current track story without actions",
            "passed": any(
                state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                for state in casual_why_song_states
            )
            and any("Plastic Love" in text for text in casual_why_song_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_why_song_actions),
            "detail": {
                "states": casual_why_song_states,
                "spoken": casual_why_song_spoken,
                "actions": casual_why_song_actions,
            },
        },
        {
            "name": "casual song-choice questions speak the current track story without actions",
            "passed": all(
                any(
                    state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                    for state in case["states"]
                )
                and any("Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in casual_song_choice_cases
            ),
            "detail": casual_song_choice_cases,
        },
        {
            "name": "song-city relation questions speak the current track story without actions",
            "passed": all(
                any(
                    state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                    for state in case["states"]
                )
                and any("Plastic Love" in text for text in case["spoken"])
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in song_city_relation_cases
            ),
            "detail": song_city_relation_cases,
        },
        {
            "name": "song-writer question speaks the current track story without actions",
            "passed": any(state.get("label") == "Song story" and state.get("track") == "Plastic Love" for state in song_writer_states)
            and any("Plastic Love" in text for text in song_writer_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in song_writer_actions),
            "detail": {
                "states": song_writer_states,
                "spoken": song_writer_spoken,
                "actions": song_writer_actions,
            },
        },
        {
            "name": "song-composer question speaks the current track story without actions",
            "passed": any(state.get("label") == "Song story" and state.get("track") == "Plastic Love" for state in song_composer_states)
            and any("Plastic Love" in text for text in song_composer_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in song_composer_actions),
            "detail": {
                "states": song_composer_states,
                "spoken": song_composer_spoken,
                "actions": song_composer_actions,
            },
        },
        {
            "name": "song-lyricist question speaks the current track story without actions",
            "passed": any(state.get("label") == "Song story" and state.get("track") == "Plastic Love" for state in song_lyricist_states)
            and any("Plastic Love" in text for text in song_lyricist_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in song_lyricist_actions),
            "detail": {
                "states": song_lyricist_states,
                "spoken": song_lyricist_spoken,
                "actions": song_lyricist_actions,
            },
        },
        {
            "name": "this-composer question speaks the current track story without actions",
            "passed": any(
                state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                for state in this_composer_states
            )
            and any("Plastic Love" in text for text in this_composer_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in this_composer_actions),
            "detail": {
                "states": this_composer_states,
                "spoken": this_composer_spoken,
                "actions": this_composer_actions,
            },
        },
        {
            "name": "song-meaning question speaks the current track story without actions",
            "passed": any(state.get("label") == "Song story" and state.get("track") == "Plastic Love" for state in song_meaning_states)
            and any("Plastic Love" in text for text in song_meaning_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in song_meaning_actions),
            "detail": {
                "states": song_meaning_states,
                "spoken": song_meaning_spoken,
                "actions": song_meaning_actions,
            },
        },
        {
            "name": "casual song-meaning questions speak the current track story without actions",
            "passed": all(
                any(
                    state.get("label") == "Song story" and state.get("track") == "Plastic Love"
                    for state in case["states"]
                )
                and any("Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in song_meaning_variant_cases
            ),
            "detail": song_meaning_variant_cases,
        },
        {
            "name": "current city story question speaks the active city context",
            "passed": any(state.get("label") == "City story" and state.get("track") == "东京" for state in current_city_story_states)
            and any("霓虹、晚风" in text and "Plastic Love" in text for text in current_city_story_spoken),
            "detail": {"states": current_city_story_states, "spoken": current_city_story_spoken},
        },
        {
            "name": "text-only city story question writes the active city context without speech",
            "passed": any(
                state.get("label") == "City story" and state.get("track") == "东京"
                for state in text_only_city_story_states
            )
            and text_only_city_story_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in text_only_city_story_actions
            ),
            "detail": {
                "states": text_only_city_story_states,
                "spoken": text_only_city_story_spoken,
                "actions": text_only_city_story_actions,
            },
        },
        {
            "name": "natural here-story question speaks the active city context",
            "passed": any(state.get("label") == "City story" and state.get("track") == "东京" for state in here_story_states)
            and any("霓虹、晚风" in text and "Plastic Love" in text for text in here_story_spoken),
            "detail": {"states": here_story_states, "spoken": here_story_spoken},
        },
        {
            "name": "current stop and sunset story questions speak the active city context without actions",
            "passed": all(
                any(
                    state.get("label") == "City story" and state.get("track") == "东京"
                    for state in case["states"]
                )
                and any("霓虹、晚风" in text and "Plastic Love" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in current_sunset_story_cases
            ),
            "detail": current_sunset_story_cases,
        },
        {
            "name": "current-stop meaning question speaks the active city context without actions",
            "passed": any(
                state.get("label") == "City story" and state.get("track") == "东京"
                for state in current_stop_meaning_states
            )
            and any("霓虹、晚风" in text and "Plastic Love" in text for text in current_stop_meaning_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in current_stop_meaning_actions),
            "detail": {
                "states": current_stop_meaning_states,
                "spoken": current_stop_meaning_spoken,
                "actions": current_stop_meaning_actions,
            },
        },
        {
            "name": "natural here-feeling question speaks the active city context",
            "passed": any(state.get("label") == "City story" and state.get("track") == "东京" for state in here_feeling_states)
            and any("霓虹、晚风" in text and "Plastic Love" in text for text in here_feeling_spoken),
            "detail": {"states": here_feeling_states, "spoken": here_feeling_spoken},
        },
        {
            "name": "natural here-origin question speaks the active city context",
            "passed": any(state.get("label") == "City story" and state.get("track") == "东京" for state in here_origin_states)
            and any("霓虹、晚风" in text and "Plastic Love" in text for text in here_origin_spoken),
            "detail": {"states": here_origin_states, "spoken": here_origin_spoken},
        },
        {
            "name": "casual place-origin question speaks the active city context",
            "passed": any(state.get("label") == "City story" and state.get("track") == "东京" for state in place_origin_states)
            and any("霓虹、晚风" in text and "Plastic Love" in text for text in place_origin_spoken),
            "detail": {"states": place_origin_states, "spoken": place_origin_spoken},
        },
        {
            "name": "casual city-origin/story questions speak the active city context",
            "passed": all(
                any(state.get("label") == "City story" and state.get("track") == "东京" for state in case_states)
                and any("霓虹、晚风" in text and "Plastic Love" in text for text in case_spoken)
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case_actions)
                for case_states, case_spoken, case_actions in [
                    (short_city_origin_states, short_city_origin_spoken, short_city_origin_actions),
                    (casual_city_story_states, casual_city_story_spoken, casual_city_story_actions),
                ]
            ),
            "detail": {
                "shortOrigin": {
                    "states": short_city_origin_states,
                    "spoken": short_city_origin_spoken,
                    "actions": short_city_origin_actions,
                },
                "casualStory": {
                    "states": casual_city_story_states,
                    "spoken": casual_city_story_spoken,
                    "actions": casual_city_story_actions,
                },
            },
        },
        {
            "name": "repeat-last phrase republishes the remembered reply",
            "passed": any(
                state.get("label") == "上一句"
                and state.get("track") == "东京"
                and state.get("message") == last_reply_seed["message"]
                for state in repeat_last_states
            )
            and repeat_last_spoken == [last_reply_seed["message"]]
            and repeat_last_memory == last_reply_seed,
            "detail": {
                "states": repeat_last_states,
                "spoken": repeat_last_spoken,
                "memory": repeat_last_memory,
            },
        },
        {
            "name": "quiet-prefixed repeat-last stays screen-only",
            "passed": all(
                any(
                    state.get("label") == "上一句"
                    and state.get("track") == "东京"
                    and state.get("message") == last_reply_seed["message"]
                    for state in case_states
                )
                and case_spoken == []
                and case_memory == last_reply_seed
                for case_states, case_spoken, case_memory in [
                    (quiet_repeat_last_states, quiet_repeat_last_spoken, quiet_repeat_last_memory),
                    (screen_repeat_last_states, screen_repeat_last_spoken, screen_repeat_last_memory),
                ]
            ),
            "detail": {
                "quiet": {"states": quiet_repeat_last_states, "spoken": quiet_repeat_last_spoken},
                "screen": {"states": screen_repeat_last_states, "spoken": screen_repeat_last_spoken},
            },
        },
        {
            "name": "repeat-last stays screen-only in soft mute",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("track") == "东京"
                and state.get("message") == f"静音中：{last_reply_seed['message']}"
                for state in muted_repeat_last_states
            )
            and muted_repeat_last_spoken == []
            and muted_repeat_last_memory == last_reply_seed,
            "detail": {
                "states": muted_repeat_last_states,
                "spoken": muted_repeat_last_spoken,
                "memory": muted_repeat_last_memory,
            },
        },
        {
            "name": "casual what-did-you-say phrases repeat the remembered reply",
            "passed": any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in casual_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in just_said_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in casual_reply_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in just_replied_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in terse_replied_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in inverted_replied_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in reply_what_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in previous_replied_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in short_previous_replied_repeat_states)
            and any(state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"] for state in previous_reply_states)
            and casual_repeat_spoken == [last_reply_seed["message"]]
            and just_said_repeat_spoken == [last_reply_seed["message"]]
            and casual_reply_repeat_spoken == [last_reply_seed["message"]]
            and just_replied_repeat_spoken == [last_reply_seed["message"]]
            and terse_replied_repeat_spoken == [last_reply_seed["message"]]
            and inverted_replied_repeat_spoken == [last_reply_seed["message"]]
            and reply_what_repeat_spoken == [last_reply_seed["message"]]
            and previous_replied_repeat_spoken == [last_reply_seed["message"]]
            and short_previous_replied_repeat_spoken == [last_reply_seed["message"]]
            and previous_reply_spoken == [last_reply_seed["message"]]
            and casual_repeat_memory == last_reply_seed
            and just_said_repeat_memory == last_reply_seed
            and casual_reply_repeat_memory == last_reply_seed
            and just_replied_repeat_memory == last_reply_seed
            and terse_replied_repeat_memory == last_reply_seed
            and inverted_replied_repeat_memory == last_reply_seed
            and reply_what_repeat_memory == last_reply_seed
            and previous_replied_repeat_memory == last_reply_seed
            and short_previous_replied_repeat_memory == last_reply_seed
            and previous_reply_memory == last_reply_seed,
            "detail": {
                "casualStates": casual_repeat_states,
                "casualSpoken": casual_repeat_spoken,
                "justSaidStates": just_said_repeat_states,
                "justSaidSpoken": just_said_repeat_spoken,
                "casualReplyStates": casual_reply_repeat_states,
                "casualReplySpoken": casual_reply_repeat_spoken,
                "justRepliedStates": just_replied_repeat_states,
                "justRepliedSpoken": just_replied_repeat_spoken,
                "terseRepliedStates": terse_replied_repeat_states,
                "terseRepliedSpoken": terse_replied_repeat_spoken,
                "invertedRepliedStates": inverted_replied_repeat_states,
                "invertedRepliedSpoken": inverted_replied_repeat_spoken,
                "replyWhatStates": reply_what_repeat_states,
                "replyWhatSpoken": reply_what_repeat_spoken,
                "previousRepliedStates": previous_replied_repeat_states,
                "previousRepliedSpoken": previous_replied_repeat_spoken,
                "shortPreviousRepliedStates": short_previous_replied_repeat_states,
                "shortPreviousRepliedSpoken": short_previous_replied_repeat_spoken,
                "previousReplyStates": previous_reply_states,
                "previousReplySpoken": previous_reply_spoken,
            },
        },
        {
            "name": "text-only repeat-last suffix displays previous reply without speech",
            "passed": any(
                state.get("label") == "上一句" and state.get("message") == last_reply_seed["message"]
                for state in text_only_repeat_last_states
            )
            and text_only_repeat_last_spoken == []
            and text_only_repeat_last_memory == last_reply_seed,
            "detail": {
                "states": text_only_repeat_last_states,
                "spoken": text_only_repeat_last_spoken,
                "memory": text_only_repeat_last_memory,
            },
        },
        {
            "name": "last-action phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in last_action_states
            )
            and any("上一轮调用：城市故事" in text for text in last_action_spoken)
            and last_action_memory == last_reply_seed,
            "detail": {
                "states": last_action_states,
                "spoken": last_action_spoken,
                "memory": last_action_memory,
            },
        },
        {
            "name": "text-only last-action suffix writes remembered route without speech",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in text_only_last_action_states
            )
            and text_only_last_action_spoken == []
            and text_only_last_action_memory == last_reply_seed,
            "detail": {
                "states": text_only_last_action_states,
                "spoken": text_only_last_action_spoken,
                "memory": text_only_last_action_memory,
            },
        },
        {
            "name": "quiet-prefixed last-action phrase stays screen-only",
            "passed": all(
                any(
                    state.get("label") == "上一动作"
                    and state.get("city") == "技能路由"
                    and "上一轮调用：城市故事" in str(state.get("message") or "")
                    and "目标：东京" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and case["memory"] == last_reply_seed
                for case in quiet_last_action_cases
            ),
            "detail": {"cases": quiet_last_action_cases},
        },
        {
            "name": "natural last-action phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in natural_last_action_states
            )
            and any("上一轮调用：城市故事" in text for text in natural_last_action_spoken)
            and natural_last_action_memory == last_reply_seed,
            "detail": {
                "states": natural_last_action_states,
                "spoken": natural_last_action_spoken,
                "memory": natural_last_action_memory,
            },
        },
        {
            "name": "casual last-action phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in casual_last_action_states
            )
            and any("上一轮调用：城市故事" in text for text in casual_last_action_spoken)
            and casual_last_action_memory == last_reply_seed,
            "detail": {
                "states": casual_last_action_states,
                "spoken": casual_last_action_spoken,
                "memory": casual_last_action_memory,
            },
        },
        {
            "name": "terse just-action phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in terse_just_action_states
            )
            and any("上一轮调用：城市故事" in text for text in terse_just_action_spoken)
            and terse_just_action_memory == last_reply_seed,
            "detail": {
                "states": terse_just_action_states,
                "spoken": terse_just_action_spoken,
                "memory": terse_just_action_memory,
            },
        },
        {
            "name": "executed-action phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in executed_action_states
            )
            and any("上一轮调用：城市故事" in text for text in executed_action_spoken)
            and executed_action_memory == last_reply_seed,
            "detail": {
                "states": executed_action_states,
                "spoken": executed_action_spoken,
                "memory": executed_action_memory,
            },
        },
        {
            "name": "last-capability phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in last_capability_states
            )
            and any("上一轮调用：城市故事" in text for text in last_capability_spoken)
            and last_capability_memory == last_reply_seed,
            "detail": {
                "states": last_capability_states,
                "spoken": last_capability_spoken,
                "memory": last_capability_memory,
            },
        },
        {
            "name": "last-tool phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in last_tool_states
            )
            and any("上一轮调用：城市故事" in text for text in last_tool_spoken)
            and last_tool_memory == last_reply_seed,
            "detail": {
                "states": last_tool_states,
                "spoken": last_tool_spoken,
                "memory": last_tool_memory,
            },
        },
        {
            "name": "casual previous-tool phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in casual_previous_tool_states
            )
            and any("上一轮调用：城市故事" in text for text in casual_previous_tool_spoken)
            and casual_previous_tool_memory == last_reply_seed,
            "detail": {
                "states": casual_previous_tool_states,
                "spoken": casual_previous_tool_spoken,
                "memory": casual_previous_tool_memory,
            },
        },
        {
            "name": "terse previous-tool phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in terse_previous_tool_states
            )
            and any("上一轮调用：城市故事" in text for text in terse_previous_tool_spoken)
            and terse_previous_tool_memory == last_reply_seed,
            "detail": {
                "states": terse_previous_tool_states,
                "spoken": terse_previous_tool_spoken,
                "memory": terse_previous_tool_memory,
            },
        },
        {
            "name": "terse previous-capability phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in terse_previous_capability_states
            )
            and any("上一轮调用：城市故事" in text for text in terse_previous_capability_spoken)
            and terse_previous_capability_memory == last_reply_seed,
            "detail": {
                "states": terse_previous_capability_states,
                "spoken": terse_previous_capability_spoken,
                "memory": terse_previous_capability_memory,
            },
        },
        {
            "name": "last-route-tool phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in last_route_tool_states
            )
            and any("上一轮调用：城市故事" in text for text in last_route_tool_spoken)
            and last_route_tool_memory == last_reply_seed,
            "detail": {
                "states": last_route_tool_states,
                "spoken": last_route_tool_spoken,
                "memory": last_route_tool_memory,
            },
        },
        {
            "name": "short previous-route-tool phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in short_route_tool_states
            )
            and any("上一轮调用：城市故事" in text for text in short_route_tool_spoken)
            and short_route_tool_memory == last_reply_seed,
            "detail": {
                "states": short_route_tool_states,
                "spoken": short_route_tool_spoken,
                "memory": short_route_tool_memory,
            },
        },
        {
            "name": "short previous-used-tool phrase explains the remembered skill route",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "目标：东京" in str(state.get("message") or "")
                for state in short_used_tool_states
            )
            and any("上一轮调用：城市故事" in text for text in short_used_tool_spoken)
            and short_used_tool_memory == last_reply_seed,
            "detail": {
                "states": short_used_tool_states,
                "spoken": short_used_tool_spoken,
                "memory": short_used_tool_memory,
            },
        },
        {
            "name": "previous-route destination phrases explain the remembered skill route",
            "passed": all(
                any(
                    state.get("label") == "上一动作"
                    and state.get("city") == "技能路由"
                    and "上一轮调用：城市故事" in str(state.get("message") or "")
                    and "目标：东京" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("上一轮调用：城市故事" in text for text in case["spoken"])
                and case["memory"] == last_reply_seed
                for case in route_destination_cases
            ),
            "detail": route_destination_cases,
        },
        {
            "name": "last-result phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "运行状态：idle" in str(state.get("message") or "")
                and "结果：东京：霓虹、晚风和城市流行的黄昏。" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in last_result_states
            )
            and any(
                "结果：东京：霓虹、晚风和城市流行的黄昏。" in text
                and "状态：已回写到屏幕" in text
                for text in last_result_spoken
            )
            and last_result_memory == last_reply_seed,
            "detail": {
                "states": last_result_states,
                "spoken": last_result_spoken,
                "memory": last_result_memory,
            },
        },
        {
            "name": "previous-result phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_result_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_result_spoken)
            and previous_result_memory == last_reply_seed,
            "detail": {
                "states": previous_result_states,
                "spoken": previous_result_spoken,
                "memory": previous_result_memory,
            },
        },
        {
            "name": "short previous-result phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in short_previous_result_states
            )
            and any("状态：已回写到屏幕" in text for text in short_previous_result_spoken)
            and short_previous_result_memory == last_reply_seed,
            "detail": {
                "states": short_previous_result_states,
                "spoken": short_previous_result_spoken,
                "memory": short_previous_result_memory,
            },
        },
        {
            "name": "previous-step result phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_step_result_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_step_result_spoken)
            and previous_step_result_memory == last_reply_seed,
            "detail": {
                "states": previous_step_result_states,
                "spoken": previous_step_result_spoken,
                "memory": previous_step_result_memory,
            },
        },
        {
            "name": "casual previous-item result phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_item_result_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_item_result_spoken)
            and previous_item_result_memory == last_reply_seed,
            "detail": {
                "states": previous_item_result_states,
                "spoken": previous_item_result_spoken,
                "memory": previous_item_result_memory,
            },
        },
        {
            "name": "casual previous-item status phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_item_status_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_item_status_spoken)
            and previous_item_status_memory == last_reply_seed,
            "detail": {
                "states": previous_item_status_states,
                "spoken": previous_item_status_spoken,
                "memory": previous_item_status_memory,
            },
        },
        {
            "name": "casual previous-status phrases report remembered route status",
            "passed": all(
                any(
                    state.get("label") == "上一动作"
                    and state.get("city") == "技能路由"
                    and "上一轮调用：城市故事" in str(state.get("message") or "")
                    and "状态：已回写到屏幕" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("状态：已回写到屏幕" in text for text in case["spoken"])
                and case["memory"] == last_reply_seed
                for case in previous_thing_status_cases
            ),
            "detail": previous_thing_status_cases,
        },
        {
            "name": "last-success phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in last_success_states
            )
            and any("状态：已回写到屏幕" in text for text in last_success_spoken)
            and last_success_memory == last_reply_seed,
            "detail": {
                "states": last_success_states,
                "spoken": last_success_spoken,
                "memory": last_success_memory,
            },
        },
        {
            "name": "casual last-success phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in casual_success_states
            )
            and any("状态：已回写到屏幕" in text for text in casual_success_spoken)
            and casual_success_memory == last_reply_seed,
            "detail": {
                "states": casual_success_states,
                "spoken": casual_success_spoken,
                "memory": casual_success_memory,
            },
        },
        {
            "name": "previous-step success phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_step_success_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_step_success_spoken)
            and previous_step_success_memory == last_reply_seed,
            "detail": {
                "states": previous_step_success_states,
                "spoken": previous_step_success_spoken,
                "memory": previous_step_success_memory,
            },
        },
        {
            "name": "previous-step done phrases report remembered route status",
            "passed": all(
                any(
                    state.get("label") == "上一动作"
                    and state.get("city") == "技能路由"
                    and "上一轮调用：城市故事" in str(state.get("message") or "")
                    and "状态：已回写到屏幕" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("状态：已回写到屏幕" in text for text in case["spoken"])
                and case["memory"] == last_reply_seed
                for case in previous_step_done_cases
            ),
            "detail": previous_step_done_cases,
        },
        {
            "name": "natural last-action follow-up phrases report remembered route status",
            "passed": all(
                any(
                    state.get("label") == "上一动作"
                    and state.get("city") == "技能路由"
                    and "上一轮调用：城市故事" in str(state.get("message") or "")
                    and "状态：已回写到屏幕" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and any("状态：已回写到屏幕" in text for text in case["spoken"])
                and case["memory"] == last_reply_seed
                for case in last_action_followup_cases
            ),
            "detail": last_action_followup_cases,
        },
        {
            "name": "terse previous-item success phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in terse_previous_item_success_states
            )
            and any("状态：已回写到屏幕" in text for text in terse_previous_item_success_spoken)
            and terse_previous_item_success_memory == last_reply_seed,
            "detail": {
                "states": terse_previous_item_success_states,
                "spoken": terse_previous_item_success_spoken,
                "memory": terse_previous_item_success_memory,
            },
        },
        {
            "name": "previous-command success phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_success_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_success_spoken)
            and previous_success_memory == last_reply_seed,
            "detail": {
                "states": previous_success_states,
                "spoken": previous_success_spoken,
                "memory": previous_success_memory,
            },
        },
        {
            "name": "short previous-command success phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in short_previous_success_states
            )
            and any("状态：已回写到屏幕" in text for text in short_previous_success_spoken)
            and short_previous_success_memory == last_reply_seed,
            "detail": {
                "states": short_previous_success_states,
                "spoken": short_previous_success_spoken,
                "memory": short_previous_success_memory,
            },
        },
        {
            "name": "casual previous-item done phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_item_done_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_item_done_spoken)
            and previous_item_done_memory == last_reply_seed,
            "detail": {
                "states": previous_item_done_states,
                "spoken": previous_item_done_spoken,
                "memory": previous_item_done_memory,
            },
        },
        {
            "name": "terse previous-item done phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in terse_previous_item_done_states
            )
            and any("状态：已回写到屏幕" in text for text in terse_previous_item_done_spoken)
            and terse_previous_item_done_memory == last_reply_seed,
            "detail": {
                "states": terse_previous_item_done_states,
                "spoken": terse_previous_item_done_spoken,
                "memory": terse_previous_item_done_memory,
            },
        },
        {
            "name": "last-action failure phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in last_failure_states
            )
            and any("状态：已回写到屏幕" in text for text in last_failure_spoken)
            and last_failure_memory == last_reply_seed,
            "detail": {
                "states": last_failure_states,
                "spoken": last_failure_spoken,
                "memory": last_failure_memory,
            },
        },
        {
            "name": "previous-command failure phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in previous_failure_states
            )
            and any("状态：已回写到屏幕" in text for text in previous_failure_spoken)
            and previous_failure_memory == last_reply_seed,
            "detail": {
                "states": previous_failure_states,
                "spoken": previous_failure_spoken,
                "memory": previous_failure_memory,
            },
        },
        {
            "name": "short previous-command failure phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in short_previous_failure_states
            )
            and any("状态：已回写到屏幕" in text for text in short_previous_failure_spoken)
            and short_previous_failure_memory == last_reply_seed,
            "detail": {
                "states": short_previous_failure_states,
                "spoken": short_previous_failure_spoken,
                "memory": short_previous_failure_memory,
            },
        },
        {
            "name": "short previous-command not-success phrase reports remembered route status",
            "passed": any(
                state.get("label") == "上一动作"
                and state.get("city") == "技能路由"
                and "上一轮调用：城市故事" in str(state.get("message") or "")
                and "状态：已回写到屏幕" in str(state.get("message") or "")
                for state in short_previous_not_success_states
            )
            and any("状态：已回写到屏幕" in text for text in short_previous_not_success_spoken)
            and short_previous_not_success_memory == last_reply_seed,
            "detail": {
                "states": short_previous_not_success_states,
                "spoken": short_previous_not_success_spoken,
                "memory": short_previous_not_success_memory,
            },
        },
        {
            "name": "last-heard phrase reports the previous voice transcript",
            "passed": last_voice_seed_text == "讲讲这座城市"
            and last_voice_text_after_query == "讲讲这座城市"
            and last_voice_text_after_clarity_query == "讲讲这座城市"
            and last_voice_text_after_direct_clarity_query == "讲讲这座城市"
            and all(case["memory"] == "讲讲这座城市" for case in natural_last_heard_status_cases)
            and last_voice_text_after_understood_as == "讲讲这座城市"
            and last_voice_text_after_previous_understood_as == "讲讲这座城市"
            and last_voice_text_after_natural_query == "讲讲这座城市"
            and last_voice_text_after_casual_last_spoken == "讲讲这座城市"
            and last_voice_text_after_previous_sentence == "讲讲这座城市"
            and last_voice_text_after_just_said_sentence == "讲讲这座城市"
            and last_voice_text_after_what_asked == "讲讲这座城市"
            and last_voice_text_after_previous_ask == "讲讲这座城市"
            and last_voice_text_after_short_previous_ask == "讲讲这座城市"
            and last_voice_text_after_previous_instruction == "讲讲这座城市"
            and any(
                state.get("label") == "上一句语音"
                and state.get("city") == "语音识别"
                and state.get("track") == "讲讲这座城市"
                and "我刚才听到：讲讲这座城市" in str(state.get("message") or "")
                for state in last_heard_states
            )
            and any("我刚才听到：讲讲这座城市" in text for text in last_heard_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in last_heard_clarity_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in direct_last_heard_clarity_spoken)
            and all(any("我刚才听到：讲讲这座城市" in text for text in case["spoken"]) for case in natural_last_heard_status_cases)
            and any("我刚才听到：讲讲这座城市" in text for text in understood_as_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in previous_understood_as_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in natural_last_heard_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in casual_last_spoken_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in previous_sentence_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in just_said_sentence_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in what_asked_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in previous_ask_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in short_previous_ask_spoken)
            and any("我刚才听到：讲讲这座城市" in text for text in previous_instruction_spoken)
            and all(
                any(
                    state.get("label") == "上一句语音"
                    and state.get("city") == "语音识别"
                    and state.get("track") == "讲讲这座城市"
                    and "我刚才听到：讲讲这座城市" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and case["memory"] == "讲讲这座城市"
                for case in quiet_last_heard_cases
            )
            and any(state.get("label") == "City story" for state in voice_seed_states),
            "detail": {
                "seed": last_voice_seed_text,
                "afterQuery": last_voice_text_after_query,
                "afterClarityQuery": last_voice_text_after_clarity_query,
                "afterDirectClarityQuery": last_voice_text_after_direct_clarity_query,
                "afterUnderstoodAs": last_voice_text_after_understood_as,
                "afterPreviousUnderstoodAs": last_voice_text_after_previous_understood_as,
                "afterNaturalQuery": last_voice_text_after_natural_query,
                "afterCasualLastSpoken": last_voice_text_after_casual_last_spoken,
                "afterPreviousSentence": last_voice_text_after_previous_sentence,
                "afterJustSaidSentence": last_voice_text_after_just_said_sentence,
                "afterWhatAsked": last_voice_text_after_what_asked,
                "afterPreviousAsk": last_voice_text_after_previous_ask,
                "afterShortPreviousAsk": last_voice_text_after_short_previous_ask,
                "afterPreviousInstruction": last_voice_text_after_previous_instruction,
                "states": last_heard_states,
                "spoken": last_heard_spoken,
                "clarityStates": last_heard_clarity_states,
                "claritySpoken": last_heard_clarity_spoken,
                "directClarityStates": direct_last_heard_clarity_states,
                "directClaritySpoken": direct_last_heard_clarity_spoken,
                "quietLastHeardCases": quiet_last_heard_cases,
                "naturalStatusCases": natural_last_heard_status_cases,
                "understoodAsStates": understood_as_states,
                "understoodAsSpoken": understood_as_spoken,
                "previousUnderstoodAsStates": previous_understood_as_states,
                "previousUnderstoodAsSpoken": previous_understood_as_spoken,
                "naturalStates": natural_last_heard_states,
                "naturalSpoken": natural_last_heard_spoken,
                "previousSentenceStates": previous_sentence_states,
                "previousSentenceSpoken": previous_sentence_spoken,
                "justSaidSentenceStates": just_said_sentence_states,
                "justSaidSentenceSpoken": just_said_sentence_spoken,
                "whatAskedStates": what_asked_states,
                "whatAskedSpoken": what_asked_spoken,
                "shortPreviousAskStates": short_previous_ask_states,
                "shortPreviousAskSpoken": short_previous_ask_spoken,
                "previousInstructionStates": previous_instruction_states,
                "previousInstructionSpoken": previous_instruction_spoken,
            },
        },
        {
            "name": "voice correction phrase asks for a repeat without actions",
            "passed": last_voice_text_after_correction == "讲讲这座城市"
            and last_voice_text_after_meaning_correction == "讲讲这座城市"
            and last_voice_text_after_never_mind == "讲讲这座城市"
            and last_voice_text_after_cancel_previous_instruction == "讲讲这座城市"
            and last_voice_text_after_short_cancel_previous_instruction == "讲讲这座城市"
            and last_voice_text_after_retract_short_previous_instruction == "讲讲这座城市"
            and last_voice_text_after_reverse_retract_last_sentence == "讲讲这座城市"
            and last_voice_text_after_do_not_execute_last == "讲讲这座城市"
            and last_voice_text_after_ignore_last_sentence == "讲讲这座城市"
            and last_voice_text_after_do_not_listen_last_sentence == "讲讲这座城市"
            and last_voice_text_after_reverse_do_not_execute_previous == "讲讲这座城市"
            and last_voice_text_after_ignore_previous_thing == "讲讲这座城市"
            and last_voice_text_after_just_now_ignore_previous_thing == "讲讲这座城市"
            and last_voice_text_after_reverse_ignore_previous_thing == "讲讲这座城市"
            and last_voice_text_after_short_reverse_ignore_previous_thing == "讲讲这座城市"
            and last_voice_text_after_retract_previous_instruction == "讲讲这座城市"
            and last_voice_text_after_casual_never_mind_sentence == "讲讲这座城市"
            and last_voice_text_after_misspoke == "讲讲这座城市"
            and last_voice_text_after_short_misspoke == "讲讲这座城市"
            and all(case["lastVoiceText"] == "讲讲这座城市" for case in extra_voice_correction_cases)
            and all(case["lastVoiceText"] == "讲讲这座城市" for case in quiet_voice_correction_cases)
            and voice_correction_actions == []
            and never_mind_last_actions == []
            and cancel_previous_instruction_actions == []
            and short_cancel_previous_instruction_actions == []
            and retract_short_previous_instruction_actions == []
            and reverse_retract_last_sentence_actions == []
            and do_not_execute_last_actions == []
            and ignore_last_sentence_actions == []
            and do_not_listen_last_sentence_actions == []
            and reverse_do_not_execute_previous_actions == []
            and ignore_previous_thing_actions == []
            and just_now_ignore_previous_thing_actions == []
            and reverse_ignore_previous_thing_actions == []
            and short_reverse_ignore_previous_thing_actions == []
            and retract_previous_instruction_actions == []
            and casual_never_mind_sentence_actions == []
            and misspoke_actions == []
            and short_misspoke_actions == []
            and all(case["actions"] == [] for case in extra_voice_correction_cases)
            and all(case["actions"] == [] for case in quiet_voice_correction_cases)
            and meaning_correction_actions == []
            and any(
                state.get("label") == "语音校正"
                and state.get("city") == "语音识别"
                and state.get("track") == "等待重说"
                and "刚才我听成：讲讲这座城市" in str(state.get("message") or "")
                and "重新说一次" in str(state.get("message") or "")
                for state in voice_correction_states
            )
            and any(
                state.get("label") == "语音校正"
                and state.get("city") == "语音识别"
                and state.get("track") == "等待重说"
                and "刚才我听成：讲讲这座城市" in str(state.get("message") or "")
                and "重新说一次" in str(state.get("message") or "")
                for state in meaning_correction_states
            )
            and any("刚才我听成：讲讲这座城市" in text and "重新说一次" in text for text in voice_correction_spoken)
            and any("重新说一次" in text for text in meaning_correction_spoken)
            and any("重新说一次" in text for text in never_mind_last_spoken)
            and any("重新说一次" in text for text in cancel_previous_instruction_spoken)
            and any("重新说一次" in text for text in short_cancel_previous_instruction_spoken)
            and any("重新说一次" in text for text in retract_short_previous_instruction_spoken)
            and any("重新说一次" in text for text in reverse_retract_last_sentence_spoken)
            and any("重新说一次" in text for text in do_not_execute_last_spoken)
            and any("重新说一次" in text for text in ignore_last_sentence_spoken)
            and any("重新说一次" in text for text in do_not_listen_last_sentence_spoken)
            and any("重新说一次" in text for text in reverse_do_not_execute_previous_spoken)
            and any("重新说一次" in text for text in ignore_previous_thing_spoken)
            and any("重新说一次" in text for text in just_now_ignore_previous_thing_spoken)
            and any("重新说一次" in text for text in reverse_ignore_previous_thing_spoken)
            and any("重新说一次" in text for text in short_reverse_ignore_previous_thing_spoken)
            and any("重新说一次" in text for text in retract_previous_instruction_spoken)
            and any("重新说一次" in text for text in casual_never_mind_sentence_spoken)
            and any("重新说一次" in text for text in misspoke_spoken)
            and any("重新说一次" in text for text in short_misspoke_spoken)
            and all(any("重新说一次" in text for text in case["spoken"]) for case in extra_voice_correction_cases)
            and all(
                any(
                    state.get("label") == "语音校正"
                    and state.get("city") == "语音识别"
                    and "刚才我听成：讲讲这座城市" in str(state.get("message") or "")
                    and "重新说一次" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                for case in quiet_voice_correction_cases
            ),
            "detail": {
                "afterCorrection": last_voice_text_after_correction,
                "afterMeaningCorrection": last_voice_text_after_meaning_correction,
                "afterNeverMind": last_voice_text_after_never_mind,
                "afterCancelPreviousInstruction": last_voice_text_after_cancel_previous_instruction,
                "afterShortCancelPreviousInstruction": last_voice_text_after_short_cancel_previous_instruction,
                "afterRetractShortPreviousInstruction": last_voice_text_after_retract_short_previous_instruction,
                "afterReverseRetractLastSentence": last_voice_text_after_reverse_retract_last_sentence,
                "afterDoNotExecuteLast": last_voice_text_after_do_not_execute_last,
                "afterIgnoreLastSentence": last_voice_text_after_ignore_last_sentence,
                "afterDoNotListenLastSentence": last_voice_text_after_do_not_listen_last_sentence,
                "afterReverseDoNotExecutePrevious": last_voice_text_after_reverse_do_not_execute_previous,
                "afterIgnorePreviousThing": last_voice_text_after_ignore_previous_thing,
                "afterJustNowIgnorePreviousThing": last_voice_text_after_just_now_ignore_previous_thing,
                "afterReverseIgnorePreviousThing": last_voice_text_after_reverse_ignore_previous_thing,
                "afterShortReverseIgnorePreviousThing": last_voice_text_after_short_reverse_ignore_previous_thing,
                "afterRetractPreviousInstruction": last_voice_text_after_retract_previous_instruction,
                "afterCasualNeverMindSentence": last_voice_text_after_casual_never_mind_sentence,
                "afterMisspoke": last_voice_text_after_misspoke,
                "afterShortMisspoke": last_voice_text_after_short_misspoke,
                "states": voice_correction_states,
                "spoken": voice_correction_spoken,
                "actions": voice_correction_actions,
                "meaningCorrectionStates": meaning_correction_states,
                "meaningCorrectionSpoken": meaning_correction_spoken,
                "meaningCorrectionActions": meaning_correction_actions,
                "neverMindStates": never_mind_last_states,
                "neverMindSpoken": never_mind_last_spoken,
                "neverMindActions": never_mind_last_actions,
                "cancelPreviousInstructionStates": cancel_previous_instruction_states,
                "cancelPreviousInstructionSpoken": cancel_previous_instruction_spoken,
                "retractShortPreviousInstructionStates": retract_short_previous_instruction_states,
                "retractShortPreviousInstructionSpoken": retract_short_previous_instruction_spoken,
                "retractShortPreviousInstructionActions": retract_short_previous_instruction_actions,
                "reverseRetractLastSentenceStates": reverse_retract_last_sentence_states,
                "reverseRetractLastSentenceSpoken": reverse_retract_last_sentence_spoken,
                "reverseRetractLastSentenceActions": reverse_retract_last_sentence_actions,
                "ignoreLastSentenceStates": ignore_last_sentence_states,
                "ignoreLastSentenceSpoken": ignore_last_sentence_spoken,
                "ignoreLastSentenceActions": ignore_last_sentence_actions,
                "doNotListenLastSentenceStates": do_not_listen_last_sentence_states,
                "doNotListenLastSentenceSpoken": do_not_listen_last_sentence_spoken,
                "doNotListenLastSentenceActions": do_not_listen_last_sentence_actions,
                "cancelPreviousInstructionActions": cancel_previous_instruction_actions,
                "shortCancelPreviousInstructionStates": short_cancel_previous_instruction_states,
                "shortCancelPreviousInstructionSpoken": short_cancel_previous_instruction_spoken,
                "shortCancelPreviousInstructionActions": short_cancel_previous_instruction_actions,
                "doNotExecuteLastStates": do_not_execute_last_states,
                "doNotExecuteLastSpoken": do_not_execute_last_spoken,
                "doNotExecuteLastActions": do_not_execute_last_actions,
                "reverseDoNotExecutePreviousStates": reverse_do_not_execute_previous_states,
                "reverseDoNotExecutePreviousSpoken": reverse_do_not_execute_previous_spoken,
                "reverseDoNotExecutePreviousActions": reverse_do_not_execute_previous_actions,
                "ignorePreviousThingStates": ignore_previous_thing_states,
                "ignorePreviousThingSpoken": ignore_previous_thing_spoken,
                "ignorePreviousThingActions": ignore_previous_thing_actions,
                "justNowIgnorePreviousThingStates": just_now_ignore_previous_thing_states,
                "justNowIgnorePreviousThingSpoken": just_now_ignore_previous_thing_spoken,
                "justNowIgnorePreviousThingActions": just_now_ignore_previous_thing_actions,
                "reverseIgnorePreviousThingStates": reverse_ignore_previous_thing_states,
                "reverseIgnorePreviousThingSpoken": reverse_ignore_previous_thing_spoken,
                "reverseIgnorePreviousThingActions": reverse_ignore_previous_thing_actions,
                "shortReverseIgnorePreviousThingStates": short_reverse_ignore_previous_thing_states,
                "shortReverseIgnorePreviousThingSpoken": short_reverse_ignore_previous_thing_spoken,
                "shortReverseIgnorePreviousThingActions": short_reverse_ignore_previous_thing_actions,
                "retractPreviousInstructionStates": retract_previous_instruction_states,
                "retractPreviousInstructionSpoken": retract_previous_instruction_spoken,
                "retractPreviousInstructionActions": retract_previous_instruction_actions,
                "casualNeverMindSentenceStates": casual_never_mind_sentence_states,
                "casualNeverMindSentenceSpoken": casual_never_mind_sentence_spoken,
                "casualNeverMindSentenceActions": casual_never_mind_sentence_actions,
                "misspokeStates": misspoke_states,
                "misspokeSpoken": misspoke_spoken,
                "misspokeActions": misspoke_actions,
                "shortMisspokeStates": short_misspoke_states,
                "shortMisspokeSpoken": short_misspoke_spoken,
                "shortMisspokeActions": short_misspoke_actions,
                "extraVoiceCorrectionCases": extra_voice_correction_cases,
                "quietVoiceCorrectionCases": quiet_voice_correction_cases,
            },
        },
        {
            "name": "city tracks question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in city_tracks_states)
            and any("东京有2首" in text and "Plastic Love" in text for text in city_tracks_spoken),
            "detail": {"states": city_tracks_states, "spoken": city_tracks_spoken},
        },
        {
            "name": "text-only city tracks question writes current city songs without speech",
            "passed": any(
                state.get("label") == "City songs" and state.get("track") == "东京"
                for state in text_only_city_tracks_states
            )
            and text_only_city_tracks_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in text_only_city_tracks_actions
            ),
            "detail": {
                "states": text_only_city_tracks_states,
                "spoken": text_only_city_tracks_spoken,
                "actions": text_only_city_tracks_actions,
            },
        },
        {
            "name": "natural here-songs question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in here_city_tracks_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in here_city_tracks_spoken),
            "detail": {"states": here_city_tracks_states, "spoken": here_city_tracks_spoken},
        },
        {
            "name": "casual place-songs question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in place_city_tracks_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in place_city_tracks_spoken),
            "detail": {"states": place_city_tracks_states, "spoken": place_city_tracks_spoken},
        },
        {
            "name": "terse city-songs question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in short_city_tracks_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in short_city_tracks_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_city_tracks_actions),
            "detail": {
                "states": short_city_tracks_states,
                "spoken": short_city_tracks_spoken,
                "actions": short_city_tracks_actions,
            },
        },
        {
            "name": "casual more-city-songs questions speak current city songs without actions",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "东京" for state in case["states"])
                and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in casual_city_tracks_more_cases
            ),
            "detail": casual_city_tracks_more_cases,
        },
        {
            "name": "here song-count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in here_song_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in here_song_count_spoken)
            and here_song_count_actions == [],
            "detail": {
                "states": here_song_count_states,
                "spoken": here_song_count_spoken,
                "actions": here_song_count_actions,
            },
        },
        {
            "name": "current-stop playlist question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in stop_playlist_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in stop_playlist_spoken),
            "detail": {"states": stop_playlist_states, "spoken": stop_playlist_spoken},
        },
        {
            "name": "current-stop song-count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in stop_song_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in stop_song_count_spoken)
            and stop_song_count_actions == [],
            "detail": {
                "states": stop_song_count_states,
                "spoken": stop_song_count_spoken,
                "actions": stop_song_count_actions,
            },
        },
        {
            "name": "current playlist question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in current_playlist_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in current_playlist_spoken),
            "detail": {"states": current_playlist_states, "spoken": current_playlist_spoken},
        },
        {
            "name": "future playlist-order questions speak current city songs without actions",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "东京" for state in case["states"])
                and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in case["spoken"])
                and case["actions"] == []
                for case in future_playlist_order_cases
            ),
            "detail": future_playlist_order_cases,
        },
        {
            "name": "no-play today playlist writes current city songs without speech or actions",
            "passed": any(
                state.get("label") == "City songs" and state.get("track") == "东京" and "Plastic Love" in state.get("message", "")
                for state in no_play_today_playlist_states
            )
            and no_play_today_playlist_spoken == []
            and no_play_today_playlist_actions == [],
            "detail": {
                "states": no_play_today_playlist_states,
                "spoken": no_play_today_playlist_spoken,
                "actions": no_play_today_playlist_actions,
            },
        },
        {
            "name": "next-track query speaks current city songs without skipping",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in next_track_query_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in next_track_query_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in next_track_query_actions
            ),
            "detail": {
                "states": next_track_query_states,
                "spoken": next_track_query_spoken,
                "actions": next_track_query_actions,
            },
        },
        {
            "name": "next-track future query speaks current city songs without skipping",
            "passed": any(
                state.get("label") == "City songs" and state.get("track") == "东京"
                for state in next_track_future_query_states
            )
            and any(
                "东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text
                for text in next_track_future_query_spoken
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in next_track_future_query_actions
            ),
            "detail": {
                "states": next_track_future_query_states,
                "spoken": next_track_future_query_spoken,
                "actions": next_track_future_query_actions,
            },
        },
        {
            "name": "next-track play query speaks current city songs without skipping",
            "passed": any(
                state.get("label") == "City songs" and state.get("track") == "东京"
                for state in next_track_play_query_states
            )
            and any(
                "东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text
                for text in next_track_play_query_spoken
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in next_track_play_query_actions
            ),
            "detail": {
                "states": next_track_play_query_states,
                "spoken": next_track_play_query_spoken,
                "actions": next_track_play_query_actions,
            },
        },
        {
            "name": "next-track artist questions speak current city songs without skipping",
            "passed": all(
                any(
                    state.get("label") == "City songs" and state.get("track") == "东京"
                    for state in case_states
                )
                and any(
                    "东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text
                    for text in case_spoken
                )
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case_actions
                )
                for case_states, case_spoken, case_actions in [
                    (
                        next_track_artist_query_states,
                        next_track_artist_query_spoken,
                        next_track_artist_query_actions,
                    ),
                    (
                        next_track_owner_query_states,
                        next_track_owner_query_spoken,
                        next_track_owner_query_actions,
                    ),
                ]
            ),
            "detail": {
                "artist": {
                    "states": next_track_artist_query_states,
                    "spoken": next_track_artist_query_spoken,
                    "actions": next_track_artist_query_actions,
                },
                "owner": {
                    "states": next_track_owner_query_states,
                    "spoken": next_track_owner_query_spoken,
                    "actions": next_track_owner_query_actions,
                },
            },
        },
        {
            "name": "next-track origin questions speak current city songs without skipping",
            "passed": all(
                any(
                    state.get("label") == "City songs" and state.get("track") == "东京"
                    for state in case["states"]
                )
                and any(
                    "东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text
                    for text in case["spoken"]
                )
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in next_track_origin_query_cases
            ),
            "detail": next_track_origin_query_cases,
        },
        {
            "name": "terse next-track query speaks current city songs without skipping",
            "passed": any(
                state.get("label") == "City songs" and state.get("track") == "东京"
                for state in terse_next_track_query_states
            )
            and any(
                "东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text
                for text in terse_next_track_query_spoken
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in terse_next_track_query_actions
            ),
            "detail": {
                "states": terse_next_track_query_states,
                "spoken": terse_next_track_query_spoken,
                "actions": terse_next_track_query_actions,
            },
        },
        {
            "name": "terse short-next-track query speaks current city songs without skipping",
            "passed": any(
                state.get("label") == "City songs" and state.get("track") == "东京"
                for state in terse_short_next_track_query_states
            )
            and any(
                "东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text
                for text in terse_short_next_track_query_spoken
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in terse_short_next_track_query_actions
            ),
            "detail": {
                "states": terse_short_next_track_query_states,
                "spoken": terse_short_next_track_query_spoken,
                "actions": terse_short_next_track_query_actions,
            },
        },
        {
            "name": "bare next-track questions speak current city songs without skipping",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "东京" for state in case["states"])
                and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in bare_next_track_query_cases
            ),
            "detail": bare_next_track_query_cases,
        },
        {
            "name": "future-that-song questions speak current city songs without skipping",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "东京" for state in case["states"])
                and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in future_that_song_query_cases
            ),
            "detail": future_that_song_query_cases,
        },
        {
            "name": "later songs question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in later_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in later_songs_spoken),
            "detail": {"states": later_songs_states, "spoken": later_songs_spoken},
        },
        {
            "name": "after-songs question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in after_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in after_songs_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in after_songs_actions
            ),
            "detail": {
                "states": after_songs_states,
                "spoken": after_songs_spoken,
                "actions": after_songs_actions,
            },
        },
        {
            "name": "upcoming songs question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in upcoming_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in upcoming_songs_spoken),
            "detail": {"states": upcoming_songs_states, "spoken": upcoming_songs_spoken},
        },
        {
            "name": "upcoming song-count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in upcoming_song_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in upcoming_song_count_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in upcoming_song_count_actions
            ),
            "detail": {
                "states": upcoming_song_count_states,
                "spoken": upcoming_song_count_spoken,
                "actions": upcoming_song_count_actions,
            },
        },
        {
            "name": "casual later-songs question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in casual_later_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in casual_later_songs_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in casual_later_songs_actions
            ),
            "detail": {
                "states": casual_later_songs_states,
                "spoken": casual_later_songs_spoken,
                "actions": casual_later_songs_actions,
            },
        },
        {
            "name": "casual later-play question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in casual_later_play_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in casual_later_play_spoken),
            "detail": {"states": casual_later_play_states, "spoken": casual_later_play_spoken},
        },
        {
            "name": "casual soon-song question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in soon_song_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in soon_song_spoken),
            "detail": {"states": soon_song_states, "spoken": soon_song_spoken},
        },
        {
            "name": "casual soon-play question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in soon_play_casual_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in soon_play_casual_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in soon_play_casual_actions
            ),
            "detail": {
                "states": soon_play_casual_states,
                "spoken": soon_play_casual_spoken,
                "actions": soon_play_casual_actions,
            },
        },
        {
            "name": "casual soon-more-songs question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in soon_more_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in soon_more_songs_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in soon_more_songs_actions
            ),
            "detail": {
                "states": soon_more_songs_states,
                "spoken": soon_more_songs_spoken,
                "actions": soon_more_songs_actions,
            },
        },
        {
            "name": "casual soon-count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in soon_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in soon_count_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in soon_count_actions
            ),
            "detail": {
                "states": soon_count_states,
                "spoken": soon_count_spoken,
                "actions": soon_count_actions,
            },
        },
        {
            "name": "today more-songs question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in today_more_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in today_more_songs_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in today_more_songs_actions
            ),
            "detail": {
                "states": today_more_songs_states,
                "spoken": today_more_songs_spoken,
                "actions": today_more_songs_actions,
            },
        },
        {
            "name": "tonight more-songs question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in tonight_more_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in tonight_more_songs_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in tonight_more_songs_actions
            ),
            "detail": {
                "states": tonight_more_songs_states,
                "spoken": tonight_more_songs_spoken,
                "actions": tonight_more_songs_actions,
            },
        },
        {
            "name": "remaining playlist question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in remaining_playlist_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in remaining_playlist_spoken),
            "detail": {"states": remaining_playlist_states, "spoken": remaining_playlist_spoken},
        },
        {
            "name": "casual playlist-anything question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in playlist_anything_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in playlist_anything_spoken)
            and playlist_anything_actions == [],
            "detail": {
                "states": playlist_anything_states,
                "spoken": playlist_anything_spoken,
                "actions": playlist_anything_actions,
            },
        },
        {
            "name": "casual remaining-playlist-anything question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in remaining_playlist_anything_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in remaining_playlist_anything_spoken)
            and remaining_playlist_anything_actions == [],
            "detail": {
                "states": remaining_playlist_anything_states,
                "spoken": remaining_playlist_anything_spoken,
                "actions": remaining_playlist_anything_actions,
            },
        },
        {
            "name": "casual tracks-anything question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in tracks_anything_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in tracks_anything_spoken)
            and tracks_anything_actions == [],
            "detail": {
                "states": tracks_anything_states,
                "spoken": tracks_anything_spoken,
                "actions": tracks_anything_actions,
            },
        },
        {
            "name": "remaining playlist count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in remaining_playlist_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in remaining_playlist_count_spoken)
            and remaining_playlist_count_actions == [],
            "detail": {
                "states": remaining_playlist_count_states,
                "spoken": remaining_playlist_count_spoken,
                "actions": remaining_playlist_count_actions,
            },
        },
        {
            "name": "casual playlist count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in casual_playlist_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in casual_playlist_count_spoken)
            and casual_playlist_count_actions == [],
            "detail": {
                "states": casual_playlist_count_states,
                "spoken": casual_playlist_count_spoken,
                "actions": casual_playlist_count_actions,
            },
        },
        {
            "name": "direct remaining song count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in direct_remaining_song_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in direct_remaining_song_count_spoken)
            and direct_remaining_song_count_actions == [],
            "detail": {
                "states": direct_remaining_song_count_states,
                "spoken": direct_remaining_song_count_spoken,
                "actions": direct_remaining_song_count_actions,
            },
        },
        {
            "name": "direct more song count question speaks current city songs without actions",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in direct_more_song_count_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in direct_more_song_count_spoken)
            and direct_more_song_count_actions == [],
            "detail": {
                "states": direct_more_song_count_states,
                "spoken": direct_more_song_count_spoken,
                "actions": direct_more_song_count_actions,
            },
        },
        {
            "name": "current-city remaining count questions speak current city songs without actions",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "东京" for state in case["states"])
                and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in case["spoken"])
                and case["actions"] == []
                for case in current_remaining_count_cases
            ),
            "detail": current_remaining_count_cases,
        },
        {
            "name": "current-stop good-songs question speaks current city songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in current_good_songs_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in current_good_songs_spoken),
            "detail": {"states": current_good_songs_states, "spoken": current_good_songs_spoken},
        },
        {
            "name": "next-stop songs question previews next city songs without hopping",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "柏林" for state in next_stop_songs_states)
            and any("柏林有1首" in text and "Heroes" in text for text in next_stop_songs_spoken)
            and next_stop_songs_actions == [],
            "detail": {"states": next_stop_songs_states, "spoken": next_stop_songs_spoken, "actions": next_stop_songs_actions},
        },
        {
            "name": "long next-city songs question previews next city songs without hopping",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "柏林" for state in long_next_city_songs_states)
            and any("柏林有1首" in text and "Heroes" in text for text in long_next_city_songs_spoken)
            and long_next_city_songs_actions == [],
            "detail": {
                "states": long_next_city_songs_states,
                "spoken": long_next_city_songs_spoken,
                "actions": long_next_city_songs_actions,
            },
        },
        {
            "name": "short next-city play questions preview next city songs without hopping",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "柏林" for state in case["states"])
                and any("柏林有1首" in text and "Heroes" in text for text in case["spoken"])
                and case["actions"] == []
                for case in next_city_play_cases
            ),
            "detail": next_city_play_cases,
        },
        {
            "name": "negative next-city track questions preview songs without hopping",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "柏林" for state in case["states"])
                and any("柏林有1首" in text and "Heroes" in text for text in case["spoken"])
                and not any(
                    action.startswith("hop_city:")
                    or action.startswith("play_next:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in negative_next_city_tracks_cases
            ),
            "detail": negative_next_city_tracks_cases,
        },
        {
            "name": "next-city story questions preview next city story without hopping",
            "passed": all(
                any(state.get("label") == "City story" and state.get("track") == "柏林" for state in case["states"])
                and any("柏林在日落电台有1首歌" in text and "Heroes" in text for text in case["spoken"])
                and not any(
                    action.startswith("hop_city:")
                    or action.startswith("play_next:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in next_city_story_cases
            ),
            "detail": next_city_story_cases,
        },
        {
            "name": "previous-stop songs question previews previous city songs without hopping",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "巴黎" for state in prev_stop_songs_states)
            and any("巴黎有2首" in text and "Digital Love" in text and "夜车灯线" in text for text in prev_stop_songs_spoken)
            and prev_stop_songs_actions == [],
            "detail": {"states": prev_stop_songs_states, "spoken": prev_stop_songs_spoken, "actions": prev_stop_songs_actions},
        },
        {
            "name": "long previous-city songs question previews previous city songs without hopping",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "巴黎" for state in long_prev_city_songs_states)
            and any("巴黎有2首" in text and "Digital Love" in text and "夜车灯线" in text for text in long_prev_city_songs_spoken)
            and long_prev_city_songs_actions == [],
            "detail": {
                "states": long_prev_city_songs_states,
                "spoken": long_prev_city_songs_spoken,
                "actions": long_prev_city_songs_actions,
            },
        },
        {
            "name": "short previous-city play questions preview previous city songs without hopping",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "巴黎" for state in case["states"])
                and any("巴黎有2首" in text and "Digital Love" in text and "夜车灯线" in text for text in case["spoken"])
                and case["actions"] == []
                for case in prev_city_play_cases
            ),
            "detail": prev_city_play_cases,
        },
        {
            "name": "negative previous-city track questions preview songs without hopping",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "巴黎" for state in case["states"])
                and any("巴黎有2首" in text and "Digital Love" in text and "夜车灯线" in text for text in case["spoken"])
                and not any(
                    action.startswith("hop_city:")
                    or action.startswith("play_next:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in negative_prev_city_tracks_cases
            ),
            "detail": negative_prev_city_tracks_cases,
        },
        {
            "name": "previous-city story questions preview previous city story without hopping",
            "passed": all(
                any(state.get("label") == "City story" and state.get("track") == "巴黎" for state in case["states"])
                and any("巴黎在日落电台有2首歌" in text and "Digital Love" in text for text in case["spoken"])
                and not any(
                    action.startswith("hop_city:")
                    or action.startswith("play_next:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in prev_city_story_cases
            ),
            "detail": prev_city_story_cases,
        },
        {
            "name": "named city tracks question speaks that city's songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in named_city_tracks_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in named_city_tracks_spoken),
            "detail": {"states": named_city_tracks_states, "spoken": named_city_tracks_spoken},
        },
        {
            "name": "natural named city songs question speaks that city's songs",
            "passed": any(state.get("label") == "City songs" and state.get("track") == "东京" for state in named_city_tracks_alt_states)
            and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in named_city_tracks_alt_spoken),
            "detail": {"states": named_city_tracks_alt_states, "spoken": named_city_tracks_alt_spoken},
        },
        {
            "name": "named city recommendation questions preview that city's songs",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "东京" for state in case["states"])
                and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in case["spoken"])
                and not any(
                    action.startswith("play_city:")
                    or action.startswith("hop_city:")
                    or action.startswith("play_next:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in named_city_recommendation_cases
            ),
            "detail": named_city_recommendation_cases,
        },
        {
            "name": "negative named city song questions preview songs without playing",
            "passed": all(
                any(state.get("label") == "City songs" and state.get("track") == "东京" for state in case["states"])
                and any("东京有2首" in text and "Plastic Love" in text and "真夜中のドア" in text for text in case["spoken"])
                and not any(
                    action.startswith("play_city:")
                    or action.startswith("hop_city:")
                    or action.startswith("play_next:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in negative_named_city_tracks_cases
            ),
            "detail": negative_named_city_tracks_cases,
        },
        {
            "name": "named city story question speaks that city's context",
            "passed": any(state.get("label") == "City story" and state.get("track") == "东京" for state in named_city_story_states)
            and any("霓虹、晚风" in text and "Plastic Love" in text for text in named_city_story_spoken),
            "detail": {"states": named_city_story_states, "spoken": named_city_story_spoken},
        },
        {
            "name": "negative named city story questions preview story without playing",
            "passed": all(
                any(state.get("label") == "City story" and state.get("track") == "东京" for state in case["states"])
                and any("霓虹、晚风" in text and "Plastic Love" in text for text in case["spoken"])
                and not any(
                    action.startswith("play_city:")
                    or action.startswith("hop_city:")
                    or action.startswith("play_next:")
                    or action in {"wifi_failover", "audio_output", "stop"}
                    for action in case["actions"]
                )
                for case in negative_named_city_story_cases
            ),
            "detail": negative_named_city_story_cases,
        },
        {
            "name": "next sunset question speaks the next city",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in next_up_states)
            and any("下一站 柏林" in text for text in next_up_spoken),
            "detail": {"states": next_up_states, "spoken": next_up_spoken},
        },
        {
            "name": "terse next-stop question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in terse_next_up_states)
            and any("下一站 柏林" in text for text in terse_next_up_spoken)
            and terse_next_up_actions == [],
            "detail": {
                "states": terse_next_up_states,
                "spoken": terse_next_up_spoken,
                "actions": terse_next_up_actions,
            },
        },
        {
            "name": "short next-stop question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in short_next_up_states)
            and any("下一站 柏林" in text for text in short_next_up_spoken)
            and short_next_up_actions == [],
            "detail": {
                "states": short_next_up_states,
                "spoken": short_next_up_spoken,
                "actions": short_next_up_actions,
            },
        },
        {
            "name": "terse short next-stop question previews next city without hopping",
            "passed": any(
                state.get("label") == "Next sunset" and state.get("track") == "柏林"
                for state in terse_short_next_up_states
            )
            and any("下一站 柏林" in text for text in terse_short_next_up_spoken)
            and terse_short_next_up_actions == [],
            "detail": {
                "states": terse_short_next_up_states,
                "spoken": terse_short_next_up_spoken,
                "actions": terse_short_next_up_actions,
            },
        },
        {
            "name": "next-sunset-event question previews next city without hopping",
            "passed": any(
                state.get("label") == "Next sunset" and state.get("track") == "柏林"
                for state in next_sunset_event_states
            )
            and any("下一站 柏林" in text for text in next_sunset_event_spoken)
            and next_sunset_event_actions == [],
            "detail": {
                "states": next_sunset_event_states,
                "spoken": next_sunset_event_spoken,
                "actions": next_sunset_event_actions,
            },
        },
        {
            "name": "subjectless next-sunset question previews next city without hopping",
            "passed": any(
                state.get("label") == "Next sunset" and state.get("track") == "柏林"
                for state in subjectless_next_sunset_states
            )
            and any("下一站 柏林" in text for text in subjectless_next_sunset_spoken)
            and subjectless_next_sunset_actions == [],
            "detail": {
                "states": subjectless_next_sunset_states,
                "spoken": subjectless_next_sunset_spoken,
                "actions": subjectless_next_sunset_actions,
            },
        },
        {
            "name": "short next-city question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in short_next_city_states)
            and any("下一站 柏林" in text for text in short_next_city_spoken)
            and short_next_city_actions == [],
            "detail": {
                "states": short_next_city_states,
                "spoken": short_next_city_spoken,
                "actions": short_next_city_actions,
            },
        },
        {
            "name": "long next-city question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in long_next_city_states)
            and any("下一站 柏林" in text for text in long_next_city_spoken)
            and long_next_city_actions == [],
            "detail": {
                "states": long_next_city_states,
                "spoken": long_next_city_spoken,
                "actions": long_next_city_actions,
            },
        },
        {
            "name": "negative next-stop questions preview next city without hopping",
            "passed": all(
                any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in case["states"])
                and any("下一站 柏林" in text for text in case["spoken"])
                and case["actions"] == []
                for case in negative_next_up_cases
            ),
            "detail": negative_next_up_cases,
        },
        {
            "name": "later-next-place question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in later_next_place_states)
            and any("下一站 柏林" in text for text in later_next_place_spoken)
            and later_next_place_actions == [],
            "detail": {
                "states": later_next_place_states,
                "spoken": later_next_place_spoken,
                "actions": later_next_place_actions,
            },
        },
        {
            "name": "short-soon-next-place questions preview next city without hopping",
            "passed": all(
                any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in case_states)
                and any("下一站 柏林" in text for text in case_spoken)
                and case_actions == []
                for case_states, case_spoken, case_actions in (
                    (short_soon_next_place_states, short_soon_next_place_spoken, short_soon_next_place_actions),
                    (short_soon_will_next_place_states, short_soon_will_next_place_spoken, short_soon_will_next_place_actions),
                )
            ),
            "detail": {
                "soon": {
                    "states": short_soon_next_place_states,
                    "spoken": short_soon_next_place_spoken,
                    "actions": short_soon_next_place_actions,
                },
                "soonWill": {
                    "states": short_soon_will_next_place_states,
                    "spoken": short_soon_will_next_place_spoken,
                    "actions": short_soon_will_next_place_actions,
                },
            },
        },
        {
            "name": "casual-later-next-place question previews next city without hopping",
            "passed": any(
                state.get("label") == "Next sunset" and state.get("track") == "柏林"
                for state in casual_later_next_place_states
            )
            and any("下一站 柏林" in text for text in casual_later_next_place_spoken)
            and casual_later_next_place_actions == [],
            "detail": {
                "states": casual_later_next_place_states,
                "spoken": casual_later_next_place_spoken,
                "actions": casual_later_next_place_actions,
            },
        },
        {
            "name": "soon-next-place question previews next city without hopping",
            "passed": any(
                state.get("label") == "Next sunset" and state.get("track") == "柏林"
                for state in soon_next_place_states
            )
            and any("下一站 柏林" in text for text in soon_next_place_spoken)
            and soon_next_place_actions == [],
            "detail": {
                "states": soon_next_place_states,
                "spoken": soon_next_place_spoken,
                "actions": soon_next_place_actions,
            },
        },
        {
            "name": "after-next-place question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in after_next_place_states)
            and any("下一站 柏林" in text for text in after_next_place_spoken)
            and after_next_place_actions == [],
            "detail": {
                "states": after_next_place_states,
                "spoken": after_next_place_spoken,
                "actions": after_next_place_actions,
            },
        },
        {
            "name": "next-segment-place question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in next_segment_place_states)
            and any("下一站 柏林" in text for text in next_segment_place_spoken)
            and next_segment_place_actions == [],
            "detail": {
                "states": next_segment_place_states,
                "spoken": next_segment_place_spoken,
                "actions": next_segment_place_actions,
            },
        },
        {
            "name": "then-next-place question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in then_next_place_states)
            and any("下一站 柏林" in text for text in then_next_place_spoken)
            and then_next_place_actions == [],
            "detail": {
                "states": then_next_place_states,
                "spoken": then_next_place_spoken,
                "actions": then_next_place_actions,
            },
        },
        {
            "name": "further-next-place question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in further_next_place_states)
            and any("下一站 柏林" in text for text in further_next_place_spoken)
            and further_next_place_actions == [],
            "detail": {
                "states": further_next_place_states,
                "spoken": further_next_place_spoken,
                "actions": further_next_place_actions,
            },
        },
        {
            "name": "next-stop eta question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in next_eta_states)
            and any("下一站 柏林" in text for text in next_eta_spoken)
            and next_eta_actions == [],
            "detail": {"states": next_eta_states, "spoken": next_eta_spoken, "actions": next_eta_actions},
        },
        {
            "name": "casual next-stop eta question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in next_eta_casual_states)
            and any("下一站 柏林" in text for text in next_eta_casual_spoken)
            and next_eta_casual_actions == [],
            "detail": {
                "states": next_eta_casual_states,
                "spoken": next_eta_casual_spoken,
                "actions": next_eta_casual_actions,
            },
        },
        {
            "name": "target-first next-stop time question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in next_eta_when_states)
            and any("下一站 柏林" in text for text in next_eta_when_spoken)
            and next_eta_when_actions == [],
            "detail": {
                "states": next_eta_when_states,
                "spoken": next_eta_when_spoken,
                "actions": next_eta_when_actions,
            },
        },
        {
            "name": "target-first next-city eta question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in next_city_eta_states)
            and any("下一站 柏林" in text for text in next_city_eta_spoken)
            and next_city_eta_actions == [],
            "detail": {
                "states": next_city_eta_states,
                "spoken": next_city_eta_spoken,
                "actions": next_city_eta_actions,
            },
        },
        {
            "name": "long target-first next-city eta question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in long_next_city_eta_states)
            and any("下一站 柏林" in text for text in long_next_city_eta_spoken)
            and long_next_city_eta_actions == [],
            "detail": {
                "states": long_next_city_eta_states,
                "spoken": long_next_city_eta_spoken,
                "actions": long_next_city_eta_actions,
            },
        },
        {
            "name": "nearly-next-stop question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in next_eta_nearly_states)
            and any("下一站 柏林" in text for text in next_eta_nearly_spoken)
            and next_eta_nearly_actions == [],
            "detail": {
                "states": next_eta_nearly_states,
                "spoken": next_eta_nearly_spoken,
                "actions": next_eta_nearly_actions,
            },
        },
        {
            "name": "minute-style next-stop eta question previews next city without hopping",
            "passed": any(state.get("label") == "Next sunset" and state.get("track") == "柏林" for state in minute_next_eta_states)
            and any("下一站 柏林" in text for text in minute_next_eta_spoken)
            and minute_next_eta_actions == [],
            "detail": {
                "states": minute_next_eta_states,
                "spoken": minute_next_eta_spoken,
                "actions": minute_next_eta_actions,
            },
        },
        {
            "name": "text-only next-stop question writes next city without speech",
            "passed": any(
                state.get("label") == "Next sunset" and state.get("track") == "柏林"
                for state in text_only_next_up_states
            )
            and text_only_next_up_spoken == []
            and text_only_next_up_actions == [],
            "detail": {
                "states": text_only_next_up_states,
                "spoken": text_only_next_up_spoken,
                "actions": text_only_next_up_actions,
            },
        },
        {
            "name": "previous-stop question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in prev_up_states)
            and any("上一站 巴黎" in text for text in prev_up_spoken)
            and prev_up_actions == [],
            "detail": {"states": prev_up_states, "spoken": prev_up_spoken, "actions": prev_up_actions},
        },
        {
            "name": "text-only previous-stop question writes previous city without speech",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "巴黎"
                for state in text_only_prev_up_states
            )
            and text_only_prev_up_spoken == []
            and text_only_prev_up_actions == [],
            "detail": {
                "states": text_only_prev_up_states,
                "spoken": text_only_prev_up_spoken,
                "actions": text_only_prev_up_actions,
            },
        },
        {
            "name": "terse previous-stop question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in terse_prev_up_states)
            and any("上一站 巴黎" in text for text in terse_prev_up_spoken)
            and terse_prev_up_actions == [],
            "detail": {
                "states": terse_prev_up_states,
                "spoken": terse_prev_up_spoken,
                "actions": terse_prev_up_actions,
            },
        },
        {
            "name": "terse short previous-stop question previews previous city without hopping",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "巴黎"
                for state in terse_short_prev_up_states
            )
            and any("上一站 巴黎" in text for text in terse_short_prev_up_spoken)
            and terse_short_prev_up_actions == [],
            "detail": {
                "states": terse_short_prev_up_states,
                "spoken": terse_short_prev_up_spoken,
                "actions": terse_short_prev_up_actions,
            },
        },
        {
            "name": "long previous-city question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in long_prev_city_states)
            and any("上一站 巴黎" in text for text in long_prev_city_spoken)
            and long_prev_city_actions == [],
            "detail": {
                "states": long_prev_city_states,
                "spoken": long_prev_city_spoken,
                "actions": long_prev_city_actions,
            },
        },
        {
            "name": "negative previous-stop questions preview previous city without hopping",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in case["states"])
                and any("上一站 巴黎" in text for text in case["spoken"])
                and case["actions"] == []
                for case in negative_prev_up_cases
            ),
            "detail": negative_prev_up_cases,
        },
        {
            "name": "former-city question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in former_city_states)
            and any("上一站 巴黎" in text for text in former_city_spoken)
            and former_city_actions == [],
            "detail": {
                "states": former_city_states,
                "spoken": former_city_spoken,
                "actions": former_city_actions,
            },
        },
        {
            "name": "casual previous-stop question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in casual_prev_up_states)
            and any("上一站 巴黎" in text for text in casual_prev_up_spoken)
            and casual_prev_up_actions == [],
            "detail": {"states": casual_prev_up_states, "spoken": casual_prev_up_spoken, "actions": casual_prev_up_actions},
        },
        {
            "name": "terse casual previous-stop question previews previous city without hopping",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "巴黎"
                for state in terse_casual_prev_up_states
            )
            and any("上一站 巴黎" in text for text in terse_casual_prev_up_spoken)
            and terse_casual_prev_up_actions == [],
            "detail": {
                "states": terse_casual_prev_up_states,
                "spoken": terse_casual_prev_up_spoken,
                "actions": terse_casual_prev_up_actions,
            },
        },
        {
            "name": "casual previous-city-pointing question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in casual_pointing_prev_city_states)
            and any("上一站 巴黎" in text for text in casual_pointing_prev_city_spoken)
            and casual_pointing_prev_city_actions == [],
            "detail": {
                "states": casual_pointing_prev_city_states,
                "spoken": casual_pointing_prev_city_spoken,
                "actions": casual_pointing_prev_city_actions,
            },
        },
        {
            "name": "casual previous-place question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in previous_place_states)
            and any("上一站 巴黎" in text for text in previous_place_spoken)
            and previous_place_actions == [],
            "detail": {"states": previous_place_states, "spoken": previous_place_spoken, "actions": previous_place_actions},
        },
        {
            "name": "casual previous-city question previews previous city without hopping",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "巴黎" for state in previous_city_states)
            and any("上一站 巴黎" in text for text in previous_city_spoken)
            and previous_city_actions == [],
            "detail": {"states": previous_city_states, "spoken": previous_city_spoken, "actions": previous_city_actions},
        },
        {
            "name": "route question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in route_spoken),
            "detail": {"states": route_states, "spoken": route_spoken},
        },
        {
            "name": "natural route-places question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in route_places_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in route_places_spoken),
            "detail": {"states": route_places_states, "spoken": route_places_spoken},
        },
        {
            "name": "tonight route-cities question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in tonight_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in tonight_route_spoken),
            "detail": {"states": tonight_route_states, "spoken": tonight_route_spoken},
        },
        {
            "name": "today route-cities question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in today_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in today_route_spoken),
            "detail": {"states": today_route_states, "spoken": today_route_spoken},
        },
        {
            "name": "named city route-presence questions preview route without actions",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in case["states"])
                and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in case["spoken"])
                and not any(
                    action.startswith("play_next:") or action.startswith("hop_city:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in named_route_presence_cases
            ),
            "detail": named_route_presence_cases,
        },
        {
            "name": "quiet named city route-presence questions preview route without speech",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in case["states"])
                and any("后面3站" in str(state.get("message") or "") and "柏林" in str(state.get("message") or "") and "巴黎" in str(state.get("message") or "") for state in case["states"])
                and not case["spoken"]
                and not any(
                    action.startswith("play_next:") or action.startswith("hop_city:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in quiet_named_route_presence_cases
            ),
            "detail": quiet_named_route_presence_cases,
        },
        {
            "name": "text-only route question writes upcoming cities without speech",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "柏林"
                for state in text_only_route_states
            )
            and text_only_route_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in text_only_route_actions),
            "detail": {
                "states": text_only_route_states,
                "spoken": text_only_route_spoken,
                "actions": text_only_route_actions,
            },
        },
        {
            "name": "today-where-next route question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in today_where_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in today_where_route_spoken),
            "detail": {"states": today_where_route_states, "spoken": today_where_route_spoken},
        },
        {
            "name": "casual radio-route question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in casual_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in casual_route_spoken),
            "detail": {"states": casual_route_states, "spoken": casual_route_spoken},
        },
        {
            "name": "direct trip-route-name question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in trip_route_name_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in trip_route_name_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in trip_route_name_actions),
            "detail": {"states": trip_route_name_states, "spoken": trip_route_name_spoken, "actions": trip_route_name_actions},
        },
        {
            "name": "direct radio-route-name question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in radio_route_name_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in radio_route_name_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in radio_route_name_actions),
            "detail": {"states": radio_route_name_states, "spoken": radio_route_name_spoken, "actions": radio_route_name_actions},
        },
        {
            "name": "casual trip-route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in trip_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in trip_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in trip_route_actions),
            "detail": {"states": trip_route_states, "spoken": trip_route_spoken, "actions": trip_route_actions},
        },
        {
            "name": "casual route-arrangement question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in route_arrangement_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in route_arrangement_spoken),
            "detail": {"states": route_arrangement_states, "spoken": route_arrangement_spoken},
        },
        {
            "name": "casual later-route question speaks upcoming cities",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in later_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in later_route_spoken),
            "detail": {"states": later_route_states, "spoken": later_route_spoken},
        },
        {
            "name": "casual later-route-plan question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in later_route_plan_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in later_route_plan_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in later_route_plan_actions),
            "detail": {
                "states": later_route_plan_states,
                "spoken": later_route_plan_spoken,
                "actions": later_route_plan_actions,
            },
        },
        {
            "name": "casual zha-route questions speak upcoming cities without actions",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in case["states"])
                and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in zha_route_cases
            ),
            "detail": zha_route_cases,
        },
        {
            "name": "casual next-route-arrangement question speaks upcoming cities without actions",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "柏林"
                for state in next_route_arrangement_states
            )
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in next_route_arrangement_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in next_route_arrangement_actions),
            "detail": {
                "states": next_route_arrangement_states,
                "spoken": next_route_arrangement_spoken,
                "actions": next_route_arrangement_actions,
            },
        },
        {
            "name": "casual later-what-place question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in later_what_place_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in later_what_place_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in later_what_place_actions),
            "detail": {
                "states": later_what_place_states,
                "spoken": later_what_place_spoken,
                "actions": later_what_place_actions,
            },
        },
        {
            "name": "pass-by route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in passby_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in passby_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in passby_route_actions),
            "detail": {"states": passby_route_states, "spoken": passby_route_spoken, "actions": passby_route_actions},
        },
        {
            "name": "next-pass-by route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in next_passby_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in next_passby_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in next_passby_route_actions),
            "detail": {
                "states": next_passby_route_states,
                "spoken": next_passby_route_spoken,
                "actions": next_passby_route_actions,
            },
        },
        {
            "name": "later-pass-by route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in later_passby_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in later_passby_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in later_passby_route_actions),
            "detail": {
                "states": later_passby_route_states,
                "spoken": later_passby_route_spoken,
                "actions": later_passby_route_actions,
            },
        },
        {
            "name": "remaining-where route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in remaining_where_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in remaining_where_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in remaining_where_route_actions),
            "detail": {
                "states": remaining_where_route_states,
                "spoken": remaining_where_route_spoken,
                "actions": remaining_where_route_actions,
            },
        },
        {
            "name": "casual route followup questions speak upcoming cities without actions",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in case["states"])
                and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in casual_route_followup_cases
            ),
            "detail": casual_route_followup_cases,
        },
        {
            "name": "remaining-stops route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in remaining_stops_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in remaining_stops_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in remaining_stops_route_actions),
            "detail": {
                "states": remaining_stops_route_states,
                "spoken": remaining_stops_route_spoken,
                "actions": remaining_stops_route_actions,
            },
        },
        {
            "name": "casual remaining-stops route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in casual_remaining_stops_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in casual_remaining_stops_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_remaining_stops_route_actions),
            "detail": {
                "states": casual_remaining_stops_route_states,
                "spoken": casual_remaining_stops_route_spoken,
                "actions": casual_remaining_stops_route_actions,
            },
        },
        {
            "name": "subjectless remaining-stops route question speaks upcoming cities without actions",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "柏林"
                for state in subjectless_remaining_stops_route_states
            )
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in subjectless_remaining_stops_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in subjectless_remaining_stops_route_actions),
            "detail": {
                "states": subjectless_remaining_stops_route_states,
                "spoken": subjectless_remaining_stops_route_spoken,
                "actions": subjectless_remaining_stops_route_actions,
            },
        },
        {
            "name": "subjectless remaining-stops-count route question speaks upcoming cities without actions",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "柏林"
                for state in subjectless_remaining_count_route_states
            )
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in subjectless_remaining_count_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in subjectless_remaining_count_route_actions),
            "detail": {
                "states": subjectless_remaining_count_route_states,
                "spoken": subjectless_remaining_count_route_spoken,
                "actions": subjectless_remaining_count_route_actions,
            },
        },
        {
            "name": "subjectless remaining-place-count route question speaks upcoming cities without actions",
            "passed": any(
                state.get("label") == "Sunset route" and state.get("track") == "柏林"
                for state in subjectless_remaining_place_count_route_states
            )
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in subjectless_remaining_place_count_route_spoken)
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in subjectless_remaining_place_count_route_actions
            ),
            "detail": {
                "states": subjectless_remaining_place_count_route_states,
                "spoken": subjectless_remaining_place_count_route_spoken,
                "actions": subjectless_remaining_place_count_route_actions,
            },
        },
        {
            "name": "remaining-which-stations route questions speak upcoming cities without actions",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in case["states"])
                and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in remaining_which_stations_route_cases
            ),
            "detail": remaining_which_stations_route_cases,
        },
        {
            "name": "remaining-cities route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in remaining_cities_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in remaining_cities_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in remaining_cities_route_actions),
            "detail": {
                "states": remaining_cities_route_states,
                "spoken": remaining_cities_route_spoken,
                "actions": remaining_cities_route_actions,
            },
        },
        {
            "name": "remaining-which-cities route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in remaining_which_cities_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in remaining_which_cities_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in remaining_which_cities_route_actions),
            "detail": {
                "states": remaining_which_cities_route_states,
                "spoken": remaining_which_cities_route_spoken,
                "actions": remaining_which_cities_route_actions,
            },
        },
        {
            "name": "terse remaining-city route questions speak upcoming cities without actions",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in case["states"])
                and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in remaining_city_route_cases
            ),
            "detail": remaining_city_route_cases,
        },
        {
            "name": "today-remaining-stations route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in today_remaining_stations_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in today_remaining_stations_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in today_remaining_stations_route_actions),
            "detail": {
                "states": today_remaining_stations_route_states,
                "spoken": today_remaining_stations_route_spoken,
                "actions": today_remaining_stations_route_actions,
            },
        },
        {
            "name": "remaining-sunset-count route questions speak upcoming cities without actions",
            "passed": all(
                any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in case["states"])
                and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in case["spoken"])
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in remaining_sunset_count_route_cases
            ),
            "detail": remaining_sunset_count_route_cases,
        },
        {
            "name": "radio-later-remaining-stations route question speaks upcoming cities without actions",
            "passed": any(state.get("label") == "Sunset route" and state.get("track") == "柏林" for state in radio_later_remaining_stations_route_states)
            and any("后面3站" in text and "柏林" in text and "巴黎" in text for text in radio_later_remaining_stations_route_spoken)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in radio_later_remaining_stations_route_actions),
            "detail": {
                "states": radio_later_remaining_stations_route_states,
                "spoken": radio_later_remaining_stations_route_spoken,
                "actions": radio_later_remaining_stations_route_actions,
            },
        },
        {
            "name": "natural 24h program phrase builds day playlist silently",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("status") == "idle"
                and "静音中" in state.get("message", "")
                for state in day_program_states
            )
            and sorted(day_program_titles)
            == sorted(["Plastic Love", "真夜中のドア", "Heroes", "Digital Love", "夜车灯线"])
            and day_program_index == 0
            and "stop" in day_program_actions
            and not day_program_spoken
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in day_program_actions),
            "detail": {"states": day_program_states, "actions": day_program_actions, "titles": day_program_titles, "spoken": day_program_spoken},
        },
        {
            "name": "daylong sunset radio phrase routes to 24h playlist skill",
            "passed": any(state.get("label") == "静音中" and state.get("status") == "idle" for state in daylong_program_states)
            and "stop" in daylong_program_actions
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in daylong_program_actions),
            "detail": {"states": daylong_program_states, "actions": daylong_program_actions},
        },
        {
            "name": "sea-sunset pick-songs phrase uses local playlist skill silently",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("status") == "idle"
                and "静音中" in state.get("message", "")
                and "本地曲库" in state.get("message", "")
                for state in sea_sunset_playlist_states
            )
            and sea_sunset_playlist_titles[:1] == ["Digital Love"]
            and "stop" in sea_sunset_playlist_actions
            and not sea_sunset_playlist_spoken
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in sea_sunset_playlist_actions),
            "detail": {
                "states": sea_sunset_playlist_states,
                "actions": sea_sunset_playlist_actions,
                "titles": sea_sunset_playlist_titles,
                "spoken": sea_sunset_playlist_spoken,
            },
        },
        {
            "name": "way-home stable song phrase uses local playlist skill silently",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("status") == "idle"
                and "静音中" in state.get("message", "")
                and "本地曲库" in state.get("message", "")
                for state in way_home_playlist_states
            )
            and way_home_playlist_titles[:1] == ["夜车灯线"]
            and "stop" in way_home_playlist_actions
            and not way_home_playlist_spoken
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in way_home_playlist_actions),
            "detail": {
                "states": way_home_playlist_states,
                "actions": way_home_playlist_actions,
                "titles": way_home_playlist_titles,
                "spoken": way_home_playlist_spoken,
            },
        },
        {
            "name": "commute stable song phrase uses local playlist skill silently",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("status") == "idle"
                and "静音中" in state.get("message", "")
                and "本地曲库" in state.get("message", "")
                for state in commute_playlist_states
            )
            and commute_playlist_titles[:1] == ["夜车灯线"]
            and "stop" in commute_playlist_actions
            and not commute_playlist_spoken
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in commute_playlist_actions),
            "detail": {
                "states": commute_playlist_states,
                "actions": commute_playlist_actions,
                "titles": commute_playlist_titles,
                "spoken": commute_playlist_spoken,
            },
        },
        {
            "name": "rainy song phrase uses local playlist skill silently",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("status") == "idle"
                and "静音中" in state.get("message", "")
                and "本地曲库" in state.get("message", "")
                for state in rainy_playlist_states
            )
            and rainy_playlist_titles[:1] == ["Plastic Love"]
            and "stop" in rainy_playlist_actions
            and not rainy_playlist_spoken
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in rainy_playlist_actions),
            "detail": {
                "states": rainy_playlist_states,
                "actions": rainy_playlist_actions,
                "titles": rainy_playlist_titles,
                "spoken": rainy_playlist_spoken,
            },
        },
        {
            "name": "casual context playlist phrases use local playlist skill silently",
            "passed": all(
                any(
                    state.get("label") == "静音中"
                    and state.get("status") == "idle"
                    and "静音中" in state.get("message", "")
                    and "本地曲库" in state.get("message", "")
                    for state in case["states"]
                )
                and bool(case["titles"])
                and "stop" in case["actions"]
                and not case["spoken"]
                and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in case["actions"])
                for case in casual_context_playlist_cases
            ),
            "detail": casual_context_playlist_cases,
        },
        {
            "name": "qualified quiet switch phrase uses local playlist before generic skip",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("status") == "idle"
                and "静音中" in state.get("message", "")
                and "本地曲库" in state.get("message", "")
                for state in switch_quiet_playlist_states
            )
            and bool(switch_quiet_playlist_titles)
            and "stop" in switch_quiet_playlist_actions
            and not switch_quiet_playlist_spoken
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in switch_quiet_playlist_actions),
            "detail": {
                "states": switch_quiet_playlist_states,
                "actions": switch_quiet_playlist_actions,
                "titles": switch_quiet_playlist_titles,
                "spoken": switch_quiet_playlist_spoken,
            },
        },
        {
            "name": "qualified scene switch phrase uses local playlist before generic skip",
            "passed": any(
                state.get("label") == "静音中"
                and state.get("status") == "idle"
                and "静音中" in state.get("message", "")
                and "本地曲库" in state.get("message", "")
                for state in switch_way_home_playlist_states
            )
            and switch_way_home_playlist_titles[:1] == ["夜车灯线"]
            and "stop" in switch_way_home_playlist_actions
            and not switch_way_home_playlist_spoken
            and not any(action.startswith("play_next:") or action == "wifi_failover" or action == "audio_output" for action in switch_way_home_playlist_actions),
            "detail": {
                "states": switch_way_home_playlist_states,
                "actions": switch_way_home_playlist_actions,
                "titles": switch_way_home_playlist_titles,
                "spoken": switch_way_home_playlist_spoken,
            },
        },
        {
            "name": "catalog question speaks library size",
            "passed": any(state.get("label") == "Music library" for state in catalog_states)
            and any("3 座城市" in text and "5 首歌" in text for text in catalog_spoken),
            "detail": {"states": catalog_states, "spoken": catalog_spoken},
        },
        {
            "name": "natural skill question publishes callable skill overview without audio actions",
            "passed": any(
                state.get("label") == "Skill overview"
                and "热点切换" in str(state.get("message") or "")
                and "电池/屏幕/按钮/语音/静音医生" in str(state.get("message") or "")
                and "隐私报告" in str(state.get("message") or "")
                and "长按橙色键" in str(state.get("message") or "")
                and "上一动作" in str(state.get("message") or "")
                and "上一句语音" in str(state.get("message") or "")
                and "纠正听错" in str(state.get("message") or "")
                for state in skill_overview_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in help_me_skill_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in casual_skill_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in casual_can_do_something_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in short_can_do_something_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in can_do_which_things_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in casual_help_do_something_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in help_which_ways_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in casual_what_do_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in what_all_can_do_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in all_capabilities_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in function_list_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in what_else_can_do_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in ability_talent_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in ability_skills_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in can_help_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in casual_help_me_do_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in natural_help_me_do_something_states
            )
            and all(
                any(
                    state.get("label") == "Skill overview"
                    and "直接说需求" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in casual_skill_overview_cases
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in tool_skill_states
            )
            and any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                for state in tool_calling_skill_states
            )
            and all(
                any(
                    state.get("label") == "Skill overview"
                    and "直接说需求" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in mixed_language_tool_cases
            )
            and all(
                any(
                    state.get("label") == "Skill overview"
                    and "直接说需求" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in action_skill_cases
            )
            and all(
                any(
                    state.get("label") == "Skill overview"
                    and "直接说需求" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in natural_language_skill_cases
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in skill_overview_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in help_me_skill_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_skill_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_can_do_something_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_can_do_something_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in can_do_which_things_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_help_do_something_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in help_which_ways_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_what_do_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in what_all_can_do_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in all_capabilities_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in function_list_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in what_else_can_do_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in ability_talent_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in ability_skills_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in can_help_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_help_me_do_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in natural_help_me_do_something_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in tool_skill_actions)
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in tool_calling_skill_actions),
            "detail": {
                "states": skill_overview_states,
                "actions": skill_overview_actions,
                "helpMeStates": help_me_skill_states,
                "helpMeActions": help_me_skill_actions,
                "casualStates": casual_skill_states,
                "casualActions": casual_skill_actions,
                "casualCanDoSomethingStates": casual_can_do_something_states,
                "casualCanDoSomethingActions": casual_can_do_something_actions,
                "shortCanDoSomethingStates": short_can_do_something_states,
                "shortCanDoSomethingActions": short_can_do_something_actions,
                "canDoWhichThingsStates": can_do_which_things_states,
                "canDoWhichThingsActions": can_do_which_things_actions,
                "casualHelpDoSomethingStates": casual_help_do_something_states,
                "casualHelpDoSomethingActions": casual_help_do_something_actions,
                "helpWhichWaysStates": help_which_ways_states,
                "helpWhichWaysActions": help_which_ways_actions,
                "casualWhatDoStates": casual_what_do_states,
                "casualWhatDoActions": casual_what_do_actions,
                "whatAllCanDoStates": what_all_can_do_states,
                "whatAllCanDoActions": what_all_can_do_actions,
                "allCapabilitiesStates": all_capabilities_states,
                "allCapabilitiesActions": all_capabilities_actions,
                "functionListStates": function_list_states,
                "functionListActions": function_list_actions,
                "whatElseCanDoStates": what_else_can_do_states,
                "whatElseCanDoActions": what_else_can_do_actions,
                "abilityTalentStates": ability_talent_states,
                "abilityTalentActions": ability_talent_actions,
                "abilitySkillsStates": ability_skills_states,
                "abilitySkillsActions": ability_skills_actions,
                "canHelpStates": can_help_states,
                "canHelpActions": can_help_actions,
                "casualHelpMeDoStates": casual_help_me_do_states,
                "casualHelpMeDoActions": casual_help_me_do_actions,
                "naturalHelpMeDoSomethingStates": natural_help_me_do_something_states,
                "naturalHelpMeDoSomethingActions": natural_help_me_do_something_actions,
                "casualSkillOverviewCases": casual_skill_overview_cases,
                "toolStates": tool_skill_states,
                "toolActions": tool_skill_actions,
                "mixedLanguageToolCases": mixed_language_tool_cases,
                "toolCallingStates": tool_calling_skill_states,
                "toolCallingActions": tool_calling_skill_actions,
                "actionSkillCases": action_skill_cases,
                "naturalLanguageSkillCases": natural_language_skill_cases,
            },
        },
        {
            "name": "quiet-prefixed skill questions stay screen-only",
            "passed": all(
                any(
                    state.get("label") == "Skill overview"
                    and "直接说需求" in str(state.get("message") or "")
                    and "长按橙色键" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in quiet_skill_overview_cases
            ),
            "detail": quiet_skill_overview_cases,
        },
        {
            "name": "text-only skill overview suffix stays screen-only",
            "passed": any(
                state.get("label") == "Skill overview"
                and "直接说需求" in str(state.get("message") or "")
                and "长按橙色键" in str(state.get("message") or "")
                for state in text_only_tool_skill_states
            )
            and text_only_tool_skill_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in text_only_tool_skill_actions),
            "detail": {
                "states": text_only_tool_skill_states,
                "spoken": text_only_tool_skill_spoken,
                "actions": text_only_tool_skill_actions,
            },
        },
        {
            "name": "text-only capability suffix routes to capability doctor without speech",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in text_only_capability_states
            )
            and text_only_capability_spoken == []
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in text_only_capability_actions),
            "detail": {
                "states": text_only_capability_states,
                "spoken": text_only_capability_spoken,
                "actions": text_only_capability_actions,
            },
        },
        {
            "name": "skill fallback and low-confidence guardrail phrases publish safe routing policy",
            "passed": all(
                any(
                    state.get("label") == "Skill fallback"
                    and "不会乱点" in str(state.get("message") or "")
                    and "低置信度" in str(state.get("message") or "")
                    and "半句话" in str(state.get("message") or "")
                    and "静音保护" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in skill_fallback_cases
            ),
            "detail": skill_fallback_cases,
        },
        {
            "name": "quiet-prefixed skill fallback questions stay screen-only",
            "passed": all(
                any(
                    state.get("label") == "Skill fallback"
                    and "不会乱点" in str(state.get("message") or "")
                    and "低置信度" in str(state.get("message") or "")
                    and "静音保护" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in quiet_skill_fallback_cases
            ),
            "detail": quiet_skill_fallback_cases,
        },
        {
            "name": "natural self-check command routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in self_check_states
            ),
            "detail": self_check_states,
        },
        {
            "name": "self-check-yourself phrase routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in self_check_yourself_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in self_check_yourself_actions),
            "detail": {"states": self_check_yourself_states, "actions": self_check_yourself_actions},
        },
        {
            "name": "health-check phrase routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in health_check_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in health_check_actions),
            "detail": {"states": health_check_states, "actions": health_check_actions},
        },
        {
            "name": "natural agent-health question routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in agent_health_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in agent_health_actions),
            "detail": {"states": agent_health_states, "actions": agent_health_actions},
        },
        {
            "name": "natural health-check request routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in natural_health_check_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in natural_health_check_actions),
            "detail": {"states": natural_health_check_states, "actions": natural_health_check_actions},
        },
        {
            "name": "natural troubleshoot request routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in troubleshoot_check_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in troubleshoot_check_actions),
            "detail": {"states": troubleshoot_check_states, "actions": troubleshoot_check_actions},
        },
        {
            "name": "natural broken-status question routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in where_broken_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in where_broken_actions),
            "detail": {"states": where_broken_states, "actions": where_broken_actions},
        },
        {
            "name": "natural self-inspect request routes to capability doctor",
            "passed": any(
                state.get("label") == "Capability"
                and state.get("city") == "能力总览"
                and "本机控制" in str(state.get("message") or "")
                and "对话兜底" in str(state.get("message") or "")
                for state in self_inspect_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in self_inspect_actions),
            "detail": {"states": self_inspect_states, "actions": self_inspect_actions},
        },
        queue_doctor_case("queue doctor phrase reports pending command queue", queue_doctor_states, queue_doctor_actions),
        queue_doctor_case(
            "natural stuck phrase reports pending command queue",
            natural_stuck_queue_states,
            natural_stuck_queue_actions,
        ),
        queue_doctor_case(
            "natural not-executed phrase reports pending command queue",
            natural_not_executed_queue_states,
            natural_not_executed_queue_actions,
        ),
        queue_doctor_case(
            "previous-command queued phrase reports pending command queue",
            previous_command_queue_states,
            previous_command_queue_actions,
        ),
        {
            "name": "casual queue follow-up phrases report pending command queue",
            "passed": all(
                queue_doctor_case(case["phrase"], case["states"], case["actions"])["passed"]
                for case in casual_queue_followup_cases
            ),
            "detail": casual_queue_followup_cases,
        },
        service_doctor_case("service doctor phrase reports runtime service state", service_doctor_states, []),
        {
            "name": "casual service doctor phrases report runtime service state",
            "passed": all(
                service_doctor_case(case["phrase"], case["states"], case["actions"])["passed"]
                for case in service_doctor_variant_cases
            ),
            "detail": service_doctor_variant_cases,
        },
        tts_doctor_case("tts doctor phrase reports silent speech reply readiness", tts_doctor_states, tts_doctor_actions),
        {
            "name": "casual tts doctor phrases report silent speech reply readiness",
            "passed": all(
                tts_doctor_case(case["phrase"], case["states"], case["actions"])["passed"]
                for case in tts_doctor_variant_cases
            ),
            "detail": tts_doctor_variant_cases,
        },
        {
            "name": "pi-tts quiet-channel phrases report TTS policy screen-only",
            "passed": all(
                tts_doctor_case(case["phrase"], case["states"], case["actions"])["passed"]
                and case["spoken"] == []
                for case in tts_doctor_quiet_channel_cases
            ),
            "detail": tts_doctor_quiet_channel_cases,
        },
        {
            "name": "local-control boundary questions stay screen-only without playback actions",
            "passed": all(
                any(
                    state.get("city") == "本地控制"
                    and state.get("track") == "局域网 API"
                    and "不会开放公网控制" in str(state.get("message") or "")
                    and "不会显示或写出" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(
                    action == "stop"
                    or action == "audio_output"
                    or action == "wifi_failover"
                    or action.startswith("play_next:")
                    or action.startswith("hop_city:")
                    for action in case["actions"]
                )
                for case in local_control_cases
            ),
            "detail": local_control_cases,
        },
        deploy_doctor_case("deploy doctor phrase reports runtime deploy readiness", deploy_doctor_states, deploy_doctor_actions),
        {
            "name": "casual deploy doctor phrases report runtime deploy readiness",
            "passed": all(
                deploy_doctor_case(case["phrase"], case["states"], case["actions"])["passed"]
                for case in deploy_doctor_variant_cases
            ),
            "detail": deploy_doctor_variant_cases,
        },
        {
            "name": "casual boot doctor phrases report startup service readiness",
            "passed": all(
                boot_doctor_case(case["phrase"], case["states"], case["actions"])["passed"]
                for case in boot_doctor_variant_cases
            ),
            "detail": boot_doctor_variant_cases,
        },
        boot_doctor_case("boot doctor phrase reports startup service readiness", boot_doctor_states, boot_doctor_actions),
        {
            "name": "quiet-prefixed doctor questions stay screen-only",
            "passed": all(
                any(
                    state.get("city") == case["expectedCity"]
                    and case["expectedMessage"] in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in quiet_doctor_cases
            ),
            "detail": quiet_doctor_cases,
        },
        {
            "name": "text-only doctor suffixes stay screen-only",
            "passed": queue_doctor_case(
                "text-only queue doctor suffix",
                text_only_queue_doctor_states,
                text_only_queue_doctor_actions,
            )["passed"]
            and service_doctor_case(
                "text-only service doctor suffix",
                text_only_service_doctor_states,
                text_only_service_doctor_actions,
            )["passed"]
            and tts_doctor_case(
                "text-only tts doctor suffix",
                text_only_tts_doctor_states,
                text_only_tts_doctor_actions,
            )["passed"]
            and button_doctor_case(
                "text-only button doctor suffix",
                text_only_button_doctor_states,
                text_only_button_doctor_actions,
            )["passed"]
            and text_only_queue_doctor_spoken == []
            and text_only_service_doctor_spoken == []
            and text_only_tts_doctor_spoken == []
            and text_only_button_doctor_spoken == [],
            "detail": {
                "queue": {
                    "states": text_only_queue_doctor_states,
                    "spoken": text_only_queue_doctor_spoken,
                    "actions": text_only_queue_doctor_actions,
                },
                "service": {
                    "states": text_only_service_doctor_states,
                    "spoken": text_only_service_doctor_spoken,
                    "actions": text_only_service_doctor_actions,
                },
                "tts": {
                    "states": text_only_tts_doctor_states,
                    "spoken": text_only_tts_doctor_spoken,
                    "actions": text_only_tts_doctor_actions,
                },
                "button": {
                    "states": text_only_button_doctor_states,
                    "spoken": text_only_button_doctor_spoken,
                    "actions": text_only_button_doctor_actions,
                },
            },
        },
        {
            "name": "natural battery sufficiency question routes to battery doctor",
            "passed": any(
                state.get("label") == "Battery doctor"
                and state.get("city") == "电池医生"
                and state.get("track") == "PiSugar"
                and "PiSugar 电量 82%" in str(state.get("message") or "")
                for state in battery_sufficiency_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in battery_sufficiency_actions),
            "detail": {"states": battery_sufficiency_states, "actions": battery_sufficiency_actions},
        },
        {
            "name": "natural battery runtime question routes to battery doctor",
            "passed": any(
                state.get("label") == "Battery doctor"
                and state.get("city") == "电池医生"
                and "PiSugar 电量 82%" in str(state.get("message") or "")
                for state in battery_runtime_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in battery_runtime_actions),
            "detail": {"states": battery_runtime_states, "actions": battery_runtime_actions},
        },
        {
            "name": "natural charging advice question routes to battery doctor",
            "passed": any(
                state.get("label") == "Battery doctor"
                and state.get("city") == "电池医生"
                and "PiSugar 电量 82%" in str(state.get("message") or "")
                for state in battery_charging_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in battery_charging_actions),
            "detail": {"states": battery_charging_states, "actions": battery_charging_actions},
        },
        {
            "name": "quiet-prefixed battery questions route to battery doctor screen-only",
            "passed": all(
                any(
                    state.get("label") == "Battery doctor"
                    and state.get("city") == "电池医生"
                    and "PiSugar 电量 82%" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in quiet_battery_doctor_cases
            ),
            "detail": quiet_battery_doctor_cases,
        },
        screen_doctor_case("natural screen-dark phrase routes to screen doctor", screen_dark_states, screen_dark_actions),
        screen_doctor_case(
            "natural status invisible phrase routes to screen doctor",
            status_invisible_states,
            status_invisible_actions,
        ),
        screen_doctor_case(
            "natural avatar stuck phrase routes to screen doctor",
            avatar_stuck_states,
            avatar_stuck_actions,
        ),
        button_doctor_case(
            "natural orange-button long-press question routes to button doctor",
            button_doctor_states,
            button_doctor_actions,
        ),
        button_doctor_case(
            "pressing orange-key long-press question routes to button doctor",
            button_pressing_states,
            button_pressing_actions,
        ),
        button_doctor_case(
            "pressing orange-button hold question routes to button doctor",
            button_hold_pressing_states,
            button_hold_pressing_actions,
        ),
        button_doctor_case("natural button-no-response phrase routes to button doctor", button_no_response_states, button_no_response_actions),
        button_doctor_case(
            "natural long-press-no-response phrase routes to button doctor",
            long_press_no_response_states,
            long_press_no_response_actions,
        ),
        button_doctor_case(
            "natural orange-button-flaky phrase routes to button doctor",
            orange_button_flaky_states,
            orange_button_flaky_actions,
        ),
        {
            "name": "natural can-you-hear-me command routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and state.get("track") == "default"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in voice_doctor_actions),
            "detail": {"states": voice_doctor_states, "actions": voice_doctor_actions},
        },
        {
            "name": "casual did-you-hear phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in casual_hear_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_hear_voice_doctor_actions),
            "detail": {"states": casual_hear_voice_doctor_states, "actions": casual_hear_voice_doctor_actions},
        },
        {
            "name": "speaking-heard phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in speaking_heard_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in speaking_heard_voice_doctor_actions),
            "detail": {"states": speaking_heard_voice_doctor_states, "actions": speaking_heard_voice_doctor_actions},
        },
        {
            "name": "inverted speaking-heard phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in inverted_heard_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in inverted_heard_voice_doctor_actions),
            "detail": {"states": inverted_heard_voice_doctor_states, "actions": inverted_heard_voice_doctor_actions},
        },
        {
            "name": "colloquial talking-heard phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in talking_heard_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in talking_heard_voice_doctor_actions),
            "detail": {"states": talking_heard_voice_doctor_states, "actions": talking_heard_voice_doctor_actions},
        },
        {
            "name": "handset-broken phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in handset_broken_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in handset_broken_voice_doctor_actions),
            "detail": {"states": handset_broken_voice_doctor_states, "actions": handset_broken_voice_doctor_actions},
        },
        {
            "name": "receiver-hears-my-voice phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in receiver_my_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in receiver_my_voice_doctor_actions),
            "detail": {"states": receiver_my_voice_doctor_states, "actions": receiver_my_voice_doctor_actions},
        },
        {
            "name": "casual voice self-check phrases route to voice doctor",
            "passed": all(
                any(
                    state.get("city") == "语音医生"
                    and "麦克风" in str(state.get("message") or "")
                    and "ASR" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in voice_self_check_cases
            ),
            "detail": voice_self_check_cases,
        },
        {
            "name": "natural can-you-understand-me command routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in understand_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in understand_voice_doctor_actions),
            "detail": {"states": understand_voice_doctor_states, "actions": understand_voice_doctor_actions},
        },
        {
            "name": "no-response phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in no_response_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in no_response_voice_doctor_actions),
            "detail": {"states": no_response_voice_doctor_states, "actions": no_response_voice_doctor_actions},
        },
        {
            "name": "wake-no-response phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "唤醒窗口" in str(state.get("message") or "")
                for state in wake_no_response_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in wake_no_response_voice_doctor_actions),
            "detail": {"states": wake_no_response_voice_doctor_states, "actions": wake_no_response_voice_doctor_actions},
        },
        {
            "name": "wake-name questions route to voice doctor",
            "passed": all(
                any(
                    state.get("city") == "语音医生"
                    and "唤醒窗口" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in wake_name_voice_doctor_cases
            ),
            "detail": wake_name_voice_doctor_cases,
        },
        {
            "name": "did-not-hear-me phrase routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "麦克风" in str(state.get("message") or "")
                and "ASR" in str(state.get("message") or "")
                for state in not_heard_voice_doctor_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in not_heard_voice_doctor_actions),
            "detail": {"states": not_heard_voice_doctor_states, "actions": not_heard_voice_doctor_actions},
        },
        {
            "name": "natural microphone question routes to voice doctor",
            "passed": any(
                state.get("city") == "语音医生"
                and "唤醒窗口" in str(state.get("message") or "")
                for state in mic_doctor_states
            ),
            "detail": mic_doctor_states,
        },
        {
            "name": "low-power outdoor speech routes to portable briefing without audio actions",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                for state in low_power_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in low_power_actions),
            "detail": {"states": low_power_states, "actions": low_power_actions},
        },
        {
            "name": "first-person low-phone-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in first_person_low_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in first_person_low_power_actions
            ),
            "detail": {
                "states": first_person_low_power_states,
                "actions": first_person_low_power_actions,
            },
        },
        {
            "name": "phone-power-nearly-gone phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_power_nearly_gone_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_power_nearly_gone_actions
            ),
            "detail": {
                "states": phone_power_nearly_gone_states,
                "actions": phone_power_nearly_gone_actions,
            },
        },
        {
            "name": "phone-nearly-off phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_nearly_off_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_nearly_off_actions
            ),
            "detail": {
                "states": phone_nearly_off_states,
                "actions": phone_nearly_off_actions,
            },
        },
        {
            "name": "phone-cannot-last phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_cannot_last_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_cannot_last_actions
            ),
            "detail": {
                "states": phone_cannot_last_states,
                "actions": phone_cannot_last_actions,
            },
        },
        {
            "name": "battery-draining-out phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in battery_draining_out_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in battery_draining_out_actions
            ),
            "detail": {
                "states": battery_draining_out_states,
                "actions": battery_draining_out_actions,
            },
        },
        {
            "name": "phone-has-percent-low-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_has_percent_low_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_has_percent_low_power_actions
            ),
            "detail": {
                "states": phone_has_percent_low_power_states,
                "actions": phone_has_percent_low_power_actions,
            },
        },
        {
            "name": "battery-has-spoken-percent phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in battery_has_spoken_percent_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in battery_has_spoken_percent_actions
            ),
            "detail": {
                "states": battery_has_spoken_percent_states,
                "actions": battery_has_spoken_percent_actions,
            },
        },
        {
            "name": "phone-has-one-bar-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_has_one_bar_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_has_one_bar_power_actions
            ),
            "detail": {
                "states": phone_has_one_bar_power_states,
                "actions": phone_has_one_bar_power_actions,
            },
        },
        portable_briefing_case(
            "terse first-person one-bar-power phrase routes to portable briefing",
            terse_first_person_one_bar_power_states,
            terse_first_person_one_bar_power_actions,
        ),
        portable_briefing_case(
            "bare only-one-bar-power phrase routes to portable briefing",
            bare_only_one_bar_power_states,
            bare_only_one_bar_power_actions,
        ),
        portable_briefing_case(
            "bare just-one-bar-power phrase routes to portable briefing",
            bare_just_one_bar_power_states,
            bare_just_one_bar_power_actions,
        ),
        portable_briefing_case(
            "bare has-one-bar-power phrase routes to portable briefing",
            bare_has_one_bar_power_states,
            bare_has_one_bar_power_actions,
        ),
        portable_briefing_case(
            "terse spoken-five-percent-power phrase routes to portable briefing",
            terse_spoken_five_percent_power_states,
            terse_spoken_five_percent_power_actions,
        ),
        portable_briefing_case(
            "terse digit-five-percent-power phrase routes to portable briefing",
            terse_digit_five_percent_power_states,
            terse_digit_five_percent_power_actions,
        ),
        portable_briefing_case(
            "colloquial five-points-power phrase routes to portable briefing",
            colloquial_five_points_power_states,
            colloquial_five_points_power_actions,
        ),
        portable_briefing_case(
            "bare digit-points-power phrase routes to portable briefing",
            bare_digit_points_power_states,
            bare_digit_points_power_actions,
        ),
        {
            "name": "colloquial power-point phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "先确认路、电量和回家方式" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in colloquial_power_point_cases
            ),
            "detail": colloquial_power_point_cases,
        },
        {
            "name": "high phone-percent phrase does not route to portable briefing",
            "passed": not any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                for state in phone_high_percent_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_high_percent_power_actions
            ),
            "detail": {
                "states": phone_high_percent_power_states,
                "actions": phone_high_percent_power_actions,
            },
        },
        {
            "name": "phone signal has bar phrase does not route to portable briefing",
            "passed": not any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                for state in phone_signal_has_bar_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_signal_has_bar_actions
            ),
            "detail": {
                "states": phone_signal_has_bar_states,
                "actions": phone_signal_has_bar_actions,
            },
        },
        {
            "name": "phone-percent-low-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_percent_low_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_percent_low_power_actions
            ),
            "detail": {
                "states": phone_percent_low_power_states,
                "actions": phone_percent_low_power_actions,
            },
        },
        {
            "name": "spoken phone-percent-low-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in spoken_phone_percent_low_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in spoken_phone_percent_low_power_actions
            ),
            "detail": {
                "states": spoken_phone_percent_low_power_states,
                "actions": spoken_phone_percent_low_power_actions,
            },
        },
        {
            "name": "natural percent-low-power phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in natural_percent_low_power_cases
            ),
            "detail": natural_percent_low_power_cases,
        },
        {
            "name": "phone-bar-low-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_bar_low_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_bar_low_power_actions
            ),
            "detail": {
                "states": phone_bar_low_power_states,
                "actions": phone_bar_low_power_actions,
            },
        },
        {
            "name": "short phone-bar-low-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in short_phone_bar_low_power_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in short_phone_bar_low_power_actions
            ),
            "detail": {
                "states": short_phone_bar_low_power_states,
                "actions": short_phone_bar_low_power_actions,
            },
        },
        {
            "name": "phone signal bar phrase does not route to portable briefing",
            "passed": not any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                for state in phone_signal_bar_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_signal_bar_actions
            ),
            "detail": {
                "states": phone_signal_bar_states,
                "actions": phone_signal_bar_actions,
            },
        },
        {
            "name": "phone signal trouble phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in phone_signal_problem_cases
            ),
            "detail": phone_signal_problem_cases,
        },
        {
            "name": "guarded hotspot advice phrases route to portable briefing without failover",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in guarded_portable_hotspot_advice_cases
            ),
            "detail": guarded_portable_hotspot_advice_cases,
        },
        {
            "name": "hotspot misfire safety questions do not trigger failover",
            "passed": all(
                any(
                    state.get("label") == "热点防误触发"
                    and state.get("city") == "出门网络"
                    and state.get("track") == "防误触发"
                    and "不会自己乱连热点" in str(state.get("message") or "")
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in hotspot_connect_safety_cases
            ),
            "detail": hotspot_connect_safety_cases,
        },
        {
            "name": "natural low-phone-power phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in low_phone_power_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in low_phone_power_actions),
            "detail": {"states": low_phone_power_states, "actions": low_phone_power_actions},
        },
        {
            "name": "phone-power-not-enough phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in phone_power_not_enough_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_power_not_enough_actions
            ),
            "detail": {
                "states": phone_power_not_enough_states,
                "actions": phone_power_not_enough_actions,
            },
        },
        {
            "name": "phone-power-enough question routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in phone_power_enough_question_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in phone_power_enough_question_actions
            ),
            "detail": {
                "states": phone_power_enough_question_states,
                "actions": phone_power_enough_question_actions,
            },
        },
        {
            "name": "low-power natural questions route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "先确认路、电量和回家方式" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in low_power_question_cases
            ),
            "detail": low_power_question_cases,
        },
        {
            "name": "battery-enough-way-home phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in battery_enough_way_home_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in battery_enough_way_home_actions
            ),
            "detail": {
                "states": battery_enough_way_home_states,
                "actions": battery_enough_way_home_actions,
            },
        },
        portable_briefing_case(
            "battery-enough-direct-home phrase routes to portable briefing",
            battery_enough_direct_home_states,
            battery_enough_direct_home_actions,
        ),
        {
            "name": "battery-enough-home phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in battery_enough_home_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in battery_enough_home_actions
            ),
            "detail": {
                "states": battery_enough_home_states,
                "actions": battery_enough_home_actions,
            },
        },
        portable_briefing_case(
            "phone-last-home question routes to portable briefing",
            phone_last_home_states,
            phone_last_home_actions,
        ),
        {
            "name": "can-last-way-home phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in can_last_way_home_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in can_last_way_home_actions
            ),
            "detail": {
                "states": can_last_way_home_states,
                "actions": can_last_way_home_actions,
            },
        },
        portable_briefing_case(
            "battery-failing phrase routes to portable briefing",
            battery_failing_states,
            battery_failing_actions,
        ),
        {
            "name": "little phone-power-left phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in little_phone_power_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in little_phone_power_actions),
            "detail": {"states": little_phone_power_states, "actions": little_phone_power_actions},
        },
        {
            "name": "power-saving phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in power_saving_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in power_saving_actions),
            "detail": {"states": power_saving_states, "actions": power_saving_actions},
        },
        {
            "name": "casual power-saving phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in casual_power_saving_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in casual_power_saving_actions
            ),
            "detail": {
                "states": casual_power_saving_states,
                "actions": casual_power_saving_actions,
            },
        },
        portable_briefing_case(
            "careful power-saving phrase routes to portable briefing",
            careful_power_saving_states,
            careful_power_saving_actions,
        ),
        {
            "name": "colloquial low-battery phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in low_battery_colloquial_cases
            ),
            "detail": low_battery_colloquial_cases,
        },
        {
            "name": "late-night route safety speech routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and "回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in late_home_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in late_home_actions),
            "detail": {"states": late_home_states, "actions": late_home_actions},
        },
        {
            "name": "natural too-late-outside phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in too_late_outside_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in too_late_outside_actions),
            "detail": {"states": too_late_outside_states, "actions": too_late_outside_actions},
        },
        {
            "name": "dark-road safety phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in portable_dark_route_cases
            ),
            "detail": portable_dark_route_cases,
        },
        {
            "name": "going-home intent routes to portable briefing without actions",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in going_home_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in going_home_actions),
            "detail": {"states": going_home_states, "actions": going_home_actions},
        },
        {
            "name": "outdoor unease speech routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in unsafe_route_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in unsafe_route_actions),
            "detail": {"states": unsafe_route_states, "actions": unsafe_route_actions},
        },
        {
            "name": "dangerous-route phrase routes to portable briefing without actions",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in dangerous_route_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in dangerous_route_actions),
            "detail": {"states": dangerous_route_states, "actions": dangerous_route_actions},
        },
        {
            "name": "following-safety phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in portable_following_safety_cases
            ),
            "detail": portable_following_safety_cases,
        },
        {
            "name": "short outdoor fear phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in short_fear_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in short_fear_actions),
            "detail": {"states": short_fear_states, "actions": short_fear_actions},
        },
        {
            "name": "short route fear phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in route_fear_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in route_fear_actions),
            "detail": {"states": route_fear_states, "actions": route_fear_actions},
        },
        {
            "name": "natural worried-way-home phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in way_home_worried_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in way_home_worried_actions),
            "detail": {"states": way_home_worried_states, "actions": way_home_worried_actions},
        },
        {
            "name": "natural walk-me-back phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "回家方式" in str(state.get("message") or "")
                for state in walk_me_back_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in walk_me_back_actions),
            "detail": {"states": walk_me_back_states, "actions": walk_me_back_actions},
        },
        portable_briefing_case(
            "walk-me-to-subway phrase routes to portable briefing",
            walk_me_subway_states,
            walk_me_subway_actions,
        ),
        {
            "name": "portable wayfinding phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in portable_wayfinding_cases
            ),
            "detail": portable_wayfinding_cases,
        },
        {
            "name": "surroundings safety question routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in surroundings_safety_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in surroundings_safety_actions),
            "detail": {"states": surroundings_safety_states, "actions": surroundings_safety_actions},
        },
        {
            "name": "nearby-safety question routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in nearby_safety_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in nearby_safety_actions),
            "detail": {"states": nearby_safety_states, "actions": nearby_safety_actions},
        },
        {
            "name": "side-safety unease phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in side_safety_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in side_safety_actions),
            "detail": {"states": side_safety_states, "actions": side_safety_actions},
        },
        portable_briefing_case(
            "route-safety question routes to portable briefing",
            route_safety_states,
            route_safety_actions,
        ),
        {
            "name": "taxi request routes to portable briefing without actions",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "回家方式" in str(state.get("message") or "")
                and "需要音乐时再明确说城市或心情" in str(state.get("message") or "")
                for state in taxi_request_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in taxi_request_actions),
            "detail": {"states": taxi_request_states, "actions": taxi_request_actions},
        },
        {
            "name": "safe-place request routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in safe_place_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in safe_place_actions
            ),
            "detail": {"states": safe_place_states, "actions": safe_place_actions},
        },
        {
            "name": "rain shelter request routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in rain_shelter_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in rain_shelter_actions),
            "detail": {"states": rain_shelter_states, "actions": rain_shelter_actions},
        },
        {
            "name": "nearby transit request routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in nearby_station_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in nearby_station_actions),
            "detail": {"states": nearby_station_states, "actions": nearby_station_actions},
        },
        {
            "name": "find-subway-station phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in find_subway_station_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in find_subway_station_actions),
            "detail": {"states": find_subway_station_states, "actions": find_subway_station_actions},
        },
        {
            "name": "subway-station location phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in subway_station_location_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in subway_station_location_actions),
            "detail": {"states": subway_station_location_states, "actions": subway_station_location_actions},
        },
        {
            "name": "find-bus-stop phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in find_bus_stop_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in find_bus_stop_actions),
            "detail": {"states": find_bus_stop_states, "actions": find_bus_stop_actions},
        },
        {
            "name": "bus-stop location phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in bus_stop_location_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in bus_stop_location_actions),
            "detail": {"states": bus_stop_location_states, "actions": bus_stop_location_actions},
        },
        {
            "name": "bus-station alias location phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in bus_station_alias_location_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in bus_station_alias_location_actions),
            "detail": {"states": bus_station_alias_location_states, "actions": bus_station_alias_location_actions},
        },
        {
            "name": "nearby convenience-store question routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in convenience_store_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in convenience_store_actions
            ),
            "detail": {"states": convenience_store_states, "actions": convenience_store_actions},
        },
        {
            "name": "natural convenience-store-anywhere phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in any_convenience_store_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in any_convenience_store_actions
            ),
            "detail": {"states": any_convenience_store_states, "actions": any_convenience_store_actions},
        },
        {
            "name": "convenience-store location phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in convenience_store_location_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in convenience_store_location_actions
            ),
            "detail": {"states": convenience_store_location_states, "actions": convenience_store_location_actions},
        },
        {
            "name": "nearby pharmacy question routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in nearby_pharmacy_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in nearby_pharmacy_actions),
            "detail": {"states": nearby_pharmacy_states, "actions": nearby_pharmacy_actions},
        },
        {
            "name": "pharmacy location phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in pharmacy_location_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in pharmacy_location_actions),
            "detail": {"states": pharmacy_location_states, "actions": pharmacy_location_actions},
        },
        {
            "name": "first-aid pharmacy phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in first_aid_pharmacy_cases
            ),
            "detail": first_aid_pharmacy_cases,
        },
        {
            "name": "restroom need routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in restroom_need_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in restroom_need_actions),
            "detail": {"states": restroom_need_states, "actions": restroom_need_actions},
        },
        {
            "name": "casual restroom-location phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in casual_restroom_location_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_restroom_location_actions),
            "detail": {"states": casual_restroom_location_states, "actions": casual_restroom_location_actions},
        },
        {
            "name": "natural restroom-anywhere phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in any_restroom_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in any_restroom_actions),
            "detail": {"states": any_restroom_states, "actions": any_restroom_actions},
        },
        {
            "name": "natural restroom-need phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in natural_restroom_need_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in natural_restroom_need_actions
            ),
            "detail": {"states": natural_restroom_need_states, "actions": natural_restroom_need_actions},
        },
        {
            "name": "portable restroom direction phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in portable_restroom_direction_cases
            ),
            "detail": portable_restroom_direction_cases,
        },
        {
            "name": "subjectless restroom-need phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in subjectless_restroom_need_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in subjectless_restroom_need_actions
            ),
            "detail": {"states": subjectless_restroom_need_states, "actions": subjectless_restroom_need_actions},
        },
        {
            "name": "urgent restroom-need phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in urgent_restroom_need_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in urgent_restroom_need_actions
            ),
            "detail": {"states": urgent_restroom_need_states, "actions": urgent_restroom_need_actions},
        },
        {
            "name": "urgent pee phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in urgent_pee_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in urgent_pee_actions),
            "detail": {"states": urgent_pee_states, "actions": urgent_pee_actions},
        },
        {
            "name": "casual pee phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in casual_pee_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in casual_pee_actions),
            "detail": {"states": casual_pee_states, "actions": casual_pee_actions},
        },
        {
            "name": "charge spot request routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in charge_spot_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in charge_spot_actions),
            "detail": {"states": charge_spot_states, "actions": charge_spot_actions},
        },
        {
            "name": "natural charge-anywhere phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in any_charge_spot_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in any_charge_spot_actions),
            "detail": {"states": any_charge_spot_states, "actions": any_charge_spot_actions},
        },
        {
            "name": "subjectless charge-need phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in subjectless_charge_need_states
            )
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in subjectless_charge_need_actions
            ),
            "detail": {"states": subjectless_charge_need_states, "actions": subjectless_charge_need_actions},
        },
        {
            "name": "urgent charge-need phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in urgent_charge_need_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in urgent_charge_need_actions),
            "detail": {"states": urgent_charge_need_states, "actions": urgent_charge_need_actions},
        },
        {
            "name": "charge-place location phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in charge_place_location_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in charge_place_location_actions),
            "detail": {"states": charge_place_location_states, "actions": charge_place_location_actions},
        },
        {
            "name": "casual charge-up phrases route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in portable_charge_casual_cases
            ),
            "detail": portable_charge_casual_cases,
        },
        {
            "name": "sit-down request routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "先确认路、电量和回家方式" in str(state.get("message") or "")
                for state in sit_down_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in sit_down_actions),
            "detail": {"states": sit_down_states, "actions": sit_down_actions},
        },
        {
            "name": "portable rest-break variants route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "不主动播放" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in portable_rest_break_cases
            ),
            "detail": portable_rest_break_cases,
        },
        {
            "name": "rest-break request routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in rest_break_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in rest_break_actions),
            "detail": {"states": rest_break_states, "actions": rest_break_actions},
        },
        {
            "name": "outdoor-ready check routes to portable briefing before hotspot status",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "不主动播放" in str(state.get("message") or "")
                for state in outdoor_ready_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in outdoor_ready_actions),
            "detail": {"states": outdoor_ready_states, "actions": outdoor_ready_actions},
        },
        {
            "name": "take-you-out readiness routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "回家方式" in str(state.get("message") or "")
                for state in take_out_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in take_out_actions),
            "detail": {"states": take_out_states, "actions": take_out_actions},
        },
        {
            "name": "going-out-walk phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "回家方式" in str(state.get("message") or "")
                for state in walk_out_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in walk_out_actions),
            "detail": {"states": walk_out_states, "actions": walk_out_actions},
        },
        {
            "name": "take-you-out-walk phrase routes to portable briefing",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "回家方式" in str(state.get("message") or "")
                for state in take_walk_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in take_walk_actions),
            "detail": {"states": take_walk_states, "actions": take_walk_actions},
        },
        {
            "name": "portable readiness variants route to portable briefing",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "回家方式" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in portable_readiness_cases
            ),
            "detail": portable_readiness_cases,
        },
        {
            "name": "text-only portable briefing suffix writes briefing without speech",
            "passed": any(
                state.get("label") == "Portable briefing"
                and state.get("city") == "出门简报"
                and "屏幕优先" in str(state.get("message") or "")
                and "回家方式" in str(state.get("message") or "")
                for state in text_only_portable_briefing_states
            )
            and text_only_portable_briefing_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in text_only_portable_briefing_actions
            ),
            "detail": {
                "states": text_only_portable_briefing_states,
                "spoken": text_only_portable_briefing_spoken,
                "actions": text_only_portable_briefing_actions,
            },
        },
        {
            "name": "text-only portable briefing casual suffixes stay screen-only",
            "passed": all(
                any(
                    state.get("label") == "Portable briefing"
                    and state.get("city") == "出门简报"
                    and "屏幕优先" in str(state.get("message") or "")
                    and "回家方式" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(
                    action.startswith("play_next:") or action == "wifi_failover"
                    for action in case["actions"]
                )
                for case in text_only_portable_suffix_cases
            ),
            "detail": text_only_portable_suffix_cases,
        },
        {
            "name": "hotspot status answers portable network questions without secrets",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in hotspot_states
            )
            and "wifi_failover" not in hotspot_actions,
            "detail": {"states": hotspot_states, "actions": hotspot_actions},
        },
        {
            "name": "text-only hotspot-status suffix writes status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in text_only_hotspot_status_states
            )
            and text_only_hotspot_status_spoken == []
            and "wifi_failover" not in text_only_hotspot_status_actions
            and not any(action.startswith("play_next:") for action in text_only_hotspot_status_actions),
            "detail": {
                "states": text_only_hotspot_status_states,
                "spoken": text_only_hotspot_status_spoken,
                "actions": text_only_hotspot_status_actions,
            },
        },
        {
            "name": "text-only device-status suffix writes status without speech",
            "passed": any(
                state.get("city") == "设备状态"
                and ".23" in str(state.get("message") or "")
                and "42C" in str(state.get("message") or "")
                and "磁盘" in str(state.get("message") or "")
                for state in text_only_device_status_states
            )
            and text_only_device_status_spoken == []
            and not any(
                action.startswith("play_next:") or action == "wifi_failover"
                for action in text_only_device_status_actions
            ),
            "detail": {
                "states": text_only_device_status_states,
                "spoken": text_only_device_status_spoken,
                "actions": text_only_device_status_actions,
            },
        },
        {
            "name": "phone-hotspot connected question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in phone_hotspot_status_states
            )
            and "wifi_failover" not in phone_hotspot_status_actions
            and not any(action.startswith("play_next:") for action in phone_hotspot_status_actions),
            "detail": {"states": phone_hotspot_status_states, "actions": phone_hotspot_status_actions},
        },
        {
            "name": "casual phone-connected status questions answer without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case_states
                )
                and "wifi_failover" not in case_actions
                and not any(action.startswith("play_next:") for action in case_actions)
                for case_states, case_actions in [
                    (bare_phone_hotspot_status_states, bare_phone_hotspot_status_actions),
                    (short_phone_connected_status_states, short_phone_connected_status_actions),
                    (no_not_phone_connected_status_states, no_not_phone_connected_status_actions),
                    (
                        direct_no_not_phone_connected_status_states,
                        direct_no_not_phone_connected_status_actions,
                    ),
                    (reverse_phone_connected_status_states, reverse_phone_connected_status_actions),
                    (phone_attached_status_states, phone_attached_status_actions),
                    (phone_still_attached_status_states, phone_still_attached_status_actions),
                    (casual_phone_tether_status_states, casual_phone_tether_status_actions),
                    (casual_phone_network_tether_status_states, casual_phone_network_tether_status_actions),
                    (
                        explicit_phone_network_tether_status_states,
                        explicit_phone_network_tether_status_actions,
                    ),
                    (my_network_tether_status_states, my_network_tether_status_actions),
                    (my_hotspot_route_status_states, my_hotspot_route_status_actions),
                ]
            ),
            "detail": {
                "barePhoneHotspot": {
                    "states": bare_phone_hotspot_status_states,
                    "actions": bare_phone_hotspot_status_actions,
                },
                "short": {"states": short_phone_connected_status_states, "actions": short_phone_connected_status_actions},
                "noNot": {
                    "states": no_not_phone_connected_status_states,
                    "actions": no_not_phone_connected_status_actions,
                },
                "directNoNot": {
                    "states": direct_no_not_phone_connected_status_states,
                    "actions": direct_no_not_phone_connected_status_actions,
                },
                "reverse": {"states": reverse_phone_connected_status_states, "actions": reverse_phone_connected_status_actions},
                "attached": {"states": phone_attached_status_states, "actions": phone_attached_status_actions},
                "stillAttached": {
                    "states": phone_still_attached_status_states,
                    "actions": phone_still_attached_status_actions,
                },
                "casualTether": {
                    "states": casual_phone_tether_status_states,
                    "actions": casual_phone_tether_status_actions,
                },
                "casualPhoneNetworkTether": {
                    "states": casual_phone_network_tether_status_states,
                    "actions": casual_phone_network_tether_status_actions,
                },
                "explicitPhoneNetworkTether": {
                    "states": explicit_phone_network_tether_status_states,
                    "actions": explicit_phone_network_tether_status_actions,
                },
                "myNetworkTether": {
                    "states": my_network_tether_status_states,
                    "actions": my_network_tether_status_actions,
                },
                "myHotspotRoute": {
                    "states": my_hotspot_route_status_states,
                    "actions": my_hotspot_route_status_actions,
                },
            },
        },
        {
            "name": "ambiguous hotspot status questions answer without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                for case in ambiguous_hotspot_status_cases
            ),
            "detail": ambiguous_hotspot_status_cases,
        },
        {
            "name": "casual hotspot connected question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in casual_hotspot_status_states
            )
            and "wifi_failover" not in casual_hotspot_status_actions
            and not any(action.startswith("play_next:") for action in casual_hotspot_status_actions),
            "detail": {"states": casual_hotspot_status_states, "actions": casual_hotspot_status_actions},
        },
        {
            "name": "current-phone-hotspot question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in current_phone_hotspot_states
            )
            and "wifi_failover" not in current_phone_hotspot_actions
            and not any(action.startswith("play_next:") for action in current_phone_hotspot_actions),
            "detail": {"states": current_phone_hotspot_states, "actions": current_phone_hotspot_actions},
        },
        {
            "name": "named phone hotspot status question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in named_hotspot_status_states
            )
            and "wifi_failover" not in named_hotspot_status_actions
            and not any(action.startswith("play_next:") for action in named_hotspot_status_actions),
            "detail": {"states": named_hotspot_status_states, "actions": named_hotspot_status_actions},
        },
        {
            "name": "iphone hotspot status questions answer without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                for case in iphone_hotspot_status_cases
            ),
            "detail": iphone_hotspot_status_cases,
        },
        {
            "name": "vivo hotspot status questions answer without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                for case in vivo_hotspot_status_cases
            ),
            "detail": vivo_hotspot_status_cases,
        },
        {
            "name": "phone-cellular status question answers hotspot status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case_states
                )
                and "wifi_failover" not in case_actions
                and not any(action.startswith("play_next:") for action in case_actions)
                for case_states, case_actions in [
                    (phone_cellular_status_states, phone_cellular_status_actions),
                    (no_not_phone_network_status_states, no_not_phone_network_status_actions),
                    (
                        my_phone_cellular_cutover_status_states,
                        my_phone_cellular_cutover_status_actions,
                    ),
                    (my_cellular_cutover_status_states, my_cellular_cutover_status_actions),
                ]
            ),
            "detail": {
                "cellular": {"states": phone_cellular_status_states, "actions": phone_cellular_status_actions},
                "noNotPhoneNetwork": {
                    "states": no_not_phone_network_status_states,
                    "actions": no_not_phone_network_status_actions,
                },
                "myPhoneCellularCutover": {
                    "states": my_phone_cellular_cutover_status_states,
                    "actions": my_phone_cellular_cutover_status_actions,
                },
                "myCellularCutover": {
                    "states": my_cellular_cutover_status_states,
                    "actions": my_cellular_cutover_status_actions,
                },
            },
        },
        {
            "name": "phone-cellular connected question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in phone_cellular_connected_status_states
            )
            and "wifi_failover" not in phone_cellular_connected_status_actions
            and not any(action.startswith("play_next:") for action in phone_cellular_connected_status_actions),
            "detail": {
                "states": phone_cellular_connected_status_states,
                "actions": phone_cellular_connected_status_actions,
            },
        },
        {
            "name": "phone-cellular route question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in phone_cellular_route_status_states
            )
            and "wifi_failover" not in phone_cellular_route_status_actions
            and not any(action.startswith("play_next:") for action in phone_cellular_route_status_actions),
            "detail": {
                "states": phone_cellular_route_status_states,
                "actions": phone_cellular_route_status_actions,
            },
        },
        {
            "name": "cellular connected question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in cellular_connected_status_states
            )
            and "wifi_failover" not in cellular_connected_status_actions
            and not any(action.startswith("play_next:") for action in cellular_connected_status_actions),
            "detail": {
                "states": cellular_connected_status_states,
                "actions": cellular_connected_status_actions,
            },
        },
        {
            "name": "wifi-dropped question answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in wifi_dropped_status_states
            )
            and "wifi_failover" not in wifi_dropped_status_actions
            and not any(action.startswith("play_next:") for action in wifi_dropped_status_actions),
            "detail": {"states": wifi_dropped_status_states, "actions": wifi_dropped_status_actions},
        },
        {
            "name": "wireless-broken question answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in wireless_broken_status_states
            )
            and "wifi_failover" not in wireless_broken_status_actions
            and not any(action.startswith("play_next:") for action in wireless_broken_status_actions),
            "detail": {"states": wireless_broken_status_states, "actions": wireless_broken_status_actions},
        },
        {
            "name": "cellular-reachable question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in cellular_reachable_status_states
            )
            and "wifi_failover" not in cellular_reachable_status_actions
            and not any(action.startswith("play_next:") for action in cellular_reachable_status_actions),
            "detail": {"states": cellular_reachable_status_states, "actions": cellular_reachable_status_actions},
        },
        {
            "name": "casual-cellular-reachable question answers status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "PocketEarth-iPhone" in str(state.get("message") or "")
                and "PocketEarth-Android" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in casual_cellular_reachable_status_states
            )
            and "wifi_failover" not in casual_cellular_reachable_status_actions
            and not any(action.startswith("play_next:") for action in casual_cellular_reachable_status_actions),
            "detail": {
                "states": casual_cellular_reachable_status_states,
                "actions": casual_cellular_reachable_status_actions,
            },
        },
        {
            "name": "connectivity probe questions answer status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                for case in connectivity_probe_status_cases
            ),
            "detail": connectivity_probe_status_cases,
        },
        {
            "name": "current-wifi question answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in current_wifi_states
            )
            and "wifi_failover" not in current_wifi_actions
            and not any(action.startswith("play_next:") for action in current_wifi_actions),
            "detail": {"states": current_wifi_states, "actions": current_wifi_actions},
        },
        {
            "name": "terse wifi route questions answer hotspot status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case_states
                )
                and "wifi_failover" not in case_actions
                and not any(action.startswith("play_next:") for action in case_actions)
                for case_states, case_actions in [
                    (current_wifi_name_states, current_wifi_name_actions),
                    (wifi_which_states, wifi_which_actions),
                    (current_wifi_use_states, current_wifi_use_actions),
                    (current_network_route_states, current_network_route_actions),
                    (current_network_card_route_states, current_network_card_route_actions),
                    (current_network_card_use_states, current_network_card_use_actions),
                    (outdoor_hotspot_ready_states, outdoor_hotspot_ready_actions),
                    (phone_hotspot_priority_states, phone_hotspot_priority_actions),
                    (network_route_states, network_route_actions),
                ]
            ),
            "detail": {
                "currentWifiName": {"states": current_wifi_name_states, "actions": current_wifi_name_actions},
                "wifiWhich": {"states": wifi_which_states, "actions": wifi_which_actions},
                "currentWifiUse": {"states": current_wifi_use_states, "actions": current_wifi_use_actions},
                "currentNetworkRoute": {
                    "states": current_network_route_states,
                    "actions": current_network_route_actions,
                },
                "currentNetworkCardRoute": {
                    "states": current_network_card_route_states,
                    "actions": current_network_card_route_actions,
                },
                "currentNetworkCardUse": {
                    "states": current_network_card_use_states,
                    "actions": current_network_card_use_actions,
                },
                "outdoorHotspotReady": {
                    "states": outdoor_hotspot_ready_states,
                    "actions": outdoor_hotspot_ready_actions,
                },
                "phoneHotspotPriority": {
                    "states": phone_hotspot_priority_states,
                    "actions": phone_hotspot_priority_actions,
                },
                "networkRoute": {"states": network_route_states, "actions": network_route_actions},
            },
        },
        {
            "name": "home wifi fallback questions answer hotspot status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                for case in home_wifi_status_cases
            ),
            "detail": home_wifi_status_cases,
        },
        {
            "name": "online question answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "当前网络在线" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in online_status_states
            )
            and "wifi_failover" not in online_status_actions
            and not any(action.startswith("play_next:") for action in online_status_actions),
            "detail": {"states": online_status_states, "actions": online_status_actions},
        },
        {
            "name": "casual online questions answer hotspot status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "当前网络在线" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case_states
                )
                and "wifi_failover" not in case_actions
                and not any(action.startswith("play_next:") for action in case_actions)
                for case_states, case_actions in [
                    (online_now_status_states, online_now_status_actions),
                    (is_online_status_states, is_online_status_actions),
                ]
            ),
            "detail": {
                "onlineNow": {"states": online_now_status_states, "actions": online_now_status_actions},
                "isOnline": {"states": is_online_status_states, "actions": is_online_status_actions},
            },
        },
        {
            "name": "connected-network question answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "当前网络在线" in str(state.get("message") or "")
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in connected_network_states
            )
            and "wifi_failover" not in connected_network_actions
            and not any(action.startswith("play_next:") for action in connected_network_actions),
            "detail": {"states": connected_network_states, "actions": connected_network_actions},
        },
        {
            "name": "network-presence question answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "当前网络在线" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in network_presence_states
            )
            and "wifi_failover" not in network_presence_actions
            and not any(action.startswith("play_next:") for action in network_presence_actions),
            "detail": {"states": network_presence_states, "actions": network_presence_actions},
        },
        {
            "name": "terse network-presence questions answer hotspot status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "当前网络在线" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case_states
                )
                and "wifi_failover" not in case_actions
                and not any(action.startswith("play_next:") for action in case_actions)
                for case_states, case_actions in [
                    (terse_network_presence_states, terse_network_presence_actions),
                    (terse_network_alive_states, terse_network_alive_actions),
                    (colloquial_network_alive_states, colloquial_network_alive_actions),
                ]
            ),
            "detail": {
                "presence": {"states": terse_network_presence_states, "actions": terse_network_presence_actions},
                "alive": {"states": terse_network_alive_states, "actions": terse_network_alive_actions},
                "colloquialAlive": {
                    "states": colloquial_network_alive_states,
                    "actions": colloquial_network_alive_actions,
                },
            },
        },
        {
            "name": "network-stability question answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "当前网络在线" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in network_stability_states
            )
            and "wifi_failover" not in network_stability_actions
            and not any(action.startswith("play_next:") for action in network_stability_actions),
            "detail": {"states": network_stability_states, "actions": network_stability_actions},
        },
        {
            "name": "casual network quality questions answer hotspot status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "当前网络在线" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                for case in casual_network_quality_cases
            ),
            "detail": casual_network_quality_cases,
        },
        {
            "name": "offline phrase answers hotspot status without connecting",
            "passed": any(
                state.get("city") == "出门网络"
                and "192.168.50.23" in str(state.get("message") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in offline_status_states
            )
            and "wifi_failover" not in offline_status_actions
            and not any(action.startswith("play_next:") for action in offline_status_actions),
            "detail": {"states": offline_status_states, "actions": offline_status_actions},
        },
        {
            "name": "natural network outage questions answer hotspot status without connecting",
            "passed": all(
                any(
                    state.get("city") == "出门网络"
                    and "当前网络在线" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                for case in natural_network_outage_status_cases
            ),
            "detail": natural_network_outage_status_cases,
        },
        {
            "name": "dropped-wifi repair phrase triggers failover without playing audio",
            "passed": "wifi_failover" in dropped_wifi_repair_actions
            and "play_next:0" not in dropped_wifi_repair_actions
            and any(
                state.get("city") == "出门网络"
                and "手机热点" in str(state.get("track") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in dropped_wifi_repair_states
            ),
            "detail": {"states": dropped_wifi_repair_states, "actions": dropped_wifi_repair_actions},
        },
        {
            "name": "unstable-network repair phrase triggers failover without playing audio",
            "passed": "wifi_failover" in unstable_network_repair_actions
            and "play_next:0" not in unstable_network_repair_actions
            and any(
                state.get("city") == "出门网络"
                and "手机热点" in str(state.get("track") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in unstable_network_repair_states
            ),
            "detail": {"states": unstable_network_repair_states, "actions": unstable_network_repair_actions},
        },
        {
            "name": "runtime maintenance phrase runs quiet cleanup skill",
            "passed": any(
                state.get("label") == "Runtime maintenance"
                and state.get("city") == "运行维护"
                and state.get("track") == "removed 2"
                and "维护完成" in str(state.get("message") or "")
                for state in runtime_maintenance_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in runtime_maintenance_actions),
            "detail": {"states": runtime_maintenance_states, "actions": runtime_maintenance_actions},
        },
        {
            "name": "text-only runtime maintenance phrases stay screen-only",
            "passed": all(
                any(
                    state.get("label") == "Runtime maintenance"
                    and state.get("city") == "运行维护"
                    and state.get("track") == "removed 2"
                    and "维护完成" in str(state.get("message") or "")
                    for state in case["states"]
                )
                and case["spoken"] == []
                and not any(action.startswith("play_next:") or action == "wifi_failover" for action in case["actions"])
                for case in text_only_runtime_maintenance_cases
            ),
            "detail": text_only_runtime_maintenance_cases,
        },
        {
            "name": "cache cleanup phrase runs quiet runtime maintenance skill",
            "passed": any(
                state.get("label") == "Runtime maintenance"
                and state.get("city") == "运行维护"
                and state.get("track") == "removed 2"
                and "维护完成" in str(state.get("message") or "")
                for state in cache_cleanup_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in cache_cleanup_actions),
            "detail": {"states": cache_cleanup_states, "actions": cache_cleanup_actions},
        },
        {
            "name": "restore-state phrase runs quiet runtime maintenance skill",
            "passed": any(
                state.get("label") == "Runtime maintenance"
                and state.get("city") == "运行维护"
                and state.get("track") == "removed 2"
                and "维护完成" in str(state.get("message") or "")
                for state in restore_state_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in restore_state_actions),
            "detail": {"states": restore_state_states, "actions": restore_state_actions},
        },
        {
            "name": "tidy-runtime phrase runs quiet runtime maintenance skill",
            "passed": any(
                state.get("label") == "Runtime maintenance"
                and state.get("city") == "运行维护"
                and state.get("track") == "removed 2"
                and "维护完成" in str(state.get("message") or "")
                for state in tidy_runtime_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in tidy_runtime_actions),
            "detail": {"states": tidy_runtime_states, "actions": tidy_runtime_actions},
        },
        {
            "name": "self-repair phrase runs quiet runtime maintenance skill",
            "passed": any(
                state.get("label") == "Runtime maintenance"
                and state.get("city") == "运行维护"
                and state.get("track") == "removed 2"
                and "维护完成" in str(state.get("message") or "")
                for state in self_repair_states
            )
            and not any(action.startswith("play_next:") or action == "wifi_failover" for action in self_repair_actions),
            "detail": {"states": self_repair_states, "actions": self_repair_actions},
        },
        {
            "name": "text-only hotspot connect phrases trigger failover without speech",
            "passed": all(
                "wifi_failover" in case["actions"]
                and case["spoken"] == []
                and "play_next:0" not in case["actions"]
                and any(
                    state.get("city") == "出门网络"
                    and "手机热点" in str(state.get("track") or "")
                    and "正在尝试手机热点" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                for case in text_only_hotspot_connect_cases
            ),
            "detail": text_only_hotspot_connect_cases,
        },
        {
            "name": "negative hotspot connect phrases do not trigger failover",
            "passed": all(
                case["spoken"] == []
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                and any(
                    state.get("city") == "出门网络"
                    and state.get("track") == "未切换热点"
                    and "不会切换热点" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                for case in negative_hotspot_connect_cases
            ),
            "detail": negative_hotspot_connect_cases,
        },
        {
            "name": "guarded hotspot status questions answer status without failover",
            "passed": all(
                case["spoken"] == []
                and "wifi_failover" not in case["actions"]
                and not any(action.startswith("play_next:") for action in case["actions"])
                and any(
                    state.get("city") == "出门网络"
                    and state.get("track") == "手机热点"
                    and "PocketEarth-iPhone" in str(state.get("message") or "")
                    and "PocketEarth-Android" in str(state.get("message") or "")
                    and "192.168.50.23" in str(state.get("message") or "")
                    and "123666999" not in str(state.get("message") or "")
                    for state in case["states"]
                )
                for case in guarded_hotspot_status_cases
            ),
            "detail": guarded_hotspot_status_cases,
        },
        {
            "name": "explicit hotspot command triggers failover without playing audio",
            "passed": "wifi_failover" in hotspot_connect_actions
            and "wifi_failover" in named_hotspot_connect_actions
            and "wifi_failover" in generic_iphone_hotspot_connect_actions
            and "wifi_failover" in apple_phone_hotspot_connect_actions
            and "wifi_failover" in backup_hotspot_connect_actions
            and "wifi_failover" in phone_hotspot_connect_actions
            and "wifi_failover" in my_hotspot_connect_actions
            and "wifi_failover" in cellular_hotspot_connect_actions
            and "wifi_failover" in attach_hotspot_connect_actions
            and "wifi_failover" in switch_hotspot_connect_actions
            and "wifi_failover" in cutover_hotspot_connect_actions
            and "wifi_failover" in hotspot_ready_connect_actions
            and "wifi_failover" in hotspot_opened_connect_actions
            and "wifi_failover" in phone_hotspot_open_connect_actions
            and "wifi_failover" in cellular_ready_connect_actions
            and "wifi_failover" in cellular_ready_done_connect_actions
            and "wifi_failover" in phone_network_ready_connect_actions
            and "wifi_failover" in phone_cellular_use_connect_actions
            and "wifi_failover" in my_cellular_use_connect_actions
            and "wifi_failover" in my_cellular_route_connect_actions
            and "wifi_failover" in personal_hotspot_route_connect_actions
            and "wifi_failover" in phone_network_switch_connect_actions
            and all("wifi_failover" in case["actions"] for case in extra_named_hotspot_connect_cases)
            and "play_next:0" not in hotspot_connect_actions
            and "play_next:0" not in named_hotspot_connect_actions
            and "play_next:0" not in generic_iphone_hotspot_connect_actions
            and "play_next:0" not in apple_phone_hotspot_connect_actions
            and "play_next:0" not in backup_hotspot_connect_actions
            and "play_next:0" not in phone_hotspot_connect_actions
            and "play_next:0" not in my_hotspot_connect_actions
            and "play_next:0" not in cellular_hotspot_connect_actions
            and "play_next:0" not in attach_hotspot_connect_actions
            and "play_next:0" not in switch_hotspot_connect_actions
            and "play_next:0" not in cutover_hotspot_connect_actions
            and "play_next:0" not in hotspot_ready_connect_actions
            and "play_next:0" not in hotspot_opened_connect_actions
            and "play_next:0" not in phone_hotspot_open_connect_actions
            and "play_next:0" not in cellular_ready_connect_actions
            and "play_next:0" not in cellular_ready_done_connect_actions
            and "play_next:0" not in phone_network_ready_connect_actions
            and "play_next:0" not in phone_cellular_use_connect_actions
            and "play_next:0" not in my_cellular_use_connect_actions
            and "play_next:0" not in my_cellular_route_connect_actions
            and "play_next:0" not in personal_hotspot_route_connect_actions
            and "play_next:0" not in phone_network_switch_connect_actions
            and all("play_next:0" not in case["actions"] for case in extra_named_hotspot_connect_cases)
            and any(
                state.get("city") == "出门网络"
                and "手机热点" in str(state.get("track") or "")
                and "123666999" not in str(state.get("message") or "")
                for state in hotspot_connect_states
            )
            and any("123666999" not in str(state.get("message") or "") for state in named_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in generic_iphone_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in apple_phone_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in backup_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in phone_hotspot_connect_states)
            and all(
                any("123666999" not in str(state.get("message") or "") for state in case["states"])
                for case in extra_named_hotspot_connect_cases
            )
            and any("123666999" not in str(state.get("message") or "") for state in my_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in cellular_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in attach_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in switch_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in cutover_hotspot_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in hotspot_ready_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in hotspot_opened_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in phone_hotspot_open_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in cellular_ready_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in cellular_ready_done_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in phone_network_ready_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in phone_cellular_use_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in my_cellular_use_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in my_cellular_route_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in personal_hotspot_route_connect_states)
            and any("123666999" not in str(state.get("message") or "") for state in phone_network_switch_connect_states),
            "detail": {
                "states": hotspot_connect_states,
                "actions": hotspot_connect_actions,
                "namedStates": named_hotspot_connect_states,
                "namedActions": named_hotspot_connect_actions,
                "genericIphoneStates": generic_iphone_hotspot_connect_states,
                "genericIphoneActions": generic_iphone_hotspot_connect_actions,
                "applePhoneStates": apple_phone_hotspot_connect_states,
                "applePhoneActions": apple_phone_hotspot_connect_actions,
                "backupStates": backup_hotspot_connect_states,
                "backupActions": backup_hotspot_connect_actions,
                "phoneStates": phone_hotspot_connect_states,
                "phoneActions": phone_hotspot_connect_actions,
                "myHotspotStates": my_hotspot_connect_states,
                "myHotspotActions": my_hotspot_connect_actions,
                "cellularStates": cellular_hotspot_connect_states,
                "cellularActions": cellular_hotspot_connect_actions,
                "switchStates": switch_hotspot_connect_states,
                "switchActions": switch_hotspot_connect_actions,
                "cutoverStates": cutover_hotspot_connect_states,
                "cutoverActions": cutover_hotspot_connect_actions,
                "extraNamed": extra_named_hotspot_connect_cases,
                "readyStates": hotspot_ready_connect_states,
                "readyActions": hotspot_ready_connect_actions,
                "openedStates": hotspot_opened_connect_states,
                "openedActions": hotspot_opened_connect_actions,
                "phoneOpenStates": phone_hotspot_open_connect_states,
                "phoneOpenActions": phone_hotspot_open_connect_actions,
                "cellularReadyStates": cellular_ready_connect_states,
                "cellularReadyActions": cellular_ready_connect_actions,
                "cellularReadyDoneStates": cellular_ready_done_connect_states,
                "cellularReadyDoneActions": cellular_ready_done_connect_actions,
                "phoneNetworkReadyStates": phone_network_ready_connect_states,
                "phoneNetworkReadyActions": phone_network_ready_connect_actions,
                "phoneCellularUseStates": phone_cellular_use_connect_states,
                "phoneCellularUseActions": phone_cellular_use_connect_actions,
                "myCellularUseStates": my_cellular_use_connect_states,
                "myCellularUseActions": my_cellular_use_connect_actions,
                "myCellularRouteStates": my_cellular_route_connect_states,
                "myCellularRouteActions": my_cellular_route_connect_actions,
                "personalHotspotRouteStates": personal_hotspot_route_connect_states,
                "personalHotspotRouteActions": personal_hotspot_route_connect_actions,
                "phoneNetworkSwitchStates": phone_network_switch_connect_states,
                "phoneNetworkSwitchActions": phone_network_switch_connect_actions,
            },
        },
        {
            "name": "orange long press restores radio audio at the current sunset city",
            "passed": button_radio_state.get("mode") == "radio"
            and bool(button_radio_state.get("expiresAt"))
            and button_radio_state.get("reason") == "orange long press"
            and "wifi_failover" in button_radio_actions
            and "audio_output" in button_radio_actions
            and "play_next:0" in button_radio_actions
            and button_radio_index == -1
            and button_radio_titles[:3] == ["Plastic Love", "真夜中のドア", "Heroes"]
            and any("手机热点" in str(state.get("message") or "") for state in button_radio_states)
            and any("当前日落城市" in str(state.get("message") or "") for state in button_radio_states),
            "detail": {
                "state": button_radio_state,
                "states": button_radio_states,
                "actions": button_radio_actions,
                "titles": button_radio_titles,
                "index": button_radio_index,
            },
        },
        {
            "name": "orange long press pauses active radio into soft mute",
            "passed": button_pause_state.get("mode") == "soft_mute"
            and not button_pause_state.get("expiresAt")
            and button_pause_state.get("reason") == "orange long press"
            and "stop" in button_pause_actions
            and not any(action.startswith("play_next:") for action in button_pause_actions)
            and any("尝试热点" in str(state.get("message") or "") for state in button_pause_states),
            "detail": {"state": button_pause_state, "states": button_pause_states, "actions": button_pause_actions},
        },
        {
            "name": "hard mute keeps wake silent and blocked",
            "passed": hard_ok is False and hard_state.get("mode") == "hard_mute",
        },
        {
            "name": "wake states avoid internal English labels",
            "passed": not any(
                state.get("label") in {"Muted", "Listening", "Paused"}
                or state.get("city") in {"Frost", "Sunset Radio"}
                for state in states
            ),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases, "states": states}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
