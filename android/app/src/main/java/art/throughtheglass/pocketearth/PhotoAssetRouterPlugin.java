package art.throughtheglass.pocketearth;

import android.content.ContentUris;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Routes a MediaStore asset to the system viewer without copying its original
 * bytes into Pocket Earth's private storage.
 */
@CapacitorPlugin(name = "PocketPhotoAssetRouter")
public class PhotoAssetRouterPlugin extends Plugin {
    @PluginMethod
    public void openInSystemGallery(PluginCall call) {
        String assetId = call.getString("id");
        Uri uri = mediaStoreUri(assetId);
        if (uri == null) {
            call.reject("Only MediaStore image asset ids can be routed to the system gallery");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "image/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("No system photo viewer is available");
            return;
        }

        getActivity().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    /** Clears only Pocket Earth's derived/plugin cache. MediaStore is never touched. */
    @PluginMethod
    public void clearAppPhotoCache(PluginCall call) {
        File cacheRoot = new File(getContext().getCacheDir(), "photoLibrary");
        int removed = deleteChildren(cacheRoot);
        JSObject result = new JSObject();
        result.put("removed", removed);
        call.resolve(result);
    }

    private Uri mediaStoreUri(String assetId) {
        if (assetId == null || !assetId.startsWith("image:")) return null;
        try {
            long id = Long.parseLong(assetId.substring("image:".length()));
            Uri collection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
                : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            return ContentUris.withAppendedId(collection, id);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private int deleteChildren(File directory) {
        if (!directory.exists() || !directory.isDirectory()) return 0;
        File[] children = directory.listFiles();
        if (children == null) return 0;
        int removed = 0;
        for (File child : children) {
            if (child.isDirectory()) removed += deleteChildren(child);
            if (child.delete()) removed++;
        }
        return removed;
    }
}
