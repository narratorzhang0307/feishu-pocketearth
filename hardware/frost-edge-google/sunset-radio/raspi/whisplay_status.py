#!/usr/bin/env python3
import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
import threading
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont

try:
    import numpy as _np
except Exception:  # numpy 不在时退回逐像素慢路径（仅影响帧率，不影响正确性）
    _np = None

from button_events import load_latest, record_button_event
from device_status import collect_device_status, display_summary

# 动态头像（音乐DJ 方盒子）：随播放城市的流派 + 状态换造型。载入失败就回退 ASCII 脸。
try:
    import frost_avatar
    _HAS_AVATAR = bool(frost_avatar.POSES)
except Exception:
    _HAS_AVATAR = False

# 大圆环四形态（头像/磁带盘/彩底大圆脸/日落照片黑胶盘）：放歌时随机切换。
# 载入失败就永远停在头像形态。
try:
    import face_forms
    _HAS_FORMS = True
except Exception:
    _HAS_FORMS = False

# 日落照片供给器：清单在（deploy 同步的）resource-library/world-photos.json，
# 后台按当前城市预取缓存；没有清单/没有缓存时照片盘形态自动缺席。
try:
    import photo_disc
    _PHOTOS = photo_disc.PhotoProvider()
    if not _PHOTOS.catalog:
        _PHOTOS = None
except Exception:
    _PHOTOS = None

# 默片字幕卡：弗洛斯特回复上屏逐字敲出（王家卫式插卡，静音下的可见回执）。
# 载入失败=功能整体缺席，绝不影响主循环。
try:
    import intertitle as _INTERTITLE
except Exception:
    _INTERTITLE = None

WHISPLAY_RUNTIME = os.environ.get("WHISPLAY_RUNTIME", "/home/pi/Whisplay/runtime")

API_BASE = os.environ.get("SUNSET_API", "http://127.0.0.1:8080")
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CITIES_DIR = os.environ.get("SUNSET_CITIES_DIR", os.path.join(ROOT_DIR, "resource-library", "cities"))
STATE_DIR = os.environ.get(
    "SUNSET_STATE_DIR",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio"),
)
MEDIA_PATH = os.environ.get("SUNSET_WHISPLAY_MEDIA_PATH", os.path.join(STATE_DIR, "whisplay-media.json"))
POLL_SEC = float(os.environ.get("SUNSET_DISPLAY_POLL_SEC", "2.5"))
DEVICE_POLL_SEC = float(os.environ.get("SUNSET_DEVICE_POLL_SEC", "18"))
PET_POLL_SEC = float(os.environ.get("SUNSET_PET_POLL_SEC", "5"))
# 屏幕镜像：把这块屏此刻的画面每隔几秒推给 /api/pi-pet 的 screen 字段 ——
# 手机「崽」面板里那块小屏就是它（同一只宠物，两块镜子）。0 = 关闭。
SCREEN_POST_SEC = float(os.environ.get("SUNSET_PET_SCREEN_POST_SEC", "5"))
# 停针仪式：播放中断瞬间（长按静音/暂停/演示窗结束），盘面定格 + 唱臂抬起悬停这么久，再回头像
STOP_HOLD_SEC = float(os.environ.get("SUNSET_STOP_HOLD_SEC", "3.2"))
WIDTH = 240
HEIGHT = 280
LONG_PRESS_SEC = 0.55
DOUBLE_CLICK_SEC = float(os.environ.get("SUNSET_BUTTON_DOUBLE_CLICK_SEC", "0.42"))
# 长按是出门电台开关：安静时先试手机热点再开播，播放中再按则安静待命。
# 大圆环布局：圆环是整块屏的主角（直径 204/屏宽 240），左右且上下居中；
# 顶行只留 城市名+时间，底部两行歌名/歌手，文字边界与圆形左右边缘对齐（绝不出屏）。
AV_CX, AV_CY, AV_BOX = 120, 141, 204
AV_RX, AV_RY, AV_RW, AV_RH = 0, 36, 240, 208
TRACK_TEXT_X, TRACK_TEXT_W = 18, 204   # 圆形的左右边界
TRACK_LINE1_Y, TRACK_LINE2_Y = 245, 261
AV_BODY_LIFT = 10   # 头像在大圆环内整体上抬，让角色在圆里也上下居中（圆环本身不动）
ANIM_FPS = float(os.environ.get("SUNSET_AVATAR_FPS", "14"))
ROTATE_SEC = float(os.environ.get("SUNSET_AVATAR_ROTATE_SEC", "6"))
OFFLINE_STATE = {
    "status": "offline",
    "label": "连接中",
    "city": "日落电台",
    "message": "正在接通这座城市的频率",
    "pending": 0,
}

INK = (238, 225, 208)
MUTED = (182, 135, 103)
GLOW = (255, 140, 90)
DARK = (7, 10, 16)
PANEL = (19, 25, 34)
GREEN = (113, 221, 150)
RED = (238, 86, 72)

DJ_LINES = [
    "   .---.    ",
    "   .-~-.    ",
    " ([.:::.]) ",
    "  [ o  o ]  ",
    "  [ ---- ]  ",
    "   `----`   ",
]

BUSY_LINES = [
    "   .---.    ",
    "   .-o-.    ",
    " ([.:::.]) ",
    "  [ o  o ]  ",
    "  [ -==- ]  ",
    "   `----`   ",
]

QUEUED_LINES = [
    "   .---.    ",
    "   .-!-.    ",
    " ([.:::.]) ",
    "  [ O  O ]  ",
    "  [ ---- ]  ",
    "   `----`   ",
]

SCREEN_SUMMARIES = {
    "相机状态": "IMX708 就绪 · 按需观察",
    "相机医生": "相机待命 · 扫描此刻",
    "相机排线": "IMX708 在线 · 隐私优先",
    "环境DJ": "唤醒后观察 · 下一段微调",
    "环境模式": "原声/自适应/扫描",
    "环境观察": "只在唤醒/扫描时观察",
    "环境调音": "24H主线优先 · 下一段微调",
    "环境记忆": "短时趋势 · 不存照片",
    "环境计划": "先稳主线 · 冷静调音",
    "隐私状态": "不自动拍照 · 分析后删图",
    "硬件复查": "静音/屏幕/服务一屏看完",
    "电池医生": "PiSugar供电 · 守护在线",
    "屏幕医生": "屏幕正常 · 短按/双击可用",
    "按键医生": "短按下一首 · 双击换城 · 长按写状态",
    "切换声音": "先试热点 · 播停写状态",
}


# 屏幕要画中文 + 拉丁 + 日文假名（世界各地的城市名、歌名），必须用覆盖中日韩的字体。
# 之前首选 DroidSansFallbackFull —— 树莓派 OS 默认根本没装它，于是回退到只有拉丁字形的
# DejaVu，所有中文就变成「□」豆腐块。这里把真正带中文的字体（Noto CJK / 文泉驿 / Droid
# 兜底）排到 DejaVu 前面；deploy 时再 apt 装 fonts-noto-cjk 保证 Pi 上一定有一款。
CJK_FONTS = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
    "/usr/share/fonts/truetype/droid/DroidSansFallback.ttf",
    # 本机预览兜底（macOS）
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    # 最后才退到只有拉丁的 DejaVu（中文会缺字，仅防止整屏崩）
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
CJK_FONTS_BOLD = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
] + CJK_FONTS  # 没有 CJK 粗体就直接用常规字重的中文字体（wqy 等），宁可不加粗也别缺字。
# ⚠️ 绝不能把 DejaVuSans-Bold 放进来：它有粗体却没有中文字形，会让标题（点播中/静音中等）变「□□□」。

# DJ 脸是纯 ASCII 点阵画，要等宽才不会错位 —— 用等宽字体；后面挂上中文字体兜底。
MONO_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf",
    "/System/Library/Fonts/Menlo.ttc",
] + CJK_FONTS
MONO_FONTS_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansMono-Bold.ttf",
] + MONO_FONTS


