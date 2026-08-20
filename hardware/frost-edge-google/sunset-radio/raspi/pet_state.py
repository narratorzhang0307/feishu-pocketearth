#!/usr/bin/env python3
"""日落电台电子宠物（Frost）的持久状态机。

这只宠物没有等级和金币：它的状态就是「一天里发生过什么」。
- 跨重启累积：出生记录、亲密度、寄信数、今日时间线都落在 pet-state.json；
- 只存事实，不存图片：时间线是「几点醒的、黄昏去了哪」这种一句话事件；
- 纯数据层：这里不发网络请求、不碰相机、不出声，所有副作用都在守护进程侧。

字段约定（public_snapshot 输出同名驼峰给前端）：
  mood      calm/happy/sleepy/hungry/longing/drifting
  activity  home_watch（在家守光）/ dusk_drift（黄昏神游）/ sleeping（睡着了）
  energy    0-100，来自 PiSugar 电量 —— 充电即喂食
  bond      亲密度：被唤醒、被摸头、一起听完一座城都会累积
"""

import json
import os
from datetime import datetime, timedelta, timezone

STATE_DIR = os.environ.get(
    "SUNSET_STATE_DIR",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio"),
)
PET_STATE_PATH = os.environ.get("SUNSET_PET_STATE_PATH", os.path.join(STATE_DIR, "pet-state.json"))

SCHEMA_VERSION = 1
TODAY_EVENT_LIMIT = 40
DAILY_BOND_CAP = 20

MOODS = ("calm", "happy", "sleepy", "hungry", "longing", "drifting")
MOOD_ZH = {
    "calm": "安然",
    "happy": "开心",
    "sleepy": "犯困",
    "hungry": "想充电",
    "longing": "想你",
    "drifting": "神游中",
}
ACTIVITY_ZH = {
    "home_watch": "在家守光",
    "dusk_drift": "黄昏神游",
    "sleeping": "睡着了",
}


def default_state():
    return {
        "schema": SCHEMA_VERSION,
        "bornAt": "",          # ISO 时刻（本地钟面）
        "bornCity": "",        # 出生时设备所在城市（未配置位置则为「日落电台」）
        "bornSunset": "",      # 出生那天的日落钟面 —— 出生证明
        "mood": "calm",
        "activity": "home_watch",
        "energy": 100,
        "bond": 0,
        "bondToday": 0,
        "lettersSent": 0,
        "drift": {},            # 神游中：{slug, cityNameZh, sunsetClock, startedTs, endsTs, date}
        "lastDriftDate": "",   # 一天最多神游一次
        "lastInteractionTs": 0,
        "lastLetterAt": "",
        "flags": {},            # 一次性事件去重（如今天已提醒过低电量）
        "today": {"date": "", "events": []},
    }


def _coerce(state):
    base = default_state()
    if not isinstance(state, dict):
        return base
    merged = dict(base)
    for key, fallback in base.items():
        value = state.get(key, fallback)
        merged[key] = value if isinstance(value, type(fallback)) else fallback
    if merged["mood"] not in MOODS:
        merged["mood"] = "calm"
    if merged["activity"] not in ACTIVITY_ZH:
        merged["activity"] = "home_watch"
    merged["energy"] = max(0, min(100, int(merged.get("energy") or 0)))
    events = merged["today"].get("events")
    merged["today"]["events"] = list(events)[-TODAY_EVENT_LIMIT:] if isinstance(events, list) else []
    merged["today"]["date"] = str(merged["today"].get("date") or "")
    return merged


def load_pet_state(path=PET_STATE_PATH):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return _coerce(json.load(handle))
    except (OSError, json.JSONDecodeError):
        return default_state()


