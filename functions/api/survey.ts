import { validateSurvey } from "../../src/survey/model";

/** 応答と回答データをブラウザやCDNのキャッシュへ残さない。 */
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
/** 管理キーは公開JSに入れず、サーバー側でダイジェストを比較する。 */
export async function authorized(request: Request, secret?: string): Promise<boolean> {
  if (!secret || secret.length < 24) return false;
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!token || token.length > 512) return false;
  const hashes = await Promise.all([token, secret].map(s => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
  const a = new Uint8Array(hashes[0]), b = new Uint8Array(hashes[1]);
  let different = 0; for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}
/** 受信量・出所・回答形式を検証し、D1の一意制約で再送を安全に受理する。 */
export async function onRequestPost({ request, env }: any): Promise<Response> {
  if (!env.SURVEY_DB || !env.SURVEY_ADMIN_KEY || env.SURVEY_ADMIN_KEY.length < 24) return json({ error: "受付準備中です。しばらくしてからお試しください。" }, 503);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "このサイトの回答画面から送信してください。" }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "送信形式が違います。" }, 415);
  // Content-Lengthがないリクエストも読み取り中に上限を適用する。
  const reader = request.body?.getReader(); if (!reader) return json({ error: "回答がありません。" }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 20000) { await reader.cancel(); return json({ error: "回答が長すぎます。" }, 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  let data; try { data = validateSurvey(JSON.parse(new TextDecoder().decode(bytes))); } catch { return json({ error: "回答を確認してください。" }, 400); }
  if (!data) return json({ error: "回答の形式を確認してください。" }, 400);
  try {
    const duplicate = await env.SURVEY_DB.prepare("SELECT response_id FROM survey_responses WHERE response_id = ?").bind(data.id).first();
    if (duplicate) return json({ ok: true, id: data.id });
    const hour = Math.floor(Date.now() / 3600000);
    const input = `${env.SURVEY_ADMIN_KEY}:${hour}:${request.headers.get("CF-Connecting-IP") ?? "local"}`;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
    const bucket = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
    const limit = await env.SURVEY_DB.prepare("INSERT INTO survey_rate_limits(bucket,count,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count").bind(bucket, (hour + 1) * 3600).first();
    if (limit.count > 120) return json({ error: "送信回数が多いため、時間をおいて再送してください。" }, 429);
    await env.SURVEY_DB.batch([
      env.SURVEY_DB.prepare("INSERT OR IGNORE INTO survey_responses(response_id,body) VALUES (?,?)").bind(data.id, JSON.stringify(data)),
      env.SURVEY_DB.prepare("DELETE FROM survey_rate_limits WHERE expires < ?").bind(Math.floor(Date.now() / 1000)),
    ]);
    return json({ ok: true, id: data.id });
  } catch { return json({ error: "保存できませんでした。回答を残したまま再送できます。" }, 503); }
}
/** 公開GETから回答が取得されることを防ぐ。 */
export function onRequestGet(): Response { return json({ error: "回答の送信専用です。" }, 405); }
