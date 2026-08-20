#include <jni.h>

#include <MNN/MNNDefine.h>
#include <MNN/Interpreter.hpp>
#include <MNN/Tensor.hpp>
#include <cv/imgcodecs.hpp>
#include <llm/llm.hpp>

#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>

#include <algorithm>
#include <cmath>
#include <chrono>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <iomanip>
#include <memory>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include <cerrno>
#include <cstdlib>
#include <limits.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <unistd.h>

extern "C" int PocketMnnSetCpuTargetForBenchmark(int requested_target);
extern "C" int PocketMnnCpuFeature(int feature);

namespace {

using MNN::Transformer::ChatMessages;
using MNN::Transformer::Llm;
using MNN::Transformer::LlmContext;

std::mutex g_mutex;
std::string g_model_root;
std::unique_ptr<Llm> g_language_base;
std::unique_ptr<Llm> g_vision_base;
std::unique_ptr<Llm> g_adapter;
std::string g_adapter_id;
std::string g_last_metrics = "{}";
bool g_mnn_enabled = true;
bool g_sme2_requested = true;
bool g_sme2_effective = false;
bool g_runtime_configured = false;
int g_cpu_target = 3;
double g_last_model_load_ms = 0.0;
double g_last_session_release_ms = 0.0;
double g_last_dispatch_init_ms = 0.0;
double g_last_config_total_ms = 0.0;
unsigned long long g_config_generation = 0;
bool g_last_config_changed = false;

void unloadModels() {
    g_adapter.reset();
    g_adapter_id.clear();
    g_language_base.reset();
    g_vision_base.reset();
    g_last_metrics = "{}";
    g_last_model_load_ms = 0.0;
}

std::string toString(JNIEnv* env, jstring value) {
    if (value == nullptr) return {};
    const char* chars = env->GetStringUTFChars(value, nullptr);
    if (chars == nullptr) return {};
    std::string output(chars);
    env->ReleaseStringUTFChars(value, chars);
    return output;
}

jstring toJString(JNIEnv* env, const std::string& value) {
    return env->NewStringUTF(value.c_str());
}

void throwJava(JNIEnv* env, const std::string& message) {
    jclass type = env->FindClass("java/lang/IllegalStateException");
    if (type != nullptr) env->ThrowNew(type, message.c_str());
}

bool fileExists(const std::string& path) {
    std::ifstream input(path, std::ios::binary);
    return input.good();
}

void ensureDirectory(const std::string& path) {
    if (::mkdir(path.c_str(), 0700) == 0 || errno == EEXIST) return;
    throw std::runtime_error("cannot_create_directory:" + path);
}

std::string readFile(const std::string& path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) throw std::runtime_error("cannot_read_" + path);
    return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

void writeFile(const std::string& path, const std::string& bytes) {
    std::ofstream output(path, std::ios::binary | std::ios::trunc);
    if (!output) throw std::runtime_error("cannot_write_" + path);
    output.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    output.flush();
    if (!output) throw std::runtime_error("cannot_finish_" + path);
}

std::string jsonEscape(const std::string& value) {
    std::ostringstream out;
    for (unsigned char ch : value) {
        switch (ch) {
            case '\\': out << "\\\\"; break;
            case '"': out << "\\\""; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (ch < 0x20) {
                    out << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                        << static_cast<int>(ch) << std::dec;
                } else {
                    out << static_cast<char>(ch);
                }
        }
    }
    return out.str();
}

std::string languageDirectory() {
    return g_model_root + "/qwen3-vl-2b-language";
}

std::string visionDirectory() {
    return g_model_root + "/qwen3-vl-2b-vision";
}

std::string languageConfig() {
    return languageDirectory() + "/config.json";
}

std::string visionConfig() {
    return visionDirectory() + "/config.json";
}

bool languageAssetsReady() {
    const std::string base = languageDirectory();
    return fileExists(base + "/config.json") && fileExists(base + "/llm_config.json") &&
           fileExists(base + "/tokenizer.txt") && fileExists(base + "/llm.mnn") &&
           fileExists(base + "/llm.mnn.weight") && fileExists(base + "/visual.mnn") &&
           fileExists(base + "/visual.mnn.weight");
}

bool visionAssetsReady() {
    const std::string base = visionDirectory();
    return fileExists(base + "/config.json") && fileExists(base + "/llm_config.json") &&
           fileExists(base + "/tokenizer.mtok") && fileExists(base + "/llm.mnn") &&
           fileExists(base + "/llm.mnn.weight") && fileExists(base + "/visual.mnn") &&
           fileExists(base + "/visual.mnn.weight");
}

std::string adapterModel(const std::string& id) {
    if (id == "travel-planner" || id == "travel-planner-lora") {
        return "../adapters/travel-planner/lora.mnn";
    }
    if (id == "guji-vision" || id == "guji-vision-lora") {
        return "../adapters/guji-vision/visual-lora.mnn";
    }
    if (id == "rubbing-vision" || id == "rubbing-vision-lora") {
        return "../adapters/rubbing-vision/visual-lora.mnn";
    }
    if (id == "general-ocr-vision" || id == "general-ocr-vision-lora") {
        return "../adapters/general-ocr/visual-lora.mnn";
    }
    throw std::runtime_error("adapter_not_allowlisted:" + id);
}

bool isVisualAdapter(const std::string& id) {
    return id == "guji-vision" || id == "guji-vision-lora" ||
           id == "rubbing-vision" || id == "rubbing-vision-lora" ||
           id == "general-ocr-vision" || id == "general-ocr-vision-lora";
}

std::string makeAdapterConfig(const std::string& id) {
    const bool visual = isVisualAdapter(id);
    const std::string base = visual ? visionDirectory() : languageDirectory();
    const std::string config = visual ? visionConfig() : languageConfig();
    const std::string model = adapterModel(id);
    const std::string absolute_model = base + "/" + model;
    if (!fileExists(absolute_model) || !fileExists(absolute_model + ".weight")) {
        throw std::runtime_error("adapter_assets_missing:" + id);
    }
    std::string value = readFile(config);
    const auto end = value.find_last_of('}');
    if (end == std::string::npos) throw std::runtime_error("invalid_base_config");
    const std::string key = visual ? "visual_lora_model" : "llm_lora_model";
    value.insert(end, ",\n  \"" + key + "\": \"" + jsonEscape(model) + "\"\n");
    const std::string path = base + "/.pocket-adapter-" + id + ".json";
    writeFile(path, value);
    return path;
}

std::unique_ptr<Llm> loadModel(const std::string& config) {
    if (!g_mnn_enabled) throw std::runtime_error("mnn_disabled_by_user");
    const auto started = std::chrono::steady_clock::now();
    std::unique_ptr<Llm> model(Llm::createLLM(config));
    if (!model) throw std::runtime_error("mnn_create_llm_failed");
    const std::string tmp = g_model_root + "/tmp";
    ensureDirectory(tmp);
    model->set_config("{\"tmp_path\":\"" + jsonEscape(tmp) +
                      "\",\"async\":false,\"use_mmap\":true,\"use_cached_mmap\":true}");
    if (!model->load()) throw std::runtime_error("mnn_load_failed:" + config);
    g_last_model_load_ms = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - started).count();
    return model;
}

