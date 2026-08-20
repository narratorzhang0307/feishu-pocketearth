#!/usr/bin/env python3
"""Offline self-test for sunset_skill.

Locks the Python solar port to the exact instants produced by the web app's
``sunsetEphemeris.ts`` for known dates, and checks event selection / ordering.
"""
from datetime import datetime, timezone

import sunset_skill


# Reference instants captured from the frontend algorithm (must match to the second).
REFERENCE = [
    # (year, month, day, lat, lng, expected UTC iso)
    (2026, 6, 21, 35.6762, 139.6503, "2026-06-21T09:55:26Z"),
    (2026, 12, 21, 52.37, 4.9, "2026-12-21T15:22:04Z"),
    (2026, 3, 20, 40.71, -74.0, "2026-03-20T23:01:22Z"),
]


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    for year, month, day, lat, lng, expected in REFERENCE:
        got = sunset_skill.solar_sunset_utc(year, month, day, lat, lng)
        iso = got.strftime("%Y-%m-%dT%H:%M:%SZ") if got else "null"
        check(f"solar_{expected}", iso == expected)

    # Polar night: no sunset -> None (Longyearbyen mid-December).
    polar = sunset_skill.solar_sunset_utc(2026, 12, 21, 78.2, 15.6)
    check("polar_none", polar is None)

    # Day-of-year: Jan 1 -> 1.
    check("doy_jan1", sunset_skill.day_of_year(2026, 1, 1) == 1)

    # next_sunset_event picks a future instant and carries a golden-hour window.
    now = datetime(2026, 6, 21, 6, 0, 0, tzinfo=timezone.utc)  # before Tokyo sunset 09:55Z
    tokyo = sunset_skill.next_sunset_event(
        {"cityNameZh": "东京", "tzOffset": 9, "lat": 35.6762, "lng": 139.6503},
        now_utc=now,
        user_tz_offset=8,
    )
    check("tokyo_future", tokyo["sunsetUtcTs"] > int(now.timestamp()))
    check("tokyo_source_solar", tokyo["source"] == "solar")
    check("tokyo_city_clock", tokyo["cityLocalSunsetClock"] == "18:55")  # 09:55Z + 9h
    check("tokyo_user_clock", tokyo["userSunsetClock"] == "17:55")       # 09:55Z + 8h
    check("tokyo_golden_before_sunset", tokyo["goldenHour"]["startUtcIso"] < tokyo["sunsetUtcIso"])
    check("tokyo_minutes_positive", tokyo["minutesUntil"] > 0)

    # No coordinates -> graceful fallback source, still returns an event.
    nocoord = sunset_skill.next_sunset_event({"cityNameZh": "无坐标城", "tzOffset": 3}, now_utc=now)
    check("nocoord_fallback", nocoord["source"] == "fallback-local-1830" and nocoord["hasCoords"] is False)

    # Ordering: two cities sorted by soonest upcoming sunset UTC.
    cities = [
        {"cityNameZh": "东京", "tzOffset": 9, "lat": 35.6762, "lng": 139.6503},
        {"cityNameZh": "阿姆斯特丹", "tzOffset": 1, "lat": 52.37, "lng": 4.9},
    ]
    ordered = sunset_skill.order_cities_by_sunset(cities, now_utc=now)
    check("order_len", len(ordered) == 2)
    check("order_sorted", ordered[0]["sunsetUtcTs"] <= ordered[1]["sunsetUtcTs"])
    check("order_tokyo_first", ordered[0]["cityNameZh"] == "东京")  # 09:55Z before AMS 19:xxZ

    if failures:
        print("SUNSET SKILL SMOKE FAIL:", ", ".join(failures))
        return 1
    print("SUNSET SKILL SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
