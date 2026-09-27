import { contactScopeLabel, emptyContact, type SurveyContact } from "./model";

/** 保護者が掲載・連絡それぞれを選べるように、任意情報を回答の最後にまとめる。 */
export function ContactFields({ value, onChange }: { value?: SurveyContact; onChange: (value: SurveyContact) => void }) {
  const c = value ?? emptyContact();
  return <section className="survey-contact"><h2>最後に、ご希望の方だけ</h2>
    <p>OtO-Canvasはテック甲子園への出場を予定しており、今後ほかの大会にも出場する可能性があります。ご協力への感謝をお伝えするため、以下はすべて任意でお伺いします。空欄のままでもアンケートを送信できます。</p>
    <p>ここで入力する情報は実験の分析には使いません。Cloudflareに保存し、開発者が謝辞への掲載と、大会結果・お礼のご連絡のためだけに使います。メールアドレスとお子さまの呼び名は公開しません。</p>
    <fieldset><legend>謝辞へのお名前の掲載（任意）</legend>
      <label className="survey-consent"><input type="checkbox" checked={c.publishConsent} onChange={e => onChange({ ...c, publishConsent: e.target.checked, acknowledgmentName: e.target.checked ? c.acknowledgmentName : "" })} />テック甲子園や今後出場する大会の発表・提出資料の謝辞に、入力した名前を掲載してよい</label>
      <p>掲載した名前は資料の閲覧者に公開されます。ニックネームで構いません。本名も使用できます。掲載を希望しない場合はチェックを入れないでください。</p>
      {c.publishConsent && <label className="survey-text-field">謝辞に載せるお名前（ニックネーム・本名どちらも可）<input type="text" maxLength={80} required value={c.acknowledgmentName} onChange={e => onChange({ ...c, acknowledgmentName: e.target.value })} autoComplete="off" /></label>}
    </fieldset>
    <fieldset><legend>大会結果とお礼のメール（任意）</legend>
      <label className="survey-consent"><input type="checkbox" checked={c.mailConsent} onChange={e => onChange({ ...c, mailConsent: e.target.checked, email: e.target.checked ? c.email : "", childName: e.target.checked ? c.childName : "" })} />開発者本人から、テック甲子園や今後出場する大会の結果と感謝のメールを受け取りたい</label>
      <p>実験の分析や広告配信には使いません。メールは開発者が個別にお送りします。</p>
      {c.mailConsent && <><label className="survey-text-field">保護者のメールアドレス<input type="email" maxLength={254} required value={c.email} onChange={e => onChange({ ...c, email: e.target.value })} autoComplete="off" /></label>
      <label className="survey-text-field">お礼メールで使うお子さまの呼び名（任意）<input type="text" maxLength={80} value={c.childName} onChange={e => onChange({ ...c, childName: e.target.value })} autoComplete="off" /></label><p>ニックネームでも構いません。空欄の場合は「お子さま」とお呼びします。この呼び名は謝辞には載せません。</p></>}
    </fieldset>
  </section>;
}

/** 送信前に公開される名前と非公開の送付先を区別して確認する。 */
export function ContactReview({ value }: { value?: SurveyContact }) {
  const c = value ?? emptyContact();
  return <section className="survey-contact"><h2>謝辞・お礼のご希望</h2><dl>
    {(c.publishConsent || c.mailConsent) && <><dt>同意した対象大会</dt><dd>{contactScopeLabel(c)}</dd></>}
    <dt>謝辞に公開するお名前</dt><dd>{c.publishConsent ? c.acknowledgmentName : "掲載を希望しない"}</dd>
    <dt>大会結果・お礼メールの送付先（非公開）</dt><dd>{c.mailConsent ? c.email : "メールを希望しない"}</dd>
    {c.mailConsent && <><dt>メールでのお子さまの呼び名（非公開）</dt><dd>{c.childName || "お子さま"}</dd></>}
  </dl></section>;
}
