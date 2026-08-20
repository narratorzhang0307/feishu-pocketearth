#!/usr/bin/env bash
set -euo pipefail

CODE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ROOT="${LOCAL_ROOT:-/tmp/aesthetic-curator-runtime}"
PERSIST_ROOT="${PERSIST_ROOT:-/tmp/aesthetic-curator-persist}"
RUN_ID="${RUN_ID:-learnability-v1-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_DIR="$PERSIST_ROOT/runs/$RUN_ID"
OUTPUT_DIR="$LOCAL_ROOT/output"
BUNDLE_ROOT="$LOCAL_ROOT/bundle"
mkdir -p "$RUN_DIR" "$OUTPUT_DIR" "$BUNDLE_ROOT" "$LOCAL_ROOT/cache" "$PERSIST_ROOT/outputs/$RUN_ID"

finish() {
  code=$?
  set +e
  printf '%s\n' "$code" > "$RUN_DIR/exit-code.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$RUN_DIR/finished-at.txt"
  if [[ -n "${OSS_OUTPUT_BUCKET:-}" && -n "${OSS_OUTPUT_PREFIX:-}" ]]; then
    python "$CODE_ROOT/scripts/oss_transfer.py" \
      --endpoint "${OSS_ENDPOINT:-https://oss-cn-shanghai.aliyuncs.com}" \
      --bucket "$OSS_OUTPUT_BUCKET" upload-dir \
      --source "$PERSIST_ROOT" --prefix "$OSS_OUTPUT_PREFIX" \
      > "$RUN_DIR/oss-upload.log" 2>&1
    printf '%s\n' "$?" > "$RUN_DIR/oss-upload-exit-code.txt"
  fi
  trap - EXIT
  exit "$code"
}
trap finish EXIT
exec > >(tee -a "$RUN_DIR/run.log") 2>&1

