#!/usr/bin/env python3
"""电子宠物的自主心跳：无人打扰时，它自己决定醒着、犯困、想你、出神。

设计约束（与相机隐私承诺对齐）：
- 心跳**不拍照**：只消费电量、时钟、环境层已有的光线记忆 —— 这里 import 不了相机；
- 纯函数决策：tick() 不做任何 IO，输入全部注入，方便离线冒烟测试；
- 副作用外置：tick 只返回动作清单（如 start_drift / end_drift），由守护进程执行。

动作清单：
  start_drift  黄昏窗口命中且今天还没出过门 → 守护进程挑「此刻正在日落的城市」出发
  end_drift    神游计时结束 → 回家（Step 2 起：回家即写信）
  publish      状态有变化，值得向 /api/pi-pet 发布一份新快照
"""

import pet_state

# 可调参数（环境变量在守护进程侧读，这里只放默认值，保持纯函数）
HUNGRY_AT = 20            # 电量 ≤20% 就是「想充电」
SLEEP_START_H = 0.5       # 00:30 睡
SLEEP_END_H = 7.5         # 07:30 醒
LONGING_AFTER_H = 6       # 白天超过 6 小时没人理，开始想你
HAPPY_WINDOW_MIN = 10     # 互动后 10 分钟内都是开心的
DRIFT_WINDOW_MIN = 15     # 本地日落前后 ±15 分钟为出发窗口
DRIFT_FALLBACK_H = 18.33  # 未配置位置时，按本地 18:20 视作黄昏
DEFAULT_DRIFT_MIN = 28    # 一次神游的时长（分钟）


def in_sleep_window(hour):
    return SLEEP_START_H <= hour < SLEEP_END_H


def in_dusk_window(inputs):
    """黄昏出发窗口：优先真实日落（分钟差），无定位时退回本地 18:20。"""
    minutes = inputs.get("homeSunsetMinutes")
    if minutes is not None:
        try:
            return abs(float(minutes)) <= DRIFT_WINDOW_MIN
        except (TypeError, ValueError):
            return False
    hour = float(inputs.get("localHour") or 0)
    return abs(hour - DRIFT_FALLBACK_H) * 60 <= DRIFT_WINDOW_MIN


def _energy(state):
    # 电量 0 是合法读数（正在充电的空电池），绝不能被 or 兜底成满电。
    value = state.get("energy")
    return 100 if value is None else int(value)


def _decide_mood(state, inputs):
    now_ts = int(inputs["nowTs"])
    hour = float(inputs.get("localHour") or 0)
    if state.get("activity") == "dusk_drift":
        return "drifting"
    if in_sleep_window(hour):
        return "sleepy"
    if _energy(state) <= HUNGRY_AT:
        return "hungry"
    last_touch = int(state.get("lastInteractionTs") or 0)
    if last_touch and now_ts - last_touch <= HAPPY_WINDOW_MIN * 60:
        return "happy"
    if last_touch and now_ts - last_touch >= LONGING_AFTER_H * 3600 and not in_sleep_window(hour):
        return "longing"
    if str(inputs.get("light") or "") == "bright":
        return "happy"
    return "calm"


def tick(state, inputs):
    """一次心跳。inputs 全注入：
    nowTs 当前 UTC 秒；tzOffset 设备时区；localHour 本地小时（浮点）；
    battery 电量 0-100 或 None；light 环境层光线（可空）；
    homeSunsetMinutes 距本地日落的分钟数（可为负/None）。
    返回 (state, actions)。"""
    actions = []
    now_ts = int(inputs["nowTs"])
    tz = inputs.get("tzOffset") or 0
    hour = float(inputs.get("localHour") or pet_state.local_hour(now_ts, tz))
    inputs = dict(inputs)
    inputs["localHour"] = hour

    pet_state.ensure_today(state, now_ts, tz)

    # 电量即饱腹：只在电量有读数时更新，读不到就保持上次的值。
    battery = inputs.get("battery")
    if battery is not None:
        try:
            state["energy"] = max(0, min(100, int(battery)))
        except (TypeError, ValueError):
            pass

    # ---- 神游收尾：计时到点就回家（回家动作由守护进程接走，归来即写信）----
    # 到点也立即返回：不能落进下面的睡眠/心情分支——深夜强制神游结束的那个 tick
    # 曾会误记一条「睡着了」，activity 又被 end_drift 改回，时间线出现矛盾事件。
    drift = state.get("drift") or {}
    if state.get("activity") == "dusk_drift":
        if int(drift.get("endsTs") or 0) <= now_ts:
            actions.append("end_drift")
        else:
            state["mood"] = "drifting"
        return state, actions  # 神游中/刚到点都不做其他决策

    # ---- 睡眠边界事件 ----
    sleeping = in_sleep_window(hour)
    if sleeping and state.get("activity") != "sleeping":
        state["activity"] = "sleeping"
        pet_state.record_event(state, "sleep", "困了，睡着了", now_ts, tz)
        actions.append("publish")
    elif not sleeping and state.get("activity") == "sleeping":
        state["activity"] = "home_watch"
        pet_state.record_event(state, "wake", "醒了，开始守着房间的光", now_ts, tz)
        actions.append("publish")

    # ---- 低电量提醒：每天只喊一次 ----
    if _energy(state) <= HUNGRY_AT and not state["flags"].get("hungryNoted"):
        state["flags"]["hungryNoted"] = True
        pet_state.record_event(state, "hungry", f"电量只剩 {state['energy']}%，想充电", now_ts, tz)
        actions.append("publish")
    elif _energy(state) > HUNGRY_AT + 10:
        state["flags"].pop("hungryNoted", None)

    # ---- 黄昏出发：一天一次，睡着不出门 ----
    today = pet_state.local_date_str(now_ts, tz)
    if (
        state.get("activity") == "home_watch"
        and state.get("lastDriftDate") != today
        and in_dusk_window(inputs)
    ):
        actions.append("start_drift")

    # ---- 心情结算：变了才发布 ----
    mood = _decide_mood(state, inputs)
    if mood != state.get("mood"):
        state["mood"] = mood
        if mood == "longing":
            pet_state.record_event(state, "longing", "好久没人理它了，有点想你", now_ts, tz)
        actions.append("publish")

    return state, actions