bool ensureLanguageBase() {
    if (g_language_base) return true;
    if (g_model_root.empty() || !languageAssetsReady()) return false;
    g_language_base = loadModel(languageConfig());
    return true;
}

bool ensureVisionBase() {
    if (g_vision_base) return true;
    if (g_model_root.empty() || !visionAssetsReady()) return false;
    g_vision_base = loadModel(visionConfig());
    return true;
}

Llm* selectedLanguageModel(const std::string& adapter) {
    g_last_model_load_ms = 0.0;
    if (isVisualAdapter(adapter)) throw std::runtime_error("visual_adapter_not_valid_for_chat:" + adapter);
    if (!adapter.empty() && adapter != "travel-planner" && adapter != "travel-planner-lora") {
        throw std::runtime_error("language_adapter_not_allowlisted:" + adapter);
    }
    if (adapter.empty()) {
        g_adapter.reset();
        g_adapter_id.clear();
        g_vision_base.reset();
        if (!ensureLanguageBase()) throw std::runtime_error("mnn_language_base_missing");
        return g_language_base.get();
    }
    if (!languageAssetsReady()) throw std::runtime_error("mnn_language_base_missing");
    if (!g_adapter || g_adapter_id != adapter) {
        g_adapter.reset();
        g_language_base.reset();
        g_vision_base.reset();
        g_adapter = loadModel(makeAdapterConfig(adapter));
        g_adapter_id = adapter;
    }
    return g_adapter.get();
}

Llm* selectedVisionModel(const std::string& adapter) {
    g_last_model_load_ms = 0.0;
    if (!adapter.empty() && !isVisualAdapter(adapter)) {
        throw std::runtime_error("vision_adapter_not_allowlisted:" + adapter);
    }
    if (adapter.empty()) {
        g_adapter.reset();
        g_adapter_id.clear();
        g_language_base.reset();
        if (!ensureVisionBase()) throw std::runtime_error("mnn_vision_base_missing");
        return g_vision_base.get();
    }
    if (!visionAssetsReady()) throw std::runtime_error("mnn_vision_base_missing");
    if (!g_adapter || g_adapter_id != adapter) {
        g_adapter.reset();
        g_language_base.reset();
        g_vision_base.reset();
        g_adapter = loadModel(makeAdapterConfig(adapter));
        g_adapter_id = adapter;
    }
    return g_adapter.get();
}

