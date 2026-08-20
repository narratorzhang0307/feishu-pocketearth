#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MANIFEST="$PROJECT_ROOT/android/native/model-bundle.manifest.json"
APK="${POCKET_APK:-$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
ADB="${ADB:-/tmp/pocket-android-sdk/platform-tools/adb}"
PACKAGE="${POCKET_ANDROID_PACKAGE:-art.throughtheglass.pocketearth}"
LANGUAGE_SOURCE="${POCKET_LANGUAGE_MODEL:-/Users/zhangcheng/mnn-models/Qwen3-VL-2B-Instruct-MNN}"
VISION_SOURCE="${POCKET_VISION_MODEL:-/Users/zhangcheng/mnn-models/Qwen3-VL-2B-Instruct-MNN-v5-int8-paired}"
VERIFY_ONLY=false

if [[ "${1:-}" == "--verify-only" ]]; then
  VERIFY_ONLY=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--verify-only]" >&2
  exit 2
fi

for required in "$MANIFEST" "$LANGUAGE_SOURCE/config.json" "$VISION_SOURCE/config.json"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing required input: $required" >&2
    exit 1
  fi
done

verify_file() {
  local source="$1" expected_bytes="$2" expected_sha="$3"
  local actual_bytes actual_sha
  actual_bytes="$(stat -f %z "$source")"
  [[ "$actual_bytes" == "$expected_bytes" ]] || { echo "Size mismatch: $source" >&2; exit 1; }
  actual_sha="$(shasum -a 256 "$source" | awk '{print $1}')"
  [[ "$actual_sha" == "$expected_sha" ]] || { echo "SHA256 mismatch: $source" >&2; exit 1; }
}

manifest_rows() {
  python3 - "$MANIFEST" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding='utf-8'))
for bundle_name, bundle in manifest['bundles'].items():
    for item in bundle['files']:
        print('\t'.join((bundle_name, bundle['target'], item['path'], str(item['bytes']), item['sha256'])))
PY
}

echo "[1/4] Verify the pinned dual-base release on this Mac"
while IFS=$'\t' read -r bundle target relative bytes sha; do
  source_dir="$LANGUAGE_SOURCE"
  [[ "$bundle" == "vision" ]] && source_dir="$VISION_SOURCE"
  verify_file "$source_dir/$relative" "$bytes" "$sha"
done < <(manifest_rows)

verify_file "$LANGUAGE_SOURCE/travel-planner-lora.mnn" 72633256 791a4659ecd86dba2336ca4fdc3a4ee93640bed5b7f92370bfdc3c702450dc13
verify_file "$VISION_SOURCE/guji-visual-lora.mnn" 17588592 6d24871634ff4c1a9af67c5b722f4c311c59fbbe9b23b17111e915f75a992112
verify_file "$VISION_SOURCE/rubbing-visual-lora.mnn" 17588592 1427fbb08d32607db54796c935d4afde634281990f5dac1be808652e4518858e
verify_file "$VISION_SOURCE/general-ocr-visual-lora.mnn" 17588592 d09be9ee9a41c7ec87c45e2f721ad7861a493eeb11b04611ec06380d19fc9f5e
verify_file "$VISION_SOURCE/heritage-restorer.mnn" 15581812 c571f66050be527e7e531b9c116a417c4fece0ec4090cdaf5d2497a8c0eb5a87
verify_file "$VISION_SOURCE/exhibit-matting-fp16.mnn" 146105104 95f35d70763cd83f58e79d83ebba2c682853bee764906dce9b366d1d07ea4b10

if [[ "$VERIFY_ONLY" == true ]]; then
  echo "Pinned model graphs, weights and adapters are valid. No device was changed."
  exit 0
fi

for required in "$ADB" "$APK"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing required install input: $required" >&2
    exit 1
  fi
done

device_count="$($ADB devices | awk 'NR>1 && $2 == "device" {count++} END {print count+0}')"
[[ "$device_count" == "1" ]] || { echo "Connect exactly one authorized Android device; found $device_count." >&2; exit 1; }

echo "[2/4] Install the debug APK containing the real MNN runtime"
$ADB install -r "$APK"
$ADB exec-out run-as "$PACKAGE" sh -c "mkdir -p files/pocket-earth/models && rm -f files/pocket-earth/models/qwen3-vl-2b-language/.pocket-base-bundle.json files/pocket-earth/models/qwen3-vl-2b-vision/.pocket-base-bundle.json"

