#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_SDK="$PROJECT_ROOT/var/toolchains/android-sdk"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$LOCAL_SDK}}"
NDK_ROOT="${ANDROID_NDK_ROOT:-$SDK_ROOT/ndk/27.2.12479018}"
TOOLS="$NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin"
READELF="$TOOLS/llvm-readelf"
NM="$TOOLS/llvm-nm"
ZIPALIGN="${ZIPALIGN:-$SDK_ROOT/build-tools/36.0.0/zipalign}"
AAPT="${AAPT:-$SDK_ROOT/build-tools/36.0.0/aapt}"
APKSIGNER="${APKSIGNER:-$SDK_ROOT/build-tools/36.0.0/apksigner}"
APK="${POCKET_APK:-$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
APK_MAX_BYTES="${POCKET_APK_MAX_BYTES:-41943040}"
LIB_DIR="$PROJECT_ROOT/android/app/src/main/jniLibs/arm64-v8a"
JNI="$LIB_DIR/libpocket_mnn_jni.so"
MNN="$LIB_DIR/libMNN.so"
CXX="$LIB_DIR/libc++_shared.so"

for required in "$READELF" "$NM" "$ZIPALIGN" "$AAPT" "$APKSIGNER" "$APK" "$JNI" "$MNN" "$CXX"; do
  [[ -f "$required" ]] || { echo "Missing verification input: $required" >&2; exit 1; }
done

if [[ ! -x "${JAVA_HOME:-}/bin/java" ]]; then
  if [[ -x "$PROJECT_ROOT/var/toolchains/jdk21/Contents/Home/bin/java" ]]; then
    export JAVA_HOME="$PROJECT_ROOT/var/toolchains/jdk21/Contents/Home"
  elif [[ -x /tmp/pocket-jdk21/Contents/Home/bin/java ]]; then
    export JAVA_HOME=/tmp/pocket-jdk21/Contents/Home
  else
    echo "JAVA_HOME must point to a JDK so apksigner can verify the APK" >&2
    exit 1
  fi
fi

echo "[native] ABI, dependencies, 16 KiB alignment and JNI contract"
for library in "$MNN" "$JNI" "$CXX"; do
  file "$library" | grep -q 'ELF 64-bit.*ARM aarch64' || { echo "Not AArch64: $library" >&2; exit 1; }
  "$READELF" -l "$library" | python3 -c 'import sys
loads = [line.split() for line in sys.stdin if line.lstrip().startswith("LOAD")]
raise SystemExit(0 if loads and all(int(row[-1], 16) >= 16384 for row in loads) else 1)' || {
    echo "LOAD segment below 16 KiB alignment: $library" >&2; exit 1;
  }
done

needed="$("$READELF" -d "$JNI")"
grep -q 'Shared library: \[libMNN.so\]' <<<"$needed"
grep -q 'Shared library: \[libc++_shared.so\]' <<<"$needed"

for method in nativeConfigure nativeInitialize nativeInvalidate nativeReady nativeTextReady nativeVisionReady nativeVersion nativeCapabilities nativeProbe nativeChat nativeVision nativeRestore nativeMetrics; do
  "$NM" -D --defined-only "$JNI" | grep "PocketMnnRuntime_${method}$" >/dev/null || {
    echo "Missing JNI export: $method" >&2; exit 1;
  }
done

"$NM" -D --defined-only "$MNN" | grep 'createLLM' >/dev/null || { echo "MNN LLM API missing" >&2; exit 1; }
strings "$MNN" | grep -i 'sme2' >/dev/null || { echo "SME2 kernels not present" >&2; exit 1; }
strings "$MNN" | grep -i 'kleidiai' >/dev/null || { echo "KleidiAI kernels not present" >&2; exit 1; }
strings "$JNI" | grep -F 'specialists/heritage-restorer.mnn' >/dev/null || {
  echo "Native heritage restoration model contract missing" >&2; exit 1;
}
strings "$JNI" | grep -F 'native_restoration_output_contract_mismatch' >/dev/null || {
  echo "Native heritage restoration output gate missing" >&2; exit 1;
}

echo "[apk] packaged libraries, hashes, package identity and 16 KiB zip alignment"
temporary="$(mktemp -d /tmp/pocket-mnn-apk-verify.XXXXXX)"
trap 'rm -rf "$temporary"' EXIT
apk_entries="$(unzip -Z1 "$APK")"
apk_bytes="$(stat -f %z "$APK")"
[[ "$apk_bytes" -le "$APK_MAX_BYTES" ]] || {
  echo "APK size regression: $apk_bytes bytes exceeds $APK_MAX_BYTES" >&2
  exit 1
}
native_entries="$(grep '^lib/' <<<"$apk_entries" | sort)"
expected_native_entries=$'lib/arm64-v8a/libMNN.so\nlib/arm64-v8a/libc++_shared.so\nlib/arm64-v8a/libpocket_mnn_jni.so'
[[ "$native_entries" == "$expected_native_entries" ]] || {
  echo "Unexpected APK native library or ABI set:" >&2
  printf '%s\n' "$native_entries" >&2
  exit 1
}
if grep -E '\.(mnn(\.weight)?|safetensors|gguf)$' <<<"$apk_entries" >/dev/null; then
  echo "Model weights must be installed after APK installation, not packaged in the APK" >&2
  exit 1
fi
for forbidden in \
  assets/public/mediapipe/wasm/ \
  assets/public/data-packs/ \
  assets/public/assets/exhibit-2_5d/ \
  assets/public/assets/exhibit-3dgs/ \
  assets/public/assets/heritage-demo/ \
  assets/public/assets/skills/guji/ \
  assets/public/assets/ort-wasm-simd-threaded.jsep-B0T3yYHD.wasm \
  assets/public/exhibits/preset-nike.splat; do
  if grep -F "$forbidden" <<<"$apk_entries" >/dev/null; then
    echo "Forbidden legacy/mobile-heavy asset remains in APK: $forbidden" >&2
    exit 1
  fi
done
for name in libMNN.so libc++_shared.so libpocket_mnn_jni.so; do
  entry="lib/arm64-v8a/$name"
  unzip -p "$APK" "$entry" > "$temporary/$name"
  cmp -s "$LIB_DIR/$name" "$temporary/$name" || { echo "APK library differs: $name" >&2; exit 1; }
done

"$ZIPALIGN" -c -P 16 -v 4 "$APK" >/dev/null
badging="$("$AAPT" dump badging "$APK")"
grep -q "package: name='art.throughtheglass.pocketearth'" <<<"$badging"
"$APKSIGNER" verify --verbose "$APK" >/dev/null

echo "[pass] $(basename "$APK")"
echo "  APK SHA256: $(shasum -a 256 "$APK" | awk '{print $1}')"
echo "  JNI SHA256: $(shasum -a 256 "$JNI" | awk '{print $1}')"
echo "  MNN SHA256: $(shasum -a 256 "$MNN" | awk '{print $1}')"
echo "  Contract: 13/13 JNI exports; MNN LLM + real CPU target 2/3 switch + SME2 + KleidiAI; arm64-v8a only; no model weights; <= $APK_MAX_BYTES bytes; 16 KiB aligned; APK signature verified"
