#!/usr/bin/env python3
"""Offline self-test for weather_skill.

Patches the HTTP layer with canned Open-Meteo payloads (clear / rainy / night) and
proves the offline path degrades to ok:False without ever hitting the network.
"""
import weather_skill


CLEAR_DAY = {
    "current": {"temperature_2m": 24.3, "cloud_cover": 8, "weather_code": 0, "is_day": 1, "wind_speed_10m": 9.2},
    "daily": {"sunset": ["2026-07-07T21:12"], "sunrise": ["2026-07-07T05:20"]},
}
RAINY = {
    "current": {"temperature_2m": 15.0, "cloud_cover": 95, "weather_code": 63, "is_day": 1, "wind_speed_10m": 18},
    "daily": {"sunset": ["2026-07-07T20:44"]},
}
CLEAR_NIGHT = {
    "current": {"temperature_2m": 12.0, "cloud_cover": 5, "weather_code": 0, "is_day": 0, "wind_speed_10m": 3},
    "daily": {"sunset": ["2026-07-07T20:44"]},
}


def main():
    failures = []
    original = weather_skill._http_get_json

    def check(name, cond):
        if not cond:
            failures.append(name)

    try:
        # Clear day -> warm, vocal-leaning mood, sunset clock parsed.
        weather_skill._http_get_json = lambda url, timeout=4: CLEAR_DAY
        clear = weather_skill.observe_weather(31.23, 121.47)
        check("clear_ok", clear["ok"] is True)
        check("clear_label", clear["label"] == "晴")
        check("clear_sky", clear["sky"] == "clear")
        check("clear_sunset", clear["sunsetLocal"] == "21:12")
        check("clear_mood_warm", clear["moodSeed"]["energyDelta"] > 0)
        check("clear_temp", clear["tempC"] == 24.3)

        # Rain -> introspective, instrumental-leaning.
        weather_skill._http_get_json = lambda url, timeout=4: RAINY
        rain = weather_skill.observe_weather(51.5, -0.12)
        check("rain_ok", rain["ok"] is True)
        check("rain_precip", rain["precip"] is True)
        check("rain_mood_mellow", rain["moodSeed"]["instrumentalPreference"] >= 0.7)
        check("rain_label", rain["label"] == "中雨")

        # Clear night -> is_day False, energy dips vs clear day.
        weather_skill._http_get_json = lambda url, timeout=4: CLEAR_NIGHT
        night = weather_skill.observe_weather(31.23, 121.47)
        check("night_is_day_false", night["isDay"] is False)
        check("night_mood_night", "夜色" in night["moodSeed"]["mood"])

        # Network failure -> graceful ok:False, still a mood seed.
        def boom(url, timeout=4):
            raise OSError("offline")
        weather_skill._http_get_json = boom
        offline = weather_skill.observe_weather(31.23, 121.47)
        check("offline_not_ok", offline["ok"] is False)
        check("offline_has_moodseed", "moodSeed" in offline)
        check("offline_message", "接不上" in offline["message"])

        # No coordinates -> skipped without any HTTP call.
        called = {"n": 0}
        def counted(url, timeout=4):
            called["n"] += 1
            return CLEAR_DAY
        weather_skill._http_get_json = counted
        no_coords = weather_skill.observe_weather(None, None)
        check("no_coords_not_ok", no_coords["ok"] is False and no_coords["source"] == "no_coords")
        check("no_coords_no_http", called["n"] == 0)
    finally:
        weather_skill._http_get_json = original

    if failures:
        print("WEATHER SKILL SMOKE FAIL:", ", ".join(failures))
        return 1
    print("WEATHER SKILL SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
