import { openEditorOptions } from "./design-helpers";
import { expect, test } from "@playwright/test";

test("a child can draw, choose a motion and BGM mood, and play a 30-second MV", async ({
  page,
}) => {
  await page.goto("/");

  const startButton = page.getByTestId("start-button");
  await expect(startButton).toBeVisible();
  await startButton.click();

  const softWorld = page.getByTestId("world-soft");
  await expect(softWorld).toBeVisible();
  await softWorld.click();
  await softWorld.click();

  const editor = page.getByTestId("canvas-editor");
  await expect(editor).toBeVisible();

  const stampKinds = [
    "circle",
    "triangle",
    "line",
    "square",
    "diamond",
    "star",
    "hexagon",
    "ring",
  ] as const;
  for (const kind of stampKinds) {
    await expect(page.getByTestId(`tool-${kind}`)).toHaveCount(1);
  }
  await expect(page.getByTestId("tool-pen")).toHaveCount(1);

  await page.getByTestId("tools-toggle").click();
  await page.getByTestId("tool-star").click();
  await expect(page.getByTestId("tool-star")).toHaveAttribute("aria-pressed", "true");
  await editor.click({ position: { x: 220, y: 150 } });

  await page.getByTestId("colors-toggle").click();
  const oceanColor = page.getByTestId("color-ocean");
  await expect(oceanColor).toBeVisible();
  await oceanColor.click();

  await openEditorOptions(page);
  const rotateRight = page.getByTestId("rotate-right");
  const rotateLeft = page.getByTestId("rotate-left");
  await expect(rotateRight).toBeVisible();
  await expect(rotateLeft).toBeVisible();
  await rotateRight.click();
  await rotateLeft.click();

  await page.getByRole("button", { name: "編集の設定を閉じる" }).click();
  await page.getByTestId("tools-toggle").click();
  const penTool = page.getByTestId("tool-pen");
  await penTool.click();
  const drawingSurface = editor.locator("canvas").first();
  const bounds = await drawingSurface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.34);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.42, {
      steps: 5,
    });
    await page.mouse.move(bounds.x + bounds.width * 0.68, bounds.y + bounds.height * 0.34, {
      steps: 5,
    });
    await page.mouse.up();
  }

  const playButton = page.getByTestId("play-button");
  await expect(playButton).toBeVisible();
  await expect(playButton).toBeEnabled();
  await playButton.click();

  const moodDialog = page.getByRole("dialog", { name: "1ばんの うごき" });
  await expect(moodDialog).toBeVisible();
  await expect(page.getByTestId("mood-float")).toHaveCount(1);
  await expect(page.getByTestId("mood-pop")).toHaveCount(1);
  await expect(page.getByTestId("mood-cosmic")).toHaveCount(1);

  await page.getByTestId("mood-pop").click();
  await expect(moodDialog).toBeHidden();
  await expect(page.getByRole("application", { name: /はじけるの雰囲気/ })).toBeVisible();

  const pauseButton = page.getByTestId("pause-button");
  await expect(pauseButton).toBeVisible();
  await pauseButton.click();

  await expect(pauseButton).toHaveAttribute("aria-label", "再開");
  const remaining = page.getByText(/あと 0:\d{2}/);
  await expect(remaining).toBeVisible();
  const pausedTime = await remaining.textContent();
  await page.waitForTimeout(1100);
  await expect(remaining).toHaveText(pausedTime!);

  const backButton = page.getByRole("button", { name: "編集へ戻る" });
  await expect(backButton).toBeVisible();
  await expect(backButton).toContainText("もどる");
  await backButton.click();
  await expect(editor).toBeVisible();
});
