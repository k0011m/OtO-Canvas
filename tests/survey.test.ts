import { describe, expect, it } from "vitest";
import { emptySurvey, surveyCsv, validateSurvey } from "../src/survey/model";
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
  it("denies unauthenticated and unconfigured access", async () => {
    const secret = "local-test-only-survey-key-123456";
    expect(await authorized(new Request("https://example.test"), secret)).toBe(false);
    expect(await authorized(new Request("https://example.test", { headers: { Authorization: `Bearer ${secret}` } }), secret)).toBe(true);
    expect(await authorized(new Request("https://example.test", { headers: { Authorization: "Bearer wrong" } }), secret)).toBe(false);
    expect(await authorized(new Request("https://example.test"))).toBe(false);
  });
});
