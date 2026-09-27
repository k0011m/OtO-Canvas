import { describe, expect, it } from "vitest";
import { contactCsv, emptyContact, emptySurvey, surveyCsv, validateSurvey } from "../src/survey/model";
import { authorized } from "../functions/api/survey";

describe("survey model and authentication", () => {
  it("keeps skipped answers distinct from negative answers and strips extra data", () => {
    const answer = emptySurvey(); answer.child.again = 2;
    expect(validateSurvey({ ...answer, email: "not-kept", child: { ...answer.child, name: "not-kept" } })).toEqual(answer);
  });
  it("rejects invalid consent, choices, ages, lengths and contradictory help", () => {
    const answer = emptySurvey();
    expect(validateSurvey({ ...answer, consent: false })).toBeNull();
    expect(validateSurvey({ ...answer, child: { fun: 4, again: null } })).toBeNull();
    expect(validateSurvey({ ...answer, parent: { ...answer.parent, age: -1 } })).toBeNull();
    expect(validateSurvey({ ...answer, parent: { ...answer.parent, device: "unknown" } })).toBeNull();
    expect(validateSurvey({ ...answer, parent: { ...answer.parent, feedback: "a".repeat(1001) } })).toBeNull();
    expect(validateSurvey({ ...answer, parent: { ...answer.parent, help: ["手助け不要", "再生"] } })).toBeNull();
  });
  it("neutralizes spreadsheet formula injection without losing Japanese or newlines", () => {
    const answer = emptySurvey(); answer.parent.feedback = '=HYPERLINK("bad")\n感想';
    const csv = surveyCsv([{ seq: 1, created_at: "2026-09-26T00:00:00Z", response: answer }]);
    expect(csv.startsWith("\uFEFF")).toBe(true); expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain("感想");
  });
  it("accepts play habits, exports both arrays separately and preserves older answers", () => {
    const answer = emptySurvey(); answer.parent.usualPlay = ["外遊び・運動", "お絵描き・工作"]; answer.parent.screenTime = "30分未満"; answer.parent.help = ["再生"];
    expect(validateSurvey(answer)).toEqual(answer);
    const csv = surveyCsv([{ seq: 1, created_at: "2026-09-27", response: answer }]);
    expect(csv).toContain("外遊び・運動 / お絵描き・工作"); expect(csv).toContain('"再生"'); expect(csv).toContain("30分未満");
    const legacy = structuredClone(answer) as any; delete legacy.parent.usualPlay; delete legacy.parent.screenTime;
    expect(validateSurvey(legacy)?.parent.usualPlay).toEqual([]); expect(validateSurvey(legacy)?.parent.screenTime).toBe("");
    expect(validateSurvey({ ...answer, parent: { ...answer.parent, usualPlay: ["不正な選択"] } })).toBeNull();
    expect(validateSurvey({ ...answer, parent: { ...answer.parent, usualPlay: ["外遊び・運動", "外遊び・運動"] } })).toBeNull();
    expect(validateSurvey({ ...answer, parent: { ...answer.parent, screenTime: "不正な選択" } })).toBeNull();
  });
  it("keeps optional contact consent separate from experiment exports", () => {
    const answer = emptySurvey();
    answer.contact = { acknowledgmentName: "=謝辞テスト", publishConsent: true, email: "parent@example.test", mailConsent: true, childName: "" };
    expect(validateSurvey(answer)).toEqual(answer);
    const rows = [{ seq: 1, created_at: "2026-09-27", response: answer }];
    expect(surveyCsv(rows)).not.toContain("parent@example.test"); expect(surveyCsv(rows)).not.toContain("謝辞テスト");
    expect(contactCsv(rows)).toContain("parent@example.test"); expect(contactCsv(rows)).toContain("お子さま"); expect(contactCsv(rows)).toContain("'=謝辞テスト");
    expect(contactCsv(rows)).toContain("テック甲子園のみ（旧同意）");
    const expanded = { ...answer, contact: { ...answer.contact, competitionScope: "tech-koshien-and-future" as const } };
    expect(validateSurvey(expanded)?.contact?.competitionScope).toBe("tech-koshien-and-future");
    expect(contactCsv([{ ...rows[0], response: expanded }])).toContain("テック甲子園や今後出場する大会");
    expect(validateSurvey({ ...answer, contact: { ...answer.contact, competitionScope: "invalid" } })).toBeNull();
    expect(contactCsv(rows)).not.toContain(answer.id); expect(contactCsv(rows)).not.toContain("年齢");
    expect(validateSurvey({ ...answer, contact: undefined })?.contact).toEqual(emptyContact());
    expect(validateSurvey({ ...answer, contact: { ...answer.contact, publishConsent: false } })).toBeNull();
    expect(validateSurvey({ ...answer, contact: { ...answer.contact, mailConsent: false } })).toBeNull();
    expect(validateSurvey({ ...answer, contact: { ...answer.contact, email: "bad" } })).toBeNull();
    expect(validateSurvey({ ...answer, contact: { ...answer.contact, childName: "a\nBcc:bad" } })).toBeNull();
    expect(validateSurvey({ ...answer, contact: { ...emptyContact(), childName: "呼び名" } })).toBeNull();
    expect(validateSurvey({ ...answer, contact: { ...emptyContact(), acknowledgmentName: "ニックネーム", publishConsent: true } })).not.toBeNull();
    expect(validateSurvey({ ...answer, contact: { ...emptyContact(), email: "parent@example.test", mailConsent: true } })).not.toBeNull();
  });
  it("requires separate consent for experience contact and excludes it from analysis", () => {
    const answer = emptySurvey();
    answer.contact = { ...emptyContact(), experienceContactConsent: true, experienceEmail: " experience@example.test " };
    expect(validateSurvey(answer)?.contact?.experienceEmail).toBe("experience@example.test");
    const rows = [{ seq: 1, created_at: "2026-09-27", response: answer }];
    expect(contactCsv(rows)).toContain("experience@example.test");
    expect(surveyCsv(rows)).not.toContain("experience@example.test");
    for (const patch of [{ experienceContactConsent: false }, { experienceEmail: "" }, { experienceEmail: "bad" }, { experienceEmail: "a\n@example.test" }, { experienceContactConsent: null }, { experienceEmail: null }]) {
      expect(validateSurvey({ ...answer, contact: { ...answer.contact, ...patch } })).toBeNull();
    }
    expect(validateSurvey(emptySurvey())?.contact?.experienceContactConsent).toBeUndefined();
  });
  it("denies unauthenticated and unconfigured access", async () => {
    const secret = "local-test-only-survey-key-123456";
    const hash = "8df43525bcca6f5882fabf9631756233ce97b76672e33cc2ec1c48428b94c4aa";
    expect(await authorized(new Request("https://example.test"), hash)).toBe(false);
    expect(await authorized(new Request("https://example.test", { headers: { Authorization: `Bearer ${secret}` } }), hash)).toBe(true);
    expect(await authorized(new Request("https://example.test", { headers: { Authorization: "Bearer wrong" } }), hash)).toBe(false);
    expect(await authorized(new Request("https://example.test"))).toBe(false);
    expect(await authorized(new Request("https://example.test", { headers: { Authorization: 'Bearer ' + hash } }), hash)).toBe(false);
    expect(await authorized(new Request("https://example.test", { headers: { Authorization: 'Bearer ' + secret } }), secret)).toBe(false);
    expect(await authorized(new Request("https://example.test", { headers: { Authorization: 'Bearer ' + secret } }), 'invalid')).toBe(false);
  });
});
