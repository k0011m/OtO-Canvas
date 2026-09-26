export const CAMERA_SETTINGS_KEY = "otocanvas.camera.v1";
export type CameraChoice = "ask" | "off" | "on";

/** 同意が記録されていない端末では、OS権限を要求せず保護者向け説明から始める。 */
export function loadCameraChoice(): CameraChoice {
  try {
    const value = localStorage.getItem(CAMERA_SETTINGS_KEY);
    return value === "on" || value === "off" ? value : "ask";
  } catch { return "ask"; }
}

/** ブラウザの権限とは別に、アプリ内の保護者の選択を保存する。 */
export function saveCameraChoice(value: CameraChoice): boolean {
  try { localStorage.setItem(CAMERA_SETTINGS_KEY, value); return true; }
  catch { return false; }
}

/** 音声は取得せず、内カメラを優先して写真用の映像だけを要求する。 */
export async function openFrontCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("このブラウザではカメラを使えません。");
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 960 } } });
}
