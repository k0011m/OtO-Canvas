import { useEffect, useRef, useState } from "react";
import { CHILD_LABELS, contactCsv, emptyContact, emptySurvey, LABELS, OPTIONS, surveyCsv, TEXT_LABELS, validateSurvey, type SurveyAnswer, type SurveyRow } from "./model";
import { downloadFile } from "../export/projectFile";
import "./survey.css";
import { SurveyResponseManager } from "./SurveyResponseManager";
import { ContactFields, ContactReview } from "./SurveyContact";

const DRAFT = "otocanvas.survey.pending.v1";
/** 送信に失敗した回答だけを同じタブで復元する。壊れた記録は利用しない。 */
function draft(): SurveyAnswer | null { try { return validateSurvey(JSON.parse(sessionStorage.getItem(DRAFT) ?? "null")); } catch { return null; } }
/** 同じ大きさと色の顔で、選択肢の意味を口元から見分けられるようにする。 */
function Face({ mood }: { mood: number }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="#ffe6ad" stroke="#403b38" strokeWidth="3" /><circle cx="34" cy="40" r="4" fill="#403b38" /><circle cx="66" cy="40" r="4" fill="#403b38" /><path d={mood === 0 ? "M28 58 Q50 85 72 58" : mood === 1 ? "M30 65 H70" : "M28 73 Q50 48 72 73"} fill="none" stroke="#403b38" strokeWidth="4" strokeLinecap="round" /></svg>;
}
/** 子どもへの質問を自動再生せず、読み上げボタンを押した場合だけ話す。 */
function readQuestion(text: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel(); const voice = new SpeechSynthesisUtterance(text); voice.lang = "ja-JP"; voice.rate = .8; speechSynthesis.speak(voice);
}
/** 集計では回答済みを分母とし、未回答の人数を別に示す。 */
function Chart({ title, labels, values }: { title: string; labels: readonly string[]; values: (string | null)[] }) {
  const valid = values.filter(v => v != null && v !== "");
  return <section className="survey-chart"><h3>{title}</h3><p>回答 {valid.length}件／未回答 {values.length - valid.length}件</p>{labels.map(label => {
    const count = valid.filter(v => v === label).length;
    return <div className="survey-bar" key={label}><span>{label}</span><meter min={0} max={Math.max(1, valid.length)} value={count} /><b>{count}件 {valid.length ? `(${Math.round(count / valid.length * 100)}%)` : ""}</b></div>;
  })}</section>;
}
/** 管理キーはメモリ内だけで保持し、認証済みAPIから全ページを取得して集計する。 */
function SurveyAdmin() {
  const [key, setKey] = useState(""); const [rows, setRows] = useState<SurveyRow[] | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [age, setAge] = useState("all"); const [mode, setMode] = useState("");
  /** ページ取得失敗時は部分集計を表示せず、全件取得のやり直しを促す。 */
  async function load() {
    setBusy(true); setMessage(""); setRows(null);
    try {
      const collected: SurveyRow[] = []; let cursor = 0;
      do {
        const response = await fetch(`/api/survey/admin?cursor=${cursor}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "取得できませんでした。");
        collected.push(...data.rows); if (data.next === null) break;
        if (!Number.isSafeInteger(data.next) || data.next <= cursor) throw new Error("取得位置を確認できませんでした。");
        cursor = data.next;
      } while (true);
      setRows(collected);
    } catch (e) { setMessage(e instanceof Error ? e.message : "集計を取得できませんでした。"); }
    finally { setBusy(false); }
  }
  const filtered = (rows ?? []).filter(r => {
    const n = r.response.parent.age;
    return (!mode || r.response.parent.mode === mode) && (age === "all" || (age === "unknown" ? n === null : n !== null && (age === "3-4" ? n >= 3 && n <= 4 : age === "5-6" ? n >= 5 && n <= 6 : age === "7-8" ? n >= 7 && n <= 8 : n < 3 || n > 8)));
  });
  return <main className="survey-shell"><header className="survey-header"><a href="/">← OtoCanvas</a><span>管理者専用</span></header><article className="survey-paper survey-admin"><h1>体験アンケートの集計</h1>
    <p>回答と自由記述は公開されません。管理キーはこの画面を閉じると消えます。</p>
    <form onSubmit={e => { e.preventDefault(); void load(); }} className="survey-login"><label>管理キー<input type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" required /></label><button disabled={busy}>{busy ? "取得中…" : "集計を表示・更新"}</button></form>
    {message && <p role="alert">{message}</p>}
    {rows && <><div className="survey-filters"><label>年齢<select value={age} onChange={e => setAge(e.target.value)}><option value="all">すべて</option><option>3-4</option><option>5-6</option><option>7-8</option><option value="other">その他の年齢</option><option value="unknown">未回答</option></select></label><label>モード<select value={mode} onChange={e => setMode(e.target.value)}><option value="">すべて</option>{OPTIONS.mode.map(x => <option key={x}>{x}</option>)}</select></label>
    <button onClick={() => downloadFile(new Blob([surveyCsv(filtered)], { type: "text/csv;charset=utf-8" }), "otocanvas-survey.csv")}>絞り込んだ回答をCSV保存</button><button onClick={() => { setRows(null); setKey(""); }}>ログアウト</button></div>
    <p className="survey-total">{filtered.length}組 <small>全{rows.length}組中</small></p><p>任意の連絡先は分析や同じ子どもの再回答の識別には使用しません。「人数」ではなく「回答組数」として扱ってください。</p>
    <SurveyResponseManager adminKey={key} rows={filtered} onTrash={id => setRows(old => old?.filter(r => r.response.id !== id) ?? null)} onRestore={row => setRows(old => old && !old.some(r => r.response.id === row.response.id) ? [...old, row].sort((a, b) => a.seq - b.seq) : old)} />
    <Chart title="子ども：どうだった？" labels={CHILD_LABELS.fun} values={filtered.map(r => r.response.child.fun === null ? null : CHILD_LABELS.fun[r.response.child.fun])} />
    <Chart title="子ども：また遊びたい？" labels={CHILD_LABELS.again} values={filtered.map(r => r.response.child.again === null ? null : CHILD_LABELS.again[r.response.child.again])} />
    {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).filter(k => k !== "help" && k !== "usualPlay").map(k => <Chart key={k} title={LABELS[k]} labels={OPTIONS[k]} values={filtered.map(r => r.response.parent[k] as string)} />)}
    <section className="survey-chart"><h3>手助けが必要だった操作（複数選択）</h3><p>回答 {filtered.filter(r => r.response.parent.help.length).length}組／未回答 {filtered.filter(r => !r.response.parent.help.length).length}組</p>{OPTIONS.help.map(x => <p key={x}>{x}：{filtered.filter(r => r.response.parent.help.includes(x)).length}組</p>)}</section>
    <section className="survey-chart"><h3>{LABELS.usualPlay}</h3><p>回答 {filtered.filter(r => r.response.parent.usualPlay?.length).length}組／未回答 {filtered.filter(r => !r.response.parent.usualPlay?.length).length}組（複数選択）</p>{OPTIONS.usualPlay.map(x => <p key={x}>{x}：{filtered.filter(r => r.response.parent.usualPlay?.includes(x)).length}組</p>)}</section>
    <details className="survey-contact"><summary>謝辞・お礼メール用の情報（分析には使用しない）</summary><p>年齢・モードの絞り込みとは別に、全回答のうち同意した方だけを表示します。メールの送信は自動ではありません。掲載名以外は公開しないでください。</p><button onClick={() => downloadFile(new Blob([contactCsv(rows)], { type: "text/csv;charset=utf-8" }), "otocanvas-thanks-private.csv")}>謝辞・お礼用CSVを保存（個人情報）</button>{rows.filter(r => r.response.contact?.publishConsent || r.response.contact?.mailConsent).map(r => <ContactReview key={r.response.id} value={r.response.contact} />)}</details>
    <h2>自由記述</h2>{filtered.map(r => <details key={r.response.id}><summary>{r.created_at.slice(0, 10)} · {r.response.parent.age ?? "未回答"}歳 · {r.response.id.slice(0, 8)}</summary>{(Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]).map(k => <div key={k}><h3>{TEXT_LABELS[k]}</h3><p className="survey-text">{r.response.parent[k] || "未回答"}</p></div>)}</details>)}
    </>}
  </article></main>;
}
/** 子ども2問から親の任意回答へ進み、確認後にだけオンライン送信する。 */
export function SurveyApp({ admin = false }: { admin?: boolean }) {
  const shell = useRef<HTMLElement>(null);
  const [answer, setAnswer] = useState<SurveyAnswer>(() => draft() ?? emptySurvey());
  const [step, setStep] = useState(() => draft() ? 3 : 0); const [consent, setConsent] = useState(() => !!draft());
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); }, []);
  if (admin) return <SurveyAdmin />;
  /** 戻る操作でも回答を保持し、質問の読み上げだけを止める。 */
  function navigate(next: number) { if ("speechSynthesis" in window) speechSynthesis.cancel(); setStep(next); shell.current?.scrollTo(0, 0); }
  /** 親の項目を変更しても、子ども自身の回答を上書きしない。 */
  function parentValue(key: keyof SurveyAnswer["parent"], value: string | string[] | number | null) { setAnswer(old => ({ ...old, parent: { ...old.parent, [key]: value } })); }
  /** 通信失敗時は同じIDで再送し、成功応答の確認前に完了表示をしない。 */
  async function submit() {
    if (busy || !consent) return;
    if (!validateSurvey(answer)) { setError("謝辞のお名前・メールアドレスと同意内容を確認してください。"); return; }
    setBusy(true); setError("");
    try {
      try { sessionStorage.setItem(DRAFT, JSON.stringify({ ...answer, contact: emptyContact() })); } catch { /* 保存禁止でも、開いている画面の回答は保持する。 */ }
      const response = await fetch("/api/survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answer), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok || data.ok !== true || data.id !== answer.id) throw new Error(data.error ?? "受付を確認できませんでした。");
      try { sessionStorage.removeItem(DRAFT); } catch { /* 送信成功自体は保存領域の状態に依存しない。 */ }
      navigate(5);
    } catch (e) { setError(e instanceof Error && !/fetch|JSON|timeout|abort/i.test(e.message) ? e.message : "送信できませんでした。ネット接続を確認して、もう一度送信してください。回答はこの画面に残っています。"); }
    finally { setBusy(false); }
  }
  const childKey = step === 1 ? "fun" : "again";
  const question = step === 1 ? "これで あそんで、どうだった？" : "また これで あそびたい？";
  return <main ref={shell} className="survey-shell"><header className="survey-header"><a href="/">← OtoCanvas</a><span>たいけんアンケート</span></header><article className="survey-paper">
    {step === 0 && <><span className="survey-eyebrow">おとなの方へ</span><h1>あそんだ感想を<br />きかせてください。</h1><p>子ども用は2問。次に保護者の方へお聞きします。どの答えでも大丈夫です。お子さまの答えをそのまま選び、答えたくないときはスキップしてください。</p>
    <label className="survey-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />保護者として、回答の送信に同意します。</label><button className="survey-primary" disabled={!consent} onClick={() => navigate(1)}>アンケートを はじめる</button></>}
    {(step === 1 || step === 2) && <><span className="survey-eyebrow">こども用 · {step} / 2</span><h1>{question}</h1>{"speechSynthesis" in window && <button className="survey-read" onClick={() => readQuestion(question)}>♪ しつもんを きく</button>}
    <div className="survey-faces" role="group" aria-label={question}>{CHILD_LABELS[childKey].map((label, index) => <button key={label} aria-pressed={answer.child[childKey] === index} onClick={() => setAnswer(old => ({ ...old, child: { ...old.child, [childKey]: index } }))}><Face mood={index} /><span>{label}</span></button>)}</div>
    <div className="survey-actions"><button onClick={() => navigate(step - 1)}>もどる</button><button className="survey-primary" disabled={answer.child[childKey] === null} onClick={() => navigate(step + 1)}>つぎへ →</button></div><button className="survey-skip" onClick={() => { setAnswer(old => ({ ...old, child: { ...old.child, [childKey]: null } })); navigate(step + 1); }}>こたえないで つぎへ</button></>}
    {step === 3 && <><span className="survey-eyebrow">ここからは保護者の方へ</span><h1>見ていた様子を<br />教えてください。</h1><p>すべて任意です。分からない項目は未回答で構いません。</p><form onSubmit={e => { e.preventDefault(); navigate(4); }}>
    <div className="survey-age"><label>年齢（歳）<input type="number" min="0" max="18" value={answer.parent.age ?? ""} onChange={e => parentValue("age", e.target.value === "" ? null : Number(e.target.value))} /></label><label>月齢（か月）<input type="number" min="0" max="11" value={answer.parent.months ?? ""} onChange={e => parentValue("months", e.target.value === "" ? null : Number(e.target.value))} /></label></div>
    {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map(key => <fieldset key={key}><legend>{LABELS[key]}</legend>{key === "screenTime" && <p>最近のふだんの1日を目安に、スマホ・タブレット・パソコン・ゲーム機を使う時間の合計を選んでください。動画・ゲーム・学習を含み、テレビは含めません。</p>}{OPTIONS[key].map(label => <label className="survey-option" key={label}><input type={(key === "help" || key === "usualPlay") ? "checkbox" : "radio"} name={key} checked={(key === "help" || key === "usualPlay") ? answer.parent[key].includes(label) : answer.parent[key] === label} onChange={() => {
      if (key === "usualPlay") { const current = answer.parent.usualPlay; parentValue(key, current.includes(label) ? current.filter(x => x !== label) : [...current, label]); }
      else if (key !== "help") parentValue(key, label);
      else { const current = answer.parent.help; parentValue("help", current.includes(label) ? current.filter(x => x !== label) : label === "手助け不要" ? [label] : [...current.filter(x => x !== "手助け不要"), label]); }
    }} />{label}</label>)}<button type="button" className="survey-clear" onClick={() => parentValue(key, (key === "help" || key === "usualPlay") ? [] : "")}>未回答に戻す</button></fieldset>)}
    {(Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]).map(key => <label className="survey-text-field" key={key}>{TEXT_LABELS[key]}<textarea rows={3} maxLength={1000} value={answer.parent[key]} onChange={e => parentValue(key, e.target.value)} /></label>)}
    <ContactFields value={answer.contact} onChange={contact => setAnswer(old => ({ ...old, contact }))} />
    <div className="survey-actions"><button type="button" onClick={() => navigate(2)}>子どもの回答へ戻る</button><button className="survey-primary">送信前に確認する</button></div></form></>}
    {step === 4 && <><h1>この内容で送信しますか？</h1><p>子どもと保護者の回答を1組として送信します。</p><dl><dt>どうだった？</dt><dd>{answer.child.fun === null ? "未回答" : CHILD_LABELS.fun[answer.child.fun]}</dd><dt>また遊びたい？</dt><dd>{answer.child.again === null ? "未回答" : CHILD_LABELS.again[answer.child.again]}</dd><dt>年齢</dt><dd>{answer.parent.age ?? "未回答"}歳 / {answer.parent.months ?? "未回答"}か月</dd>{(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map(k => <div key={k}><dt>{LABELS[k]}</dt><dd>{((k === "help" || k === "usualPlay") ? answer.parent[k].join("、") : answer.parent[k]) || "未回答"}</dd></div>)}{(Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]).map(k => <div key={k}><dt>{TEXT_LABELS[k]}</dt><dd className="survey-text">{answer.parent[k] || "未回答"}</dd></div>)}</dl>
    <ContactReview value={answer.contact} />
    {error && <p role="alert">{error}</p>}<div className="survey-actions"><button disabled={busy} onClick={() => navigate(3)}>修正する</button><button className="survey-primary" disabled={busy} onClick={() => void submit()}>{busy ? "送信中…" : "同意して送信する"}</button></div></>}
    {step === 5 && <><span className="survey-success" aria-hidden="true">✓</span><h1>ありがとう！</h1><p>回答を受け付けました。ご協力ありがとうございました。</p><p>受付番号：{answer.id.slice(0, 8)}</p><a className="survey-home" href="/">OtoCanvasへ戻る</a><button className="survey-skip" onClick={() => { setAnswer(emptySurvey()); setConsent(false); navigate(0); }}>別のお子さまの回答を始める</button></>}
  </article><footer className="survey-footer">OtoCanvas · 体験の声から、もっと遊びやすく。</footer></main>;
}
