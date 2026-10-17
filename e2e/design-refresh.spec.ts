import { expect, test, type Page } from "@playwright/test";

/** 端末のカメラは起動せず、写真ボタンの表示設定だけを有効にする。 */
async function openDesign(page: Page) {
  await page.addInitScript(() => localStorage.setItem("otocanvas.camera.v1", "on"));
  await page.goto("/");
  await page.getByTestId("start-button").click();
}

for (const [width, height] of [[1440, 900], [390, 844], [740, 390]]) {
  test(`design flow ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await openDesign(page);
    await expect(page.getByTestId("world-soft")).toContainText("おもちゃ");
    await expect(page.getByTestId("world-bounce")).toContainText("がっき");
    await expect(page.getByTestId("world-space")).toContainText("うちゅう");
    await page.waitForTimeout(700);
    await page.screenshot({ path: info.outputPath("worlds.png") });
    await page.getByTestId("world-bounce").click();
    await expect(page.getByTestId("world-bounce")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("canvas-editor")).toHaveCount(0);
    await page.waitForTimeout(750);
    await page.screenshot({ path: info.outputPath("world-selected.png") });
    await page.getByTestId("world-bounce").click();
    const editor = page.getByTestId("canvas-editor");
    await expect(editor).toBeVisible();
    await page.waitForTimeout(600);
    const canvas = editor.locator("canvas");
    await page.screenshot({ path: info.outputPath("editor-closed.png") });
    const closedHeight = await page.locator(".editor-palette--left").evaluate((element) => element.getBoundingClientRect().height);
    await page.getByTestId("tools-toggle").click();
    await page.waitForTimeout(650);
    await expect(page.getByTestId("tool-star")).toBeVisible();
    expect(await page.locator(".editor-palette--left").evaluate((element) => element.getBoundingClientRect().height)).toBe(closedHeight);
    const left = await page.locator(".editor-palette--left").boundingBox();
    const right = await page.getByTestId("colors-toggle").boundingBox();
    expect(right!.x).toBe(left!.x);
    expect(right!.y + right!.height).toBeLessThanOrEqual(left!.y);
    await expect(page.locator(".shape-count")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("shape-palette.png") });
    await page.getByTestId("tool-star").click();
    await canvas.click({ position: { x: width * .36, y: height * .45 } });
    await page.getByTestId("colors-toggle").click();
    await expect(page.getByTestId("tools-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("color-ocean").click();
    await page.waitForTimeout(650);
    await page.screenshot({ path: info.outputPath("color-palette.png") });
    await page.getByTestId("tools-toggle").click();
    await expect(page.getByTestId("colors-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("tool-circle").click();
    await canvas.click({ position: { x: width * .65, y: height * .47 } });
    await page.getByTestId("tools-toggle").click();
    await page.getByRole("button", { name: "このシーンを全部消す" }).click();
    await expect(page.getByRole("dialog", { name: "ぜんぶ けす？" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("clear-confirm.png") });
    await page.getByRole("button", { name: "やめる", exact: true }).click();
    await expect(page.getByRole("button", { name: "場面と編集の設定", exact: true })).toHaveCount(0);
    await page.getByTestId("play-button").click();
    await page.getByTestId("play-scene-plan").click();
    await expect(page.getByTestId("pause-button")).toBeVisible();
    await page.evaluate(async () => {
      const path = "/src/music/audioEngine.ts";
      (await import(path)).audioEngine.finishNaturally();
    });
    await expect(page.locator("#finish-title")).toHaveText(/^(?:やった！|わーい！|すてき！|いいね！|できた！|すごい！|ばっちり！|きらり！|やったー！|ばんざい！|さいこう！|いいおと！|たのしい！|わくわく！|できたね！|やったね！|うきうき！)$/);
    await expect(page.locator(".climax-snapshot")).toHaveAttribute("data-shape-count", "2");
    const beat = Number(await page.locator(".climax-snapshot").getAttribute("data-beat"));
    expect(beat).toBeGreaterThanOrEqual(32); expect(beat).toBeLessThan(40);
    await expect(page.getByRole("button", { name: "しゃしんを とる", exact: true })).toBeVisible();
    await expect(page.getByText("ほぞん・そのほか", { exact: true })).toHaveCount(0);
    await page.waitForTimeout(650);
    await page.screenshot({ path: info.outputPath("finish.png"), fullPage: true });
    await page.getByRole("button", { name: "ホームへ", exact: true }).click();
    await expect(page.getByTestId("start-button")).toBeVisible();
    await page.getByRole("button", { name: "つづきから" }).click();
    await expect(canvas).toBeVisible();
    await page.getByRole("button", { name: "このシーンを全部消す" }).click();
    await page.getByRole("button", { name: "けす", exact: true }).click();
    await expect(page.getByRole("button", { name: "このシーンを全部消す" })).toBeDisabled();
    await page.getByRole("button", { name: "ひとつ戻す" }).click();
    await expect(page.getByRole("button", { name: "このシーンを全部消す" })).toBeEnabled();
  });
}

// とても狭い画面でも戻す・再生を隠さず、左上と操作通知で作品を覆わない。
test("narrow toolbar preserves primary actions without popups", async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 700 });
  await openDesign(page);
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("world-bounce").click();
  await expect(page.getByRole("button", { name: "ひとつ戻す" })).toBeVisible();
  await expect(page.getByTestId("play-button")).toBeVisible();
  await expect(page.getByRole("button", { name: "ホームへ", exact: true })).toBeVisible();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 30, y: 25 } });
  await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "1");
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "場面と編集の設定", exact: true })).toHaveCount(0);
});
