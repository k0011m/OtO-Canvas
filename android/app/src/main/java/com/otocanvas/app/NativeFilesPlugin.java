package com.otocanvas.app;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "NativeFiles")
public class NativeFilesPlugin extends Plugin {
    private boolean saving = false;

    /** 広いストレージ権限を使わず、利用者が選んだ保存先だけへ書き出す。 */
    @PluginMethod
    public void save(PluginCall call) {
        if (saving) { call.reject("保存先を選択中です。"); return; }
        String data = call.getString("base64", "");
        if (data.length() > 90 * 1024 * 1024) { call.reject("ファイルが大きすぎます。"); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "otocanvas-file"));
        saving = true;
        try { startActivityForResult(call, intent, "savedFile"); }
        catch (Exception error) { saving = false; call.reject("保存先を開けませんでした。", error); }
    }

    /** キャンセルは正常終了と区別し、書込み完了後だけ成功を画面へ返す。 */
    @ActivityCallback
    private void savedFile(PluginCall call, ActivityResult result) {
        saving = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject answer = new JSObject(); answer.put("saved", false); call.resolve(answer); return;
        }
        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(result.getData().getData(), "w")) {
                if (stream == null) throw new java.io.IOException("保存先を開けませんでした。");
                stream.write(Base64.decode(call.getString("base64", ""), Base64.DEFAULT));
                stream.flush();
                JSObject answer = new JSObject(); answer.put("saved", true); call.resolve(answer);
            } catch (Exception error) { call.reject("ファイルを保存できませんでした。", error); }
        });
    }
}
