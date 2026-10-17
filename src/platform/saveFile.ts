import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native";
const NativeFiles = registerPlugin<{ save(options: { name: string; mime: string; base64: string }): Promise<{ saved: boolean }> }>("NativeFiles");
/** Androidは保存先選択へ渡し、ブラウザは従来のダウンロードを開始する。 */
export async function downloadFile(blob: Blob, name: string): Promise<boolean> {
  if (isNativeApp) {
    if (blob.size > 64 * 1024 * 1024) throw new Error("ファイルが大きすぎます（64MBまで）。");
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("ファイルを読み出せませんでした。"));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    return (await NativeFiles.save({ name, mime: blob.type || "application/octet-stream", base64 })).saved;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