std::string capabilityJson() {
    const bool hardware_sme2 = PocketMnnCpuFeature(0) == 1;
    const bool hardware_sve2 = PocketMnnCpuFeature(1) == 1;
    const bool hardware_i8mm = PocketMnnCpuFeature(2) == 1;
    std::ostringstream out;
    out << "{\"compiled\":[\"ARM82\",\"SME2\",\"KleidiAI\"],\"active\":[\"NEON\"";
    if (hardware_i8mm) out << ",\"I8MM\"";
    if (g_sme2_effective) out << ",\"SME2\"";
    else if (hardware_sve2) out << ",\"SVE2\"";
    out << "],\"hardware\":{\"sme2\":" << (hardware_sme2 ? "true" : "false")
        << ",\"sve2\":" << (hardware_sve2 ? "true" : "false")
        << ",\"i8mm\":" << (hardware_i8mm ? "true" : "false")
        << "},\"mnnEnabled\":" << (g_mnn_enabled ? "true" : "false")
        << ",\"sme2Requested\":" << (g_sme2_requested ? "true" : "false")
        << ",\"sme2Effective\":" << (g_sme2_effective ? "true" : "false")
        << ",\"cpuTarget\":" << g_cpu_target
        << ",\"configurationTrace\":{\"generation\":" << g_config_generation
        << ",\"changed\":" << (g_last_config_changed ? "true" : "false")
        << ",\"sessionReleaseMs\":" << g_last_session_release_ms
        << ",\"dispatchInitMs\":" << g_last_dispatch_init_ms
        << ",\"nativeTotalMs\":" << g_last_config_total_ms << "}}";
    return out.str();
}

double currentRssMb() {
    std::ifstream input("/proc/self/statm");
    long pages = 0;
    long resident = 0;
    if (!(input >> pages >> resident) || resident <= 0) return 0.0;
    return static_cast<double>(resident) * static_cast<double>(::sysconf(_SC_PAGESIZE)) /
           (1024.0 * 1024.0);
}

double peakRssMb() {
    struct rusage usage {};
    if (::getrusage(RUSAGE_SELF, &usage) != 0) return 0.0;
    return static_cast<double>(usage.ru_maxrss) / 1024.0;
}

void updateMetrics(const LlmContext* context, long long elapsed_ms) {
    if (context == nullptr) {
        g_last_metrics = "{}";
        return;
    }
    const double prefill_ms = context->prefill_us / 1000.0;
    const double decode_ms = context->decode_us / 1000.0;
    const double prefill_tps = context->prefill_us > 0
        ? context->prompt_len * 1000000.0 / context->prefill_us : 0.0;
    const double decode_tps = context->decode_us > 0
        ? context->gen_seq_len * 1000000.0 / context->decode_us : 0.0;
    std::ostringstream out;
    out << std::fixed << std::setprecision(2)
        << "{\"model\":\"Qwen3-VL-2B-Instruct\",\"mnnVersion\":\"" MNN_VERSION
        << "\",\"elapsedMs\":" << elapsed_ms
        << ",\"promptTokens\":" << context->prompt_len
        << ",\"generatedTokens\":" << context->gen_seq_len
        << ",\"modelLoadMs\":" << g_last_model_load_ms
        << ",\"ttfaMs\":" << context->ttfa_us / 1000.0
        << ",\"prefillMs\":" << prefill_ms
        << ",\"decodeMs\":" << decode_ms
        << ",\"sampleMs\":" << context->sample_us / 1000.0
        << ",\"prefillTokensPerSecond\":" << prefill_tps
        << ",\"decodeTokensPerSecond\":" << decode_tps
        << ",\"currentRssMb\":" << currentRssMb()
        << ",\"peakRssMb\":" << peakRssMb()
        << ",\"mnnEnabled\":" << (g_mnn_enabled ? "true" : "false")
        << ",\"hardwareSme2\":" << (PocketMnnCpuFeature(0) == 1 ? "true" : "false")
        << ",\"sme2Requested\":" << (g_sme2_requested ? "true" : "false")
        << ",\"sme2Effective\":" << (g_sme2_effective ? "true" : "false")
        << ",\"cpuTarget\":" << g_cpu_target
        << ",\"acceleration\":[\"NEON\"";
    if (PocketMnnCpuFeature(2) == 1) out << ",\"I8MM\"";
    if (g_sme2_effective) out << ",\"SME2\"";
    else if (PocketMnnCpuFeature(1) == 1) out << ",\"SVE2\"";
    out << "]}";
    g_last_metrics = out.str();
}

