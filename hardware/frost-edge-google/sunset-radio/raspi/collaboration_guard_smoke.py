#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile

import collaboration_guard


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def make_tree(root, pose_count=483, omit=None):
    omit = set(omit or [])
    for relpath in collaboration_guard.REQUIRED_GUARDS:
        if relpath in omit:
            continue
        write(os.path.join(root, relpath), "ok\n")
    write(os.path.join(root, "raspi", "AVATAR.md"), f"Whisplay avatar catalog: {pose_count}\n")
    write(
        os.path.join(root, "raspi", "whisplay_status.py"),
        'post_button_command("切换声音", event="long")\n',
    )
    write(os.path.join(root, "raspi", "frost_avatar.py"), "ok\n")
    write(os.path.join(root, "raspi", "pi_command_daemon.py"), "ok\n")
    write(
        os.path.join(root, "raspi", "ambient_privacy.py"),
        "\n".join(
            [
                "manual_only",
                "autoCapture",
                "deleted_after_analysis",
                "not_used",
                "not_inferred",
                "not_started_by_ambient_layer",
                "不会自动拍照",
                "不识别身份或表情",
            ]
        ),
    )
    write(
        os.path.join(root, "raspi", "ambient_plan.py"),
        "\n".join(
            [
                '"capture": "manual_only"',
                '"imageRetention": "deleted_after_analysis"',
                '"identity": "not_used"',
                '"emotion": "not_inferred"',
                '"canInterrupt": False',
                '"canStartAudio": False',
                "只观察一帧",
                "下一段",
            ]
        ),
    )
    write(
        os.path.join(root, "raspi", "ambient_policy.py"),
        "\n".join(["modulate_next_block", "hold_cooldown", "next_block", "24H 主线优先", "canInterrupt"]),
    )
    write(os.path.join(root, "raspi", "camera_status.py"), "ok\n")
    write(os.path.join(root, "raspi", "camera_doctor.py"), "ok\n")
    write(os.path.join(root, "raspi", "AMBIENT.md"), "manual capture only\n")
    write(os.path.join(root, "raspi", "ambient_daemon.py"), "manual_only\n")
    write(
        os.path.join(root, "raspi", "ambient_agent.py"),
        "\n".join(
            [
                '"capture": "manual_only"',
                '"autoCapture": False',
                '"imageRetention": "deleted_after_analysis"',
                '"identity": "not_used"',
                '"emotion": "not_inferred"',
                '"canInterrupt": False',
                '"canStartAudio": False',
                '"directPlayerCommand": False',
                "observe_once(capture=True)",
            ]
        ),
    )
    write(
        os.path.join(root, "raspi", "frost_poses.json"),
        json.dumps([{"id": str(index)} for index in range(pose_count)]),
    )


def run_with_root(root, warnings=None):
    original_root = collaboration_guard.ROOT
    original_ref_warnings = collaboration_guard.ref_warnings
    try:
        collaboration_guard.ROOT = root
        collaboration_guard.ref_warnings = lambda current_pose_count=None: (
            {"test-ref": {"available": True, "poseCount": current_pose_count}},
            warnings or [],
        )
        return collaboration_guard.collect()
    finally:
        collaboration_guard.ROOT = original_root
        collaboration_guard.ref_warnings = original_ref_warnings


