import { expect, test } from "@playwright/test";

for (const [width, height] of [[390, 844], [667, 375]]) {
  // スマホ縦横で場面を増減し、図形と振り付けの保存・復元・再生時の切替を検証する。
  test(`scene choreography at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByTestId("start-button").click();
    await page.getByTestId("world-bounce").click();
    const canvas = page.getByTestId("canvas-editor").locator("canvas");
    await canvas.click({ position: { x: width * 0.6, y: height * 0.65 } });
    for (let count = 3; count < 10; count += 1) await page.getByRole("button", { name: "場面を増やす" }).click();
    await expect(page.getByRole("button", { name: "場面を増やす" })).toBeDisabled();
    await expect(page.getByRole("tab")).toHaveCount(10);
    await page.getByRole("tab").nth(9).click();
    await canvas.click({ position: { x: width * 0.6, y: height * 0.65 } });
    await page.getByTestId("scene-motion").click();
    await expect(page.locator(".mood-card")).toHaveCount(15);
    await page.getByTestId("mood-carousel").click();
    for (let count = 10; count > 1; count -= 1) await page.getByRole("button", { name: "場面を減らす" }).click();
    await expect(page.getByRole("button", { name: "場面を減らす" })).toBeDisabled();
    for (let count = 1; count < 10; count += 1) await page.getByRole("button", { name: "場面を増やす" }).click();
    await page.getByRole("tab").nth(9).click();
    await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "1");
    await expect(page.getByTestId("scene-motion")).toContainText("かいてんもくば");
    await page.getByRole("tab").nth(0).click();
    await page.getByTestId("scene-motion").click();
    await page.getByTestId("mood-wave").click();
    await page.getByRole("tab").nth(1).click();
    await page.getByTestId("scene-motion").click();
    await page.getByTestId("mood-figure8").click();
    await expect.poll(async () => page.evaluate(async () => {
      const path = "/src/storage/projectStore.ts";
      return (await (await import(path)).loadLatestProject())?.sceneMoods?.[1];
    })).toBe("figure8");
    await page.reload();
    await page.getByRole("button", { name: "つづきから" }).click();
    await expect(page.getByTestId("scene-count")).toHaveText("10 ばめん");
    await expect(page.getByTestId("scene-motion")).toContainText("なみなみ");
    await expect.poll(() => page.locator(".create-screen").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await page.screenshot({ path: info.outputPath("scene-controls.png") });
    if (width === 390) {
      const download = page.waitForEvent("download");
      await page.evaluate(async () => {
        const exporterPath = "/src/export/artworkExporter.ts";
        const storePath = "/src/storage/projectStore.ts";
        const typesPath = "/src/types/project.ts";
        const project = await (await import(storePath)).loadLatestProject();
        const { WORLDS } = await import(typesPath);
        await (await import(exporterPath)).downloadJacketPng(project.shapes, WORLDS[project.worldId], project.title, project.sceneCount);
      });
      await (await download).saveAs(info.outputPath("ten-scenes.png"));
    }
    await page.getByTestId("play-button").click();
    await page.getByTestId("play-scene-plan").click();
    await expect(page.locator(".mood-badge")).toContainText("なみなみ");
    await expect(page.locator(".mood-badge")).toContainText("はちのじ", { timeout: 5000 });
    await page.getByRole("button", { name: "編集へ戻る" }).click();
  });
}
