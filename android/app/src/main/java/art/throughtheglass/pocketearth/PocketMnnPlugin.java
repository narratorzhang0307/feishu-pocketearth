package art.throughtheglass.pocketearth;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Debug;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.Trace;
import android.system.Os;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "PocketMnn")
public class PocketMnnPlugin extends Plugin {
    private static final String PROCESS_INSTANCE_ID = java.util.UUID.randomUUID().toString();
    private static final String EVIDENCE_TAG = "PocketMnnEvidence";
    private static final Object EVIDENCE_LOCK = new Object();
    private static final JSONArray EVIDENCE_TRACE_EVENTS = new JSONArray();
    private static final StringBuilder EVIDENCE_RING = new StringBuilder();
    private static final int MAX_EVIDENCE_EVENTS = 2400;
    private static final int MAX_EVIDENCE_LOG_CHARS = 512 * 1024;
    private static final class AssetSpec {
        final long bytes;
        final String sha256;
        AssetSpec(long bytes, String sha256) { this.bytes = bytes; this.sha256 = sha256; }
    }

    private static final class BaseFileSpec {
        final String sourcePath;
        final String targetPath;
        final long bytes;
        final String sha256;
        BaseFileSpec(String sourcePath, String targetPath, long bytes, String sha256) {
            this.sourcePath = sourcePath;
            this.targetPath = targetPath;
            this.bytes = bytes;
            this.sha256 = sha256;
        }
    }

    private final ExecutorService inferenceQueue = Executors.newSingleThreadExecutor();
    private volatile boolean cancelAssetInstall = false;
    private volatile boolean baseInstallRunning = false;
    private static final long MAX_OPTIONAL_ASSET_BYTES = 1024L * 1024L * 1024L;
    private static final String VISUAL_BASE_GRAPH_SHA = "087805fafbd06cfc21fd55a7e2f4120d865a8c920395bdda8f2bde34b102fa31";
    private static final String VISUAL_BASE_WEIGHT_SHA = "dba2242b2deb4b9cc1dbd8365b6e50e81104c5f5a7d7c4fef1b572b2a4587b29";
    private static final String LANGUAGE_BASE_GRAPH_SHA = "c2286f60cbd56a82f26bfeac92f6a96e9690889b1939346abfe9e1fae996a8f3";
    private static final String LANGUAGE_BASE_WEIGHT_SHA = "1554f9ce71743b56c2d7fba4cb0c2a31c7cddf4f21e1a2ff5a2e85b9a316a29f";
    private static final String LANGUAGE_VISUAL_GRAPH_SHA = "c489c1f65dc6aa5bcee42b3e291f7987df1111423c1fe570d0f3394e1207d2bb";
    private static final String LANGUAGE_VISUAL_WEIGHT_SHA = "9feb04848cafad1117a510b43d6c2b58d6c31bef1040598156d266f9b42f581f";
    private static final String VISION_LANGUAGE_GRAPH_SHA = "3675635b95562dbf497ad6a0862670f4ac21d6dd9948a89a637627cbc9ec7ea2";
    private static final String VISION_LANGUAGE_WEIGHT_SHA = "4e3b23870347083c9c5d4daba66d5f6b477b45a3431859cbce8dbdd088680326";
    private static final String BASE_RELEASE_ID = "pocketearth-qwen3-vl-2b-dual-base-20260811";
    private static final long BASE_BUNDLE_BYTES = 3748601738L;
    private static final String BASE_MANIFEST_SHA = "1ec84bc53d6a58ce3685419dd0b2ad2bdb289cb18d876deec21634ff68c90313";
    private static final String BASE_MANIFEST_URL = "https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/models/qwen3-vl-2b-dual/pocketearth-qwen3-vl-2b-dual-base-20260811/manifest.json";
    private static final BaseFileSpec[] BASE_FILES = new BaseFileSpec[] {
        new BaseFileSpec("language/config.json", "qwen3-vl-2b-language/config.json", 560L, "5a8565cfe516ecb58a200ec13e49a914fe7f1cbe54ae4cf87bedb30a79b8614c"),
        new BaseFileSpec("language/llm_config.json", "qwen3-vl-2b-language/llm_config.json", 6445L, "5408721c81cc9a7ea8aa485a0652e5e1a47dd5ea5bbd5af2e1f16bc4f6358699"),
        new BaseFileSpec("language/tokenizer.txt", "qwen3-vl-2b-language/tokenizer.txt", 3193555L, "7119de4966cc6a8ae87d7f083e65b315282d06c3122fdd41ce783fdd2d3c1ca2"),
        new BaseFileSpec("language/llm.mnn", "qwen3-vl-2b-language/llm.mnn", 462464L, "c2286f60cbd56a82f26bfeac92f6a96e9690889b1939346abfe9e1fae996a8f3"),
        new BaseFileSpec("language/llm.mnn.weight", "qwen3-vl-2b-language/llm.mnn.weight", 1231860194L, "1554f9ce71743b56c2d7fba4cb0c2a31c7cddf4f21e1a2ff5a2e85b9a316a29f"),
        new BaseFileSpec("language/visual.mnn", "qwen3-vl-2b-language/visual.mnn", 502512L, "c489c1f65dc6aa5bcee42b3e291f7987df1111423c1fe570d0f3394e1207d2bb"),
        new BaseFileSpec("language/visual.mnn.weight", "qwen3-vl-2b-language/visual.mnn.weight", 238226780L, "9feb04848cafad1117a510b43d6c2b58d6c31bef1040598156d266f9b42f581f"),
        new BaseFileSpec("vision/config.json", "qwen3-vl-2b-vision/config.json", 634L, "b81ac7008ba5f894301b7b9265bba882889df52c6e25c86390514c1bd4afe0c4"),
        new BaseFileSpec("vision/llm_config.json", "qwen3-vl-2b-vision/llm_config.json", 6334L, "89e9a46be9f380c21a3b90ac73baae54c541d89c9339b06f7c0cce6601b5543d"),
        new BaseFileSpec("vision/tokenizer.mtok", "qwen3-vl-2b-vision/tokenizer.mtok", 4112548L, "8062c8ef0bf10c8f0434e93c71686c13c0ea8ca0640c78aeedf94266d9db7c0c"),
        new BaseFileSpec("vision/llm.mnn", "qwen3-vl-2b-vision/llm.mnn", 309080L, "3675635b95562dbf497ad6a0862670f4ac21d6dd9948a89a637627cbc9ec7ea2"),
        new BaseFileSpec("vision/llm.mnn.weight", "qwen3-vl-2b-vision/llm.mnn.weight", 1828964770L, "4e3b23870347083c9c5d4daba66d5f6b477b45a3431859cbce8dbdd088680326"),
        new BaseFileSpec("vision/visual.mnn", "qwen3-vl-2b-vision/visual.mnn", 501536L, "087805fafbd06cfc21fd55a7e2f4120d865a8c920395bdda8f2bde34b102fa31"),
        new BaseFileSpec("vision/visual.mnn.weight", "qwen3-vl-2b-vision/visual.mnn.weight", 440454326L, "dba2242b2deb4b9cc1dbd8365b6e50e81104c5f5a7d7c4fef1b572b2a4587b29"),
    };

