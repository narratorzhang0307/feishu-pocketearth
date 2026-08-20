#!/usr/bin/env python3
"""Weather skill for the Sunset Radio ambient agent.

Reads current sky conditions for a coordinate from Open-Meteo (free, keyless) and
turns them into (a) a short human sentence and (b) a bounded "mood seed" the day
planner blends into the radio schedule — clear golden skies lean warm and vocal,
overcast/rain lean mellow and instrumental.

Network is best-effort with a short timeout: any failure returns ``ok: False`` with a
usable message, so the Pi still plans a full day of sunsets without live weather.
"""
import json
import os
import urllib.parse
import urllib.request

OPEN_METEO_URL = os.environ.get("SUNSET_WEATHER_URL", "https://api.open-meteo.com/v1/forecast")
WEATHER_TIMEOUT_SEC = float(os.environ.get("SUNSET_WEATHER_TIMEOUT_SEC", "4") or 4)

# Minimal WMO weather-code -> Chinese label map (grouped by range).
_WMO = {
    0: "晴",
    1: "大致晴朗", 2: "多云", 3: "阴",
    45: "雾", 48: "雾凇",
    51: "细毛毛雨", 53: "毛毛雨", 55: "浓毛毛雨",
    56: "冻毛毛雨", 57: "浓冻毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨",
    66: "冻雨", 67: "强冻雨",
    71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒",
    80: "阵雨", 81: "强阵雨", 82: "暴雨",
    85: "阵雪", 86: "强阵雪",
    95: "雷阵雨", 96: "雷阵雨伴冰雹", 99: "强雷雨伴冰雹",
}


def weather_label(code):
    try:
        code = int(code)
    except (TypeError, ValueError):
        return "未知天气"
    return _WMO.get(code, "未知天气")


def _is_precip(code):
    try:
        code = int(code)
    except (TypeError, ValueError):
        return False
    return code >= 51 or code in (45, 48)


def sky_from_cloud(cloud_cover):
    try:
        cloud = float(cloud_cover)
    except (TypeError, ValueError):
        return "unknown", "云量未知"
    if cloud < 15:
        return "clear", "天色澄澈"
    if cloud < 40:
        return "few", "少云"
    if cloud < 70:
        return "partly", "云影交错"
    if cloud < 90:
        return "cloudy", "云层偏厚"
    return "overcast", "阴沉"


def _mood_seed(sky, is_day, precip):
    """Bounded next-day palette hint (energy / vocal ratio / instrumental / palette word)."""
    if precip:
        seed = {"energyDelta": -0.12, "vocalRatioHint": 0.36, "instrumentalPreference": 0.72,
                "palette": "雨色靛蓝", "mood": "内省"}
    elif sky in ("overcast", "cloudy"):
        seed = {"energyDelta": -0.06, "vocalRatioHint": 0.42, "instrumentalPreference": 0.62,
                "palette": "低饱和灰蓝", "mood": "沉静"}
    elif sky in ("clear", "few"):
        seed = {"energyDelta": 0.08, "vocalRatioHint": 0.6, "instrumentalPreference": 0.4,
                "palette": "澄澈金橙", "mood": "明朗"}
    else:  # partly / unknown
        seed = {"energyDelta": 0.0, "vocalRatioHint": 0.5, "instrumentalPreference": 0.5,
                "palette": "暖橙渐层", "mood": "平和"}
    if not is_day:
        seed = dict(seed)
        seed["energyDelta"] = round(seed["energyDelta"] - 0.05, 3)
        seed["instrumentalPreference"] = min(1.0, seed["instrumentalPreference"] + 0.08)
        seed["mood"] = f"夜色·{seed['mood']}"
    return seed


def _http_get_json(url, timeout=WEATHER_TIMEOUT_SEC):
    """Thin GET wrapper (patched out in the offline smoke test)."""
    request = urllib.request.Request(url, headers={"user-agent": "sunset-radio-weather/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _blocked(message, source="unavailable"):
    return {
        "ok": False,
        "source": source,
        "message": message,
        "moodSeed": _mood_seed("unknown", True, False),
    }


def observe_weather(lat, lng, timeout=WEATHER_TIMEOUT_SEC):
    """Fetch current sky for a coordinate. Returns a structured, bounded report."""
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return _blocked("没有坐标，天气这一步先跳过。", source="no_coords")
    query = urllib.parse.urlencode({
        "latitude": round(float(lat), 4),
        "longitude": round(float(lng), 4),
        "current": "temperature_2m,cloud_cover,weather_code,is_day,wind_speed_10m",
        "daily": "sunset,sunrise",
        "timezone": "auto",
        "forecast_days": 1,
    })
    url = f"{OPEN_METEO_URL}?{query}"
    try:
        data = _http_get_json(url, timeout=timeout)
    except Exception as exc:  # network/parse errors are expected offline
        return _blocked(f"天气服务暂时接不上（{str(exc)[:60]}），先按当前光线安排。")

    current = data.get("current") if isinstance(data.get("current"), dict) else {}
    daily = data.get("daily") if isinstance(data.get("daily"), dict) else {}
    if not current:
        return _blocked("天气服务返回为空，先按当前光线安排。")

    code = current.get("weather_code")
    cloud = current.get("cloud_cover")
    is_day = bool(current.get("is_day", 1))
    precip = _is_precip(code)
    sky_key, sky_zh = sky_from_cloud(cloud)
    label = weather_label(code)
    temp = current.get("temperature_2m")
    wind = current.get("wind_speed_10m")
    sunset_local = ""
    sunset_list = daily.get("sunset") if isinstance(daily.get("sunset"), list) else []
    if sunset_list:
        raw = str(sunset_list[0])
        sunset_local = raw[11:16] if len(raw) >= 16 else raw

    temp_txt = f"{round(float(temp))}°C " if isinstance(temp, (int, float)) else ""
    message = f"{temp_txt}{label}，{sky_zh}。".strip()
    if sunset_local:
        message += f" 当地日落约 {sunset_local}。"

    return {
        "ok": True,
        "source": "open-meteo",
        "tempC": round(float(temp), 1) if isinstance(temp, (int, float)) else None,
        "cloudCover": round(float(cloud)) if isinstance(cloud, (int, float)) else None,
        "weatherCode": int(code) if isinstance(code, (int, float)) else None,
        "label": label,
        "sky": sky_key,
        "skyZh": sky_zh,
        "isDay": is_day,
        "precip": precip,
        "windKph": round(float(wind), 1) if isinstance(wind, (int, float)) else None,
        "sunsetLocal": sunset_local,
        "moodSeed": _mood_seed(sky_key, is_day, precip),
        "message": message,
    }


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Weather skill: current sky for a coordinate.")
    parser.add_argument("lat", type=float)
    parser.add_argument("lng", type=float)
    args = parser.parse_args()
    print(json.dumps(observe_weather(args.lat, args.lng), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
