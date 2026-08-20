#!/usr/bin/env python3
"""音乐DJ 方盒子动态头像 —— Whisplay 屏上的 Python/PIL 渲染器。

网页端那 483 个造型是 React + SVG（src/modules/frost-avatar/），本模块把同一套
「部件化 + 数据驱动」的渲染原生移植到 PIL：读 frost_poses.json 里的 pose 数据，
按当前播放城市的流派 + 播放状态挑造型，用 PIL 把盒子 + 五官 + 配件 + 道具画出来。
坐标系沿用 SVG 的 32×32；渲染时超采样再 LANCZOS 缩小，curve 才平滑。

用户可见处一律称「音乐DJ / DJ」；FrostBox / pose 只是内部代号。
"""
import json
import math
import os

from PIL import Image, ImageDraw

_HERE = os.path.dirname(os.path.abspath(__file__))

try:
    with open(os.path.join(_HERE, "frost_poses.json"), encoding="utf-8") as _h:
        _DATA = json.load(_h)
except Exception:
    _DATA = {"poses": [], "palettes": {}}

POSES = _DATA.get("poses", [])
PALETTES = _DATA.get("palettes", {})

# 招牌日落色板兜底（万一 json 没载入也不崩）。
_SUNSET = {
    "key": "sunset", "body": "#ff8c5a", "bodyDark": "#c8542a", "bodyLight": "#ffb088",
    "face": "#2a1626", "ink": "#ffe9d6", "accent": "#ffd166", "bg": "#1a0f2e", "glow": "#ff8c5a",
}


def palette(key):
    return PALETTES.get(key) or PALETTES.get("sunset") or _SUNSET


def select_pose(genre=None, mood=None):
    """按流派 + 情绪挑造型，逐级兜底，永远返回一个可画的 pose（port 自 selectFrostPose）。"""
    g = (genre or "sunset").lower()
    m = mood or "playing"

    def find(pred):
        for p in POSES:
            if pred(p):
                return p
        return None

    return (
        find(lambda p: p["genre"] == g and p["mood"] == m)
        or find(lambda p: p["genre"] == g and p["mood"] == "playing")
        or find(lambda p: p["genre"] == g)
        or find(lambda p: p["genre"] == "sunset" and p["mood"] == m)
        or find(lambda p: p["genre"] == "sunset" and p["mood"] == "playing")
        or (POSES[0] if POSES else None)
    )


# 城市（中文名）→ 流派。与 src/modules/frost-avatar/cityGenre.ts 保持一致。
CITY_GENRE = {
    "布宜诺斯艾利斯": "tango", "里约热内卢": "bossa", "圣保罗": "bossa", "墨西哥城": "mariachi",
    "哈瓦那": "cumbia", "卡利": "cumbia", "麦德林": "cumbia", "利马": "cumbia", "波哥大": "cumbia",
    "圣地亚哥": "cumbia", "圣多明各": "cumbia", "金斯敦": "reggae", "圣胡安": "reggae",
    "新奥尔良": "jazz", "孟菲斯": "blues", "芝加哥": "blues", "底特律": "soul", "费城": "soul",
    "纽约": "hiphop", "亚特兰大": "hiphop", "休斯顿": "hiphop", "洛杉矶": "hiphop", "多伦多": "hiphop",
    "迈阿密": "disco", "奥斯汀": "country", "西雅图": "rock", "旧金山": "psychedelic", "波士顿": "rock", "华盛顿": "punk",
    "拉各斯": "afrobeat", "阿克拉": "afrobeat", "金沙萨": "afrobeat", "达喀尔": "afrobeat", "内罗毕": "afrobeat", "阿比让": "afrobeat",
    "约翰内斯堡": "amapiano", "开普敦": "amapiano",
    "伦敦": "garage", "利物浦": "rock", "格拉斯哥": "celtic", "贝尔法斯特": "celtic", "都柏林": "celtic",
    "柏林": "electronic", "阿姆斯特丹": "electronic", "鹿特丹": "electronic", "斯德哥尔摩": "electronic",
    "哥本哈根": "electronic", "奥斯陆": "electronic", "马赛": "electronic", "巴黎": "jazz", "里斯本": "fado",
    "马德里": "flamenco", "巴塞罗那": "flamenco", "米兰": "opera", "罗马": "opera", "那不勒斯": "opera",
    "威尼斯": "classical", "维也纳": "classical", "圣彼得堡": "classical", "布拉格": "classical", "莫斯科": "classical",
    "赫尔辛基": "metal", "雷克雅未克": "dreampop",
    "东京": "citypop", "大阪": "citypop", "香港": "citypop", "台北": "citypop", "上海": "jazz", "北京": "rock", "首尔": "kpop",
    "孟买": "bollywood", "德里": "bollywood", "加尔各答": "bollywood", "班加罗尔": "bollywood", "墨尔本": "rock", "悉尼": "rock",
}


def city_to_genre(city_zh):
    key = (city_zh or "").strip()
    return CITY_GENRE.get(key, "sunset")


def _build_showcase():
    """全部造型排成一列：流派交错 + 每流派内部确定性打散，待机一开始就有表情变化。"""
    import random

    by_genre = {}
    for p in POSES:
        by_genre.setdefault(p["genre"], []).append(p)
    rng = random.Random(20260623)
    cols = []
    for lst in by_genre.values():
        shuffled = list(lst)
        rng.shuffle(shuffled)
        cols.append(shuffled)
    rng.shuffle(cols)
    order, r = [], 0
    while True:
        added = False
        for c in cols:
            if r < len(c):
                order.append(c[r])
                added = True
        if not added:
            break
        r += 1
    return order or list(POSES)


_SHOWCASE = _build_showcase()


def pool_key(city_zh):
    """轮播池标识：真实城市→其流派；其余(语音控制/待机/非城市)→showcase。"""
    c = (city_zh or "").strip()
    return CITY_GENRE[c] if c in CITY_GENRE else "showcase"


def avatar_pool(city_zh):
    """当前要轮播的一组造型：真实城市轮该流派全部表情；否则轮全流派 showcase。"""
    import random

    c = (city_zh or "").strip()
    if c in CITY_GENRE:
        genre = CITY_GENRE[c]
        pool = [p for p in POSES if p["genre"] == genre]
        if pool:
            random.Random(genre).shuffle(pool)
            return pool
    return _SHOWCASE


