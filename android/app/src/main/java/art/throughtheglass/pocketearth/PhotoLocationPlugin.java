package art.throughtheglass.pocketearth;

import android.Manifest;
import android.content.ContentUris;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "PocketPhotoLocation",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }, alias = "mediaLocation")
    }
)
public class PhotoLocationPlugin extends Plugin {
    private static final int MAX_IDS_PER_CALL = 250;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("mediaLocation") == PermissionState.GRANTED) {
            call.resolve(permissionResult());
            return;
        }
        requestPermissionForAlias("mediaLocation", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void getLocations(PluginCall call) {
        JSArray ids = call.getArray("ids");
        if (ids == null) {
            call.reject("Parameter 'ids' is required");
            return;
        }
        if (ids.length() > MAX_IDS_PER_CALL) {
            call.reject("At most " + MAX_IDS_PER_CALL + " asset ids are allowed per call");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("mediaLocation") != PermissionState.GRANTED) {
            call.reject("media_location_permission_required");
            return;
        }
        executor.execute(() -> {
            JSArray locations = new JSArray();
            for (int index = 0; index < ids.length(); index++) {
                try {
                    String assetId = ids.getString(index);
                    JSObject location = readLocation(assetId);
                    if (location != null) locations.put(location);
                } catch (Exception ignored) {
                    // One corrupt or cloud-only asset must not abort the batch.
                }
            }
            JSObject result = new JSObject();
            result.put("locations", locations);
            getBridge().executeOnMainThread(() -> call.resolve(result));
        });
    }

    private JSObject permissionResult() {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            result.put("state", "notRequired");
        } else {
            result.put("state", getPermissionState("mediaLocation") == PermissionState.GRANTED ? "authorized" : "denied");
        }
        return result;
    }

    private JSObject readLocation(String assetId) throws Exception {
        if (assetId == null || !assetId.startsWith("image:")) return null;
        long id = Long.parseLong(assetId.substring("image:".length()));
        Uri collection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        Uri uri = ContentUris.withAppendedId(collection, id);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) uri = MediaStore.setRequireOriginal(uri);
        try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
            if (stream == null) return null;
            ExifInterface exif = new ExifInterface(stream);
            double[] coordinates = exif.getLatLong();
            if (coordinates == null || coordinates.length < 2) return null;
            JSObject result = new JSObject();
            result.put("id", assetId);
            result.put("latitude", coordinates[0]);
            result.put("longitude", coordinates[1]);
            return result;
        }
    }
}
