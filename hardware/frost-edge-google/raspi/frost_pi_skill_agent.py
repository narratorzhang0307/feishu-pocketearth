#!/usr/bin/env python3
"""Privacy-safe Gemma skill router for the Pocket Earth Frost Edge Node.

Clear commands use deterministic keywords. Ambiguous local requests may be
routed by the loopback Google Gemma service, and every model decision is still
validated against the fixed registry. This module stores no cloud key and never
invents facts for a public knowledge event.
"""

from __future__ import annotations

import json
import re
import sys


BRIDGE_VERSION = "0.1.0"
SECRET_RE = re.compile(
    r"PRIVATE_KEY|API_KEY|ACCESS_TOKEN|PASSWORD|SECRET|TOKEN|\bBearer\s+[A-Za-z0-9._-]+",
    re.I,
)
SAFE_EVENT_KEYS = {
    "version", "kind", "source", "state", "priority", "title", "body", "speak",
    "sourceUrls", "truthScore", "verdict", "track", "city", "createdAt",
}


def _text(value, limit=180):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _assert_public_event(event):
    extra = set(event) - SAFE_EVENT_KEYS
    if extra:
        raise ValueError(f"unsupported hardware event keys: {sorted(extra)}")
    if SECRET_RE.search(json.dumps(event, ensure_ascii=False)):
        raise ValueError("hardware event must not contain credentials")


def _const(command):
    return lambda args=None: command


SKILLS = [
    {"name": "next_track", "desc": "skip to the next radio or podcast item", "patterns": [r"下一首|下一条|换一首|换歌|跳过|skip|next"], "to_command": _const("下一首")},
    {"name": "prev_track", "desc": "return to the previous item", "patterns": [r"上一首|上一条|刚才那条|previous|prev|back"], "to_command": _const("上一首")},
    {"name": "pause", "desc": "pause current local playback", "patterns": [r"暂停|停一下|别播了|别放了|安静|pause|stop"], "to_command": _const("暂停")},
    {"name": "replay", "desc": "replay the current local item", "patterns": [r"重播|再播一遍|从头|repeat|replay"], "to_command": _const("重播")},
    {"name": "volume_up", "desc": "increase local hardware volume", "patterns": [r"大声点|听不清|louder|volume\s*up"], "to_command": _const("声音大一点")},
    {"name": "volume_down", "desc": "decrease local hardware volume", "patterns": [r"小声点|轻一点|quieter|softer|volume\s*down"], "to_command": _const("声音小一点")},
    {"name": "open_podcast", "desc": "open Pocket Podcast mode", "patterns": [r"口袋播客|播客模式|今日播客|podcast"], "to_command": _const("口袋播客")},
    {"name": "open_earth_answer", "desc": "open the local Earth Answer card", "patterns": [r"地球答案|今日答案|answer card"], "to_command": _const("地球答案")},
    {"name": "music_now_playing", "desc": "show the current public radio item", "patterns": [r"现在.*(播|放|听)|播什么|哪首|now playing|current track"], "event": "music_now_playing"},
    {"name": "public_knowledge", "desc": "show one already verified public knowledge brief", "patterns": [r"公共知识|今日知识|新闻核验|事实核验|knowledge brief"], "event": "public_knowledge_brief"},
    {"name": "help", "desc": "list the local Frost Edge abilities", "patterns": [r"帮助|怎么用|能做什么|技能|help|commands?"], "to_command": _const("帮助")},
]

SKILL_BY_NAME = {skill["name"]: skill for skill in SKILLS}
SKILL_SYSTEM = (
    "Route a Frost Edge request to exactly one registered skill. Return JSON "
    '{"skill":"name-or-none","args":{},"reply":"short zh"}. '
    "Do not add facts, URLs or new skills.\n"
    + "\n".join(f"- {skill['name']}: {skill['desc']}" for skill in SKILLS)
)


def _parse_json(raw):
    if isinstance(raw, dict):
        return raw
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            return {}
        try:
            return json.loads(match.group(0))
        except (TypeError, ValueError):
            return {}


def validate_decision(decision):
    if not isinstance(decision, dict):
        return {"skill": "none", "args": {}, "reply": ""}
    name = str(decision.get("skill") or "none").strip()
    reply = _text(decision.get("reply"), 90)
    if name == "none" or name not in SKILL_BY_NAME:
        return {"skill": "none", "args": {}, "reply": reply}
    args = decision.get("args") if isinstance(decision.get("args"), dict) else {}
    return {"skill": name, "args": dict(args), "reply": reply}