def make_git_repo(root):
    subprocess.run(["git", "init", "-q"], cwd=root, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    subprocess.run(["git", "add", "."], cwd=root, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def main():
    cases = []
    with tempfile.TemporaryDirectory(prefix="sunset-collab-guard-") as tmp:
        make_tree(tmp)
        report = run_with_root(tmp)
        cases.append(
            {
                "name": "complete guard tree passes",
                "passed": report.get("ok") is True
                and report.get("poseCount") == 483
                and report.get("checks", {}).get("ambientPrivacyBoundaries") is True,
            }
        )

    with tempfile.TemporaryDirectory(prefix="sunset-collab-guard-") as tmp:
        make_tree(tmp)
        write(
            os.path.join(tmp, "raspi", "ambient_privacy.py"),
            "manual_only\nautoCapture\ndeleted_after_analysis\nnot_started_by_ambient_layer\n",
        )
        report = run_with_root(tmp)
        cases.append(
            {
                "name": "missing ambient privacy boundary fails",
                "passed": report.get("ok") is False
                and report.get("checks", {}).get("ambientPrivacyBoundaries") is False
                and any(
                    gap.get("path") == "raspi/ambient_privacy.py"
                    and {"not_used", "not_inferred"}.issubset(set(gap.get("missing") or []))
                    for gap in report.get("ambientBoundaryGaps", [])
                ),
            }
        )

    with tempfile.TemporaryDirectory(prefix="sunset-collab-guard-") as tmp:
        make_tree(tmp, omit={"raspi/avatar_smoke.py"})
        report = run_with_root(tmp)
        cases.append(
            {
                "name": "missing guard file fails",
                "passed": report.get("ok") is False and "raspi/avatar_smoke.py" in report.get("missingGuardFiles", []),
            }
        )

    with tempfile.TemporaryDirectory(prefix="sunset-collab-guard-") as tmp:
        make_tree(tmp, pose_count=12)
        report = run_with_root(tmp)
        cases.append(
            {
                "name": "shrunk avatar catalog fails",
                "passed": report.get("ok") is False and report.get("poseCount") == 12,
            }
        )

    with tempfile.TemporaryDirectory(prefix="sunset-collab-guard-") as tmp:
        make_tree(tmp, pose_count=444)
        report = run_with_root(tmp)
        cases.append(
            {
                "name": "old 444-pose catalog fails",
                "passed": report.get("ok") is False
                and report.get("poseCount") == 444
                and report.get("minimumPoseCount") == 483,
            }
        )

    with tempfile.TemporaryDirectory(prefix="sunset-collab-guard-") as tmp:
        make_tree(tmp)
        write(
            os.path.join(tmp, "raspi", "ambient_daemon.py"),
            "\n".join(
                [
                    "while True:",
                    '    if mode != "adaptive":',
                    "        continue",
                    "    obs.capture_snapshot(camera)",
                    "    coordinator.build_agent_report(capture=True, persist=True)",
                ]
            ),
        )
        make_git_repo(tmp)
        report = run_with_root(tmp)
        cases.append(
            {
                "name": "current main rejects continuous ambient camera daemon",
                "passed": report.get("ok") is False
                and report.get("checks", {}).get("ambientDaemonConsentBounded") is False
                and any("continuous ambient camera daemon" in warning for warning in report.get("localWarnings") or []),
                "detail": report.get("localWarnings"),
            }
        )

    with tempfile.TemporaryDirectory(prefix="sunset-collab-guard-") as tmp:
        make_tree(tmp)
        warning = collaboration_guard.format_deletion_warning(
            "test-ref",
            [
                "raspi/AVATAR.md",
                "raspi/frost_avatar.py",
                "raspi/frost_poses.json",
                "raspi/whisplay_status.py",
                "raspi/pi_command_daemon.py",
                "raspi/collaboration_guard.py",
                "raspi/collaboration_guard_smoke.py",
                "raspi/deploy_doctor.py",
                "raspi/unattended_check.py",
            ],
        )
        report = run_with_root(tmp, warnings=[warning])
        compact = collaboration_guard.compact_report(report)
        cases.append(
            {
                "name": "remote rollback warning does not fail current main",
                "passed": report.get("ok") is True
                and "(s): raspi/AVATAR.md" in warning
                and "+1 more" in warning
                and bool(report.get("warnings"))
                and compact.get("warningCount") == 1
                and compact.get("blockedRefs") == ["test-ref"]
                and compact.get("refs", {}).get("test-ref", {}).get("blocked") is True
                and compact.get("refs", {}).get("test-ref", {}).get("available") is True
                and compact.get("refs", {}).get("test-ref", {}).get("poseCount") == 483,
                "detail": compact,
            }
        )

    cases.append(
        {
            "name": "remote pose reduction warning names the exact shrink",
            "passed": collaboration_guard.pose_count_from_text(json.dumps({"poses": [{"id": "a"}] * 444})) == 444
            and collaboration_guard.format_pose_reduction_warning("test-ref", 483, 444)
            == "test-ref would reduce Whisplay avatar poses from 483 to 444; do not merge it wholesale.",
        }
    )

    guard_warnings = collaboration_guard.guard_self_warnings(
        "test-ref",
        [
            {"status": "M", "path": "raspi/collaboration_guard.py"},
            {"status": "M", "path": "raspi/collaboration_guard_smoke.py"},
        ],
    )
    cases.append(
        {
            "name": "remote guard self edits require manual review",
            "passed": any("modifies collaboration guard file" in warning for warning in guard_warnings)
            and any("review guard changes manually" in warning for warning in guard_warnings),
            "detail": guard_warnings,
        }
    )

    risky_agent = """
while True:
    if mode != "adaptive":
        continue
    report = obs.observe_once(capture=True)
"""
    agent_warnings = collaboration_guard.ambient_agent_warnings("test-ref", risky_agent)
    cases.append(
        {
            "name": "continuous camera agent produces merge warning",
            "passed": any("continuous ambient camera agent" in warning for warning in agent_warnings)
            and any("missing privacy boundary" in warning for warning in agent_warnings),
        }
    )

    risky_daemon = """
while True:
    mode = ambient_mode.load_ambient_mode().get("mode")
    if mode != "adaptive":
        continue
    path, err = obs.capture_snapshot(camera)
    report = coordinator.build_agent_report(capture=True, persist=True)
"""
    daemon_warnings = collaboration_guard.ambient_daemon_warnings("test-ref", risky_daemon)
    cases.append(
        {
            "name": "continuous camera daemon produces merge warning",
            "passed": any("continuous ambient camera daemon" in warning for warning in daemon_warnings)
            and any("manual/consent capture" in warning for warning in daemon_warnings),
            "detail": daemon_warnings,
        }
    )

    risky_audio = """
def set_volume(value):
    subprocess.run(["amixer", "sset", "speaker", f"{value}%"])
"""
    audio_warnings = collaboration_guard.audio_control_warnings("test-ref", risky_audio)
    cases.append(
        {
            "name": "direct volume control without audio boundary produces merge warning",
            "passed": any("direct system volume control" in warning for warning in audio_warnings)
            and any("audio-mode boundary" in warning for warning in audio_warnings),
            "detail": audio_warnings,
        }
    )

    bounded_audio = """
from audio_mode import audio_allows_dialog, load_audio_mode
def set_volume(value):
    if not audio_allows_dialog(load_audio_mode()):
        return False
    subprocess.run(["amixer", "sset", "speaker", f"{value}%"])
"""
    bounded_audio_warnings = collaboration_guard.audio_control_warnings("test-ref", bounded_audio)
    cases.append(
        {
            "name": "volume control with audio boundary is not warned",
            "passed": bounded_audio_warnings == [],
            "detail": bounded_audio_warnings,
        }
    )

    result = subprocess.run(
        ["python3", collaboration_guard.__file__, "--summary", "--fail-on-blocked"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=20,
    )
    try:
        current_compact = json.loads(result.stdout)
    except json.JSONDecodeError:
        current_compact = {}
    cases.append(
        {
            "name": "fail-on-blocked exits nonzero only when current refs are blocked",
            "passed": (
                result.returncode == 1
                if current_compact.get("blockedRefs")
                else result.returncode == (0 if current_compact.get("ok") else 1)
            ),
            "detail": {"returnCode": result.returncode, "blockedRefs": current_compact.get("blockedRefs")},
        }
    )

    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
