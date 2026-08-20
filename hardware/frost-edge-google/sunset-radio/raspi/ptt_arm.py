#!/usr/bin/env python3
"""长按橙色键触发它：开一个"听写窗"。

只做两件轻事：写一个到期时间戳文件（voice_agent 会读它——这段时间里你说的话不用喊
唤醒词，直接被当命令执行），并把"在听…"推到屏幕/PWA 给你个反馈。它**不录音、不抢麦克风**
（录音一直是 voice_agent 那个进程在做），所以和现有语音链路零冲突。
"""
import json
import os
import time
import urllib.request

TTL = float(os.environ.get("SUNSET_PTT_TTL_SEC", "20") or 20)
ARM_PATH = os.environ.get(
    "SUNSET_PTT_ARM_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "voice-ptt-arm"),
)
API = os.environ.get("SUNSET_API", "http://127.0.0.1:8080").rstrip("/")


def arm(ttl=TTL):
    directory = os.path.dirname(ARM_PATH)
    if directory:
        os.makedirs(directory, exist_ok=True)
    expiry = time.time() + max(1.0, ttl)
    tmp = f"{ARM_PATH}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(str(expiry))
    os.replace(tmp, ARM_PATH)
    return expiry


def publish_listening(seconds):
    payload = json.dumps({
        "status": "listening",
        "label": "在听",
        "city": "语音听写",
        "track": "长按说话",
        "message": f"在听… 直接说，不用喊唤醒词（约{int(seconds)}秒）。",
    }, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{API}/api/pi-state",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            response.read()
    except Exception:
        pass


def main():
    expiry = arm()
    publish_listening(TTL)
    print(f"[ptt] armed until {expiry:.0f} (ttl={TTL:.0f}s) path={ARM_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
