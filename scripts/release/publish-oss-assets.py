#!/usr/bin/env python3
"""Publish an explicit immutable asset release to OSS without exposing credentials."""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path
from threading import Lock

import oss2


def load_profile(name: str) -> dict:
    data = json.loads((Path.home() / '.aliyun' / 'config.json').read_text())
    profile = next((item for item in data.get('profiles', []) if item.get('name') == name), None)
    if not profile:
        raise RuntimeError(f'Alibaba Cloud CLI profile not found: {name}')
    if not all(profile.get(key) for key in ('access_key_id', 'access_key_secret', 'sts_token', 'sts_expiration')):
        raise RuntimeError(f'Profile {name} has no usable STS credential; refresh CLI OAuth login')
    if float(profile['sts_expiration']) <= time.time() + 300:
        raise RuntimeError(f'Profile {name} STS credential expired; refresh CLI OAuth login')
    return profile


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, default=Path('docs/deploy/oss-release-20260811.json'))
    parser.add_argument('--profile', default='pocketearth-pai')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    root = Path.cwd(); release = json.loads(args.manifest.read_text())
    checked = []
    for item in release['objects']:
        path = root / item['local']
        actual = {'bytes': path.stat().st_size, 'sha256': sha256(path)}
        if actual != {'bytes': item['bytes'], 'sha256': item['sha256']}:
            raise RuntimeError(f"local release mismatch: {item['local']}")
        checked.append({'key': item['key'], **actual})
    print(json.dumps({'release': release['release'], 'objects': len(checked), 'bytes': sum(item['bytes'] for item in checked), 'dryRun': args.dry_run}, ensure_ascii=False))
    if args.dry_run:
        return 0

    profile = load_profile(args.profile)
    auth = oss2.StsAuth(profile['access_key_id'], profile['access_key_secret'], profile['sts_token'])
    bucket = oss2.Bucket(auth, release['endpoint'], release['bucket'], connect_timeout=180)
    progress_lock = Lock()
    for item in release['objects']:
        path = root / item['local']; key = item['key']
        try:
            meta = bucket.head_object(key)
            remote_sha = (meta.headers.get('x-oss-meta-sha256') or '').lower()
            if int(meta.content_length) != item['bytes'] or remote_sha != item['sha256']:
                raise RuntimeError(f'refusing to overwrite mismatched immutable object: {key}')
            print(json.dumps({'verifiedExisting': key}, ensure_ascii=False))
            continue
        except oss2.exceptions.NoSuchKey:
            pass
        headers = {
            'Content-Type': item['contentType'],
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Disposition': 'inline',
            'x-oss-meta-sha256': item['sha256'],
        }
        last_reported = 0

        def progress(consumed: int, total: int) -> None:
            nonlocal last_reported
            report_step = 256 * 1024 * 1024
            if consumed < total and consumed - last_reported < report_step:
                return
            last_reported = consumed
            with progress_lock:
                print(json.dumps({
                    'uploading': key,
                    'bytes': consumed,
                    'total': total,
                }, ensure_ascii=False), flush=True)

        if item['bytes'] >= 100 * 1024 * 1024:
            oss2.resumable_upload(
                bucket,
                key,
                str(path),
                headers=headers,
                multipart_threshold=100 * 1024 * 1024,
                part_size=32 * 1024 * 1024,
                progress_callback=progress,
                num_threads=3,
            )
        else:
            bucket.put_object_from_file(key, str(path), headers=headers, progress_callback=progress)
        meta = bucket.head_object(key)
        if int(meta.content_length) != item['bytes'] or (meta.headers.get('x-oss-meta-sha256') or '').lower() != item['sha256']:
            raise RuntimeError(f'OSS verification failed: {key}')
        print(json.dumps({'uploadedAndVerified': key, 'bytes': item['bytes']}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
