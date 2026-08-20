#!/usr/bin/env python3
"""Run the Pi quick unattended check over SSH with safe retries.

This script is meant for desktop automation heartbeats. It does not play audio;
it only asks the Pi to run the silent quick health bundle and returns a compact
JSON result that is easy to act on.
"""
import argparse
import json
import os
import subprocess
import sys
import time


DEFAULT_HOSTS = ("192.168.18.118", "sunset-pi.local", "raspberrypi.local")
DEFAULT_ROOT = "/home/pi/sunset-radio"
DEFAULT_USER = "pi"
DEFAULT_KEY = "~/.ssh/sunset_pi_ed25519"
DEFAULT_HOST_CACHE = "~/.config/sunset-radio/pi-last-host.txt"
DEFAULT_HOSTS_FILE = "~/.config/sunset-radio/pi-hosts.txt"


def split_hosts(value):
    hosts = []
    for item in str(value or "").replace("\n", ",").split(","):
        host = item.strip()
        if host and host not in hosts:
            hosts.append(host)
    return hosts


def read_hosts_file(path):
    if not path:
        return []
    try:
        with open(os.path.expanduser(path), "r", encoding="utf-8", errors="replace") as handle:
            return split_hosts(
                "\n".join(line.split("#", 1)[0].strip() for line in handle)
            )
    except OSError:
        return []


def read_cached_host(path):
    hosts = read_hosts_file(path)
    return hosts[0] if hosts else ""


def remember_host(host, path):
    if not host or not path:
        return
    target = os.path.expanduser(path)
    try:
        directory = os.path.dirname(target)
        if directory:
            os.makedirs(directory, mode=0o700, exist_ok=True)
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(f"{host}\n")
    except OSError:
        pass


def candidate_hosts(cli_hosts, host_cache=DEFAULT_HOST_CACHE, hosts_file=DEFAULT_HOSTS_FILE):
    hosts = []
    cached = read_cached_host(host_cache)
    if cached:
        hosts.append(cached)
    hosts.extend(read_hosts_file(hosts_file))
    hosts.extend(split_hosts(cli_hosts or os.environ.get("SUNSET_PI_HOSTS") or ",".join(DEFAULT_HOSTS)))
    return split_hosts(",".join(hosts))


def build_ssh_command(host, user=DEFAULT_USER, key=DEFAULT_KEY, root=DEFAULT_ROOT, connect_timeout=6, check_timeout=25):
    key_path = os.path.expanduser(key)
    remote = (
        f"cd {shell_quote(root)} && "
        f"timeout {int(check_timeout)}s python3 raspi/unattended_check.py --summary --quick"
    )
    return [
        "ssh",
        "-i",
        key_path,
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        f"ConnectTimeout={int(connect_timeout)}",
        "-o",
        "ConnectionAttempts=1",
        f"{user}@{host}",
        remote,
    ]


def shell_quote(value):
    return "'" + str(value).replace("'", "'\"'\"'") + "'"


def as_text(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value or "")


def compact_attempt(host, result):
    stdout = as_text(result.stdout).strip()
    stderr = as_text(result.stderr).strip()
    payload = {
        "host": host,
        "returnCode": result.returncode,
    }
    if stdout:
        payload["stdoutTail"] = stdout[-1200:]
        try:
            parsed = json.loads(stdout)
            payload["report"] = parsed
            payload["ok"] = result.returncode == 0 and bool(parsed.get("ok"))
        except json.JSONDecodeError:
            payload["ok"] = False
    else:
        payload["ok"] = False
    if stderr:
        payload["stderrTail"] = stderr[-600:]
    payload["failureKind"] = classify_failure(payload)
    return payload


