#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile

import pi_remote_quick_check


class FakeRunner:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append({"command": command, "kwargs": kwargs})
        if not self.results:
            return subprocess.CompletedProcess(command, 255, "", "no more fake results")
        item = self.results.pop(0)
        return subprocess.CompletedProcess(command, item.get("returnCode", 0), item.get("stdout", ""), item.get("stderr", ""))


class TimeoutRunner:
    def __init__(self):
        self.calls = []

    def __call__(self, command, **kwargs):
        self.calls.append({"command": command, "kwargs": kwargs})
        raise subprocess.TimeoutExpired(command, kwargs.get("timeout"), output=b"", stderr=b"ssh timeout")


def main():
    tmp = tempfile.TemporaryDirectory()
    cache_path = os.path.join(tmp.name, "pi-last-host.txt")
    hosts_file = os.path.join(tmp.name, "pi-hosts.txt")
    args = pi_remote_quick_check.parse_args([
        "--hosts",
        "bad.local,192.168.18.118,bad.local",
        "--host-cache",
        cache_path,
        "--hosts-file",
        "",
        "--retries",
        "2",
        "--connect-timeout",
        "3",
        "--check-timeout",
        "9",
        "--total-timeout",
        "12",
        "--round-timeout",
        "12",
    ])
    ok_payload = json.dumps({"ok": True, "message": "ok", "audio": {"mode": "soft_mute"}}, ensure_ascii=False)
    runner = FakeRunner([
        {"returnCode": 255, "stderr": "ssh timeout"},
        {"returnCode": 0, "stdout": ok_payload},
    ])
    result = pi_remote_quick_check.run(args, runner=runner)
    command = runner.calls[-1]["command"]
    cached_host = ""
    try:
        with open(cache_path, "r", encoding="utf-8") as handle:
            cached_host = handle.read().strip()
    except OSError:
        pass
    with open(hosts_file, "w", encoding="utf-8") as handle:
        handle.write("from-file.local\n# comment\n192.168.18.118\n")
    with open(cache_path, "w", encoding="utf-8") as handle:
        handle.write("cached.local\n")
    candidate_order = pi_remote_quick_check.candidate_hosts("cli.local,from-file.local", cache_path, hosts_file)
    cases = [
        {
            "name": "round-robins host candidates and succeeds on the second host",
            "passed": result.get("ok") is True
            and result.get("host") == "192.168.18.118"
            and len(result.get("attempts", [])) == 2,
            "detail": result,
        },
        {
            "name": "uses quick unattended check without audio commands",
            "passed": "unattended_check.py --summary --quick" in command[-1]
            and "play" not in command[-1].lower()
            and "aplay" not in command[-1].lower(),
            "detail": command,
        },
        {
            "name": "does not print private Wi-Fi credentials in command",
            "passed": "123666999" not in " ".join(command),
            "detail": command,
        },
        {
            "name": "remembers the last successful Pi host",
            "passed": cached_host == "192.168.18.118",
            "detail": cached_host,
        },
        {
            "name": "tries cached and local host-file candidates first",
            "passed": candidate_order[:3] == ["cached.local", "from-file.local", "192.168.18.118"]
            and "cli.local" in candidate_order,
            "detail": candidate_order,
        },
        {
            "name": "sets bounded SSH timeouts",
            "passed": "ConnectTimeout=3" in command
            and 1 <= runner.calls[-1]["kwargs"].get("timeout") <= 12,
            "detail": runner.calls[-1],
        },
    ]
    budget_runner = FakeRunner([
        {"returnCode": 255, "stderr": "ssh timeout"},
    ])
    budget_args = pi_remote_quick_check.parse_args([
        "--hosts",
        "slow.local",
        "--host-cache",
        "",
        "--hosts-file",
        "",
        "--retries",
        "1",
        "--total-timeout",
        "30",
        "--round-timeout",
        "4",
    ])
    budget_result = pi_remote_quick_check.run(budget_args, runner=budget_runner)
    cases.append({
        "name": "caps each SSH attempt by the whole-round timeout",
        "passed": budget_result.get("ok") is False
        and 1 <= budget_runner.calls[-1]["kwargs"].get("timeout") <= 4,
        "detail": budget_runner.calls[-1],
    })
    ssh_budget_runner = FakeRunner([
        {"returnCode": 255, "stderr": "ssh timeout"},
    ])
    ssh_budget_args = pi_remote_quick_check.parse_args([
        "--hosts",
        "slow.local",
        "--host-cache",
        "",
        "--hosts-file",
        "",
        "--retries",
        "1",
        "--connect-timeout",
        "3",
        "--check-timeout",
        "9",
        "--total-timeout",
        "99",
        "--round-timeout",
        "60",
    ])
    ssh_budget_result = pi_remote_quick_check.run(ssh_budget_args, runner=ssh_budget_runner)
    cases.append({
        "name": "caps each SSH attempt by the SSH command budget",
        "passed": ssh_budget_result.get("ok") is False
        and 1 <= ssh_budget_runner.calls[-1]["kwargs"].get("timeout") <= 15,
        "detail": ssh_budget_runner.calls[-1],
    })
    timeout_runner = FakeRunner([
        {"returnCode": 124, "stderr": "ssh timeout"},
    ])
    timeout_args = pi_remote_quick_check.parse_args(["--hosts", "slow.local", "--retries", "1"])
    timeout_args.host_cache = ""
    timeout_args.hosts_file = ""
    timed_out = pi_remote_quick_check.run(timeout_args, runner=timeout_runner)
    cases.append({
        "name": "reports SSH or remote command timeout distinctly",
        "passed": timed_out.get("ok") is False
        and "timed out" in timed_out.get("message", ""),
        "detail": timed_out,
    })
    bytes_timeout_runner = TimeoutRunner()
    bytes_timeout_args = pi_remote_quick_check.parse_args(["--hosts", "slow.local", "--retries", "1"])
    bytes_timeout_args.host_cache = ""
    bytes_timeout_args.hosts_file = ""
    bytes_timeout = pi_remote_quick_check.run(bytes_timeout_args, runner=bytes_timeout_runner)
    cases.append({
        "name": "timeout byte streams stay JSON serializable",
        "passed": bytes_timeout.get("ok") is False
        and bytes_timeout.get("attempts", [{}])[0].get("stderrTail") == "ssh timeout",
        "detail": bytes_timeout,
    })
    failed_runner = FakeRunner([
        {"returnCode": 255, "stderr": "No route to host"},
    ])
    failed_args = pi_remote_quick_check.parse_args(["--hosts", "missing.local", "--retries", "1"])
    failed_args.host_cache = ""
    failed_args.hosts_file = ""
    failed = pi_remote_quick_check.run(failed_args, runner=failed_runner)
    cases.append({
        "name": "reports network failure without pretending Pi is unhealthy",
        "passed": failed.get("ok") is False
        and "network or SSH" in failed.get("message", "")
        and failed.get("host") == "",
        "detail": failed,
    })
    ok = all(case["passed"] for case in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
