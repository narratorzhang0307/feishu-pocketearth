#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from PIL import Image

import face_forms
from whisplay_status import (
    AV_BOX, AV_CX, AV_CY, AV_RH, AV_RW, AV_RX, AV_RY,
    DARK, HEIGHT, RED, WIDTH, draw_status,
)

DEVICE_SAMPLE = {
    "battery": {"available": False},
    "temperatureC": 50.5,
    "ip": "192.168.18.118",
    "ipShort": "118",
    "audio": {"available": True, "muted": True, "volume": "Volume: 0.00 [MUTED]"},
}

SAMPLES = {
    "muted_city": {
        "status": "idle",
        "label": "Muted",
        "city": "东京",
        "track": "Plastic Love",
        "message": "静音中：竹内まりや - Plastic Love",
        "pending": 0,
    },
    "queued_voice": {
        "status": "queued",
        "label": "Voice command",
        "city": "Sunset Radio",
        "track": "",
        "message": "切到东京",
        "pending": 1,
    },
    "day_radio": {
        "status": "playing",
        "label": "24H radio",
        "city": "圣保罗",
        "track": "Da Ponte Pra Cá",
        "message": "音乐DJ 已经接上全天日落顺序。",
        "pending": 0,
    },
    "camera_doctor": {
        "status": "idle",
        "label": "Muted",
        "city": "相机医生",
        "track": "Sunset Radio",
        "message": "静音中：IMX708 相机待命；需要时再扫描此刻。",
        "pending": 0,
    },
    "camera_cable": {
        "status": "idle",
        "label": "Muted",
        "city": "相机排线",
        "track": "Sunset Radio",
        "message": "静音中：相机在线；环境观察会遵守隐私开关。",
        "pending": 0,
    },
    "pet_drift": {
        "status": "playing",
        "label": "Now playing",
        "city": "里斯本",
        "track": "Saudade",
        "message": "Amália - Saudade",
        "pending": 0,
    },
    "form_tape": {
        "status": "playing",
        "label": "Now playing",
        "city": "东京",
        "track": "Plastic Love",
        "message": "竹内まりや - Plastic Love",
        "pending": 0,
    },
    "form_face": {
        "status": "playing",
        "label": "Now playing",
        "city": "哈瓦那",
        "track": "Chan Chan",
        "message": "Buena Vista Social Club - Chan Chan",
        "pending": 0,
    },
    "form_photo": {
        "status": "playing",
        "label": "Now playing",
        "city": "里斯本",
        "track": "Saudade",
        "message": "Amália - Saudade",
        "pending": 0,
    },
    # 停针仪式：停播瞬间盘面定格 + 唱臂抬起（长按静音/暂停后的样子）
    "form_photo_stopped": {
        "status": "idle",
        "label": "已暂停",
        "city": "里斯本",
        "track": "Saudade",
        "message": "Amália - Saudade",
        "pending": 0,
    },
    # 自适应排版压测：长歌名短歌手 → 合并折两行（用户实拍出屏的那首）
    "long_title": {
        "status": "playing",
        "label": "Now playing",
        "city": "东京",
        "track": "Merry Christmas Mr. Lawrence",
        "message": "坂本龍一 - Merry Christmas Mr. Lawrence",
        "pending": 0,
    },
    # 自适应排版压测：歌名歌手都长 → 自动降字号，内容完整不出屏
    "long_both": {
        "status": "playing",
        "label": "Now playing",
        "city": "费城",
        "track": "Piano Concerto No. 2 in C Minor, Op. 18",
        "message": "Sergei Rachmaninoff & Philadelphia Orchestra - Piano Concerto No. 2 in C Minor, Op. 18",
        "pending": 0,
    },
}

# 磁带盘 / 大圆脸 / 照片盘形态样张：验证换形态后的整屏合成（标题 + 圆环帧 + 底部两行）
def _preview_sunset_photo():
    # 合成日落渐变 + 太阳，不碰网络
    from PIL import ImageDraw as _ImageDraw
    img = Image.new("RGB", (640, 428))
    px = img.load()
    for y in range(428):
        t = y / 428
        for x in range(640):
            px[x, y] = (int(252 - 140 * t), int(150 - 90 * t), int(90 + 10 * t))
    _ImageDraw.Draw(img).ellipse([260, 180, 380, 300], fill=(255, 235, 180))
    return img


RING_BY_SAMPLE = {
    "form_tape": lambda: face_forms.tape_frames(AV_BOX, "red")[3],
    "form_face": lambda: face_forms.face_frames(AV_BOX, "sphere_yellow", "lidded")[2],
    "form_photo": lambda: face_forms.photo_frames(AV_BOX, _preview_sunset_photo(), cache_key="preview", frames=8)[2],
    "form_photo_stopped": lambda: face_forms.photo_frames(AV_BOX, _preview_sunset_photo(), cache_key="preview", frames=8)[2],
}

# 唱臂覆层：磁带盘/照片盘样张要像老式唱机——臂搭在盘上；停针样张用抬起姿态
ARM_SAMPLES = {"form_tape", "form_photo", "form_photo_stopped"}
LIFTED_SAMPLES = {"form_photo_stopped"}

# 电子宠物快照样张：神游中的卡片第三行应显示去向而非城市名。
PET_BY_SAMPLE = {
    "pet_drift": {
        "mood": "drifting",
        "activity": "dusk_drift",
        "drift": {"cityNameZh": "里斯本", "sunsetClock": "20:52", "remainingMin": 21},
    },
}


def color_distance(a, b):
    return sum(abs(int(x) - int(y)) for x, y in zip(a, b))


def inspect_image(image, expect_muted=False):
    if image.size != (WIDTH, HEIGHT):
        return False, f"unexpected size {image.size}"
    rgb = image.convert("RGB")
    pixels = [rgb.getpixel((x, y)) for y in range(HEIGHT) for x in range(WIDTH)]
    non_dark = sum(1 for px in pixels if color_distance(px, DARK) > 18)
    red_pixels = sum(1 for px in pixels if color_distance(px, RED) < 90)
    if non_dark < 2800:
        return False, f"too few visible pixels: {non_dark}"
    if expect_muted and red_pixels < 90:
        return False, f"muted badge not visible enough: {red_pixels}"
    return True, {"nonDarkPixels": non_dark, "redPixels": red_pixels}


def main():
    parser = argparse.ArgumentParser(description="Render Whisplay status previews without hardware.")
    parser.add_argument("--out", default="/tmp/sunset-radio-whisplay-preview", help="Directory for PNG previews.")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    ok = True
    for name, state in SAMPLES.items():
        ring = RING_BY_SAMPLE[name]() if name in RING_BY_SAMPLE else None
        arm = None
        if name in ARM_SAMPLES:
            arm = face_forms.tonearm_overlay(
                AV_RW, AV_RH, AV_CX - AV_RX, AV_CY - AV_RY, AV_BOX, lifted=name in LIFTED_SAMPLES
            )
        image = draw_status(state, DEVICE_SAMPLE, None, PET_BY_SAMPLE.get(name), ring=ring, arm=arm)
        path = out_dir / f"{name}.png"
        image.save(path)
        passed, detail = inspect_image(image, expect_muted=name.startswith("muted"))
        ok = ok and passed
        results.append({
            "name": name,
            "passed": passed,
            "path": str(path),
            "detail": detail,
        })

    print(json.dumps({"ok": ok, "results": results}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
