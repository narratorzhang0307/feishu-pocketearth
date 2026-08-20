#!/usr/bin/env python3
"""pet_heartbeat 离线自测：睡眠边界、饿一次只喊一次、黄昏一天只出发一次、神游按时回家、想你阈值；
并锁死隐私边界 —— 心跳模块源代码不得触碰相机。"""
import os
from datetime import datetime, timedelta, timezone

import pet_heartbeat
import pet_state


TZ = 8


def ts(hour, minute=0, day=8):
    local = datetime(2026, 7, day, hour, minute, tzinfo=timezone.utc)
    return int((local - timedelta(hours=TZ)).timestamp())


def base_inputs(now_ts, **extra):
    payload = {
        "nowTs": now_ts,
        "tzOffset": TZ,
        "localHour": pet_state.local_hour(now_ts, TZ),
        "battery": 90,
        "light": "",
        "homeSunsetMinutes": None,
    }
    payload.update(extra)
    return payload


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    # ---- 隐私边界：心跳源代码不 import 相机/观察层 ----
    src_dir = os.path.dirname(os.path.abspath(__file__))
    for module in ("pet_heartbeat.py", "pet_state.py"):
        with open(os.path.join(src_dir, module), "r", encoding="utf-8") as handle:
            source = handle.read()
        for forbidden in ("ambient_observer", "rpicam", "camera", "libcamera"):
            check(f"{module}_no_{forbidden}", forbidden not in source)

    # ---- 白天平静 → 睡眠边界 → 醒来 ----
    state = pet_state.default_state()
    state, _ = pet_state.ensure_born(state, ts(10), TZ, city="杭州")
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(10)))
    check("daytime_calm", state["mood"] == "calm" and state["activity"] == "home_watch")

    state, actions = pet_heartbeat.tick(state, base_inputs(ts(1)))  # 凌晨 1 点
    check("falls_asleep", state["activity"] == "sleeping" and state["mood"] == "sleepy")
    check("sleep_published", "publish" in actions)
    check("sleep_event", any(e["kind"] == "sleep" for e in state["today"]["events"]))

    state, actions = pet_heartbeat.tick(state, base_inputs(ts(8)))  # 早上 8 点
    check("wakes_up", state["activity"] == "home_watch")
    check("wake_event", any(e["kind"] == "wake" for e in state["today"]["events"]))

    # ---- 低电量：进入想充电，且一天只记一次事件；回血后复位 ----
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(9), battery=15))
    check("hungry_mood", state["mood"] == "hungry")
    hungry_events = [e for e in state["today"]["events"] if e["kind"] == "hungry"]
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(9, 5), battery=14))
    hungry_events_after = [e for e in state["today"]["events"] if e["kind"] == "hungry"]
    check("hungry_noted_once", len(hungry_events) == 1 and len(hungry_events_after) == 1)
    # 电量恰为 0（空电池正在充电）是合法读数：必须仍然想充电，不许被兜底成满电
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(9, 10), battery=0))
    check("zero_battery_still_hungry", state["mood"] == "hungry" and state["energy"] == 0)
    hungry_after_zero = [e for e in state["today"]["events"] if e["kind"] == "hungry"]
    check("zero_battery_no_duplicate_event", len(hungry_after_zero) == 1)
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(9, 30), battery=80))
    check("recovers_from_hungry", state["mood"] != "hungry" and not state["flags"].get("hungryNoted"))

    # ---- 互动后开心；久不理会想你 ----
    pet_state.note_interaction(state, "touch", ts(11), TZ)
    state, _ = pet_heartbeat.tick(state, base_inputs(ts(11, 5)))
    check("happy_after_touch", state["mood"] == "happy")
    state, _ = pet_heartbeat.tick(state, base_inputs(ts(18)))
    check("longing_after_hours", state["mood"] == "longing")
    check("longing_event", any(e["kind"] == "longing" for e in state["today"]["events"]))

    # ---- 黄昏出发：真实日落窗口触发，一天只一次 ----
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(19), homeSunsetMinutes=5))
    check("dusk_triggers_drift", "start_drift" in actions)
    # 守护进程执行 begin_drift 后，同一天不再出发
    pet_state.begin_drift(state, {"cityNameZh": "里斯本", "slug": "lisbon"}, ts(19), TZ, duration_min=28)
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(19, 5), homeSunsetMinutes=0))
    check("no_double_drift_same_day", "start_drift" not in actions)
    check("drifting_mood", state["mood"] == "drifting")

    # ---- 神游按时回家 ----
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(19, 20), homeSunsetMinutes=-20))
    check("still_drifting", "end_drift" not in actions)
    state, actions = pet_heartbeat.tick(state, base_inputs(ts(19, 40), homeSunsetMinutes=-40))
    check("comes_home_on_time", "end_drift" in actions)

    # ---- 次日窗口重新开放；无定位时按本地 18:20 兜底 ----
    state["activity"] = "home_watch"
    state["drift"] = {}
    next_day = ts(18, 20, day=9)
    state, actions = pet_heartbeat.tick(state, base_inputs(next_day, homeSunsetMinutes=None))
    check("fallback_dusk_next_day", "start_drift" in actions)

    # ---- 睡着不出门 ----
    state2 = pet_state.default_state()
    state2, _ = pet_state.ensure_born(state2, ts(10), TZ)
    state2, actions = pet_heartbeat.tick(state2, base_inputs(ts(2), homeSunsetMinutes=0))
    check("asleep_never_drifts", "start_drift" not in actions)

    # ---- 深夜强制神游的收尾 tick 不许落进睡眠分支（曾产生矛盾的重复 sleep 事件）----
    state3 = pet_state.default_state()
    state3, _ = pet_state.ensure_born(state3, ts(10), TZ)
    pet_state.begin_drift(state3, {"cityNameZh": "开罗", "slug": "cairo"}, ts(1, 10), TZ, duration_min=28)
    sleeps_before = [e for e in state3["today"]["events"] if e["kind"] == "sleep"]
    state3, actions = pet_heartbeat.tick(state3, base_inputs(ts(1, 40)))
    sleeps_after = [e for e in state3["today"]["events"] if e["kind"] == "sleep"]
    check("night_homecoming_ends_drift", "end_drift" in actions)
    check("night_homecoming_no_sleep_event", len(sleeps_before) == len(sleeps_after))
    check("night_homecoming_keeps_activity", state3["activity"] == "dusk_drift")  # 收尾由守护进程执行

    # ---- 日落刚过的负分钟差（守护进程已换算带符号值）仍在出发窗内 ----
    state4 = pet_state.default_state()
    state4, _ = pet_state.ensure_born(state4, ts(10), TZ)
    state4, actions = pet_heartbeat.tick(state4, base_inputs(ts(19, 10), homeSunsetMinutes=-10))
    check("just_after_sunset_still_drifts", "start_drift" in actions)

    if failures:
        print("PET HEARTBEAT SMOKE FAILED:", ", ".join(failures))
        return 1
    print("PET HEARTBEAT SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
