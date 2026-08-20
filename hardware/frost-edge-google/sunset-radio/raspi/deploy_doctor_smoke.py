#!/usr/bin/env python3
import json
import os
import tempfile

import deploy_doctor


def touch(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("ok\n")


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def main():
    with tempfile.TemporaryDirectory(prefix="sunset-deploy-doctor-") as tmp:
        for relpath in deploy_doctor.REQUIRED_PATHS:
            path = os.path.join(tmp, relpath)
            if relpath.endswith("cities"):
                os.makedirs(path, exist_ok=True)
            else:
                touch(path)
        for relpath, tokens in deploy_doctor.CONTENT_GUARDS.items():
            write(os.path.join(tmp, relpath), "\n".join(tokens))
        ok_report = deploy_doctor.collect_deploy_doctor(root=tmp, check_systemd=False)
        write(os.path.join(tmp, "raspi", "ambient_daemon.py"), "while True: pass\n")
        experimental_report = deploy_doctor.collect_deploy_doctor(root=tmp, check_systemd=False)
        os.remove(os.path.join(tmp, "raspi", "ambient_daemon.py"))
        original_systemd_properties = deploy_doctor.systemd_properties

        def fake_systemd_properties(service):
            if service in deploy_doctor.SERVICE_REFERENCES:
                refs = "\n".join(os.path.join(tmp, relpath) for relpath in deploy_doctor.SERVICE_REFERENCES[service])
                return {
                    "ok": True,
                    "LoadState": "loaded",
                    "ActiveState": "active",
                    "UnitFileState": "enabled",
                    "FragmentPath": f"/etc/systemd/system/{service}.service",
                    "ExecStart": refs,
                    "Environment": "",
                    "EnvironmentFiles": "",
                }
            if service == "sunset-radio-ambient":
                return {
                    "ok": True,
                    "LoadState": "loaded",
                    "ActiveState": "active",
                    "UnitFileState": "enabled",
                    "FragmentPath": "/etc/systemd/system/sunset-radio-ambient.service",
                    "ExecStart": os.path.join(tmp, "raspi", "ambient_daemon.py"),
                }
            return {"ok": True, "LoadState": "not-found", "ActiveState": "inactive", "UnitFileState": "disabled"}

        try:
            deploy_doctor.systemd_properties = fake_systemd_properties
            experimental_service_report = deploy_doctor.collect_deploy_doctor(root=tmp, check_systemd=True)
        finally:
            deploy_doctor.systemd_properties = original_systemd_properties
        ambient_service_status = experimental_service_report.get("experimentalServices", {}).get("sunset-radio-ambient", {})
        write(os.path.join(tmp, "raspi", "ambient_agent.py"), "continuous camera loop\n")
        drift_report = deploy_doctor.collect_deploy_doctor(root=tmp, check_systemd=False)
        write(os.path.join(tmp, "raspi", "ambient_agent.py"), "\n".join(deploy_doctor.CONTENT_GUARDS["raspi/ambient_agent.py"]))
        os.remove(os.path.join(tmp, "server.mjs"))
        missing_report = deploy_doctor.collect_deploy_doctor(root=tmp, check_systemd=False)

    cases = [
        {
            "name": "complete deploy tree passes without systemd",
            "passed": ok_report.get("ok") and ok_report.get("warnings") == [],
        },
        {
            "name": "experimental camera daemon is reported without failing deploy",
            "passed": experimental_report.get("ok")
            and experimental_report.get("warnings")
            and "相机实验内容" in experimental_report.get("message", ""),
            "detail": experimental_report.get("warnings"),
        },
        {
            "name": "absent experimental docs are not reported as present",
            "passed": "未发现隔离环境相机说明"
            in (
                experimental_report.get("experimentalFiles", {})
                .get("raspi/AMBIENT.md", {})
                .get("message", "")
            ),
            "detail": experimental_report.get("experimentalFiles", {}).get("raspi/AMBIENT.md"),
        },
        {
            "name": "experimental ambient service is reported without failing deploy",
            "passed": experimental_service_report.get("ok")
            and ambient_service_status.get("loaded") is True
            and bool(experimental_service_report.get("warnings"))
            and "相机实验服务已接入" in experimental_service_report.get("message", ""),
            "detail": experimental_service_report.get("experimentalServices", {}),
        },
        {
            "name": "missing server entry is reported",
            "passed": not missing_report.get("ok") and "server.mjs" in missing_report.get("message", ""),
        },
        {
            "name": "ambient agent drift is reported",
            "passed": not drift_report.get("ok") and "ambient_agent.py" in drift_report.get("message", ""),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
