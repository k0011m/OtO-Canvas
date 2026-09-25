import { expect, test } from "@playwright/test";

for (const [width, height] of [[320, 568], [390, 844], [667, 375], [1280, 800]]) {
  // 各画面サイズで画面外への収納と復帰を確認し、図形や再生ボタンが使えることを確かめる。
  test(`drawer stays usable at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByTestId("start-button").click();
    await page.getByTestId("world-soft").click();
    const toggle = page.getByTestId("tools-toggle");
    const drawer = page.locator("#shape-tool-drawer");
    const compact = width <= 760 || height <= 500;
    await expect(toggle).toHaveAttribute("aria-expanded", String(!compact));
    if (!compact) await toggle.click();
    await expect(drawer).toBeHidden();
    expect(await drawer.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(height);
    expect(await drawer.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
    await page.screenshot({ path: info.outputPath("closed.png") });

    await toggle.click();
    await page.getByTestId("tool-star").click();
    await toggle.click();
    await expect(drawer).toBeHidden();
    const canvas = page.getByTestId("canvas-editor").locator("canvas");
    // 上下のUI用余白を廃止し、キャンバスそのものが表示領域全体を占める。
    await expect.poll(() => canvas.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    await canvas.click({ position: { x: width * 0.25, y: height * 0.4 } });
    await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "1");
    // ヘッダーとフッターの透明な余白をクリックしても、背後へ図形を配置できる。
    await canvas.click({ position: { x: width * 0.5, y: 2 } });
    await canvas.click({ position: { x: width * 0.5, y: height - 2 } });
    await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "3");
    await toggle.click();
    await drawer.getByRole("button", { name: "図形ツールをしまう" }).hover();
    await page.screenshot({ path: info.outputPath("open.png") });
    // 見出しのスワイプを実ポインターで再現する。
    const handle = drawer.getByRole("button", { name: "図形ツールをしまう" });
    const bounds = await handle.boundingBox();
    if (!bounds) throw new Error("ツール見出しが表示されていません");
    await page.mouse.move(bounds.x + 30, bounds.y + 20);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 30, bounds.y + 80, { steps: 6 });
    await page.mouse.up();
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator(".selection-controls")).toHaveCount(0);
    await page.getByTestId("play-button").click();
    await page.getByTestId("mood-pop").click();
    await expect(page.getByTestId("pause-button")).toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: "画面を最大化" }).click();
      await page.getByRole("button", { name: "最大化を解除" }).click();
    }
    await page.getByRole("button", { name: "編集へ戻る" }).click();
    await expect(drawer).toBeHidden();
  });
}

for (const native of [true, false]) {
  // 全画面APIの有無にかかわらず、最大化後に元の編集画面へ戻れることを確認する。
  test(`fullscreen toggle with native API=${native}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (!native) {
      await page.addInitScript(() => {
        Object.defineProperty(document.documentElement, "requestFullscreen", { value: undefined });
      });
    }
    await page.goto("/");
    await page.getByTestId("start-button").click();
    await page.getByTestId("world-soft").click();
    await page.getByRole("button", { name: "画面を最大化" }).click();
    await expect(page.locator(".top-bar")).toBeHidden();
    const viewport = await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
    await expect.poll(() => page.getByTestId("canvas-editor").locator("canvas").boundingBox()).toEqual(viewport);
    await expect(page.getByRole("button", { name: "最大化を解除" })).toHaveAttribute("aria-pressed", "true");
    if (native) expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.getByRole("button", { name: "最大化を解除" }).click();
    await expect(page.locator(".top-bar")).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  });
}
