import { authorized, json } from "../survey";
/** 認証後にだけ回答をページ単位で返す。集計は読み取り専用で、削除機能は設けない。 */
export async function onRequestGet({ request, env }: any): Promise<Response> {
  if (!(await authorized(request, env.SURVEY_ADMIN_KEY))) return json({ error: "管理キーを確認してください。" }, 401);
  if (!env.SURVEY_DB) return json({ error: "データベース未設定です。" }, 503);
  const cursor = Number(new URL(request.url).searchParams.get("cursor") ?? 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) return json({ error: "取得位置が不正です。" }, 400);
  try {
    const { results } = await env.SURVEY_DB.prepare("SELECT seq, created_at, body FROM survey_responses WHERE seq > ? ORDER BY seq LIMIT 250").bind(cursor).all();
    return json({ rows: results.map((row: any) => ({ seq: row.seq, created_at: row.created_at, response: JSON.parse(row.body) })), next: results.length === 250 ? results[results.length - 1].seq : null });
  } catch { return json({ error: "集計を取得できませんでした。" }, 503); }
}
