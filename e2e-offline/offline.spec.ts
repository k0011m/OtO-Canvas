import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ request }) => { await request.post("/_test/state", { data: { revision: 0, fail: false } }); });

// 既に開けなくなった端末でも、画面の更新ボタンを押さずに障害版から復旧する。
test("recovers from redirected cached HTML without deleting user data", async ({ page, context, request }) => {
  await request.post("/_test/state", { data: { revision: -1, fail: false } });
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.setItem("recovery-marker", "keep");
    await navigator.serviceWorker.ready;
  });
  await expect(page.reload()).rejects.toThrow(/ERR_FAILED/);
  await request.post("/_test/state", { data: { revision: 0, fail: false } });
  const oldWorker = context.serviceWorkers()[0];
  await oldWorker.evaluate(async () => {
    const worker = self as unknown as { registration: ServiceWorkerRegistration };
    await worker.registration.update();
  });
  await expect.poll(async () => {
    try { await page.goto("/"); return await page.getByTestId("start-button").isVisible(); }
    catch { return false; }
  }).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("recovery-marker"))).toBe("keep");
  expect(await page.evaluate(async () => (await (await caches.open("oto-canvas-shell-broken-redirect")).match(new URL("index.html", location.href).href))?.redirected)).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("start-button")).toBeVisible();
});

// 初回に一部ファイルを取得できない場合は準備完了を出さず、再確認で復旧する。
test("first install failure can be retried", async ({ page, request }) => {
  await request.post("/_test/state", { data: { revision: 0, fail: true } });
  await page.goto("/");
  await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
  await expect(page.getByTestId("offline-status")).toContainText("完了していません");
  await request.post("/_test/state", { data: { revision: 0, fail: false } });
  await page.getByRole("button", { name: "準備・更新を再確認" }).click();
  await expect(page.getByTestId("offline-status")).toHaveText("オフライン準備完了");
});

// 初回訪問1回だけで必要な全データが揃い、別タブで再起動しても音源と作品を扱える。
test("cold offline launch, sound program, file export and cache cleanup", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
  await expect(page.getByTestId("offline-status")).toHaveText("オフライン準備完了");
  await page.getByRole("radio", { name: /プログラミングであそぶ/ }).check();
  await context.setOffline(true);
  await page.close();
  page = await context.newPage();
  await page.goto("/?offline=1");
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-soft").click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 500, y: 350 } });
  await page.getByTestId("sound-program").click();
  await page.getByRole("button", { name: "高いド", exact: true }).click();
  await page.getByRole("button", { name: "じゅんばんに たす" }).click();
  await page.getByRole("button", { name: "できた", exact: true }).click();
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: "作品を書き出す", exact: true }).click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.project.shapes[0].soundNote).toBe(7);
  expect(data.project.sceneSoundPrograms[0]).toEqual([data.project.shapes[0].id]);
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: /WAV/ }).click();
  const wav = await readFile((await (await download).path())!);
  expect(wav.subarray(0, 4).toString()).toBe("RIFF");
  expect(wav.subarray(44).some((value) => value !== 0)).toBe(true);
  await page.getByLabel("作品ファイル").setInputFiles((await file.path())!);
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "整理する", exact: true }).click();
  await page.getByRole("button", { name: "つづきから" }).click();
  await page.getByTestId("play-button").click();
  await expect(page.locator(".sound-program-playing")).toContainText("高いド");
  await expect(page.getByTestId("pause-button")).toBeVisible();
});

// 更新ファイルが欠けたときは旧版を残し、復旧した完全な版だけ親の操作で適用する。
test("interrupted update retains offline shell and complete update is opt-in", async ({ page, context, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
  await expect(page.getByTestId("offline-status")).toHaveText("オフライン準備完了");
  await request.post("/_test/state", { data: { revision: 1, fail: true } });
  await page.getByRole("button", { name: "準備・更新を再確認" }).click();
  await expect.poll(async () => (await (await request.get("/_test/state")).json()).failures).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "作品を保存して更新", exact: true })).toHaveCount(0);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
  await expect(page.getByTestId("offline-status")).toHaveText("オフライン準備完了");
  await context.setOffline(false);
  await request.post("/_test/state", { data: { revision: 2, fail: false } });
  await page.getByRole("button", { name: "準備・更新を再確認" }).click();
  await expect(page.getByRole("button", { name: "作品を保存して更新", exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "作品を保存して更新", exact: true }).click();
  await expect(page.getByTestId("start-button")).toBeVisible();
  await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
  await expect(page.getByTestId("offline-status")).toHaveText("オフライン準備完了");
  await expect(page.getByRole("button", { name: "作品を保存して更新", exact: true })).toHaveCount(0);
});