def save_pet_state(state, path=PET_STATE_PATH):
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(_coerce(state), handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        return True
    except OSError:
        return False


def _local_now(now_utc_ts, tz_offset_hours):
    return datetime.fromtimestamp(now_utc_ts, tz=timezone.utc) + timedelta(hours=float(tz_offset_hours or 0))


def local_date_str(now_utc_ts, tz_offset_hours):
    return _local_now(now_utc_ts, tz_offset_hours).strftime("%Y-%m-%d")


def local_clock_str(now_utc_ts, tz_offset_hours):
    return _local_now(now_utc_ts, tz_offset_hours).strftime("%H:%M")


def local_hour(now_utc_ts, tz_offset_hours):
    moment = _local_now(now_utc_ts, tz_offset_hours)
    return moment.hour + moment.minute / 60.0


def ensure_today(state, now_utc_ts, tz_offset_hours):
    """跨天翻页：时间线清空、当日亲密度上限复位、一次性标记复位。"""
    today = local_date_str(now_utc_ts, tz_offset_hours)
    if state["today"].get("date") != today:
        state["today"] = {"date": today, "events": []}
        state["bondToday"] = 0
        state["flags"] = {}
    return state


def record_event(state, kind, text, now_utc_ts, tz_offset_hours):
    ensure_today(state, now_utc_ts, tz_offset_hours)
    events = state["today"]["events"]
    events.append({"t": local_clock_str(now_utc_ts, tz_offset_hours), "kind": str(kind), "text": str(text)})
    state["today"]["events"] = events[-TODAY_EVENT_LIMIT:]
    return state


def note_interaction(state, kind, now_utc_ts, tz_offset_hours, bond_gain=1):
    """一次互动：亲密度 +bond_gain（每日封顶），并刷新「最近有人陪」时刻。"""
    ensure_today(state, now_utc_ts, tz_offset_hours)
    state["lastInteractionTs"] = int(now_utc_ts)
    gain = max(0, min(int(bond_gain), DAILY_BOND_CAP - int(state.get("bondToday") or 0)))
    if gain:
        state["bond"] = int(state.get("bond") or 0) + gain
        state["bondToday"] = int(state.get("bondToday") or 0) + gain
    return state


def ensure_born(state, now_utc_ts, tz_offset_hours, city="", sunset_clock=""):
    """首次开机即出生：绑定一次真实日落。出生地未配置就记「日落电台」。"""
    if state.get("bornAt"):
        return state, False
    state["bornAt"] = _local_now(now_utc_ts, tz_offset_hours).strftime("%Y-%m-%dT%H:%M")
    state["bornCity"] = str(city or "日落电台")
    state["bornSunset"] = str(sunset_clock or "")
    record_event(state, "born", f"破壳了，出生在{state['bornCity']}的日落里", now_utc_ts, tz_offset_hours)
    return state, True


def days_alive(state, now_utc_ts, tz_offset_hours):
    born = str(state.get("bornAt") or "")
    if not born:
        return 0
    try:
        born_date = datetime.strptime(born[:10], "%Y-%m-%d").date()
    except ValueError:
        return 0
    today = _local_now(now_utc_ts, tz_offset_hours).date()
    return max(0, (today - born_date).days) + 1  # 出生当天算第 1 天


def begin_drift(state, destination, now_utc_ts, tz_offset_hours, duration_min):
    """出发神游：目的地来自 sunset_skill 的日落事件（此刻正在天黑的那座城）。"""
    destination = destination or {}
    ends = int(now_utc_ts) + max(1, int(duration_min)) * 60
    state["activity"] = "dusk_drift"
    state["mood"] = "drifting"
    state["drift"] = {
        "slug": str(destination.get("slug") or ""),
        "cityNameZh": str(destination.get("cityNameZh") or "远方"),
        "sunsetClock": str(destination.get("cityLocalSunsetClock") or ""),
        "startedTs": int(now_utc_ts),
        "endsTs": ends,
        "date": local_date_str(now_utc_ts, tz_offset_hours),
    }
    state["lastDriftDate"] = state["drift"]["date"]
    record_event(
        state,
        "drift_start",
        f"黄昏了，出神去了{state['drift']['cityNameZh']}（当地 {state['drift']['sunsetClock'] or '日落'}）",
        now_utc_ts,
        tz_offset_hours,
    )
    return state


def end_drift(state, now_utc_ts, tz_offset_hours):
    city = str((state.get("drift") or {}).get("cityNameZh") or "远方")
    state["activity"] = "home_watch"
    state["mood"] = "calm"
    state["drift"] = {}
    record_event(state, "drift_end", f"从{city}回来了", now_utc_ts, tz_offset_hours)
    return state, city


def public_snapshot(state, now_utc_ts, tz_offset_hours):
    """给 /api/pi-pet 的对外快照：只暴露前端要画的字段。"""
    drift = dict(state.get("drift") or {})
    drift_view = None
    if state.get("activity") == "dusk_drift" and drift:
        drift_view = {
            "slug": drift.get("slug") or "",
            "cityNameZh": drift.get("cityNameZh") or "",
            "sunsetClock": drift.get("sunsetClock") or "",
            "remainingMin": max(0, int(round((int(drift.get("endsTs") or 0) - now_utc_ts) / 60.0))),
        }
    return {
        "mood": state.get("mood") or "calm",
        "moodZh": MOOD_ZH.get(state.get("mood") or "calm", "安然"),
        "activity": state.get("activity") or "home_watch",
        "activityZh": ACTIVITY_ZH.get(state.get("activity") or "home_watch", "在家守光"),
        "energy": int(state.get("energy") or 0),
        "bond": int(state.get("bond") or 0),
        "lettersSent": int(state.get("lettersSent") or 0),
        "daysAlive": days_alive(state, now_utc_ts, tz_offset_hours),
        "bornAt": state.get("bornAt") or "",
        "bornCity": state.get("bornCity") or "",
        "bornSunset": state.get("bornSunset") or "",
        "drift": drift_view,
        "today": {
            "date": state["today"].get("date") or "",
            "events": list(state["today"].get("events") or []),
        },
    }


def pet_summary_line(state, now_utc_ts, tz_offset_hours):
    """给语音/屏幕的一句话状态：问「崽崽怎么样」时的回答。"""
    snapshot = public_snapshot(state, now_utc_ts, tz_offset_hours)
    if snapshot["drift"]:
        where = snapshot["drift"]["cityNameZh"]
        return f"它正神游在{where}，大约 {snapshot['drift']['remainingMin']} 分钟后回来。"
    mood = snapshot["moodZh"]
    energy = snapshot["energy"]
    if snapshot["activity"] == "sleeping":
        return f"它睡着了，电量 {energy}%。今天是它来到你身边的第 {snapshot['daysAlive']} 天。"
    return f"它现在{mood}，电量 {energy}%，已经陪你 {snapshot['daysAlive']} 天，寄过 {snapshot['lettersSent']} 封信。"
