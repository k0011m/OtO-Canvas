import { authorized, json } from "../survey";
/** 認証後にだけ回答をページ単位で返す。通常の集計からゴミ箱の回答を除外し、明示した場合だけゴミ箱を返す。 */
export async function onRequestGet({ request, env }: any): Promise<Response> {
  if (!(await authorized(request, env.SURVEY_ADMIN_KEY_HASH))) return json({ error: "管理キーを確認してください。" }, 401);
  if (!env.SURVEY_DB) return json({ error: "データベース未設定です。" }, 503);
  const cursor = Number(new URL(request.url).searchParams.get("cursor") ?? 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) return json({ error: "取得位置が不正です。" }, 400);
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  try {
    const { results } = await env.SURVEY_DB.prepare(`SELECT seq, created_at, body FROM survey_responses WHERE seq > ? AND json_extract(body, '$._adminDeletedAt') IS ${trash ? "NOT " : ""}NULL ORDER BY seq LIMIT 250`).bind(cursor).all();
    return json({ rows: results.map((row: any) => ({ seq: row.seq, created_at: row.created_at, response: JSON.parse(row.body) })), next: results.length === 250 ? results[results.length - 1].seq : null });
  } catch { return json({ error: "集計を取得できませんでした。" }, 503); }
}

/** 管理者が指定した1件だけをゴミ箱へ移すか復元し、誤削除から戻せるようにする。 */
export async function onRequestPost({ request, env }: any): Promise<Response> {
  if (!(await authorized(request, env.SURVEY_ADMIN_KEY_HASH))) return json({ error: "管理キーを確認してください。" }, 401);
  if (!env.SURVEY_DB) return json({ error: "データベース未設定です。" }, 503);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "管理画面から操作してください。" }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "送信形式が違います。" }, 415);
  let input;
  try {
    const reader = request.body?.getReader(); if (!reader) return json({ error: "操作がありません。" }, 400);
    let text = ""; let size = 0; const decoder = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2048) { await reader.cancel(); return json({ error: "操作データが大きすぎます。" }, 413); } text += decoder.decode(value, { stream: true }); }
    input = JSON.parse(text + decoder.decode());
  } catch { return json({ error: "操作の形式を確認してください。" }, 400); }
  if (!input || typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) || !["trash", "restore"].includes(input.action)) return json({ error: "回答IDと操作を確認してください。" }, 400);
  try {
    // 既存JSONの管理用印だけを変更する。回答・同意・連絡先は復元できるよう保持する。
    const sql = input.action === "trash"
      ? "UPDATE survey_responses SET body = json_set(body, '$._adminDeletedAt', coalesce(json_extract(body, '$._adminDeletedAt'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))) WHERE response_id = ?"
      : "UPDATE survey_responses SET body = json_remove(body, '$._adminDeletedAt') WHERE response_id = ?";
    const result = await env.SURVEY_DB.prepare(sql).bind(input.id).run();
    if (!result.meta.changes) return json({ error: "回答が見つかりません。更新して確認してください。" }, 404);
    return json({ ok: true, id: input.id, action: input.action });
  } catch { return json({ error: "変更できませんでした。状態を更新してから再度お試しください。" }, 503); }
}