std::string runChat(Llm* model, const std::string& prompt, const std::string& system,
                    bool json, int max_tokens) {
    model->reset();
    ChatMessages messages;
    if (!system.empty()) messages.emplace_back("system", system);
    std::string user = prompt;
    if (json) user += "\n只输出合法 JSON，不要 Markdown 代码围栏。";
    messages.emplace_back("user", user);
    std::ostringstream output;
    const auto started = std::chrono::steady_clock::now();
    model->response(messages, &output, nullptr, std::clamp(max_tokens, 1, 2048));
    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - started).count();
    updateMetrics(model->getContext(), elapsed);
    return output.str();
}

int base64Value(unsigned char ch) {
    if (ch >= 'A' && ch <= 'Z') return ch - 'A';
    if (ch >= 'a' && ch <= 'z') return ch - 'a' + 26;
    if (ch >= '0' && ch <= '9') return ch - '0' + 52;
    if (ch == '+') return 62;
    if (ch == '/') return 63;
    return -1;
}

std::string decodeBase64(const std::string& value) {
    std::string output;
    int bits = 0;
    int buffer = 0;
    for (unsigned char ch : value) {
        if (ch == '=') break;
        const int next = base64Value(ch);
        if (next < 0) {
            if (std::isspace(ch)) continue;
            throw std::runtime_error("invalid_base64_image");
        }
        buffer = (buffer << 6) | next;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            output.push_back(static_cast<char>((buffer >> bits) & 0xff));
        }
    }
    return output;
}

std::string encodeBase64(const std::vector<uint8_t>& value) {
    static constexpr char alphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string output;
    output.reserve(((value.size() + 2) / 3) * 4);
    for (size_t index = 0; index < value.size(); index += 3) {
        const uint32_t a = value[index];
        const uint32_t b = index + 1 < value.size() ? value[index + 1] : 0;
        const uint32_t c = index + 2 < value.size() ? value[index + 2] : 0;
        const uint32_t packed = (a << 16) | (b << 8) | c;
        output.push_back(alphabet[(packed >> 18) & 0x3f]);
        output.push_back(alphabet[(packed >> 12) & 0x3f]);
        output.push_back(index + 1 < value.size() ? alphabet[(packed >> 6) & 0x3f] : '=');
        output.push_back(index + 2 < value.size() ? alphabet[packed & 0x3f] : '=');
    }
    return output;
}

bool matchesImageSignature(const std::string& mime, const std::string& bytes) {
    const auto at = [&](size_t index) { return static_cast<unsigned char>(bytes[index]); };
    if (mime == "image/png") {
        return bytes.size() >= 8 && at(0) == 0x89 && bytes.compare(1, 3, "PNG") == 0 &&
               at(4) == 0x0d && at(5) == 0x0a && at(6) == 0x1a && at(7) == 0x0a;
    }
    if (mime == "image/jpeg") {
        return bytes.size() >= 3 && at(0) == 0xff && at(1) == 0xd8 && at(2) == 0xff;
    }
    if (mime == "image/webp") {
        return bytes.size() >= 12 && bytes.compare(0, 4, "RIFF") == 0 &&
               bytes.compare(8, 4, "WEBP") == 0;
    }
    return false;
}

std::string materializeImage(const std::string& image) {
    if (image.rfind("file://", 0) == 0 || (!image.empty() && image.front() == '/')) {
        const std::string candidate = image.rfind("file://", 0) == 0 ? image.substr(7) : image;
        char resolved[PATH_MAX];
        if (::realpath(candidate.c_str(), resolved) == nullptr) {
            throw std::runtime_error("native_vision_file_not_found");
        }
        const auto files = g_model_root.find("/files/");
        const std::string private_root = files == std::string::npos
            ? g_model_root : g_model_root.substr(0, files + 7);
        const std::string path(resolved);
        if (path.rfind(private_root, 0) != 0) throw std::runtime_error("native_vision_file_outside_app_storage");
        return path;
    }
    if (image.rfind("data:image/", 0) != 0) {
        throw std::runtime_error("native_vision_requires_data_url_or_private_file");
    }
    const auto semicolon = image.find(';');
    const auto comma = image.find(',');
    if (semicolon == std::string::npos || comma == std::string::npos || semicolon > comma ||
        image.substr(semicolon, comma - semicolon) != ";base64") {
        throw std::runtime_error("native_vision_requires_base64_image");
    }
    if (image.size() - comma - 1 > 24U * 1024U * 1024U) {
        throw std::runtime_error("native_vision_image_too_large");
    }
    std::string mime = image.substr(5, semicolon - 5);
    if (mime == "image/jpg") mime = "image/jpeg";
    const std::string bytes = decodeBase64(image.substr(comma + 1));
    if (bytes.empty() || bytes.size() > 18U * 1024U * 1024U || !matchesImageSignature(mime, bytes)) {
        throw std::runtime_error("native_vision_invalid_image_bytes");
    }
    const std::string extension = mime == "image/png" ? ".png" : mime == "image/webp" ? ".webp" : ".jpg";
    const auto stamp = std::chrono::steady_clock::now().time_since_epoch().count();
    ensureDirectory(g_model_root + "/tmp");
    const std::string path = g_model_root + "/tmp/pocket-vision-" + std::to_string(stamp) + extension;
    writeFile(path, bytes);
    return path;
}