def font(size, bold=False, mono=False):
    if mono:
        candidates = MONO_FONTS_BOLD if bold else MONO_FONTS
    else:
        candidates = CJK_FONTS_BOLD if bold else CJK_FONTS
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


FONT_TINY = font(10)
FONT_SMALL = font(12)
FONT_BODY = font(14)
FONT_TITLE = font(17, bold=True)
FONT_DJ = font(15, mono=True)
FONT_VOL_NUM = font(46, bold=True)

VOL_STATE_PATH = os.environ.get("SUNSET_VOLUME_STATE_PATH", os.path.join(STATE_DIR, "volume-state.json"))
VOL_OVERLAY_SEC = float(os.environ.get("SUNSET_VOLUME_OVERLAY_SEC", "2.5"))
VOL_SEGMENTS = 20
VOL_EMPTY = (52, 42, 40)


def _fb_font_paths():
    import glob

    candidates = [
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansHebrew-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    paths = [path for path in candidates if os.path.exists(path)]
    unifonts = sorted(glob.glob("/usr/share/fonts/**/unifont*.*", recursive=True))
    main_unifonts = [
        path for path in unifonts if not any(marker in path for marker in ("_csur", "_upper", "_jp", "_sample"))
    ]
    if main_unifonts:
        paths.append(main_unifonts[0])
    elif unifonts:
        paths.append(unifonts[0])
    if not paths:
        for path in ("/System/Library/Fonts/Hiragino Sans GB.ttc", "/System/Library/Fonts/Helvetica.ttc"):
            if os.path.exists(path):
                paths.append(path)
    return paths


_FB_PATHS = _fb_font_paths()
_fb_chain_cache = {}
_fb_notdef_cache = {}
_fb_char_cache = {}


def _fb_chain(size):
    chain = _fb_chain_cache.get(size)
    if chain is None:
        chain = []
        for path in _FB_PATHS:
            try:
                chain.append(ImageFont.truetype(path, size))
            except OSError:
                pass
        if not chain:
            chain = [ImageFont.load_default()]
        _fb_chain_cache[size] = chain
    return chain


def _font_has_glyph(fnt, ch):
    try:
        key = id(fnt)
        notdef = _fb_notdef_cache.get(key)
        if notdef is None:
            notdef = bytes(fnt.getmask("\U000F0000"))
            _fb_notdef_cache[key] = notdef
        return bytes(fnt.getmask(ch)) != notdef
    except Exception:
        return False


def _font_for_char(size, ch):
    key = (size, ch)
    fnt = _fb_char_cache.get(key)
    if fnt is not None:
        return fnt
    chain = _fb_chain(size)
    fnt = chain[0]
    for candidate in chain:
        if ch == " " or _font_has_glyph(candidate, ch):
            fnt = candidate
            break
    _fb_char_cache[key] = fnt
    return fnt


def fb_runs(text, size):
    runs = []
    current_font = None
    current_text = ""
    for ch in str(text or ""):
        fnt = _font_for_char(size, ch)
        if fnt is current_font:
            current_text += ch
            continue
        if current_text:
            runs.append((current_font, current_text))
        current_font = fnt
        current_text = ch
    if current_text:
        runs.append((current_font, current_text))
    return runs


def fb_width(draw, text, size):
    return sum(draw.textlength(chunk, font=fnt) for fnt, chunk in fb_runs(text, size))


def fb_draw(draw, xy, text, size, fill):
    x, y = xy
    for fnt, chunk in fb_runs(text, size):
        draw.text((x, y), chunk, font=fnt, fill=fill)
        x += draw.textlength(chunk, font=fnt)


def fb_fit(draw, text, size, max_width):
    text = str(text or "")
    if fb_width(draw, text, size) <= max_width:
        return text
    suffix = "..."
    while text and fb_width(draw, text + suffix, size) > max_width:
        text = text[:-1]
    return text + suffix if text else suffix


def fb_take(draw, text, size, max_width):
    """贪心取一行能放下的最长前缀，返回 (前缀, 余下)。优先在空格处断行。"""
    text = str(text or "")
    if fb_width(draw, text, size) <= max_width:
        return text, ""
    taken = ""
    for ch in text:
        if fb_width(draw, taken + ch, size) > max_width:
            break
        taken += ch
    rest = text[len(taken):]
    space = taken.rfind(" ")
    if space > int(len(taken) * 0.6):  # 断点附近有空格就用空格断，西文歌名不劈单词
        rest = taken[space + 1:] + rest
        taken = taken[:space]
    return taken, rest.strip()


def layout_track_lines(draw, title, artist, max_width, sizes=(13, 12, 11, 10, 9)):
    """底部歌名/歌手的自适应排版：内容永远完整、永不出屏。
    从大到小试字号——短内容两行分列；歌名长歌手短则合并折两行；
    都长就降字号直到两行装下；理论极端（最小字号仍溢出）才允许省略号兜底。
    返回 (字号, [(行文本, 行角色 title/artist/mixed), ...])。"""
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    for size in sizes:
        if artist:
            if fb_width(draw, title, size) <= max_width and fb_width(draw, artist, size) <= max_width:
                return size, [(title, "title"), (artist, "artist")]
            line1, rest = fb_take(draw, f"{title} — {artist}", size, max_width)
            if not rest:
                return size, [(line1, "mixed")]
            if fb_width(draw, rest, size) <= max_width:
                return size, [(line1, "title"), (rest, "mixed")]
        else:
            if fb_width(draw, title, size) <= max_width:
                return size, [(title, "title")]
            line1, rest = fb_take(draw, title, size, max_width)
            if fb_width(draw, rest, size) <= max_width:
                return size, [(line1, "title"), (rest, "title")]
    # 极端兜底一：最小字号两行仍装不下（歌名歌手都超长）→ 允许第三行，内容依然完整
    size = sizes[-1]
    combined = f"{title} — {artist}" if artist else title
    line1, rest = fb_take(draw, combined, size, max_width)
    line2, rest2 = fb_take(draw, rest, size, max_width)
    if not rest2:
        return size, [(line1, "title"), (line2, "mixed")]
    if fb_width(draw, rest2, size) <= max_width:
        return size, [(line1, "title"), (line2, "mixed"), (rest2, "mixed")]
    # 极端兜底二（物理极限，例如上百字符）：第三行才允许省略号
    return size, [(line1, "title"), (line2, "mixed"), (fb_fit(draw, rest2, size, max_width), "mixed")]

button_pressed_at = 0.0
button_click_count = 0
button_click_generation = 0
button_single_timer = None
button_lock = threading.Lock()
DEFAULT_MEDIA = {
    "city": "日落电台",
    "track": "全天候日落歌单",
    "artist": "音乐DJ",
}
last_media = dict(DEFAULT_MEDIA)
PLACEHOLDER_CITIES = {"", "日落电台", "Sunset Radio", "音乐DJ", "声音入口", "当前播放"}
PLACEHOLDER_TRACKS = {
    "",
    "test",
    "Sunset Radio",
    "对话待命",
    "硬静音",
    "安静待命",
    "电台播放",
    "全天候日落歌单",
    "PiSugar",
    "Whisplay",
    "Mute Guard",
    "下一段节目",
    "短时状态",
    "下一步",
    "相机权限",
    "麦克风",
}
STATUS_CITIES = set(SCREEN_SUMMARIES) | {
    "电子宠物",
    "设备状态",
    "能力总览",
    "静音医生",
    "DJ 指令",
    "DJ 请求",
    "曲库概览",
    "城市歌单",
    "歌曲故事",
    "日落路线",
    "语音控制",
}
_CATALOG_ARTIST_CACHE = None


def _media_key(value):
    return str(value or "").strip().casefold()


def is_real_media_track(value):
    text = str(value or "").strip()
    return bool(text) and text not in PLACEHOLDER_TRACKS and text.lower() not in {"test", "sunset radio"}


def is_real_media_city(value):
    text = str(value or "").strip()
    return text not in PLACEHOLDER_CITIES and text not in STATUS_CITIES


def is_status_media_state(city):
    text = str(city or "").strip()
    return text in STATUS_CITIES or text in PLACEHOLDER_CITIES


def catalog_artist_index():
    global _CATALOG_ARTIST_CACHE
    if _CATALOG_ARTIST_CACHE is not None:
        return _CATALOG_ARTIST_CACHE
    by_city_track = {}
    by_title = {}
    title_counts = {}
    import glob

    for path in sorted(glob.glob(os.path.join(CITIES_DIR, "*.json"))):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                city = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        city_keys = [
            _media_key(city.get("cityNameZh")),
            _media_key(city.get("cityName")),
            _media_key(city.get("slug") or os.path.splitext(os.path.basename(path))[0]),
        ]
        for track in city.get("tracks") or []:
            title = str(track.get("title") or "").strip()
            artist = str(track.get("artist") or "").strip()
            if not title or not artist:
                continue
            title_key = _media_key(title)
            title_counts[title_key] = title_counts.get(title_key, 0) + 1
            by_title[title_key] = artist
            for city_key in city_keys:
                if city_key:
                    by_city_track[(city_key, title_key)] = artist
    unique_by_title = {title: artist for title, artist in by_title.items() if title_counts.get(title) == 1}
    _CATALOG_ARTIST_CACHE = {"byCityTrack": by_city_track, "byTitle": unique_by_title}
    return _CATALOG_ARTIST_CACHE


def catalog_artist_for(city, track):
    title_key = _media_key(track)
    if not title_key:
        return ""
    index = catalog_artist_index()
    city_key = _media_key(city)
    if city_key:
        artist = index["byCityTrack"].get((city_key, title_key))
        if artist:
            return artist
    return index["byTitle"].get(title_key, "")


def repair_media_artist(media):
    media = dict(media or {})
    artist = catalog_artist_for(media.get("city"), media.get("track"))
    if artist:
        media["artist"] = artist
    return media


def fetch_state():
    with urllib.request.urlopen(f"{API_BASE}/api/pi-state", timeout=2) as response:
        return json.loads(response.read().decode("utf-8")).get("state", {})


def fetch_pet():
    with urllib.request.urlopen(f"{API_BASE}/api/pi-pet", timeout=2) as response:
        return json.loads(response.read().decode("utf-8")).get("pet", {}) or {}


# 宠物情绪 → RGB LED（Whisplay 板载三色灯，此前一直闲置）。灯是「一眼看出它现在怎么样」
# 的最快通道：暖琥珀=安然、亮橙=开心、暗蓝=犯困、红=想充电、青=想你、落日粉紫=神游中。
PET_MOOD_LED = {
    "calm": (90, 45, 12),
    "happy": (255, 120, 30),
    "sleepy": (10, 18, 60),
    "hungry": (200, 30, 20),
    "longing": (30, 120, 130),
    "drifting": (170, 40, 120),
}
# 强情绪时不轮播表情池，钉住一个贴合情绪的造型（犯困→paused 闭眼感，想充电→listening 巴望感）。
PET_PINNED_POSE_MOOD = {
    "sleepy": "paused",
    "hungry": "listening",
}


FORM_DEMO_PATH = os.path.join(STATE_DIR, "form-demo.json")
PET_FORM_PATH = os.path.join(STATE_DIR, "pet-form.json")


def form_demo_until():
    """无声形态演示窗（守护进程写入）：窗内即使没放歌，三形态也照常轮转。"""
    try:
        with open(FORM_DEMO_PATH, "r", encoding="utf-8") as handle:
            return float(json.load(handle).get("until") or 0)
    except Exception:
        return 0.0


def pet_form_identity():
    """用户选定的形态身份（守护进程写入）：avatar/turntable/face；没选过返回 ""=幼年随机轮播。
    读到半截/瞬时 IO 错返回 None——调用方保持上次身份，不闪回幼年轮播。"""
    try:
        with open(PET_FORM_PATH, "r", encoding="utf-8") as handle:
            value = str(json.load(handle).get("form") or "").strip()
        return value if value in face_forms.IDENTITIES else ""
    except FileNotFoundError:
        return ""
    except Exception:
        return None


def pet_drift_info(pet):
    """神游中返回 {city, sunsetClock}，否则 None。"""
    if not isinstance(pet, dict):
        return None
    drift = pet.get("drift") or {}
    if pet.get("activity") == "dusk_drift" and drift.get("cityNameZh"):
        return {"city": str(drift.get("cityNameZh")), "sunsetClock": str(drift.get("sunsetClock") or "")}
    return None


_screen_post_inflight = threading.Event()


def post_screen_frame(image):
    """把当前整屏 PIL 画面压成 JPEG（约 10-20KB）POST 给 /api/pi-pet 的 screen 字段。
    后台线程执行、单飞不排队：网络慢就丢帧，绝不拖慢屏幕渲染主循环。"""
    if _screen_post_inflight.is_set():
        return
    frame = image.copy()

    def _worker():
        _screen_post_inflight.set()
        try:
            buffer = io.BytesIO()
            frame.convert("RGB").save(buffer, "JPEG", quality=68)
            payload = json.dumps(
                {"screen": "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")}
            ).encode("utf-8")
            request = urllib.request.Request(
                f"{API_BASE}/api/pi-pet",
                data=payload,
                headers={"content-type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=3) as response:
                response.read()
        except Exception:
            pass
        finally:
            _screen_post_inflight.clear()

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


def load_media_cache():
    try:
        with open(MEDIA_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return dict(DEFAULT_MEDIA)
    if not isinstance(payload, dict):
        return dict(DEFAULT_MEDIA)
    media = dict(DEFAULT_MEDIA)
    for key in ("city", "track", "artist"):
        value = str(payload.get(key) or "").strip()
        if value:
            media[key] = value
    if not is_real_media_track(media.get("track")):
        return dict(DEFAULT_MEDIA)
    if not is_real_media_city(media.get("city")):
        media["city"] = DEFAULT_MEDIA["city"]
    if not media.get("artist") or media.get("artist") == "音乐DJ":
        media["artist"] = DEFAULT_MEDIA["artist"]
    repaired = repair_media_artist(media)
    if repaired != media:
        save_media_cache(repaired)
    return repaired


def save_media_cache(media):
    try:
        os.makedirs(os.path.dirname(MEDIA_PATH) or ".", exist_ok=True)
        with open(MEDIA_PATH, "w", encoding="utf-8") as handle:
            json.dump(
                {key: media.get(key, DEFAULT_MEDIA[key]) for key in ("city", "track", "artist")},
                handle,
                ensure_ascii=False,
                indent=2,
            )
            handle.write("\n")
    except OSError:
        pass


def post_command(text, source="button"):
    payload = json.dumps({"text": text, "source": source}).encode("utf-8")
    request = urllib.request.Request(
        f"{API_BASE}/api/pi-control",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=2) as response:
        response.read()


def post_button_command(text, event="shortcut"):
    record_button_event(event, source="whisplay", action=text, detail={"phase": "queued"})
    try:
        post_command(text, "button")
        record_button_event(event, source="whisplay", action=text, detail={"phase": "posted", "ok": True})
    except Exception:
        record_button_event(event, source="whisplay", action=text, detail={"phase": "posted", "ok": False})
        pass


def fire_click_bundle(generation):
    """确认窗（DOUBLE_CLICK_SEC）到点结算：1击=下一首，2击=换个城市。
    三连击不走这里——第 3 击在 on_button_release 里即时触发切换形态。
    代价是双击要多等一个确认窗才发出（换城市本身要几秒生效，无感）。"""
    global button_click_count, button_single_timer
    with button_lock:
        if generation != button_click_generation:
            return
        count = button_click_count
        button_click_count = 0
        button_single_timer = None
    if count == 1:
        post_button_command("下一首", event="single")
    elif count == 2:
        post_button_command("换个城市", event="double")


def schedule_click_bundle():
    """（须持有 button_lock 调用）重置确认窗计时器，窗内后续点击继续累计。"""
    global button_click_generation, button_single_timer
    if button_single_timer:
        button_single_timer.cancel()
    button_click_generation += 1
    generation = button_click_generation
    button_single_timer = threading.Timer(DOUBLE_CLICK_SEC, fire_click_bundle, args=(generation,))
    button_single_timer.daemon = True
    button_single_timer.start()


def arm_listen_window():
    """长按橙色键 → 开一个听写窗：voice_agent 这段时间接受你说的话（不用喊唤醒词），
    并把「在听…」推到屏幕/PWA。复用 ptt_arm，不发命令、不录音（录音仍是语音服务在做）。"""
    try:
        import ptt_arm
        ptt_arm.arm()
        ptt_arm.publish_listening(ptt_arm.TTL)
        record_button_event("long", source="whisplay", action="listen", detail={"phase": "armed", "ttlSec": ptt_arm.TTL})
    except Exception as exc:
        record_button_event("long", source="whisplay", action="listen", detail={"phase": "error", "error": str(exc)[:80]})


def on_button_press():
    global button_pressed_at
    with button_lock:
        button_pressed_at = time.monotonic()
    record_button_event("pressed", source="whisplay")


def on_button_release():
    global button_pressed_at, button_click_count, button_click_generation, button_single_timer
    with button_lock:
        started = button_pressed_at
        button_pressed_at = 0.0
    held = time.monotonic() - started if started else 0
    record_button_event("released", source="whisplay", detail={"heldSec": round(held, 3)})
    if held >= LONG_PRESS_SEC:
        with button_lock:
            if button_single_timer:
                button_single_timer.cancel()
            button_single_timer = None
            button_click_count = 0
            button_click_generation += 1
        # Google 版 Frost Edge 维持设备上最容易解释、也可离线复验的
        # 三段手势契约：短按下一首、双击换城市、长按切换电台播停。
        post_button_command("切换声音", event="long")
        return
    triple = False
    with button_lock:
        button_click_count += 1
        if button_click_count >= 3:
            # 三连击：即时触发，不等确认窗
            if button_single_timer:
                button_single_timer.cancel()
            button_single_timer = None
            button_click_count = 0
            button_click_generation += 1
            triple = True
        else:
            schedule_click_bundle()
    if triple:
        post_button_command("切换形态", event="triple")


def wrap(draw, text, fnt, max_width, max_lines):
    words = list(str(text or ""))
    lines = []
    line = ""
    for ch in words:
        trial = line + ch
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = ch
        if len(lines) >= max_lines:
            break
    if line and len(lines) < max_lines:
        lines.append(line)
    if len(lines) == max_lines and len("".join(lines)) < len(str(text or "")):
        lines[-1] = lines[-1].rstrip("。,. ") + "..."
    return lines


def fit_text(draw, text, fnt, max_width):
    text = str(text or "")
    if draw.textbbox((0, 0), text, font=fnt)[2] <= max_width:
        return text
    suffix = "..."
    while text and draw.textbbox((0, 0), text + suffix, font=fnt)[2] > max_width:
        text = text[:-1]
    return text + suffix if text else suffix


def text_width(draw, text, fnt):
    box = draw.textbbox((0, 0), str(text or ""), font=fnt)
    return box[2] - box[0]


def compact_message(message, is_muted, city=""):
    summary = SCREEN_SUMMARIES.get(str(city or ""))
    if summary:
        return summary
    message = str(message or "")
    if is_muted and message.startswith("静音中："):
        detail = message.removeprefix("静音中：")
        artist = detail.split(" - ", 1)[0].strip()
        return artist or detail
    return message


def artist_from_message(message, track=""):
    text = str(message or "").strip()
    if text.startswith("静音中："):
        text = text.removeprefix("静音中：").strip()
    if " - " not in text:
        return ""
    artist, maybe_track = text.split(" - ", 1)
    if track and maybe_track.strip() and maybe_track.strip() != str(track).strip():
        return ""
    return artist.strip()


def media_from_state(state):
    global last_media
    city = str(state.get("city") or "").strip()
    track = str(state.get("track") or "").strip()
    artist = artist_from_message(state.get("message"), track)
    if is_real_media_track(track) and not is_status_media_state(city):
        before = dict(last_media)
        last_media["track"] = track
        if is_real_media_city(city):
            last_media["city"] = city
        catalog_artist = catalog_artist_for(last_media.get("city"), track)
        if catalog_artist or artist:
            last_media["artist"] = catalog_artist or artist
        if last_media != before:
            save_media_cache(last_media)
    return {
        "city": last_media.get("city") or city or "日落电台",
        "track": last_media.get("track") or track or "Sunset Radio",
        "artist": last_media.get("artist") or artist or "音乐DJ",
    }


def latest_button_hint():
    latest = load_latest()
    event = str(latest.get("event") or "")
    action = str(latest.get("action") or "")
    if event not in {"single", "double", "long"} or not action:
        return ""
    labels = {
        "single": "短按",
        "double": "双击",
        "long": "长按",
    }
    return f"刚刚{labels.get(event, '按键')}：{action}"


def rgb565_bytes(image):
    image = image.convert("RGB")
    if _np is not None:
        # 向量化转换：大圆环把动画区放大到全宽后，纯 Python 逐像素循环撑不住 14FPS
        arr = _np.asarray(image, dtype=_np.uint16)
        value = ((arr[..., 0] & 0xF8) << 8) | ((arr[..., 1] & 0xFC) << 3) | (arr[..., 2] >> 3)
        return value.astype(">u2").tobytes()
    out = bytearray()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b = image.getpixel((x, y))
            value = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
            out.append((value >> 8) & 0xFF)
            out.append(value & 0xFF)
    return bytes(out)


def mix_color(c1, c2, t):
    t = max(0.0, min(1.0, float(t)))
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def read_volume_overlay(now=None):
    try:
        with open(VOL_STATE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return None
    if not isinstance(payload, dict) or "volume" not in payload:
        return None
    try:
        timestamp = float(payload.get("ts") or 0)
        current_time = time.time() if now is None else float(now)
    except (TypeError, ValueError):
        return None
    if current_time - timestamp > VOL_OVERLAY_SEC:
        return None
    try:
        volume = int(round(float(payload["volume"])))
    except (TypeError, ValueError):
        return None
    return {
        "volume": max(0, min(100, volume)),
        "dir": "down" if payload.get("dir") == "down" else "up",
    }


def draw_speaker_icon(draw, cx, cy, volume):
    draw.rectangle((cx - 16, cy - 6, cx - 8, cy + 6), fill=INK)
    draw.polygon([(cx - 8, cy - 6), (cx, cy - 14), (cx, cy + 14), (cx - 8, cy + 6)], fill=INK)
    if volume <= 0:
        draw.line((cx + 7, cy - 9, cx + 19, cy + 9), fill=RED, width=3)
        draw.line((cx + 7, cy + 9, cx + 19, cy - 9), fill=RED, width=3)
        return
    waves = 1 if volume <= 34 else 2 if volume <= 67 else 3
    for index in range(waves):
        radius = 8 + index * 7
        draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), -52, 52, fill=GLOW, width=2)


def draw_volume_overlay(base_img, displayed_volume, target_volume):
    img = Image.blend(base_img.convert("RGB"), Image.new("RGB", (WIDTH, HEIGHT), DARK), 0.5)
    draw = ImageDraw.Draw(img)
    cx = WIDTH // 2
    target = max(0, min(100, int(round(target_volume))))
    draw.rounded_rectangle((16, 58, 224, 238), radius=14, fill=(12, 16, 24), outline=(74, 48, 38), width=2)
    draw_speaker_icon(draw, cx, 92, target)
    text = str(target)
    try:
        draw.text((cx, 140), text, font=FONT_VOL_NUM, fill=GLOW, anchor="mm")
    except TypeError:
        draw.text((cx - len(text) * 13, 118), text, font=FONT_VOL_NUM, fill=GLOW)
    x0, x1, y0, bar_h = 30, WIDTH - 30, 190, 28
    gap = 3
    seg_w = (x1 - x0 - gap * (VOL_SEGMENTS - 1)) / VOL_SEGMENTS
    level = max(0.0, min(float(VOL_SEGMENTS), float(displayed_volume) / (100.0 / VOL_SEGMENTS)))
    for index in range(VOL_SEGMENTS):
        sx = int(round(x0 + index * (seg_w + gap)))
        ex = int(round(sx + seg_w))
        if index + 1 <= level:
            color = GLOW
        elif index < level:
            color = mix_color(VOL_EMPTY, GLOW, level - index)
        else:
            color = VOL_EMPTY
        draw.rounded_rectangle((sx, y0, ex, y0 + bar_h), radius=2, fill=color)
    return img


# 屏幕是唯一的物理可见面：无论服务端/守护进程/网页端给来的 label 是中是英，
# 这里都兜底成中文「音乐DJ」语气，绝不把英文技术词或异常串画给用户。
LABEL_ZH = {
    "standby": "待命中", "idle": "待命中", "waiting": "连接中", "offline": "连接中",
    "now playing": "正在播放", "playing": "正在播放", "play": "正在播放",
    "paused": "已暂停", "pause": "已暂停",
    "voice command": "语音点播", "command queued": "已接令", "queued": "已接令",
    "busy": "音乐DJ 接令", "next track": "下一首", "previous track": "上一首",
    "city request": "切换城市", "dj request": "点播中", "24h radio": "24H 日落电台",
    "ambient memory": "环境记忆", "muted": "静音中",
}
SILENT_LABELS = {"muted", "静音中", "安静待命", "已暂停"}


def humanize_label(label):
    raw = str(label or "").strip()
    if not raw:
        return "待命中"
    mapped = LABEL_ZH.get(raw.lower())
    if mapped:
        return mapped
    # 未知 label：纯英文一律回退中文，拦住上游随时新增的英文 label（如守护进程的 "Ambient memory"），
    # 而不是每出一个就补一条映射。已是中文的 label 原样显示。
    if all(ord(ch) < 128 for ch in raw):
        return "音乐DJ 接令"
    return raw


def humanize_message(message):
    text = str(message or "").strip()
    if not text:
        return "音乐DJ 在线"
    ascii_count = sum(1 for ch in text if ord(ch) < 128)
    if ascii_count >= max(6, int(len(text) * 0.7)):
        return "音乐DJ 在线"  # 基本是英文/异常串 → 屏幕宁可留这句也不露怯
    return text


def humanize_summary(summary):
    # 设备状态角标（电量/温度/网络）去掉英文缩写，HAT 屏只露中文。
    return str(summary or "").replace("BAT", "电").replace("WiFi", "网")


def is_silent_state(raw_label, message=""):
    label = str(raw_label or "").strip().lower()
    return label in SILENT_LABELS or label.startswith("静音") or "静音" in str(message or "")


def avatar_pose_for_state(state, media_city):
    if not _HAS_AVATAR:
        return None
    status = str(state.get("status") or "idle").lower()
    raw_label = str(state.get("label") or "").strip()
    message = humanize_message(state.get("message"))
    pending = int(state.get("pending") or 0)
    is_muted = is_silent_state(raw_label, message)
    genre = frost_avatar.city_to_genre(media_city)
    avatar_mood = frost_avatar.state_to_mood(status, is_muted, pending)
    return frost_avatar.select_pose(genre, avatar_mood)


def avatar_pool_for_media(media_city):
    if not _HAS_AVATAR:
        return []
    return frost_avatar.avatar_pool(media_city)


def build_avatar_anim(pose):
    if not (_HAS_AVATAR and pose):
        return None
    tempo = pose.get("tempo") or 1.0
    motion = pose.get("motion", "idle")
    dur = frost_avatar.BASE_DUR.get(motion, 1.4) / (tempo if tempo > 0 else 1)
    ccx, ccy = AV_CX - AV_RX, AV_CY - AV_RY
    try:
        bg = frost_avatar.bg_region(pose, AV_RW, AV_RH, ccx, ccy, AV_BOX)
        body = frost_avatar.body_tile(pose, AV_BOX)
    except Exception as exc:
        print(f"[whisplay] anim build failed for {pose.get('id')}: {exc}", file=sys.stderr)
        return None
    return {
        "bg": bg,
        "body": body,
        "motion": motion,
        "dur": max(0.08, dur),
        "ccx": ccx,
        "ccy": ccy,
    }


def draw_status(state, device=None, avatar_pose=None, pet=None, ring=None, arm=None):
    # 不画外围边框：240×280 的屏本来就小，留白全部让给头像和正在播放卡。
    # ring：磁带盘/大圆脸/照片盘形态的当前帧（RGBA）；给了就贴它，不画头像。
    # arm：唱臂覆层（磁带盘/照片盘时传入，region 尺寸，贴在 AV 区偏移处）。
    img = Image.new("RGB", (WIDTH, HEIGHT), DARK)
    draw = ImageDraw.Draw(img)

    status = str(state.get("status") or "idle").lower()
    raw_label = str(state.get("label") or "").strip()
    message = humanize_message(state.get("message"))
    pending = int(state.get("pending") or 0)
    is_muted = is_silent_state(raw_label, message)
    media = media_from_state(state)
    media_city = media["city"]
    media_track = media["track"]
    media_artist = media["artist"]
    # 有没有「此刻真在放的歌」：静音/暂停/停止时守护进程发的都是 idle。
    # 这些「没歌」状态下，左上角城市名与底部歌名歌手一律留空——
    # 不拿上一次的残留（media_from_state 会回退到 last_media 缓存）糊屏。
    has_live_song = status == "playing" and not is_muted

    # 顶行只留 城市名（左）+ 时间（右）——SUNSET RADIO 字样撤掉，留白全给圆环。
    # 城市名左边缘 / 时间右边缘 分别对齐圆形的左右边缘（与底部歌名同一条边界）。
    # 神游时地名让位给去向（它「人」在那座城）。
    RING_LEFT = TRACK_TEXT_X
    RING_RIGHT = TRACK_TEXT_X + TRACK_TEXT_W
    pose = QUEUED_LINES if pending else BUSY_LINES if status in {"busy", "queued"} else DJ_LINES
    now_str = datetime.now().strftime("%H:%M")
    time_w = text_width(draw, now_str, FONT_SMALL)
    city_max = RING_RIGHT - RING_LEFT - time_w - 12  # 给右侧时间留出间隙
    drift = pet_drift_info(pet)
    if drift:
        fb_draw(draw, (RING_LEFT, 10), fb_fit(draw, f"神游 · {drift['city']}", 16, city_max), 16, GLOW)
    elif has_live_song:
        fb_draw(draw, (RING_LEFT, 10), fb_fit(draw, media_city, 16, city_max), 16, INK)
    # 没在放歌就只留右上角时间，城市名空着
    draw.text((RING_RIGHT - time_w, 12), now_str, font=FONT_SMALL, fill=MUTED)

    if ring is not None:
        img.paste(ring, (int(AV_CX - ring.width / 2), int(AV_CY - ring.height / 2)), ring)
        if arm is not None:
            img.paste(arm, (AV_RX, AV_RY), arm)
        drawn = True
    else:
        if avatar_pose is None:
            avatar_pose = avatar_pose_for_state(state, media_city)
        drawn = False
        if avatar_pose:
            try:
                frost_avatar.draw_avatar(img, avatar_pose, AV_CX, AV_CY, AV_BOX, lift=AV_BODY_LIFT)
                drawn = True
            except Exception as exc:
                print(f"[whisplay] avatar draw failed: {exc}", file=sys.stderr)
    if not drawn:
        y = 96
        for line in pose:
            draw.text((35, y), line, font=FONT_DJ, fill=RED if is_muted else GREEN if pending else INK)
            y += 17

    # 底部两行：歌名/歌手 自适应排版——只在真放歌时显示；静音/暂停/停止时留空，
    # 不糊上一次的残留信息。内容永远完整、边界锁在圆形左右边缘内、
    # 两行装不下自动降字号（绝不截字、绝不出屏）。
    if has_live_song:
        artist = "" if not media_artist or media_artist == "音乐DJ" else media_artist
        size, lines = layout_track_lines(draw, media_track, artist, TRACK_TEXT_W)
        line_colors = {"title": GLOW, "artist": INK, "mixed": GLOW}
        ys = {
            1: ((TRACK_LINE1_Y + TRACK_LINE2_Y) / 2,),
            2: (TRACK_LINE1_Y, TRACK_LINE2_Y),
            3: (243, 255, 267),  # 三行极端兜底：贴着圆底排，最后一行仍在屏内
        }[min(len(lines), 3)]
        for (text, role), y in zip(lines, ys):
            fb_draw(draw, ((WIDTH - fb_width(draw, text, size)) / 2, y), text, size, line_colors[role])
    return img


def create_board():
    if WHISPLAY_RUNTIME not in sys.path:
        sys.path.append(WHISPLAY_RUNTIME)
    from whisplay_client import (
        WhisplayDaemonProxy,
        DEFAULT_DAEMON_SOCKET_PATH,
        create_whisplay_hardware,
    )

    # launch_command 必须给：daemon 桌面菜单里长按橙键「打开」就是执行它——空命令会直接
    # 抛异常（长按毫无反应）。重启本服务后客户端重连即自动 focus.acquire 回到前台。
    # 用 sudo -n（非交互）：免密 sudo 失效时快速失败，不会挂住 daemon 的子进程。
    launch_cmd = "sudo -n systemctl restart sunset-radio-whisplay.service"
    daemon = WhisplayDaemonProxy(
        socket_path=DEFAULT_DAEMON_SOCKET_PATH,
        app_id="sunset-radio-status",
        display_name="Sunset Radio",
        icon="S",
        launch_command=launch_cmd,
    )
    if not daemon.ping():
        # 守护进程不在 → 退回官方逻辑（返回哑板 WhisplayBoard），行为与过去完全一致。
        return create_whisplay_hardware(
            app_id="sunset-radio-status",
            display_name="Sunset Radio",
            icon="S",
            launch_command=launch_cmd,
        )
    daemon.register()
    daemon.start_event_listener()
    # 耐心抢前台：抢不到就退避重试、**绝不崩溃退出**。否则 systemd Restart=always 会把本服务
    # 打进崩溃循环（真机实测 NRestarts=85），厂商桌面菜单反复被顶到前台——这正是「菜单老出现」
    # 的根因。守护进程一旦把屏让出来（桌面空闲，或你在菜单里选中 Sunset Radio）就安静接管。
    # 复用同一个 proxy 只重试 acquire，不重复 register/监听，避免漏 socket 与线程。
    #
    # 自动回家：被挡在门外连续超过 FG_RESCUE_SEC（默认 180s，误触进菜单/蓝牙页后没人管的场景），
    # 就重启厂商 whisplay-daemon 夺回屏幕——菜单是无状态的，重启无损；每个窗口最多救一次，
    # 救完计时清零，绝不连环重启。故意在菜单里操作的人有整整 3 分钟，不会被打断太狠。
    rescue_sec = float(os.environ.get("SUNSET_FG_RESCUE_SEC", "180"))
    delay = 2.0
    blocked_since = 0.0
    while True:
        try:
            daemon.acquire_foreground()
            return daemon
        except RuntimeError as exc:
            if "foreground" not in str(exc).lower():
                raise  # 非「前台被占」的错照常抛出
            now_ts = time.monotonic()
            if blocked_since <= 0:
                blocked_since = now_ts
            if rescue_sec > 0 and now_ts - blocked_since >= rescue_sec:
                print("[whisplay] 前台被占超时，自动回家：重启 whisplay-daemon 夺回屏幕", file=sys.stderr)
                subprocess.run(
                    ["sudo", "-n", "systemctl", "restart", "whisplay-daemon.service"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=False,
                )
                blocked_since = 0.0  # 本窗口已救过，重新计时
                delay = 2.0
                time.sleep(3.0)  # 给 daemon 起身时间；acquire 若因连接断而抛非 foreground 错，
                continue          # 会走 raise → systemd 重启本服务 → 干净重连，同样收敛回家
            print(f"[whisplay] 前台被占用，{delay:.0f}s 后重试（不崩溃退出）", file=sys.stderr)
            time.sleep(delay)
            delay = min(delay * 1.5, 15.0)


# 字幕卡快照：设了路径就把卡片帧/全屏重绘帧存成 PNG（远程验证用；空=关）。
INTERTITLE_SNAP = os.environ.get("SUNSET_INTERTITLE_SNAP", "")


def draw_intertitle(text, elapsed):
    """默片字幕卡：近黑底 + 奶油双细框 + 顶部小签名 + 居中多行文字，打字机按 elapsed 逐字显现。
    版式先用整段文字定死（打字过程行不跳），逐字只控制『显示到第几个字』。"""
    frame = Image.new("RGB", (WIDTH, HEIGHT), (8, 7, 6))
    draw = ImageDraw.Draw(frame)
    cream = (232, 217, 168)
    dim = (150, 138, 106)
    # 不加外框（试过双细框与机器人脸卡，用户拍板：越干净越像默片插卡）
    head = "· 弗洛斯特 ·"
    fb_draw(draw, ((WIDTH - fb_width(draw, head, 11)) / 2, 18), head, 11, dim)

    max_w = WIDTH - 48
    size, lh = 16, 24
    lines = _INTERTITLE.wrap_by_width(text, max_w, lambda s: fb_width(draw, s, size))
    max_lines = (HEIGHT - 96) // lh
    if len(lines) > max_lines:
        size, lh = 13, 19
        lines = _INTERTITLE.wrap_by_width(text, max_w, lambda s: fb_width(draw, s, size))
        lines = lines[: (HEIGHT - 96) // lh]

    shown = _INTERTITLE.reveal_count(elapsed, len(text))
    typing = shown < len(text)
    top = max(44, (HEIGHT - len(lines) * lh) / 2)
    remaining = shown
    for i, line in enumerate(lines):
        seg = line[: max(0, remaining)]
        x = (WIDTH - fb_width(draw, line, size)) / 2  # 用整行宽定 x：打字时行内位置即最终位置
        if seg:
            fb_draw(draw, (x, top + i * lh), seg, size, cream)
        if typing and remaining <= len(line):
            cx = x + fb_width(draw, seg, size)
            y0 = top + i * lh
            draw.rectangle((cx + 1, y0 + 3, cx + 3, y0 + lh - 7), fill=cream)  # 打字光标
            break
        remaining -= len(line)

    if INTERTITLE_SNAP:
        try:
            frame.save(INTERTITLE_SNAP)
        except Exception:
            pass
    return frame


def main():
    global last_media
    last_media = load_media_cache()
    board = create_board()
    try:
        board.on_button_press(on_button_press)
        board.on_button_release(on_button_release)
    except Exception:
        pass
    board.set_backlight(82)
    device = collect_device_status()
    last_device_at = 0.0
    state = dict(OFFLINE_STATE)
    pet = {}
    last_pet_at = 0.0
    pet_fresh_at = 0.0  # 最近一次拉取成功的时刻；停摆超时后清空快照，神游横幅不许无限滞留
    led_mood = None
    led_applied_at = 0.0
    last_screen_at = 0.0
    last_frame = None
    current_pool_key = None
    # 三形态调度：放歌时在 头像/磁带盘/大圆脸 之间随机切换
    form_sched = face_forms.FormScheduler() if _HAS_FORMS else None
    form_frames = None
    form_fps = 0.0
    form_started = 0.0
    if _HAS_FORMS:
        threading.Thread(target=lambda: face_forms.prewarm(AV_BOX), daemon=True).start()

    # 停针仪式状态：停播瞬间的定格盘面帧 + 截止时刻
    stop_hold_until = 0.0
    stop_ring = None
    prev_radio_playing = False

    # 形态身份 + 稀有客串触发（换城/神游归来）
    pet_identity = pet_form_identity()
    prev_pool_city = None
    prev_drift_on = False

    # 照片盘补给：下载和帧预转都在后台线程完成，主循环只消费成品——屏幕绝不等网络/渲染。
    # want_city：此刻照片盘该转谁的城——放歌/神游=当前城市；静默空转=每张随机换一座
    # （random_city 只会挑本地已有照片的电台城市，photo_prefetch_music 预取后全库可选）。
    photo_prep = {"ready": None, "busy": False, "want_city": "", "last_city": ""}

    def photo_prep_worker(city):
        try:
            got = _PHOTOS.get(city)
            if got is not None:
                frames = face_forms.photo_frames(AV_BOX, got[0], cache_key=got[1])
                photo_prep["ready"] = (frames, got[1])
        except Exception as exc:
            print(f"[whisplay] photo prep failed: {exc}", file=sys.stderr)
        finally:
            photo_prep["busy"] = False

    def photo_upkeep(pool_city, live):
        """live=放歌或神游中：照片必须是当前城市；静默空转：每备一张随机换一座城。"""
        if _PHOTOS is None or not _HAS_FORMS:
            return
        if live:
            photo_prep["want_city"] = str(pool_city or "")
        elif photo_prep["ready"] is None and not photo_prep["busy"]:
            # 上一张已被消费/作废，为下一张挑新城（避开刚转过的那座）
            photo_prep["want_city"] = _PHOTOS.random_city(exclude=photo_prep["last_city"]) \
                or str(pool_city or "")
        city = photo_prep["want_city"]
        if not city:
            return
        _PHOTOS.ensure(city)
        ready = photo_prep["ready"]
        if ready is not None and ready[1].split(":", 1)[0] != city:
            photo_prep["ready"] = None  # 换城/神游/回到放歌了：不合目标的照片作废，重新备
            ready = None
        if ready is None and not photo_prep["busy"] and _PHOTOS.peek(city):
            photo_prep["busy"] = True
            threading.Thread(target=photo_prep_worker, args=(city,), daemon=True).start()

    def photo_ready_now():
        """就绪 = 有成品且是「当前目标城」的成品：后台 worker 可能在换目标后才把旧帧回填，
        upkeep 的 1 秒清理来不及拦，抽签/消费前必须自己核对城市。"""
        ready = photo_prep["ready"]
        return ready is not None and ready[1].split(":", 1)[0] == photo_prep["want_city"]
    demo_until = 0.0
    last_demo_check = 0.0
    current_pool = []
    current_pose_index = 0
    current_pose = None
    current_anim = None
    last_state_at = 0.0
    last_full_draw_at = 0.0
    last_rotate_at = 0.0
    frame_dt = 1.0 / max(1.0, ANIM_FPS)
    volume_overlay_on = False
    displayed_volume = 0.0
    # 默片字幕卡状态：正在放映的文字 + 开演时刻 + 上次见过的消息（判新）
    card_text = ""
    card_started = 0.0
    card_prev_msg = None
    while True:
        now = time.monotonic()
        if now - last_state_at >= POLL_SEC:
            try:
                state = fetch_state()
            except Exception as exc:
                print(f"[whisplay] pi-state unreachable: {exc}", file=sys.stderr)
                state = dict(OFFLINE_STATE)
            last_state_at = now
            # 默片字幕卡触发：弗洛斯特的新回复上屏（瞬态/入队回显/心跳/歌名行由 should_show 过滤）
            if _INTERTITLE is not None:
                _msg = str(state.get("message") or "")
                if card_prev_msg is None:
                    card_prev_msg = _msg  # 服务启动首帧：旧消息不弹
                else:
                    _track = str(state.get("track") or "")
                    _artist = artist_from_message(_msg, _track)
                    _now_line = f"{_artist} - {_track}" if _artist and _track else ""
                    if _INTERTITLE.should_show(
                        card_prev_msg, _msg,
                        label=str(state.get("label") or ""),
                        city=str(state.get("city") or ""),
                        status=str(state.get("status") or ""),
                        now_playing_line=_now_line,
                    ):
                        card_text = _INTERTITLE.clip_text(_msg.removeprefix("静音中：").strip())
                        card_started = now
                        last_screen_at = 0.0  # 手机镜像尽快看到字幕卡
                    card_prev_msg = _msg
        if now - last_device_at > DEVICE_POLL_SEC:
            device = collect_device_status()
            last_device_at = now
        if now - last_pet_at >= PET_POLL_SEC:
            try:
                pet = fetch_pet()
                pet_fresh_at = now
            except Exception:
                # 拉不到沿用上一份快照，屏幕不抖；但停摆超过 120s 就清空——
                # 守护进程挂了以后，「神游中」横幅和目的地表情池不能一直演下去。
                if pet and now - pet_fresh_at > 120:
                    pet = {}
            last_pet_at = now
            mood = str((pet or {}).get("mood") or "")
            # LED 成功写入才记账，并每 30s 重申一次：写失败/被外部复位后灯色不会与情绪永久漂移。
            if mood != led_mood or (mood and now - led_applied_at > 30):
                color = PET_MOOD_LED.get(mood)
                if color:
                    try:
                        board.set_rgb_fade(*color, duration_ms=600)
                        led_mood = mood
                        led_applied_at = now
                    except Exception:
                        pass
                elif not mood:
                    led_mood = mood

        media = media_from_state(state)
        # 神游中头像/照片盘都跟目的地城市走 —— 它「人」在那座城。
        drift = pet_drift_info(pet)
        pool_city = drift["city"] if drift else media["city"]

        # 稀有客串的触发节点：换了城市（含神游启程）/ 神游归来
        cameo_due = False
        if prev_pool_city is not None and pool_city != prev_pool_city:
            cameo_due = True
        if prev_drift_on and not drift:
            cameo_due = True
        prev_pool_city = pool_city
        prev_drift_on = bool(drift)

        # ---- 形态调度：放歌（且没静音）才切换；选定身份后常驻本命形态池 ----
        # 「形态演示」窗例外：图书馆/路演现场无声看形态，守护进程写标记文件开 90 秒窗。
        radio_playing = (
            str(state.get("status") or "").lower() == "playing"
            and not is_silent_state(state.get("label"), state.get("message"))
        )
        if now - last_demo_check > 1.0:
            demo_until = form_demo_until()
            fresh_identity = pet_form_identity()
            if fresh_identity is not None:
                pet_identity = fresh_identity
            last_demo_check = now
            photo_upkeep(pool_city, radio_playing or bool(drift))
        demo_active = time.time() < demo_until
        if demo_active:
            radio_playing = True

        # ---- 停针仪式：播放中断瞬间，盘面先定格、唱臂抬起悬停一拍，再交还调度器回头像 ----
        # 唱片机身份例外：它是「一直在转的唱机」，静音/停播也照转不停针（用户点名）。
        if (
            form_sched is not None
            and prev_radio_playing
            and not radio_playing
            and form_frames
            and form_sched.form in (face_forms.FORM_TAPE, face_forms.FORM_PHOTO)
            and form_sched.identity != face_forms.IDENTITY_TURNTABLE
        ):
            stop_hold_until = now + STOP_HOLD_SEC
            stop_ring = face_forms.frame_at(form_frames, now - form_started, form_fps)
            last_full_draw_at = 0.0
            last_screen_at = 0.0  # 立即推一帧镜像，手机端同步看到抬臂
        prev_radio_playing = radio_playing
        if radio_playing:
            stop_hold_until = 0.0  # 恢复播放：唱臂立刻落回，盘继续转
            stop_ring = None
        in_stop_hold = not radio_playing and now < stop_hold_until and stop_ring is not None

        form_switched = False
        if form_sched is not None and not in_stop_hold:
            form_switched = form_sched.tick(
                time.time(),
                radio_playing,
                str((pet or {}).get("mood") or ""),
                demo=demo_active,
                photo_ready=photo_ready_now(),
                identity=pet_identity,
            )
            # 稀有客串：换城/神游归来时，非本命形态闪现几秒（演示窗/停针仪式期间不插队）
            if (
                cameo_due
                and not form_switched
                and not demo_active
                and radio_playing
                and form_sched.cameo(time.time(), photo_ready=photo_ready_now())
            ):
                form_switched = True
        if form_switched:
                # 旧盘面定格帧随切换作废：泊车态只准定格当前形态，不许显示上一形态/上一座城
                stop_ring = None
                stop_hold_until = 0.0
                if form_sched.form == face_forms.FORM_AVATAR:
                    form_frames = None
                    form_fps = 0.0
                    # 回到头像形态时随机跳一个新造型：别每次都停在同一张脸上等 6 秒轮播
                    if current_pool and len(current_pool) > 1:
                        current_pose_index = (
                            current_pose_index + form_sched.rng.randint(1, len(current_pool) - 1)
                        ) % len(current_pool)
                        current_pose = current_pool[current_pose_index]
                        current_anim = build_avatar_anim(current_pose)
                        last_rotate_at = now
                elif form_sched.form == face_forms.FORM_PHOTO:
                    # 只消费后台备好的成品（且必须是当前目标城的）；下一张由 upkeep 继续在后台备
                    prepped = photo_prep["ready"]
                    photo_prep["ready"] = None
                    if prepped is not None and prepped[1].split(":", 1)[0] == photo_prep["want_city"]:
                        form_frames, form_fps = prepped[0], face_forms.PHOTO_FPS
                        photo_prep["last_city"] = prepped[1].split(":", 1)[0]  # 静默随机换城时避开这座
                    else:
                        form_frames, form_fps = None, 0.0
                else:
                    try:
                        form_frames, form_fps = face_forms.frames_for(form_sched.form, form_sched.variant, AV_BOX)
                    except Exception as exc:
                        print(f"[whisplay] form frames failed: {exc}", file=sys.stderr)
                        form_frames = None
                        form_fps = 0.0
                form_started = now
                last_full_draw_at = 0.0  # 换形态立即全量重绘一次

        current_ring = None
        current_arm = None
        if in_stop_hold:
            # 停针仪式：盘面定格 + 抬起的唱臂（仅非唱片机身份的停播瞬间出现，3.2s 后回头像）
            current_ring = stop_ring if stop_ring is not None else (form_frames[0] if form_frames else None)
            current_arm = face_forms.tonearm_overlay(
                AV_RW, AV_RH, AV_CX - AV_RX, AV_CY - AV_RY, AV_BOX, lifted=True
            )
        elif form_frames:
            # 磁带盘/照片盘：一直转（唱片机身份待机也转）；唱臂落下压在盘面像老唱机运转
            current_ring = face_forms.frame_at(form_frames, now - form_started, form_fps)
            if form_sched is not None and form_sched.form in (face_forms.FORM_TAPE, face_forms.FORM_PHOTO):
                current_arm = face_forms.tonearm_overlay(AV_RW, AV_RH, AV_CX - AV_RX, AV_CY - AV_RY, AV_BOX)

        # 强情绪时钉住单个造型（神游中不钉，跟着目的地池走）。
        pinned_mood = None if drift else PET_PINNED_POSE_MOOD.get(str((pet or {}).get("mood") or ""))
        pool_key = (frost_avatar.pool_key(pool_city) + (f":{pinned_mood}" if pinned_mood else "")) if _HAS_AVATAR else ""
        if pool_key != current_pool_key:
            current_pool_key = pool_key
            current_pool = avatar_pool_for_media(pool_city)
            if pinned_mood and _HAS_AVATAR:
                pinned = frost_avatar.select_pose(frost_avatar.city_to_genre(pool_city), pinned_mood)
                if pinned:
                    current_pool = [pinned]
            current_pose_index = 0
            current_pose = current_pool[0] if current_pool else avatar_pose_for_state(state, pool_city)
            current_anim = build_avatar_anim(current_pose)
            last_rotate_at = now
            last_full_draw_at = 0.0
        elif current_pool and now - last_rotate_at >= ROTATE_SEC:
            current_pose_index = (current_pose_index + 1) % len(current_pool)
            current_pose = current_pool[current_pose_index]
            current_anim = build_avatar_anim(current_pose)
            last_rotate_at = now
            last_full_draw_at = 0.0
        elif current_pose is None:
            current_pose = avatar_pose_for_state(state, media["city"])
            current_anim = build_avatar_anim(current_pose)
            last_full_draw_at = 0.0

        volume_overlay = read_volume_overlay()
        if volume_overlay is not None:
            target = volume_overlay["volume"]
            if volume_overlay_on:
                displayed_volume += (target - displayed_volume) * 0.4
            else:
                displayed_volume = float(target)
            volume_overlay_on = True
            frame = draw_volume_overlay(
                draw_status(state, device, current_pose, pet, ring=current_ring, arm=current_arm),
                displayed_volume,
                target,
            )
            try:
                board.draw_image(0, 0, WIDTH, HEIGHT, rgb565_bytes(frame))
            except Exception:
                pass
            last_frame = frame
            last_full_draw_at = 0.0
            time.sleep(frame_dt)
            continue
        volume_overlay_on = False

        # 默片字幕卡：全屏临时卡（打字机），压过 DJ 动图；到期自然谢幕、强制重绘回原形态。
        # 音量覆层优先（上方 continue 先行）；形态调度器状态原封不动，卡结束即无缝回到 DJ 动图。
        if _INTERTITLE is not None and card_text:
            _elapsed = now - card_started
            if _elapsed < _INTERTITLE.total_duration(len(card_text)):
                frame = draw_intertitle(card_text, _elapsed)
                try:
                    board.draw_image(0, 0, WIDTH, HEIGHT, rgb565_bytes(frame))
                except Exception:
                    pass
                last_frame = frame
                last_full_draw_at = 0.0
                # 打字过程也让手机镜像跟上（比常规 5s 更勤一点）
                if SCREEN_POST_SEC > 0 and now - last_screen_at >= min(2.0, SCREEN_POST_SEC):
                    post_screen_frame(frame)
                    last_screen_at = now
                time.sleep(frame_dt)
                continue
            card_text = ""
            last_full_draw_at = 0.0  # 谢幕：强制全屏重绘回 DJ 动图

        if now - last_full_draw_at >= POLL_SEC or last_full_draw_at == 0.0:
            img = draw_status(state, device, current_pose, pet, ring=current_ring, arm=current_arm)
            board.draw_image(0, 0, WIDTH, HEIGHT, rgb565_bytes(img))
            last_frame = img
            last_full_draw_at = now
            if INTERTITLE_SNAP:
                try:
                    img.save(INTERTITLE_SNAP)
                except Exception:
                    pass

        # 屏幕镜像：低频把整屏画面推给手机端「崽」面板（后台线程，不阻塞渲染）。
        if SCREEN_POST_SEC > 0 and last_frame is not None and now - last_screen_at >= SCREEN_POST_SEC:
            post_screen_frame(last_frame)
            last_screen_at = now

        if current_ring is not None:
            # 磁带盘/大圆脸/照片盘形态：动画区 = 深底横带 + 当前帧（+ 唱臂）
            region = Image.new("RGB", (AV_RW, AV_RH), DARK)
            region.paste(current_ring, (int(AV_CX - AV_RX - current_ring.width / 2),
                                        int(AV_CY - AV_RY - current_ring.height / 2)), current_ring)
            if current_arm is not None:
                region.paste(current_arm, (0, 0), current_arm)
            try:
                board.draw_image(AV_RX, AV_RY, AV_RW, AV_RH, rgb565_bytes(region))
            except Exception:
                pass
        elif current_anim:
            phase = ((now - last_rotate_at) / current_anim["dur"]) % 1.0
            region = frost_avatar.render_region(
                current_anim["bg"],
                current_anim["body"],
                current_anim["motion"],
                phase,
                AV_BOX,
                current_anim["ccx"],
                current_anim["ccy"],
                lift=AV_BODY_LIFT,
            )
            try:
                board.draw_image(AV_RX, AV_RY, AV_RW, AV_RH, rgb565_bytes(region))
            except Exception:
                current_anim = None
        time.sleep(frame_dt)


if __name__ == "__main__":
    main()
