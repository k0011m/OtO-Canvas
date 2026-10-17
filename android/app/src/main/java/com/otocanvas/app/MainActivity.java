package com.otocanvas.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Web画面の読込み前に、端末へのファイル保存機能を登録する。 */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
