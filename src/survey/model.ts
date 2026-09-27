export const SURVEY_VERSION = 1;
export const OPTIONS = {
  usualPlay: ["外遊び・運動", "お絵描き・工作", "積み木・ブロック・パズル", "ごっこ遊び・人形遊び", "絵本・読書", "歌・楽器・ダンス", "ゲーム・アプリ", "動画視聴", "その他"],
  screenTime: ["使わない", "30分未満", "30分以上〜1時間未満", "1時間以上〜2時間未満", "2時間以上〜3時間未満", "3時間以上", "わからない"],
  experience: ["ほぼない", "ときどき", "よく使う"],
  device: ["スマートフォン", "タブレット", "パソコン", "その他"],
  mode: ["図形と色", "動きも編集", "音階プログラミング", "わからない"],
  priorUse: ["初めて", "利用したことがある"],
  findControls: ["見つけられなかった", "あまり見つけられなかった", "どちらともいえない", "だいたい見つけられた", "見つけられた", "判断できない"],
  help: ["図形配置", "色変更", "再生", "場面切り替え", "音階編集", "その他", "手助け不要"],
  difficulty: ["簡単すぎる", "少し簡単", "合っている", "少し難しい", "難しすぎる", "判断できない"],
  homeUse: ["使わせたくない", "あまり使わせたくない", "どちらともいえない", "やや使わせたい", "使わせたい", "判断できない"],
  parentSettings: ["選べた", "一部迷った", "選べなかった", "設定していない"],
} as const;
export const LABELS: Record<keyof typeof OPTIONS, string> = {
  usualPlay: "普段、お子さまはどんな遊びをしていますか？（複数選択可）",
  screenTime: "普段、1日あたり端末をどれくらい使いますか？",
  experience: "スマホ・タブレットの操作経験", device: "今回の端末", mode: "今回のモード", priorUse: "OtoCanvasの利用経験",
  findControls: "操作したい場所を見つけられていましたか？", help: "どの操作で手助けが必要でしたか？（複数選択可）",
  difficulty: "選んだモードの難しさはどうでしたか？", homeUse: "ご家庭でも使わせたいと思いますか？", parentSettings: "親向け設定で必要な機能を選べましたか？",
};
export const TEXT_LABELS = { initiative: "自分で選んだり工夫した場面があれば教えてください。なければ「なし」で構いません。", homeReason: "家庭で使わせたい・使わせたくない理由", settingsReason: "親向け設定で迷った点", feedback: "気になった点、変えてほしい点" };
export const CHILD_LABELS = { fun: ["たのしかった", "ふつう", "たのしくなかった"], again: ["あそびたい", "どっちでもない", "あそびたくない"] };
export type SurveyContact = { experienceContactConsent?: boolean; experienceEmail?: string; competitionScope?: "tech-koshien" | "tech-koshien-and-future"; acknowledgmentName: string; publishConsent: boolean; email: string; mailConsent: boolean; childName: string };
/** 連絡先を希望しない回答と旧回答に共通の初期値を返す。 */
export function emptyContact(): SurveyContact { return { competitionScope: "tech-koshien-and-future", acknowledgmentName: "", publishConsent: false, email: "", mailConsent: false, childName: "" }; }
/** 利用目的ごとの同意を検証し、同意のない名前・連絡先は受理しない。 */
export function validateContact(value: unknown): SurveyContact | null {
  if (value === undefined) return emptyContact();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as SurveyContact;
  if (c.competitionScope !== undefined && !["tech-koshien", "tech-koshien-and-future"].includes(c.competitionScope)) return null;
  if (typeof c.publishConsent !== "boolean" || typeof c.mailConsent !== "boolean") return null;
  for (const field of ["acknowledgmentName", "childName", "email"] as const) if (typeof c[field] !== "string" || /[\r\n\x00-\x1f\x7f]/.test(c[field])) return null;
  const result = { ...(c.competitionScope === undefined ? {} : { competitionScope: c.competitionScope }), acknowledgmentName: c.acknowledgmentName.trim(), publishConsent: c.publishConsent, email: c.email.trim(), mailConsent: c.mailConsent, childName: c.childName.trim() };
  if (result.acknowledgmentName.length > 80 || result.childName.length > 80 || result.email.length > 254) return null;
  if (result.publishConsent !== Boolean(result.acknowledgmentName)) return null;
  if (result.mailConsent !== Boolean(result.email) || (result.childName && !result.mailConsent)) return null;
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) return null;
  // 旧回答は募集への同意なしと扱い、お礼メールとは別に連絡先を検証する。
  if (c.experienceContactConsent !== undefined && typeof c.experienceContactConsent !== "boolean") return null;
  if (c.experienceEmail !== undefined && typeof c.experienceEmail !== "string") return null;
  const email = c.experienceEmail ?? "";
  if (/[\r\n\x00-\x1f\x7f]/.test(email) || email.trim().length > 254) return null;
  if ((c.experienceContactConsent ?? false) !== Boolean(email.trim())) return null;
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return null;
  return { ...result, ...(c.experienceContactConsent === undefined ? {} : { experienceContactConsent: c.experienceContactConsent }), ...(c.experienceEmail === undefined ? {} : { experienceEmail: email.trim() }) };
}
/** 旧回答の同意範囲を広げず、新しい同意と区別して表示する。 */
export function contactScopeLabel(contact: SurveyContact): string { return contact.competitionScope === "tech-koshien-and-future" ? "テック甲子園や今後出場する大会" : "テック甲子園のみ（旧同意）"; }
export type SurveyAnswer = {
  contact?: SurveyContact;
  version: 1; id: string; consent: true; child: { fun: number | null; again: number | null };
  parent: { age: number | null; months: number | null; help: string[]; usualPlay: string[] } & Record<Exclude<keyof typeof OPTIONS, "help" | "usualPlay">, string> & Record<keyof typeof TEXT_LABELS, string>;
};
export type SurveyRow = { seq: number; created_at: string; response: SurveyAnswer };
/** 親子の回答を初期化し、謝辞・連絡先の同意は初期状態でオフにする。 */
export function emptySurvey(): SurveyAnswer {
  return { contact: emptyContact(), version: 1, id: crypto.randomUUID(), consent: true, child: { fun: null, again: null }, parent: {
    age: null, months: null, help: [], usualPlay: [], screenTime: "", experience: "", device: "", mode: "", priorUse: "", findControls: "", difficulty: "", homeUse: "", parentSettings: "", initiative: "", homeReason: "", settingsReason: "", feedback: "",
  } };
}
/** APIと画面で同じ選択肢・長さ制限を使い、未知の情報を保存しない。 */
export function validateSurvey(value: unknown): SurveyAnswer | null {
  if (!value || typeof value !== "object") return null;
  const v = value as SurveyAnswer;
  if (v.version !== 1 || v.consent !== true || !/^[0-9a-f-]{36}$/i.test(v.id ?? "") || !v.child || !v.parent) return null;
  if (![null, 0, 1, 2].includes(v.child.fun) || ![null, 0, 1, 2].includes(v.child.again)) return null;
  // 追加前の回答・送信待ちデータは、新項目を未回答として扱う。
  const p = { ...v.parent, usualPlay: v.parent.usualPlay === undefined ? [] : v.parent.usualPlay, screenTime: v.parent.screenTime === undefined ? "" : v.parent.screenTime };
  if (!Array.isArray(p.usualPlay) || p.usualPlay.length > OPTIONS.usualPlay.length || new Set(p.usualPlay).size !== p.usualPlay.length || p.usualPlay.some(x => !(OPTIONS.usualPlay as readonly string[]).includes(x))) return null;
  if (p.age !== null && (!Number.isInteger(p.age) || p.age < 0 || p.age > 18)) return null;
  if (p.months !== null && (!Number.isInteger(p.months) || p.months < 0 || p.months > 11)) return null;
  if (!Array.isArray(p.help) || p.help.length > OPTIONS.help.length || new Set(p.help).size !== p.help.length || p.help.some(x => !(OPTIONS.help as readonly string[]).includes(x))) return null;
  if (p.help.includes("手助け不要") && p.help.length > 1) return null;
  for (const key of Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]) {
    if (key !== "help" && key !== "usualPlay" && p[key] !== "" && !(OPTIONS[key] as readonly string[]).includes(p[key])) return null;
  }
  for (const key of Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]) if (typeof p[key] !== "string" || p[key].length > 1000) return null;
  const contact = validateContact(v.contact); if (!contact) return null;
  const clean = emptySurvey(); clean.contact = contact; clean.id = v.id; clean.child = { fun: v.child.fun, again: v.child.again };
  clean.parent.age = p.age; clean.parent.months = p.months; clean.parent.help = [...p.help]; clean.parent.usualPlay = [...p.usualPlay];
  for (const key of Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]) if (key !== "help" && key !== "usualPlay") clean.parent[key] = p[key];
  for (const key of Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]) clean.parent[key] = p[key];
  return clean;
}
/** CSVを表計算で開いたとき、自由記述を式として実行させない。 */
function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
/** 未回答を空欄に保ち、親子1組を1行にしたUTF-8 CSVを作る。 */
export function surveyCsv(rows: SurveyRow[]): string {
  const choiceKeys = Object.keys(OPTIONS) as (keyof typeof OPTIONS)[];
  const textKeys = Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[];
  const header = ["回答ID", "受付日時UTC", "どうだった", "また遊びたい", "年齢", "月齢", ...choiceKeys.map(k => LABELS[k]), ...textKeys.map(k => TEXT_LABELS[k])];
  return "\uFEFF" + [header, ...rows.map(({ created_at, response: r }) => [r.id, created_at, r.child.fun === null ? "" : CHILD_LABELS.fun[r.child.fun], r.child.again === null ? "" : CHILD_LABELS.again[r.child.again], r.parent.age, r.parent.months, ...choiceKeys.map(k => Array.isArray(r.parent[k]) ? (r.parent[k] as string[]).join(" / ") : r.parent[k]), ...textKeys.map(k => r.parent[k])])].map(row => row.map(csvCell).join(",")).join("\r\n");
}

/** 実験回答を含めず、同意済みの謝辞・お礼用情報だけを管理者向けCSVにする。 */
export function contactCsv(rows: SurveyRow[]): string {
  const header = ["謝辞掲載名", "謝辞掲載への同意", "結果・お礼メール送付先", "メール送付への同意", "メール内のお子さまの呼び名", "同意した対象大会", "体験の様子の提供に関する連絡への同意", "体験の様子の提供に関する連絡先"];
  const records = rows.flatMap(row => {
    const c = validateContact(row.response.contact);
    if (!c || (!c.publishConsent && !c.mailConsent && !c.experienceContactConsent)) return [];
    return [[c.acknowledgmentName, c.publishConsent ? "同意あり" : "", c.email, c.mailConsent ? "同意あり" : "", c.mailConsent ? c.childName || "お子さま" : "", (c.publishConsent || c.mailConsent) ? contactScopeLabel(c) : "", c.experienceContactConsent ? "同意あり" : "", c.experienceContactConsent ? c.experienceEmail : ""]];
  });
  return "\uFEFF" + [header, ...records].map(row => row.map(csvCell).join(",")).join("\r\n");
}
