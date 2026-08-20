#!/usr/bin/env python3
"""满屏脸 A/B 演示：整个屏幕就是 DJ 的脸（不再是圆盘），复用 face_forms 全套表情语言。
--png  只渲染三张样张到 /tmp（远程 QA 用）
--show 停机演示：真上屏轮播三种表情（各12s、带眨眼/瞳漂活体动画）后退出
"""
import math
import sys
import time

sys.path.insert(0, "/home/pi/sunset-radio/raspi")
from PIL import Image, ImageDraw  # noqa: E402
import face_forms as ff  # noqa: E402

W, H = 240, 280
TP = 310  # 特征画布边长：比屏大→五官放大，居中裁切后眼睛/嘴撑满屏幕
DEMO_EXPRS = ("lidded", "stars", "shades")  # 低垂眼(用户最爱)/星星眼/墨镜——与圆脸今日同款便于对比


def fullface_frame(expr, phase, color_key="sphere_yellow"):
    """整屏即脸：满铺底色 + 底部收暗一弯 + 左上柔光斑（保留 Sphere 球体光感的记忆），
    然后按 face_forms 的表情语言画五官，最后居中裁到屏幕尺寸。"""
    pal = ff.FACE_COLORS[color_key]
    img = Image.new("RGBA", (TP, TP), pal["base"] + (255,))
    d = ImageDraw.Draw(img)
    # 底部收暗（宽椭圆压出下缘弯影，同圆盘的处理手法）
    d.ellipse([-TP * 0.35, TP * 0.86, TP * 1.35, TP * 2.1],
              fill=ff._mix(pal["base"], pal["shade"], 0.55) + (255,))
    # 左上柔光斑
    d.ellipse([TP * 0.02, TP * 0.04, TP * 0.40, TP * 0.34],
              fill=ff._mix(pal["base"], pal["light"], 0.35) + (255,))
    fd = ff._FaceDraw(img)
    ff._face_features(fd, TP, pal, expr, phase)
    ox, oy = (TP - W) // 2, (TP - H) // 2
    return img.crop((ox, oy, ox + W, oy + H)).convert("RGB")


def render_pngs():
    for expr in DEMO_EXPRS:
        fullface_frame(expr, 0.30).save(f"/tmp/fullface_{expr}.png")
    print("PNG OK:", ", ".join(f"/tmp/fullface_{e}.png" for e in DEMO_EXPRS))


def show_on_screen(per_expr_sec=12.0, rounds=2, fps=10.0):
    import whisplay_status as w
    board = w.create_board()
    try:
        board.set_backlight(82)
    except Exception:
        pass
    dt = 1.0 / fps
    for _ in range(rounds):
        for expr in DEMO_EXPRS:
            start = time.monotonic()
            while time.monotonic() - start < per_expr_sec:
                phase = ((time.monotonic() - start) / 3.2) % 1.0  # 3.2s 一个微动画循环(含眨眼)
                frame = fullface_frame(expr, phase)
                try:
                    board.draw_image(0, 0, W, H, w.rgb565_bytes(frame))
                except Exception:
                    return  # 板子被抢/断开就体面退出，交还屏幕
                time.sleep(dt)
    print("DEMO DONE")


if __name__ == "__main__":
    if "--show" in sys.argv:
        show_on_screen()
    else:
        render_pngs()
