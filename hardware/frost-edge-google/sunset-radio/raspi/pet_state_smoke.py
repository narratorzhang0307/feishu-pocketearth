#!/usr/bin/env python3
"""pet_state 离线自测：出生只发生一次、时间线跨天翻页且有界、快照结构稳定、存取往返一致。"""
import json
import os
import tempfile
from datetime import datetime, timezone

import pet_state

TZ = 8  # 北京时间
T0 = int(datetime(2026, 7, 8, 10, 0, tzinfo=timezone.utc).timestamp())  # 本地 18:00
DAY = 24 * 3600


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    state = pet_state.default_state()

    # 出生只发生一次，出生证明带城市与日落钟面
    state, born = pet_state.ensure_born(state, T0, TZ, city="杭州", sunset_clock="19:03")
    check("born_once", born and state["bornCity"] == "杭州" and state["bornSunset"] == "19:03")
    state, born_again = pet_state.ensure_born(state, T0 + 60, TZ, city="别处")
    check("born_never_twice", not born_again and state["bornCity"] == "杭州")
    check("born_event_recorded", any(e["kind"] == "born" for e in state["today"]["events"]))
    check("days_alive_day1", pet_state.days_alive(state, T0, TZ) == 1)
    check("days_alive_next_day", pet_state.days_alive(state, T0 + DAY, TZ) == 2)

    # 互动：亲密度累积且每日封顶
    for _ in range(pet_state.DAILY_BOND_CAP + 5):
        pet_state.note_interaction(state, "wake", T0 + 120, TZ)
    check("bond_daily_cap", state["bond"] == pet_state.DAILY_BOND_CAP)
    check("interaction_ts", state["lastInteractionTs"] == T0 + 120)

    # 时间线有界
    for i in range(pet_state.TODAY_EVENT_LIMIT + 10):
        pet_state.record_event(state, "noise", f"事件{i}", T0 + 200 + i, TZ)
    check("events_bounded", len(state["today"]["events"]) == pet_state.TODAY_EVENT_LIMIT)

    # 跨天翻页：时间线清空、当日亲密度复位、一次性标记复位
    state["flags"]["hungryNoted"] = True
    pet_state.ensure_today(state, T0 + DAY, TZ)
    check("today_rolls", state["today"]["events"] == [] and state["bondToday"] == 0 and state["flags"] == {})

    # 神游往返
    dest = {"slug": "lisbon", "cityNameZh": "里斯本", "cityLocalSunsetClock": "20:52"}
    pet_state.begin_drift(state, dest, T0 + DAY, TZ, duration_min=28)
    check("drift_active", state["activity"] == "dusk_drift" and state["drift"]["cityNameZh"] == "里斯本")
    snap = pet_state.public_snapshot(state, T0 + DAY + 60, TZ)
    check("snapshot_drift_view", snap["drift"] and snap["drift"]["remainingMin"] == 27)
    state, back_from = pet_state.end_drift(state, T0 + DAY + 28 * 60, TZ)
    check("drift_ends_home", back_from == "里斯本" and state["activity"] == "home_watch" and not state["drift"])

    # 快照结构：前端要画的字段一个不缺，且不含内部字段
    snap = pet_state.public_snapshot(state, T0 + DAY, TZ)
    for key in ("mood", "moodZh", "activity", "activityZh", "energy", "bond", "lettersSent",
                "daysAlive", "bornAt", "bornCity", "bornSunset", "drift", "today"):
        check(f"snapshot_has_{key}", key in snap)
    check("snapshot_no_internal", "flags" not in snap and "lastInteractionTs" not in snap)

    # 一句话状态可用（在家 / 神游两种口径）
    check("summary_home", "陪你" in pet_state.pet_summary_line(state, T0 + DAY, TZ))
    pet_state.begin_drift(state, dest, T0 + 2 * DAY, TZ, duration_min=28)
    check("summary_drift", "里斯本" in pet_state.pet_summary_line(state, T0 + 2 * DAY, TZ))

    # 存取往返：损坏文件安全降级
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "pet-state.json")
        check("save_ok", pet_state.save_pet_state(state, path))
        loaded = pet_state.load_pet_state(path)
        check("roundtrip_bond", loaded["bond"] == state["bond"])
        check("roundtrip_born", loaded["bornAt"] == state["bornAt"])
        with open(path, "w", encoding="utf-8") as handle:
            handle.write("{broken json")
        check("broken_file_degrades", pet_state.load_pet_state(path) == pet_state.default_state())
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"mood": "nonsense", "energy": 999, "today": {"events": "oops"}}, handle)
        weird = pet_state.load_pet_state(path)
        check("coerce_mood", weird["mood"] == "calm")
        check("coerce_energy", weird["energy"] == 100)
        check("coerce_events", weird["today"]["events"] == [])

    if failures:
        print("PET STATE SMOKE FAILED:", ", ".join(failures))
        return 1
    print("PET STATE SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
