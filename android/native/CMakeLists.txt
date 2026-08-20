cmake_minimum_required(VERSION 3.22.1)
project(pocket_mnn_android LANGUAGES C CXX ASM)

if(NOT DEFINED POCKET_MNN_SOURCE OR NOT EXISTS "${POCKET_MNN_SOURCE}/CMakeLists.txt")
    message(FATAL_ERROR "POCKET_MNN_SOURCE must point to an Alibaba MNN source checkout")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Pocket Earth ships one CPU-first arm64 runtime. MNN performs capability
# dispatch at runtime, so the same APK remains safe on devices without SME2.
set(MNN_BUILD_SHARED_LIBS ON CACHE BOOL "" FORCE)
set(MNN_SEP_BUILD OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_LLM ON CACHE BOOL "" FORCE)
set(MNN_BUILD_LLM_OMNI ON CACHE BOOL "" FORCE)
set(MNN_LOW_MEMORY ON CACHE BOOL "" FORCE)
set(MNN_CPU_WEIGHT_DEQUANT_GEMM ON CACHE BOOL "" FORCE)
set(MNN_SUPPORT_TRANSFORMER_FUSE ON CACHE BOOL "" FORCE)
set(MNN_ARM82 ON CACHE BOOL "" FORCE)
set(MNN_SME2 ON CACHE BOOL "" FORCE)
set(MNN_KLEIDIAI ON CACHE BOOL "" FORCE)
set(MNN_KLEIDIAI_DEFAULT_ON OFF CACHE BOOL "" FORCE)
# Keep Alibaba MNN's CPU target gate available at runtime. Pocket Earth uses
# target=2 as the I8MM/NEON control group and target=3 as the SME2 group.
set(MNN_PIPELINE_PROFILE ON CACHE BOOL "" FORCE)
set(MNN_USE_LOGCAT ON CACHE BOOL "" FORCE)
set(MNN_IMGCODECS ON CACHE BOOL "" FORCE)
set(MNN_OPENCL OFF CACHE BOOL "" FORCE)
set(MNN_VULKAN OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_DIFFUSION OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_CONVERTER OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_BENCHMARK OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_TEST OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_DEMO OFF CACHE BOOL "" FORCE)
set(MNN_LLM_BUILD_DEMO OFF CACHE BOOL "" FORCE)
set(BUILD_MLS OFF CACHE BOOL "" FORCE)
set(LLM_SUPPORT_HTTP_RESOURCE OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_FOR_ANDROID_COMMAND ON CACHE BOOL "" FORCE)

add_subdirectory("${POCKET_MNN_SOURCE}" mnn)

# This tiny wrapper lives in the Pocket Earth tree while compiling into MNNCPU,
# so it can safely rebuild MNN's global CPU dispatch table between benchmark
# groups after every LLM Session has been released.
target_sources(MNNCPU PRIVATE "${CMAKE_CURRENT_LIST_DIR}/mnn_cpu_target_control.cpp")
target_include_directories(MNNCPU PRIVATE
    "${POCKET_MNN_SOURCE}/include"
    "${POCKET_MNN_SOURCE}/source"
)

add_library(pocket_mnn_jni SHARED pocket_mnn_jni.cpp)
target_include_directories(pocket_mnn_jni PRIVATE
    "${POCKET_MNN_SOURCE}/include"
    "${POCKET_MNN_SOURCE}/transformers/llm/engine/include"
    "${POCKET_MNN_SOURCE}/tools/cv/include"
    "${POCKET_MNN_SOURCE}/3rd_party/imageHelper"
)
target_compile_options(pocket_mnn_jni PRIVATE -fvisibility=hidden -Wall -Wextra)
target_link_options(pocket_mnn_jni PRIVATE "-Wl,-z,max-page-size=16384")
target_link_libraries(pocket_mnn_jni PRIVATE MNN android log)
