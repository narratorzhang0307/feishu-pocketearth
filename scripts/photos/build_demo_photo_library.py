#!/usr/bin/env python3
"""Build an Android-importable Pocket Earth demo photo library.

The source dates in world-photos.json are an intentional demo timeline. This
script writes them into real JPEG EXIF and filesystem timestamps. It does not
change source files or place any generated photo under public/, so the APK does
not bundle this library.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import urllib.request
import zipfile
from datetime import datetime
from fractions import Fraction
from zoneinfo import ZoneInfo

import piexif
import piexif.helper
from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DATA = PROJECT_ROOT / "src/app/data/world-photos.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "deliverables/pocket-earth-demo-photo-library"
TIMEZONE = ZoneInfo("Asia/Shanghai")


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return cleaned[:64] or "photo"


def rational(value: float) -> tuple[int, int]:
    fraction = Fraction(value).limit_denominator(1_000_000)
    return fraction.numerator, fraction.denominator


def degrees(value: float) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    absolute = abs(value)
    whole = int(absolute)
    minutes_float = (absolute - whole) * 60
    minutes = int(minutes_float)
    seconds = (minutes_float - minutes) * 60
    return (whole, 1), (minutes, 1), rational(seconds)


def demo_datetime(date_text: str, index: int) -> datetime:
    date = datetime.strptime(date_text, "%Y-%m-%d")
    return date.replace(
        hour=8 + ((index * 7) % 12),
        minute=(index * 11) % 60,
        second=(index * 17) % 60,
        tzinfo=TIMEZONE,
    )


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "PocketEarthDemoLibrary/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def exif_bytes(record: dict, taken_at: datetime) -> bytes:
    exif_time = taken_at.strftime("%Y:%m:%d %H:%M:%S")
    author = (record.get("author") or "").strip()
    zeroth = {
        piexif.ImageIFD.ImageDescription: f"Pocket Earth demo timeline · {record['city']}".encode("utf-8"),
        piexif.ImageIFD.Software: b"Pocket Earth demo photo library builder",
        piexif.ImageIFD.DateTime: exif_time.encode("ascii"),
    }
    if author:
        zeroth[piexif.ImageIFD.Artist] = author.encode("utf-8")
    exif = {
        piexif.ExifIFD.DateTimeOriginal: exif_time.encode("ascii"),
        piexif.ExifIFD.DateTimeDigitized: exif_time.encode("ascii"),
        piexif.ExifIFD.OffsetTime: b"+08:00",
        piexif.ExifIFD.OffsetTimeOriginal: b"+08:00",
        piexif.ExifIFD.OffsetTimeDigitized: b"+08:00",
        piexif.ExifIFD.UserComment: piexif.helper.UserComment.dump(
            "Synthetic competition-demo timestamp; source attribution is in manifest.json",
            encoding="unicode",
        ),
    }
    latitude = float(record["lat"])
    longitude = float(record["lng"])
    gps = {
        piexif.GPSIFD.GPSLatitudeRef: ("N" if latitude >= 0 else "S").encode("ascii"),
        piexif.GPSIFD.GPSLatitude: degrees(latitude),
        piexif.GPSIFD.GPSLongitudeRef: ("E" if longitude >= 0 else "W").encode("ascii"),
        piexif.GPSIFD.GPSLongitude: degrees(longitude),
        piexif.GPSIFD.GPSDateStamp: taken_at.strftime("%Y:%m:%d").encode("ascii"),
    }
    return piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps, "1st": {}, "thumbnail": None})


def write_jpeg(blob: bytes, target: Path, record: dict, taken_at: datetime) -> tuple[int, int]:
    with Image.open(io.BytesIO(blob)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        icc_profile = source.info.get("icc_profile")
        save_options = {
            "format": "JPEG",
            "quality": 92,
            "optimize": True,
            "exif": exif_bytes(record, taken_at),
        }
        if icc_profile:
            save_options["icc_profile"] = icc_profile
        image.save(target, **save_options)
        width, height = image.size
    timestamp = taken_at.timestamp()
    os.utime(target, (timestamp, timestamp))
    return width, height


def verify_photo(path: Path, expected: datetime) -> dict:
    data = piexif.load(str(path))
    expected_exif = expected.strftime("%Y:%m:%d %H:%M:%S")
    actual = data["Exif"].get(piexif.ExifIFD.DateTimeOriginal, b"").decode("ascii")
    if actual != expected_exif:
        raise RuntimeError(f"{path.name}: DateTimeOriginal={actual!r}, expected {expected_exif!r}")
    if piexif.GPSIFD.GPSLatitude not in data["GPS"] or piexif.GPSIFD.GPSLongitude not in data["GPS"]:
        raise RuntimeError(f"{path.name}: GPS EXIF missing")
    mtime_delta = abs(path.stat().st_mtime - expected.timestamp())
    if mtime_delta > 1:
        raise RuntimeError(f"{path.name}: filesystem mtime drifted by {mtime_delta:.1f}s")
    with Image.open(path) as image:
        image.verify()
    return {"dateTimeOriginal": actual, "mtimeDeltaSeconds": round(mtime_delta, 3), "gps": True}


def write_readme(target: Path, count: int, first_date: str, last_date: str) -> None:
    text = f"""# Pocket Earth 新机演示照片库