struct DecodedImage {
    int width = 0;
    int height = 0;
    int channels = 0;
    std::vector<uint8_t> pixels;
};

DecodedImage decodeImageFile(const std::string& path, bool grayscale) {
    const std::string bytes = readFile(path);
    const std::vector<uint8_t> buffer(bytes.begin(), bytes.end());
    auto image = MNN::CV::imdecode(buffer, grayscale ? MNN::CV::IMREAD_GRAYSCALE : MNN::CV::IMREAD_COLOR);
    if (image.get() == nullptr || image->getInfo() == nullptr || image->getInfo()->dim.size() < 2) {
        throw std::runtime_error("native_restoration_image_decode_failed");
    }
    const auto* info = image->getInfo();
    DecodedImage decoded;
    decoded.height = info->dim[0];
    decoded.width = info->dim[1];
    decoded.channels = info->dim.size() > 2 ? info->dim[2] : 1;
    if (decoded.width <= 0 || decoded.height <= 0 || decoded.channels <= 0 ||
        decoded.width > 8192 || decoded.height > 8192) {
        throw std::runtime_error("native_restoration_invalid_image_dimensions");
    }
    const size_t count = static_cast<size_t>(decoded.width) * decoded.height * decoded.channels;
    const uint8_t* source = image->readMap<uint8_t>();
    if (source == nullptr) throw std::runtime_error("native_restoration_image_map_failed");
    decoded.pixels.assign(source, source + count);
    return decoded;
}

uint8_t sampleNearest(const DecodedImage& image, float x, float y, int channel) {
    const int px = std::clamp(static_cast<int>(std::round(x)), 0, image.width - 1);
    const int py = std::clamp(static_cast<int>(std::round(y)), 0, image.height - 1);
    const int c = std::clamp(channel, 0, image.channels - 1);
    return image.pixels[(static_cast<size_t>(py) * image.width + px) * image.channels + c];
}

float sampleBilinear(const float* values, int width, int height, int channel, float x, float y) {
    const float clampedX = std::clamp(x, 0.0f, static_cast<float>(width - 1));
    const float clampedY = std::clamp(y, 0.0f, static_cast<float>(height - 1));
    const int x0 = static_cast<int>(std::floor(clampedX));
    const int y0 = static_cast<int>(std::floor(clampedY));
    const int x1 = std::min(width - 1, x0 + 1);
    const int y1 = std::min(height - 1, y0 + 1);
    const float fx = clampedX - x0;
    const float fy = clampedY - y0;
    const size_t plane = static_cast<size_t>(width) * height;
    const auto at = [&](int px, int py) { return values[static_cast<size_t>(channel) * plane + static_cast<size_t>(py) * width + px]; };
    const float top = at(x0, y0) * (1.0f - fx) + at(x1, y0) * fx;
    const float bottom = at(x0, y1) * (1.0f - fx) + at(x1, y1) * fx;
    return top * (1.0f - fy) + bottom * fy;
}

