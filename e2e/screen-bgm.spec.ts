import { expect, test, type Page } from "@playwright/test";

// 実ブラウザの音声クロックを読み、画面遷移による停止やループを検証する。
async function playback(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/music/audioEngine.ts";
    const { audioEngine } = await import(modulePath);
    return audioEngine.getSnapshot();
  });
}

// 初回操作後のBGMと作品再生が、同じ音声エンジンで正しく切り替わることを確認する。
test("screen BGM loops, survives editing and yields to the performance", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto("/");
  expect((await playback(page)).playing).toBe(false);
  await page.getByTestId("start-button").click();
  await expect.poll(async () => (await playback(page)).playing).toBe(true);
  // 30秒を実際に経過させ、末尾で停止せず先頭へ戻ることを確認する。
  await expect.poll(async () => (await playback(page)).beat, { timeout: 32_000 }).toBeGreaterThan(46);
  await expect.poll(async () => (await playback(page)).beat).toBeLessThan(4);
  expect((await playback(page)).playing).toBe(true);

  await page.getByTestId("world-bounce").click();
  const editor = page.getByTestId("canvas-editor").locator("canvas");
  await editor.click({ position: { x: 150, y: 180 } });
  expect((await playback(page)).playing).toBe(true);
  await page.getByTestId("play-button").click();
  expect((await playback(page)).playing).toBe(true);
  await page.getByTestId("mood-pop").click();
  await expect(page.getByTestId("pause-button")).toBeVisible();
  await expect.poll(async () => (await playback(page)).playing).toBe(true);
  await page.getByTestId("pause-button").click();
  expect((await playback(page)).playing).toBe(false);
  await page.getByRole("button", { name: "編集へ戻る" }).click();
  await expect.poll(async () => (await playback(page)).playing).toBe(true);

  // タブを隠したときと戻したときの通知を再現する。
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await playback(page)).playing).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await playback(page)).playing).toBe(true);
});

// 作品棚から直接入った場合にも音声を有効にし、新規作成でBGMを止めない。
test("gallery entry unlocks BGM and keeps it on new project", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "さくひんだな", exact: true }).click();
  await expect.poll(async () => (await playback(page)).playing).toBe(true);
  await page.getByRole("button", { name: "＋ あたらしく" }).click();
  await expect(page.getByTestId("world-soft")).toBeVisible();
  expect((await playback(page)).playing).toBe(true);
});
