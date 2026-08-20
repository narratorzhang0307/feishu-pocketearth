#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${1:-sunset-pi}"
MODEL_FILE="${2:-/Users/zhangcheng/Downloads/gemma-4-E4B_q4_0-it.gguf}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_MODEL_DIR="/var/lib/pocket-earth-gemma"
REMOTE_MODEL_NAME="gemma-4-E4B_q4_0-it.gguf"
REMOTE_MODEL_PART="$REMOTE_MODEL_DIR/$REMOTE_MODEL_NAME.part"
REMOTE_SERVICE_STAGE="/tmp/pocket-earth-gemma.service.$$"

if [[ ! -f "$MODEL_FILE" ]]; then
  echo "Gemma model not found: $MODEL_FILE" >&2
  exit 2
fi

cleanup() {
  ssh "$PI_HOST" "rm -f -- '$REMOTE_SERVICE_STAGE'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

LOCAL_SHA256="$(shasum -a 256 "$MODEL_FILE" | awk '{print $1}')"
ssh "$PI_HOST" "sudo install -d -m 0755 -o pi -g pi '$REMOTE_MODEL_DIR' /opt/pocket-earth-gemma/bin /opt/pocket-earth-gemma/lib"
scp -q "$SCRIPT_DIR/pocket-earth-gemma.service" "$PI_HOST:$REMOTE_SERVICE_STAGE"
rsync -ah --progress --partial --inplace \
  "$MODEL_FILE" "$PI_HOST:$REMOTE_MODEL_PART"

REMOTE_SHA256="$(ssh "$PI_HOST" "sha256sum '$REMOTE_MODEL_PART' | awk '{print \$1}'")"
if [[ "$REMOTE_SHA256" != "$LOCAL_SHA256" ]]; then
  echo "Gemma SHA-256 mismatch after transfer." >&2
  echo "local:  $LOCAL_SHA256" >&2
  echo "remote: $REMOTE_SHA256" >&2
  exit 3
fi

ssh "$PI_HOST" "set -euo pipefail
  if ! LD_LIBRARY_PATH=/opt/pocket-earth-gemma/lib /opt/pocket-earth-gemma/bin/llama-server --version >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends build-essential cmake git
    build_dir=\"\$(mktemp -d /tmp/pocket-earth-llama.XXXXXX)\"
    trap 'rm -rf -- \"\$build_dir\"' EXIT
    git clone --depth 1 https://github.com/ggml-org/llama.cpp.git \"\$build_dir/src\"
    cmake -S \"\$build_dir/src\" -B \"\$build_dir/build\" -DGGML_NATIVE=ON -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release
    cmake --build \"\$build_dir/build\" --target llama-server -j2
    sudo install -m 0755 \"\$build_dir/build/bin/llama-server\" /opt/pocket-earth-gemma/bin/llama-server
    find \"\$build_dir/build/bin\" -maxdepth 1 \( -type f -o -type l \) -name '*.so*' \
      -exec sudo cp -a -- {} /opt/pocket-earth-gemma/lib/ \;
  fi
  mv '$REMOTE_MODEL_PART' '$REMOTE_MODEL_DIR/$REMOTE_MODEL_NAME'
  chmod 0644 '$REMOTE_MODEL_DIR/$REMOTE_MODEL_NAME'
  sudo install -m 0644 '$REMOTE_SERVICE_STAGE' /etc/systemd/system/pocket-earth-gemma.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now pocket-earth-gemma.service
  for attempt in \$(seq 1 120); do
    if curl -fsS http://127.0.0.1:8787/v1/models >/dev/null; then break; fi
    sleep 2
  done
  curl -fsS http://127.0.0.1:8787/v1/models
  curl -fsS http://127.0.0.1:8787/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{\"model\":\"gemma-4-e4b-it\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply exactly: FROST EDGE READY.\"}],\"temperature\":0,\"max_tokens\":16}'
"

echo "Google Gemma 4 E4B edge service is ready on $PI_HOST:8787."
