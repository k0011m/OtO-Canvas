import { expect, test, type Page } from "@playwright/test";

/** 自動保存された作品を読み、設定変更によるデータ欠落がないか比較する。 */
async function savedProject(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/storage/projectStore.ts";
    return (await import(path)).loadLatestProject();
  });
}

for (const [width, height] of [[390, 844], [667, 375]]) {
  // 親の選択が再読み込み後も続き、かんたん操作から直接再生できることを確かめる。
  test(`parent settings persist and simplify at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
    await page.getByRole("radio", { name: /図形と色であそぶ/ }).check();
    await expect(page.getByText("このブラウザに設定を保存しました。", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("parent-settings.png") });
    await page.reload();
    await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
    await expect(page.getByRole("radio", { name: /図形と色であそぶ/ })).toBeChecked();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByTestId("start-button").click();
    await page.getByTestId("world-space").click();
    await expect(page.getByTestId("scene-motion")).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    const canvas = page.getByTestId("canvas-editor").locator("canvas");
    await canvas.click({ position: { x: width * .55, y: height * .5 } });
    await page.getByTestId("tools-toggle").click();
    await expect(page.getByRole("button", { name: "形を大きくする" })).toHaveCount(0);
    await expect(page.getByTestId("rotate-left")).toHaveCount(0);
    await page.getByTestId("color-sun").click();
    await page.getByRole("button", { name: "図形ツールをしまう", exact: true }).first().click();
    await expect.poll(async () => (await savedProject(page))?.shapes.length).toBe(1);
    const original = (await savedProject(page)).shapes[0];
    await canvas.focus();
    await canvas.press("r");
    await canvas.press("+");
    await canvas.hover();
    await page.mouse.wheel(0, -100);
    await canvas.press("ArrowRight");
    await expect.poll(async () => (await savedProject(page))?.shapes[0].position.x).toBeGreaterThan(original.position.x);
    const saved = await savedProject(page);
    expect(saved.sceneCount).toBe(1);
    expect(saved.shapes[0].rotation).toBe(original.rotation);
    expect(saved.shapes[0].size).toBe(original.size);
    await page.getByTestId("play-button").click();
    await expect(page.getByTestId("pause-button")).toBeVisible();
    await expect(page.locator(".mood-dialog")).toHaveCount(0);
  });
}

// 道具を隠しても、作品に保存した場面と振り付けは変更しない。
test("mode changes preserve existing scene plan", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-space").click();
  await page.getByRole("tab").nth(2).click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 550, y: 350 } });
  await page.getByTestId("scene-motion").click();
  await page.getByTestId("mood-wave").click();
  await expect.poll(async () => (await savedProject(page))?.sceneMoods?.[2]).toBe("wave");
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  await page.getByRole("radio", { name: /図形と色であそぶ/ }).check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByTestId("scene-motion")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  await page.getByRole("radio", { name: /動きも編集する/ }).check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.getByRole("tab").nth(2).click();
  await expect(page.getByTestId("scene-motion")).toContainText("なみなみ");
  await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "1");
});

// 保存禁止のブラウザでも操作を続けられ、永続化に失敗したことを親へ伝える。
test("blocked settings storage gives honest feedback", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("blocked", "SecurityError"); };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
  await page.getByRole("radio", { name: /図形と色であそぶ/ }).check();
  await expect(page.getByText("設定を保存できませんでした。今開いている間だけ適用します。", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: /図形と色であそぶ/ })).toBeChecked();
});
