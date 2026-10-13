import { expect, test } from "@playwright/test";

test("編集と保存では作曲せず、再生準備の中止と再試行ができる", async ({ page }, info) => {
  let workers = 0;
  page.on("worker", () => { workers += 1; });
  await page.route("**/src/music/preparePerformance.worker.ts*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("app-version")).toHaveText("ver 0.2.0");
  await page.screenshot({ path: info.outputPath("home-version.png") });
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 240, y: 310 } });
  await expect.poll(() => page.evaluate(async () => {
    const path = "/src/storage/projectStore.ts";
    const project = await (await import(path)).loadLatestProject();
    return { count: project?.shapes.length, events: project?.events };
  })).toEqual({ count: 1, events: [] });
  expect(workers).toBe(0);
  await page.getByTestId("play-button").click();
  await page.getByTestId("mood-pop").click();
  const preparing = page.getByRole("dialog", { name: "再生の準備" });
  await expect(preparing).toBeVisible();
  await page.screenshot({ path: info.outputPath("preparing.png") });
  await preparing.getByRole("button", { name: "もどる" }).click();
  await expect(preparing).toBeHidden();
  await page.waitForTimeout(1400);
  await expect(page.getByTestId("canvas-editor")).toBeVisible();
  await expect(page.getByTestId("pause-button")).toHaveCount(0);
  await page.getByTestId("play-button").click();
  await page.getByTestId("mood-pop").click();
  await expect(preparing).toBeVisible();
  await expect(page.getByTestId("pause-button")).toBeVisible();
  await expect(preparing).toBeHidden();
  // 読み込み前に中止したWorkerはブラウザの生成通知に現れない場合がある。
  expect(workers).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(async () => {
    const path = "/src/music/audioEngine.ts";
    return (await import(path)).audioEngine.events.some((event: { id: string }) => event.id.startsWith("part-"));
  })).toBe(true);
});
