#!/usr/bin/env python3
import calendar
import json
import os
import sys
import time

from ambient_memory import memory_report
from ambient_mode import ambient_mode_message, load_ambient_mode
from ambient_observer import load_ambient_state

POLICY_PATH = os.environ.get(
    "SUNSET_AMBIENT_POLICY_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "ambient-policy.json"),
)
POLICY_TTL_SEC = int(os.environ.get("SUNSET_AMBIENT_POLICY_TTL_SEC", "1800"))
POLICY_COOLDOWN_SEC = int(os.environ.get("SUNSET_AMBIENT_POLICY_COOLDOWN_SEC", "900"))
POLICY_CONFIRM_MIN_USABLE = int(os.environ.get("SUNSET_AMBIENT_POLICY_CONFIRM_MIN_USABLE", "2"))
POLICY_CONFIDENCE_FLOOR = float(os.environ.get("SUNSET_AMBIENT_POLICY_CONFIDENCE_FLOOR", "0.6"))

DEFAULT_ADJUSTMENT = {
    "energyDelta": 0.0,
    "vocalRatioHint": 0.5,
    "instrumentalPreference": 0.5,
    "transitionSpeed": "steady",
}


def now_iso(now=None):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now if now is not None else time.time()))


def parse_iso_seconds(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return calendar.timegm(time.strptime(text, "%Y-%m-%dT%H:%M:%SZ"))
    except ValueError:
        return None


def state_age_sec(state, now=None):
    updated_at = parse_iso_seconds((state or {}).get("updatedAt"))
    if updated_at is None:
        return None
    now = int(now if now is not None else time.time())
    return max(0, now - updated_at)


def policy_age_sec(policy, now=None):
    updated_at = parse_iso_seconds((policy or {}).get("policyUpdatedAt"))
    if updated_at is None:
        return None
    now = int(now if now is not None else time.time())
    return max(0, now - updated_at)


def cooldown_source_updated_at(policy):
    policy = policy if isinstance(policy, dict) else {}
    action = policy.get("action") or ""
    if policy.get("ok") and action == "modulate_next_block":
        return policy.get("policyUpdatedAt") or ""
    if action == "hold_cooldown":
        cooldown = policy.get("cooldown") if isinstance(policy.get("cooldown"), dict) else {}
        source_action = cooldown.get("sourceAction") or cooldown.get("previousAction") or ""
        if source_action == "modulate_next_block":
            return cooldown.get("sourcePolicyUpdatedAt") or cooldown.get("previousPolicyUpdatedAt") or ""
    return ""


def cooldown_source_age_sec(policy, now=None):
    updated_at = parse_iso_seconds(cooldown_source_updated_at(policy))
    if updated_at is None:
        return None
    now = int(now if now is not None else time.time())
    return max(0, now - updated_at)


def clamp(value, low, high):
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    return max(low, min(high, number))


def normalized_adjustment(raw):
    raw = raw if isinstance(raw, dict) else {}
    transition = str(raw.get("transitionSpeed") or DEFAULT_ADJUSTMENT["transitionSpeed"])
    if transition not in {"slow", "steady", "quick"}:
        transition = "steady"
    return {
        "energyDelta": clamp(raw.get("energyDelta"), -0.2, 0.2),
        "vocalRatioHint": clamp(raw.get("vocalRatioHint", DEFAULT_ADJUSTMENT["vocalRatioHint"]), 0.0, 1.0),
        "instrumentalPreference": clamp(raw.get("instrumentalPreference", DEFAULT_ADJUSTMENT["instrumentalPreference"]), 0.0, 1.0),
        "transitionSpeed": transition,
    }


def normalized_memory_report(memory=None):
    if isinstance(memory, dict) and "usableCount" in memory:
        report = memory
    else:
        report = memory_report(memory) if isinstance(memory, dict) else memory_report()
    return {
        "count": int(report.get("count") or 0),
        "usableCount": int(report.get("usableCount") or 0),
        "blockedCount": int(report.get("blockedCount") or 0),
        "dominantLight": report.get("dominantLight") or "unknown",
        "dominantActivity": report.get("dominantActivity") or "unknown",
        "lightTrend": report.get("lightTrend") or "unknown",
    }


def apply_memory_trend(adjustment, memory):
    adjustment = dict(normalized_adjustment(adjustment))
    if int(memory.get("usableCount") or 0) < 2:
        return adjustment
    trend = str(memory.get("lightTrend") or "unknown")
    if trend == "dimming":
        adjustment["energyDelta"] -= 0.04
        adjustment["vocalRatioHint"] -= 0.04
        adjustment["instrumentalPreference"] += 0.08
        if adjustment.get("transitionSpeed") == "steady":
            adjustment["transitionSpeed"] = "slow"
    elif trend == "brightening":
        adjustment["energyDelta"] += 0.04
        adjustment["vocalRatioHint"] += 0.04
        adjustment["instrumentalPreference"] -= 0.04
    return normalized_adjustment(adjustment)


def evaluate_state_confirmation(state, memory, mode_state):
    mode = (mode_state or {}).get("mode") or "adaptive"
    confidence = clamp((state or {}).get("confidence", 0.0), 0.0, 1.0)
    usable_count = int((memory or {}).get("usableCount") or 0)
    state_light = str((state or {}).get("light") or "unknown")
    dominant_light = str((memory or {}).get("dominantLight") or "unknown")
    light_agrees = state_light == "unknown" or dominant_light == "unknown" or state_light == dominant_light
    if mode == "scan_once":
        return {
            "ok": True,
            "reason": "用户主动扫描，此次观察可用于下一段轻调。",
            "confidence": confidence,
            "usableCount": usable_count,
            "lightAgrees": light_agrees,
        }
    if confidence >= POLICY_CONFIDENCE_FLOOR:
        return {
            "ok": True,
            "reason": "环境信号置信度足够，可以进入下一段轻调。",
            "confidence": confidence,
            "usableCount": usable_count,
            "lightAgrees": light_agrees,
        }
    if usable_count >= POLICY_CONFIRM_MIN_USABLE and light_agrees:
        return {
            "ok": True,
            "reason": "短时记忆里的环境趋势一致，可以进入下一段轻调。",
            "confidence": confidence,
            "usableCount": usable_count,
            "lightAgrees": light_agrees,
        }
    return {
        "ok": False,
        "reason": "环境信号还需要再确认一次，避免一次识别就改节目。",
        "confidence": confidence,
        "usableCount": usable_count,
        "lightAgrees": light_agrees,
    }


def infer_adjustment(state):
    raw = state.get("radioAdjustment")
    if isinstance(raw, dict):
        return normalized_adjustment(raw)

    light = str(state.get("light") or "unknown")
    activity = str(state.get("activity") or "unknown")
    adjustment = dict(DEFAULT_ADJUSTMENT)
    if light in {"dark", "dim"}:
        adjustment["energyDelta"] -= 0.08
        adjustment["instrumentalPreference"] += 0.18
        adjustment["transitionSpeed"] = "slow"
    if activity in {"working", "still"}:
        adjustment["energyDelta"] -= 0.06
        adjustment["vocalRatioHint"] -= 0.18
        adjustment["instrumentalPreference"] += 0.2
    if activity in {"social", "moving"}:
        adjustment["energyDelta"] += 0.08
        adjustment["vocalRatioHint"] += 0.1
    return normalized_adjustment(adjustment)


def cooldown_hold_policy(base, previous_policy, source_age_sec):
    return {
        **base,
        "ok": False,
        "action": "hold_cooldown",
        "message": "环境DJ 会先保持 24H 主线；刚刚调整过下一段，稍后再看。",
        "reason": "避免环境变化过于频繁地改变节目。",
        "adjustment": normalized_adjustment((previous_policy or {}).get("adjustment") or DEFAULT_ADJUSTMENT),
        "cooldown": {
            **base.get("cooldown", {}),
            "active": True,
            "remainingSec": max(0, POLICY_COOLDOWN_SEC - int(source_age_sec or 0)),
        },
    }


def build_ambient_policy(state=None, memory=None, mode_state=None, previous_policy=None, now=None):
    now = int(now if now is not None else time.time())
    state = state if isinstance(state, dict) else load_ambient_state()
    memory_context = normalized_memory_report(memory)
    mode_context = mode_state if isinstance(mode_state, dict) else load_ambient_mode()
    previous_context = previous_policy if isinstance(previous_policy, dict) else load_ambient_policy()
    previous_age_sec = policy_age_sec(previous_context, now)
    source_updated_at = cooldown_source_updated_at(previous_context)
    source_age_sec = cooldown_source_age_sec(previous_context, now)
    cooldown_active = bool(source_age_sec is not None and source_age_sec < POLICY_COOLDOWN_SEC)
    age_sec = state_age_sec(state, now)
    is_stale = age_sec is None or age_sec > POLICY_TTL_SEC
    base = {
        "mode": "ambient_dj",
        "ambientMode": mode_context,
        "applyAt": "next_block",
        "canInterrupt": False,
        "directPlayerControl": False,
        "policyUpdatedAt": now_iso(now),
        "stateUpdatedAt": state.get("updatedAt") or "",
        "stateAgeSec": age_sec,
        "ttlSec": POLICY_TTL_SEC,
        "isStale": is_stale,
        "programRole": "24H 主线优先，环境只调下一段节目",
        "privacy": state.get("privacy") or {},
        "ambientMemory": memory_context,
        "cooldown": {
            "seconds": POLICY_COOLDOWN_SEC,
            "active": False,
            "remainingSec": 0,
            "previousAction": previous_context.get("action") or "",
            "previousPolicyUpdatedAt": previous_context.get("policyUpdatedAt") or "",
            "previousAgeSec": previous_age_sec,
            "sourceAction": "modulate_next_block" if source_updated_at else "",
            "sourcePolicyUpdatedAt": source_updated_at,
            "sourceAgeSec": source_age_sec,
        },
    }
    if mode_context.get("mode") == "classic":
        return {
            **base,
            "ok": False,
            "action": "hold_program",
            "message": ambient_mode_message(mode_context),
            "reason": "用户选择原声电台模式，环境状态不参与调音。",
            "adjustment": DEFAULT_ADJUSTMENT,
        }
    if not state:
        return {
            **base,
            "ok": False,
            "action": "wait_for_state",
            "message": "环境DJ 还没有观察状态；先说“环境感知”或“扫描此刻”。",
            "reason": "还没有可用的环境状态。",
            "adjustment": DEFAULT_ADJUSTMENT,
        }
    if not state.get("ok"):
        return {
            **base,
            "ok": False,
            "action": "hold_program",
            "message": "环境DJ 会先保持 24H 主线；等相机识别后再调下一段。",
            "reason": state.get("blockedReason") or state.get("summary") or "环境状态还没准备好。",
            "updatedAt": state.get("updatedAt"),
            "camera": state.get("camera") or {},
            "adjustment": DEFAULT_ADJUSTMENT,
        }
    if is_stale:
        return {
            **base,
            "ok": False,
            "action": "wait_for_fresh_state",
            "message": "环境DJ 会先保持 24H 主线；上次观察已过期。",
            "reason": "环境状态超过有效期，避免用旧场景调下一段节目。",
            "updatedAt": state.get("updatedAt"),
            "camera": state.get("camera") or {},
            "adjustment": DEFAULT_ADJUSTMENT,
        }
    if cooldown_active:
        return cooldown_hold_policy(base, previous_context, source_age_sec)

    evaluation = evaluate_state_confirmation(state, memory_context, mode_context)
    base["evaluation"] = evaluation
    if not evaluation.get("ok"):
        return {
            **base,
            "ok": False,
            "action": "hold_evaluate",
            "message": "环境DJ 会先保持 24H 主线；等环境信号再确认一次。",
            "reason": evaluation.get("reason") or "避免一次识别就改节目。",
            "updatedAt": state.get("updatedAt"),
            "camera": state.get("camera") or {},
            "adjustment": DEFAULT_ADJUSTMENT,
        }

    adjustment = apply_memory_trend(infer_adjustment(state), memory_context)
    tags = state.get("tags") if isinstance(state.get("tags"), list) else []
    reason = state.get("reason") or state.get("scene") or state.get("summary") or "根据当前空间状态微调。"
    return {
        **base,
        "ok": True,
        "action": "modulate_next_block",
        "message": "环境DJ 会在下一段节目里微调能量、人声比例和转场速度。",
        "reason": str(reason)[:160],
        "updatedAt": state.get("updatedAt"),
        "scene": state.get("scene") or state.get("summary") or "",
        "light": state.get("light") or "unknown",
        "activity": state.get("activity") or "unknown",
        "tags": [str(tag)[:24] for tag in tags[:5]],
        "confidence": clamp(state.get("confidence", 0.0), 0.0, 1.0),
        "adjustment": adjustment,
    }


def load_ambient_policy(path=POLICY_PATH):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


def save_ambient_policy(policy=None, path=POLICY_PATH):
    policy = policy if isinstance(policy, dict) else build_ambient_policy()
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(policy, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return policy


def ambient_policy_message(policy=None):
    policy = policy if isinstance(policy, dict) else build_ambient_policy()
    if not policy.get("ok"):
        return policy.get("message") or "环境DJ 先保持 24H 主线。"
    adj = policy.get("adjustment") or {}
    energy = float(adj.get("energyDelta") or 0.0)
    energy_text = "更安静" if energy < -0.03 else "更明亮" if energy > 0.03 else "保持平衡"
    instrumental = float(adj.get("instrumentalPreference") or 0.5)
    texture_text = "偏器乐" if instrumental >= 0.65 else "保留人声" if instrumental <= 0.35 else "人声适中"
    speed = str(adj.get("transitionSpeed") or "steady")
    speed_text = {"slow": "慢转场", "steady": "稳转场", "quick": "快转场"}.get(speed, "稳转场")
    trend = str((policy.get("ambientMemory") or {}).get("lightTrend") or "unknown")
    trend_text = {"dimming": "跟随变暗", "brightening": "跟随变亮"}.get(trend, "")
    tail = f" · {trend_text}" if trend_text else ""
    return f"下一段：{energy_text} · {texture_text} · {speed_text}{tail}。"


def main():
    policy = save_ambient_policy()
    if "--message" in sys.argv[1:]:
        print(ambient_policy_message(policy))
    else:
        print(json.dumps(policy, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