: "${OSS_DATA_BUCKET:?Set OSS_DATA_BUCKET}"
: "${OSS_DATA_KEY:?Set OSS_DATA_KEY}"
: "${OSS_DATA_SHA256:?Set OSS_DATA_SHA256}"
: "${OSS_OUTPUT_BUCKET:?Set OSS_OUTPUT_BUCKET}"
: "${OSS_OUTPUT_PREFIX:?Set OSS_OUTPUT_PREFIX}"
if [[ ! "$OSS_DATA_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  printf '%s\n' 'OSS_DATA_SHA256 must be 64 lowercase hexadecimal characters' >&2
  exit 2
fi

cd "$CODE_ROOT"
python scripts/check_budget.py --contract configs/run-contract.json | tee "$RUN_DIR/budget-check.json"
date -u +%Y-%m-%dT%H:%M:%SZ > "$RUN_DIR/started-at.txt"
python --version | tee "$RUN_DIR/python-version.txt"
nvidia-smi | tee "$RUN_DIR/nvidia-smi.txt"
python -m pip install --upgrade pip
python -m pip install -r requirements-train.txt
python -m pip freeze > "$RUN_DIR/pip-freeze.txt"

export HF_HOME="$LOCAL_ROOT/cache/huggingface"
export MODELSCOPE_CACHE="$LOCAL_ROOT/cache/modelscope"
export PIP_CACHE_DIR="$LOCAL_ROOT/cache/pip"
export TOKENIZERS_PARALLELISM=false
bundle_zip="$LOCAL_ROOT/learnability-v1.zip"
python scripts/oss_transfer.py \
  --endpoint "${OSS_ENDPOINT:-https://oss-cn-shanghai.aliyuncs.com}" \
  --bucket "$OSS_DATA_BUCKET" download \
  --key "$OSS_DATA_KEY" --destination "$bundle_zip"
actual_sha="$(sha256sum "$bundle_zip" | awk '{print $1}')"
if [[ "$actual_sha" != "$OSS_DATA_SHA256" ]]; then
  printf 'Bundle SHA-256 mismatch: expected=%s actual=%s\n' "$OSS_DATA_SHA256" "$actual_sha" >&2
  exit 2
fi
printf '%s  %s\n' "$actual_sha" "$bundle_zip" > "$RUN_DIR/input.sha256"
python - "$bundle_zip" "$BUNDLE_ROOT" <<'PY'
import sys, zipfile
from pathlib import Path
archive, output = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
with zipfile.ZipFile(archive) as source:
    for member in source.infolist():
        target = (output / member.filename).resolve()
        if output not in target.parents and target != output:
            raise ValueError(f"Unsafe archive member: {member.filename}")
    source.extractall(output)
PY
python scripts/validate_remote_bundle.py --bundle "$BUNDLE_ROOT" | tee "$RUN_DIR/remote-bundle-validation.json"
python scripts/build_eval_subset.py \
  --bundle "$BUNDLE_ROOT" --output-dir "$RUN_DIR/eval" --pairs-per-source 8
python -m unittest discover -s "$CODE_ROOT/tests" -v 2>&1 | tee "$RUN_DIR/unit-tests.txt"

MODEL_ID="Qwen/Qwen3-VL-2B-Instruct"
MODEL_REVISION="ae9985b208c074c10cfbe3a61b5cb7268cdc9c53"
cd "$BUNDLE_ROOT"
TRAIN_JSONL="$BUNDLE_ROOT/train.jsonl" \
VAL_JSONL="$BUNDLE_ROOT/validation.jsonl" \
OUTPUT_DIR="$OUTPUT_DIR" \
MODEL_ID="$MODEL_ID" MODEL_REVISION="$MODEL_REVISION" \
MAX_STEPS=160 IMAGE_TOKENS=512 \
bash "$CODE_ROOT/scripts/train_visual_lora.sh" 2>&1 | tee "$RUN_DIR/train.log"

checkpoint="$(find "$OUTPUT_DIR" -type d -name 'checkpoint-*' | sort -V | tail -1)"
if [[ -z "$checkpoint" || ! -s "$checkpoint/adapter_model.safetensors" ]]; then
  printf '%s\n' 'No complete LoRA checkpoint was produced' >&2
  exit 2
fi
cp -R "$OUTPUT_DIR"/. "$PERSIST_ROOT/outputs/$RUN_ID"/
printf '%s\n' "$checkpoint" > "$RUN_DIR/selected-checkpoint.txt"
sha256sum "$checkpoint/adapter_model.safetensors" "$checkpoint/adapter_config.json" > "$RUN_DIR/adapter.sha256"
python "$CODE_ROOT/scripts/audit_adapter_scope.py" \
  "$checkpoint/adapter_model.safetensors" --output "$RUN_DIR/adapter-scope.json"

COMMON=(
  --model "$MODEL_ID"
  --model_revision "$MODEL_REVISION"
  --use_hf false
  --infer_backend transformers
  --stream false
  --temperature 0
  --repetition_penalty 1.0
  --max_new_tokens 64
  --max_batch_size 1
  --val_dataset_sample 32
  --val_dataset_shuffle false
  --load_args false
)
PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True' IMAGE_MAX_TOKEN_NUM=512 \
swift infer "${COMMON[@]}" --val_dataset "$RUN_DIR/eval/minimal.jsonl" \
  --result_path "$RUN_DIR/base-results.jsonl" 2>&1 | tee "$RUN_DIR/base-infer.log"
PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True' IMAGE_MAX_TOKEN_NUM=512 \
swift infer "${COMMON[@]}" --val_dataset "$RUN_DIR/eval/md.jsonl" \
  --result_path "$RUN_DIR/md-results.jsonl" 2>&1 | tee "$RUN_DIR/md-infer.log"
PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True' IMAGE_MAX_TOKEN_NUM=512 \
swift infer "${COMMON[@]}" --val_dataset "$RUN_DIR/eval/minimal.jsonl" \
  --adapters "$checkpoint" --result_path "$RUN_DIR/lora-results.jsonl" \
  2>&1 | tee "$RUN_DIR/lora-infer.log"

for result in base-results.jsonl md-results.jsonl lora-results.jsonl; do
  test "$(wc -l < "$RUN_DIR/$result")" -eq 32
done
python "$CODE_ROOT/scripts/evaluate_aesthetic_results.py" \
  --manifest "$RUN_DIR/eval/manifest.json" \
  --base "$RUN_DIR/base-results.jsonl" \
  --md "$RUN_DIR/md-results.jsonl" \
  --lora "$RUN_DIR/lora-results.jsonl" \
  --output "$RUN_DIR/learnability-report.json"
sha256sum "$RUN_DIR/base-results.jsonl" "$RUN_DIR/md-results.jsonl" \
  "$RUN_DIR/lora-results.jsonl" "$RUN_DIR/learnability-report.json" \
  > "$RUN_DIR/evaluation.sha256"
