export type CreationMode = "basic" | "motion";
export const PARENT_SETTINGS_KEY = "otocanvas.parent-settings.v1";

/** 保存できない環境や古い・壊れた設定でも、従来の編集画面で起動する。 */
export function loadCreationMode(): CreationMode {
  try {
    const value = JSON.parse(localStorage.getItem(PARENT_SETTINGS_KEY) ?? "null");
    return value?.creationMode === "basic" ? "basic" : "motion";
  } catch {
    return "motion";
  }
}

/** 作品とは別に端末の設定を保存し、保存できなかった場合は画面へ知らせる。 */
export function saveCreationMode(creationMode: CreationMode): boolean {
  try {
    localStorage.setItem(PARENT_SETTINGS_KEY, JSON.stringify({ creationMode }));
    return true;
  } catch {
    return false;
  }
}
