#!/usr/bin/env python3
"""Sunset Radio day-planner: the Pi's environment-perceiving orchestration agent.

This is the agent the small Whisplay screen cannot show. It runs a visible pipeline —
perceive → locate → weather → sunset → compose → commit — and publishes each step to
``/api/pi-plan`` as it goes, so the phone/desktop PWA can watch the Pi think and see the
whole-day sunset radio schedule it lays out.

Design boundaries (consistent with the ambient layer):
- It **plans**, it does not play. It never starts audio or touches a media player; the
  native daemon decides whether/when to play from the ordered schedule this returns.
- Camera perception reuses the existing manual-only ambient layer; no auto-capture, no
  identity/emotion inference, frames deleted after analysis.
- Every external step is best-effort: missing camera / location / weather degrade to a
  ``skipped`` step and the plan still produces a full real-sunset schedule.
"""
import json
import os
import time
import urllib.request

import geo_skill
import sunset_skill
import track_select
import weather_skill

API_BASE = os.environ.get("SUNSET_API", "http://127.0.0.1:8080").rstrip("/")
PLAN_PUBLISH_PATH = "/api/pi-plan"
MAX_SCHEDULE_STOPS = int(os.environ.get("SUNSET_PLAN_MAX_STOPS", "12") or 12)
DEFAULT_TRACKS_PER_CITY = int(os.environ.get("SUNSET_PLAN_TRACKS_PER_CITY", "2") or 2)
FEATURED_TRACKS_PER_CITY = int(os.environ.get("SUNSET_PLAN_FEATURED_TRACKS", "3") or 3)
# How many of the soonest stops get their own live weather (bounded; 0 disables).
CITY_WEATHER_COUNT = int(os.environ.get("SUNSET_PLAN_CITY_WEATHER", "3") or 3)
CITY_WEATHER_TIMEOUT = float(os.environ.get("SUNSET_PLAN_CITY_WEATHER_TIMEOUT_SEC", "3") or 3)

PRIVACY = {
    "capture": "manual_only",
    "autoCapture": False,
    "imageRetention": "deleted_after_analysis",
    "identity": "not_used",
    "emotion": "not_inferred",
    "audio": "not_started_by_planner",
}

STEP_BLUEPRINT = [
    ("perceive", "观察此刻", "读取相机环境层的光线与场景（手动授权，不自动拍照）"),
    ("locate", "确定位置", "解析本机位置与全球城市坐标"),
    ("weather", "读天气", "拉取当地天气，作为选曲情绪的种子"),
    ("sunset", "算日落时刻", "按真实太阳日落把全球城市排成一条金色时间线"),
    ("compose", "编排全天", "把感知/天气/日落揉进一份全天日落电台节目单"),
    ("commit", "落地节目单", "定稿排程，交给电台按序播放"),
]


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _clamp(value, low, high):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return low
    return max(low, min(high, value))


