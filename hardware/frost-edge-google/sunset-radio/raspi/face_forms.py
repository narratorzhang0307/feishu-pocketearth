#!/usr/bin/env python3
"""Whisplay 大圆环的三形态：DJ 头像 / 磁带盘 / 彩底大圆脸。

形态语法（参考「屏幕形态参考/」四张图 + 拉斯维加斯 Sphere 的 Orbi）：
- avatar：现有 483 造型 DJ 头像（绘制在 frost_avatar，本模块只负责调度到它）；
- tape：黑胶/磁带盘 —— 密集同心刻纹 + 外圈频闪点环 + 红色唱标（仿 Technics SL-1200
  微缩表 WechatIMG7281），旋转感来自随角度转动的高光扇区、点环与唱标记号；
- face：彩色圆底大圆脸（仿 Insta360 Mic Pro 与 Sphere 的 Orbi）—— 屏是黑的，
  底有颜色表情才醒目；重点是用户最爱的「低垂眼」（WechatIMG7280）一族。

工程约定：
- 帧序列惰性预渲染 + 按 (form, variant, box) 缓存，主循环逐帧只做 paste；
- 调度器是纯逻辑（时钟/随机数可注入，可离线冒烟）：放歌时在三形态间随机切换，
  单形态最长 12 秒、不按固定顺序；不放歌时回到 avatar（磁带只在音乐转时转）。
"""

import math
import random

from PIL import Image, ImageChops, ImageDraw

FORM_AVATAR = "avatar"
FORM_TAPE = "tape"
FORM_FACE = "face"
FORM_PHOTO = "photo"   # 日落照片黑胶盘：那座城的黄昏像唱片一样转
FORMS = (FORM_AVATAR, FORM_TAPE, FORM_FACE, FORM_PHOTO)

FORM_MIN_SEC = 5.0
FORM_MAX_SEC = 12.0

# ---- 形态身份（拓麻歌子的「属性」）：用户选定后，崽就常驻这一族形态 ----
# 未选（""）= 幼年未定型，保持四形态随机轮播的旧行为。
IDENTITY_AVATAR = "avatar"        # 崽：DJ 机器人
IDENTITY_TURNTABLE = "turntable"  # 唱片机：磁带盘 ⇄ 日落照片盘（同族，都带唱臂）
IDENTITY_FACE = "face"            # 大圆脸：日落黄底
IDENTITIES = (IDENTITY_AVATAR, IDENTITY_TURNTABLE, IDENTITY_FACE)
IDENTITY_FORMS = {
    IDENTITY_AVATAR: (FORM_AVATAR,),
    IDENTITY_TURNTABLE: (FORM_TAPE, FORM_PHOTO),
    IDENTITY_FACE: (FORM_FACE,),
}
CAMEO_SEC = 6.0  # 稀有客串：换城市/神游归来时，非本命形态闪现这么久再变回来

# 大圆脸的底色统一为黄族双色（与崽的橙色机器人区分；黄也是日落的颜色）。
# 橙色底不再被调度器选中，但渲染能力保留（Web 端/旧数据仍可画）。
YELLOW_FAMILY = ("sphere_yellow", "insta_yellow")

# ---- 磁带盘变体：唱标颜色 ----
TAPE_VARIANTS = {
    "red": {"label": (206, 48, 38), "rim": (150, 30, 24)},        # 经典红标（7278/7281）
    "sunset": {"label": (255, 118, 66), "rim": (196, 78, 40)},    # 日落橙标
}

# ---- 大圆脸变体：底色 × 表情 ----
FACE_COLORS = {
    "sphere_yellow": {"base": (255, 206, 28), "shade": (226, 168, 8), "light": (255, 232, 120)},   # Sphere/Orbi 黄
    "insta_yellow": {"base": (244, 180, 12), "shade": (208, 142, 0), "light": (255, 214, 92)},     # 7279 左盘黄
    "insta_orange": {"base": (240, 96, 38), "shade": (198, 66, 20), "light": (255, 150, 96)},      # 7279 右盘橙
    "sunset_orange": {"base": (255, 140, 90), "shade": (216, 100, 56), "light": (255, 186, 148)},  # 咱们的日落橙
}
FACE_INK = (26, 18, 12)
EYE_WHITE = (252, 249, 242)

# 表情全集（参考图 7279/7280/7282~7289 + Orbi 的日常履历 + Sphere 网络热梗）。
# 全员黑眼系（蓝眼版被用户处决）；低垂眼一族（用户最爱 7280）给更高权重；
# 睡意类心情进一步偏向它们。
FACE_EXPRESSIONS = (
    "lidded", "lidded_low", "dozy", "sideeye", "sassy",
    "sparkle", "innocent", "panic", "wink", "yawn", "happy", "stars", "grumpy",
    "laugh", "dizzy", "shades", "cheeky", "zzz", "stare", "smug",
)
LIDDED_FAMILY = ("lidded", "lidded_low", "dozy", "yawn", "zzz")
FACE_WEIGHTS = {
    "lidded": 4, "lidded_low": 3, "dozy": 2, "sideeye": 2, "sassy": 1,
    "sparkle": 2, "innocent": 2, "panic": 1, "wink": 2, "yawn": 1, "happy": 2,
    "stars": 1, "grumpy": 1,
    "laugh": 2, "dizzy": 1, "shades": 2, "cheeky": 1, "zzz": 1, "stare": 2, "smug": 2,
}

# 大圆脸身份下的表情停留时长：用户点名「每种五六秒就换」——比形态级 dwell 快一倍多
FACE_DWELL_MIN_SEC = 4.5
FACE_DWELL_MAX_SEC = 6.0
# 唱片机身份下磁带盘 ⇄ 照片盘的停留时长：用户点名「每个保持十秒、来回切换」；
# 且不放歌也照转（唱片机不歇班，唱臂落下像老唱机一直在运转）
TURNTABLE_DWELL_MIN_SEC = 9.0
TURNTABLE_DWELL_MAX_SEC = 11.0
SLEEPY_MOODS = {"sleepy", "longing", "hungry"}
SPARKLE_BLUE = (188, 226, 248)   # 7286 泪光钻石 / 7283 眼周光晕的浅蓝
SWEAT_BLUE = (198, 219, 233)     # 7288 汗滴
HEART_RED = (233, 68, 96)
STAR_GOLD = (255, 246, 190)

TAPE_FRAMES = 24
FACE_FRAMES = 32
PHOTO_FRAMES = 72
TAPE_FPS = 12.0
FACE_FPS = 10.0
PHOTO_FPS = 6.0    # 72 帧 @6fps = 一圈 12 秒（用户嫌 3 秒太快，降到四分之一），5°/帧仍够顺滑

_FRAME_CACHE = {}
_FRAME_CACHE_LIMIT = 8  # 磁带两变体常驻 + 唱臂两姿态 + 最近几套大圆脸/照片盘（挤掉磁带会让重建卡主循环）


def prewarm(box):
    """启动预热：磁带盘在 Pi5 上一套要 ~1.2s，惰性构建会让屏幕卡一拍；
    开机丢到后台线程先焐热两种唱标，进磁带形态永远即点即转。"""
    for variant in TAPE_VARIANTS:
        tape_frames(box, variant)


# ---------------- 调度器（纯逻辑，可注入时钟/随机） ----------------

