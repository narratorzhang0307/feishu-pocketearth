#!/usr/bin/env python3
import json
import os
import tempfile

import pi_command_daemon
import whisplay_status


def main():
    with tempfile.TemporaryDirectory() as tmp:
        media_path = os.path.join(tmp, "whisplay-media.json")
        cities_dir = os.path.join(tmp, "cities")
        os.makedirs(cities_dir, exist_ok=True)
        with open(os.path.join(cities_dir, "s-o-paulo.json"), "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "slug": "s-o-paulo",
                    "cityName": "São Paulo",
                    "cityNameZh": "圣保罗",
                    "tracks": [{"title": "Da Ponte Pra Cá", "artist": "Racionais MC's"}],
                },
                handle,
                ensure_ascii=False,
            )
        pi_command_daemon.MEDIA_PATH = media_path
        whisplay_status.MEDIA_PATH = media_path
        whisplay_status.CITIES_DIR = cities_dir
        whisplay_status._CATALOG_ARTIST_CACHE = None

        with open(media_path, "w", encoding="utf-8") as handle:
            json.dump({"city": "东京", "track": "test", "artist": "音乐DJ"}, handle, ensure_ascii=False)
        whisplay_status.last_media = whisplay_status.load_media_cache()
        ignored_test = whisplay_status.last_media["track"] != "test"

        with open(media_path, "w", encoding="utf-8") as handle:
            json.dump({"city": "圣保罗", "track": "Da Ponte Pra Cá", "artist": "竹内まりや"}, handle, ensure_ascii=False)
        repaired_cache = whisplay_status.load_media_cache()

        real_track = {
            "cityNameZh": "东京",
            "cityName": "Tokyo",
            "title": "Plastic Love",
            "artist": "竹内まりや",
        }
        saved = pi_command_daemon.save_whisplay_media(real_track)
        whisplay_status.last_media = whisplay_status.load_media_cache()
        real_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "静音中",
                "city": "东京",
                "track": "Plastic Love",
                "message": "静音中：竹内まりや - Plastic Love",
            }
        )

        stale_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "静音中",
                "city": "Sunset Radio",
                "track": "",
                "message": "音乐DJ 已静音，载入 96 座城市。",
            }
        )
        heartbeat_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "静音中",
                "city": "音乐DJ",
                "track": "安静待命",
                "message": "音乐DJ 已静音，载入 96 座城市。",
            }
        )
        chat_reply_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "DJ",
                "city": "音乐DJ",
                "track": "我今天压力很大",
                "message": "先别急着处理所有事。",
            }
        )
        tool_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "相机医生",
                "city": "相机医生",
                "track": "Sunset Radio",
                "message": "相机工具正常；需要扫描此刻时再检查。",
            }
        )
        audio_open_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "对话待命",
                "city": "声音入口",
                "track": "电台播放",
                "message": "已打开：正在播放当前日落城市；再长按橙色键关闭。",
            }
        )
        audio_standby_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "静音中",
                "city": "声音入口",
                "track": "安静待命",
                "message": "已关闭：电台静音待命；长按橙色键会重新打开并播放当前日落城市。",
            }
        )
        device_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "电池医生",
                "city": "电池医生",
                "track": "PiSugar",
                "message": "PiSugar 供电守护在线。",
            }
        )
        camera_model_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "相机医生",
                "city": "相机医生",
                "track": "IMX708",
                "message": "相机已就绪。",
            }
        )
        battery_model_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "电池医生",
                "city": "电池医生",
                "track": "PiSugar 3 Plus",
                "message": "电池在线。",
            }
        )
        ambient_plan_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "环境计划",
                "city": "环境计划",
                "track": "下一步",
                "message": "下一段节目微调。",
            }
        )
        voice_transcript_media = whisplay_status.media_from_state(
            {
                "status": "thinking",
                "label": "转文字",
                "city": "语音控制",
                "track": "我想听一点适合夜里走路的歌",
                "message": "正在把这句话转成文字。",
            }
        )
        city_list_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "城市歌单",
                "city": "城市歌单",
                "track": "东京",
                "message": "东京有 12 首：Plastic Love / 真夜中のドア。",
            }
        )
        route_preview_media = whisplay_status.media_from_state(
            {
                "status": "idle",
                "label": "日落路线",
                "city": "日落路线",
                "track": "曼谷",
                "message": "下一站曼谷，20 分钟后到黄昏。",
            }
        )
        request_media = whisplay_status.media_from_state(
            {
                "status": "busy",
                "label": "音乐DJ 接令",
                "city": "DJ 请求",
                "track": "讲讲这首歌",
                "message": "音乐DJ 收到：讲讲这首歌。",
            }
        )

        def drawn_text_for(state):
            drawn_text = []
            original_fb_draw = whisplay_status.fb_draw

            def capture_fb_draw(draw, xy, text, size, fill):
                drawn_text.append(str(text))
                return original_fb_draw(draw, xy, text, size, fill)

            whisplay_status.fb_draw = capture_fb_draw
            try:
                whisplay_status.draw_status(state)
            finally:
                whisplay_status.fb_draw = original_fb_draw
            return drawn_text

        screen_states = {
            "voice": {
                "status": "idle",
                "label": "语音控制",
                "city": "音乐DJ",
                "track": "",
                "message": "正在把这句话转成文字。",
            },
            "muted": {
                "status": "idle",
                "label": "静音中",
                "city": "Sunset Radio",
                "track": "",
                "message": "音乐DJ 已静音，载入 96 座城市。",
            },
            "audio": {
                "status": "idle",
                "label": "对话待命",
                "city": "声音入口",
                "track": "电台播放",
                "message": "已打开：正在播放当前日落城市；再长按橙色键关闭。",
            },
            "device": {
                "status": "idle",
                "label": "电池医生",
                "city": "电池医生",
                "track": "PiSugar",
                "message": "PiSugar 供电守护在线。",
            },
            "heartbeat": {
                "status": "idle",
                "label": "静音中",
                "city": "音乐DJ",
                "track": "安静待命",
                "message": "音乐DJ 已静音，载入 96 座城市。",
            },
        }
        drawn_by_state = {name: drawn_text_for(state) for name, state in screen_states.items()}
        drawn_blob = "\n".join("\n".join(lines) for lines in drawn_by_state.values())
        forbidden_screen_copy = (
            "正在把这句话转成文字",
            "语音控制",
            "已静音",
            "静音中",
            "长按橙色键",
            "电池医生",
            "PiSugar 供电守护",
            "安静待命",
        )
        volume_state_path = os.path.join(tmp, "volume-state.json")
        original_volume_path = whisplay_status.VOL_STATE_PATH
        original_volume_sec = whisplay_status.VOL_OVERLAY_SEC
        try:
            whisplay_status.VOL_STATE_PATH = volume_state_path
            whisplay_status.VOL_OVERLAY_SEC = 2.5
            missing_volume_overlay = whisplay_status.read_volume_overlay(now=100.0)
            with open(volume_state_path, "w", encoding="utf-8") as handle:
                json.dump({"volume": 61, "dir": "up", "ts": 90.0}, handle)
            stale_volume_overlay = whisplay_status.read_volume_overlay(now=100.0)
            with open(volume_state_path, "w", encoding="utf-8") as handle:
                json.dump({"volume": 61, "dir": "up", "ts": "bad"}, handle)
            broken_volume_overlay = whisplay_status.read_volume_overlay(now=100.0)
            with open(volume_state_path, "w", encoding="utf-8") as handle:
                json.dump({"volume": 137, "dir": "down", "ts": 99.5}, handle)
            fresh_volume_overlay = whisplay_status.read_volume_overlay(now=100.0)
            base_img = whisplay_status.draw_status(screen_states["audio"])
            overlay_img = whisplay_status.draw_volume_overlay(base_img, 63, fresh_volume_overlay["volume"])
            volume_overlay_changes_screen = base_img.tobytes() != overlay_img.tobytes()
        finally:
            whisplay_status.VOL_STATE_PATH = original_volume_path
            whisplay_status.VOL_OVERLAY_SEC = original_volume_sec

        cases = [
            {"name": "test placeholder cache is ignored", "passed": ignored_test},
            {
                "name": "cached media repairs stale artist from catalog",
                "passed": repaired_cache == {
                    "city": "圣保罗",
                    "track": "Da Ponte Pra Cá",
                    "artist": "Racionais MC's",
                },
                "detail": repaired_cache,
            },
            {
                "name": "real track is written for Whisplay",
                "passed": saved and real_media == {"city": "东京", "track": "Plastic Love", "artist": "竹内まりや"},
                "detail": real_media,
            },
            {
                "name": "silent idle state keeps last real track",
                "passed": stale_media == real_media and heartbeat_media == real_media and chat_reply_media == real_media,
                "detail": {"old": stale_media, "heartbeat": heartbeat_media, "chatReply": chat_reply_media},
            },
            {
                "name": "tool status does not overwrite media cache",
                "passed": tool_media == real_media,
                "detail": tool_media,
            },
            {
                "name": "audio toggle status does not overwrite media cache",
                "passed": audio_open_media == real_media and audio_standby_media == real_media,
                "detail": {"open": audio_open_media, "standby": audio_standby_media},
            },
            {
                "name": "device status does not overwrite media cache",
                "passed": device_media == real_media,
                "detail": device_media,
            },
            {
                "name": "hardware model statuses do not overwrite media cache",
                "passed": camera_model_media == real_media
                and battery_model_media == real_media
                and ambient_plan_media == real_media,
                "detail": {
                    "camera": camera_model_media,
                    "battery": battery_model_media,
                    "ambient": ambient_plan_media,
                },
            },
            {
                "name": "voice and DJ status views do not overwrite media cache",
                "passed": voice_transcript_media == real_media
                and city_list_media == real_media
                and route_preview_media == real_media
                and request_media == real_media,
                "detail": {
                    "voice": voice_transcript_media,
                    "cityList": city_list_media,
                    "route": route_preview_media,
                    "request": request_media,
                },
            },
            {
                "name": "small screen hides stale media and transient status copy while idle",
                "passed": all(lines == [] for lines in drawn_by_state.values())
                and not any(text in drawn_blob for text in forbidden_screen_copy),
                "detail": drawn_by_state,
            },
            {
                "name": "volume overlay is file-driven and stale-safe",
                "passed": missing_volume_overlay is None
                and stale_volume_overlay is None
                and broken_volume_overlay is None
                and fresh_volume_overlay == {"volume": 100, "dir": "down"}
                and volume_overlay_changes_screen,
                "detail": {
                    "missing": missing_volume_overlay,
                    "stale": stale_volume_overlay,
                    "broken": broken_volume_overlay,
                    "fresh": fresh_volume_overlay,
                    "changed": volume_overlay_changes_screen,
                },
            },
        ]

    ok = all(case["passed"] for case in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