std::string runRestoration(const std::string& imageValue, const std::string& maskValue) {
    if (!g_mnn_enabled) throw std::runtime_error("mnn_disabled_by_user");
    const std::string modelPath = g_model_root + "/specialists/heritage-restorer.mnn";
    if (!fileExists(modelPath)) throw std::runtime_error("heritage_restorer_not_installed");
    const auto started = std::chrono::steady_clock::now();
    const std::string imagePath = materializeImage(imageValue);
    const std::string maskPath = materializeImage(maskValue);
    const bool temporaryImage = imagePath.find(g_model_root + "/tmp/pocket-vision-") == 0;
    const bool temporaryMask = maskPath.find(g_model_root + "/tmp/pocket-vision-") == 0;
    try {
        const DecodedImage source = decodeImageFile(imagePath, false);
        const DecodedImage mask = decodeImageFile(maskPath, true);
        if (source.channels != 3 || mask.channels != 1) throw std::runtime_error("native_restoration_channel_mismatch");

        std::unique_ptr<MNN::Interpreter, void(*)(MNN::Interpreter*)> interpreter(
            MNN::Interpreter::createFromFile(modelPath.c_str()), MNN::Interpreter::destroy);
        if (!interpreter) throw std::runtime_error("native_restoration_model_open_failed");
        MNN::ScheduleConfig config;
        config.type = MNN_FORWARD_CPU;
        config.numThread = 4;
        MNN::Session* session = interpreter->createSession(config);
        if (!session) throw std::runtime_error("native_restoration_session_failed");
        MNN::Tensor* imageInput = interpreter->getSessionInput(session, "image");
        MNN::Tensor* maskInput = interpreter->getSessionInput(session, "mask");
        if (!imageInput || !maskInput) throw std::runtime_error("native_restoration_inputs_missing");
        const auto imageShape = imageInput->shape();
        const auto maskShape = maskInput->shape();
        if (imageShape.size() != 4 || imageShape[0] != 1 || imageShape[1] != 3 ||
            maskShape.size() != 4 || maskShape[0] != 1 || maskShape[1] != 1 ||
            imageShape[2] != maskShape[2] || imageShape[3] != maskShape[3]) {
            throw std::runtime_error("native_restoration_model_contract_mismatch");
        }
        const int modelHeight = imageShape[2];
        const int modelWidth = imageShape[3];
        if (modelWidth <= 0 || modelHeight <= 0 || modelWidth > 2048 || modelHeight > 2048) {
            throw std::runtime_error("native_restoration_model_shape_invalid");
        }
        MNN::Tensor imageHost(imageInput, MNN::Tensor::CAFFE);
        MNN::Tensor maskHost(maskInput, MNN::Tensor::CAFFE);
        float* imageData = imageHost.host<float>();
        float* maskData = maskHost.host<float>();
        if (!imageData || !maskData) throw std::runtime_error("native_restoration_input_allocation_failed");
        const size_t modelPlane = static_cast<size_t>(modelWidth) * modelHeight;
        for (int y = 0; y < modelHeight; ++y) {
            const float sourceY = modelHeight == 1 ? 0.0f : static_cast<float>(y) * (source.height - 1) / (modelHeight - 1);
            const float maskY = modelHeight == 1 ? 0.0f : static_cast<float>(y) * (mask.height - 1) / (modelHeight - 1);
            for (int x = 0; x < modelWidth; ++x) {
                const float sourceX = modelWidth == 1 ? 0.0f : static_cast<float>(x) * (source.width - 1) / (modelWidth - 1);
                const float maskX = modelWidth == 1 ? 0.0f : static_cast<float>(x) * (mask.width - 1) / (modelWidth - 1);
                const size_t offset = static_cast<size_t>(y) * modelWidth + x;
                // imdecode returns BGR; the exported restorer contract consumes RGB in [-1, 1].
                imageData[offset] = sampleNearest(source, sourceX, sourceY, 2) / 127.5f - 1.0f;
                imageData[modelPlane + offset] = sampleNearest(source, sourceX, sourceY, 1) / 127.5f - 1.0f;
                imageData[2 * modelPlane + offset] = sampleNearest(source, sourceX, sourceY, 0) / 127.5f - 1.0f;
                maskData[offset] = sampleNearest(mask, maskX, maskY, 0) >= 128 ? 1.0f : 0.0f;
            }
        }
        imageInput->copyFromHostTensor(&imageHost);
        maskInput->copyFromHostTensor(&maskHost);
        const auto inferenceStarted = std::chrono::steady_clock::now();
        if (interpreter->runSession(session) != MNN::NO_ERROR) throw std::runtime_error("native_restoration_inference_failed");
        const double inferenceMs = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - inferenceStarted).count();
        MNN::Tensor* output = interpreter->getSessionOutput(session, "restored");
        if (!output) output = interpreter->getSessionOutput(session, nullptr);
        if (!output) throw std::runtime_error("native_restoration_output_missing");
        MNN::Tensor outputHost(output, MNN::Tensor::CAFFE);
        output->copyToHostTensor(&outputHost);
        const auto outputShape = outputHost.shape();
        if (outputShape.size() != 4 || outputShape[0] != 1 || outputShape[1] != 3) {
            throw std::runtime_error("native_restoration_output_contract_mismatch");
        }
        const int outputHeight = outputShape[2];
        const int outputWidth = outputShape[3];
        const float* restored = outputHost.host<float>();
        if (!restored) throw std::runtime_error("native_restoration_output_map_failed");

        std::vector<uint8_t> result = source.pixels;
        size_t changedPixels = 0;
        for (int y = 0; y < source.height; ++y) {
            const float maskY = source.height == 1 ? 0.0f : static_cast<float>(y) * (mask.height - 1) / (source.height - 1);
            const float outputY = source.height == 1 ? 0.0f : static_cast<float>(y) * (outputHeight - 1) / (source.height - 1);
            for (int x = 0; x < source.width; ++x) {
                const float maskX = source.width == 1 ? 0.0f : static_cast<float>(x) * (mask.width - 1) / (source.width - 1);
                if (sampleNearest(mask, maskX, maskY, 0) < 128) continue;
                const float outputX = source.width == 1 ? 0.0f : static_cast<float>(x) * (outputWidth - 1) / (source.width - 1);
                const size_t offset = (static_cast<size_t>(y) * source.width + x) * 3;
                // Convert RGB model output back to the BGR buffer expected by imencode.
                result[offset] = static_cast<uint8_t>(std::clamp((sampleBilinear(restored, outputWidth, outputHeight, 2, outputX, outputY) + 1.0f) * 127.5f, 0.0f, 255.0f));
                result[offset + 1] = static_cast<uint8_t>(std::clamp((sampleBilinear(restored, outputWidth, outputHeight, 1, outputX, outputY) + 1.0f) * 127.5f, 0.0f, 255.0f));
                result[offset + 2] = static_cast<uint8_t>(std::clamp((sampleBilinear(restored, outputWidth, outputHeight, 0, outputX, outputY) + 1.0f) * 127.5f, 0.0f, 255.0f));
                ++changedPixels;
            }
        }
        std::vector<uint8_t> rgb(result.size());
        for (size_t offset = 0; offset < result.size(); offset += 3) {
            rgb[offset] = result[offset + 2];
            rgb[offset + 1] = result[offset + 1];
            rgb[offset + 2] = result[offset];
        }
        std::vector<uint8_t> encoded;
        const auto appendPng = [](void* context, void* data, int size) {
            auto* target = static_cast<std::vector<uint8_t>*>(context);
            const auto* begin = static_cast<const uint8_t*>(data);
            target->insert(target->end(), begin, begin + size);
        };
        const int encodedOk = stbi_write_png_to_func(appendPng, &encoded, source.width, source.height, 3, rgb.data(), source.width * 3);
        if (encodedOk == 0 || encoded.empty()) throw std::runtime_error("native_restoration_png_encode_failed");
        const double elapsedMs = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();
        std::ostringstream response;
        response << std::fixed << std::setprecision(2)
                 << "{\"image\":\"data:image/png;base64," << encodeBase64(encoded)
                 << "\",\"stats\":{\"engine\":\"MNN\",\"model\":\"heritage-restorer\",\"elapsedMs\":" << elapsedMs
                 << ",\"inferenceMs\":" << inferenceMs << ",\"width\":" << source.width
                 << ",\"height\":" << source.height << ",\"modelWidth\":" << modelWidth
                 << ",\"modelHeight\":" << modelHeight << ",\"changedPixels\":" << changedPixels
                 << ",\"outsideMaskPreserved\":true,\"cpuTarget\":" << g_cpu_target
                 << ",\"sme2Effective\":" << (g_sme2_effective ? "true" : "false") << "}}";
        if (temporaryImage) std::remove(imagePath.c_str());
        if (temporaryMask) std::remove(maskPath.c_str());
        return response.str();
    } catch (...) {
        if (temporaryImage) std::remove(imagePath.c_str());
        if (temporaryMask) std::remove(maskPath.c_str());
        throw;
    }
}

