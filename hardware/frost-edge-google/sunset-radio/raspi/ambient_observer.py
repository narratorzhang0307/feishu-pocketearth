#!/usr/bin/env python3
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

from ambient_memory import remember_ambient_state
from camera_status import camera_message, collect_camera_status


API_BASE = os.environ.get("SUNSET_API", "http://127.0.0.1:8080").rstrip("/")
CAPTURE_DIR = os.environ.get("SUNSET_AMBIENT_CAPTURE_DIR", "/tmp/sunset-radio-ambient")
STATE_PATH = os.environ.get(
    "SUNSET_AMBIENT_STATE_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "ambient-state.json"),
)
PRIVACY_POLICY = {
    "capture": "manual_only",
    "imageRetention": "deleted_after_analysis",
    "localSignals": "brightness_only",
    "identity": "not_used",
    "emotion": "not_inferred",
}

VISION_PROMPT = """你是 Sunset Radio 的环境DJ感知 skill。
只观察房间和光线，不识别身份，不推断脸部情绪。
请返回 JSON：
{
  "scene": "一句自然中文场景摘要",
  "light": "dark|dim|normal|bright|unknown",
  "activity": "empty|still|working|social|moving|unknown",
  "tags": ["最多5个环境标签"],
  "radioAdjustment": {
    "energyDelta": -0.2 到 0.2,
    "vocalRatioHint": 0 到 1,
    "instrumentalPreference": 0 到 1,
    "transitionSpeed": "slow|steady|quick"
  },
  "confidence": 0 到 1,
  "reason": "给用户看的简短原因"
}
不要输出 JSON 以外的文字。"""


def run(args, timeout=10):
    try:
        return subprocess.run(
            args,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(args, 127, "", str(exc))


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_ambient_state(path=STATE_PATH):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


def parse_json_text(text):
    text = str(text or "").strip()
    if not text:
        return {}
    if text.startswith("```"):
        text = text.strip("`")
        text = re.sub(r"^json\s*", "", text, flags=re.I).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def safe_float(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def normalized_adjustment(value):
    value = value if isinstance(value, dict) else {}
    transition = str(value.get("transitionSpeed") or "steady")
    if transition not in {"slow", "steady", "quick"}:
        transition = "steady"
    return {
        "energyDelta": max(-0.2, min(0.2, safe_float(value.get("energyDelta")))),
        "vocalRatioHint": max(0.0, min(1.0, safe_float(value.get("vocalRatioHint")))),
        "instrumentalPreference": max(0.0, min(1.0, safe_float(value.get("instrumentalPreference")))),
        "transitionSpeed": transition,
    }


def normalized_tags(value):
    if not isinstance(value, list):
        return []
    return [str(tag)[:24] for tag in value[:5]]


def light_from_brightness(value):
    brightness = safe_float(value, 0.0)
    if brightness < 0.18:
        return "dark"
    if brightness < 0.38:
        return "dim"
    if brightness > 0.78:
        return "bright"
    return "normal"


def image_signals(path):
    try:
        from PIL import Image, ImageStat

        with Image.open(path) as image:
            gray = image.convert("L")
            stat = ImageStat.Stat(gray)
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:120]}

    brightness = max(0.0, min(1.0, safe_float(stat.mean[0]) / 255.0))
    contrast = max(0.0, min(1.0, safe_float(stat.stddev[0]) / 255.0))
    light = light_from_brightness(brightness)
    tags = ["室内光线"]
    if light in {"dark", "dim"}:
        tags.append("低光")
    if contrast < 0.08:
        tags.append("稳定画面")
    return {
        "ok": True,
        "brightness": round(brightness, 3),
        "contrast": round(contrast, 3),
        "light": light,
        "activity": "unknown",
        "tags": tags[:5],
    }


def signal_adjustment(signals):
    light = str((signals or {}).get("light") or "unknown")
    adjustment = {
        "energyDelta": 0.0,
        "vocalRatioHint": 0.5,
        "instrumentalPreference": 0.5,
        "transitionSpeed": "steady",
    }
    if light == "dark":
        adjustment.update({
            "energyDelta": -0.14,
            "vocalRatioHint": 0.34,
            "instrumentalPreference": 0.78,
            "transitionSpeed": "slow",
        })
    elif light == "dim":
        adjustment.update({
            "energyDelta": -0.08,
            "vocalRatioHint": 0.42,
            "instrumentalPreference": 0.68,
            "transitionSpeed": "slow",
        })
    elif light == "bright":
        adjustment.update({
            "energyDelta": 0.06,
            "vocalRatioHint": 0.56,
            "instrumentalPreference": 0.46,
            "transitionSpeed": "steady",
        })
    return normalized_adjustment(adjustment)


def signal_scene(signals):
    light = str((signals or {}).get("light") or "unknown")
    labels = {
        "dark": "空间光线很暗",
        "dim": "空间光线偏暗",
        "normal": "空间光线平稳",
        "bright": "空间光线明亮",
    }
    return labels.get(light, "空间光线暂不确定")


