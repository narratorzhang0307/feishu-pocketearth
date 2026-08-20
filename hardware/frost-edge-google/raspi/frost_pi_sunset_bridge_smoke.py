#!/usr/bin/env python3
"""Offline smoke checks for the PI Home / Sunset Radio bridge."""

from frost_pi_sunset_bridge import COMMAND_HINTS, catalog_groups, command_hint, random_track, upcoming_sunsets


CATALOG = [
    {
        "slug": "los-angeles",
        "cityName": "Los Angeles",
        "cityNameZh": "洛杉矶",
        "tzOffset": -8,
        "tracks": [
            {
                "id": "a",
                "title": "Midnight Harbor",
                "artist": "Artist A",
                "audioUrl": "https://a",
                "citySlug": "los-angeles",
                "cityName": "Los Angeles",
                "cityNameZh": "洛杉矶",
                "introText": "一段只属于港口夜色的独特声音记录。",
            }
        ],
    },
    {
        "slug": "beijing",
        "cityName": "Beijing",
        "cityNameZh": "北京",
        "tzOffset": 8,
        "tracks": [
            {
                "id": "b",
                "title": "Northern Window",
                "artist": "Artist B",
                "audioUrl": "https://b",
                "citySlug": "beijing",
                "cityName": "Beijing",
                "cityNameZh": "北京",
                "introText": "另一段白昼里的声音记录。",
            }
        ],
    },
]


def main() -> int:
    assert len(COMMAND_HINTS) == 621
    groups = catalog_groups(CATALOG)
    assert len(groups) == 2
    assert sum(len(group["cities"]) for group in groups) == len(CATALOG)
    city, track = random_track(CATALOG, chooser=lambda items: items[0])
    assert city["slug"] == "los-angeles" and track["id"] == "a"
    assert command_hint(track, CATALOG)
    events = upcoming_sunsets(CATALOG, limit=2)
    assert len(events) == 2 and all("minutesUntil" in event for event in events)
    print("frost_pi_sunset_bridge smoke passed; groups=2 tracks=2 sunsets=2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
