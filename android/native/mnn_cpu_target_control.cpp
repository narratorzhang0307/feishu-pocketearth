#include <MNN/MNNDefine.h>

#include "backend/cpu/compute/CommonOptFunction.h"
#include "backend/cpu/compute/Int8FunctionsOpt.h"
#include "backend/cpu/CPURuntime.hpp"

#include <algorithm>
#include <cstdlib>
#include <string>

// Runtime-only competition evidence hook. MNN's pipeline-profile target gate
// maps 2 -> FP16/SDOT/I8MM (no SME2) and 3 -> all detected CPU features.
// Call only after all MNN Sessions have been destroyed.
extern "C" MNN_PUBLIC int PocketMnnSetCpuTargetForBenchmark(int requested_target) {
    const int target = std::max(2, std::min(requested_target, 3));
    const std::string value = std::to_string(target);
    if (::setenv("MNN_CPU_TARGET", value.c_str(), 1) != 0) return -1;
    // MNN's profile initializer replaces two process-global dispatch tables.
    // The caller has already destroyed every Session, so reclaim the previous
    // tables before the ABBA suite switches target again.
    delete MNN::MNNGetInt8CoreFunctions();
    delete MNN::MNNGetCoreFunctions();
    MNN::MNNCoreFunctionInit();
    const auto* functions = MNN::MNNGetCoreFunctions();
    if (functions == nullptr) return -1;
    return functions->supportSME2 ? 3 : 2;
}

extern "C" MNN_PUBLIC int PocketMnnCpuFeature(int feature) {
    const auto* info = MNNGetCPUInfo();
    if (info == nullptr) return 0;
    if (feature == 0) return info->sme2 ? 1 : 0;
    if (feature == 1) return info->sve2 ? 1 : 0;
    if (feature == 2) return info->i8mm ? 1 : 0;
    return 0;
}
