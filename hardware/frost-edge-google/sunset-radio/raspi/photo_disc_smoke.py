#!/usr/bin/env python3
"""photo_disc 离线自测：清单解析、注入下载器的补货/就绪/轮换、坏文件自愈、缓存有界。
全程不碰网络（fetcher 注入合成图）。"""
import io
import json
import os
import tempfile
import time

from PIL import Image

import photo_disc


def _fake_photo_bytes(color):
    img = Image.new("RGB", (400, 300), color)
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    with tempfile.TemporaryDirectory() as tmp:
        catalog_path = os.path.join(tmp, "photos.json")
        json.dump(
            [
                {"id": "tk1", "city_zh": "东京", "original_url": "u://tk1", "image_url": "t://tk1"},
                {"id": "tk2", "city_zh": "东京", "image_url": "t://tk2"},  # 无高清→回退缩略
                {"id": "ls1", "city_zh": "里斯本", "original_url": "u://ls1"},
                {"id": "bad", "city_zh": "", "original_url": "u://bad"},   # 无城市→丢弃
            ],
            open(catalog_path, "w"),
        )
        fetched = []

        def fetcher(url):
            fetched.append(url)
            return _fake_photo_bytes((255, 128, 60))

        cache = os.path.join(tmp, "cache")
        provider = photo_disc.PhotoProvider(catalog_path, cache_dir=cache, fetcher=fetcher)

        check("catalog_cities", set(provider.catalog) == {"东京", "里斯本"})
        check("fallback_url", provider.catalog["东京"][1]["url"] == "t://tk2")
        check("peek_empty", not provider.peek("东京"))
        check("get_empty", provider.get("东京") is None)
        check("unknown_city_safe", provider.get("火星") is None)

        # 补货（后台线程）：等它落盘
        provider.ensure("东京")
        for _ in range(50):
            if provider.peek("东京"):
                break
            time.sleep(0.05)
        check("fetch_landed", provider.peek("东京"))
        check("fetched_hd_first", fetched and fetched[0] == "u://tk1")

        got = provider.get("东京")
        check("get_returns_image", got is not None and got[0].size[0] > 0)
        check("get_key", got is not None and got[1] == "东京:tk1")

        # 再补一张（每城预取2张），轮换生效
        provider.ensure("东京")
        for _ in range(50):
            if len(provider._cached_for("东京")) >= 2:
                break
            time.sleep(0.05)
        check("second_cached", len(provider._cached_for("东京")) == 2)
        keys = {provider.get("东京")[1] for _ in range(4)}
        check("rotates_photos", keys == {"东京:tk1", "东京:tk2"})
        # 已满预取额度就不再下载
        count_before = len(fetched)
        provider.ensure("东京")
        time.sleep(0.15)
        check("no_overfetch", len(fetched) == count_before)

        # 静默换城：random_city 只挑本地有照片的城；exclude 避开上一座
        check("random_city_cached_only", provider.random_city() == "东京")  # 里斯本还没下载
        provider.ensure("里斯本")
        for _ in range(50):
            if provider.peek("里斯本"):
                break
            time.sleep(0.05)
        picks = {provider.random_city() for _ in range(20)}
        check("random_city_both", picks == {"东京", "里斯本"})
        check("random_city_exclude", all(provider.random_city(exclude="东京") == "里斯本" for _ in range(6)))

        # fetch_now：同步下载，已存在直接成功且不重复走网络
        count_before2 = len(fetched)
        check("fetch_now_existing_ok", provider.fetch_now(provider.catalog["东京"][0]) is True)
        check("fetch_now_no_refetch", len(fetched) == count_before2)

        # 坏缓存文件自愈：写坏 → get 返回 None 且删除
        bad_path = os.path.join(cache, "ls1.jpg")
        open(bad_path, "wb").write(b"not a jpeg")
        check("corrupt_returns_none", provider.get("里斯本") is None)
        check("corrupt_removed", not os.path.exists(bad_path))

        # 缓存有界
        for i in range(photo_disc.CACHE_LIMIT_FILES + 10):
            open(os.path.join(cache, f"pad{i:03d}.jpg"), "wb").write(_fake_photo_bytes((i % 255, 0, 0)))
        provider._trim_cache()
        remaining = [f for f in os.listdir(cache) if f.endswith(".jpg")]
        check("cache_bounded", len(remaining) <= photo_disc.CACHE_LIMIT_FILES)

    if failures:
        print("PHOTO DISC SMOKE FAILED:", ", ".join(failures))
        return 1
    print("PHOTO DISC SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
