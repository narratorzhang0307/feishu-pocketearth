#!/usr/bin/env python3
"""日落照片供给器：给「照片黑胶盘」形态喂图。

约定：
- 照片清单来自网页端同一份 world-photos 数据（1100+ 张，带 city_zh 归属）；
- 下载永远在后台线程、文件原子落盘（tmp+rename）、每张只下一次；
- 渲染循环只问两件事：peek(city) 有没有现成的？get(city) 给我一张（轮换）。
  没有现成的就不出这个形态——绝不让屏幕等网络。
"""

import io
import json
import os
import random
import threading
import urllib.request

from PIL import Image

DEFAULT_CATALOG_PATHS = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "resource-library", "world-photos.json"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "modules", "photos", "world-photos.generated.json"),
)
DEFAULT_CACHE_DIR = os.path.join(
    os.path.expanduser("~"), ".local", "share", "sunset-radio", "photo-cache"
)
# 上限高于清单全量（1113 张）：photo_prefetch_all 把整库落到本地后，这里不许再修剪掉
CACHE_LIMIT_FILES = 1400
FETCH_TIMEOUT = 15


def _default_fetcher(url):
    request = urllib.request.Request(url, headers={"User-Agent": "sunset-pi"})
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT) as response:
        return response.read()


def load_catalog(path=None):
    """city_zh → [{id, url}]。url 优先高清 original_url，回退缩略 image_url。"""
    paths = [path] if path else list(DEFAULT_CATALOG_PATHS)
    for candidate in paths:
        try:
            with open(candidate, "r", encoding="utf-8") as handle:
                raw = json.load(handle)
        except (OSError, json.JSONDecodeError):
            continue
        catalog = {}
        for item in raw if isinstance(raw, list) else []:
            city = str(item.get("city_zh") or "").strip()
            url = str(item.get("original_url") or item.get("image_url") or "").strip()
            pid = str(item.get("id") or "").strip()
            if city and url and pid:
                catalog.setdefault(city, []).append({"id": pid, "url": url})
        if catalog:
            return catalog
    return {}


class PhotoProvider:
    def __init__(self, catalog_path=None, cache_dir=DEFAULT_CACHE_DIR, fetcher=None):
        self.catalog = load_catalog(catalog_path)
        self.cache_dir = cache_dir
        self.fetcher = fetcher or _default_fetcher
        self._inflight = set()
        self._lock = threading.Lock()
        self._rotate = {}
        try:
            os.makedirs(cache_dir, exist_ok=True)
        except OSError:
            pass

    # ---- 缓存查询（渲染循环安全调用，纯文件系统） ----

    def _cached_for(self, city):
        entries = self.catalog.get(str(city or "").strip()) or []
        out = []
        for entry in entries:
            path = os.path.join(self.cache_dir, f"{entry['id']}.jpg")
            if os.path.exists(path):
                out.append((entry["id"], path))
        return out

    def peek(self, city):
        """这座城有没有已就绪的照片。"""
        return bool(self._cached_for(city))

    def random_city(self, exclude=""):
        """随机挑一座「本地已有照片」的城（静默时照片盘每次换一座城用）。
        exclude 用来避免和上一张同城；全库只有一城时也照样返回它。返回 None=本地一张都没有。"""
        cities = [c for c in self.catalog if self._cached_for(c)]
        if not cities:
            return None
        pool = [c for c in cities if c != str(exclude or "")] or cities
        return random.choice(pool)

    def get(self, city):
        """取一张（同城多张则轮换）。返回 (PIL.Image, key) 或 None。"""
        cached = self._cached_for(city)
        if not cached:
            return None
        index = self._rotate.get(city, 0) % len(cached)
        self._rotate[city] = index + 1
        pid, path = cached[index]
        try:
            image = Image.open(path)
            image.load()
            return image, f"{city}:{pid}"
        except OSError:
            try:
                os.remove(path)  # 缓存文件坏了就删掉，下次重下
            except OSError:
                pass
            return None

    # ---- 后台补货（每城最多预取 2 张，避免流量失控） ----

    def ensure(self, city, want=2):
        city = str(city or "").strip()
        entries = self.catalog.get(city) or []
        if not entries:
            return
        cached_ids = {pid for pid, _ in self._cached_for(city)}
        if len(cached_ids) >= min(want, len(entries)):
            return
        target = next((e for e in entries if e["id"] not in cached_ids), None)
        if target is None:
            return
        with self._lock:
            if target["id"] in self._inflight:
                return
            self._inflight.add(target["id"])
        thread = threading.Thread(target=self._fetch_one, args=(target,), daemon=True)
        thread.start()

    def fetch_now(self, entry):
        """同步下载一张（photo_prefetch_music 批量预取用）。已存在直接算成功。"""
        final = os.path.join(self.cache_dir, f"{entry['id']}.jpg")
        if os.path.exists(final):
            return True
        try:
            data = self.fetcher(entry["url"])
            image = Image.open(io.BytesIO(data)).convert("RGB")
            # 落盘前压到盘面够用的尺寸（最长边 640），省 SD 卡也省后续解码
            image.thumbnail((640, 640), Image.LANCZOS)
            tmp = os.path.join(self.cache_dir, f".{entry['id']}.tmp")
            image.save(tmp, "JPEG", quality=86)
            os.replace(tmp, final)
            self._trim_cache()
            return True
        except Exception:
            return False

    def _fetch_one(self, entry):
        try:
            self.fetch_now(entry)
        finally:
            with self._lock:
                self._inflight.discard(entry["id"])

    def _trim_cache(self):
        try:
            files = [
                os.path.join(self.cache_dir, f)
                for f in os.listdir(self.cache_dir)
                if f.endswith(".jpg")
            ]
            files.sort(key=lambda p: os.path.getmtime(p))
            while len(files) > CACHE_LIMIT_FILES:
                os.remove(files.pop(0))
        except OSError:
            pass
