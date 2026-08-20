#!/usr/bin/env python3
"""把「有音乐的电台城市」的日落照片预取到本地（每城最多 2 张）。

决赛 demo 专用的小体量预取：不下全量清单（1100+ 张没必要），只覆盖
resource-library/cities 里的 96 座电台城市——播放时照片盘只会转当前城市，
静默空转时也只在这些城市里每次换一座（whisplay 的 random_city 天然只挑本地有照片的城）。

断点续传（已有即跳过）、原子落盘；进度写 cache_dir/prefetch-status.json，方便远程盯。
用法：python3 photo_prefetch_music.py
"""

import json
import os
import sys
import time

import photo_disc

CITIES_DIR = os.environ.get(
    "SUNSET_CITIES_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "resource-library", "cities"),
)
WANT_PER_CITY = 2
THROTTLE_SEC = 0.15  # 张与张之间歇一拍，别把热点/OSS 压垮


def radio_city_names(cities_dir):
    names = []
    try:
        files = sorted(os.listdir(cities_dir))
    except OSError:
        return names
    for fn in files:
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(cities_dir, fn), encoding="utf-8") as handle:
                name = str(json.load(handle).get("cityNameZh") or "").strip()
        except Exception:
            continue
        if name:
            names.append(name)
    return names


def main():
    provider = photo_disc.PhotoProvider()
    if not provider.catalog:
        print("照片清单缺失（resource-library/world-photos.json），先跑 deploy 同步", file=sys.stderr)
        return 1
    cities = radio_city_names(CITIES_DIR)
    if not cities:
        print(f"电台城市目录为空：{CITIES_DIR}", file=sys.stderr)
        return 1

    jobs = []
    for city in cities:
        for entry in (provider.catalog.get(city) or [])[:WANT_PER_CITY]:
            jobs.append((city, entry))

    status_path = os.path.join(provider.cache_dir, "prefetch-status.json")
    done = skipped = failed = 0
    t0 = time.time()
    for i, (city, entry) in enumerate(jobs):
        final = os.path.join(provider.cache_dir, f"{entry['id']}.jpg")
        if os.path.exists(final):
            skipped += 1
        elif provider.fetch_now(entry):
            done += 1
            time.sleep(THROTTLE_SEC)
        else:
            failed += 1
            print(f"[prefetch] 失败：{city} {entry['id']}", file=sys.stderr)
        if i % 10 == 0 or i == len(jobs) - 1:
            try:
                with open(status_path, "w", encoding="utf-8") as handle:
                    json.dump({"total": len(jobs), "done": done, "skipped": skipped,
                               "failed": failed, "elapsedSec": round(time.time() - t0)}, handle)
            except OSError:
                pass
    ready_cities = sum(1 for c in cities if provider.peek(c))
    print(f"预取完成：{len(jobs)} 张任务，新下 {done}、已有 {skipped}、失败 {failed}；"
          f"{ready_cities}/{len(cities)} 座电台城市本地有照片，用时 {round(time.time() - t0)}s")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
