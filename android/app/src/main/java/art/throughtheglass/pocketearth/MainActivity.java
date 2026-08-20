package art.throughtheglass.pocketearth;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PocketMnnPlugin.class);
        registerPlugin(PhotoLocationPlugin.class);
        registerPlugin(PhotoAssetRouterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