def state_to_mood(status, is_muted=False, pending=0):
    """Whisplay 的播放状态 → 头像情绪态（mood）。"""
    s = (status or "").lower()
    if is_muted:
        return "paused"
    if pending or s in {"queued", "busy"}:
        return "listening"
    if s in {"playing", "now playing", "play"}:
        return "playing"
    if s in {"groove"}:
        return "groove"
    return "idle"


# ---------------- 颜色 helper ----------------
def _hex(c):
    c = (c or "#000000").lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    try:
        return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))
    except ValueError:
        return (0, 0, 0)


def _rgba(c, a=1.0):
    r, g, b = _hex(c)
    return (r, g, b, max(0, min(255, int(a * 255))))


# ---------------- 画笔（SVG 坐标 → 像素，含超采样） ----------------
class _Painter:
    MARGIN = 1.0  # 32 单位四周各留 1，避免道具贴边裁切

    def __init__(self, draw, tile_px):
        self.d = draw
        self.S = tile_px / (32 + 2 * self.MARGIN)

    def _p(self, x, y):
        return ((x + self.MARGIN) * self.S, (y + self.MARGIN) * self.S)

    def _w(self, w):
        return max(1, int(round(w * self.S)))

    def circle(self, cx, cy, r, fill=None, fa=1.0, outline=None, ow=0, oa=1.0):
        x0, y0 = self._p(cx - r, cy - r)
        x1, y1 = self._p(cx + r, cy + r)
        self.d.ellipse([x0, y0, x1, y1],
                       fill=_rgba(fill, fa) if fill else None,
                       outline=_rgba(outline, oa) if outline else None,
                       width=self._w(ow) if ow else 1)

    def ellipse(self, cx, cy, rx, ry, fill=None, fa=1.0, outline=None, ow=0):
        x0, y0 = self._p(cx - rx, cy - ry)
        x1, y1 = self._p(cx + rx, cy + ry)
        self.d.ellipse([x0, y0, x1, y1],
                       fill=_rgba(fill, fa) if fill else None,
                       outline=_rgba(outline) if outline else None,
                       width=self._w(ow) if ow else 1)

    def rrect(self, x, y, w, h, r=0, fill=None, fa=1.0, outline=None, ow=0):
        box = [*self._p(x, y), *self._p(x + w, y + h)]
        rad = max(0, r * self.S)
        fl = _rgba(fill, fa) if fill else None
        ol = _rgba(outline) if outline else None
        if rad > 0:
            self.d.rounded_rectangle(box, radius=rad, fill=fl, outline=ol, width=self._w(ow) if ow else 1)
        else:
            self.d.rectangle(box, fill=fl, outline=ol, width=self._w(ow) if ow else 1)

    def line(self, pts, stroke, w, a=1.0):
        p = [self._p(x, y) for x, y in pts]
        self.d.line(p, fill=_rgba(stroke, a), width=self._w(w), joint="curve")
        # 圆头：两端补点，短弧看着顺
        rr = max(1, self._w(w) // 2)
        for (px, py) in (p[0], p[-1]):
            self.d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=_rgba(stroke, a))

    def poly(self, pts, fill=None, fa=1.0, outline=None, ow=0):
        p = [self._p(x, y) for x, y in pts]
        self.d.polygon(p, fill=_rgba(fill, fa) if fill else None,
                       outline=_rgba(outline) if outline else None)

    def pieslice(self, cx, cy, r, a0, a1, fill=None, fa=1.0):
        x0, y0 = self._p(cx - r, cy - r)
        x1, y1 = self._p(cx + r, cy + r)
        self.d.pieslice([x0, y0, x1, y1], a0, a1, fill=_rgba(fill, fa) if fill else None)

    @staticmethod
    def quad(s, c, e, n=14):
        out = []
        for i in range(n + 1):
            t = i / n
            mt = 1 - t
            out.append((mt * mt * s[0] + 2 * mt * t * c[0] + t * t * e[0],
                        mt * mt * s[1] + 2 * mt * t * c[1] + t * t * e[1]))
        return out

    @staticmethod
    def cubic(s, c1, c2, e, n=18):
        out = []
        for i in range(n + 1):
            t = i / n
            mt = 1 - t
            out.append((mt**3 * s[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t**3 * e[0],
                        mt**3 * s[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t**3 * e[1]))
        return out

    def qstroke(self, s, c, e, stroke, w, a=1.0, n=14):
        self.line(self.quad(s, c, e, n), stroke, w, a)

    def star(self, cx, cy, outer, inner, fill, fa=1.0):
        pts = []
        for i in range(10):
            r = outer if i % 2 == 0 else inner
            ang = math.pi / 5 * i - math.pi / 2
            pts.append((cx + math.cos(ang) * r, cy + math.sin(ang) * r))
        self.poly(pts, fill=fill, fa=fa)

    def heart(self, cx, cy, s, fill, fa=1.0):
        pts = self.cubic((cx, cy + s), (cx - s * 1.4, cy - s * 0.3), (cx - s * 0.6, cy - s * 1.2), (cx, cy - s * 0.4))
        pts += self.cubic((cx, cy - s * 0.4), (cx + s * 0.6, cy - s * 1.2), (cx + s * 1.4, cy - s * 0.3), (cx, cy + s))
        self.poly(pts, fill=fill, fa=fa)


# ---------------- 身体 ----------------
def _body(pn, p, glow):
    pn.rrect(6, 9, 20, 19, r=3.4, fill=p["body"], outline=p["bodyDark"], ow=0.8)
    pn.rrect(8, 10.4, 16, 2, r=1.6, fill=p["bodyLight"], fa=0.5)
    pn.rrect(9, 13, 14, 10, r=2.4, fill=p["face"], fa=0.92)
    pn.rrect(11, 8.2, 10, 1, r=0.5, fill=p["glow"], fa=0.9 if glow else 0.45)
    pn.rrect(10.5, 27.4, 2.4, 2.2, r=0.6, fill=p["bodyDark"])
    pn.rrect(19.1, 27.4, 2.4, 2.2, r=0.6, fill=p["bodyDark"])


# ---------------- 眼睛 ----------------
LEFT, RIGHT, EYE_Y = 12.5, 19.5, 16.0


def _eye(pn, shape, cx, cy, ink, accent, side):
    if shape == "wide":
        pn.circle(cx, cy, 2.1, fill=ink)
        pn.circle(cx + 0.6, cy - 0.6, 0.6, fill="#ffffff")
    elif shape == "happy":
        pn.qstroke((cx - 1.8, cy + 0.6), (cx, cy - 1.8), (cx + 1.8, cy + 0.6), ink, 0.9)
    elif shape == "closed":
        pn.rrect(cx - 1.7, cy - 0.4, 3.4, 0.9, r=0.4, fill=ink)
    elif shape == "wink":
        if side < 0:
            pn.qstroke((cx - 1.8, cy + 0.6), (cx, cy - 1.8), (cx + 1.8, cy + 0.6), ink, 0.9)
        else:
            pn.circle(cx, cy, 1.5, fill=ink)
    elif shape == "star":
        pn.star(cx, cy, 2.1, 1.0, accent)
    elif shape == "heart":
        pn.heart(cx, cy, 1.9, accent)
    elif shape == "spiral":
        pn.circle(cx, cy, 1.9, outline=ink, ow=0.7)
        pn.circle(cx, cy, 0.9, outline=ink, ow=0.7)
    elif shape == "half":
        pn.pieslice(cx, cy, 1.8, 180, 360, fill=ink)
        pn.rrect(cx - 1.9, cy, 3.8, 0.7, fill=ink)
    elif shape == "squint":
        pn.rrect(cx - 1.6, cy - 0.6, 3.2, 1.2, r=0.5, fill=ink)
    elif shape == "sleepy":
        pn.qstroke((cx - 1.8, cy - 0.4), (cx, cy + 1.4), (cx + 1.8, cy - 0.4), ink, 0.9)
    elif shape == "sparkle":
        pn.circle(cx, cy, 1.6, fill=ink)
        pn.line([(cx, cy - 2.6), (cx, cy + 2.6)], accent, 0.5)
        pn.line([(cx - 2.6, cy), (cx + 2.6, cy)], accent, 0.5)
    elif shape == "cross":
        if side < 0:
            pn.line([(cx - 1.6, cy - 1.4), (cx + 1.6, cy + 1.4)], ink, 1.0)
        else:
            pn.line([(cx + 1.6, cy - 1.4), (cx - 1.6, cy + 1.4)], ink, 1.0)
    elif shape == "side":
        pn.circle(cx + 0.9, cy, 1.5, fill=ink)
    elif shape == "up":
        pn.circle(cx, cy - 0.9, 1.5, fill=ink)
    elif shape == "tear":
        pn.circle(cx, cy, 1.6, fill=ink)
        pn.poly([(cx + 1.2, cy + 1.2), (cx + 1.8, cy + 2.6), (cx + 0.6, cy + 2.6)], fill=accent, fa=0.85)
    elif shape == "glow":
        pn.circle(cx, cy, 2.4, fill=accent, fa=0.35)
        pn.circle(cx, cy, 1.4, fill=accent)
    elif shape == "dizzy":
        pn.circle(cx, cy, 1.8, outline=ink, ow=0.55)
        pn.circle(cx, cy, 0.9, outline=ink, ow=0.55)
    elif shape == "sideglance":
        pn.circle(cx + 0.9, cy + 0.3, 1.3, fill=ink)
        pn.qstroke((cx - 1.8, cy - 1.2), (cx, cy - 1.8), (cx + 1.8, cy - 1.2), ink, 0.5)
    elif shape == "shut":
        pn.qstroke((cx - 1.7, cy - 0.6), (cx, cy + 1.1), (cx + 1.7, cy - 0.6), ink, 0.9)
    elif shape == "wideshine":
        pn.circle(cx, cy, 2.2, fill=ink)
        pn.circle(cx + 0.7, cy - 0.7, 0.7, fill="#ffffff")
        pn.circle(cx - 0.6, cy + 0.5, 0.35, fill="#ffffff", fa=0.8)
    elif shape == "lookdown":
        pn.circle(cx, cy + 0.7, 1.3, fill=ink)
        pn.qstroke((cx - 1.7, cy - 0.8), (cx, cy - 0.2), (cx + 1.7, cy - 0.8), ink, 0.5)
    elif shape == "roll":
        pn.pieslice(cx, cy, 1.6, 180, 360, fill=ink)
        pn.circle(cx, cy - 0.7, 0.8, fill=ink)
    elif shape == "blink":
        pn.line([(cx - 1.6, cy), (cx + 1.6, cy)], ink, 0.9)
        pn.qstroke((cx - 1.4, cy - 0.9), (cx, cy - 0.4), (cx + 1.4, cy - 0.9), ink, 0.4)
    elif shape == "glance":
        pn.circle(cx, cy, 1.6, outline=ink, ow=0.5)
        pn.circle(cx + 0.7, cy - 0.6, 0.8, fill=ink)
    elif shape == "sparkleeyes":
        pn.star(cx, cy, 2.0, 0.9, accent)
        pn.circle(cx + 0.6, cy - 0.6, 0.4, fill="#ffffff")
    elif shape == "puppy":
        pn.circle(cx, cy + 0.3, 2.0, fill=ink)
        pn.circle(cx + 0.6, cy - 0.5, 0.7, fill="#ffffff")
        pn.circle(cx - 0.5, cy + 0.6, 0.4, fill="#ffffff", fa=0.7)
    elif shape == "determined":
        pn.circle(cx, cy + 0.3, 1.2, fill=ink)
        if side < 0:
            pn.line([(cx - 1.8, cy - 1.6), (cx + 1.6, cy - 0.8)], ink, 0.8)
        else:
            pn.line([(cx + 1.8, cy - 1.6), (cx - 1.6, cy - 0.8)], ink, 0.8)
    else:  # dot / wobble / 默认
        pn.circle(cx, cy, 1.5, fill=ink)


def _eyes(pn, shape, p):
    _eye(pn, shape, LEFT, EYE_Y, p["ink"], p["accent"], -1)
    _eye(pn, shape, RIGHT, EYE_Y, p["ink"], p["accent"], 1)


# ---------------- 眉毛 ----------------
def _brow(pn, shape, p):
    if not shape or shape == "none":
        return
    y = 12.4
    ink = p["ink"]
    for cx, d in ((LEFT, -1), (RIGHT, 1)):
        if shape == "raise":
            pn.qstroke((cx - 1.6, y + 0.3), (cx, y - 0.9), (cx + 1.6, y + 0.3), ink, 0.7)
        elif shape == "furrow":
            pn.line([(cx - 1.6, y - 0.4), (cx + 1.6, y + 0.6 * d + 0.2)], ink, 0.8)
        elif shape == "tilt":
            pn.line([(cx - 1.6, y + 0.4 * d), (cx + 1.6, y - 0.4 * d)], ink, 0.8)
        elif shape == "wiggle":
            pn.line(pn.quad((cx - 1.6, y), (cx - 0.8, y - 0.8), (cx, y)) + pn.quad((cx, y), (cx + 0.8, y + 0.8), (cx + 1.6, y)), ink, 0.7)
        else:  # flat
            pn.rrect(cx - 1.5, y - 0.2, 3.0, 0.7, r=0.3, fill=ink)


# ---------------- 嘴 ----------------
def _mouth(pn, shape, p):
    cx, cy, ink = 16.0, 21.0, p["ink"]
    face, accent = p["face"], p["accent"]
    if shape == "smile":
        pn.qstroke((cx - 2.4, cy - 0.4), (cx, cy + 2.0), (cx + 2.4, cy - 0.4), ink, 0.9)
    elif shape == "grin":
        pn.poly(pn.quad((cx - 3, cy - 0.6), (cx, cy + 2.6), (cx + 3, cy - 0.6)), fill=ink)
    elif shape == "open":
        pn.ellipse(cx, cy + 0.4, 1.8, 2.2, fill=ink)
    elif shape == "o":
        pn.circle(cx, cy + 0.2, 1.4, fill=ink)
    elif shape == "cat":
        pn.line(pn.quad((cx - 2.4, cy), (cx - 1.2, cy + 1.4), (cx, cy)) + pn.quad((cx, cy), (cx + 1.2, cy + 1.4), (cx + 2.4, cy)), ink, 0.8)
    elif shape == "wave":
        seg = pn.quad((cx - 2.6, cy), (cx - 1.75, cy - 1.2), (cx - 0.9, cy))
        seg += pn.quad((cx - 0.9, cy), (cx - 0.05, cy + 1.2), (cx + 0.8, cy))
        seg += pn.quad((cx + 0.8, cy), (cx + 1.65, cy - 1.2), (cx + 2.5, cy))
        pn.line(seg, ink, 0.8)
    elif shape == "smirk":
        pn.qstroke((cx - 1.8, cy + 0.6), (cx + 1.0, cy + 1.4), (cx + 2.6, cy - 0.8), ink, 0.9)
    elif shape == "tongue":
        pn.qstroke((cx - 2.2, cy - 0.4), (cx, cy + 1.8), (cx + 2.2, cy - 0.4), ink, 0.9)
        pn.ellipse(cx + 0.4, cy + 1.4, 1.0, 1.3, fill=accent)
    elif shape == "whistle":
        pn.circle(cx + 1.0, cy + 0.2, 1.1, fill=ink)
    elif shape == "teeth":
        pn.rrect(cx - 2.4, cy - 0.8, 4.8, 2.4, r=0.4, fill=ink)
        for dx in (-1.4, 0, 1.4):
            pn.line([(cx + dx, cy - 0.8), (cx + dx, cy + 1.6)], face, 0.4)
    elif shape == "pout":
        pn.ellipse(cx, cy, 1.1, 1.5, fill=ink)
    elif shape == "gasp":
        pn.ellipse(cx, cy + 0.4, 1.4, 1.9, fill=ink)
    elif shape == "hum":
        pn.circle(cx, cy, 0.8, fill=ink)
    elif shape == "zigzag":
        pn.line([(cx - 2.6, cy), (cx - 1.3, cy - 1.2), (cx, cy), (cx + 1.3, cy - 1.2), (cx + 2.6, cy)], ink, 0.8)
    elif shape == "soft":
        pn.qstroke((cx - 1.8, cy), (cx, cy + 1.2), (cx + 1.8, cy), ink, 0.8)
    elif shape == "bigsmile":
        pn.poly(pn.quad((cx - 3.2, cy - 1), (cx, cy + 3.2), (cx + 3.2, cy - 1)), fill=ink)
        pn.line([(cx - 2.6, cy - 0.4), (cx + 2.6, cy - 0.4)], face, 0.6)
    elif shape == "zzz":
        pn.ellipse(cx, cy + 0.2, 1.0, 0.8, fill=ink)
        pn.line([(cx + 2.2, cy - 2.6), (cx + 3.5, cy - 2.6), (cx + 2.2, cy - 1.3), (cx + 3.5, cy - 1.3)], ink, 0.45)
    elif shape == "lipbite":
        pn.qstroke((cx - 1.8, cy - 0.2), (cx, cy + 1.0), (cx + 1.8, cy - 0.2), ink, 0.8)
        pn.rrect(cx - 1, cy - 0.9, 2, 0.7, r=0.2, fill=face)
    elif shape == "ohh":
        pn.ellipse(cx, cy + 0.3, 1.5, 2.0, fill=ink)
    elif shape == "raspberry":
        pn.qstroke((cx - 2, cy - 0.4), (cx, cy + 1.4), (cx + 2, cy - 0.4), ink, 0.8)
        pn.poly([(cx - 0.4, cy + 0.6), (cx - 1.6, cy + 1.2), (cx - 1.2, cy + 2.8), (cx + 0.4, cy + 2.0)], fill=accent)
    elif shape == "smug":
        pn.line(pn.quad((cx - 2, cy + 0.4), (cx - 1, cy + 1.0), (cx, cy + 0.4)) + pn.quad((cx, cy + 0.4), (cx + 1, cy - 0.2), (cx + 2, cy + 0.4)), ink, 0.8)
    elif shape == "toothygrin":
        pn.poly(pn.quad((cx - 2.8, cy - 0.6), (cx, cy + 2.4), (cx + 2.8, cy - 0.6)), fill=ink)
        pn.rrect(cx - 2.2, cy - 0.6, 4.4, 1.0, fill=face)
        for dx in (-1.1, 0, 1.1):
            pn.line([(cx + dx, cy - 0.6), (cx + dx, cy + 0.4)], ink, 0.3)
    elif shape == "frown":
        pn.qstroke((cx - 1.8, cy + 0.6), (cx, cy - 0.8), (cx + 1.8, cy + 0.6), ink, 0.8)
    elif shape == "kiss":
        pn.ellipse(cx, cy, 0.9, 1.1, fill=ink)
        pn.heart(cx + 2.4, cy - 1.4, 0.8, accent, fa=0.8)
    else:  # flat / 默认
        pn.rrect(cx - 2, cy - 0.3, 4, 0.8, r=0.4, fill=ink)


# ---------------- 配件 ----------------
def _accessory(pn, a, p):
    acc, dark, light, ink, glow, face = p["accent"], p["bodyDark"], p["bodyLight"], p["ink"], p["glow"], p["face"]
    if a in ("headphones", "headset", "earmuffs"):
        pn.qstroke((7.5, 14), (16, 4 if a == "headphones" else (5 if a == "headset" else 6)), (24.5, 14), acc, 1.1)
        if a == "earmuffs":
            pn.circle(7.5, 15, 2.4, fill=acc, outline=dark, ow=0.3)
            pn.circle(24.5, 15, 2.4, fill=acc, outline=dark, ow=0.3)
        else:
            pn.rrect(5.8, 13.5, 3, 5, r=1.2, fill=acc)
            pn.rrect(23.2, 13.5, 3, 5, r=1.2, fill=acc)
        if a == "headset":
            pn.qstroke((24.7, 18), (25, 21), (17.4, 21.5), acc, 0.6)
            pn.circle(17, 21.6, 0.7, fill=acc)
    elif a == "shades":
        pn.rrect(9, 14.2, 5.4, 3.4, r=0.6, fill=dark)
        pn.rrect(17.6, 14.2, 5.4, 3.4, r=0.6, fill=dark)
        pn.rrect(14.4, 15.2, 3.2, 0.8, fill=dark)
        pn.rrect(9.6, 14.8, 1.8, 0.7, fill=light, fa=0.7)
    elif a == "glasses":
        pn.circle(12.5, 16, 2.6, outline=ink, ow=0.7)
        pn.circle(19.5, 16, 2.6, outline=ink, ow=0.7)
        pn.line([(15.1, 16), (16.9, 16)], ink, 0.7)
    elif a == "monocle":
        pn.circle(19.5, 16, 2.5, outline=ink, ow=0.7)
    elif a == "cap":
        pn.poly(pn.quad((8, 9), (16, 3.5), (24, 9)) + [(24, 9.6), (8, 9.6)], fill=acc)
        pn.rrect(7, 9.2, 6, 1.4, r=0.6, fill=acc)
    elif a == "beanie":
        pn.poly(pn.quad((8, 9.4), (16, 2.8), (24, 9.4)), fill=acc)
        pn.rrect(7.6, 8.8, 16.8, 1.6, r=0.8, fill=dark)
    elif a == "hood":
        pn.poly(pn.quad((7, 13), (10, 6.5), (16, 7)) + pn.quad((16, 7), (22, 6.5), (25, 13)), fill=acc)
    elif a == "crown":
        pn.poly([(9, 8.6), (11, 4.6), (13.6, 7.4), (16, 3.8), (18.4, 7.4), (21, 4.6), (23, 8.6)], fill=acc, outline=dark, ow=0.3)
    elif a == "tiara":
        pn.poly([(11, 8.6), (13, 6), (16, 8), (19, 6), (21, 8.6)], fill=acc)
        pn.circle(16, 6.8, 0.7, fill=glow)
    elif a == "tophat":
        pn.rrect(10.5, 3, 11, 6, r=0.6, fill=dark)
        pn.rrect(7.5, 8.4, 17, 1.4, r=0.6, fill=dark)
        pn.rrect(10.5, 6.6, 11, 1.2, fill=acc)
    elif a == "beret":
        pn.ellipse(16, 7.6, 7, 2.8, fill=acc)
        pn.circle(16, 4.6, 0.9, fill=dark)
    elif a == "cowboyhat":
        pn.poly(pn.quad((9, 9), (16, 4), (23, 9)), fill=acc)
        pn.poly(pn.quad((5.5, 9.4), (16, 7), (26.5, 9.4)) + pn.quad((26.5, 9.4), (16, 11.4), (5.5, 9.4)), fill=acc)
    elif a == "sombrero":
        pn.ellipse(16, 9.2, 9.8, 1.9, fill=acc, outline=dark, ow=0.3)
        pn.poly(pn.quad((11.6, 9), (16, 3.2), (20.4, 9)), fill=acc)
    elif a == "partyhat":
        pn.poly([(16, 2), (12.5, 9), (19.5, 9)], fill=acc, outline=dark, ow=0.3)
        pn.circle(16, 2, 0.8, fill=glow)
    elif a == "bandana":
        pn.poly(pn.quad((7.6, 11), (16, 8), (24.4, 11)) + [(24.4, 12.6)] + pn.quad((16, 11), (16, 11), (7.6, 12.6)), fill=acc)
        pn.poly([(7.6, 11.6), (5.2, 13.2), (6.4, 15)], fill=acc)
    elif a == "sweatband":
        pn.rrect(7.6, 11.2, 16.8, 1.8, r=0.8, fill=acc)
    elif a == "mohawk":
        pn.poly([(14, 8.4), (14, 3), (18, 3), (18, 8.4)], fill=acc)
        for x in (15, 16, 17):
            pn.line([(x, 3), (x, 1)], dark, 0.3)
    elif a == "afro":
        for (x, y, r) in ((11, 8.6, 3), (21, 8.6, 3), (13.6, 6.8, 2.8), (18.4, 6.8, 2.8), (16, 6, 3)):
            pn.circle(x, y, r, fill=dark)
    elif a == "dreads":
        pn.rrect(8, 7.8, 16, 1.6, r=0.7, fill=dark)
        for (x, y2) in ((8.6, 13.5), (11, 12.4), (21, 12.4), (23.4, 13.5)):
            pn.line([(x, 9), (x, y2)], dark, 1.3)
    elif a == "horns":
        pn.poly(pn.quad((9.5, 8.6), (8, 5), (10, 4)) + pn.quad((10, 4), (10, 6.6), (11.4, 8.4)), fill=acc)
        pn.poly(pn.quad((22.5, 8.6), (24, 5), (22, 4)) + pn.quad((22, 4), (22, 6.6), (20.6, 8.4)), fill=acc)
    elif a == "antlers":
        pn.qstroke((11, 8.6), (9, 5), (10, 3), acc, 0.9)
        pn.qstroke((21, 8.6), (23, 5), (22, 3), acc, 0.9)
        pn.line([(10, 4.5), (8.4, 3.7)], acc, 0.9)
        pn.line([(22, 4.5), (23.6, 3.7)], acc, 0.9)
    elif a == "antenna":
        pn.line([(16, 8.6), (16, 4.4)], dark, 0.8)
        pn.circle(16, 3.6, 1.2, fill=acc)
    elif a == "halo":
        pn.ellipse(16, 5, 5.5, 1.6, outline=glow, ow=0.9)
    elif a == "laurels":
        pn.poly(pn.quad((9, 13), (6.5, 9.5), (8.5, 6)) + pn.quad((8.5, 6), (9, 9), (11, 12)), fill=acc)
        pn.poly(pn.quad((23, 13), (25.5, 9.5), (23.5, 6)) + pn.quad((23.5, 6), (23, 9), (21, 12)), fill=acc)
    elif a == "wreath":
        for d in (-70, -35, 0, 35, 70):
            r = math.radians(d - 90)
            pn.circle(16 + math.cos(r) * 7.5, 11 + math.sin(r) * 4, 1.0, fill=acc)
    elif a == "flower":
        for d in (0, 72, 144, 216, 288):
            r = math.radians(d)
            pn.circle(23 + math.cos(r) * 1.6, 8 + math.sin(r) * 1.6, 1.0, fill=acc)
        pn.circle(23, 8, 1.0, fill=glow)
    elif a == "headflower":
        for d in (0, 60, 120, 180, 240, 300):
            r = math.radians(d)
            pn.ellipse(21.5 + math.cos(r) * 2.2, 8 + math.sin(r) * 2.2, 1.5, 0.95, fill=acc)
        pn.circle(21.5, 8, 1.2, fill=glow)
    elif a == "feather":
        pn.poly(pn.quad((23, 9), (26, 3), (24.5, 2)) + [(23, 9)], fill=acc)
    elif a == "bow":
        pn.poly([(13, 6), (16, 8), (13, 10)], fill=acc)
        pn.poly([(19, 6), (16, 8), (19, 10)], fill=acc)
        pn.circle(16, 8, 0.9, fill=dark)
    elif a == "earring":
        pn.circle(7.2, 20, 0.9, fill=acc)
    elif a == "earpiece":
        pn.qstroke((22.6, 15.4), (24.4, 15.8), (24.1, 18), acc, 0.8)
        pn.qstroke((24, 17.6), (23.6, 20.6), (17.2, 21.4), acc, 0.6)
        pn.circle(17.2, 21.4, 0.7, fill=acc)
    elif a == "visor":
        pn.rrect(8.6, 13.6, 14.8, 3.6, r=1.4, fill=dark)
        pn.rrect(9.6, 14.4, 12.8, 1.0, r=0.5, fill=glow, fa=0.7)
    elif a == "eyepatch":
        pn.ellipse(12.5, 16, 2.4, 2.2, fill=dark)
        pn.line([(10.2, 14.6), (6.5, 12.5)], dark, 0.6)
        pn.line([(15, 14.6), (22, 11.5)], dark, 0.6)
    elif a == "snow":
        for (x, y, r) in ((11, 6, 0.6), (16, 4.4, 0.7), (21, 6, 0.6), (18, 7, 0.5)):
            pn.circle(x, y, r, fill=light, fa=0.9)
    elif a == "sparkles":
        for (x, y) in ((9, 7), (23, 7), (13, 4.5), (20, 5)):
            pn.poly([(x, y - 1), (x + 0.4, y), (x, y + 1), (x - 0.4, y)], fill=glow)
    elif a == "musicnote":
        pn.circle(24.5, 7.5, 1.1, fill=acc)
        pn.rrect(25.3, 3, 0.7, 4.8, fill=acc)
        pn.poly([(25.3, 3), (27.1, 3.4), (26.8, 5)], fill=acc)
    elif a == "sunset":
        pn.pieslice(16, 7, 3, 180, 360, fill=glow)
        pn.rrect(12.4, 7, 7.2, 0.6, fill=acc, fa=0.7)
    elif a == "mask":
        pts = pn.quad((8.5, 13), (16, 10.6), (23.5, 13)) + pn.quad((23.5, 13), (16, 17.6), (8.5, 13))
        pn.poly(pts, fill=acc, outline=dark, ow=0.3)
        pn.circle(12.5, 15.1, 1.6, fill=face)
        pn.circle(19.5, 15.1, 1.6, fill=face)
        pn.poly([(16, 10.8), (15.1, 8.6), (16.9, 8.6)], fill=glow)
    elif a == "fringe":
        pn.poly(pn.quad((8, 11.6), (16, 9), (24, 11.6)) + pn.quad((24, 15), (20, 12.8), (16, 14.4)) + pn.quad((16, 14.4), (12, 12.8), (8, 15)), fill=dark)
    elif a == "bindi":
        pn.star(16, 10.8, 1.0, 0.45, acc)
        pn.circle(16, 10.8, 0.45, fill=glow)
    elif a == "scarf":
        pn.poly(pn.quad((9, 22.4), (16, 24.4), (23, 22.4)) + [(23, 24)] + pn.quad((16, 26), (16, 26), (9, 24)), fill=acc)
        pn.poly([(20.6, 23.6), (22.2, 26.8), (20, 27.3)], fill=acc)
    elif a == "pin":
        pn.circle(11, 20, 1.3, fill=acc, outline=dark, ow=0.3)
        pn.star(11, 20, 0.8, 0.4, glow)
    # 其余未移植的配件先不画（graceful skip）


# ---------------- 道具 ----------------
def _prop(pn, prop, p):
    acc, dark, light, ink, glow, face, body = p["accent"], p["bodyDark"], p["bodyLight"], p["ink"], p["glow"], p["face"], p["body"]
    if not prop or prop == "none":
        return
    if prop == "mic":
        pn.circle(27, 18, 2, fill=dark)
        pn.rrect(26.5, 19.6, 1, 5, fill=ink)
    elif prop == "guitar":
        pn.ellipse(26.5, 22, 2.6, 3.4, fill=acc)
        pn.circle(26.5, 22, 1.0, fill=dark)
        pn.rrect(25.9, 11, 1.2, 9, fill=dark)
    elif prop == "bassguitar":
        pn.ellipse(26.5, 23, 2.4, 3.0, fill=dark)
        pn.rrect(26, 10, 1, 11, fill=acc)
    elif prop == "sax":
        pts = pn.quad((25, 12), (28, 12), (28, 17)) + pn.quad((28, 17), (28, 21), (31, 21)) + [(31, 23)] + pn.quad((31, 23), (26, 23), (26, 17))
        pn.poly(pts, fill=acc, outline=dark, ow=0.3)
        pn.circle(31, 23.4, 1.6, fill=acc)
    elif prop == "trumpet":
        pn.rrect(24, 17.4, 5, 1.6, r=0.4, fill=acc)
        pn.poly([(29, 16.4), (31.4, 15.4), (31.4, 20), (29, 19)], fill=acc)
    elif prop == "turntable":
        pn.rrect(24, 20, 7, 5, r=0.6, fill=dark)
        pn.circle(27.5, 22.5, 1.8, fill=ink)
        pn.circle(27.5, 22.5, 0.5, fill=acc)
    elif prop == "synth" or prop == "keytar":
        pn.rrect(23.5, 20.5, 8, 3.4, r=0.5, fill=dark)
        for x in (24.5, 26, 27.5, 29, 30.5):
            pn.line([(x, 20.5), (x, 23.9)], face, 0.4)
        pn.rrect(23.8, 19.7, 7.4, 0.9, fill=acc)
    elif prop == "drumstick":
        pn.line([(25, 25), (30, 19)], ink, 1.0)
        pn.line([(27, 26), (31.5, 21)], ink, 1.0)
    elif prop == "maraca":
        pn.circle(28, 18, 2, fill=acc)
        pn.rrect(27.5, 19.6, 1, 4, fill=dark)
    elif prop == "vinyl":
        pn.circle(27, 21, 3.2, fill=dark)
        pn.circle(27, 21, 1.0, fill=acc)
        pn.circle(27, 21, 0.3, fill=face)
    elif prop == "glowstick":
        pn.rrect(27, 16, 1.4, 7, r=0.7, fill=glow)
    elif prop == "teacup":
        pn.poly([(25, 20), (29, 20), (29, 22), (27, 23), (25, 22)], fill=light)
        pn.ellipse(26.6, 19, 1.0, 0.4, fill=glow, fa=0.5)
    elif prop == "baton":
        pn.rrect(25, 16, 6, 0.7, r=0.3, fill=light)
    elif prop == "cassette":
        pn.rrect(24, 19, 6.4, 4, r=0.5, fill=dark)
        pn.circle(26, 21, 0.7, fill=acc)
        pn.circle(28.4, 21, 0.7, fill=acc)
    elif prop == "flag":
        pn.rrect(26, 15, 0.6, 9, fill=ink)
        pn.rrect(26.6, 15, 4, 3, fill=acc)
    elif prop == "lyre":
        pn.line(pn.quad((25, 24), (24, 18), (27, 17)) + pn.quad((27, 17), (30, 18), (29, 24)), acc, 0.8)
        for x in (26, 27, 28):
            pn.line([(x, 19), (x, 23)], acc, 0.3)
    elif prop == "harmonica":
        pn.rrect(12.5, 20, 7, 2.2, r=0.4, fill=dark)
        for x in (14, 15.5, 17, 18.5):
            pn.line([(x, 20), (x, 22.2)], acc, 0.3)
    elif prop == "banjo":
        pn.circle(26.5, 22, 2.8, fill=light, outline=dark, ow=0.5)
        pn.circle(26.5, 22, 0.8, fill=dark)
        pn.rrect(26, 11, 1, 9, fill=dark)
    elif prop == "tambourine":
        pn.circle(27, 20, 2.6, outline=acc, ow=1.0)
        for d in (0, 90, 180, 270):
            r = math.radians(d)
            pn.circle(27 + math.cos(r) * 2.6, 20 + math.sin(r) * 2.6, 0.6, fill=glow)
    elif prop == "djembe":
        pn.poly([(25, 19), (29, 19), (28, 26), (26, 26)], fill=acc, outline=dark, ow=0.3)
        pn.ellipse(27, 19, 2.2, 0.9, fill=light, outline=dark, ow=0.4)
    elif prop == "conga":
        pn.poly([(25.4, 18), (29.4, 18), (28.8, 26), (26, 26)], fill=acc, outline=dark, ow=0.3)
        pn.ellipse(27.4, 18, 2.0, 0.8, fill=light, outline=dark, ow=0.3)
    elif prop == "fan":
        pn.poly([(27, 23), (22.5, 16.5)] + pn.quad((22.5, 16.5), (27, 13.5), (31.5, 16.5)), fill=acc, outline=dark, ow=0.3)
    elif prop == "rose":
        pn.circle(26.5, 18, 1.6, fill=acc)
        pn.circle(26.5, 18, 0.8, fill=dark, fa=0.5)
        pn.line([(26.5, 19.6), (25.5, 24)], body, 0.7)
    elif prop == "sitar":
        pn.ellipse(27.5, 24, 2.4, 2.0, fill=acc, outline=dark, ow=0.3)
        pn.rrect(26.8, 10, 1.2, 13, fill=dark)
        pn.circle(27.4, 10, 1.0, fill=acc)
    elif prop == "accordion":
        pn.rrect(24, 18, 2.6, 6, r=0.4, fill=dark)
        pn.rrect(29.4, 18, 2.6, 6, r=0.4, fill=dark)
        pn.line([(26.6, 18.6), (27.6, 19.6), (26.6, 20.6), (27.6, 21.6), (26.6, 22.6)], acc, 0.4)
    elif prop == "triangle":
        pn.line([(27, 16), (29.6, 21), (24.4, 21), (27, 16)], acc, 0.7)
    elif prop == "cowbell":
        pn.poly([(25.5, 18), (29.5, 18), (30.1, 23), (24.9, 23)], fill=acc, outline=dark, ow=0.3)
        pn.rrect(26.8, 22.6, 1.4, 0.8, fill=dark)
    elif prop == "handpan":
        pn.ellipse(27.5, 21, 3.2, 2.4, fill=dark, outline=acc, ow=0.4)
        pn.circle(27.5, 21, 0.9, fill=acc)
    elif prop == "tambo":
        pn.circle(27.5, 19, 2.2, fill=acc, outline=dark, ow=0.3)
        pn.rrect(27, 21, 1, 4, fill=dark)
    elif prop == "kalimba":
        pn.rrect(24.5, 19, 6, 5, r=0.6, fill=acc, outline=dark, ow=0.3)
        for (x, y2) in ((26, 22), (27, 22.5), (28, 22), (29, 21.5)):
            pn.line([(x, 19.5), (x, y2)], dark, 0.4)
    elif prop == "bell":
        pn.poly(pn.quad((25.5, 18), (27.5, 17), (29.5, 18)) + [(29.5, 22), (25.5, 22)], fill=acc, outline=dark, ow=0.3)
        pn.circle(27.5, 22.4, 0.6, fill=dark)
    # 其余未移植的道具先不画


# ---------------- 身体律动（port 自 frostBox.css 的 @keyframes） ----------------
# 各律动基础周期（秒），与 FrostBox.tsx 的 BASE_DUR 一致；tempo 在此基础上调速。
BASE_DUR = {
    "idle": 2.6, "bob": 0.9, "sway": 1.6, "headbang": 0.42, "spin": 1.8, "pulse": 0.7,
    "bounce": 0.8, "tilt": 2.2, "float": 3.4, "shiver": 0.18, "groove": 1.1, "jump": 0.9,
    "wave": 1.4, "march": 0.7, "lean": 3.0, "twirl": 1.5,
    "nod": 0.8, "stomp": 0.6, "shimmy": 0.32, "spinjump": 1.2, "sidestep": 1.0, "duck": 0.7,
}

DARK_RGB = (7, 10, 16)  # 与 whisplay_status.DARK 一致，作头像区背景


def motion_transform(motion, phase):
    """phase∈[0,1) → (tx, ty, deg, sx, sy)。tx/ty 是 size≈28 参考下的 CSS px（外部按 box 缩放），
    deg 为 CSS 顺时针角度，sx/sy 缩放。绕脚底律动；3D 转身用横向挤压近似。"""
    p = phase % 1.0
    c = math.cos(2 * math.pi * p)
    s = math.sin(2 * math.pi * p)
    tri = (1 - c) / 2  # 0→1→0
    if motion == "bob":
        return 0, -1.4 * tri, 0, 1, 1
    if motion == "nod":
        return 0, -0.6 * tri, 2 * tri, 1, 1
    if motion == "sway":
        return 0, 0, -5 * c, 1, 1
    if motion == "shimmy":
        return -0.8 * c, 0, -1.5 * c, 1, 1
    if motion == "sidestep":
        return -2 * c, 0, 0, 1, 1
    if motion == "headbang":
        return 0, 1.6 * tri, -6 + 14 * tri, 1, 1
    if motion == "tilt":
        return 0, 0, -9 + 6 * tri, 1, 1
    if motion == "lean":
        return 0, -0.6 * tri, 8 + 3 * tri, 1, 1
    if motion == "float":
        return 0, -2 * tri, -2 + 4 * tri, 1, 1
    if motion == "march":
        return 0, -1.2 * tri, -3 + 6 * tri, 1, 1
    if motion == "pulse":
        sc = 1 + 0.12 * tri
        return 0, 0, 0, sc, sc
    if motion == "idle":
        return 0, -0.3 * tri, 0, 1, 1 + 0.03 * tri
    if motion == "bounce":
        return 0, -2.4 * abs(s), 0, 1, 1
    if motion == "jump":
        return 0, -4 * tri, 0, 1, 0.9 + 0.18 * tri
    if motion == "duck":
        return 0, 2 * tri, 0, 1, 1 - 0.12 * tri
    if motion == "stomp":
        return 0, 1.3 * tri, 0, 1, 1 - 0.06 * tri
    if motion == "wave":
        return 0, 0, 6 * s, 1, 1
    if motion == "groove":
        return 1.2 * s, 0, -4 * c, 1, 1
    if motion == "twirl":
        return 0, 0, -8 * c, 1 - 0.08 * tri, 1
    if motion == "spin":
        return 0, 0, 0, max(0.32, abs(c)), 1
    if motion == "spinjump":
        return 0, -3 * tri, 0, max(0.32, abs(c)), 1
    if motion == "shiver":
        return 0.5 * s, 0.3 * math.sin(4 * math.pi * p), 0, 1, 1
    return 0, -0.3 * tri, 0, 1, 1 + 0.03 * tri  # idle 兜底


def _render_parts(pn, pose, p):
    _body(pn, p, pose.get("glow"))
    _brow(pn, pose.get("brow"), p)
    _eyes(pn, pose.get("eyes", "dot"), p)
    _mouth(pn, pose.get("mouth", "flat"), p)
    for a in (pose.get("accessories") or []):
        _accessory(pn, a, p)
    _prop(pn, pose.get("prop"), p)


def body_tile(pose, box, ss=4):
    """只画身体+五官+配件+道具（无底圈），透明 RGBA box×box。每个状态缓存一次，逐帧复用。"""
    p = palette(pose.get("palette"))
    tp = box * ss
    tile = Image.new("RGBA", (tp, tp), (0, 0, 0, 0))
    _render_parts(_Painter(ImageDraw.Draw(tile), tp), pose, p)
    return tile.resize((box, box), Image.LANCZOS)


def _circle_box(pose, box, ss=4):
    """底圈（bg 实心 + 发光描边），透明 RGBA box×box。"""
    p = palette(pose.get("palette"))
    tp = box * ss
    ct = Image.new("RGBA", (tp, tp), (0, 0, 0, 0))
    ImageDraw.Draw(ct).ellipse([ss, ss, tp - ss, tp - ss],
                               fill=_rgba(p["bg"], 1.0), outline=_rgba(p["accent"], 0.45), width=max(1, ss))
    return ct.resize((box, box), Image.LANCZOS)


def bg_region(pose, rw, rh, ccx, ccy, box, ss=4):
    """头像区背景：DARK 底 + 静态底圈。每个状态缓存一次（律动时底圈不动）。"""
    region = Image.new("RGB", (rw, rh), DARK_RGB)
    circ = _circle_box(pose, box, ss)
    region.paste(circ, (int(ccx - box / 2), int(ccy - box / 2)), circ)
    return region


def render_region(bg, body, motion, phase, box, ccx, ccy, lift=0):
    """逐帧：复制底圈背景，按律动变换身体，贴上去。返回头像区 RGB。
    lift：把身体在圆内整体上抬的像素（圆环不动）——大圆环放大后角色不再坐在圆底、而是圆内居中。"""
    region = bg.copy()
    tx, ty, deg, sx, sy = motion_transform(motion, phase)
    k = box / 28.0
    t = body
    if abs(sx - 1) > 1e-3 or abs(sy - 1) > 1e-3:
        nw = max(1, int(round(box * sx)))
        nh = max(1, int(round(box * sy)))
        t = body.resize((nw, nh), Image.BICUBIC)
    if abs(deg) > 1e-3:
        t = t.rotate(-deg, resample=Image.BICUBIC, expand=False)  # PIL 逆时针为正，CSS 顺时针为正
    px = int(round(ccx - t.width / 2 + tx * k))
    py = int(round((ccy + box / 2) - t.height + ty * k)) - lift  # 脚底对齐底圈下沿，再整体上抬 lift
    region.paste(t, (px, py), t)
    return region


def draw_avatar(target, pose, cx, cy, box, ss=4, lift=0):
    """静态：底圈 + 身体，画到 target 中心 (cx,cy)。供全屏一次性绘制 / 不动效兜底。
    lift：身体在圆内整体上抬的像素（圆环不动）。"""
    if not pose:
        return
    x0, y0 = int(cx - box / 2), int(cy - box / 2)
    circ = _circle_box(pose, box, ss)
    body = body_tile(pose, box, ss)
    target.paste(circ, (x0, y0), circ)
    target.paste(body, (x0, y0 - lift), body)
