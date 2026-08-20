#!/usr/bin/env python3
"""Physical Frost Edge Node driver for Whisplay HAT.

The driver sits strictly after the public ``state/tts/display`` action
contract. It never reads cloud credentials, a Pocket Earth profile, or precise location.
It temporarily takes Whisplay foreground focus, renders a public evidence card,
speaks the server-owned sentence, and then gives the screen back to the app that
was already running (for example Sunset Radio).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageFont


WIDTH = 240
HEIGHT = 280
INK = (10, 10, 12)
PAPER = (245, 244, 239)
GOOGLE_GREEN = (0, 244, 139)
KNOWLEDGE_MAGENTA = (255, 20, 199)
MUSIC_BLUE = (30, 202, 255)
MUTED_GREY = (99, 104, 112)

DEFAULT_SNAPSHOT = Path(os.environ.get("FROST_MIRROR_PATH", "/tmp/pocket-earth-edge-live.png"))
DEFAULT_TTS_URL = os.environ.get("FROST_TTS_URL", "http://127.0.0.1:8080/api/pi-tts")
DEFAULT_TTS_MARKER = Path(os.environ.get("FROST_TTS_ACTIVE_PATH", "/tmp/sunset-radio-tts-active"))
DEFAULT_WHISPLAY_RUNTIME = os.environ.get("WHISPLAY_RUNTIME", "/home/pi/Whisplay/runtime")

FONT_REGULAR = (
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)
FONT_BOLD = (
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
)
FONT_MONO = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
)


def _log(message: str) -> None:
    print(f"frost-edge: {message}", file=sys.stderr, flush=True)


@lru_cache(maxsize=32)
def _font(size: int, family: str = "regular"):
    candidates = FONT_BOLD if family == "bold" else FONT_MONO if family == "mono" else FONT_REGULAR
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def cjk_font_status() -> tuple[bool, str]:
    """Return whether the physical evidence-card font has Chinese glyphs."""
    selected = _font(16, "regular")
    path = str(getattr(selected, "path", "PIL-default"))
    try:
        missing = (selected.getmask(chr(0x10FFFF)).size, bytes(selected.getmask(chr(0x10FFFF))))
        for character in "口袋地球人格知识公共简报事实核验":
            mask = selected.getmask(character)
            if not any(bytes(mask)) or (mask.size, bytes(mask)) == missing:
                return False, path
    except (AttributeError, OSError, ValueError):
        return False, path
    return True, path


def _text(value, limit=220) -> str:
    return " ".join(str(value or "").split()).strip()[:limit]


def _measure(draw: ImageDraw.ImageDraw, value: str, font) -> float:
    box = draw.textbbox((0, 0), value or " ", font=font)
    return float(box[2] - box[0])


def _wrap(draw: ImageDraw.ImageDraw, value: str, font, max_width: int, max_lines: int) -> list[str]:
    """Wrap mixed Chinese/Latin text without requiring a tokenizer."""
    text = _text(value, 320)
    if not text:
        return []
    lines: list[str] = []
    current = ""
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9_:/?&=.+-]*|\s+|.", text)
    for token in tokens:
        candidate = current + token
        if not current or _measure(draw, candidate, font) <= max_width:
            current = candidate
            continue
        lines.append(current.rstrip())
        if len(lines) >= max_lines:
            break
        current = token.lstrip()
        while current and _measure(draw, current, font) > max_width:
            fitting = ""
            for char in current:
                if fitting and _measure(draw, fitting + char, font) > max_width:
                    break
                fitting += char
            lines.append(fitting)
            current = current[len(fitting):]
            if len(lines) >= max_lines:
                break
        if len(lines) >= max_lines:
            break
    if len(lines) < max_lines and current:
        lines.append(current.rstrip())
    consumed = "".join(lines)
    if len(consumed) < len(text) and lines:
        tail = lines[-1].rstrip("… .")
        while tail and _measure(draw, tail + "…", font) > max_width:
            tail = tail[:-1]
        lines[-1] = tail + "…"
    return lines


def rgb565_bytes(image: Image.Image) -> bytes:
    image = image.convert("RGB")
    output = bytearray()
    for red, green, blue in image.getdata():
        value = ((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3)
        output.extend(((value >> 8) & 0xFF, value & 0xFF))
    return bytes(output)


def _local_stamp(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone().strftime("%m-%d %H:%M %Z")
    except (TypeError, ValueError):
        return time.strftime("%m-%d %H:%M %Z")


def render_evidence_card(actions: list[dict]) -> Image.Image:
    state = next((item for item in actions if item.get("type") == "state"), {})
    display = next((item for item in actions if item.get("type") == "display"), {})
    source_kind = _text(display.get("sourceKind") or state.get("sourceKind"), 40)
    accent = MUSIC_BLUE if source_kind == "music_now_playing" else GOOGLE_GREEN

    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)

    # Pixel/brutalist frame shared with the Pocket Earth mobile UI.
    draw.rectangle((0, 0, WIDTH - 1, HEIGHT - 1), fill=PAPER, outline=INK, width=4)
    draw.rectangle((0, 0, WIDTH, 38), fill=INK)
    draw.text((11, 9), "POCKET EARTH", font=_font(14, "mono"), fill=PAPER)
    draw.rectangle((159, 7, 230, 31), fill=accent, outline=PAPER, width=1)
    draw.text((166, 12), "GOOGLE AI", font=_font(9, "mono"), fill=INK)

    kind_label = "MUSIC AGENT" if source_kind == "music_now_playing" else "PUBLIC KNOWLEDGE"
    draw.text((12, 49), kind_label, font=_font(10, "mono"), fill=MUTED_GREY)
    draw.ellipse((214, 47, 226, 59), fill=KNOWLEDGE_MAGENTA, outline=INK, width=2)

    title = _text(display.get("title") or "Frost Edge Node", 80)
    title_size = 18 if len(title) > 18 and title.isascii() else 22
    title_font = _font(title_size, "bold")
    title_lines = _wrap(draw, title, title_font, 214, 2)
    y = 69
    for line in title_lines:
        draw.text((12, y), line, font=title_font, fill=INK)
        y += 29

    subtitle = _text(display.get("subtitle"), 100)
    if subtitle:
        draw.rectangle((11, y + 1, 229, y + 25), fill=(225, 225, 221), outline=INK, width=2)
        subtitle_lines = _wrap(draw, subtitle, _font(11, "mono"), 204, 1)
        if subtitle_lines:
            draw.text((18, y + 7), subtitle_lines[0], font=_font(11, "mono"), fill=INK)
        y += 35

    body = _text(display.get("body"), 220)
    body_font = _font(15, "regular")
    max_body_lines = max(1, min(4, (210 - y) // 23))
    for line in _wrap(draw, body, body_font, 214, max_body_lines):
        draw.text((12, y), line, font=body_font, fill=INK)
        y += 23

    truth_score = display.get("truthScore")
    if truth_score is not None:
        label = f"TRUTH SCORE  {max(0, min(100, int(truth_score)))}  ·  HUMAN GATE"
        draw.rectangle((11, 220, 229, 247), fill=INK)
        draw.text((18, 227), label, font=_font(10, "mono"), fill=accent)
    else:
        draw.line((12, 228, 228, 228), fill=INK, width=2)

    created_at = _text(display.get("createdAt") or state.get("createdAt"), 30)
    stamp = _local_stamp(created_at)
    draw.text((12, 257), stamp, font=_font(9, "mono"), fill=MUTED_GREY)
    draw.text((134, 257), "SOURCE RECEIPT", font=_font(9, "mono"), fill=INK)
    return image


class _MirrorHandler(BaseHTTPRequestHandler):
    snapshot_path = DEFAULT_SNAPSHOT

    def log_message(self, _format, *_args):
        return

    def do_GET(self):
        if self.path.startswith("/healthz"):
            payload = json.dumps({"ok": True, "service": "pocket-earth-edge-mirror"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path.split("?", 1)[0] == "/live.png":
            try:
                payload = self.snapshot_path.read_bytes()
            except OSError:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        body = f"""<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\">