DEMO_MIN_SEC = 4.0
DEMO_MAX_SEC = 7.0


class FormScheduler:
    """放歌时：三形态随机切换，单形态 5~12s、下一形态不与当前重复（避免轮播感）。
    不放歌时：立即回到 avatar（磁带只该在音乐转动时转）。

    多样性保障（针对「怎么总是那几张脸」）：
    - 大圆脸表情走**洗牌袋**：15 款装袋洗匀逐个抽、抽空重洗——保证全部轮到且短期不重复；
      睡意心情不再改权重（会淹没新表情），改为 40% 概率「改抽」一张低垂眼族，气质仍在；
    - 底色/唱标都与上一次防重；
    - demo=True（「形态演示」窗）：节奏加快到 4~7s、出脸概率加倍、忽略心情偏置——
      表演模式的任务就是把全套表情秀出来。"""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.form = FORM_AVATAR
        self.variant = ""
        self.until_ts = 0.0
        self.started_ts = 0.0
        self.identity = ""      # ""=幼年未定型（随机轮播）；否则常驻 IDENTITY_FORMS[identity]
        self.in_cameo = False   # 稀有客串中：到期后回常驻池
        self._was_demo = False  # 上一拍是否演示窗：窗一关立即落回本命池，不再骑完旧 dwell
        self._face_bag = []
        self._last_color = ""
        self._last_tape = ""

    def _draw_expression(self):
        if not self._face_bag:
            self._face_bag = list(FACE_EXPRESSIONS)
            self.rng.shuffle(self._face_bag)
        return self._face_bag.pop()

    def _pick_variant(self, form, mood, demo=False):
        if form == FORM_TAPE:
            # 唱标锁经典红：照片盘中心复刻的是红标，两盘必须完全一致（用户点名），
            # 红/橙交替遂退役（sunset 变体仅保留渲染能力）
            self._last_tape = "red"
            return "red"
        if form == FORM_FACE:
            if not demo and str(mood or "") in SLEEPY_MOODS and self.rng.random() < 0.4:
                expr = self.rng.choice(LIDDED_FAMILY)  # 犯困/想你时四成概率来一张低垂眼，袋不消耗
            else:
                expr = self._draw_expression()
            colors = [c for c in YELLOW_FAMILY if c != self._last_color] or list(YELLOW_FAMILY)
            self._last_color = self.rng.choice(colors)
            return f"{self._last_color}:{expr}"
        return ""

    def tick(self, now_ts, playing, mood="", demo=False, photo_ready=False, identity=""):
        """返回 True 表示形态/变体发生了切换（调用方需重建帧源）。
        photo_ready：当前城市的日落照片是否已在本地缓存就绪——没就绪就不抽照片盘，
        绝不让屏幕等一次网络下载。
        identity：用户选定的形态身份；""=幼年未定型走随机轮播；demo 窗忽略身份
        （形态演示的任务就是把全套秀出来）。"""
        identity = identity if identity in IDENTITIES else ""
        identity_changed = identity != self.identity
        self.identity = identity
        if demo or not identity:
            self._was_demo = demo
            return self._tick_legacy(now_ts, playing, mood, demo, photo_ready)

        # ---- 身份模式：常驻 IDENTITY_FORMS[identity]，客串到期回归 ----
        pool = IDENTITY_FORMS[identity]
        demo_just_ended = self._was_demo
        self._was_demo = False
        if identity_changed or demo_just_ended:
            self.in_cameo = False
            return self._settle(now_ts, pool, mood, photo_ready)
        if not playing:
            if self.form not in pool:
                self.in_cameo = False
                return self._settle(now_ts, pool, mood, photo_ready)
            if identity in (IDENTITY_FACE, IDENTITY_TURNTABLE):
                # 大圆脸/唱片机都不歇班：不放歌也照常轮换（脸每 5~6s，唱盘每 ~10s
                # 磁带⇄照片来回切换，唱臂落下像老唱机一直在转）——用户点名
                if now_ts >= self.until_ts:
                    return self._settle(now_ts, pool, mood, photo_ready)
                return False
            # 崽的待机画面稳住（头像照常轮换由调用方管）
            self.until_ts = max(self.until_ts, now_ts + FORM_MIN_SEC)
            return False
        if now_ts < self.until_ts:
            return False
        self.in_cameo = False
        return self._settle(now_ts, pool, mood, photo_ready)

    def cameo(self, now_ts, photo_ready=False):
        """稀有客串：换城市/神游归来这类节点，让非本命形态闪现 CAMEO_SEC 秒。
        仅在选定身份后有意义；返回 True 表示切换发生（调用方需重建帧源）。"""
        if not self.identity:
            return False
        pool = IDENTITY_FORMS.get(self.identity, ())
        others = [f for f in FORMS if f not in pool and (f != FORM_PHOTO or photo_ready)]
        if not others:
            return False
        self.form = self.rng.choice(others)
        self.variant = self._pick_variant(self.form, "")
        self.started_ts = now_ts
        self.until_ts = now_ts + CAMEO_SEC
        self.in_cameo = True
        return True

    def _settle(self, now_ts, pool, mood, photo_ready):
        """落回常驻池并轮换（唱片机：磁带盘 ⇄ 照片盘；大圆脸：换表情）。"""
        options = [f for f in pool if f != FORM_PHOTO or photo_ready] or [FORM_TAPE]
        pick = [f for f in options if f != self.form] or options
        new_form = self.rng.choice(pick)
        new_variant = self._pick_variant(new_form, mood)
        changed = new_form != self.form or new_variant != self.variant
        self.form = new_form
        self.variant = new_variant
        self.started_ts = now_ts
        if new_form == FORM_FACE:
            # 大圆脸的表情走快节奏：每 4~5 秒换一张，一分钟能看十来种
            self.until_ts = now_ts + self.rng.uniform(FACE_DWELL_MIN_SEC, FACE_DWELL_MAX_SEC)
        elif new_form in (FORM_TAPE, FORM_PHOTO):
            # 磁带盘 ⇄ 照片盘：每个约十秒，来回切换
            self.until_ts = now_ts + self.rng.uniform(TURNTABLE_DWELL_MIN_SEC, TURNTABLE_DWELL_MAX_SEC)
        else:
            self.until_ts = now_ts + self.rng.uniform(FORM_MIN_SEC, FORM_MAX_SEC)
        return changed

    def _tick_legacy(self, now_ts, playing, mood, demo, photo_ready):
        if not playing:
            if self.form != FORM_AVATAR:
                self.form = FORM_AVATAR
                self.variant = ""
                self.until_ts = 0.0
                return True
            return False
        if now_ts < self.until_ts and self.form in FORMS:
            return False
        others = [
            f for f in FORMS
            if f != self.form and (f != FORM_PHOTO or photo_ready)
        ]
        if demo and FORM_FACE in others:
            # 表演模式出脸概率加倍：15 款表情才是观众要看的
            weights = [2 if f == FORM_FACE else 1 for f in others]
            self.form = self.rng.choices(others, weights=weights, k=1)[0]
        else:
            self.form = self.rng.choice(others)
        self.variant = self._pick_variant(self.form, mood, demo=demo)
        self.started_ts = now_ts
        if demo:
            self.until_ts = now_ts + self.rng.uniform(DEMO_MIN_SEC, DEMO_MAX_SEC)
        else:
            self.until_ts = now_ts + self.rng.uniform(FORM_MIN_SEC, FORM_MAX_SEC)
        return True


