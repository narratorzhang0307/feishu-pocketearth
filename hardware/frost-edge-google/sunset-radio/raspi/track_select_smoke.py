#!/usr/bin/env python3
"""Offline self-test for track_select: mood shifts the pick, ties fall back to first-N."""
import track_select


TRACKS = [
    {"id": "a", "title": "夏日舞会", "introText": "阳光下的快节奏，明亮又自由。"},
    {"id": "b", "title": "夜航", "introText": "很静的钢琴纯音乐，孤独的海与月。"},
    {"id": "c", "title": "热风", "introText": "夏天的舞曲，笑声与光。"},
    {"id": "d", "title": "雨眠", "introText": "慢下来的雨夜，安静的弦乐。"},
]
BLANK = [
    {"id": "x", "title": "Song X", "introText": ""},
    {"id": "y", "title": "Song Y", "introText": ""},
    {"id": "z", "title": "Song Z", "introText": ""},
]


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    calm_mood = {"energyDelta": -0.15, "vocalRatioHint": 0.36, "instrumentalPreference": 0.75}
    bright_mood = {"energyDelta": 0.12, "vocalRatioHint": 0.6, "instrumentalPreference": 0.35}

    calm_pick = track_select.select_tracks_for_mood(TRACKS, 2, calm_mood)
    calm_ids = {t["id"] for t in calm_pick}
    check("calm_prefers_quiet", calm_ids == {"b", "d"})

    bright_pick = track_select.select_tracks_for_mood(TRACKS, 2, bright_mood)
    bright_ids = {t["id"] for t in bright_pick}
    check("bright_prefers_lively", bright_ids == {"a", "c"})

    # Different moods must actually produce different picks.
    check("moods_differ", calm_ids != bright_ids)

    # Chosen subset keeps original in-city order.
    check("calm_order_preserved", [t["id"] for t in calm_pick] == ["b", "d"])

    # No content signal -> first N (no reordering, no regression).
    blank_pick = track_select.select_tracks_for_mood(BLANK, 2, calm_mood)
    check("blank_first_n", [t["id"] for t in blank_pick] == ["x", "y"])

    # No mood -> first N.
    nomood = track_select.select_tracks_for_mood(TRACKS, 2, None)
    check("nomood_first_n", [t["id"] for t in nomood] == ["a", "b"])

    # Count clamps to availability.
    check("count_clamp", len(track_select.select_tracks_for_mood(TRACKS, 10, calm_mood)) == 4)
    check("empty_ok", track_select.select_tracks_for_mood([], 2, calm_mood) == [])

    if failures:
        print("TRACK SELECT SMOKE FAIL:", ", ".join(failures))
        return 1
    print("TRACK SELECT SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