<title>Pocket Earth · Frost Edge Node</title><style>
body{{margin:0;background:#0a0a0c;color:#f5f4ef;font-family:monospace;text-align:center}}
header{{padding:18px 8px;font-weight:900;letter-spacing:2px;border-bottom:2px solid #00f48b}}
img{{width:min(86vw,360px);margin:24px auto;border:4px solid #f5f4ef;image-rendering:pixelated}}
p{{color:#00f48b;font-weight:700}}</style><header>POCKET EARTH · GOOGLE AI</header>
<img id=\"screen\" src=\"/live.png?t=0\" alt=\"Frost Edge Node screen\"><p>LIVE · PUBLIC EVENT MIRROR</p>
<script>setInterval(()=>screen.src='/live.png?t='+Date.now(),1200)</script>""".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class PocketEarthDeviceDriver:
    def __init__(self, dry_run: bool = False, mirror_port: int | None = None):
        self.dry_run = dry_run
        self.snapshot_path = DEFAULT_SNAPSHOT
        self.board = None
        self._previous_app_id = ""
        self._borrowed_app_id = ""
        self._mirror = None
        self._mirror_thread = None
        port = int(os.environ.get("FROST_MIRROR_PORT", "8766")) if mirror_port is None else mirror_port
        if port > 0:
            self._start_mirror(port)

    def _start_mirror(self, port: int) -> None:
        _MirrorHandler.snapshot_path = self.snapshot_path
        try:
            self._mirror = ThreadingHTTPServer(("0.0.0.0", port), _MirrorHandler)
        except OSError as exc:
            _log(f"mirror disabled: {exc}")
            return
        self._mirror_thread = threading.Thread(target=self._mirror.serve_forever, daemon=True)
        self._mirror_thread.start()
        _log(f"phone mirror ready on port {port}")

    def _connect_board(self):
        if self.dry_run:
            return None
        if self.board is not None:
            return self.board
        if DEFAULT_WHISPLAY_RUNTIME not in sys.path:
            sys.path.insert(0, DEFAULT_WHISPLAY_RUNTIME)
        from whisplay_client import DEFAULT_DAEMON_SOCKET_PATH, WhisplayDaemonProxy

        class TimedWhisplayDaemonProxy(WhisplayDaemonProxy):
            """Official proxy with a bounded request wait for unattended recovery."""

            def _send_request(self, cmd: str, payload: dict | None = None) -> dict:
                body = {"version": 1, "cmd": cmd, "payload": payload or {}}
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                    client.settimeout(float(os.environ.get("FROST_WHISPLAY_TIMEOUT", "5")))
                    client.connect(self.socket_path)
                    client.sendall((json.dumps(body) + "\n").encode("utf-8"))
                    line = client.makefile("r").readline().strip()
                    if not line:
                        raise RuntimeError("empty response from whisplay-daemon")
                    response = json.loads(line)
                    if not response.get("ok"):
                        raise RuntimeError(response.get("error", "whisplay-daemon request failed"))
                    return response

        board = TimedWhisplayDaemonProxy(
            socket_path=DEFAULT_DAEMON_SOCKET_PATH,
            app_id="pocket-earth-edge",
            display_name="Pocket Earth",
            icon="PE",
            launch_command="sudo -n systemctl restart pocket-earth-edge.service",
            priority=80,
            persist=True,
        )
        if not board.ping():
            raise RuntimeError("whisplay-daemon is unavailable")
        board.register()
        board.start_event_listener()
        self.board = board
        return board

    def _save_snapshot(self, image: Image.Image) -> None:
        self.snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.snapshot_path.with_suffix(".tmp.png")
        image.save(temporary, format="PNG")
        temporary.replace(self.snapshot_path)

    def _set_led(self, state: str) -> None:
        board = self._connect_board()
        if board is None:
            return
        colors = {
            "attention": (255, 18, 198),
            "busy": (20, 190, 255),
            "idle": (0, 244, 139),
            "error": (255, 45, 32),
        }
        board.set_rgb_fade(*colors.get(state, colors["idle"]), duration_ms=420)

    def _prepare_foreground(self, board) -> bool:
        response = board._send_request("health.ping").get("payload", {})
        foreground = _text(response.get("foreground_app_id"), 80)
        if not foreground or foreground == "pocket-earth-edge":
            return False
        allowed = {
            item.strip()
            for item in os.environ.get("FROST_BORROW_APP_IDS", "sunset-radio-status").split(",")
            if item.strip()
        }
        if foreground not in allowed:
            raise RuntimeError(f"Whisplay foreground is busy with {foreground}")
        self._previous_app_id = foreground
        focus = board._send_request("app.focus.acquire", {"app_id": foreground}).get("payload", {})
        token = focus.get("session_token")
        if not token:
            raise RuntimeError(f"Whisplay did not grant borrowed focus for {foreground}")
        framebuffer = board._send_request(
            "framebuffer.acquire",
            {"app_id": foreground, "session_token": token},
        ).get("payload", {})
        board._session_token = token
        board._attach_framebuffer(framebuffer["buffer_handle"], int(framebuffer["stride"]))
        self._borrowed_app_id = foreground
        _log(f"borrowed Whisplay framebuffer from {foreground}")
        return True

    def _release_display_focus(self) -> None:
        if self.board is None:
            return
        app_id = self._borrowed_app_id
        token = self.board._session_token
        self._borrowed_app_id = ""
        if not app_id:
            self.board.release_focus()
            return
        try:
            self.board._send_request(
                "app.focus.release",
                {"app_id": app_id, "session_token": token},
            )
        finally:
            self.board._session_token = None
            self.board._detach_framebuffer()

    def _restore_previous_app(self) -> None:
        app_id = self._previous_app_id
        self._previous_app_id = ""
        if not app_id or self.board is None or self.dry_run:
            return
        try:
            self.board._send_request("app.launch", {"app_id": app_id})
            _log(f"returned Whisplay to {app_id}")
            return
        except (OSError, RuntimeError) as exc:
            _log(f"Whisplay app.launch failed for {app_id}: {exc}")
        if app_id == "sunset-radio-status":
            subprocess.run(
                ["sudo", "-n", "systemctl", "restart", "sunset-radio-whisplay.service"],
                timeout=15,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

    def _show(self, image: Image.Image) -> bool:
        if self.dry_run:
            return True
        board = self._connect_board()
        borrowed = self._prepare_foreground(board)
        if not borrowed:
            board.acquire_foreground(timeout_sec=7.0)
        board.set_backlight(int(os.environ.get("FROST_SCREEN_BRIGHTNESS", "82")))
        board.draw_image(0, 0, WIDTH, HEIGHT, rgb565_bytes(image))
        return True

    @staticmethod
    def _set_dialog_audio() -> None:
        wpctl = shutil.which("wpctl")
        if not wpctl:
            return
        volume = max(10, min(85, int(os.environ.get("FROST_TTS_VOLUME", "42"))))
        env = {**os.environ, "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", "/run/user/1000")}
        subprocess.run([wpctl, "set-mute", "@DEFAULT_AUDIO_SINK@", "0"], env=env, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run([wpctl, "set-volume", "@DEFAULT_AUDIO_SINK@", f"{volume}%"], env=env, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    @staticmethod
    def _tts_cache_path(text: str) -> Path:
        digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
        cache = Path(
            os.environ.get(
                "FROST_TTS_CACHE_DIR",
                str(Path(tempfile.gettempdir()) / "pocket-earth-edge-tts"),
            )
        )
        cache.mkdir(parents=True, exist_ok=True)
        return cache / f"{digest}.mp3"

    def _server_tts(self, text: str) -> Path | None:
        output = self._tts_cache_path(text)
        if output.exists() and output.stat().st_size >= 1024:
            return output
        body = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
        request = Request(DEFAULT_TTS_URL, data=body, headers={"content-type": "application/json"}, method="POST")
        try:
            with urlopen(request, timeout=float(os.environ.get("FROST_TTS_TIMEOUT", "24"))) as response:
                data = response.read()
                content_type = response.headers.get("content-type", "")
        except (URLError, TimeoutError, OSError) as exc:
            _log(f"server TTS unavailable, using offline fallback: {exc}")
            return None
        if "audio/" not in content_type or len(data) < 1024:
            return None
        output.write_bytes(data)
        return output

    def speak(self, text: str, max_chars: int = 160) -> bool:
        """Speak user-requested public text without changing display focus."""
        text = _text(text, max(1, min(2000, int(max_chars))))
        if not text or self.dry_run or os.environ.get("FROST_DISABLE_TTS", "").lower() in {"1", "true", "yes"}:
            return bool(text)
        DEFAULT_TTS_MARKER.write_text(str(int(time.time())), encoding="utf-8")
        try:
            self._set_dialog_audio()
            audio = self._server_tts(text)
            ffplay = shutil.which("ffplay")
            if audio and ffplay:
                result = subprocess.run([ffplay, "-nodisp", "-autoexit", "-loglevel", "error", str(audio)],
                                        timeout=35, check=False)
                if result.returncode == 0:
                    return True
            espeak = shutil.which("espeak-ng") or shutil.which("espeak")
            if not espeak:
                return False
            result = subprocess.run([espeak, "-v", "zh", "-s", "150", text], timeout=25, check=False,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return result.returncode == 0
        finally:
            try:
                DEFAULT_TTS_MARKER.unlink()
            except OSError:
                pass

    def _speak(self, text: str) -> bool:
        return self.speak(text)

    def apply_actions(self, actions: list[dict]) -> dict:
        """Apply one complete event. Cursor persistence happens only after return."""
        state_action = next((item for item in actions if item.get("type") == "state"), {})
        tts_action = next((item for item in actions if item.get("type") == "tts"), {})
        image = render_evidence_card(actions)
        self._save_snapshot(image)
        state = _text(state_action.get("state"), 32) or "idle"
        shown = False
        spoken = False
        try:
            try:
                self._set_led(state)
            except (OSError, RuntimeError) as exc:
                # LED is an enhancement; a transient LED failure must not suppress
                # the evidence card or TTS path.
                _log(f"LED unavailable: {exc}")
            shown = self._show(image)
            spoken = self._speak(tts_action.get("text", "")) if tts_action else False
            hold_seconds = max(0.0, float(os.environ.get("FROST_DISPLAY_HOLD_SECONDS", "9")))
            if not self.dry_run and hold_seconds:
                time.sleep(hold_seconds)
        finally:
            if self.board is not None:
                try:
                    self._release_display_focus()
                except (OSError, RuntimeError) as exc:
                    _log(f"Whisplay focus release failed: {exc}")
                try:
                    self.board.set_rgb_fade(0, 0, 0, duration_ms=500)
                except (OSError, RuntimeError) as exc:
                    _log(f"LED reset skipped: {exc}")
                self._restore_previous_app()
        _log(f"event applied: screen={shown} tts={spoken} state={state}")
        return {"screen": shown, "tts": spoken, "state": state, "snapshot": str(self.snapshot_path)}

    def close(self) -> None:
        if self.board is not None:
            self.board.cleanup()
            self.board = None
        if self._mirror is not None:
            self._mirror.shutdown()
            self._mirror.server_close()
            self._mirror = None


def _demo_actions() -> list[dict]:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return [
        {"type": "state", "state": "attention", "sourceKind": "public_knowledge_brief", "createdAt": now},
        {"type": "tts", "text": "Pocket Earth 已完成 Google AI 双角色核验，这条公共知识仍等待人工确认。"},
        {
            "type": "display",
            "title": "公共知识简报",
            "body": "Gemini Investigator 与 Skeptic 完成交叉审计；来源与不确定性保留。",
            "subtitle": "Truth Score 82 · review_required",
            "truthScore": 82,
            "verdict": "review_required",
            "sourceUrls": ["https://commission.europa.eu/", "https://enisa.europa.eu/"],
            "sourceKind": "public_knowledge_brief",
            "createdAt": now,
        },
    ]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Drive the physical Pocket Earth Frost Edge Node")
    parser.add_argument("--demo", action="store_true", help="show and speak one public demo card")
    parser.add_argument("--render-only", action="store_true", help="render without touching Whisplay or audio")
    parser.add_argument("--output", type=Path, help="copy the rendered demo PNG to this path")
    args = parser.parse_args(argv)
    if not args.demo and not args.render_only:
        parser.error("choose --demo or --render-only")
    driver = PocketEarthDeviceDriver(dry_run=args.render_only, mirror_port=0 if args.render_only else None)
    try:
        result = driver.apply_actions(_demo_actions())
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(result["snapshot"], args.output)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    finally:
        driver.close()


if __name__ == "__main__":
    raise SystemExit(main())