# ---------------- 通用 ----------------

def _cache_get(key, builder):
    frames = _FRAME_CACHE.get(key)
    if frames is None:
        frames = builder()
        _FRAME_CACHE[key] = frames
        while len(_FRAME_CACHE) > _FRAME_CACHE_LIMIT:
            _FRAME_CACHE.pop(next(iter(_FRAME_CACHE)))
    return frames


def frame_at(frames, elapsed_sec, fps):
    return frames[int(elapsed_sec * fps) % len(frames)]


# ---------------- 形态二：磁带盘 ----------------

# 实体盘的几何：盘体半径占框半径的比例（余下的边缘留给阴影与托盘垫底）
DISC_BODY_RATIO = 0.90


def _disc_bed(img, tp):
    """实体感盘托（仿网易云唱机）：盘缘外一圈由内向外渐淡的渲染阴影 +
    最外一道半透明浅色托盘垫底。画在盘体之前，盘体随后盖住中心；
    覆写语义正好形成台阶渐变，LANCZOS 缩采样后糊成柔和光影。"""
    d = ImageDraw.Draw(img)
    c = tp / 2
    # 半透明浅色垫底（托盘）：整圆铺到框边
    d.ellipse([0, 0, tp, tp], fill=(238, 232, 220, 46))
    # 盘缘阴影：同心实心圆逐级加深，紧贴盘体边缘
    for rr, alpha in ((0.945, 46), (0.932, 84), (0.919, 122), (0.906, 158)):
        r = tp / 2 * rr
        d.ellipse([c - r, c - r, c + r, c + r], fill=(12, 10, 9, alpha))


def _tape_static_base(tp, variant):
    """静态底盘：托盘垫底 + 盘缘阴影 + 黑胶基底 + 密集刻纹 + 唱标。tp 为超采样后边长。"""
    spec = TAPE_VARIANTS[variant]
    img = Image.new("RGBA", (tp, tp), (0, 0, 0, 0))
    _disc_bed(img, tp)
    draw = ImageDraw.Draw(img)
    c = tp / 2
    r_outer = tp / 2 * DISC_BODY_RATIO
    # 盘体基底（近黑）
    draw.ellipse([c - r_outer, c - r_outer, c + r_outer, c + r_outer], fill=(15, 16, 19, 255))
    # 密集刻纹：同心细环，半径向内亮度带状起伏（sheen band 制造「一圈圈」质感）
    r = r_outer * 0.96
    groove_gap = max(2, int(tp * 0.011))
    index = 0
    while r > tp * 0.185:
        band = 0.5 + 0.5 * math.sin(index * 0.7)
        tone = int(28 + 22 * band)
        draw.ellipse([c - r, c - r, c + r, c + r], outline=(tone, tone + 1, tone + 5, 255),
                     width=max(1, int(tp * 0.004)))
        r -= groove_gap
        index += 1
    # 唱标（中心圆）+ 环边 + 主轴孔
    r_label = tp * 0.16
    draw.ellipse([c - r_label, c - r_label, c + r_label, c + r_label], fill=spec["label"] + (255,))
    draw.ellipse([c - r_label, c - r_label, c + r_label, c + r_label],
                 outline=spec["rim"] + (255,), width=max(1, int(tp * 0.006)))
    # 唱标上的细环文字感（两圈浅色细线代替微缩文字）
    for rr in (r_label * 0.72, r_label * 0.5):
        draw.ellipse([c - rr, c - rr, c + rr, c + rr],
                     outline=(255, 255, 255, 46), width=max(1, int(tp * 0.0025)))
    r_hole = tp * 0.022
    draw.ellipse([c - r_hole, c - r_hole, c + r_hole, c + r_hole], fill=(230, 228, 222, 255))
    return img


