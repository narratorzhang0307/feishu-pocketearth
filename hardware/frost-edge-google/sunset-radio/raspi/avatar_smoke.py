#!/usr/bin/env python3
import json
import os
import re

import frost_avatar
import whisplay_status


HERE = os.path.dirname(os.path.abspath(__file__))
WHISPLAY_PATH = os.path.join(HERE, "whisplay_status.py")
MIN_POSE_COUNT = 483


def read_whisplay_source():
    try:
        with open(WHISPLAY_PATH, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return ""


def main():
    source = read_whisplay_source()
    pose_count = len(frost_avatar.POSES)
    showcase_pool = frost_avatar.avatar_pool("")
    tokyo_pool = frost_avatar.avatar_pool("东京")
    tokyo_pool_again = frost_avatar.avatar_pool("东京")
    tokyo_ids = [pose.get("id") for pose in tokyo_pool]
    screen_copy = " ".join(str(item) for item in whisplay_status.SCREEN_SUMMARIES.values())
    forbidden_copy = ("待接入", "大脑未接入", "不可用", "未识别")
    broken_pose = showcase_pool[0] if showcase_pool else None
    original_draw_avatar = whisplay_status.frost_avatar.draw_avatar
    original_bg_region = whisplay_status.frost_avatar.bg_region
    draw_fallback_ok = False
    anim_fallback_ok = False
    if broken_pose:
        try:
            whisplay_status.frost_avatar.draw_avatar = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("bad pose"))
            image = whisplay_status.draw_status(
                {"status": "idle", "label": "standby", "city": "东京", "track": "test", "message": "音乐DJ 在线"},
                avatar_pose=broken_pose,
            )
            draw_fallback_ok = getattr(image, "size", None) == (whisplay_status.WIDTH, whisplay_status.HEIGHT)
        finally:
            whisplay_status.frost_avatar.draw_avatar = original_draw_avatar
        try:
            whisplay_status.frost_avatar.bg_region = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("bad bg"))
            anim_fallback_ok = whisplay_status.build_avatar_anim(broken_pose) is None
        finally:
            whisplay_status.frost_avatar.bg_region = original_bg_region
    cases = [
        {
            "name": "avatar pose catalog keeps the full Frost 483-pose set",
            "passed": pose_count >= MIN_POSE_COUNT,
            "detail": {"poseCount": pose_count, "minimum": MIN_POSE_COUNT},
        },
        {
            "name": "idle showcase keeps all poses",
            "passed": len(showcase_pool) == pose_count,
            "detail": {"showcaseCount": len(showcase_pool), "poseCount": pose_count},
        },
        {
            "name": "real city uses a genre pool",
            "passed": frost_avatar.pool_key("东京") == "citypop" and len(tokyo_pool) > 1,
            "detail": {"poolKey": frost_avatar.pool_key("东京"), "count": len(tokyo_pool)},
        },
        {
            "name": "genre pool order is deterministic",
            "passed": tokyo_ids == [pose.get("id") for pose in tokyo_pool_again],
            "detail": tokyo_ids[:5],
        },
        {
            "name": "whisplay rotates avatars every six seconds by default",
            "passed": abs(float(whisplay_status.ROTATE_SEC) - 6.0) < 0.001,
            "detail": whisplay_status.ROTATE_SEC,
        },
        {
            "name": "orange long press posts radio power command",
            "passed": 'post_button_command("切换声音", event="long")' in source,
        },
        {
            "name": "legacy mute-only long press command is absent",
            "passed": not re.search(r'post_button_command\\("切换静音",\\s*event="long"\\)', source),
        },
        {
            "name": "whisplay static summaries avoid setup placeholders",
            "passed": not any(item in screen_copy for item in forbidden_copy),
            "detail": [item for item in forbidden_copy if item in screen_copy],
        },
        {
            "name": "Whisplay button summaries mention status writeback",
            "passed": "长按写状态" in screen_copy and "播停写状态" in screen_copy,
        },
        {
            "name": "broken avatar draw falls back to static face",
            "passed": bool(draw_fallback_ok),
        },
        {
            "name": "broken avatar animation prebuild falls back cleanly",
            "passed": bool(anim_fallback_ok),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(
        json.dumps(
            {
                "ok": ok,
                "cases": cases,
                "poseCount": pose_count,
                "showcaseCount": len(showcase_pool),
                "tokyoGenreCount": len(tokyo_pool),
                "rotateSec": whisplay_status.ROTATE_SEC,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