std::string runVision(Llm* model, const std::string& image, const std::string& prompt,
                      int max_tokens) {
    model->reset();
    const std::string path = materializeImage(image);
    const std::string request = "<img>" + path + "</img>\n" + prompt;
    std::ostringstream output;
    const auto started = std::chrono::steady_clock::now();
    try {
        model->response(request, &output, nullptr, std::clamp(max_tokens, 1, 2048));
    } catch (...) {
        if (path.find(g_model_root + "/tmp/pocket-vision-") == 0) std::remove(path.c_str());
        throw;
    }
    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - started).count();
    updateMetrics(model->getContext(), elapsed);
    if (path.find(g_model_root + "/tmp/pocket-vision-") == 0) std::remove(path.c_str());
    return output.str();
}

template <typename Fn>
jstring guarded(JNIEnv* env, Fn&& fn) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        return toJString(env, fn());
    } catch (const std::exception& error) {
        throwJava(env, error.what());
        return nullptr;
    }
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeConfigure(
    JNIEnv* env, jclass, jboolean mnn_enabled, jboolean sme2_enabled) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        const auto config_started = std::chrono::steady_clock::now();
        const bool next_mnn = mnn_enabled == JNI_TRUE;
        const bool next_sme2 = sme2_enabled == JNI_TRUE;
        const int next_target = next_sme2 ? 3 : 2;
        g_last_config_changed = !g_runtime_configured || next_mnn != g_mnn_enabled || next_target != g_cpu_target;
        g_last_session_release_ms = 0.0;
        g_last_dispatch_init_ms = 0.0;
        if (g_last_config_changed) {
            // MNN's CPU dispatch table is process-global. Destroy every Session
            // before rebuilding it so the OFF and ON groups cannot share a stale
            // Backend or reordered SME2 weight buffer.
            const auto unload_started = std::chrono::steady_clock::now();
            unloadModels();
            g_last_session_release_ms = std::chrono::duration<double, std::milli>(
                std::chrono::steady_clock::now() - unload_started).count();
            const auto dispatch_started = std::chrono::steady_clock::now();
            const int effective_target = PocketMnnSetCpuTargetForBenchmark(next_target);
            g_last_dispatch_init_ms = std::chrono::duration<double, std::milli>(
                std::chrono::steady_clock::now() - dispatch_started).count();
            if (effective_target < 0) throw std::runtime_error("mnn_cpu_target_switch_failed");
            g_mnn_enabled = next_mnn;
            g_sme2_requested = next_sme2;
            g_cpu_target = next_target;
            g_sme2_effective = next_sme2 && effective_target >= 3;
            g_runtime_configured = true;
            ++g_config_generation;
        }
        g_last_config_total_ms = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - config_started).count();
        return toJString(env, capabilityJson());
    } catch (const std::exception& error) {
        throwJava(env, error.what());
        return nullptr;
    }
}