这套照片包包含 {count} 张 JPEG，时间跨度 {first_date} 至 {last_date}。每张照片都已写入：

- EXIF `DateTimeOriginal`、`DateTimeDigitized`、`DateTime` 与 `+08:00` 时区；
- EXIF GPS（来自项目现有世界照片数据）；
- 与 EXIF 一致的文件修改时间；
- 素材来源、作者和链接见 `manifest.json` / `manifest.csv`。

这些日期是 Pocket Earth 比赛演示时间线，不是素材的原始拍摄时间。

## 导入新安卓手机

推荐在电脑上先解压本包，再把 `photos/` 中的 JPEG 复制到手机的 `DCIM/PocketEarthDemo/`。也可以使用：

```bash
adb shell mkdir -p /sdcard/DCIM/PocketEarthDemo
adb push -a photos/. /sdcard/DCIM/PocketEarthDemo/
```

复制完成后打开系统相册等待媒体扫描；必要时重启一次手机。即使解压工具改写了文件 mtime，系统仍可从 JPEG 的 `DateTimeOriginal` 读取 2020–2025 时间线。

然后安装 Pocket Earth APK，进入 Photos，点击“访问用户相册，构建照片集”并允许照片权限。照片整理、杂志、日历会共同引用系统相册的 assetId 和小缩略图；原片仍只有系统相册一份。

## 目录

- `photos/`：可直接导入手机的照片；
- `manifest.json`：完整结构化清单、演示时间、GPS、来源与 SHA-256；
- `manifest.csv`：便于人工核对的表格清单；
- `verification.json`：EXIF、GPS、mtime 的构建后验证结果。
"""
    (target / "README.md").write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output.resolve()
    archive = output.with_suffix(".zip")
    if output.exists() or archive.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {output} or {archive}")

    records = json.loads(SOURCE_DATA.read_text(encoding="utf-8"))
    unique = []
    seen_thumbs: set[str] = set()
    for record in records:
        if not record.get("full") or not record.get("thumb") or record["thumb"] in seen_thumbs:
            continue
        seen_thumbs.add(record["thumb"])
        unique.append(record)

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".pocket-earth-demo-", dir=output.parent))
    photos_dir = staging / "photos"
    photos_dir.mkdir()
    manifest = []
    verification = []
    try:
        for index, record in enumerate(unique, start=1):
            taken_at = demo_datetime(record["date"], index)
            filename = f"{taken_at:%Y%m%d_%H%M%S}_PE_{index:03d}_{safe_name(record['id'])}.jpg"
            target = photos_dir / filename
            print(f"[{index:03d}/{len(unique)}] {record['city']} · {record['date']}", flush=True)
            width, height = write_jpeg(download(record["full"]), target, record, taken_at)
            check = verify_photo(target, taken_at)
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            item = {
                "filename": filename,
                "id": record["id"],
                "city": record["city"],
                "latitude": record["lat"],
                "longitude": record["lng"],
                "demoDateTime": taken_at.isoformat(),
                "demoTimestampSynthetic": True,
                "width": width,
                "height": height,
                "bytes": target.stat().st_size,
                "sha256": digest,
                "author": record.get("author", ""),
                "authorLink": record.get("authorLink", ""),
                "photoLink": record.get("photoLink", ""),
                "sourceFullUrl": record["full"],
            }
            manifest.append(item)
            verification.append({"filename": filename, **check})

        manifest_payload = {
            "schemaVersion": 1,
            "generatedAt": datetime.now(TIMEZONE).isoformat(),
            "source": str(SOURCE_DATA.relative_to(PROJECT_ROOT)),
            "photoCount": len(manifest),
            "timeline": {"first": min(item["demoDateTime"] for item in manifest), "last": max(item["demoDateTime"] for item in manifest)},
            "notice": "Dates are synthetic Pocket Earth competition-demo timestamps, not original capture dates.",
            "photos": manifest,
        }
        (staging / "manifest.json").write_text(json.dumps(manifest_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with (staging / "manifest.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            fields = ["filename", "city", "demoDateTime", "latitude", "longitude", "author", "photoLink", "sourceFullUrl", "sha256"]
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(manifest)
        (staging / "verification.json").write_text(json.dumps({"verified": len(verification), "items": verification}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_readme(staging, len(manifest), manifest_payload["timeline"]["first"][:10], manifest_payload["timeline"]["last"][:10])
        shutil.move(str(staging), str(output))
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for path in sorted(output.rglob("*")):
                if path.is_file():
                    bundle.write(path, Path(output.name) / path.relative_to(output))
        print(f"Built {len(manifest)} photos: {output}")
        print(f"Archive: {archive}")
    finally:
        if staging.exists():
            shutil.rmtree(staging)


if __name__ == "__main__":
    main()