def state_from_report(report):
    camera = report.get("camera") or {}
    vision = report.get("vision") or {}
    signals = report.get("signals") or {}
    parsed = parse_json_text(vision.get("text") or "")
    state = {
        "updatedAt": now_iso(),
        "ok": bool(report.get("ok")),
        "stage": report.get("stage") or "unknown",
        "summary": ambient_summary(report),
        "camera": {
            "available": bool(camera.get("available")),
            "model": camera.get("model") or "",
        },
        "privacy": PRIVACY_POLICY,
    }
    if signals.get("ok"):
        state["signals"] = {
            "brightness": signals.get("brightness"),
            "contrast": signals.get("contrast"),
            "light": signals.get("light") or "unknown",
            "activity": signals.get("activity") or "unknown",
        }
    if parsed:
        state.update({
            "scene": str(parsed.get("scene") or "")[:120],
            "light": str(parsed.get("light") or "unknown"),
            "activity": str(parsed.get("activity") or "unknown"),
            "tags": normalized_tags(parsed.get("tags")),
            "radioAdjustment": normalized_adjustment(parsed.get("radioAdjustment")),
            "confidence": max(0.0, min(1.0, safe_float(parsed.get("confidence")))),
            "reason": str(parsed.get("reason") or "")[:160],
        })
    elif signals.get("ok"):
        scene = signal_scene(signals)
        state.update({
            "scene": scene,
            "light": signals.get("light") or "unknown",
            "activity": signals.get("activity") or "unknown",
            "tags": normalized_tags(signals.get("tags")),
            "radioAdjustment": signal_adjustment(signals),
            "confidence": 0.48,
            "reason": f"{scene}，先按低成本环境信号轻调下一段节目。",
        })
    if not report.get("ok"):
        state["blockedReason"] = str(report.get("message") or "")[:160]
    return state


def save_ambient_state(report, path=STATE_PATH):
    state = state_from_report(report)
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    if should_remember_state(state):
        try:
            remember_ambient_state(state)
        except OSError as exc:
            state["memoryError"] = str(exc)
    return state


def should_remember_state(state):
    stage = str((state or {}).get("stage") or "unknown")
    if stage == "ready":
        return False
    return bool((state or {}).get("ok") or (state or {}).get("blockedReason"))


def finish_report(report):
    try:
        report["ambientState"] = save_ambient_state(report)
    except OSError as exc:
        report["ambientStateError"] = str(exc)
    return report


def capture_snapshot(status):
    still = (status.get("tools") or {}).get("still")
    if not still:
        return "", "相机拍照工具还没装好。"
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    path = os.path.join(CAPTURE_DIR, f"ambient-{int(time.time())}.jpg")
    result = run([
        still,
        "--nopreview",
        "--timeout",
        "800",
        "--width",
        "640",
        "--height",
        "480",
        "--output",
        path,
    ], timeout=12)
    if result.returncode != 0 or not os.path.exists(path):
        error = (result.stderr or result.stdout or "").strip()[:160]
        return "", f"拍照没有成功：{error or '相机没有返回图片'}"
    return path, ""


def edge_vision(path):
    with open(path, "rb") as handle:
        image = base64.b64encode(handle.read()).decode("ascii")
    payload = json.dumps({
        "task": "vision",
        "image": image,
        "prompt": VISION_PROMPT,
    }, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{API_BASE}/api/edge",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))


def observe_once(capture=False):
    camera = collect_camera_status()
    if not camera.get("available"):
        return finish_report({
            "ok": False,
            "stage": "camera",
            "message": camera_message(camera),
            "camera": camera,
        })
    if not capture:
        return finish_report({
            "ok": True,
            "stage": "ready",
            "message": "相机已就绪；明确说“扫描此刻”时，环境DJ会观察一帧再调下一段节目。",
            "camera": camera,
        })

    path, error = capture_snapshot(camera)
    if error:
        return finish_report({"ok": False, "stage": "capture", "message": error, "camera": camera})
    try:
        signals = image_signals(path)
        try:
            vision = edge_vision(path)
        except Exception as exc:
            if signals.get("ok"):
                return finish_report({
                    "ok": True,
                    "stage": "sensor",
                    "message": "环境DJ 已拿到光线信号，会先轻调下一段节目。",
                    "camera": camera,
                    "signals": signals,
                    "vision": {"error": str(exc)[:120]},
                })
            return finish_report({
                "ok": False,
                "stage": "vision",
                "message": f"视觉理解暂时接不上：{str(exc)[:80]}",
                "camera": camera,
                "signals": signals,
            })
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    text = str(vision.get("text") or "").strip()
    if vision.get("backend") == "stub" or not text:
        if signals.get("ok"):
            return finish_report({
                "ok": True,
                "stage": "sensor",
                "message": "已经拍到一帧；先用光线信号轻调下一段节目。",
                "camera": camera,
                "signals": signals,
                "vision": vision,
            })
        return finish_report({
            "ok": False,
            "stage": "vision",
            "message": "已经拍到一帧，但视觉理解层还没接上。",
            "camera": camera,
            "vision": vision,
        })

    return finish_report({
        "ok": True,
        "stage": "vision",
        "message": "环境DJ 已拿到场景标签，会只调整下一段节目。",
        "camera": camera,
        "signals": signals,
        "vision": vision,
    })


def ambient_summary(report):
    if report.get("ok") and report.get("stage") == "vision":
        text = str((report.get("vision") or {}).get("text") or "").strip()
        return text[:96] or report.get("message")
    if report.get("ok") and report.get("stage") == "sensor":
        signals = report.get("signals") or {}
        return f"{signal_scene(signals)}；环境DJ 只轻调下一段节目。"
    return report.get("message") or "环境DJ 还在待命。"


def main():
    capture = "--capture" in sys.argv[1:]
    report = observe_once(capture=capture)
    report["summary"] = ambient_summary(report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
