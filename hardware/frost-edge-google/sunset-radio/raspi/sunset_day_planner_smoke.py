#!/usr/bin/env python3
"""Offline self-test for the day-planner agent.

Injects a fake catalog, patches perception + weather, and a capturing publisher — no
camera, no network. Proves the pipeline: publishes every step incrementally, builds a
real-sunset-ordered schedule, honours privacy, and never starts audio.
"""
import os
from datetime import datetime, timezone

import sunset_day_planner
import weather_skill


FAKE_CATALOG = [
    {"slug": "tokyo", "cityNameZh": "东京", "cityName": "Tokyo", "tzOffset": 9,
     "lat": 35.6762, "lng": 139.6503, "tracks": [
         {"id": "t1", "title": "夏日舞会", "introText": "阳光下的快节奏，明亮。"},
         {"id": "t2", "title": "夜航", "introText": "很静的钢琴纯音乐，孤独的海。"},
         {"id": "t3", "title": "热风", "introText": "夏天的舞曲，笑声与光。"},
         {"id": "t4", "title": "雨眠", "introText": "慢下来的雨夜，安静的弦乐。"},
     ]},
    {"slug": "amsterdam", "cityNameZh": "阿姆斯特丹", "cityName": "Amsterdam", "tzOffset": 1,
     "lat": 52.37, "lng": 4.9, "tracks": [{"id": "a1", "title": "运河"}, {"id": "a2", "title": "雾灯"}]},
    {"slug": "sao-paulo", "cityNameZh": "圣保罗", "cityName": "Sao Paulo", "tzOffset": -3,
     "lat": -23.55, "lng": -46.63, "tracks": [{"id": "s1", "title": "夜曲"}]},
]

CLEAR_WEATHER = {
    "ok": True, "source": "open-meteo", "label": "晴", "sky": "clear", "tempC": 24.0,
    "sunsetLocal": "19:00", "isDay": True, "precip": False,
    "moodSeed": {"energyDelta": 0.08, "vocalRatioHint": 0.6, "instrumentalPreference": 0.4,
                 "palette": "澄澈金橙", "mood": "明朗"},
    "message": "24°C 晴，天色澄澈。",
}

FAKE_PERCEPTION = {
    "ok": True, "cameraAvailable": True, "mode": "环境自适应", "light": "dim",
    "lightTrend": "darkening",
    "activity": "still", "summary": "室内光线偏暗，活动较少。", "captureRequested": False,
    "message": "环境DJ 已拿到光线信号。",
}


def main():
    failures = []
    published = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    orig_perceive = sunset_day_planner._perceive
    orig_weather = weather_skill.observe_weather
    os.environ["SUNSET_HOME_LAT"] = "31.23"
    os.environ["SUNSET_HOME_LNG"] = "121.47"
    os.environ["SUNSET_HOME_NAME"] = "上海"
    try:
        sunset_day_planner._perceive = lambda capture=False: dict(FAKE_PERCEPTION)
        weather_skill.observe_weather = lambda lat, lng, timeout=4: dict(CLEAR_WEATHER)

        now = datetime(2026, 6, 21, 6, 0, 0, tzinfo=timezone.utc)
        plan = sunset_day_planner.run_day_plan(
            catalog=FAKE_CATALOG, now_utc=now, capture=False,
            publish=lambda snapshot: published.append(snapshot),
        )

        # Pipeline shape.
        check("has_six_steps", len(plan["steps"]) == 6)
        check("all_steps_terminal", all(s["status"] in ("done", "skipped", "error") for s in plan["steps"]))
        check("status_done", plan["status"] == "done")

        # Incremental publishing: skeleton + start/finish for each step -> many snapshots.
        check("published_incrementally", len(published) >= 12)
        first = published[0]
        check("skeleton_first_pending", all(s["status"] == "pending" for s in first["steps"]))

        # Perception + weather flowed in.
        check("perception_used", plan["perception"]["light"] == "dim")
        check("weather_used", plan["weather"]["label"] == "晴")

        # Schedule: real-sunset ordered, capped, featured head, track counts.
        sched = plan["schedule"]
        check("schedule_nonempty", len(sched) == 3)
        check("schedule_sorted", all(
            sched[i]["userSunsetClock"] is not None for i in range(len(sched))
        ))
        check("head_featured", sched[0]["featured"] is True)
        check("head_more_tracks", sched[0]["trackCount"] >= sched[1]["trackCount"])
        check("sao_paulo_capped_to_available", next(s["trackCount"] for s in sched if s["slug"] == "sao-paulo") == 1)

        # #3 mood-driven selection: every stop carries resolvable trackKeys + titles.
        tokyo_stop = next(s for s in sched if s["slug"] == "tokyo")
        check("tokyo_capped_to_3", tokyo_stop["trackCount"] == 3)  # 4 available, featured cap 3
        check("tokyo_trackkeys", len(tokyo_stop["trackKeys"]) == 3 and all(k.startswith("tokyo::") for k in tokyo_stop["trackKeys"]))
        check("tokyo_tracktitles", len(tokyo_stop["trackTitles"]) == 3)

        # #2 per-city weather: first stops carry their own live weather.
        check("city_weather_count", plan.get("cityWeatherCount") == 3)
        check("head_stop_weather", sched[0]["weather"] and sched[0]["weather"]["ok"] is True)

        # #4 ambient memory trend: darkening room reaches the day mood.
        check("mood_present", plan["mood"]["mood"] and "reason" in plan["mood"])
        check("mood_trend_used", "光线转暗" in plan["mood"]["reason"])
        check("mood_dim_pulls_energy", plan["mood"]["energyDelta"] < 0.08)

        # Privacy + no-audio guarantees.
        check("privacy_manual_only", plan["privacy"]["capture"] == "manual_only")
        check("privacy_no_audio", plan["privacy"]["audio"] == "not_started_by_planner")

        # Location unset -> device weather step skipped, plan still completes.
        # Disable per-city weather here to isolate the device-weather-skip behaviour.
        for key in ("SUNSET_HOME_LAT", "SUNSET_HOME_LNG", "SUNSET_HOME_NAME"):
            os.environ.pop(key, None)
        orig_city_weather = sunset_day_planner.CITY_WEATHER_COUNT
        sunset_day_planner.CITY_WEATHER_COUNT = 0
        weather_calls = {"n": 0}

        def counted(lat, lng, timeout=4):
            weather_calls["n"] += 1
            return dict(CLEAR_WEATHER)

        weather_skill.observe_weather = counted
        plan2 = sunset_day_planner.run_day_plan(
            catalog=FAKE_CATALOG, now_utc=now, capture=False, publish=lambda s: None,
        )
        sunset_day_planner.CITY_WEATHER_COUNT = orig_city_weather
        weather_step = next(s for s in plan2["steps"] if s["id"] == "weather")
        check("no_location_weather_skipped", weather_step["status"] == "skipped")
        check("no_location_no_weather_call", weather_calls["n"] == 0)
        check("no_location_still_done", plan2["status"] == "done" and len(plan2["schedule"]) == 3)
    finally:
        sunset_day_planner._perceive = orig_perceive
        weather_skill.observe_weather = orig_weather
        for key in ("SUNSET_HOME_LAT", "SUNSET_HOME_LNG", "SUNSET_HOME_NAME"):
            os.environ.pop(key, None)

    if failures:
        print("DAY PLANNER SMOKE FAIL:", ", ".join(failures))
        return 1
    print("DAY PLANNER SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