    @Override
    protected void handleOnDestroy() {
        inferenceQueue.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void run(PluginCall call) {
        JSObject request = call.getObject("request", new JSObject());
        if ("asset_cancel".equals(request.optString("task", ""))) {
            cancelAssetInstall = true;
            PocketMnnRuntime.initialize(getContext());
            JSObject result = runtimeStatus();
            result.put("assets", assetStatus());
            result.put("status", "cancelling");
            call.resolve(result);
            return;
        }
        inferenceQueue.execute(() -> {
            String taskName = request.optString("task", "unknown");
            long traceStartedNs = SystemClock.elapsedRealtimeNanos();
            Trace.beginSection("PocketMnn:" + taskName);
            try {
                JSObject result = dispatch(request);
                recordEvidenceEvent(taskName, traceStartedNs, result);
                call.resolve(result);
            } catch (Throwable error) {
                JSObject result = stub("native_mnn_error");
                result.put("error", error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
                recordEvidenceEvent(taskName, traceStartedNs, result);
                call.resolve(result);
            } finally {
                Trace.endSection();
            }
        });
    }

    private JSObject dispatch(JSObject request) throws Exception {
        String task = request.optString("task", "");
        PocketMnnRuntime.initialize(getContext());
        if ("runtime_configure".equals(task)) {
            boolean mnnEnabled = request.optBoolean("mnnEnabled", PocketMnnRuntime.mnnEnabled());
            boolean sme2Enabled = request.optBoolean("sme2Enabled", PocketMnnRuntime.sme2Enabled());
            JSObject configuration = parseObject(PocketMnnRuntime.configure(getContext(), mnnEnabled, sme2Enabled));
            JSObject result = runtimeStatus();
            result.put("configuration", configuration);
            result.put("status", "runtime_reconfigured");
            return result;
        }
        if ("runtime_status".equals(task) || "ping".equals(task)) return runtimeStatus();
        if ("runtime_evidence_artifacts".equals(task)) return evidenceArtifacts();
        if ("runtime_apk_evidence".equals(task)) return apkEvidence();
        if ("asset_status".equals(task) || "asset_install".equals(task) || "asset_uninstall".equals(task)) {
            if ("asset_uninstall".equals(task)) {
                String assetId = request.optString("asset", "");
                if ("qwen3-vl-2b-mnn".equals(assetId)) return stub("shared_qwen_base_cannot_be_uninstalled_by_skill");
                File target = optionalAssetFile(assetId);
                if (target == null) return stub("unknown_or_protected_asset");
                try { deleteOptionalAsset(target); }
                finally { PocketMnnRuntime.invalidateModels(); }
            }
            if ("asset_install".equals(task)) {
                String assetId = request.optString("asset", "");
                if ("qwen3-vl-2b-mnn".equals(assetId)) {
                    cancelAssetInstall = false;
                    baseInstallRunning = true;
                    try {
                        installBaseBundle(
                            request.optString("url", ""),
                            request.optString("sha256", ""),
                            request.optLong("bytes", 0L)
                        );
                    } finally {
                        baseInstallRunning = false;
                        PocketMnnRuntime.invalidateModels();
                    }
                    PocketMnnRuntime.initialize(getContext());
                    JSObject result = runtimeStatus();
                    result.put("assets", assetStatus());
                    return result;
                }
                File target = optionalAssetFile(assetId);
                if (target == null) return stub("unknown_or_protected_asset");
                cancelAssetInstall = false;
                try {
                    installOptionalAsset(
                        assetId, target, request.optString("url", ""),
                        request.optString("sha256", ""), request.optLong("bytes", 0L)
                    );
                } finally {
                    PocketMnnRuntime.invalidateModels();
                }
                PocketMnnRuntime.initialize(getContext());
            }
            JSObject result = runtimeStatus();
            result.put("assets", assetStatus());
            return result;
        }
        if (!PocketMnnRuntime.mnnEnabled()) return stub("mnn_disabled_by_user");
        if (!PocketMnnRuntime.libraryLoaded()) return stub("mnn_native_library_missing");
        if ("vision".equals(task) && !visionBundleInstalled()) return stub("mnn_vision_model_not_ready");
        if (!"vision".equals(task) && !"heritage_restore".equals(task) && !languageBundleInstalled()) {
            return stub("mnn_language_model_not_ready");
        }
        String requestedAdapter = request.optString("adapter", "");
        String requiredAsset = adapterAssetId(task, requestedAdapter);
        if (requiredAsset != null && !verifiedOptionalAsset(requiredAsset, optionalAssetFile(requiredAsset))) {
            return stub("mnn_adapter_not_ready:" + requiredAsset);
        }
        if ("heritage_restore".equals(task) &&
            !verifiedOptionalAsset("heritage-restorer", optionalAssetFile("heritage-restorer"))) {
            return stub("mnn_restorer_not_ready:heritage-restorer");
        }

        long started = System.nanoTime();
        String output;
        if ("runtime_probe".equals(task)) {
            output = PocketMnnRuntime.nativeProbe("只回复 POCKET_MNN_READY");
        } else if ("vision".equals(task)) {
            output = PocketMnnRuntime.nativeVision(
                request.optString("image", ""), request.optString("prompt", ""),
                request.optString("adapter", ""), request.optString("detail", "fast"),
                request.optInt("maxTokens", 512)
            );
        } else if ("heritage_restore".equals(task)) {
            JSObject restored = parseObject(PocketMnnRuntime.nativeRestore(
                request.optString("image", ""), request.optString("mask", "")
            ));
            if (!restored.has("image")) return stub("native_restoration_returned_no_image");
            long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
            restored.put("backend", "mnn");
            JSObject stats = restored.getJSObject("stats");
            if (stats == null) stats = new JSObject();
            stats.put("elapsedMs", elapsedMs);
            stats.put("runtime", "MNN Android JNI");
            restored.put("stats", stats);
            return restored;
        } else if ("chat".equals(task)) {
            output = PocketMnnRuntime.nativeChat(
                request.optString("prompt", ""), request.optString("system", ""),
                request.optString("adapter", ""), request.optBoolean("json", false),
                request.optInt("maxTokens", 512)
            );
        } else if ("classify".equals(task)) {
            JSONArray labels = request.optJSONArray("labels");
            String prompt = "从候选中只返回一个标签。文本：" + request.optString("text", "") + "\n候选：" + String.valueOf(labels);
            output = PocketMnnRuntime.nativeChat(prompt, "只输出候选标签，不解释。", "", false, 32);
        } else if ("rank".equals(task)) {
            String prompt = "按相关度给候选打0到1分，只输出JSON数组。查询：" + request.optString("query", "") + "\n候选：" + String.valueOf(request.optJSONArray("candidates"));
            output = PocketMnnRuntime.nativeChat(prompt, "输出长度与候选一致的数字JSON数组。", "", true, 256);
        } else {
            return stub("unsupported_native_task");
        }

        long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
        JSObject result = new JSObject();
        result.put("backend", "mnn");
        result.put("model", "Qwen/MNN native");
        result.put("text", output == null ? "" : output);
        JSObject stats = parseObject(PocketMnnRuntime.nativeMetrics());
        stats.put("elapsedMs", elapsedMs);
        stats.put("runtime", "MNN Android JNI");
        addDeviceMetrics(stats);
        result.put("stats", stats);
        if ("runtime_probe".equals(task)) {
            JSObject runtime = runtimeObject();
            JSObject probe = new JSObject();
            probe.put("ok", output != null && output.contains("POCKET_MNN_READY"));
            probe.put("elapsedMs", elapsedMs);
            probe.put("output", output == null ? "" : output);
            runtime.put("probe", probe);
            result.put("runtime", runtime);
        }
        if ("rank".equals(task)) result.put("scores", parseArray(output));
        return result;
    }

    private JSObject runtimeStatus() {
        boolean usable = PocketMnnRuntime.mnnEnabled() && (languageBundleInstalled() || visionBundleInstalled());
        JSObject result = new JSObject();
        result.put("backend", usable ? "mnn" : "stub");
        result.put("runtime", runtimeObject());
        if (!usable) result.put("error", !PocketMnnRuntime.libraryLoaded() ? "mnn_native_library_missing"
            : !PocketMnnRuntime.mnnEnabled() ? "mnn_disabled_by_user" : "mnn_models_not_ready");
        return result;
    }

    private JSObject apkEvidence() throws Exception {
        File apk = new File(getContext().getApplicationInfo().sourceDir);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[1024 * 1024];
        try (FileInputStream input = new FileInputStream(apk)) {
            int count;
            while ((count = input.read(buffer)) >= 0) if (count > 0) digest.update(buffer, 0, count);
        }
        PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
        JSObject proof = new JSObject();
        proof.put("sha256", hex(digest.digest())); proof.put("bytes", apk.length());
        proof.put("packageName", getContext().getPackageName()); proof.put("versionName", packageInfo.versionName);
        proof.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? packageInfo.getLongVersionCode() : packageInfo.versionCode);
        proof.put("lastUpdateTime", packageInfo.lastUpdateTime); proof.put("source", "android-package-sourceDir");
        JSObject result = new JSObject(); result.put("backend", "mnn"); result.put("apkEvidence", proof); return result;
    }

    private JSObject runtimeObject() {
        boolean textReady = languageBundleInstalled();
        boolean visionReady = visionBundleInstalled();
        JSObject runtime = new JSObject();
        runtime.put("engine", PocketMnnRuntime.mnnEnabled() && (textReady || visionReady) ? "mnn" : "stub");
        runtime.put("textReady", textReady);
        runtime.put("visionReady", visionReady);
        runtime.put("nativeBridge", PocketMnnRuntime.libraryLoaded());
        runtime.put("version", PocketMnnRuntime.libraryLoaded() ? safeVersion() : "");
        runtime.put("modelRoot", PocketMnnRuntime.modelRoot());
        runtime.put("processInstanceId", PROCESS_INSTANCE_ID);
        JSObject capabilities = safeCapabilities();
        runtime.put("acceleration", capabilities.optJSONArray("active") == null ? new JSArray() : capabilities.optJSONArray("active"));
        runtime.put("compiledAcceleration", capabilities.optJSONArray("compiled") == null ? new JSArray() : capabilities.optJSONArray("compiled"));
        runtime.put("mnnEnabled", capabilities.optBoolean("mnnEnabled", PocketMnnRuntime.mnnEnabled()));
        runtime.put("sme2Requested", capabilities.optBoolean("sme2Requested", PocketMnnRuntime.sme2Enabled()));
        runtime.put("sme2Effective", capabilities.optBoolean("sme2Effective", false));
        runtime.put("cpuTarget", capabilities.optInt("cpuTarget", PocketMnnRuntime.sme2Enabled() ? 3 : 2));
        runtime.put("hardware", capabilities.optJSONObject("hardware"));
        runtime.put("configurationTrace", capabilities.optJSONObject("configurationTrace"));
        runtime.put("device", deviceInfo());
        String root = PocketMnnRuntime.modelRoot();
        JSObject adapters = new JSObject();
        adapters.put("travel-planner", installState("travel-planner-lora", new File(root, "adapters/travel-planner/lora.mnn")));
        adapters.put("guji-vision", installState("guji-vision-lora", new File(root, "adapters/guji-vision/visual-lora.mnn")));
        adapters.put("rubbing-vision", installState("rubbing-vision-lora", new File(root, "adapters/rubbing-vision/visual-lora.mnn")));
        adapters.put("general-ocr-vision", installState("general-ocr-vision-lora", new File(root, "adapters/general-ocr/visual-lora.mnn")));
        runtime.put("adapters", adapters);
        runtime.put("restorer", installState("heritage-restorer", new File(root, "specialists/heritage-restorer.mnn")));
        runtime.put("exhibitMatting", installState("exhibit-matting", new File(root, "specialists/exhibit-matting.mnn")));
        return runtime;
    }

    private JSObject deviceInfo() {
        JSObject device = new JSObject();
        device.put("manufacturer", Build.MANUFACTURER);
        device.put("model", Build.MODEL);
        device.put("device", Build.DEVICE);
        device.put("android", Build.VERSION.RELEASE);
        device.put("sdk", Build.VERSION.SDK_INT);
        device.put("abi", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "unknown");
        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            device.put("appVersionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
            device.put("appVersionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? packageInfo.getLongVersionCode() : packageInfo.versionCode);
        } catch (Exception error) {
            device.put("appVersionName", "unknown");
            device.put("appVersionCode", 0);
        }
        return device;
    }

    private void recordEvidenceEvent(String task, long startedNs, JSObject result) {
        long completedNs = SystemClock.elapsedRealtimeNanos();
        long durationUs = Math.max(0L, (completedNs - startedNs) / 1000L);
        JSObject runtime = result.getJSObject("runtime");
        JSObject stats = result.getJSObject("stats");
        JSObject args = new JSObject();
        args.put("task", task);
        args.put("backend", result.optString("backend", "stub"));
        args.put("error", result.optString("error", ""));
        if (runtime != null) {
            args.put("mnnEnabled", runtime.optBoolean("mnnEnabled", false));
            args.put("sme2Requested", runtime.optBoolean("sme2Requested", false));
            args.put("sme2Effective", runtime.optBoolean("sme2Effective", false));
            args.put("cpuTarget", runtime.optInt("cpuTarget", 0));
            JSObject configuration = runtime.getJSObject("configurationTrace");
            if (configuration != null) args.put("configurationTrace", configuration);
        }
        if (stats != null) {
            for (String key : new String[] { "elapsedMs", "modelLoadMs", "ttfaMs", "prefillMs", "decodeMs",
                    "decodeTokensPerSecond", "appPssMb", "peakRssMb", "thermalStatus", "batteryTemperatureC" }) {
                if (stats.has(key)) args.put(key, stats.opt(key));
            }
        }
        JSObject event = new JSObject();
        event.put("name", "PocketMnn:" + task);
        event.put("cat", "pocket-earth,mnn,sme2");
        event.put("ph", "X");
        event.put("ts", startedNs / 1000L);
        event.put("dur", durationUs);
        event.put("pid", android.os.Process.myPid());
        event.put("tid", android.os.Process.myTid());
        event.put("args", args);
        String line = event.toString();
        Log.i(EVIDENCE_TAG, line);
        synchronized (EVIDENCE_LOCK) {
            EVIDENCE_TRACE_EVENTS.put(event);
            while (EVIDENCE_TRACE_EVENTS.length() > MAX_EVIDENCE_EVENTS) EVIDENCE_TRACE_EVENTS.remove(0);
            EVIDENCE_RING.append(System.currentTimeMillis()).append(' ').append(line).append('\n');
            if (EVIDENCE_RING.length() > MAX_EVIDENCE_LOG_CHARS) {
                EVIDENCE_RING.delete(0, EVIDENCE_RING.length() - MAX_EVIDENCE_LOG_CHARS);
            }
        }
    }

    private JSObject evidenceArtifacts() {
        JSObject result = new JSObject();
        result.put("backend", PocketMnnRuntime.libraryLoaded() ? "mnn" : "stub");
        JSObject artifacts = new JSObject();
        artifacts.put("capturedAt", java.time.Instant.now().toString());
        artifacts.put("logcat", collectOwnLogcat());
        JSObject perfetto = new JSObject();
        perfetto.put("compatible", true);
        perfetto.put("systemTraceCaptured", false);
        perfetto.put("reason", "App instrumentation is Perfetto/Chrome-trace compatible; system-wide Perfetto requires an external device capture.");
        JSObject trace = new JSObject();
        synchronized (EVIDENCE_LOCK) {
            JSArray traceEvents = new JSArray();
            for (int index = 0; index < EVIDENCE_TRACE_EVENTS.length(); index++) {
                traceEvents.put(EVIDENCE_TRACE_EVENTS.opt(index));
            }
            trace.put("traceEvents", traceEvents);
        }
        trace.put("displayTimeUnit", "ms");
        JSObject metadata = new JSObject();
        metadata.put("schema", "pocket-perfetto-app-trace/v1");
        metadata.put("clock", "android.elapsedRealtimeNanos");
        metadata.put("androidTraceSectionsEnabled", true);
        metadata.put("systemTraceCaptured", false);
        trace.put("metadata", metadata);
        perfetto.put("trace", trace);
        artifacts.put("perfetto", perfetto);
        result.put("evidenceArtifacts", artifacts);
        result.put("runtime", runtimeObject());
        return result;
    }

    private JSObject collectOwnLogcat() {
        JSObject value = new JSObject();
        String output = "";
        String failure = "";
        try {
            Process process = new ProcessBuilder(
                "/system/bin/logcat", "-d", "-v", "threadtime", "--pid=" + android.os.Process.myPid(),
                EVIDENCE_TAG + ":I", "*:S"
            ).redirectErrorStream(true).start();
            try (InputStream input = process.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) >= 0 && bytes.size() < MAX_EVIDENCE_LOG_CHARS) {
                    bytes.write(buffer, 0, Math.min(count, MAX_EVIDENCE_LOG_CHARS - bytes.size()));
                }
                output = bytes.toString("UTF-8");
            }
            process.waitFor();
        } catch (Throwable error) {
            failure = error.getClass().getSimpleName() + ":" + String.valueOf(error.getMessage());
        }
        if (!output.trim().isEmpty()) {
            value.put("available", true);
            value.put("source", "android_logcat_own_process");
            value.put("text", output);
        } else {
            synchronized (EVIDENCE_LOCK) { output = EVIDENCE_RING.toString(); }
            value.put("available", false);
            value.put("source", "in_app_ring_fallback");
            value.put("reason", failure.isEmpty() ? "Android logcat access returned no own-process rows" : failure);
            value.put("text", output);
        }
        return value;
    }

