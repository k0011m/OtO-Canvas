import { useState, useSyncExternalStore } from "react";
import { applyOfflineUpdate, getOfflineState, retryOfflinePreparation, subscribeOffline } from "../pwa/registerServiceWorker";

/** 保護者へ準備状況と端末への追加方法を示し、保存成功後だけ更新を適用する。 */
export function OfflineSettings({ beforeUpdate }: { beforeUpdate: () => Promise<void> }) {
  const state = useSyncExternalStore(subscribeOffline, getOfflineState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labels = { preparing: "オフライン用のデータを準備しています…", ready: "オフライン準備完了",
    error: "オフライン準備が完了していません。通信のある場所で再確認してください。",
    unsupported: "このブラウザではオフライン保存を利用できません。", development: "開発用の画面です。オフライン機能は公開版で使えます。" };

  /** 写真や演奏を閉じる前に確認し、保存失敗なら現在の画面を保持する。 */
  async function update() {
    if (!window.confirm("作品を保存して更新します。未保存の記念写真は消えます。続けますか？")) return;
    setBusy(true); setError("");
    try { await beforeUpdate(); await applyOfflineUpdate(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "更新できませんでした。"); setBusy(false); }
  }

  return <fieldset className="creation-settings">
    <legend>オフラインで使う</legend>
    <p role="status" data-testid="offline-status"><strong>{labels[state.status]}</strong></p>
    <p>準備完了後は、インターネットなしで起動・編集・演奏・作品の保存と読み込みができます。音源も端末に保存されます。</p>
    <p>スマホはブラウザのメニューや共有から「ホーム画面に追加」、PCは対応ブラウザの「インストール」でアプリのように開けます。追加しなくても、このブラウザでオフライン利用できます。</p>
    <p>追加したアイコンからも、一度オンラインで開いて「オフライン準備完了」を確認してください。</p>
    <p>初回の準備と新しい版の取得には通信が必要です。ブラウザのデータ削除や端末の空き容量不足で保存内容が消える場合があるため、大切な作品は作品ファイルにも書き出してください。</p>
    {state.updateAvailable && <button className="pill-button" disabled={busy} onClick={() => void update()}>{busy ? "保存して更新中…" : "作品を保存して更新"}</button>}
    {!["development", "unsupported"].includes(state.status) && <button className="pill-button" disabled={busy} onClick={() => void retryOfflinePreparation()}>準備・更新を再確認</button>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
