export const SURVEY_VERSION = 1;
export const OPTIONS = {
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
  experience: "スマホ・タブレットの操作経験", device: "今回の端末", mode: "今回のモード", priorUse: "OtoCanvasの利用経験",
  findControls: "操作したい場所を見つけられていましたか？", help: "どの操作で手助けが必要でしたか？（複数選択可）",
  difficulty: "選んだモードの難しさはどうでしたか？", homeUse: "ご家庭でも使わせたいと思いますか？", parentSettings: "親向け設定で必要な機能を選べましたか？",
};
export const TEXT_LABELS = { initiative: "自分で選んだり工夫した場面があれば教えてください。なければ「なし」で構いません。", homeReason: "家庭で使わせたい・使わせたくない理由", settingsReason: "親向け設定で迷った点", feedback: "気になった点、変えてほしい点" };
export const CHILD_LABELS = { fun: ["たのしかった", "ふつう", "たのしくなかった"], again: ["あそびたい", "どっちでもない", "あそびたくない"] };
export type SurveyAnswer = {
  version: 1; id: string; consent: true; child: { fun: number | null; again: number | null };
  parent: { age: number | null; months: number | null; help: string[] } & Record<Exclude<keyof typeof OPTIONS, "help">, string> & Record<keyof typeof TEXT_LABELS, string>;
};
export type SurveyRow = { seq: number; created_at: string; response: SurveyAnswer };
/** 氏名・作品・端末識別子を含めず、親子の回答だけを初期化する。 */
export function emptySurvey(): SurveyAnswer {
  return { version: 1, id: crypto.randomUUID(), consent: true, child: { fun: null, again: null }, parent: {
    age: null, months: null, help: [], experience: "", device: "", mode: "", priorUse: "", findControls: "", difficulty: "", homeUse: "", parentSettings: "", initiative: "", homeReason: "", settingsReason: "", feedback: "",
  } };
}
/** APIと画面で同じ選択肢・長さ制限を使い、未知の情報を保存しない。 */
export function validateSurvey(value: unknown): SurveyAnswer | null {
  if (!value || typeof value !== "object") return null;
  const v = value as SurveyAnswer;
  if (v.version !== 1 || v.consent !== true || !/^[0-9a-f-]{36}$/i.test(v.id ?? "") || !v.child || !v.parent) return null;
  if (![null, 0, 1, 2].includes(v.child.fun) || ![null, 0, 1, 2].includes(v.child.again)) return null;
  const p = v.parent;
  if (p.age !== null && (!Number.isInteger(p.age) || p.age < 0 || p.age > 18)) return null;
  if (p.months !== null && (!Number.isInteger(p.months) || p.months < 0 || p.months > 11)) return null;
  if (!Array.isArray(p.help) || p.help.length > OPTIONS.help.length || new Set(p.help).size !== p.help.length || p.help.some(x => !(OPTIONS.help as readonly string[]).includes(x))) return null;
  if (p.help.includes("手助け不要") && p.help.length > 1) return null;
  for (const key of Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]) {
    if (key !== "help" && p[key] !== "" && !(OPTIONS[key] as readonly string[]).includes(p[key])) return null;
  }
  for (const key of Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]) if (typeof p[key] !== "string" || p[key].length > 1000) return null;
  const clean = emptySurvey(); clean.id = v.id; clean.child = { fun: v.child.fun, again: v.child.again };
  clean.parent.age = p.age; clean.parent.months = p.months; clean.parent.help = [...p.help];
  for (const key of Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]) if (key !== "help") clean.parent[key] = p[key];
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
  return "\uFEFF" + [header, ...rows.map(({ created_at, response: r }) => [r.id, created_at, r.child.fun === null ? "" : CHILD_LABELS.fun[r.child.fun], r.child.again === null ? "" : CHILD_LABELS.again[r.child.again], r.parent.age, r.parent.months, ...choiceKeys.map(k => Array.isArray(r.parent[k]) ? r.parent.help.join(" / ") : r.parent[k]), ...textKeys.map(k => r.parent[k])])].map(row => row.map(csvCell).join(",")).join("\r\n");
}
