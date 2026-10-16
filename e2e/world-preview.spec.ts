import { expect, test } from "@playwright/test";

// 音の入口だけでなく再生キューも調べ、以前の世界のBGMが残らないことを確認する。
test("world selection previews the sound and a second activation confirms", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-button").click();
  for (const world of ["bounce", "space", "soft", "bounce"]) {
    await page.getByTestId(`world-${world}`).click();
    await expect.poll(() => page.evaluate(async () => {
      const path = "/src/music/audioEngine.ts";
      const engine = (await import(path)).audioEngine;
      return [...new Set(engine.events.map((event: { soundWorld: string }) => event.soundWorld))];
    })).toEqual([world]);
  }
  await page.getByTestId("world-space").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(async () => {
    const path = "/src/music/audioEngine.ts";
    return [...new Set((await import(path)).audioEngine.events.map((event: { soundWorld: string }) => event.soundWorld))];
  })).toEqual(["space"]);
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("world-bounce").click();
  await expect(page.getByTestId("canvas-editor")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const path = "/src/music/audioEngine.ts";
    return [...new Set((await import(path)).audioEngine.events.map((event: { soundWorld: string }) => event.soundWorld))];
  })).toEqual(["bounce"]);
});
