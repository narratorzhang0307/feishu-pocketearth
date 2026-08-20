#!/usr/bin/env python3
"""Sunset skill for the Sunset Radio ambient agent.

Computes the *real* solar sunset instant for a city from its latitude/longitude —
not the old fixed 18:20 guess the native day-radio used to sort by. The math is a
direct port of the web app's ``sunsetEphemeris.ts`` (``solarSunsetUtc``) so the Pi
and the browser agree on when each city's golden hour is.

Pure standard-library math, no network. Given ``now`` it returns, per city, the next
sunset (UTC instant + local/user wall clocks + minutes until) and the golden-hour
window that precedes it, and can order the whole catalog by upcoming sunset.
"""
import math
import os
from datetime import datetime, timedelta, timezone

import geo_skill

FALLBACK_SUNSET_HOUR = 18
FALLBACK_SUNSET_MINUTE = 30
GOLDEN_HOUR_MINUTES = int(os.environ.get("SUNSET_GOLDEN_MINUTES", "40") or 40)


def _deg_to_rad(deg):
    return deg * math.pi / 180.0


def _rad_to_deg(rad):
    return rad * 180.0 / math.pi


def day_of_year(year, month, day):
    """Match JS ``floor((Date.UTC(y,m-1,d) - Date.UTC(y,0,0)) / 86400000)`` (Jan 1 -> 1)."""
    current = datetime(year, month, day, tzinfo=timezone.utc)
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    return int((current - start).days) + 1


def solar_sunset_utc(year, month, day, lat, lng):
    """Return the UTC ``datetime`` of sunset for a calendar date, or None (polar)."""
    doy = day_of_year(year, month, day)
    decl = _deg_to_rad(23.45 * math.sin(_deg_to_rad((360.0 / 365.0) * (doy - 81))))
    b = _deg_to_rad((360.0 / 365.0) * (doy - 81))
    eot_min = 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)
    time_correction_min = 4 * lng + eot_min
    solar_noon_hour = 12 - time_correction_min / 60.0
    cos_hour_angle = -math.tan(_deg_to_rad(lat)) * math.tan(decl)
    if cos_hour_angle < -1 or cos_hour_angle > 1:
        return None
    hour_angle_hour = _rad_to_deg(math.acos(cos_hour_angle)) / 15.0
    sunset_hour = (solar_noon_hour + hour_angle_hour + 24) % 24
    whole_hour = int(math.floor(sunset_hour))
    minute_float = (sunset_hour - whole_hour) * 60
    whole_minute = int(math.floor(minute_float))
    second = int(round((minute_float - whole_minute) * 60))
    base = datetime(year, month, day, tzinfo=timezone.utc)
    return base + timedelta(hours=whole_hour, minutes=whole_minute, seconds=second)


def _local_date_parts(now_utc, tz_offset_hours, day_offset=0):
    shifted = now_utc + timedelta(hours=tz_offset_hours or 0)
    base = datetime(shifted.year, shifted.month, shifted.day, tzinfo=timezone.utc) + timedelta(days=day_offset)
    return base.year, base.month, base.day


def _fallback_local_sunset_utc(year, month, day, tz_offset_hours):
    wall = datetime(year, month, day, FALLBACK_SUNSET_HOUR, FALLBACK_SUNSET_MINUTE, tzinfo=timezone.utc)
    return wall - timedelta(hours=tz_offset_hours or 0)


def _clock(instant_utc, tz_offset_hours):
    return (instant_utc + timedelta(hours=tz_offset_hours or 0)).strftime("%H:%M")


def _coords_for(city):
    lat = city.get("lat") if isinstance(city, dict) else None
    lng = city.get("lng") if isinstance(city, dict) else None
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return float(lat), float(lng)
    geo = geo_skill.city_geo(city)
    if geo.get("ok"):
        return float(geo["lat"]), float(geo["lng"])
    return None, None


def next_sunset_event(city, now_utc=None, user_tz_offset=None):
    """Next sunset for a city dict (``{cityNameZh, tzOffset, lat?, lng?}``).

    ``user_tz_offset`` is the *device* offset used for the "your clock" reading; when
    None it falls back to the city's own local clock.
    """
    now_utc = now_utc or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    city = city if isinstance(city, dict) else {"cityNameZh": str(city or "")}
    lat, lng = _coords_for(city)
    city_tz = geo_skill.display_tz_offset(city, {"lng": lng} if lng is not None else None)

    candidates = []
    for day_offset in (0, 1, 2):
        year, month, day = _local_date_parts(now_utc, city_tz, day_offset)
        if lat is not None and lng is not None:
            solar = solar_sunset_utc(year, month, day, lat, lng)
            if solar is not None:
                candidates.append((solar, "solar"))
                continue
        candidates.append((_fallback_local_sunset_utc(year, month, day, city_tz), "fallback-local-1830"))

    fresh = sorted(
        (c for c in candidates if c[0].timestamp() > now_utc.timestamp() - 60),
        key=lambda c: c[0].timestamp(),
    )
    if fresh:
        chosen, source = fresh[0]
    else:
        year, month, day = _local_date_parts(now_utc, city_tz, 1)
        chosen, source = _fallback_local_sunset_utc(year, month, day, city_tz), "fallback-local-1830"

    minutes_until = max(0, int(round((chosen.timestamp() - now_utc.timestamp()) / 60.0)))
    golden_start = chosen - timedelta(minutes=GOLDEN_HOUR_MINUTES)
    minutes_to_golden = max(0, int(round((golden_start.timestamp() - now_utc.timestamp()) / 60.0)))
    user_tz = user_tz_offset if user_tz_offset is not None else city_tz

    return {
        "slug": city.get("slug") or "",
        "cityName": city.get("cityName") or "",
        "cityNameZh": city.get("cityNameZh") or city.get("cityName") or "",
        "lat": lat,
        "lng": lng,
        "hasCoords": lat is not None and lng is not None,
        "source": source,
        "sunsetUtcIso": chosen.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sunsetUtcTs": int(chosen.timestamp()),
        "cityLocalSunsetClock": _clock(chosen, city_tz),
        "userSunsetClock": _clock(chosen, user_tz),
        "minutesUntil": minutes_until,
        "goldenHour": {
            "startUtcIso": golden_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "startCityClock": _clock(golden_start, city_tz),
            "startUserClock": _clock(golden_start, user_tz),
            "minutesUntilStart": minutes_to_golden,
            "windowMinutes": GOLDEN_HOUR_MINUTES,
            "active": golden_start.timestamp() <= now_utc.timestamp() < chosen.timestamp(),
        },
    }


def order_cities_by_sunset(cities, now_utc=None, user_tz_offset=None, limit=None):
    """Return sunset events for every city, sorted by soonest upcoming sunset."""
    now_utc = now_utc or datetime.now(timezone.utc)
    events = [next_sunset_event(city, now_utc=now_utc, user_tz_offset=user_tz_offset) for city in cities]
    events.sort(key=lambda e: (e["sunsetUtcTs"], e["cityNameZh"]))
    return events[:limit] if limit else events


def main():
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Sunset skill: real solar sunset per city.")
    parser.add_argument("city", nargs="?", help="City name (cityNameZh) to compute.")
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    if args.city:
        print(json.dumps(next_sunset_event({"cityNameZh": args.city}, now_utc=now), ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"nowUtc": now.strftime("%Y-%m-%dT%H:%M:%SZ")}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
