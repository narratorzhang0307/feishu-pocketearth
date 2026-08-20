#!/usr/bin/env python3
"""Transfer run artifacts through OSS using PAI's injected short-lived role."""

from __future__ import annotations

import argparse
import mimetypes
from pathlib import Path, PurePosixPath

import oss2
from alibabacloud_credentials import providers


def bucket(endpoint: str, name: str) -> oss2.Bucket:
    return oss2.Bucket(oss2.ProviderAuth(providers.DefaultCredentialsProvider()), endpoint, name)


def key(value: str) -> str:
    return str(PurePosixPath(value.lstrip("/")))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--bucket", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    download = sub.add_parser("download")
    download.add_argument("--key", required=True)
    download.add_argument("--destination", type=Path, required=True)
    upload = sub.add_parser("upload-dir")
    upload.add_argument("--source", type=Path, required=True)
    upload.add_argument("--prefix", required=True)
    args = parser.parse_args()
    client = bucket(args.endpoint, args.bucket)
    if args.command == "download":
        args.destination.parent.mkdir(parents=True, exist_ok=True)
        client.get_object_to_file(key(args.key), str(args.destination))
        print(f"downloaded {key(args.key)} -> {args.destination}")
        return 0
    if not args.source.is_dir():
        raise FileNotFoundError(args.source)
    count = 0
    for path in sorted(item for item in args.source.rglob("*") if item.is_file()):
        relative = PurePosixPath(path.relative_to(args.source).as_posix())
        target = key(str(PurePosixPath(args.prefix) / relative))
        content_type, _ = mimetypes.guess_type(path.name)
        headers = {"Content-Type": content_type} if content_type else None
        client.put_object_from_file(target, str(path), headers=headers)
        count += 1
    print(f"uploaded_files={count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