copy_verified_to_device() {
  local source="$1" destination="$2" expected_sha="$3"
  local parent remote_sha
  parent="${destination%/*}"
  echo "  -> $destination"
  $ADB exec-out run-as "$PACKAGE" sh -c "mkdir -p '$parent' && cat > '$destination'" < "$source"
  remote_sha="$($ADB exec-out run-as "$PACKAGE" sh -c "toybox sha256sum '$destination'" | awk '{print $1}' | tr -d '\r')"
  [[ "$remote_sha" == "$expected_sha" ]] || { echo "Device SHA256 mismatch: $destination" >&2; exit 1; }
}

echo "[3/4] Stream both Qwen bases into app-private storage and verify every SHA256"
while IFS=$'\t' read -r bundle target relative bytes sha; do
  source_dir="$LANGUAGE_SOURCE"
  [[ "$bundle" == "vision" ]] && source_dir="$VISION_SOURCE"
  copy_verified_to_device "$source_dir/$relative" "files/pocket-earth/models/$target/$relative" "$sha"
done < <(manifest_rows)

release_marker='{"releaseId":"pocketearth-qwen3-vl-2b-dual-base-20260811","layout":"language+vision-int8","verified":true}'
for target in qwen3-vl-2b-language qwen3-vl-2b-vision; do
  printf '%s' "$release_marker" | $ADB exec-out run-as "$PACKAGE" sh -c "cat > 'files/pocket-earth/models/$target/.pocket-base-bundle.json'"
done

install_optional() {
  local source="$1" destination="$2" id="$3" bytes="$4" sha="$5" shared_weight="${6:-}"
  copy_verified_to_device "$source" "$destination" "$sha"
  if [[ -n "$shared_weight" ]]; then
    $ADB exec-out run-as "$PACKAGE" sh -c "rm -f '$destination.weight' && ln '$shared_weight' '$destination.weight'"
  fi
  local metadata
  metadata="{\"id\":\"$id\",\"source\":\"debug-local-verified\",\"sha256\":\"$sha\",\"bytes\":$bytes,\"installedAt\":0}"
  printf '%s' "$metadata" | $ADB exec-out run-as "$PACKAGE" sh -c "cat > '$destination.asset.json'"
}

echo "[4/4] Install compatible LoRAs and specialists; hard-link their shared base weights"
model_root="files/pocket-earth/models"
install_optional "$LANGUAGE_SOURCE/travel-planner-lora.mnn" "$model_root/adapters/travel-planner/lora.mnn" travel-planner-lora 72633256 791a4659ecd86dba2336ca4fdc3a4ee93640bed5b7f92370bfdc3c702450dc13 "$model_root/qwen3-vl-2b-language/llm.mnn.weight"
install_optional "$VISION_SOURCE/guji-visual-lora.mnn" "$model_root/adapters/guji-vision/visual-lora.mnn" guji-vision-lora 17588592 6d24871634ff4c1a9af67c5b722f4c311c59fbbe9b23b17111e915f75a992112 "$model_root/qwen3-vl-2b-vision/visual.mnn.weight"
install_optional "$VISION_SOURCE/rubbing-visual-lora.mnn" "$model_root/adapters/rubbing-vision/visual-lora.mnn" rubbing-vision-lora 17588592 1427fbb08d32607db54796c935d4afde634281990f5dac1be808652e4518858e "$model_root/qwen3-vl-2b-vision/visual.mnn.weight"
install_optional "$VISION_SOURCE/general-ocr-visual-lora.mnn" "$model_root/adapters/general-ocr/visual-lora.mnn" general-ocr-vision-lora 17588592 d09be9ee9a41c7ec87c45e2f721ad7861a493eeb11b04611ec06380d19fc9f5e "$model_root/qwen3-vl-2b-vision/visual.mnn.weight"
install_optional "$VISION_SOURCE/heritage-restorer.mnn" "$model_root/specialists/heritage-restorer.mnn" heritage-restorer 15581812 c571f66050be527e7e531b9c116a417c4fece0ec4090cdaf5d2497a8c0eb5a87
install_optional "$VISION_SOURCE/exhibit-matting-fp16.mnn" "$model_root/specialists/exhibit-matting.mnn" exhibit-matting 146105104 95f35d70763cd83f58e79d83ebba2c682853bee764906dce9b366d1d07ea4b10

$ADB shell am force-stop "$PACKAGE"
$ADB shell monkey -p "$PACKAGE" 1 >/dev/null
echo "Installed. Open Pocket Earth and run the native probe; only that real decode completes device verification."
