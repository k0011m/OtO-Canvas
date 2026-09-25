import { expect, test } from "@playwright/test";

for (const [width, height] of [[320, 568], [390, 844], [667, 375], [844, 390]]) {
  // 保存作品が増えても横へはみ出さず、縦スクロールで末尾を開けることを確認する。
  test(`gallery scrolls vertically at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.evaluate(async () => {
      const arrangerPath = "/src/music/arranger.ts";
      const storePath = "/src/storage/projectStore.ts";
      const { createProject } = await import(arrangerPath);
      const { saveProject } = await import(storePath);
      for (let index = 0; index < 8; index += 1) {
        await saveProject(createProject([], index, "soft", {
          id: `mobile-gallery-${index}`,
          title: `作品${index} ${"ながいなまえ".repeat(12)}`,
        }));
      }
    });
    await page.getByRole("button", { name: "さくひんだな", exact: true }).click();
    const shelf = page.locator(".gallery-screen");
    const cards = page.locator(".project-card");
    await expect(cards).toHaveCount(8);
    const dimensions = await shelf.evaluate((element) => ({
      width: element.clientWidth, scrollWidth: element.scrollWidth,
      height: element.clientHeight, scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
    if (width < height) {
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(second!.x).toBe(first!.x);
      expect(second!.y).toBeGreaterThan(first!.y + first!.height);
    }
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.last()).toBeInViewport();
    expect(await shelf.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath("gallery-bottom.png") });
    await cards.last().locator(".project-open").click();
    await expect(page.getByTestId("canvas-editor")).toBeVisible();
    // 開いた後の回転でもキャンバスが新しい表示領域へ追従する。
    await page.setViewportSize({ width: height, height: width });
    await expect.poll(() => page.getByTestId("canvas-editor").locator("canvas").boundingBox())
      .toEqual({ x: 0, y: 0, width: height, height: width });
  });
}