def keyword_fallback(text):
    value = str(text or "")
    for skill in SKILLS:
        if any(re.search(pattern, value, re.I) for pattern in skill.get("patterns", [])):
            return {"skill": skill["name"], "args": {}, "reply": ""}
    return {"skill": "none", "args": {}, "reply": ""}


def decide(text, brain_fn=None):
    value = str(text or "").strip()
    if not value:
        return {"skill": "none", "args": {}, "reply": ""}
    keyword = validate_decision(keyword_fallback(value))
    if keyword["skill"] != "none":
        return keyword
    if brain_fn is None:
        try:
            from frost_pi_gemma import brain as brain_fn
        except ImportError:
            brain_fn = None
    if brain_fn:
        try:
            decision = validate_decision(_parse_json(brain_fn(SKILL_SYSTEM, value)))
            if decision["skill"] != "none":
                return decision
        except Exception:
            pass
    return {"skill": "none", "args": {}, "reply": ""}


def create_music_event(context=None):
    context = context or {}
    track = context.get("track") if isinstance(context.get("track"), dict) else {}
    title = _text(context.get("title") or track.get("title") or "Frost Radio")
    artist = _text(context.get("artist") or track.get("artist") or "music-agent")
    city = _text(context.get("city") or track.get("city") or "口袋地球")
    event = {
        "version": BRIDGE_VERSION,
        "kind": "music_now_playing",
        "source": "music-agent",
        "state": "busy",
        "priority": "normal",
        "title": title,
        "body": _text(f"{artist} · {city}"),
        "speak": _text(context.get("speak") or f"Frost 正在播放 {title}，来自 {city}。", 120),
        "track": {"title": title, "artist": artist, "city": city},
        "createdAt": context.get("createdAt") or "2026-07-19T00:00:00.000Z",
    }
    _assert_public_event(event)
    return event


def create_public_knowledge_event(context=None):
    context = context or {}
    urls = [
        _text(item, 240) for item in context.get("sourceUrls", [])
        if str(item).startswith("https://")
    ][:4]
    if len(urls) < 2:
        raise ValueError("public knowledge brief requires two HTTPS sources")
    verdict = _text(context.get("verdict") or "review_required", 40)
    if verdict not in {"review_required", "insufficient"}:
        raise ValueError("hardware brief cannot claim automatic approval")
    event = {
        "version": BRIDGE_VERSION,
        "kind": "public_knowledge_brief",
        "source": "pocket-earth-google-knowledge",
        "state": "attention",
        "priority": "normal",
        "title": _text(context.get("title") or "已核验公共知识"),
        "body": _text(context.get("body") or "请在文字模式查看完整来源。", 220),
        "speak": _text(context.get("speak") or context.get("body") or "有一条公共知识等待你复核。", 160),
        "sourceUrls": urls,
        "truthScore": max(0, min(100, int(context.get("truthScore") or 0))),
        "verdict": verdict,
        "createdAt": context.get("createdAt") or "2026-07-19T00:00:01.000Z",
    }
    _assert_public_event(event)
    return event


def route(text, brain_fn=None, context=None):
    decision = decide(text, brain_fn=brain_fn)
    name = decision["skill"]
    if name == "none":
        return {"ok": False, "skill": "none", "type": "none", "reply": decision.get("reply", "")}
    skill = SKILL_BY_NAME[name]
    if "to_command" in skill:
        return {"ok": True, "skill": name, "type": "command", "command": skill["to_command"](decision.get("args") or {}), "reply": decision.get("reply", "")}
    try:
        event = create_music_event(context) if skill.get("event") == "music_now_playing" else create_public_knowledge_event(context)
    except ValueError as exc:
        return {"ok": False, "skill": name, "type": "none", "reply": str(exc)}
    return {"ok": True, "skill": name, "type": "event", "event": event, "reply": decision.get("reply", "")}


def to_json_line(result):
    if result.get("type") != "event":
        raise ValueError("only event results can be serialized as JSONL")
    _assert_public_event(result["event"])
    return json.dumps(result["event"], ensure_ascii=False, separators=(",", ":")) + "\n"


def apply(text, post_command_fn=None, emit_event_fn=None, brain_fn=None, context=None):
    result = route(text, brain_fn=brain_fn, context=context)
    if not result.get("ok"):
        return False
    if result["type"] == "command" and post_command_fn:
        post_command_fn(result["command"])
    if result["type"] == "event" and emit_event_fn:
        emit_event_fn(result["event"])
    return True


if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) or "帮助"
    print(json.dumps(route(query), ensure_ascii=False, indent=2))
