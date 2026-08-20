#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request


API_BASE = os.environ.get("SUNSET_API", "http://127.0.0.1:8080").rstrip("/")
WATCHED_SOURCES = ["button", "voice", "smoke", "raspi"]
STALE_MS = int(os.environ.get("SUNSET_QUEUE_STALE_MS", "30000"))


def fetch_json(path, timeout=4):
    with urllib.request.urlopen(f"{API_BASE}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def source_commands(source):
    query = urllib.parse.urlencode({"source": source})
    payload = fetch_json(f"/api/pi-control?{query}")
    commands = payload.get("commands") if isinstance(payload, dict) else []
    return commands if isinstance(commands, list) else []


def all_commands():
    payload = fetch_json("/api/pi-control")
    commands = payload.get("commands") if isinstance(payload, dict) else []
    return commands if isinstance(commands, list) else []


def collect_queue_doctor():
    try:
        state = fetch_json("/api/pi-state").get("state", {})
        commands = all_commands()
        by_source = {}
        for source in WATCHED_SOURCES:
            by_source[source] = source_commands(source)
        api_ok = True
        error = ""
    except (OSError, TimeoutError, urllib.error.URLError, json.JSONDecodeError) as exc:
        state = {}
        commands = []
        by_source = {}
        api_ok = False
        error = str(exc)

    pending = safe_int(state.get("pending"), default=len(commands))
    source_counts = {source: len(items) for source, items in by_source.items()}
    unknown_count = max(0, len(commands) - sum(source_counts.values()))
    stale = [
        summarize_command(command)
        for command in commands
        if safe_int(command.get("ageMs"), 0) >= STALE_MS
    ]
    report = {
        "ok": api_ok and pending == 0 and not commands,
        "checks": {
            "api": api_ok,
            "noPending": pending == 0,
            "noUnclaimedCommands": not commands,
            "noStaleCommands": not stale,
        },
        "pending": pending,
        "unclaimedCount": len(commands),
        "sourceCounts": source_counts,
        "unknownCount": unknown_count,
        "stale": stale[:8],
        "commands": [summarize_command(command) for command in commands[:12]],
        "state": {
            "label": state.get("label"),
            "message": state.get("message"),
            "updatedAt": state.get("updatedAt"),
            "seq": state.get("seq"),
        },
        "error": error,
    }
    report["message"] = queue_doctor_message(report)
    return report


def safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def summarize_command(command):
    return {
        "id": command.get("id"),
        "source": command.get("source"),
        "text": command.get("text"),
        "ageMs": safe_int(command.get("ageMs")),
        "createdAt": command.get("createdAt"),
    }


def queue_doctor_message(report):
    if not report.get("checks", {}).get("api"):
        return "队列接口暂时不可达；稍后复查。"
    if report.get("ok"):
        return "命令队列干净；没有待处理按钮、语音或测试命令。"
    if report.get("stale"):
        sources = ", ".join(sorted({str(item.get("source") or "unknown") for item in report["stale"]}))
        return f"队列里有较久未处理命令，来源：{sources}。"
    counts = report.get("sourceCounts") or {}
    busy = [f"{source}:{count}" for source, count in counts.items() if count]
    if report.get("unknownCount"):
        busy.append(f"unknown:{report['unknownCount']}")
    return f"队列还有待处理命令：{', '.join(busy) or report.get('pending', 0)}。"


def main():
    report = collect_queue_doctor()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
