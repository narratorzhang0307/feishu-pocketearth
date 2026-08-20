#!/usr/bin/env python3
import argparse
import json
import os
import subprocess


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))

REQUIRED_GUARDS = [
    "raspi/collaboration_guard.py",
    "raspi/collaboration_guard_smoke.py",
    "raspi/deploy_doctor.py",
    "raspi/silence_doctor_smoke.py",
    "raspi/service_doctor_smoke.py",
    "raspi/queue_doctor_smoke.py",
    "raspi/capability_doctor_smoke.py",
    "raspi/unattended_check.py",
    "raspi/unattended_check_smoke.py",
    "raspi/avatar_smoke.py",
    "raspi/whisplay_media_smoke.py",
    "raspi/whisplay_font_smoke.py",
    "raspi/pi_command_wake_smoke.py",
    "raspi/pi_copy_smoke.py",
    "raspi/voice_route_smoke.py",
    "raspi/voice_doctor_smoke.py",
    "raspi/tts_doctor_smoke.py",
    "raspi/chat_agent_smoke.py",
    "raspi/deploy_doctor_smoke.py",
    "raspi/boot_doctor_smoke.py",
    "raspi/boot_snapshot_smoke.py",
    "raspi/battery_doctor_smoke.py",
    "raspi/screen_doctor_smoke.py",
    "raspi/camera_status_smoke.py",
    "raspi/camera_doctor_smoke.py",
    "raspi/button_command_smoke.py",
    "raspi/button_doctor_smoke.py",
    "raspi/button_events_smoke.py",
    "raspi/button_logic_smoke.py",
    "raspi/audio_mode_smoke.py",
    "raspi/runtime_maintenance_smoke.py",
    "raspi/ambient_agent_smoke.py",
    "raspi/ambient_policy_smoke.py",
    "raspi/ambient_observer_smoke.py",
    "raspi/ambient_memory_smoke.py",
    "raspi/ambient_plan_smoke.py",
    "raspi/ambient_privacy_smoke.py",
]

PROTECTED_FILES = [
    "raspi/AVATAR.md",
    "raspi/frost_avatar.py",
    "raspi/frost_poses.json",
    "raspi/whisplay_status.py",
    "raspi/pi_command_daemon.py",
    "raspi/ambient_privacy.py",
    "raspi/ambient_plan.py",
    "raspi/ambient_policy.py",
    "raspi/camera_status.py",
    "raspi/camera_doctor.py",
    "raspi/ambient_agent.py",
    "raspi/chat_agent.py",
    "raspi/ambient_daemon.py",
    "raspi/AMBIENT.md",
    "raspi/volume_control.py",
    *REQUIRED_GUARDS,
]

GUARD_SELF_FILES = {
    "raspi/collaboration_guard.py",
    "raspi/collaboration_guard_smoke.py",
}

COLLAB_REFS = [
    "sunset-radio-plus/legacy-pi-work",
    "sunset-radio-plus/pr-1",
]

MIN_POSE_COUNT = 483

AMBIENT_BOUNDARY_TOKENS = {
    "raspi/ambient_privacy.py": [
        "manual_only",
        "autoCapture",
        "deleted_after_analysis",
        "not_used",
        "not_inferred",
        "not_started_by_ambient_layer",
        "不会自动拍照",
        "不识别身份或表情",
    ],
    "raspi/ambient_plan.py": [
        '"capture": "manual_only"',
        '"imageRetention": "deleted_after_analysis"',
        '"identity": "not_used"',
        '"emotion": "not_inferred"',
        '"canInterrupt": False',
        '"canStartAudio": False',
        "只观察一帧",
        "下一段",
    ],
    "raspi/ambient_policy.py": [
        "modulate_next_block",
        "hold_cooldown",
        "next_block",
        "24H 主线优先",
        "canInterrupt",
    ],
    "raspi/ambient_agent.py": [
        '"capture": "manual_only"',
        '"autoCapture": False',
        '"imageRetention": "deleted_after_analysis"',
        '"identity": "not_used"',
        '"emotion": "not_inferred"',
        '"canInterrupt": False',
        '"canStartAudio": False',
        '"directPlayerCommand": False',
        "observe_once(capture=True)",
    ],
}

