package art.throughtheglass.pocketearth;

import android.content.Context;
import java.io.File;

/**
 * Narrow JNI boundary around the official MNN-LLM runtime.
 *
 * The native release bundle must provide libpocket_mnn_jni.so for arm64-v8a.
 * Absence or a symbol/version mismatch is deliberately reported as unavailable;
 * Java never pretends that a web model or cloud request was native MNN inference.
 */
final class PocketMnnRuntime {
    private static final String PREFS = "pocket_mnn_runtime";
    private static final String PREF_MNN_ENABLED = "mnn_enabled";
    private static final String PREF_SME2_ENABLED = "sme2_enabled";
    private static final boolean LIBRARY_LOADED;
    private static String modelRoot = "";
    private static boolean mnnEnabled = true;
    private static boolean sme2Enabled = true;
    private static String configurationJson = "{}";

    static {
        boolean loaded = false;
        try {
            System.loadLibrary("pocket_mnn_jni");
            loaded = true;
        } catch (UnsatisfiedLinkError ignored) {
            loaded = false;
        }
        LIBRARY_LOADED = loaded;
    }

    private PocketMnnRuntime() {}

    static synchronized boolean initialize(Context context) {
        if (modelRoot.isEmpty()) {
            File root = new File(context.getFilesDir(), "pocket-earth/models");
            if (!root.exists() && !root.mkdirs()) return false;
            modelRoot = root.getAbsolutePath();
        }
        if (!LIBRARY_LOADED) return false;
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        mnnEnabled = prefs.getBoolean(PREF_MNN_ENABLED, true);
        sme2Enabled = prefs.getBoolean(PREF_SME2_ENABLED, true);
        try {
            configurationJson = nativeConfigure(mnnEnabled, sme2Enabled);
            nativeInitialize(modelRoot);
        } catch (UnsatisfiedLinkError error) { return false; }
        return textReady() || visionReady();
    }

    static synchronized String configure(Context context, boolean nextMnnEnabled, boolean nextSme2Enabled) {
        if (!LIBRARY_LOADED) return "{}";
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(PREF_MNN_ENABLED, nextMnnEnabled)
            .putBoolean(PREF_SME2_ENABLED, nextSme2Enabled)
            .apply();
        mnnEnabled = nextMnnEnabled;
        sme2Enabled = nextSme2Enabled;
        configurationJson = nativeConfigure(mnnEnabled, sme2Enabled);
        return configurationJson;
    }

    static boolean libraryLoaded() { return LIBRARY_LOADED; }
    static String modelRoot() { return modelRoot; }
    static boolean mnnEnabled() { return mnnEnabled; }
    static boolean sme2Enabled() { return sme2Enabled; }
    static String configurationJson() { return configurationJson; }
    static boolean textReady() {
        if (!LIBRARY_LOADED) return false;
        try { return nativeTextReady(); } catch (UnsatisfiedLinkError error) { return false; }
    }
    static boolean visionReady() {
        if (!LIBRARY_LOADED) return false;
        try { return nativeVisionReady(); } catch (UnsatisfiedLinkError error) { return false; }
    }
    static void invalidateModels() {
        if (!LIBRARY_LOADED) return;
        try { nativeInvalidate(); } catch (UnsatisfiedLinkError ignored) {}
    }

    static native String nativeConfigure(boolean mnnEnabled, boolean sme2Enabled);
    static native void nativeInitialize(String modelRoot);
    static native void nativeInvalidate();
    static native boolean nativeReady();
    static native boolean nativeTextReady();
    static native boolean nativeVisionReady();
    static native String nativeVersion();
    static native String nativeCapabilities();
    static native String nativeProbe(String prompt);
    static native String nativeChat(String prompt, String system, String adapter, boolean json, int maxTokens);
    static native String nativeVision(String image, String prompt, String adapter, String detail, int maxTokens);
    /** Returns JSON: {"image":"data:image/png;base64,...","stats":{...}}. */
    static native String nativeRestore(String image, String mask);
    static native String nativeMetrics();
}