def _http_publish(plan, timeout=4):
    """Default publisher: POST the plan snapshot to the server (patched in tests)."""
    body = json.dumps(plan, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{API_BASE}{PLAN_PUBLISH_PATH}",
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read()
    except Exception:
        # The web bridge is optional; a plan must still complete if the server is down.
        pass


def _perceive(capture=False):
    """Reuse the manual-only ambient layer for a light scene/light read."""
    import ambient_agent

    report = ambient_agent.build_agent_report(capture=bool(capture), persist=False)
    observation = report.get("observation") or {}
    state = report.get("state") or {}
    mode = report.get("mode") or {}
    camera_available = bool(observation.get("ok")) or bool(state.get("ok"))
    # Short-term ambient memory trend (brightening / darkening / steady) so the plan can
    # anticipate the room drifting toward evening, not just react to the latest frame.
    light_trend = "unknown"
    try:
        import ambient_memory

        light_trend = (ambient_memory.memory_report() or {}).get("lightTrend") or "unknown"
    except Exception:
        light_trend = "unknown"
    return {
        "ok": camera_available,
        "cameraAvailable": camera_available,
        "mode": mode.get("label") or mode.get("mode") or "",
        "light": state.get("light") or "unknown",
        "lightTrend": light_trend,
        "activity": state.get("activity") or "unknown",
        "summary": state.get("summary") or observation.get("summary") or observation.get("message") or "",
        "captureRequested": bool(capture),
        "message": report.get("message") or observation.get("message") or "",
    }


class PlanRun:
    """Mutable plan snapshot with incremental publishing."""

    def __init__(self, publish=None, capture=False):
        self.publish = publish or _http_publish
        self.plan = {
            "runId": f"plan-{int(time.time())}-{os.getpid()}",
            "title": "今日日落电台编排",
            "status": "running",
            "startedAt": now_iso(),
            "updatedAt": now_iso(),
            "captureRequested": bool(capture),
            "message": "环境编排 agent 启动…",
            "privacy": dict(PRIVACY),
            "location": None,
            "perception": None,
            "weather": None,
            "goldenHour": None,
            "mood": None,
            "schedule": [],
            "stops": 0,
            "steps": [
                {"id": sid, "kind": sid, "title": title, "detail": detail, "status": "pending",
                 "startedAt": "", "endedAt": ""}
                for sid, title, detail in STEP_BLUEPRINT
            ],
        }

    def _step(self, sid):
        for step in self.plan["steps"]:
            if step["id"] == sid:
                return step
        return None

    def emit(self):
        self.plan["updatedAt"] = now_iso()
        try:
            self.publish(json.loads(json.dumps(self.plan, ensure_ascii=False)))
        except Exception:
            pass

    def start_step(self, sid, detail=None):
        step = self._step(sid)
        if step:
            step["status"] = "active"
            step["startedAt"] = now_iso()
            if detail:
                step["detail"] = detail
        self.emit()
        return step

    def finish_step(self, sid, status="done", detail=None):
        step = self._step(sid)
        if step:
            step["status"] = status
            step["endedAt"] = now_iso()
            if detail:
                step["detail"] = detail
        self.emit()
        return step

    def set_message(self, message):
        self.plan["message"] = message


def _blend_mood(weather, perception, local_hour):
    """Blend weather + room light + time-of-day into one bounded day mood."""
    seed = (weather or {}).get("moodSeed") if isinstance(weather, dict) else None
    if not isinstance(seed, dict):
        seed = {"energyDelta": 0.0, "vocalRatioHint": 0.5, "instrumentalPreference": 0.5,
                "palette": "暖橙渐层", "mood": "平和"}
    energy = float(seed.get("energyDelta") or 0.0)
    vocal = float(seed.get("vocalRatioHint") or 0.5)
    instrumental = float(seed.get("instrumentalPreference") or 0.5)
    palette = seed.get("palette") or "暖橙渐层"
    mood_word = seed.get("mood") or "平和"
    reasons = []
    if isinstance(weather, dict) and weather.get("ok"):
        reasons.append(weather.get("label") or "天气")

    light = (perception or {}).get("light") if isinstance(perception, dict) else None
    if light in ("dark", "dim"):
        energy -= 0.08
        instrumental += 0.1
        vocal -= 0.06
        reasons.append("室内偏暗")
    elif light == "bright":
        energy += 0.05
        reasons.append("室内明亮")

    trend = (perception or {}).get("lightTrend") if isinstance(perception, dict) else None
    if trend == "darkening":
        energy -= 0.05
        instrumental += 0.06
        reasons.append("光线转暗")
    elif trend == "brightening":
        energy += 0.04
        reasons.append("光线转亮")

    if isinstance(local_hour, int):
        if local_hour >= 21 or local_hour < 5:
            energy -= 0.06
            instrumental += 0.06
            reasons.append("入夜")
        elif 16 <= local_hour < 19:
            reasons.append("黄昏时段")

    return {
        "mood": mood_word,
        "palette": palette,
        "energyDelta": round(_clamp(energy, -0.2, 0.2), 3),
        "vocalRatioHint": round(_clamp(vocal, 0.0, 1.0), 3),
        "instrumentalPreference": round(_clamp(instrumental, 0.0, 1.0), 3),
        "reason": "、".join(dict.fromkeys(reasons)) or "按当前环境轻调",
    }


def _stop_full_mood(global_mood, city_weather):
    """Per-stop mood: the day's base mood nudged toward that city's own live weather."""
    mood = dict(global_mood or {})
    if isinstance(city_weather, dict) and city_weather.get("ok"):
        seed = city_weather.get("moodSeed") or {}
        mood["energyDelta"] = round(_clamp((mood.get("energyDelta", 0.0) + float(seed.get("energyDelta", 0.0))) / 2, -0.2, 0.2), 3)
        mood["vocalRatioHint"] = round(_clamp((mood.get("vocalRatioHint", 0.5) + float(seed.get("vocalRatioHint", 0.5))) / 2, 0.0, 1.0), 3)
        mood["instrumentalPreference"] = round(_clamp((mood.get("instrumentalPreference", 0.5) + float(seed.get("instrumentalPreference", 0.5))) / 2, 0.0, 1.0), 3)
        mood["mood"] = seed.get("mood") or mood.get("mood")
        mood["palette"] = seed.get("palette") or mood.get("palette")
    return mood


def _stop_reason(event, mood, featured):
    parts = []
    if featured:
        parts.append("此刻最接近日落")
    golden = event.get("goldenHour") or {}
    if golden.get("active"):
        parts.append("正值黄金时刻")
    elif isinstance(golden.get("minutesUntilStart"), int) and golden["minutesUntilStart"] <= 90:
        parts.append(f"约{golden['minutesUntilStart']}分钟后进入金色光")
    parts.append(f"当地日落 {event.get('cityLocalSunsetClock', '')}")
    if mood and mood.get("mood"):
        parts.append(mood["mood"])
    return "，".join(p for p in parts if p)


def run_day_plan(catalog=None, now_utc=None, capture=False, publish=None, user_tz_offset=None):
    """Run the full pipeline, publishing each step, and return the final plan dict.

    ``catalog`` is a list of city dicts (``{cityNameZh, tzOffset, slug, tracks, lat?, lng?}``);
    when None it is loaded from the native daemon's catalog loader.
    """
    from datetime import datetime, timezone

    now_utc = now_utc or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    if catalog is None:
        try:
            import pi_command_daemon

            catalog = pi_command_daemon.load_catalog()
        except Exception:
            catalog = []

    run = PlanRun(publish=publish, capture=capture)
    run.emit()  # publish the empty pipeline skeleton first (PWA shows all 6 steps pending)

    # 1) Perceive ---------------------------------------------------------------
    run.start_step("perceive")
    try:
        perception = _perceive(capture=capture)
    except Exception as exc:
        perception = {"ok": False, "cameraAvailable": False, "light": "unknown",
                      "summary": "", "message": f"环境层暂不可用：{str(exc)[:60]}"}
    run.plan["perception"] = perception
    if perception.get("ok"):
        run.finish_step("perceive", "done", perception.get("summary") or perception.get("message") or "已读取环境光线")
    else:
        run.finish_step("perceive", "skipped", perception.get("message") or "相机未就绪，先不看画面")

    # 2) Locate -----------------------------------------------------------------
    run.start_step("locate")
    location = geo_skill.device_location()
    meta = geo_skill.load_city_meta()
    with_coords = sum(1 for c in (catalog or []) if geo_skill.city_geo(c, meta).get("ok"))
    location["cityCount"] = len(catalog or [])
    location["citiesWithCoords"] = with_coords
    run.plan["location"] = location
    detail = location.get("message") or ""
    detail += f" 全球 {with_coords}/{len(catalog or [])} 座城市有坐标。"
    run.finish_step("locate", "done" if location.get("ok") else "skipped", detail.strip())

    # 3) Weather ----------------------------------------------------------------
    run.start_step("weather")
    if location.get("ok"):
        weather = weather_skill.observe_weather(location.get("lat"), location.get("lng"))
    else:
        weather = {"ok": False, "source": "no_location", "message": "本机位置未配置，天气这步先跳过。",
                   "moodSeed": weather_skill._mood_seed("unknown", True, False)}
    run.plan["weather"] = weather
    run.finish_step("weather", "done" if weather.get("ok") else "skipped",
                    weather.get("message") or "天气不可用")

    # 4) Sunset -----------------------------------------------------------------
    run.start_step("sunset")
    device_tz = location.get("tzOffset") if location.get("ok") else user_tz_offset
    events = sunset_skill.order_cities_by_sunset(catalog or [], now_utc=now_utc, user_tz_offset=device_tz)
    golden_here = None
    if location.get("ok"):
        here_event = sunset_skill.next_sunset_event(
            {"cityNameZh": location.get("name") or "此处", "tzOffset": device_tz,
             "lat": location.get("lat"), "lng": location.get("lng")},
            now_utc=now_utc,
            user_tz_offset=device_tz,
        )
        golden_here = {
            "cityLocalSunsetClock": here_event.get("cityLocalSunsetClock"),
            "userSunsetClock": here_event.get("userSunsetClock"),
            "minutesUntil": here_event.get("minutesUntil"),
            **(here_event.get("goldenHour") or {}),
        }
    run.plan["goldenHour"] = golden_here
    solar_count = sum(1 for e in events if e.get("source") == "solar")
    sunset_detail = f"已按真实日落排出 {len(events)} 座城市（{solar_count} 座用太阳角度精算）。"
    if golden_here and isinstance(golden_here.get("minutesUntil"), int):
        sunset_detail += f" 本地日落 {golden_here.get('userSunsetClock')}，还有约 {golden_here['minutesUntil']} 分钟。"
    run.finish_step("sunset", "done", sunset_detail)

    # 5) Compose ----------------------------------------------------------------
    run.start_step("compose")
    from datetime import timedelta

    local_hour = None
    if isinstance(device_tz, (int, float)):
        local_hour = int((now_utc + timedelta(hours=device_tz)).strftime("%H"))
    mood = _blend_mood(weather, perception, local_hour)
    run.plan["mood"] = mood

    city_by_name = {}
    for city in (catalog or []):
        key = city.get("cityNameZh") or city.get("cityName") or city.get("slug")
        city_by_name[key] = city

    top_events = events[:MAX_SCHEDULE_STOPS]

    # Per-city live weather for the soonest few stops (bounded, cached, best-effort).
    city_weather = {}
    if CITY_WEATHER_COUNT > 0:
        weather_cache = {}
        for event in top_events[:CITY_WEATHER_COUNT]:
            if not event.get("hasCoords"):
                continue
            key = (round(event["lat"], 2), round(event["lng"], 2))
            if key not in weather_cache:
                try:
                    weather_cache[key] = weather_skill.observe_weather(event["lat"], event["lng"], timeout=CITY_WEATHER_TIMEOUT)
                except Exception:
                    weather_cache[key] = {"ok": False}
            city_weather[event.get("cityNameZh")] = weather_cache[key]
        weathered = sum(1 for w in city_weather.values() if w.get("ok"))
        run.plan["cityWeatherCount"] = weathered
        if weathered:
            run.set_message(f"正在把前 {weathered} 站的实时天气揉进节目单…")
            run.emit()

    schedule = []
    for order, event in enumerate(top_events):
        featured = order == 0
        city = city_by_name.get(event.get("cityNameZh")) or {}
        tracks = city.get("tracks") or []
        available = len(tracks)
        want = FEATURED_TRACKS_PER_CITY if featured else DEFAULT_TRACKS_PER_CITY
        cap = max(1, min(want, available)) if available else want
        cw = city_weather.get(event.get("cityNameZh"))
        stop_mood = _stop_full_mood(mood, cw)
        chosen = track_select.select_tracks_for_mood(tracks, cap, stop_mood) if tracks else []
        slug = event.get("slug") or city.get("slug") or ""
        golden = event.get("goldenHour") or {}
        schedule.append({
            "order": order,
            "slug": slug,
            "cityNameZh": event.get("cityNameZh"),
            "cityName": event.get("cityName") or city.get("cityName") or "",
            "sunsetUtcIso": event.get("sunsetUtcIso"),
            "cityLocalSunsetClock": event.get("cityLocalSunsetClock"),
            "userSunsetClock": event.get("userSunsetClock"),
            "minutesUntil": event.get("minutesUntil"),
            "source": event.get("source"),
            "goldenActive": bool(golden.get("active")),
            "goldenInMinutes": golden.get("minutesUntilStart"),
            "featured": featured,
            "mood": stop_mood.get("mood"),
            "palette": stop_mood.get("palette"),
            "weather": ({"ok": True, "label": cw.get("label"), "skyZh": cw.get("skyZh"),
                         "tempC": cw.get("tempC")} if cw and cw.get("ok") else None),
            "trackCount": len(chosen) if chosen else cap,
            "trackKeys": [t.get("trackKey") or (f"{slug}::{t.get('id')}" if t.get("id") else "") for t in chosen],
            "trackTitles": [t.get("title") for t in chosen if t.get("title")],
            "reason": _stop_reason(event, stop_mood, featured),
        })
    run.plan["schedule"] = schedule
    run.plan["stops"] = len(schedule)
    weathered = run.plan.get("cityWeatherCount") or 0
    run.finish_step("compose", "done",
                    f"编出 {len(schedule)} 段日落节目，情绪基调「{mood.get('mood')}」（{mood.get('reason')}）"
                    + (f"，前 {weathered} 站接了实时天气。" if weathered else "。"))

    # 6) Commit -----------------------------------------------------------------
    run.start_step("commit")
    if schedule:
        head = schedule[0]
        total_tracks = sum(s["trackCount"] for s in schedule)
        summary = (f"全天已排 {len(schedule)} 座城市 · {total_tracks} 首。"
                   f"当下从「{head['cityNameZh']}」起步（当地日落 {head['cityLocalSunsetClock']}），"
                   f"基调「{mood.get('mood')}」。")
        commit_status = "done"
    else:
        summary = "没有可排的城市歌单，先保持 24H 主线。"
        commit_status = "skipped"
    run.plan["status"] = "done"
    run.set_message(summary)
    run.finish_step("commit", commit_status, summary)
    run.plan["updatedAt"] = now_iso()
    run.emit()
    return run.plan


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Run the Sunset Radio day-planner agent.")
    parser.add_argument("--capture", action="store_true", help="Allow one manual ambient scan.")
    parser.add_argument("--no-publish", action="store_true", help="Do not POST steps to /api/pi-plan.")
    parser.add_argument("--message", action="store_true", help="Print only the final summary message.")
    args = parser.parse_args()

    publish = (lambda plan: None) if args.no_publish else None
    plan = run_day_plan(capture=args.capture, publish=publish)
    if args.message:
        print(plan.get("message") or "")
    else:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0 if plan.get("status") == "done" else 1


if __name__ == "__main__":
    raise SystemExit(main())
