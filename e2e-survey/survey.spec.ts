import { test, expect } from "@playwright/test";
import { emptySurvey } from "../src/survey/model";
const adminHeaders = { Authorization: "Bearer local-test-only-survey-key-123456" };

test("D1 validates input, denies anonymous reads, and deduplicates retries", async ({ request }) => {
  const answer = emptySurvey(); answer.parent.feedback = "ローカル自動テスト";
  expect((await request.get("/api/survey/admin")).status()).toBe(401);
  expect((await request.get("/api/survey/admin", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  expect((await request.post("/api/survey", { data: answer, headers: { Origin: "https://foreign.example" } })).status()).toBe(403);
  expect((await request.post("/api/survey", { data: { ...answer, consent: false }, headers: { Origin: "http://127.0.0.1:4187" } })).status()).toBe(400);
  for (let i = 0; i < 2; i++) expect((await request.post("/api/survey", { data: answer, headers: { Origin: "http://127.0.0.1:4187" } })).status()).toBe(200);
  const response = await request.get("/api/survey/admin", { headers: adminHeaders });
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await response.json()).rows.filter((r: any) => r.response.id === answer.id)).toHaveLength(1);
});

test("mobile child and parent survey retries and administrator can export", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?survey=1");
  await expect(page.getByRole("button", { name: "アンケートを はじめる" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "アンケートを はじめる" }).click();
  await page.getByRole("button", { name: "たのしかった", exact: true }).click();
  await page.screenshot({ path: info.outputPath("child-survey.png") });
  await page.getByRole("button", { name: "つぎへ →" }).click();
  await page.getByRole("button", { name: "こたえないで つぎへ" }).click();
  await page.getByLabel("年齢（歳）").fill("5");
  await page.getByRole("radio", { name: "タブレット", exact: true }).check();
  await page.getByRole("radio", { name: "合っている", exact: true }).check();
  await page.getByRole("button", { name: "送信前に確認する" }).click();
  await page.route("**/api/survey", route => route.abort(), { times: 1 });
  await page.getByRole("button", { name: "同意して送信する" }).click();
  await expect(page.getByRole("alert")).toContainText("送信できません");
  await page.getByRole("button", { name: "同意して送信する" }).click();
  await expect(page.getByRole("heading", { name: "ありがとう！" })).toBeVisible();
  await page.goto("/?survey=admin");
  await page.getByLabel("管理キー", { exact: true }).fill("local-test-only-survey-key-123456");
  await page.getByRole("button", { name: "集計を表示・更新" }).click();
  await expect(page.getByRole("heading", { name: "子ども：また遊びたい？" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "絞り込んだ回答をCSV保存" }).click();
  expect((await download).suggestedFilename()).toBe("otocanvas-survey.csv");
  expect(await page.locator(".survey-shell").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("admin-survey.png") });
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.locator(".survey-chart")).toHaveCount(0);
});