    private void addDeviceMetrics(JSObject stats) {
        Debug.MemoryInfo appMemory = new Debug.MemoryInfo();
        Debug.getMemoryInfo(appMemory);
        stats.put("appPssMb", appMemory.getTotalPss() / 1024.0);
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (power != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            stats.put("thermalStatus", power.getCurrentThermalStatus());
        }
        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int temperature = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            if (temperature != Integer.MIN_VALUE) stats.put("batteryTemperatureC", temperature / 10.0);
            if (level >= 0 && scale > 0) stats.put("batteryPercent", level * 100.0 / scale);
        }
        ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (manager != null) {
            ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
            manager.getMemoryInfo(memory);
            stats.put("deviceAvailableMemoryMb", memory.availMem / 1024.0 / 1024.0);
            stats.put("deviceLowMemory", memory.lowMemory);
        }
    }

    private JSObject installState(String id, File file) {
        JSObject state = new JSObject();
        state.put("installed", verifiedOptionalAsset(id, file));
        return state;
    }

    private String safeVersion() {
        try { return PocketMnnRuntime.nativeVersion(); } catch (Throwable ignored) { return ""; }
    }

    private JSObject safeCapabilities() {
        try { return parseObject(PocketMnnRuntime.nativeCapabilities()); }
        catch (Throwable ignored) { return new JSObject(); }
    }

    private JSArray assetStatus() {
        JSArray assets = new JSArray();
        String root = PocketMnnRuntime.modelRoot();
        assets.put(baseAsset(root));
        assets.put(asset("travel-planner-lora", "adapter", "Travel Planner LoRA", new File(root, "adapters/travel-planner/lora.mnn")));
        assets.put(asset("guji-vision-lora", "adapter", "古籍视觉 LoRA", new File(root, "adapters/guji-vision/visual-lora.mnn")));
        assets.put(asset("rubbing-vision-lora", "adapter", "碑拓视觉 LoRA", new File(root, "adapters/rubbing-vision/visual-lora.mnn")));
        assets.put(asset("general-ocr-vision-lora", "adapter", "通用 OCR 视觉 LoRA", new File(root, "adapters/general-ocr/visual-lora.mnn")));
        assets.put(asset("heritage-restorer", "restorer", "文化遗产修复器", new File(root, "specialists/heritage-restorer.mnn")));
        assets.put(asset("exhibit-matting", "specialist", "展品抠图模型", new File(root, "specialists/exhibit-matting.mnn")));
        return assets;
    }

    private JSObject baseAsset(String root) {
        File language = new File(root, "qwen3-vl-2b-language");
        File vision = new File(root, "qwen3-vl-2b-vision");
        boolean installed = baseBundleInstalled(language, vision);
        long bytes = directoryBytes(language) + directoryBytes(vision);
        JSObject value = new JSObject();
        value.put("id", "qwen3-vl-2b-mnn"); value.put("kind", "base");
        value.put("name", "Qwen3-VL-2B 双基座 MNN");
        value.put("state", installed ? "installed" : baseInstallRunning ? "downloading" : "missing"); value.put("installed", installed);
        value.put("downloaded", installed ? BASE_BUNDLE_BYTES : Math.min(bytes, BASE_BUNDLE_BYTES)); value.put("total", BASE_BUNDLE_BYTES);
        value.put("runtime", "MNN Android JNI"); value.put("target", "android-arm64");
        value.put("layout", "language+vision-int8");
        value.put("releaseId", BASE_RELEASE_ID);
        value.put("manifestSha256", BASE_MANIFEST_SHA);
        value.put("filesVerified", installed && baseManifestMarkersValid(language, vision));
        value.put("verification", "per-file-sha256-on-install+dual-manifest-marker+exact-size-on-load");
        return value;
    }

    private boolean baseManifestMarkersValid(File language, File vision) {
        return baseManifestMarkerValid(language) && baseManifestMarkerValid(vision);
    }

    private boolean baseManifestMarkerValid(File base) {
        try {
            JSONObject marker = new JSONObject(readUtf8(new File(base, ".pocket-base-bundle.json")));
            return BASE_RELEASE_ID.equals(marker.optString("releaseId", ""))
                && BASE_MANIFEST_SHA.equals(marker.optString("manifestSha256", ""))
                && marker.optBoolean("verified", false);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean baseBundleInstalled(File language, File vision) {
        try {
            return languageBundleInstalled(language) && visionBundleInstalled(vision);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean languageBundleInstalled() {
        return languageBundleInstalled(new File(PocketMnnRuntime.modelRoot(), "qwen3-vl-2b-language"));
    }

    private boolean visionBundleInstalled() {
        return visionBundleInstalled(new File(PocketMnnRuntime.modelRoot(), "qwen3-vl-2b-vision"));
    }

    private boolean languageBundleInstalled(File base) {
        return baseMarkerValid(base) && exactSize(new File(base, "config.json"), 560L)
            && exactSize(new File(base, "llm_config.json"), 6445L)
            && exactSize(new File(base, "tokenizer.txt"), 3193555L)
            && exactSize(new File(base, "llm.mnn"), 462464L)
            && exactSize(new File(base, "llm.mnn.weight"), 1231860194L)
            && exactSize(new File(base, "visual.mnn"), 502512L)
            && exactSize(new File(base, "visual.mnn.weight"), 238226780L);
    }

    private boolean visionBundleInstalled(File base) {
        return baseMarkerValid(base) && exactSize(new File(base, "config.json"), 634L)
            && exactSize(new File(base, "llm_config.json"), 6334L)
            && exactSize(new File(base, "tokenizer.mtok"), 4112548L)
            && exactSize(new File(base, "llm.mnn"), 309080L)
            && exactSize(new File(base, "llm.mnn.weight"), 1828964770L)
            && exactSize(new File(base, "visual.mnn"), 501536L)
            && exactSize(new File(base, "visual.mnn.weight"), 440454326L);
    }

    private boolean baseMarkerValid(File base) {
        try {
            JSONObject marker = new JSONObject(readUtf8(new File(base, ".pocket-base-bundle.json")));
            return BASE_RELEASE_ID.equals(marker.optString("releaseId", ""));
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean exactSize(File file, long bytes) {
        return file.isFile() && file.length() == bytes;
    }

    private long directoryBytes(File directory) {
        File[] files = directory.listFiles();
        if (files == null) return 0L;
        long total = 0L;
        for (File file : files) if (file.isFile()) total += file.length();
        return total;
    }

    private File optionalAssetFile(String id) {
        String root = PocketMnnRuntime.modelRoot();
        if ("travel-planner-lora".equals(id)) return new File(root, "adapters/travel-planner/lora.mnn");
        if ("guji-vision-lora".equals(id)) return new File(root, "adapters/guji-vision/visual-lora.mnn");
        if ("rubbing-vision-lora".equals(id)) return new File(root, "adapters/rubbing-vision/visual-lora.mnn");
        if ("general-ocr-vision-lora".equals(id)) return new File(root, "adapters/general-ocr/visual-lora.mnn");
        if ("heritage-restorer".equals(id)) return new File(root, "specialists/heritage-restorer.mnn");
        if ("exhibit-matting".equals(id)) return new File(root, "specialists/exhibit-matting.mnn");
        return null;
    }

    private String adapterAssetId(String task, String adapter) {
        if (adapter == null || adapter.isEmpty()) return null;
        if ("chat".equals(task) && ("travel-planner".equals(adapter) || "travel-planner-lora".equals(adapter))) {
            return "travel-planner-lora";
        }
        if ("vision".equals(task)) {
            if ("guji-vision".equals(adapter) || "guji-vision-lora".equals(adapter)) return "guji-vision-lora";
            if ("rubbing-vision".equals(adapter) || "rubbing-vision-lora".equals(adapter)) return "rubbing-vision-lora";
            if ("general-ocr-vision".equals(adapter) || "general-ocr-vision-lora".equals(adapter)) return "general-ocr-vision-lora";
        }
        return null;
    }

    private void deleteOptionalAsset(File target) {
        File[] files = new File[] { target, new File(target.getPath() + ".part"), new File(target.getPath() + ".weight"), new File(target.getPath() + ".asset.json") };
        for (File file : files) {
            if (file.isFile() && !file.delete()) throw new IllegalStateException("cannot_delete_" + file.getName());
        }
    }

    private void installOptionalAsset(String assetId, File target, String sourceUrl, String expectedSha, long expectedBytes) throws Exception {
        AssetSpec spec = assetSpec(assetId);
        if (spec == null || spec.bytes != expectedBytes || !spec.sha256.equals(expectedSha)) {
            throw new IllegalArgumentException("asset_manifest_not_pinned:" + assetId);
        }
        if (!sourceUrl.startsWith("https://")) throw new IllegalArgumentException("asset_url_must_be_https");
        if (!expectedSha.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("invalid_asset_sha256");
        if (expectedBytes <= 0 || expectedBytes > MAX_OPTIONAL_ASSET_BYTES) throw new IllegalArgumentException("invalid_asset_size");
        if (target.isFile() && target.length() == expectedBytes && expectedSha.equals(sha256File(target))) {
            ensureSharedWeightAlias(assetId, target);
            writeAssetMetadata(assetId, target, sourceUrl, expectedSha, expectedBytes);
            return;
        }
        if (!target.getParentFile().isDirectory() && !target.getParentFile().mkdirs()) {
            throw new IllegalStateException("cannot_create_asset_directory");
        }
        File part = new File(target.getPath() + ".part");
        if (part.isFile() && part.length() > expectedBytes && !part.delete()) throw new IllegalStateException("cannot_reset_oversized_partial_asset");
        if (part.isFile() && part.length() == expectedBytes) {
            emitAssetProgress(assetId, expectedBytes, expectedBytes, "verifying");
            if (!expectedSha.equals(sha256File(part))) {
                if (!part.delete()) throw new IllegalStateException("cannot_reset_invalid_partial_asset");
            } else {
                activateOptionalAsset(assetId, target, part, sourceUrl, expectedSha, expectedBytes);
                emitAssetProgress(assetId, expectedBytes, expectedBytes, "done");
                return;
            }
        }
        long resumeAt = part.isFile() ? part.length() : 0L;
        HttpURLConnection connection = (HttpURLConnection) new URL(sourceUrl).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept-Encoding", "identity");
        connection.setRequestProperty("User-Agent", "PocketEarth/1.0 Android MNN asset installer");
        if (resumeAt > 0) connection.setRequestProperty("Range", "bytes=" + resumeAt + "-");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        if (resumeAt > 0) updateDigestFromFile(digest, part);
        long downloaded = resumeAt;
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("asset_http_" + status);
            if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) {
                throw new IllegalStateException("asset_redirect_must_remain_https");
            }
            boolean append = resumeAt > 0 && status == HttpURLConnection.HTTP_PARTIAL;
            if (resumeAt > 0 && status == HttpURLConnection.HTTP_OK) {
                // Origin/CDN does not support Range: restart safely without mixing byte ranges.
                resumeAt = 0L;
                downloaded = 0L;
                digest.reset();
                append = false;
            } else if (append) {
                String contentRange = connection.getHeaderField("Content-Range");
                String expectedRange = "bytes " + resumeAt + "-" + (expectedBytes - 1L) + "/" + expectedBytes;
                if (!expectedRange.equals(contentRange)) {
                    throw new IllegalStateException("asset_content_range_mismatch");
                }
            }
            long declared = connection.getContentLengthLong();
            long expectedResponseBytes = expectedBytes - resumeAt;
            if (declared > 0 && declared != expectedResponseBytes) throw new IllegalStateException("asset_content_length_mismatch");
            emitAssetProgress(assetId, downloaded, expectedBytes, "downloading");
            long lastProgress = downloaded;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(part, append)) {
                byte[] buffer = new byte[1024 * 1024];
                for (;;) {
                    if (cancelAssetInstall) throw new InterruptedException("asset_install_cancelled");
                    int count = input.read(buffer);
                    if (count < 0) break;
                    downloaded += count;
                    if (downloaded > expectedBytes) throw new IllegalStateException("asset_size_exceeded");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    if (downloaded - lastProgress >= 4L * 1024L * 1024L || downloaded == expectedBytes) {
                        emitAssetProgress(assetId, downloaded, expectedBytes, "downloading");
                        lastProgress = downloaded;
                    }
                }
                output.getFD().sync();
            }
            if (downloaded != expectedBytes) throw new IllegalStateException("asset_size_mismatch");
            emitAssetProgress(assetId, downloaded, expectedBytes, "verifying");
            if (!expectedSha.equals(hex(digest.digest()))) {
                if (part.isFile() && !part.delete()) throw new IllegalStateException("cannot_delete_invalid_asset");
                throw new IllegalStateException("asset_sha256_mismatch");
            }
            activateOptionalAsset(assetId, target, part, sourceUrl, expectedSha, expectedBytes);
            emitAssetProgress(assetId, downloaded, expectedBytes, "done");
        } finally {
            connection.disconnect();
            cancelAssetInstall = false;
        }
    }

    private void installBaseBundle(String sourceUrl, String expectedManifestSha, long expectedBytes) throws Exception {
        if (!BASE_MANIFEST_URL.equals(sourceUrl) || !BASE_MANIFEST_SHA.equals(expectedManifestSha) || expectedBytes != BASE_BUNDLE_BYTES) {
            throw new IllegalArgumentException("base_release_manifest_not_pinned");
        }
        byte[] descriptorBytes = downloadSmallHttps(sourceUrl, 1024 * 1024);
        if (!expectedManifestSha.equals(sha256Bytes(descriptorBytes))) throw new IllegalStateException("base_manifest_sha256_mismatch");
        validateBaseManifest(new JSONObject(new String(descriptorBytes, StandardCharsets.UTF_8)));

        File modelRoot = new File(PocketMnnRuntime.modelRoot());
        File languageMarker = new File(modelRoot, "qwen3-vl-2b-language/.pocket-base-bundle.json");
        File visionMarker = new File(modelRoot, "qwen3-vl-2b-vision/.pocket-base-bundle.json");
        for (File marker : new File[] { languageMarker, visionMarker }) {
            if (marker.isFile() && !marker.delete()) throw new IllegalStateException("cannot_clear_base_release_marker");
        }

        String objectBase = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);
        long completed = 0L;
        emitAssetProgress("qwen3-vl-2b-mnn", 0L, BASE_BUNDLE_BYTES, "downloading");
        for (BaseFileSpec spec : BASE_FILES) {
            if (cancelAssetInstall) throw new InterruptedException("asset_install_cancelled");
            File target = new File(modelRoot, spec.targetPath);
            if (target.isFile() && target.length() == spec.bytes && spec.sha256.equals(sha256File(target))) {
                completed += spec.bytes;
                emitAssetProgress("qwen3-vl-2b-mnn", completed, BASE_BUNDLE_BYTES, "downloading");
                continue;
            }
            downloadBaseFile(target, objectBase + spec.sourcePath, spec, completed);
            completed += spec.bytes;
        }
        emitAssetProgress("qwen3-vl-2b-mnn", BASE_BUNDLE_BYTES, BASE_BUNDLE_BYTES, "verifying");
        writeBaseMarker(languageMarker, sourceUrl, expectedManifestSha);
        writeBaseMarker(visionMarker, sourceUrl, expectedManifestSha);
        if (!baseBundleInstalled(languageMarker.getParentFile(), visionMarker.getParentFile())) {
            throw new IllegalStateException("base_bundle_activation_failed");
        }
        emitAssetProgress("qwen3-vl-2b-mnn", BASE_BUNDLE_BYTES, BASE_BUNDLE_BYTES, "done");
        cancelAssetInstall = false;
    }

    private void validateBaseManifest(JSONObject descriptor) throws Exception {
        if (!"pocket-mnn-model-bundle/v1".equals(descriptor.optString("protocol", "")) ||
            !BASE_RELEASE_ID.equals(descriptor.optString("releaseId", "")) ||
            descriptor.optLong("totalBytes", -1L) != BASE_BUNDLE_BYTES) {
            throw new IllegalStateException("base_manifest_identity_mismatch");
        }
        JSONObject bundles = descriptor.getJSONObject("bundles");
        int declaredFiles = 0;
        for (String bundleName : new String[] { "language", "vision" }) {
            JSONArray files = bundles.getJSONObject(bundleName).getJSONArray("files");
            declaredFiles += files.length();
            for (BaseFileSpec spec : BASE_FILES) {
                if (!spec.sourcePath.startsWith(bundleName + "/")) continue;
                String relative = spec.sourcePath.substring(bundleName.length() + 1);
                boolean matched = false;
                for (int index = 0; index < files.length(); index++) {
                    JSONObject item = files.getJSONObject(index);
                    if (relative.equals(item.optString("path", "")) && spec.bytes == item.optLong("bytes", -1L) &&
                        spec.sha256.equals(item.optString("sha256", ""))) {
                        matched = true;
                        break;
                    }
                }
                if (!matched) throw new IllegalStateException("base_manifest_file_mismatch:" + spec.sourcePath);
            }
        }
        if (declaredFiles != BASE_FILES.length) throw new IllegalStateException("base_manifest_file_count_mismatch");
    }

    private byte[] downloadSmallHttps(String sourceUrl, int maxBytes) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(sourceUrl).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IllegalStateException("base_manifest_http_" + status);
            if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) throw new IllegalStateException("base_manifest_redirect_must_remain_https");
            if (connection.getContentLengthLong() > maxBytes) throw new IllegalStateException("base_manifest_too_large");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192];
                for (;;) {
                    int count = input.read(buffer);
                    if (count < 0) break;
                    if (output.size() + count > maxBytes) throw new IllegalStateException("base_manifest_too_large");
                    output.write(buffer, 0, count);
                }
            }
            return output.toByteArray();
        } finally {
            connection.disconnect();
        }
    }

    private void downloadBaseFile(File target, String sourceUrl, BaseFileSpec spec, long completedBefore) throws Exception {
        if (!target.getParentFile().isDirectory() && !target.getParentFile().mkdirs()) {
            throw new IllegalStateException("cannot_create_base_directory");
        }
        File part = new File(target.getPath() + ".part");
        if (part.isFile() && part.length() > spec.bytes && !part.delete()) throw new IllegalStateException("cannot_reset_oversized_base_part");
        if (part.isFile() && part.length() == spec.bytes) {
            if (spec.sha256.equals(sha256File(part))) {
                Os.rename(part.getAbsolutePath(), target.getAbsolutePath());
                emitAssetProgress("qwen3-vl-2b-mnn", completedBefore + spec.bytes, BASE_BUNDLE_BYTES, "downloading");
                return;
            }
            if (!part.delete()) throw new IllegalStateException("cannot_reset_invalid_base_part");
        }

        long resumeAt = part.isFile() ? part.length() : 0L;
        HttpURLConnection connection = (HttpURLConnection) new URL(sourceUrl).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept-Encoding", "identity");
        connection.setRequestProperty("User-Agent", "PocketEarth/1.0 Android MNN base installer");
        if (resumeAt > 0) connection.setRequestProperty("Range", "bytes=" + resumeAt + "-");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        if (resumeAt > 0) updateDigestFromFile(digest, part);
        long downloaded = resumeAt;
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("base_asset_http_" + status);
            if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) throw new IllegalStateException("base_asset_redirect_must_remain_https");
            boolean append = resumeAt > 0 && status == HttpURLConnection.HTTP_PARTIAL;
            if (resumeAt > 0 && status == HttpURLConnection.HTTP_OK) {
                resumeAt = 0L;
                downloaded = 0L;
                digest.reset();
                append = false;
            } else if (append) {
                String expectedRange = "bytes " + resumeAt + "-" + (spec.bytes - 1L) + "/" + spec.bytes;
                if (!expectedRange.equals(connection.getHeaderField("Content-Range"))) throw new IllegalStateException("base_asset_content_range_mismatch");
            }
            long declared = connection.getContentLengthLong();
            if (declared > 0 && declared != spec.bytes - resumeAt) throw new IllegalStateException("base_asset_content_length_mismatch");
            long lastProgress = downloaded;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(part, append)) {
                byte[] buffer = new byte[1024 * 1024];
                for (;;) {
                    if (cancelAssetInstall) throw new InterruptedException("asset_install_cancelled");
                    int count = input.read(buffer);
                    if (count < 0) break;
                    downloaded += count;
                    if (downloaded > spec.bytes) throw new IllegalStateException("base_asset_size_exceeded");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    if (downloaded - lastProgress >= 16L * 1024L * 1024L || downloaded == spec.bytes) {
                        emitAssetProgress("qwen3-vl-2b-mnn", completedBefore + downloaded, BASE_BUNDLE_BYTES, "downloading");
                        lastProgress = downloaded;
                    }
                }
                output.getFD().sync();
            }
            if (downloaded != spec.bytes) throw new IllegalStateException("base_asset_size_mismatch");
            if (!spec.sha256.equals(hex(digest.digest()))) {
                if (part.isFile() && !part.delete()) throw new IllegalStateException("cannot_delete_invalid_base_asset");
                throw new IllegalStateException("base_asset_sha256_mismatch");
            }
            Os.rename(part.getAbsolutePath(), target.getAbsolutePath());
        } finally {
            connection.disconnect();
        }
    }

    private void writeBaseMarker(File marker, String sourceUrl, String manifestSha) throws Exception {
        if (!marker.getParentFile().isDirectory() && !marker.getParentFile().mkdirs()) throw new IllegalStateException("cannot_create_base_marker_directory");
        JSONObject value = new JSONObject();
        value.put("releaseId", BASE_RELEASE_ID);
        value.put("source", sourceUrl);
        value.put("manifestSha256", manifestSha);
        value.put("verified", true);
        value.put("installedAt", System.currentTimeMillis());
        File part = new File(marker.getPath() + ".part");
        try (FileOutputStream output = new FileOutputStream(part)) {
            output.write(value.toString(2).getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        Os.rename(part.getAbsolutePath(), marker.getAbsolutePath());
    }

    private String sha256Bytes(byte[] bytes) throws Exception {
        return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private void activateOptionalAsset(String assetId, File target, File part, String sourceUrl, String expectedSha, long expectedBytes) throws Exception {
        ensureBaseCompatibility(assetId);
        Os.rename(part.getAbsolutePath(), target.getAbsolutePath());
        ensureSharedWeightAlias(assetId, target);
        writeAssetMetadata(assetId, target, sourceUrl, expectedSha, expectedBytes);
    }

    private void updateDigestFromFile(MessageDigest digest, File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[1024 * 1024];
            for (;;) {
                int count = input.read(buffer);
                if (count < 0) break;
                digest.update(buffer, 0, count);
            }
        }
    }

    private void emitAssetProgress(String assetId, long downloaded, long total, String phase) {
        JSObject event = new JSObject();
        event.put("assetId", assetId);
        event.put("downloaded", downloaded);
        event.put("total", total);
        event.put("phase", phase);
        notifyListeners("assetProgress", event);
    }

    private void ensureBaseCompatibility(String assetId) throws Exception {
        String root = PocketMnnRuntime.modelRoot();
        File base = new File(root, isVisualAdapter(assetId) ? "qwen3-vl-2b-vision" : "qwen3-vl-2b-language");
        if (isVisualAdapter(assetId)) {
            requireExact(new File(base, "visual.mnn"), VISUAL_BASE_GRAPH_SHA, "visual_base_graph_mismatch");
            requireExact(new File(base, "visual.mnn.weight"), VISUAL_BASE_WEIGHT_SHA, "visual_base_weight_mismatch");
        } else if ("travel-planner-lora".equals(assetId)) {
            requireExact(new File(base, "llm.mnn"), LANGUAGE_BASE_GRAPH_SHA, "language_base_graph_mismatch");
            requireExact(new File(base, "llm.mnn.weight"), LANGUAGE_BASE_WEIGHT_SHA, "language_base_weight_mismatch");
        }
    }

    private void requireExact(File file, String sha, String error) throws Exception {
        if (!file.isFile() || !sha.equals(sha256File(file))) throw new IllegalStateException(error);
    }

    private void ensureSharedWeightAlias(String assetId, File target) throws Exception {
        File shared = null;
        File base = new File(PocketMnnRuntime.modelRoot(), isVisualAdapter(assetId) ? "qwen3-vl-2b-vision" : "qwen3-vl-2b-language");
        if (isVisualAdapter(assetId)) shared = new File(base, "visual.mnn.weight");
        else if ("travel-planner-lora".equals(assetId)) shared = new File(base, "llm.mnn.weight");
        if (shared == null) return;
        ensureBaseCompatibility(assetId);
        File alias = new File(target.getPath() + ".weight");
        File staged = new File(alias.getPath() + ".part");
        if (staged.exists() && !staged.delete()) throw new IllegalStateException("cannot_reset_shared_weight_stage");
        try {
            Os.link(shared.getAbsolutePath(), staged.getAbsolutePath());
            Os.rename(staged.getAbsolutePath(), alias.getAbsolutePath());
        } finally {
            if (staged.exists()) staged.delete();
        }
    }

    private boolean isVisualAdapter(String assetId) {
        return "guji-vision-lora".equals(assetId) || "rubbing-vision-lora".equals(assetId) || "general-ocr-vision-lora".equals(assetId);
    }

    private void writeAssetMetadata(String assetId, File target, String sourceUrl, String sha, long bytes) throws Exception {
        JSONObject metadata = new JSONObject();
        metadata.put("id", assetId); metadata.put("source", sourceUrl);
        metadata.put("sha256", sha); metadata.put("bytes", bytes);
        metadata.put("installedAt", System.currentTimeMillis());
        File part = new File(target.getPath() + ".asset.json.part");
        File finalFile = new File(target.getPath() + ".asset.json");
        try (FileOutputStream output = new FileOutputStream(part)) {
            output.write(metadata.toString(2).getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        Os.rename(part.getAbsolutePath(), finalFile.getAbsolutePath());
    }

    private String sha256File(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[1024 * 1024];
            for (;;) {
                int count = input.read(buffer);
                if (count < 0) break;
                digest.update(buffer, 0, count);
            }
        }
        return hex(digest.digest());
    }

    private String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) value.append(String.format("%02x", item & 0xff));
        return value.toString();
    }

    private JSObject asset(String id, String kind, String name, File file) {
        JSObject value = new JSObject();
        boolean installed = verifiedOptionalAsset(id, file);
        value.put("id", id); value.put("kind", kind); value.put("name", name);
        value.put("state", installed ? "installed" : "missing"); value.put("installed", installed);
        value.put("downloaded", installed ? file.length() : 0); value.put("total", installed ? file.length() : 0);
        value.put("runtime", "MNN Android JNI"); value.put("target", "android-arm64");
        return value;
    }

    private boolean verifiedOptionalAsset(String id, File file) {
        if (file == null) return false;
        AssetSpec spec = assetSpec(id);
        File metadata = new File(file.getPath() + ".asset.json");
        if (spec == null || !file.isFile() || file.length() != spec.bytes || !metadata.isFile()) return false;
        try {
            JSONObject value = new JSONObject(readUtf8(metadata));
            if (!id.equals(value.optString("id", "")) || value.optLong("bytes", -1L) != spec.bytes ||
                !spec.sha256.equals(value.optString("sha256", ""))) return false;
            File shared = sharedWeightFile(id);
            if (shared == null) return true;
            File alias = new File(file.getPath() + ".weight");
            return alias.isFile() && shared.isFile()
                && Os.stat(alias.getAbsolutePath()).st_dev == Os.stat(shared.getAbsolutePath()).st_dev
                && Os.stat(alias.getAbsolutePath()).st_ino == Os.stat(shared.getAbsolutePath()).st_ino;
        } catch (Exception ignored) {
            return false;
        }
    }

    private File sharedWeightFile(String assetId) {
        String root = PocketMnnRuntime.modelRoot();
        if (isVisualAdapter(assetId)) return new File(root, "qwen3-vl-2b-vision/visual.mnn.weight");
        if ("travel-planner-lora".equals(assetId)) return new File(root, "qwen3-vl-2b-language/llm.mnn.weight");
        return null;
    }

    private AssetSpec assetSpec(String id) {
        if ("travel-planner-lora".equals(id)) return new AssetSpec(72633256L, "791a4659ecd86dba2336ca4fdc3a4ee93640bed5b7f92370bfdc3c702450dc13");
        if ("guji-vision-lora".equals(id)) return new AssetSpec(17588592L, "6d24871634ff4c1a9af67c5b722f4c311c59fbbe9b23b17111e915f75a992112");
        if ("rubbing-vision-lora".equals(id)) return new AssetSpec(17588592L, "1427fbb08d32607db54796c935d4afde634281990f5dac1be808652e4518858e");
        if ("general-ocr-vision-lora".equals(id)) return new AssetSpec(17588592L, "d09be9ee9a41c7ec87c45e2f721ad7861a493eeb11b04611ec06380d19fc9f5e");
        if ("heritage-restorer".equals(id)) return new AssetSpec(15581812L, "c571f66050be527e7e531b9c116a417c4fece0ec4090cdaf5d2497a8c0eb5a87");
        if ("exhibit-matting".equals(id)) return new AssetSpec(146105104L, "95f35d70763cd83f58e79d83ebba2c682853bee764906dce9b366d1d07ea4b10");
        return null;
    }

    private String readUtf8(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (;;) {
                int count = input.read(buffer);
                if (count < 0) break;
                output.write(buffer, 0, count);
            }
            return output.toString("UTF-8");
        }
    }

    private JSObject stub(String error) {
        JSObject result = new JSObject();
        result.put("backend", "stub"); result.put("error", error);
        result.put("runtime", runtimeObject());
        return result;
    }

    private JSObject parseObject(String value) {
        try { return value == null || value.isEmpty() ? new JSObject() : new JSObject(value); }
        catch (JSONException ignored) { return new JSObject(); }
    }

    private JSArray parseArray(String value) {
        try { return value == null ? new JSArray() : new JSArray(value); }
        catch (JSONException ignored) { return new JSArray(); }
    }
}