extern "C" JNIEXPORT void JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeInitialize(
    JNIEnv* env, jclass, jstring model_root) {
    try {
        std::lock_guard<std::mutex> lock(g_mutex);
        const std::string next = toString(env, model_root);
        if (next != g_model_root) {
            unloadModels();
            g_model_root = next;
        }
        ensureDirectory(g_model_root + "/tmp");
    } catch (const std::exception& error) {
        throwJava(env, error.what());
    }
}

extern "C" JNIEXPORT void JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeInvalidate(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> lock(g_mutex);
    unloadModels();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeReady(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return languageAssetsReady() && visionAssetsReady() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeTextReady(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return languageAssetsReady() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeVisionReady(JNIEnv*, jclass) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return visionAssetsReady() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeVersion(JNIEnv* env, jclass) {
    return toJString(env, std::string("MNN ") + MNN_VERSION + " / pocket-jni-v3-sme2-ab");
}

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeCapabilities(JNIEnv* env, jclass) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return toJString(env, capabilityJson());
}

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeProbe(
    JNIEnv* env, jclass, jstring prompt) {
    return guarded(env, [&] {
        if (!g_mnn_enabled) throw std::runtime_error("mnn_disabled_by_user");
        return runChat(selectedLanguageModel(""), toString(env, prompt),
                       "严格按用户要求回复，不补充解释。", false, 32);
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeChat(
    JNIEnv* env, jclass, jstring prompt, jstring system, jstring adapter,
    jboolean json, jint max_tokens) {
    return guarded(env, [&] {
        if (!g_mnn_enabled) throw std::runtime_error("mnn_disabled_by_user");
        const std::string adapter_id = toString(env, adapter);
        return runChat(selectedLanguageModel(adapter_id), toString(env, prompt), toString(env, system),
                       json == JNI_TRUE, max_tokens);
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeVision(
    JNIEnv* env, jclass, jstring image, jstring prompt, jstring adapter,
    jstring, jint max_tokens) {
    return guarded(env, [&] {
        if (!g_mnn_enabled) throw std::runtime_error("mnn_disabled_by_user");
        const std::string adapter_id = toString(env, adapter);
        return runVision(selectedVisionModel(adapter_id), toString(env, image),
                         toString(env, prompt), max_tokens);
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeRestore(
    JNIEnv* env, jclass, jstring image, jstring mask) {
    return guarded(env, [&]() { return runRestoration(toString(env, image), toString(env, mask)); });
}

extern "C" JNIEXPORT jstring JNICALL
Java_art_throughtheglass_pocketearth_PocketMnnRuntime_nativeMetrics(JNIEnv* env, jclass) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return toJString(env, g_last_metrics);
}
