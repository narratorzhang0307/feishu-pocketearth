#!/usr/bin/env python3
import json
import os
import sys
import urllib.request

API_BASE = os.environ.get("SUNSET_API", "http://127.0.0.1:8080")


def main():
    text = " ".join(sys.argv[1:]).strip()
    if not text:
        print("usage: send_command.py 切换到东京")
        return 2
    payload = json.dumps({"text": text, "source": os.environ.get("SUNSET_COMMAND_SOURCE", "voice")}).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/api/pi-control",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=4) as response:
        print(response.read().decode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