def classify_failure(attempt):
    if attempt.get("ok"):
        return "ok"
    if attempt.get("report"):
        return "pi_health"
    stderr = str(attempt.get("stderrTail") or "").lower()
    code = attempt.get("returnCode")
    if code == 124 or "timed out" in stderr or "timeout" in stderr:
        return "timeout"
    if "permission denied" in stderr:
        return "auth"
    if "could not resolve hostname" in stderr or "nodename nor servname" in stderr:
        return "dns"
    if "connection refused" in stderr:
        return "refused"
    if "operation timed out" in stderr or "no route to host" in stderr:
        return "network"
    return "ssh"


def failure_message(attempts, round_timeout=False):
    kinds = {attempt.get("failureKind") or classify_failure(attempt) for attempt in attempts}
    if "pi_health" in kinds:
        return "Pi quick check completed but reported a health failure."
    if "auth" in kinds:
        return "Pi SSH authentication failed; check the configured key or user."
    if "timeout" in kinds:
        return (
            "Pi SSH quick check timed out before a health report returned."
            if round_timeout
            else "Pi SSH quick check timed out; network or the Pi health command is slow."
        )
    if kinds <= {"dns"}:
        return "Pi host names could not be resolved on this network."
    return "Pi SSH quick check did not complete; network or SSH is unavailable."


def run_once(host, args, runner=subprocess.run, timeout=None):
    command = build_ssh_command(
        host,
        user=args.user,
        key=args.key,
        root=args.root,
        connect_timeout=args.connect_timeout,
        check_timeout=args.check_timeout,
    )
    try:
        result = runner(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout if timeout is not None else args.total_timeout,
        )
    except subprocess.TimeoutExpired as exc:
        result = subprocess.CompletedProcess(command, 124, as_text(exc.stdout), as_text(exc.stderr) or "ssh timeout")
    except OSError as exc:
        result = subprocess.CompletedProcess(command, 127, "", str(exc))
    return compact_attempt(host, result)


def run(args, runner=subprocess.run):
    attempts = []
    round_timeout = max(1, int(getattr(args, "round_timeout", 60) or 60))
    deadline = time.monotonic() + round_timeout
    hosts = candidate_hosts(args.hosts, args.host_cache, args.hosts_file)
    ssh_budget = max(1, int(args.connect_timeout) + int(args.check_timeout) + 3)
    for _ in range(max(1, args.retries)):
        for host in hosts:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return {
                    "ok": False,
                    "host": "",
                    "message": failure_message(attempts, round_timeout=True),
                    "attempts": attempts,
                }
            attempt_timeout = max(1, min(int(args.total_timeout), ssh_budget, int(remaining)))
            attempt = run_once(host, args, runner=runner, timeout=attempt_timeout)
            attempts.append(attempt)
            if attempt.get("ok"):
                remember_host(host, args.host_cache)
                return {
                    "ok": True,
                    "host": host,
                    "message": "Pi quick unattended check passed.",
                    "report": attempt.get("report") or {},
                    "attempts": attempts,
                }
    return {
        "ok": False,
        "host": "",
        "message": failure_message(attempts),
        "attempts": attempts,
    }


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Run Sunset Radio Pi quick health check over SSH.")
    parser.add_argument("--hosts", default="", help="Comma-separated host/IP candidates. Defaults to SUNSET_PI_HOSTS or known Pi names.")
    parser.add_argument("--user", default=DEFAULT_USER)
    parser.add_argument("--key", default=DEFAULT_KEY)
    parser.add_argument("--root", default=DEFAULT_ROOT)
    parser.add_argument("--host-cache", default=os.environ.get("SUNSET_PI_HOST_CACHE", DEFAULT_HOST_CACHE), help="Remember the last successful Pi host here; pass empty string to disable.")
    parser.add_argument("--hosts-file", default=os.environ.get("SUNSET_PI_HOSTS_FILE", DEFAULT_HOSTS_FILE), help="Optional newline/comma separated extra Pi host candidates.")
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--connect-timeout", type=int, default=6)
    parser.add_argument("--check-timeout", type=int, default=25)
    parser.add_argument("--total-timeout", type=int, default=35)
    parser.add_argument("--round-timeout", type=int, default=60, help="Whole-run timeout budget across all SSH host attempts.")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    result = run(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
