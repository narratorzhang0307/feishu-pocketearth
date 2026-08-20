#!/usr/bin/env python3
"""Mood-aware track selection for the Sunset Radio day planner.

Given a city's tracks and the blended day mood (energy / vocal ratio / instrumental
preference), rank and pick the best-fit subset. The catalog has no per-track energy
tags, so this scores against content signals that *are* present — the song title and
the DJ intro text (``introText``), which describe each song's vibe in words.

This is a deliberate, honest approximation and a clean extension point: when real
per-track tags land, only ``score_track`` needs to change. When the mood carries no
signal (or every track ties), selection collapses to the original order — so it is
never worse than "take the first N".
"""

# Content keyword bags, matched (lowercased) against title + introText + artist.
_INSTRUMENTAL = [
    "器乐", "纯音乐", "instrumental", "钢琴", "piano", "弦乐", "大提琴", "cello",
    "吉他", "guitar", "post-rock", "ambient", "配乐", "原声", "ost", "轻音乐", "纯器乐",
]
_CALM = [
    "夜", "静", "孤", "雨", "慢", "梦", "眠", "海", "月", "思", "念", "离", "远",
    "空", "冷", "雾", "安静", "轻", "温柔", "низ", "lullaby", "slow", "quiet", "calm", "gentle",
]
_BRIGHT = [
    "光", "暖", "晴", "阳", "花", "舞", "快", "热", "笑", "亮", "夏", "风", "自由",
    "奔", "跳", "sunny", "dance", "bright", "shine", "summer", "happy", "free",
]
_VOCAL = ["唱", "歌声", "人声", "嗓", "词", "吟", "谣", "vocal", "sing", "voice", "choir", "合唱"]


def _text(track):
    if not isinstance(track, dict):
        return ""
    parts = [track.get("title"), track.get("introText"), track.get("artist")]
    return " ".join(str(p) for p in parts if p).lower()


def _hits(text, words):
    return sum(1 for w in words if w in text)


def score_track(track, mood):
    """A small non-negative fit score; higher = better match for the mood."""
    text = _text(track)
    mood = mood if isinstance(mood, dict) else {}
    instrumental = float(mood.get("instrumentalPreference", 0.5) or 0.5)
    vocal = float(mood.get("vocalRatioHint", 0.5) or 0.5)
    energy = float(mood.get("energyDelta", 0.0) or 0.0)

    score = 0.0
    if instrumental >= 0.6:
        score += _hits(text, _INSTRUMENTAL) * 1.5 + _hits(text, _CALM) * 0.5
    elif instrumental <= 0.4:
        score += _hits(text, _VOCAL) * 1.0
    if vocal >= 0.55:
        score += _hits(text, _VOCAL) * 1.5
    if energy > 0.03:
        score += _hits(text, _BRIGHT) * 1.0
    elif energy < -0.03:
        score += _hits(text, _CALM) * 1.0
    return score


def select_tracks_for_mood(tracks, count, mood):
    """Pick ``count`` best-fit tracks, kept in their original in-city order.

    Ties (including "no mood signal at all") fall back to the first ``count`` tracks,
    so this never reorders or regresses a city that has no matchable content.
    """
    tracks = [t for t in (tracks or []) if isinstance(t, dict)]
    if not tracks:
        return []
    count = max(1, min(int(count or 1), len(tracks)))
    if not mood:
        return tracks[:count]
    scored = [(score_track(t, mood), i, t) for i, t in enumerate(tracks)]
    if all(s == 0 for s, _, _ in scored):
        return tracks[:count]
    scored.sort(key=lambda x: (-x[0], x[1]))
    picked = scored[:count]
    picked.sort(key=lambda x: x[1])  # restore natural order among the chosen subset
    return [t for _, _, t in picked]


def main():
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Mood-aware track selection (debug).")
    parser.add_argument("--json", help="JSON: {tracks:[...], count:N, mood:{...}}")
    args = parser.parse_args()
    payload = json.loads(args.json or "{}")
    picked = select_tracks_for_mood(payload.get("tracks"), payload.get("count", 2), payload.get("mood"))
    print(json.dumps([t.get("title") for t in picked], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
