#!/usr/bin/env python3
"""Upload immutable Pocket Earth Data Packs to Alibaba Cloud OSS.

Credentials are read from an existing Alibaba Cloud CLI OAuth profile. The
script never deletes or overwrites unrelated objects and verifies every local
object by key and byte size after upload.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path, PurePosixPath
from threading import Lock

import oss2


def load_profile(name: str) -> dict:
    config_path = Path.home() / ".aliyun" / "config.json"
    data = json.loads(config_path.read_text())
    profile = next((item for item in data.get("profiles", []) if item.get("name") == name), None)
    if not profile:
        raise RuntimeError(f"Alibaba Cloud CLI profile not found: {name}")
    required = ("access_key_id", "access_key_secret", "sts_token", "sts_expiration")
    if any(not profile.get(key) for key in required):
        raise RuntimeError(f"Profile {name} has no usable STS credential")
    if float(profile["sts_expiration"]) <= time.time() + 300:
        raise RuntimeError(f"Profile {name} expired; refresh the Alibaba Cloud CLI OAuth session")
    return profile


def source_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file() and path.suffix == ".json")


def object_key(prefix: str, root: Path, file: Path) -> str:
    return str(PurePosixPath(prefix.strip("/")) / PurePosixPath(file.relative_to(root).as_posix()))


def list_remote_sizes(bucket: oss2.Bucket, prefix: str) -> dict[str, int]:
    result: dict[str, int] = {}
    normalized = prefix.strip("/") + "/"
    for item in oss2.ObjectIteratorV2(bucket, prefix=normalized):
        if not item.key.endswith("/"):
            result[item.key] = item.size
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("public/data-packs"))
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--bucket", default="last-night-on-earth")
    parser.add_argument("--endpoint", default="https://oss-cn-hangzhou.aliyuncs.com")
    parser.add_argument("--profile", default="pocketearth-pai")
    parser.add_argument("--workers", type=int, default=min(8, (os.cpu_count() or 4) * 2))
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_dir():
        raise FileNotFoundError(source)
    files = source_files(source)
    local_sizes = {object_key(args.prefix, source, file): file.stat().st_size for file in files}
    summary = {
        "bucket": args.bucket,
        "endpoint": args.endpoint,
        "prefix": args.prefix.strip("/"),
        "files": len(files),
        "bytes": sum(local_sizes.values()),
        "dryRun": args.dry_run,
    }
    print(json.dumps(summary, ensure_ascii=False))
    if args.dry_run:
        return 0

    profile = load_profile(args.profile)
    auth = oss2.StsAuth(profile["access_key_id"], profile["access_key_secret"], profile["sts_token"])
    bucket = oss2.Bucket(auth, args.endpoint, args.bucket, connect_timeout=120)
    remote_before = list_remote_sizes(bucket, args.prefix)
    pending = [file for file in files if remote_before.get(object_key(args.prefix, source, file)) != file.stat().st_size]
    progress_lock = Lock()

    def upload(file: Path) -> tuple[str, int]:
        key = object_key(args.prefix, source, file)
        content_type = mimetypes.guess_type(file.name)[0] or "application/json"
        headers = {
            "Content-Type": f"{content_type}; charset=utf-8" if content_type == "application/json" else content_type,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": "inline",
        }
        attempts = max(1, args.retries + 1)
        for attempt in range(1, attempts + 1):
            try:
                bucket.put_object_from_file(key, str(file), headers=headers)
                return key, file.stat().st_size
            except Exception as error:
                if attempt >= attempts:
                    raise RuntimeError(f"Upload failed after {attempts} attempts: {key}") from error
                delay = min(2 ** (attempt - 1), 16) + random.uniform(0, 0.4)
                with progress_lock:
                    print(json.dumps({"retry": attempt, "key": key, "delaySeconds": round(delay, 2)}, ensure_ascii=False), flush=True)
                time.sleep(delay)
        raise AssertionError("unreachable")

    completed = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(upload, file) for file in pending]
        for future in as_completed(futures):
            future.result()
            completed += 1
            if completed == len(futures) or completed % 10 == 0:
                print(json.dumps({"uploaded": completed, "total": len(futures)}, ensure_ascii=False), flush=True)

    remote_after = list_remote_sizes(bucket, args.prefix)
    missing = sorted(set(local_sizes) - set(remote_after))
    size_mismatch = sorted(key for key, size in local_sizes.items() if remote_after.get(key) != size)
    verified = not missing and not size_mismatch
    public_base = f"https://{args.bucket}.oss-cn-hangzhou.aliyuncs.com/{args.prefix.strip('/')}"
    print(json.dumps({
        "verified": verified,
        "localFiles": len(local_sizes),
        "remoteFilesAtPrefix": len(remote_after),
        "missing": missing,
        "sizeMismatch": size_mismatch,
        "publicBase": public_base,
    }, ensure_ascii=False))
    return 0 if verified else 2


if __name__ == "__main__":
    raise SystemExit(main())

