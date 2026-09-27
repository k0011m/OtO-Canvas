import { useState } from "react";
import { CHILD_LABELS, LABELS, OPTIONS, TEXT_LABELS, type SurveyRow } from "./model";
import { ContactReview } from "./SurveyContact";

/** 日時・回答内容からテスト回答を識別し、1件ずつ削除・復元する管理者専用の一覧。 */
export function SurveyResponseManager({ adminKey, rows, onTrash, onRestore }: { adminKey: string; rows: SurveyRow[]; onTrash: (id: string) => void; onRestore: (row: SurveyRow) => void }) {
  const [trash, setTrash] = useState<SurveyRow[]>([]);
  const [view, setView] = useState<"active" | "trash">("active");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [query, setQuery] = useState("");
  /** ゴミ箱を全ページ取得し、取得途中の結果を表示しない。 */
  async function openTrash() {
    setBusy(true); setMessage("");
    try {
      const result: SurveyRow[] = []; let cursor = 0;
      do {
        const response = await fetch(`/api/survey/admin?trash=1&cursor=${cursor}`, { headers: { Authorization: `Bearer ${adminKey}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "取得できませんでした。");
        result.push(...data.rows); if (data.next === null) break;
        if (!Number.isSafeInteger(data.next) || data.next <= cursor) throw new Error("取得位置が不正です。"); cursor = data.next;
      } while (true);
      setTrash(result); setView("trash");
    } catch (e) { setMessage(e instanceof Error ? e.message : "取得できませんでした。"); }
    finally { setBusy(false); }
  }
  /** サーバー成功後にだけ一覧と集計を更新し、通信失敗時は回答を画面に残す。 */
  async function change(row: SurveyRow, action: "trash" | "restore") {
    if (busy) return;
    if (action === "trash" && !window.confirm(`回答 ${row.response.id}\n受付：${new Date(row.created_at).toLocaleString("ja-JP")}\nこの1件をゴミ箱へ移しますか？ 集計・CSV・お礼用一覧から外れます。後から復元できます。`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/survey/admin", { method: "POST", headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: row.response.id, action }), signal: AbortSignal.timeout(20000) });
      const data = await response.json(); if (!response.ok || data.ok !== true || data.id !== row.response.id || data.action !== action) throw new Error(data.error ?? "変更を確認できませんでした。");
      if (action === "trash") onTrash(row.response.id);
      else { setTrash(old => old.filter(r => r.response.id !== row.response.id)); onRestore(row); }
      setMessage(action === "trash" ? "1件をゴミ箱へ移しました。" : "1件を復元しました。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "変更できませんでした。再取得して確認してください。"); }
    finally { setBusy(false); }
  }
  const visible = (view === "active" ? rows : trash).filter(r => JSON.stringify(r.response).toLowerCase().includes(query.trim().toLowerCase()) || r.created_at.includes(query.trim()));
  return <details className="survey-response-manager"><summary>回答の管理・デバッグ回答の削除</summary>
    <p>回答の日時・ID・内容を確認して、不要な回答を1件ずつゴミ箱へ移せます。ゴミ箱の回答は集計・CSV・謝辞とお礼用一覧から除外します。完全削除ではなく、保存内容は保持され、復元できます。</p>
    <div className="survey-actions"><button type="button" disabled={busy} aria-pressed={view === "active"} onClick={() => { setView("active"); setMessage(""); }}>集計中の回答</button><button type="button" disabled={busy} aria-pressed={view === "trash"} onClick={() => void openTrash()}>ゴミ箱を表示・更新</button></div>
    <label className="survey-text-field">回答ID・内容・日時で検索<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <p>{view === "active" ? "年齢・モードの絞り込みに一致する回答" : "ゴミ箱の全回答"}：{visible.length}件</p>
    {message && <p role="status">{message}</p>}
    {visible.map(row => <details key={row.response.id} className="survey-managed-row" data-response-id={row.response.id}><summary>{new Date(row.created_at).toLocaleString("ja-JP")} · {row.response.parent.age ?? "未回答"}歳 · {row.response.id.slice(0, 8)}</summary>
      <p>回答ID：{row.response.id}</p><dl><dt>どうだった？</dt><dd>{row.response.child.fun === null ? "未回答" : CHILD_LABELS.fun[row.response.child.fun]}</dd><dt>また遊びたい？</dt><dd>{row.response.child.again === null ? "未回答" : CHILD_LABELS.again[row.response.child.again]}</dd>
      {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map(k => <div key={k}><dt>{LABELS[k]}</dt><dd>{(Array.isArray(row.response.parent[k]) ? (row.response.parent[k] as string[]).join("、") : row.response.parent[k]) || "未回答"}</dd></div>)}
      {(Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]).map(k => <div key={k}><dt>{TEXT_LABELS[k]}</dt><dd className="survey-text">{row.response.parent[k] || "未回答"}</dd></div>)}</dl>
      <ContactReview value={row.response.contact} />
      <button type="button" disabled={busy} onClick={() => void change(row, view === "active" ? "trash" : "restore")}>{view === "active" ? "この回答をゴミ箱へ移す" : "この回答を復元する"}</button>
    </details>)}
  </details>;
}
