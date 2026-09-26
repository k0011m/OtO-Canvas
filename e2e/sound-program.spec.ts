import { expect, test } from "@playwright/test";

for (const [width, height] of [[390, 844], [667, 375]]) {
  // 音階・順番・保存・再読込・本番の表示をスマホ縦横で一続きに検証する。
  test(`shape notes and sequence at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
    await page.getByRole("radio", { name: /プログラミングであそぶ/ }).check();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByTestId("start-button").click();
    await page.getByTestId("world-bounce").click();
    const canvas = page.getByTestId("canvas-editor").locator("canvas");
    await canvas.click({ position: { x: width * .6, y: height * .6 } });
    await canvas.click({ position: { x: width * .8, y: height * .45 } });
    await page.getByTestId("sound-program").click();
    await expect(page.getByRole("button", { name: "背景BGMなし", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "背景BGMあり", exact: true }).click();
    await page.getByRole("button", { name: "ずけい1", exact: true }).click();
    await page.getByRole("group", { name: "図形の音階" }).getByRole("button", { name: "ファ", exact: true }).click();
    await page.getByRole("button", { name: "じゅんばんに たす" }).click();
    await page.getByRole("button", { name: "ずけい2", exact: true }).click();
    await page.getByRole("group", { name: "図形の音階" }).getByRole("button", { name: "シ", exact: true }).click();
    await page.getByRole("button", { name: "じゅんばんに たす" }).click();
    await page.getByRole("button", { name: "じゅんばんに たす" }).click();
    await page.getByRole("button", { name: "音の2番を前へ" }).click();
    await expect(page.getByTestId("sound-step-0")).toContainText("シ");
    await expect(page.getByTestId("sound-step-1")).toContainText("ファ");
    await page.getByRole("button", { name: "じゅんばんを きく" }).click();
    await expect(page.getByTestId("sound-step-0")).toHaveAttribute("aria-current", "step");
    await page.getByRole("button", { name: "とめる", exact: true }).click();
    await page.screenshot({ path: info.outputPath("sound-program.png") });
    expect(await page.locator(".sound-editor").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "できた", exact: true }).click();
    await expect.poll(() => page.evaluate(async () => {
      const path = "/src/storage/projectStore.ts";
      const saved = await (await import(path)).loadLatestProject();
      return saved?.events?.filter((event: {id: string}) => event.id.startsWith("sound-program-0-")).map((event: {midiNote: number}) => event.midiNote);
    })).toEqual([71, 65, 71]);
    await page.reload();
    await page.getByRole("button", { name: "つづきから" }).click();
    await page.getByTestId("sound-program").click();
    await expect(page.getByRole("button", { name: "背景BGMあり", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("sound-step-0")).toContainText("シ");
    await page.getByRole("button", { name: "できた", exact: true }).click();
    await page.getByTestId("play-button").click();
    await expect(page.locator(".sound-program-playing")).toContainText("1ばん · シ");
    await expect(page.locator(".sound-program-playing")).toContainText("2ばん · ファ", { timeout: 6000 });
  });
}
