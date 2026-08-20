#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MNN_SOURCE="${POCKET_MNN_SOURCE:-/Users/zhangcheng/mnn-src/MNN-3.6.1-pocketearth}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/tmp/pocket-android-sdk}"
ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-$ANDROID_SDK_ROOT/ndk/27.2.12479018}"
CMAKE_BIN="${CMAKE_BIN:-$ANDROID_SDK_ROOT/cmake/3.22.1/bin/cmake}"
NINJA_BIN="${NINJA_BIN:-$ANDROID_SDK_ROOT/cmake/3.22.1/bin/ninja}"
KLEIDIAI_SOURCE="${KLEIDIAI_SOURCE:-$MNN_SOURCE/build/_deps/kleidiai-1.16.0}"
BUILD_ROOT="${POCKET_MNN_BUILD_ROOT:-/tmp/pocket-mnn-android-build}"
OUTPUT_DIR="$PROJECT_ROOT/android/app/src/main/jniLibs/arm64-v8a"

for required in "$MNN_SOURCE/CMakeLists.txt" "$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" "$CMAKE_BIN" "$NINJA_BIN"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing required build input: $required" >&2
    exit 1
  fi
done

mkdir -p "$BUILD_ROOT" "$OUTPUT_DIR"

"$CMAKE_BIN" -S "$PROJECT_ROOT/android/native" -B "$BUILD_ROOT" -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$NINJA_BIN" \
  -DPOCKET_MNN_SOURCE="$MNN_SOURCE" \
  -DKLEIDIAI_SRC_DIR="$KLEIDIAI_SOURCE" \
  -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-26 \
  -DANDROID_STL=c++_shared \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_SHARED_LINKER_FLAGS="-Wl,-z,max-page-size=16384"

"$CMAKE_BIN" --build "$BUILD_ROOT" --target pocket_mnn_jni -j "${POCKET_MNN_JOBS:-4}"

MNN_LIB="$(find "$BUILD_ROOT" -type f -name libMNN.so -print -quit)"
JNI_LIB="$(find "$BUILD_ROOT" -type f -name libpocket_mnn_jni.so -print -quit)"
CXX_LIB="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so"
if [[ ! -f "$CXX_LIB" ]]; then
  CXX_LIB="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/sysroot/usr/lib/aarch64-linux-android/26/libc++_shared.so"
fi

for library in "$MNN_LIB" "$JNI_LIB" "$CXX_LIB"; do
  if [[ ! -f "$library" ]]; then
    echo "Native build did not produce $library" >&2
    exit 1
  fi
done

cp "$MNN_LIB" "$OUTPUT_DIR/libMNN.so"
cp "$JNI_LIB" "$OUTPUT_DIR/libpocket_mnn_jni.so"
cp "$CXX_LIB" "$OUTPUT_DIR/libc++_shared.so"

LLVM_STRIP="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip"
if [[ -x "$LLVM_STRIP" ]]; then
  "$LLVM_STRIP" --strip-debug "$OUTPUT_DIR/libpocket_mnn_jni.so"
fi

echo "Pocket Earth MNN runtime copied to $OUTPUT_DIR"
echo "Build directory retained for inspection: $BUILD_ROOT"
