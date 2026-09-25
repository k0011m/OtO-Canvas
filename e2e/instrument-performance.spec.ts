import { expect, test } from "@playwright/test";

// 保存済みの密集作品を実際に編集・再生し、配置上限と音声側での楽器欠落を検証する。
test("fifty shapes retain every instrument in real playback", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.evaluate(async () => {
    const arrangerPath = "/src/music/arranger.ts";
    const storagePath = "/src/storage/projectStore.ts";
    const { createProject } = await import(arrangerPath);
    const { saveProject } = await import(storagePath);
    const kinds = ["circle", "triangle", "line", "square", "diamond", "star", "hexagon", "ring", "pen"];
    const shapes = Array.from({ length: 49 }, (_, index) => ({
      id: `shape-${index}`, kind: kinds[Math.min(index, 8)], position: { x: 0.5, y: 0.5 },
      size: 0.3, rotation: 0, colorId: "ocean", patternId: "test", zIndex: index, scene: 0,
    }));
    await saveProject(createProject(shapes, 12, "soft"));
  });
  await page.reload();
  await page.getByRole("button", { name: "つづきから", exact: true }).click();
  const canvas = page.getByTestId("canvas-editor").locator("canvas");
  const drawing = page.locator(".canvas-editor");
  await expect(drawing).toHaveAttribute("data-shape-count", "49");
  await canvas.press("Escape");
  await canvas.press("Enter");
  await expect(drawing).toHaveAttribute("data-shape-count", "50");
  await canvas.press("Escape");
  await canvas.press("Enter");
  await expect(drawing).toHaveAttribute("data-shape-count", "50");
  await expect(drawing.getByRole("status")).toContainText("図形は50こまでです");
  await page.getByTestId("tool-pen").click();
  await canvas.click({ position: { x: 120, y: 180 } });
  await expect(drawing).toHaveAttribute("data-shape-count", "50");
  await expect(drawing.getByRole("status")).toContainText("図形は50こまでです");

  // AudioContextの実発音処理の成功値を記録し、イベントがあるだけの空振りを検出する。
  await page.evaluate(async () => {
    const path = "/src/music/audioEngine.ts";
    const { audioEngine } = await import(path);
    const played: { id: string; instrument: string; success: boolean }[] = [];
    (window as unknown as { playedParts: typeof played }).playedParts = played;
    const trigger = audioEngine.triggerInstrument.bind(audioEngine);
    audioEngine.triggerInstrument = (options: { seed: string; instrumentId: string }) => {
      const success = trigger(options);
      if (options.seed.startsWith("part-")) played.push({ id: options.seed, instrument: options.instrumentId, success });
      return success;
    };
  });
  await page.getByTestId("play-button").click();
  await page.getByTestId("mood-pop").click();
  await expect.poll(async () => page.evaluate(() =>
    (window as unknown as { playedParts: { id: string; success: boolean }[] }).playedParts
      .filter((event) => event.id.startsWith("part-0-") && event.success).length),
  { timeout: 8_000 }).toBe(18);
  await page.getByRole("button", { name: "編集へ戻る" }).click();
  await expect(drawing).toHaveAttribute("data-shape-count", "50");
  await page.getByRole("tab").nth(1).click();
  await expect(drawing).toHaveAttribute("data-shape-count", "0");
  await page.getByRole("button", { name: "まえを うつす" }).click();
  await expect(drawing).toHaveAttribute("data-shape-count", "50");
});