AMBIENT_AGENT_CAPTURE_TOKENS = [
    "observe_once(capture=True)",
    "capture_snapshot(",
]

AMBIENT_AGENT_CONSENT_TOKENS = [
    "manual_only",
    "autoCapture",
    "deleted_after_analysis",
    "not_used",
    "not_inferred",
    "canStartAudio",
    "canInterrupt",
]

AUDIO_CONTROL_TOKENS = [
    "amixer",
    "sset",
    "set-volume",
    "MIXER_CONTROL",
]

AUDIO_MODE_BOUNDARY_TOKENS = [
    "audio_allows_dialog",
    "audio_allows_music",
    "load_audio_mode",
    "hard_mute",
    "soft_mute",
]


def run_git(args):
    try:
        return subprocess.run(
            ["git", *args],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(args, 1, "", str(exc))


def git_show_text(ref, relpath):
    result = run_git(["show", f"{ref}:{relpath}"])
    if result.returncode != 0:
        return None
    return result.stdout


def pose_count_from_payload(payload):
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        poses = payload.get("poses")
        if isinstance(poses, list):
            return len(poses)
    return 0


def pose_count_from_text(text):
    try:
        return pose_count_from_payload(json.loads(text))
    except json.JSONDecodeError:
        return 0


def load_pose_count():
    path = os.path.join(ROOT, "raspi", "frost_poses.json")
    try:
        with open(path, encoding="utf-8") as handle:
            return pose_count_from_payload(json.load(handle))
    except (OSError, json.JSONDecodeError):
        return 0


def read_text(relpath):
    try:
        with open(os.path.join(ROOT, relpath), encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return ""


def git_tracked_file_exists(relpath):
    return run_git(["ls-files", "--error-unmatch", relpath]).returncode == 0


def missing_guard_files():
    return [relpath for relpath in REQUIRED_GUARDS if not os.path.exists(os.path.join(ROOT, relpath))]


def ambient_boundary_gaps():
    gaps = []
    for relpath, tokens in AMBIENT_BOUNDARY_TOKENS.items():
        text = read_text(relpath)
        if not text:
            gaps.append({"path": relpath, "missing": ["<file>"]})
            continue
        missing = [token for token in tokens if token not in text]
        if missing:
            gaps.append({"path": relpath, "missing": missing})
    return gaps


def existing_ref(ref):
    result = run_git(["rev-parse", "--verify", "--quiet", ref])
    return result.returncode == 0


def diff_name_status(ref):
    result = run_git(["diff", "--name-status", f"HEAD..{ref}", "--", *PROTECTED_FILES])
    if result.returncode != 0:
        return []
    rows = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            rows.append({"status": parts[0], "path": parts[-1]})
    return rows


def format_deletion_warning(ref, deletions, limit=8):
    shown = ", ".join(deletions[:limit])
    if len(deletions) > limit:
        shown = f"{shown}, ... (+{len(deletions) - limit} more)"
    return f"{ref} would delete {len(deletions)} protected Pi guard file(s): {shown}"


def pose_count_for_ref(ref):
    result = run_git(["show", f"{ref}:raspi/frost_poses.json"])
    if result.returncode != 0:
        return None
    return pose_count_from_text(result.stdout)


def format_pose_reduction_warning(ref, current_count, ref_count):
    return f"{ref} would reduce Whisplay avatar poses from {current_count} to {ref_count}; do not merge it wholesale."


def format_guard_self_warning(ref, paths, limit=4):
    shown = ", ".join(paths[:limit])
    if len(paths) > limit:
        shown = f"{shown}, ... (+{len(paths) - limit} more)"
    return f"{ref} modifies collaboration guard file(s): {shown}; review guard changes manually before merging."


def guard_self_warnings(ref, changes):
    touched = [
        item["path"]
        for item in changes
        if item.get("path") in GUARD_SELF_FILES and not str(item.get("status") or "").startswith("D")
    ]
    if touched:
        return [format_guard_self_warning(ref, touched)]
    return []


def ambient_agent_warnings(ref, text=None):
    if text is None:
        text = git_show_text(ref, "raspi/ambient_agent.py")
    if not text:
        return []
    warnings = []
    captures_frame = any(token in text for token in AMBIENT_AGENT_CAPTURE_TOKENS)
    looped_agent = "while True" in text or "systemd" in text
    adaptive_auto = 'mode != "adaptive"' in text or 'mode == "adaptive"' in text
    missing_boundaries = [token for token in AMBIENT_AGENT_CONSENT_TOKENS if token not in text]
    if captures_frame and looped_agent and adaptive_auto:
        warnings.append(
            f"{ref} adds a continuous ambient camera agent; keep capture manual/consent-gated before merging."
        )
    if captures_frame and missing_boundaries:
        shown = ", ".join(missing_boundaries[:4])
        if len(missing_boundaries) > 4:
            shown = f"{shown}, ... (+{len(missing_boundaries) - 4} more)"
        warnings.append(f"{ref} ambient_agent.py is missing privacy boundary token(s): {shown}")
    return warnings


def ambient_daemon_warnings(ref, text=None):
    if text is None:
        text = git_show_text(ref, "raspi/ambient_daemon.py")
    if not text:
        return []
    captures_frame = "capture_snapshot(" in text or "observe_once(capture=True)" in text or "capture=True" in text
    looped_daemon = "while True" in text or "SAMPLE_SEC" in text or "FORCE_FULL_SEC" in text
    adaptive_auto = 'mode != "adaptive"' in text or 'mode == "adaptive"' in text
    consent_boundaries = ("manual_only", "scan_once", "user_consent")
    has_explicit_consent_gate = any(token in text for token in consent_boundaries)
    if captures_frame and looped_daemon and adaptive_auto and not has_explicit_consent_gate:
        return [
            f"{ref} adds a continuous ambient camera daemon; require explicit manual/consent capture before merging."
        ]
    if captures_frame and looped_daemon and adaptive_auto:
        return [
            f"{ref} adds a continuous ambient camera daemon; review privacy and startup path before merging."
        ]
    return []


def audio_control_warnings(ref, text=None):
    if text is None:
        text = git_show_text(ref, "raspi/volume_control.py")
    if not text:
        return []
    changes_system_volume = any(token in text for token in AUDIO_CONTROL_TOKENS)
    has_audio_mode_boundary = any(token in text for token in AUDIO_MODE_BOUNDARY_TOKENS)
    if changes_system_volume and not has_audio_mode_boundary:
        return [
            f"{ref} adds direct system volume control without an audio-mode boundary; require hard/soft mute guard before merging."
        ]
    return []


def ref_warnings(current_pose_count=None):
    warnings = []
    refs = {}
    for ref in COLLAB_REFS:
        if not existing_ref(ref):
            refs[ref] = {"available": False, "protectedChanges": []}
            continue
        changes = diff_name_status(ref)
        deletions = [item["path"] for item in changes if item["status"].startswith("D")]
        ref_pose_count = pose_count_for_ref(ref)
        refs[ref] = {
            "available": True,
            "protectedChanges": changes,
            "deletesProtectedFiles": deletions,
            "poseCount": ref_pose_count,
        }
        if deletions:
            warnings.append(format_deletion_warning(ref, deletions))
        warnings.extend(guard_self_warnings(ref, changes))
        if current_pose_count and ref_pose_count is not None and 0 < ref_pose_count < current_pose_count:
            warnings.append(format_pose_reduction_warning(ref, current_pose_count, ref_pose_count))
        warnings.extend(ambient_agent_warnings(ref))
        warnings.extend(ambient_daemon_warnings(ref))
        warnings.extend(audio_control_warnings(ref))
    return refs, warnings


def collect():
    pose_count = load_pose_count()
    avatar_doc = read_text("raspi/AVATAR.md")
    missing = missing_guard_files()
    ambient_gaps = ambient_boundary_gaps()
    local_warnings = []
    if git_tracked_file_exists("raspi/ambient_daemon.py"):
        local_warnings = ambient_daemon_warnings("current main", read_text("raspi/ambient_daemon.py"))
    if git_tracked_file_exists("raspi/volume_control.py"):
        local_warnings.extend(audio_control_warnings("current main", read_text("raspi/volume_control.py")))
    refs, warnings = ref_warnings(pose_count)
    checks = {
        "guardFilesPresent": not missing,
        "avatarCatalogLargeEnough": pose_count >= MIN_POSE_COUNT,
        "avatarDocMentionsCurrentCount": str(pose_count) in avatar_doc if pose_count else False,
        "whisplayUsesAudioToggle": 'post_button_command("切换声音", event="long")'
        in read_text("raspi/whisplay_status.py"),
        "ambientPrivacyBoundaries": not ambient_gaps,
        "ambientDaemonConsentBounded": not local_warnings,
    }
    ok = all(checks.values())
    message = "协作守卫通过；当前 main 保留 Pi 头像、按钮和媒体显示保护。"
    if not ok:
        message = "协作守卫发现当前 main 的 Pi 保护缺口。"
    elif warnings:
        message = "协作守卫通过；远端协作分支仍有回滚风险，已记录但不影响当前 main。"
    return {
        "ok": ok,
        "message": message,
        "checks": checks,
        "poseCount": pose_count,
        "minimumPoseCount": MIN_POSE_COUNT,
        "missingGuardFiles": missing,
        "ambientBoundaryGaps": ambient_gaps,
        "localWarnings": local_warnings,
        "refs": refs,
        "warnings": warnings,
    }


def compact_report(report):
    refs = {}
    warnings = report.get("warnings")
    if not isinstance(warnings, list):
        warnings = []
    blocked_refs = []
    for name, ref in (report.get("refs") or {}).items():
        if not isinstance(ref, dict):
            continue
        ref_warnings = [warning for warning in warnings if str(warning).startswith(name)]
        if ref_warnings:
            blocked_refs.append(name)
        refs[name] = {
            "available": bool(ref.get("available")),
            "protectedChangeCount": len(ref.get("protectedChanges") or []),
            "deleteCount": len(ref.get("deletesProtectedFiles") or []),
            "poseCount": ref.get("poseCount"),
            "blocked": bool(ref_warnings),
        }
    return {
        "ok": bool(report.get("ok")),
        "message": report.get("message") or "",
        "poseCount": report.get("poseCount"),
        "minimumPoseCount": report.get("minimumPoseCount"),
        "blockedRefs": blocked_refs,
        "failedChecks": [
            name
            for name, passed in (report.get("checks") or {}).items()
            if not passed
        ],
        "missingGuardCount": len(report.get("missingGuardFiles") or []),
        "ambientBoundaryGapCount": len(report.get("ambientBoundaryGaps") or []),
        "localWarningCount": len(report.get("localWarnings") or []),
        "localWarnings": [str(item)[:240] for item in (report.get("localWarnings") or [])[:3]],
        "warningCount": len(warnings),
        "warnings": [str(item)[:240] for item in warnings[:3]],
        "refs": refs,
    }


def main():
    parser = argparse.ArgumentParser(description="Guard Sunset Radio Pi collaboration branches from regressions.")
    parser.add_argument("--summary", action="store_true", help="Print compact JSON for recurring monitoring.")
    parser.add_argument(
        "--fail-on-blocked",
        action="store_true",
        help="Return failure when collaboration refs are blocked from wholesale merge.",
    )
    args = parser.parse_args()
    report = collect()
    compact = compact_report(report)
    output = compact if args.summary else report
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if not report.get("ok"):
        return 1
    if args.fail_on_blocked and compact.get("blockedRefs"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
