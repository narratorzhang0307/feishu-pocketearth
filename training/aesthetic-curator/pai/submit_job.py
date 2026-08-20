#!/usr/bin/env python3
"""Build and optionally submit the single guarded PAI learnability job."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


ALIYUN = "/Users/zhangcheng/.local/bin/aliyun"
WORKSPACE_ID = "1188035"
REGION = "cn-shanghai"
BUCKET = "oss-pai-3m1he8io2yqgxq03hp-cn-shanghai"
ENDPOINT = "https://oss-cn-shanghai.aliyuncs.com"
IMAGE = "dsw-registry-vpc.cn-shanghai.cr.aliyuncs.com/pai/pytorch:2.7.1-gpu-py311-cu126-ubuntu24.04-accl-b244fc94-1764402652"
ECS_SPEC = "ecs.gn7i-c8g1.2xlarge"
CODE_KEY = "aesthetic-curator/v1/code/aesthetic-curator-code-v1.zip"
CODE_SHA256 = "919770a13dbaad3248669bcddb85a9639512965d8eb0ef249307346fb382e328"
DATA_KEY = "aesthetic-curator/v1/input/learnability-v1.zip"
DATA_SHA256 = "b7724b11976274c4136bf9c5de6b3b8b351c42515d624c9b37599cf70bb651d2"


def user_command(run_id: str) -> str:
    output_prefix = f"aesthetic-curator/v1/runs/{run_id}"
    return f"""set -eu
python -m pip install -q alibabacloud-credentials==1.0.10 oss2==2.19.1
python - <<'PY'
import oss2
from alibabacloud_credentials import providers
auth = oss2.ProviderAuth(providers.DefaultCredentialsProvider())
bucket = oss2.Bucket(auth, {ENDPOINT!r}, {BUCKET!r})
bucket.get_object_to_file({CODE_KEY!r}, '/tmp/aesthetic-curator-code-v1.zip')
PY
printf '%s  %s\\n' '{CODE_SHA256}' '/tmp/aesthetic-curator-code-v1.zip' | sha256sum -c -
mkdir -p /tmp/aesthetic-curator-code-v1
python - <<'PY'
import zipfile
from pathlib import Path
archive = Path('/tmp/aesthetic-curator-code-v1.zip')
output = Path('/tmp/aesthetic-curator-code-v1').resolve()
with zipfile.ZipFile(archive) as source:
    for member in source.infolist():
        target = (output / member.filename).resolve()
        if output not in target.parents and target != output:
            raise ValueError(f'Unsafe code archive member: {{member.filename}}')
    source.extractall(output)
PY
cd /tmp/aesthetic-curator-code-v1
export LOCAL_ROOT=/tmp/aesthetic-curator-runtime
export PERSIST_ROOT=/tmp/aesthetic-curator-persist
export RUN_ID={run_id}
export OSS_ENDPOINT={ENDPOINT}
export OSS_DATA_BUCKET={BUCKET}
export OSS_DATA_KEY={DATA_KEY}
export OSS_DATA_SHA256={DATA_SHA256}
export OSS_OUTPUT_BUCKET={BUCKET}
export OSS_OUTPUT_PREFIX={output_prefix}
timeout --signal=TERM --kill-after=90s 48m bash scripts/run_pai_train_eval.sh
"""


def build_body(run_id: str) -> dict:
    return {
        "DisplayName": f"aesthetic-curator-lora-{run_id}",
        "Description": "Pocket Earth Photos aesthetic curator learnability v1; 160-step visual LoRA; Base/MD/LoRA comparison; 50-minute hard cap; max CNY 8.75 at verified price.",
        "JobType": "PyTorchJob",
        "WorkspaceId": WORKSPACE_ID,
        "ResourceType": "ECS",
        "JobMaxRunningTimeMinutes": 50,
        "JobSpecs": [{
            "Type": "Worker",
            "Image": IMAGE,
            "PodCount": 1,
            "EcsSpec": ECS_SPEC,
        }],
        "UserCommand": user_command(run_id),
        "Settings": {
            "JobReservedMinutes": 0,
            "Tags": {
                "Budget": "max-cny-8.75-hard-cap-cny-50",
                "Purpose": "aesthetic-curator-learnability-v1",
            },
        },
        "CredentialConfig": {
            "EnableCredentialInject": True,
            "AliyunEnvRoleKey": "0",
            "CredentialConfigItems": [{"Key": "0", "Type": "Role", "Roles": []}],
        },
        "Accessibility": "PRIVATE",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--run-id")
    args = parser.parse_args()
    run_id = args.run_id or datetime.now(timezone.utc).strftime("learnability-v1-%Y%m%dT%H%M%SZ")
    body = build_body(run_id)
    record = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "runId": run_id,
        "submitted": False,
        "cost": {
            "verifiedPricePerHourCny": 10.5,
            "maxRunningMinutes": 50,
            "estimatedMaximumCny": 8.75,
            "absoluteUserCapCny": 50,
        },
        "artifacts": {
            "code": {"key": CODE_KEY, "sha256": CODE_SHA256},
            "data": {"key": DATA_KEY, "sha256": DATA_SHA256},
            "outputPrefix": f"aesthetic-curator/v1/runs/{run_id}",
        },
        "request": body,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not args.submit:
        print(json.dumps({"runId": run_id, "submitted": False, "output": str(args.output)}, ensure_ascii=False))
        return 0
    completed = subprocess.run(
        [ALIYUN, "pai-dlc", "CreateJob", "--region", REGION, "--body", json.dumps(body, ensure_ascii=False)],
        check=True,
        text=True,
        capture_output=True,
    )
    response = json.loads(completed.stdout)
    record["submitted"] = True
    record["submittedAt"] = datetime.now(timezone.utc).isoformat()
    record["response"] = response
    args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