def _tape_rotor(tp, variant):
    """随角度旋转的层：高光扇区 + 唱标记号。
    （原外圈频闪点环已撤——用户嫌像虚线不实体，盘缘改由阴影+托盘垫底表现。）"""
    spec = TAPE_VARIANTS[variant]
    img = Image.new("RGBA", (tp, tp), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    c = tp / 2
    # 高光扇区：两道对置的柔和亮楔（模拟盘面反光），收在盘体半径以内
    r_hi = tp / 2 * DISC_BODY_RATIO - tp * 0.004
    for start in (18, 198):
        draw.pieslice([c - r_hi, c - r_hi, c + r_hi, c + r_hi], start, start + 34,
                      fill=(255, 255, 255, 26))
    # 内侧再遮回基底色，让高光只落在刻纹带上
    r_in = tp * 0.185
    draw.ellipse([c - r_in, c - r_in, c + r_in, c + r_in], fill=(0, 0, 0, 0))
    # 唱标记号：label 边缘一个白点 + 对角一个刻痕点（旋转时最直观的「在转」线索）
    r_label = tp * 0.16
    mx = c + r_label * 0.7
    draw.ellipse([mx - tp * 0.012, c - tp * 0.012, mx + tp * 0.012, c + tp * 0.012],
                 fill=(255, 252, 246, 235))
    mx2 = c - r_label * 0.7
    draw.ellipse([mx2 - tp * 0.007, c - tp * 0.007, mx2 + tp * 0.007, c + tp * 0.007],
                 fill=spec["rim"] + (255,))
    return img


def tape_frames(box, variant="red", frames=TAPE_FRAMES, ss=3):
    """磁带盘旋转帧序列（RGBA box×box）。"""
    def build():
        tp = box * ss
        base = _tape_static_base(tp, variant)
        rotor = _tape_rotor(tp, variant)
        out = []
        for i in range(frames):
            angle = -(360.0 / frames) * i  # 顺时针
            frame = base.copy()
            frame.alpha_composite(rotor.rotate(angle, resample=Image.BICUBIC, center=(tp / 2, tp / 2)))
            out.append(frame.resize((box, box), Image.LANCZOS))
        return out
    return _cache_get(("tape", variant, box, frames), build)


# ---------------- 形态三：彩底大圆脸 ----------------

def _mix(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def _face_disc(draw, tp, palette):
    """彩色圆底：底色 + 底部收暗一弯 + 左上柔光斑（Sphere 的球体光感）。
    注意 ImageDraw 的半透明色是覆写不是混合——这里全部用实色混合，最后由圆形蒙版裁切。"""
    c = tp / 2
    r = tp / 2 - tp * 0.012
    base = palette["base"]
    draw.ellipse([c - r, c - r, c + r, c + r], fill=base + (255,))
    # 底部收暗：整圆先画深一档，再把上部盖回底色，留出下缘一弯阴影（蒙版会裁掉圆外溢出）
    draw.ellipse([c - r, c - r + tp * 0.06, c + r, c + r + tp * 0.06],
                 fill=_mix(base, palette["shade"], 0.55) + (255,))
    draw.ellipse([c - r, c - r, c + r, c + r - tp * 0.045], fill=base + (255,))
    # 左上柔光斑（实色：底色向亮色混 35%）
    draw.ellipse([c - r * 0.74, c - r * 0.80, c - r * 0.04, c - r * 0.20],
                 fill=_mix(base, palette["light"], 0.35) + (255,))


def _eye_lidded(draw, cx, cy, er, lid_ratio, pupil_drop, tp, palette, pupil_dx=0.0):
    """低垂眼（7280）：白圆眼 + 底色眼睑盖上半 + 睑线 + 下悬半月瞳。lid_ratio∈[0,1]。"""
    draw.ellipse([cx - er, cy - er, cx + er, cy + er], fill=EYE_WHITE + (255,))
    lid_y = cy - er + 2 * er * lid_ratio
    if lid_ratio >= 0.98:
        draw.ellipse([cx - er, cy - er, cx + er, cy + er], fill=palette["shade"] + (255,))
        draw.line([cx - er * 0.9, cy, cx + er * 0.9, cy], fill=FACE_INK + (255,), width=max(2, int(tp * 0.012)))
        return
    # 眼睑：用与底色同族的深一档颜色填充眼圆上部（弦形）
    lid = Image.new("RGBA", (int(er * 2 + 4), int(er * 2 + 4)), (0, 0, 0, 0))
    lid_draw = ImageDraw.Draw(lid)
    lid_draw.ellipse([2, 2, er * 2 + 2, er * 2 + 2], fill=palette["shade"] + (255,))
    lid_draw.rectangle([0, lid_y - (cy - er) + 2, er * 2 + 4, er * 2 + 4], fill=(0, 0, 0, 0))
    draw._image.alpha_composite(lid, (int(cx - er - 2), int(cy - er - 2)))
    # 睑线
    draw.line([cx - er * 0.98, lid_y, cx + er * 0.98, lid_y], fill=FACE_INK + (255,), width=max(2, int(tp * 0.011)))
    # 半月瞳：贴着睑线下缘
    pr = er * 0.52
    px = cx + pupil_dx
    pupil = Image.new("RGBA", (int(pr * 2), int(pr * 2)), (0, 0, 0, 0))
    ImageDraw.Draw(pupil).ellipse([0, 0, pr * 2, pr * 2], fill=FACE_INK + (255,))
    top_crop = int(pr * (1 - pupil_drop))
    pupil = pupil.crop((0, top_crop, int(pr * 2), int(pr * 2)))
    draw._image.alpha_composite(pupil, (int(px - pr), int(lid_y)))


class _FaceDraw:
    """带 _image 引用的 Draw 包装（供 alpha_composite 眼睑/瞳孔）。"""
    def __init__(self, image):
        self._image = image
        self._draw = ImageDraw.Draw(image)

    def __getattr__(self, name):
        return getattr(self._draw, name)


# ---- 小图形助手（形态三扩充表情用） ----

def _star_points(cx, cy, r_out, r_in, points=5, rot_deg=-90.0):
    out = []
    for k in range(points * 2):
        r = r_out if k % 2 == 0 else r_in
        a = math.radians(rot_deg + k * 180.0 / points)
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def _draw_heart(fd, cx, cy, s, color):
    """心形 ≈ 两圆 + 下三角。s 为半宽。"""
    r = s * 0.55
    fd.ellipse([cx - s, cy - s * 0.62 - r, cx - s + 2 * r, cy - s * 0.62 + r], fill=color)
    fd.ellipse([cx + s - 2 * r, cy - s * 0.62 - r, cx + s, cy - s * 0.62 + r], fill=color)
    fd.polygon([(cx - s * 0.98, cy - s * 0.42), (cx + s * 0.98, cy - s * 0.42), (cx, cy + s * 0.95)], fill=color)


def _draw_diamond(fd, cx, cy, s, color):
    fd.polygon([(cx, cy - s), (cx + s * 0.62, cy), (cx, cy + s), (cx - s * 0.62, cy)], fill=color)


def _draw_sweat(fd, cx, cy, s, color):
    """汗滴：上尖下圆。"""
    fd.polygon([(cx, cy - s * 1.1), (cx + s * 0.55, cy), (cx - s * 0.55, cy)], fill=color)
    fd.ellipse([cx - s * 0.58, cy - s * 0.35, cx + s * 0.58, cy + s * 0.8], fill=color)


def _face_features(fd, tp, palette, expr, phase):
    """按表情画五官；phase∈[0,1) 驱动微动画（瞳孔慢漂 + 循环末尾眨眼）。
    注意：RGBA 上直接画半透明会把盘面挖出洞（ImageDraw 是覆写不是叠加），
    渐隐一律用 _mix 实色往底色靠。"""
    if expr not in FACE_EXPRESSIONS:
        expr = "lidded"  # 未知变体回退用户最爱的低垂眼
    c = tp / 2
    blink = phase > 0.93  # 循环末尾一次眨眼
    drift = math.sin(2 * math.pi * phase) * tp * 0.012  # 瞳孔慢漂
    ink_w = max(2, int(tp * 0.014))

    if expr in ("lidded", "lidded_low"):
        er = tp * 0.150
        ey = c - tp * 0.03
        gap = tp * 0.185
        lid = 0.46 if expr == "lidded" else 0.60
        drop = 0.95 if expr == "lidded" else 0.7
        if blink:
            lid = 1.0
        _eye_lidded(fd, c - gap, ey, er, lid, drop, tp, palette, pupil_dx=drift)
        _eye_lidded(fd, c + gap, ey, er, lid, drop, tp, palette, pupil_dx=drift)
        if expr == "lidded_low":
            my = c + tp * 0.185
            fd.arc([c - tp * 0.05, my - tp * 0.03, c + tp * 0.05, my + tp * 0.03], 20, 160,
                   fill=FACE_INK + (255,), width=ink_w)
    elif expr == "dozy":
        # 全闭眼下垂弧（Orbi 打盹）+ 微张小嘴
        er = tp * 0.135
        ey = c - tp * 0.015
        gap = tp * 0.185
        bob = tp * 0.006 * math.sin(2 * math.pi * phase)
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.arc([ex - er, ey - er * 0.2 + bob, ex + er, ey + er * 1.25 + bob], 25, 155,
                   fill=FACE_INK + (255,), width=max(3, int(tp * 0.022)))
        my = c + tp * 0.19
        fd.ellipse([c - tp * 0.026, my - tp * 0.032, c + tp * 0.026, my + tp * 0.032], fill=FACE_INK + (255,))
    elif expr == "sideeye":
        # 无语平睑眼（Sphere 7282）：厚平睑线 + 睑下小瞳侧移 + 小圆嘴
        ew = tp * 0.155
        ey = c - tp * 0.035
        gap = tp * 0.185
        look = tp * 0.05 + drift
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.line([ex - ew, ey, ex + ew, ey], fill=FACE_INK + (255,), width=max(4, int(tp * 0.03)))
            if not blink:
                pr = tp * 0.052
                fd.pieslice([ex - pr + look, ey - pr * 0.15, ex + pr + look, ey + pr * 1.85], 0, 180,
                            fill=FACE_INK + (255,))
        my = c + tp * 0.16
        fd.ellipse([c - tp * 0.02 + look * 0.4, my - tp * 0.024, c + tp * 0.02 + look * 0.4, my + tp * 0.024],
                   fill=FACE_INK + (255,))
    elif expr == "sassy":
        # 白圆眼斜瞟 + 单挑眉（Sphere 7287）
        er = tp * 0.135
        ey = c - tp * 0.02
        gap = tp * 0.185
        look = tp * 0.045 + drift
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.ellipse([ex - er, ey - er, ex + er, ey + er], fill=EYE_WHITE + (255,))
            if blink:
                fd.line([ex - er * 0.8, ey, ex + er * 0.8, ey], fill=FACE_INK + (255,), width=ink_w)
            else:
                pr = er * 0.42
                fd.ellipse([ex - pr + look, ey - pr, ex + pr + look, ey + pr], fill=FACE_INK + (255,))
        # 右挑眉 + 左平眉
        fd.arc([c + gap - er, ey - er * 2.1, c + gap + er, ey - er * 0.6], 200, 330,
               fill=FACE_INK + (255,), width=ink_w)
        fd.line([c - gap - er * 0.8, ey - er * 1.45, c - gap + er * 0.75, ey - er * 1.6],
                fill=FACE_INK + (255,), width=ink_w)
        my = c + tp * 0.17
        fd.line([c - tp * 0.035, my, c + tp * 0.045, my - tp * 0.012], fill=FACE_INK + (255,),
                width=max(3, int(tp * 0.018)))
    elif expr == "sparkle":
        # 泪光钻石眼（7286）：黑亮大眼 + 蓝白钻石闪 + 委屈眉 + 小嘴；钻石随相位明灭
        er = tp * 0.145
        ey = c - tp * 0.02
        gap = tp * 0.185
        tw = 0.72 + 0.28 * math.sin(2 * math.pi * phase * 2)
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.ellipse([ex - er * 1.1, ey - er * 1.06, ex + er * 1.1, ey + er * 1.06], fill=SPARKLE_BLUE + (255,))
            fd.ellipse([ex - er, ey - er, ex + er, ey + er], fill=FACE_INK + (255,))
            fd.arc([ex - er * 0.85, ey - er * 0.2, ex + er * 0.85, ey + er * 1.02], 25, 155,
                   fill=SPARKLE_BLUE + (255,), width=max(2, int(tp * 0.010)))
            _draw_diamond(fd, ex - er * 0.22, ey - er * 0.12, er * 0.34 * tw, (255, 255, 255, 245))
            _draw_diamond(fd, ex + er * 0.42, ey + er * 0.3, er * 0.18 * (1.44 - tw), (255, 255, 255, 225))
            fd.arc([ex - er * 1.15, ey - er * 2.1, ex + er * 1.15, ey - er * 0.5], 215 if sx < 0 else 250,
                   290 if sx < 0 else 325, fill=FACE_INK + (255,), width=ink_w)
        fd.ellipse([c - tp * 0.022, c + tp * 0.155, c + tp * 0.022, c + tp * 0.195], fill=FACE_INK + (255,))
    elif expr == "innocent":
        # 无辜大圆眼（7283/7285）：白眼珠 + 浅蓝光晕圈 + 粗短眉 + 小圆嘴；瞳孔四处打量
        er = tp * 0.14
        ey = c - tp * 0.025
        gap = tp * 0.185
        look_x = math.sin(2 * math.pi * phase) * er * 0.28
        look_y = math.cos(2 * math.pi * phase * 0.5) * er * 0.14
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.ellipse([ex - er * 1.18, ey - er * 1.18, ex + er * 1.18, ey + er * 1.18], fill=SPARKLE_BLUE + (255,))
            fd.ellipse([ex - er, ey - er, ex + er, ey + er], fill=EYE_WHITE + (255,))
            if blink:
                fd.line([ex - er * 0.8, ey, ex + er * 0.8, ey], fill=FACE_INK + (255,), width=ink_w)
            else:
                pr = er * 0.46
                fd.ellipse([ex - pr + look_x, ey - pr + look_y, ex + pr + look_x, ey + pr + look_y],
                           fill=FACE_INK + (255,))
            fd.line([ex - er * 0.7, ey - er * 1.5, ex + er * 0.7, ey - er * 1.62],
                    fill=FACE_INK + (255,), width=max(3, int(tp * 0.02)))
        fd.ellipse([c - tp * 0.024, c + tp * 0.16, c + tp * 0.024, c + tp * 0.2], fill=FACE_INK + (255,))
    elif expr == "panic":
        # 冒汗慌张（7288）：高低眉 + 一大一小眼 + 小张嘴 + 下滑汗滴
        gap = tp * 0.185
        ey = c - tp * 0.02
        er_l, er_r = tp * 0.145, tp * 0.115
        fd.ellipse([c - gap - er_l, ey - er_l, c - gap + er_l, ey + er_l], fill=EYE_WHITE + (255,))
        fd.ellipse([c + gap - er_r, ey - er_r * 0.7, c + gap + er_r, ey + er_r], fill=EYE_WHITE + (255,))
        pr = tp * 0.038
        fd.ellipse([c - gap - pr, ey - pr, c - gap + pr, ey + pr], fill=FACE_INK + (255,))
        fd.ellipse([c + gap - pr * 0.9, ey - pr * 0.4, c + gap + pr * 0.9, ey + pr * 1.4], fill=FACE_INK + (255,))
        fd.arc([c - gap - er_l, ey - er_l * 2.3, c - gap + er_l, ey - er_l * 0.7], 200, 340,
               fill=FACE_INK + (255,), width=ink_w)
        fd.line([c + gap - er_r * 0.9, ey - er_r * 1.5, c + gap + er_r * 0.9, ey - er_r * 1.24],
                fill=FACE_INK + (255,), width=ink_w)
        fd.ellipse([c - tp * 0.03, c + tp * 0.15, c + tp * 0.03, c + tp * 0.21], fill=FACE_INK + (255,))
        slide = (phase * 1.6) % 1.0
        _draw_sweat(fd, c - gap - er_l * 1.5, ey - er_l * 1.4 + slide * tp * 0.1, tp * 0.03,
                    SWEAT_BLUE + (int(235 * (1 - slide * 0.5)),))
        _draw_sweat(fd, c + gap + er_r * 1.6, ey - er_r * 1.9 + ((slide + 0.45) % 1.0) * tp * 0.1, tp * 0.024,
                    SWEAT_BLUE + (int(235 * (1 - ((slide + 0.45) % 1.0) * 0.5)),))
    elif expr == "wink":
        # 眨单眼：平时双眼圆睁带笑，周期性右眼一闭
        er = tp * 0.13
        ey = c - tp * 0.02
        gap = tp * 0.185
        winking = 0.42 < phase < 0.6
        fd.ellipse([c - gap - er, ey - er, c - gap + er, ey + er], fill=EYE_WHITE + (255,))
        pr = er * 0.44
        fd.ellipse([c - gap - pr, ey - pr, c - gap + pr, ey + pr], fill=FACE_INK + (255,))
        if winking:
            fd.arc([c + gap - er, ey - er * 0.35, c + gap + er, ey + er * 1.1], 200, 340,
                   fill=FACE_INK + (255,), width=max(3, int(tp * 0.02)))
        else:
            fd.ellipse([c + gap - er, ey - er, c + gap + er, ey + er], fill=EYE_WHITE + (255,))
            fd.ellipse([c + gap - pr, ey - pr, c + gap + pr, ey + pr], fill=FACE_INK + (255,))
        my = c + tp * 0.16
        fd.arc([c - tp * 0.07, my - tp * 0.045, c + tp * 0.07, my + tp * 0.045], 15, 165,
               fill=FACE_INK + (255,), width=max(3, int(tp * 0.018)))
    elif expr == "yawn":
        # 打哈欠（Orbi 招牌）：眯紧双眼 + 随相位张大的嘴 + 眼角一滴泪
        gap = tp * 0.185
        ey = c - tp * 0.03
        er = tp * 0.12
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.arc([ex - er, ey - er * 0.1, ex + er, ey + er * 1.2], 25, 155,
                   fill=FACE_INK + (255,), width=max(3, int(tp * 0.022)))
        openness = max(0.0, math.sin(math.pi * ((phase * 1.4) % 1.0))) ** 1.5
        mry = tp * (0.03 + 0.085 * openness)
        mrx = tp * (0.045 + 0.035 * openness)
        my = c + tp * 0.165
        fd.ellipse([c - mrx, my - mry, c + mrx, my + mry], fill=FACE_INK + (255,))
        if openness > 0.5:
            fd.ellipse([c - mrx * 0.55, my + mry * 0.25, c + mrx * 0.55, my + mry * 0.85],
                       fill=_mix(FACE_INK, HEART_RED, 0.45) + (255,))
            _draw_sweat(fd, c + gap + er * 1.15, ey + er * 0.4, tp * 0.026, SPARKLE_BLUE + (235,))
    elif expr == "happy":
        # 弯月笑眼：∩∩ + 大笑嘴，整脸轻轻蹦
        bob = tp * 0.008 * math.sin(2 * math.pi * phase * 2)
        gap = tp * 0.185
        ey = c - tp * 0.03 + bob
        er = tp * 0.125
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.arc([ex - er, ey - er * 1.15, ex + er, ey + er * 0.55], 200, 340,
                   fill=FACE_INK + (255,), width=max(4, int(tp * 0.026)))
        my = c + tp * 0.14 + bob
        fd.arc([c - tp * 0.1, my - tp * 0.06, c + tp * 0.1, my + tp * 0.075], 15, 165,
               fill=FACE_INK + (255,), width=max(4, int(tp * 0.024)))
    elif expr == "stars":
        # 星星眼：金白五角星瞳孔，明灭微转
        tw = 0.86 + 0.14 * math.sin(2 * math.pi * phase * 2)
        rot = 6 * math.sin(2 * math.pi * phase)
        gap = tp * 0.185
        ey = c - tp * 0.02
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.polygon(_star_points(ex, ey, tp * 0.125 * tw, tp * 0.052 * tw, rot_deg=-90 + rot),
                       fill=FACE_INK + (255,))
            fd.polygon(_star_points(ex, ey, tp * 0.105 * tw, tp * 0.043 * tw, rot_deg=-90 + rot),
                       fill=STAR_GOLD + (255,))
        my = c + tp * 0.16
        fd.ellipse([c - tp * 0.03, my - tp * 0.03, c + tp * 0.03, my + tp * 0.03], fill=FACE_INK + (255,))
        fd.ellipse([c - tp * 0.018, my - tp * 0.002, c + tp * 0.018, my + tp * 0.024],
                   fill=_mix(FACE_INK, HEART_RED, 0.4) + (255,))
    elif expr == "grumpy":
        # 生气嘟嘴：内斜怒眉 + 上睑压平的眼 + 撇嘴
        gap = tp * 0.185
        ey = c - tp * 0.015
        er = tp * 0.115
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.ellipse([ex - er, ey - er * 0.55, ex + er, ey + er], fill=EYE_WHITE + (255,))
            fd.line([ex - er, ey - er * 0.55, ex + er, ey - er * 0.55], fill=FACE_INK + (255,),
                    width=max(3, int(tp * 0.018)))
            pr = er * 0.42
            px = ex - sx * er * 0.25 + drift * 0.4
            fd.ellipse([px - pr, ey - pr * 0.4, px + pr, ey + pr * 1.2], fill=FACE_INK + (255,))
            fd.line([ex - sx * er * 1.05, ey - er * 1.6, ex + sx * er * 0.75, ey - er * 1.05],
                    fill=FACE_INK + (255,), width=max(4, int(tp * 0.024)))
        my = c + tp * 0.165
        fd.arc([c - tp * 0.065, my - tp * 0.01, c + tp * 0.065, my + tp * 0.075], 195, 345,
               fill=FACE_INK + (255,), width=max(3, int(tp * 0.02)))
    elif expr == "laugh":
        # 哈哈大笑（Sphere 经典）：>< 眯眼 + 随节奏开合的 D 形嘴 + 整脸蹦跳
        bob = tp * 0.010 * math.sin(2 * math.pi * phase * 2)
        gap = tp * 0.185
        ey = c - tp * 0.035 + bob
        er = tp * 0.11
        w = max(4, int(tp * 0.026))
        for sx in (-1, 1):
            ex = c + sx * gap
            # > < ：折点朝中间挤（左眼 >、右眼 <），才是笑到眯起来的样子
            fd.line([ex + sx * er, ey - er * 0.7, ex - sx * er * 0.55, ey], fill=FACE_INK + (255,), width=w)
            fd.line([ex - sx * er * 0.55, ey, ex + sx * er, ey + er * 0.7], fill=FACE_INK + (255,), width=w)
        openness = 0.5 + 0.5 * abs(math.sin(2 * math.pi * phase))
        my = c + tp * 0.14 + bob
        mrx = tp * 0.09
        mry = tp * (0.03 + 0.075 * openness)
        fd.pieslice([c - mrx, my - mry * 0.55, c + mrx, my + mry], 0, 180, fill=FACE_INK + (255,))
        if openness > 0.55:
            fd.pieslice([c - mrx * 0.5, my + mry * 0.3, c + mrx * 0.5, my + mry * 0.92], 0, 180,
                        fill=_mix(FACE_INK, HEART_RED, 0.5) + (255,))
    elif expr == "dizzy":
        # 晕头转向：双眼螺旋反向打转 + 波浪嘴跟着晃
        gap = tp * 0.185
        ey = c - tp * 0.03
        er = tp * 0.125
        w = max(3, int(tp * 0.02))
        for sx in (-1, 1):
            ex = c + sx * gap
            rot = 2 * math.pi * phase * (1.0 if sx > 0 else -1.0)
            pts = []
            for k in range(46):
                t = k / 45.0
                a = rot + sx * t * math.pi * 3.6
                r = er * (0.12 + 0.88 * t)
                pts.append((ex + math.cos(a) * r, ey + math.sin(a) * r))
            fd.line(pts, fill=FACE_INK + (255,), width=w, joint="curve")
        my = c + tp * 0.17
        points = []
        for k in range(25):
            x = c - tp * 0.09 + (tp * 0.18) * k / 24
            points.append((x, my + math.sin(k / 24 * math.pi * 2.4 + phase * 6.28) * tp * 0.018))
        fd.line(points, fill=FACE_INK + (255,), width=max(3, int(tp * 0.02)), joint="curve")
    elif expr == "shades":
        # 墨镜酷脸（和崽的 DJ 墨镜梦幻联动）：一体黑镜 + 镜片高光来回扫 + 得意斜笑
        gap = tp * 0.185
        ey = c - tp * 0.035
        lw, lh = tp * 0.16, tp * 0.115
        rad = max(4, int(tp * 0.05))
        glint = -0.5 + (phase * 1.4) % 1.0  # 高光在镜片内往返
        gx = max(-0.5, min(0.5, glint * 1.6)) * lw
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.rounded_rectangle([ex - lw, ey - lh, ex + lw, ey + lh], radius=rad, fill=FACE_INK + (255,))
            fd.line([ex + gx - lw * 0.14, ey + lh * 0.62, ex + gx + lw * 0.22, ey - lh * 0.62],
                    fill=_mix(FACE_INK, EYE_WHITE, 0.42) + (255,), width=max(3, int(tp * 0.018)))
            # 镜腿甩向脸缘
            fd.line([ex + sx * lw, ey - lh * 0.35, ex + sx * (lw + tp * 0.09), ey - lh * 0.9],
                    fill=FACE_INK + (255,), width=max(4, int(tp * 0.024)))
        fd.line([c - gap + lw, ey - lh * 0.4, c + gap - lw, ey - lh * 0.4],
                fill=FACE_INK + (255,), width=max(4, int(tp * 0.028)))  # 镜桥
        my = c + tp * 0.175
        fd.arc([c - tp * 0.085, my - tp * 0.055, c + tp * 0.055, my + tp * 0.03], 20, 140,
               fill=FACE_INK + (255,), width=max(3, int(tp * 0.02)))
    elif expr == "cheeky":
        # 搞怪脸：左眼圆睁右眼笑眯 + 咧开的大弧笑（原吐舌版，舌头被用户嫌突兀去掉了）
        gap = tp * 0.185
        ey = c - tp * 0.025
        er = tp * 0.125
        fd.ellipse([c - gap - er, ey - er, c - gap + er, ey + er], fill=EYE_WHITE + (255,))
        pr = er * 0.44
        if blink:
            fd.line([c - gap - er * 0.8, ey, c - gap + er * 0.8, ey], fill=FACE_INK + (255,), width=ink_w)
        else:
            fd.ellipse([c - gap - pr + drift, ey - pr, c - gap + pr + drift, ey + pr], fill=FACE_INK + (255,))
        fd.arc([c + gap - er, ey - er * 1.1, c + gap + er, ey + er * 0.5], 200, 340,
               fill=FACE_INK + (255,), width=max(4, int(tp * 0.024)))
        my = c + tp * 0.135
        fd.arc([c - tp * 0.095, my - tp * 0.055, c + tp * 0.095, my + tp * 0.06], 10, 170,
               fill=FACE_INK + (255,), width=max(4, int(tp * 0.024)))
    elif expr == "zzz":
        # 睡着了：全闭下垂眼 + 头顶三个 Z 依次上飘渐隐（渐隐=往底色混，不能用透明度挖洞）
        gap = tp * 0.185
        ey = c - tp * 0.015
        er = tp * 0.13
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.arc([ex - er, ey - er * 0.1, ex + er, ey + er * 1.1], 25, 155,
                   fill=FACE_INK + (255,), width=max(3, int(tp * 0.022)))
        my = c + tp * 0.185
        fd.ellipse([c - tp * 0.018, my - tp * 0.018, c + tp * 0.018, my + tp * 0.018], fill=FACE_INK + (255,))
        for i, scale in enumerate((0.05, 0.038, 0.028)):
            zr = tp * scale
            t = (phase + i * 0.33) % 1.0
            zx = c + tp * (0.16 + 0.09 * i) + math.sin(t * 6.28) * tp * 0.012
            zy = c - tp * (0.10 + 0.13 * t + 0.09 * i)
            zc = _mix(FACE_INK, palette["base"], min(0.85, t * 1.1)) + (255,)
            w = max(3, int(tp * 0.016))
            fd.line([zx - zr, zy - zr, zx + zr, zy - zr], fill=zc, width=w)
            fd.line([zx + zr, zy - zr, zx - zr, zy + zr], fill=zc, width=w)
            fd.line([zx - zr, zy + zr, zx + zr, zy + zr], fill=zc, width=w)
    elif expr == "stare":
        # 浓眉盯人（7284）：光晕圈大眼 + 浓粗剑眉 + 小点嘴，瞳孔轻轻打量你
        gap = tp * 0.185
        ey = c - tp * 0.015
        er = tp * 0.135
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.ellipse([ex - er * 1.18, ey - er * 1.18, ex + er * 1.18, ey + er * 1.18],
                       fill=SPARKLE_BLUE + (255,))
            fd.ellipse([ex - er, ey - er, ex + er, ey + er], fill=EYE_WHITE + (255,))
            if blink:
                fd.line([ex - er * 0.8, ey, ex + er * 0.8, ey], fill=FACE_INK + (255,), width=ink_w)
            else:
                pr = er * 0.5
                fd.ellipse([ex - pr + drift, ey - pr, ex + pr + drift, ey + pr], fill=FACE_INK + (255,))
            # 剑眉：内低外高，粗到像 7284 那样有存在感
            fd.line([ex - sx * er * 0.35, ey - er * 1.28, ex + sx * er * 1.0, ey - er * 1.62],
                    fill=FACE_INK + (255,), width=max(5, int(tp * 0.036)))
        my = c + tp * 0.175
        fd.ellipse([c - tp * 0.022, my - tp * 0.022, c + tp * 0.022, my + tp * 0.022], fill=FACE_INK + (255,))
    else:  # smug —— 得意知情脸（7289）：平睑半月眼 + 睑下圆瞳 + 上挑斜笑
        gap = tp * 0.185
        ey = c - tp * 0.03
        er = tp * 0.13
        for sx in (-1, 1):
            ex = c + sx * gap
            fd.pieslice([ex - er, ey - er * 0.7, ex + er, ey + er * 1.15], 0, 180, fill=EYE_WHITE + (255,))
            if not blink:
                pr = er * 0.4
                fd.ellipse([ex - pr + drift, ey + pr * 0.1, ex + pr + drift, ey + pr * 1.6],
                           fill=FACE_INK + (255,))
            fd.line([ex - er, ey + er * 0.22, ex + er, ey + er * 0.22],
                    fill=FACE_INK + (255,), width=max(4, int(tp * 0.026)))
        my = c + tp * 0.16
        fd.arc([c - tp * 0.1, my - tp * 0.015, c + tp * 0.05, my + tp * 0.07], 200, 320,
               fill=FACE_INK + (255,), width=max(3, int(tp * 0.022)))


def face_frames(box, color_key="sphere_yellow", expr="lidded", frames=FACE_FRAMES, ss=3):
    """彩底大圆脸帧序列（RGBA box×box）。"""
    palette = FACE_COLORS.get(color_key) or FACE_COLORS["sphere_yellow"]
    if expr not in FACE_EXPRESSIONS:
        expr = "lidded"

    def build():
        tp = box * ss
        # 圆形蒙版：裁掉底部阴影/眉毛等一切圆外溢出，保证边缘干净
        mask = Image.new("L", (tp, tp), 0)
        c = tp / 2
        r = tp / 2 - tp * 0.012
        ImageDraw.Draw(mask).ellipse([c - r, c - r, c + r, c + r], fill=255)
        out = []
        for i in range(frames):
            phase = i / frames
            layer = Image.new("RGBA", (tp, tp), (0, 0, 0, 0))
            fd = _FaceDraw(layer)
            _face_disc(fd, tp, palette)
            _face_features(fd, tp, palette, expr, phase)
            layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
            out.append(layer.resize((box, box), Image.LANCZOS))
        return out
    return _cache_get(("face", color_key, expr, box, frames), build)


# ---------------- 形态四：日落照片黑胶盘（网易云式转碟） ----------------

def cover_fit(image, w, h):
    """等比放大裁切铺满 w×h（照片转圆盘前的预处理）。"""
    iw, ih = image.size
    scale = max(w / iw, h / ih)
    image = image.resize((max(1, int(iw * scale)), max(1, int(ih * scale))), Image.LANCZOS)
    x = (image.width - w) // 2
    y = (image.height - h) // 2
    return image.crop((x, y, x + w, y + h))


def photo_frames(box, image, cache_key, frames=PHOTO_FRAMES, ss=3):
    """把一张日落照片做成会转的黑胶盘：托盘垫底+盘缘阴影（与磁带盘同一套实体感）、
    圆形蒙版、中心用磁带盘同款红色唱标+白色轴孔+随盘转动的白点记号。
    cache_key 由调用方给（如城市+照片id），同图复用缓存。"""
    def build():
        tp = box * ss
        cx = tp // 2
        base = cover_fit(image.convert("RGBA"), tp, tp)
        r_disc = tp / 2 * DISC_BODY_RATIO
        mask = Image.new("L", (tp, tp), 0)
        ImageDraw.Draw(mask).ellipse([cx - r_disc, cx - r_disc, cx + r_disc, cx + r_disc], fill=255)
        bed = Image.new("RGBA", (tp, tp), (0, 0, 0, 0))
        _disc_bed(bed, tp)
        spec = TAPE_VARIANTS["red"]
        r_label = tp * 0.16
        r_hole = tp * 0.022
        out = []
        for i in range(frames):
            angle = -(360.0 / frames) * i
            photo = base.rotate(angle, resample=Image.BICUBIC, center=(cx, cx))
            frame = bed.copy()
            frame.paste(photo, (0, 0), mask)
            d = ImageDraw.Draw(frame)
            # 磁带盘同款唱标：红标 + 深红环边 + 两圈细线 + 白色轴孔
            d.ellipse([cx - r_label, cx - r_label, cx + r_label, cx + r_label], fill=spec["label"] + (255,))
            d.ellipse([cx - r_label, cx - r_label, cx + r_label, cx + r_label],
                      outline=spec["rim"] + (255,), width=max(1, int(tp * 0.006)))
            for rr in (r_label * 0.72, r_label * 0.5):
                d.ellipse([cx - rr, cx - rr, cx + rr, cx + rr],
                          outline=(255, 255, 255, 46), width=max(1, int(tp * 0.0025)))
            d.ellipse([cx - r_hole, cx - r_hole, cx + r_hole, cx + r_hole], fill=(230, 228, 222, 255))
            # 转动的白点 + 对角刻痕点（磁带盘同款记号，跟着盘一起转）。
            # 屏幕坐标 y 朝下：要与 PIL rotate(负角=顺时针) 的盘面同向，极角取 -angle
            a = math.radians(-angle)
            mx = cx + r_label * 0.7 * math.cos(a)
            my = cx + r_label * 0.7 * math.sin(a)
            d.ellipse([mx - tp * 0.012, my - tp * 0.012, mx + tp * 0.012, my + tp * 0.012],
                      fill=(255, 252, 246, 235))
            mx2 = cx - r_label * 0.7 * math.cos(a)
            my2 = cx - r_label * 0.7 * math.sin(a)
            d.ellipse([mx2 - tp * 0.007, my2 - tp * 0.007, mx2 + tp * 0.007, my2 + tp * 0.007],
                      fill=spec["rim"] + (255,))
            out.append(frame.resize((box, box), Image.LANCZOS))
        return out
    return _cache_get(("photo", cache_key, box, frames), build)


def tonearm_overlay(width, height, ccx, ccy, box, ss=3, lifted=False):
    """唱臂（网易云那根白色拨杆）：支点在右上角，臂身弧线搭到盘面上。
    lifted=False 是「针落在盘上」的运转姿态；lifted=True 是「抬臂」——
    整条臂绕支点向盘缘外旋 15°，配合盘面定格，就是老唱机停下来的样子。
    返回 width×height 的 RGBA 覆层，磁带盘/照片盘共用。"""
    def build():
        import math as _m
        tw, th = width * ss, height * ss
        img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        arm_c = (238, 236, 230, 255)
        arm_dark = (150, 148, 142, 255)
        # 支点：右上角一枚银白圆钮（含轴心暗点）
        px, py = int((width - 17) * ss), int(16 * ss)
        pr = int(8.5 * ss)
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=arm_c)
        d.ellipse([px - pr, py - pr, px + pr, py + pr], outline=(0, 0, 0, 70), width=ss)
        d.ellipse([px - 2 * ss, py - 2 * ss, px + 2 * ss, py + 2 * ss], fill=arm_dark)
        # 臂身：支点 → 垂直落下到肘 → 拐向盘面 2 点钟位置（NetEase 弯臂的姿态）
        elbow = (int((width - 24) * ss), int(58 * ss))
        head = (int((ccx + box * 0.275) * ss), int((ccy - box * 0.09) * ss))
        if lifted:
            # 抬臂：绕支点外旋，针尖从音轨摆回盘缘（-15° 时整臂仍在屏内）
            a = _m.radians(-15.0)

            def _swing(pt):
                dx, dy = pt[0] - px, pt[1] - py
                return (
                    px + dx * _m.cos(a) - dy * _m.sin(a),
                    py + dx * _m.sin(a) + dy * _m.cos(a),
                )

            elbow = _swing(elbow)
            head = _swing(head)
        w_arm = int(4.6 * ss)
        d.line([px, py, elbow[0], elbow[1]], fill=arm_c, width=w_arm)
        d.line([elbow[0], elbow[1], head[0], head[1]], fill=arm_c, width=w_arm)
        for joint, r in ((elbow, w_arm / 2), (head, w_arm / 2)):
            d.ellipse([joint[0] - r, joint[1] - r, joint[0] + r, joint[1] + r], fill=arm_c)
        # 唱头：臂末端一小节加宽的头壳 + 深色针尖
        ang = _m.atan2(head[1] - elbow[1], head[0] - elbow[0])
        hl, hw = 13 * ss, 8 * ss
        hx2 = head[0] + _m.cos(ang) * hl
        hy2 = head[1] + _m.sin(ang) * hl
        nx,ny = -_m.sin(ang), _m.cos(ang)
        d.polygon([
            (head[0] + nx * hw / 2, head[1] + ny * hw / 2),
            (head[0] - nx * hw / 2, head[1] - ny * hw / 2),
            (hx2 - nx * hw / 2, hy2 - ny * hw / 2),
            (hx2 + nx * hw / 2, hy2 + ny * hw / 2),
        ], fill=arm_c)
        d.ellipse([hx2 - 2.2 * ss, hy2 - 2.2 * ss, hx2 + 2.2 * ss, hy2 + 2.2 * ss], fill=arm_dark)
        return [img.resize((width, height), Image.LANCZOS)]
    return _cache_get(("tonearm", width, height, ccx, ccy, box, lifted), build)[0]


def frames_for(form, variant, box):
    """按调度器输出取帧序列与播放帧率。form=avatar 时返回 (None, 0)。"""
    if form == FORM_TAPE:
        return tape_frames(box, variant if variant in TAPE_VARIANTS else "red"), TAPE_FPS
    if form == FORM_FACE:
        color_key, _, expr = (variant or "").partition(":")
        return face_frames(box, color_key or "sphere_yellow", expr or "lidded"), FACE_FPS
    return None, 0.0
