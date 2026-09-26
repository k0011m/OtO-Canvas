import { expect, test } from "@playwright/test";

for (const [world, label] of [["soft", "みずのしずく"], ["bounce", "マリンバ"], ["space", "ピコピコ"]]) {
  // 音声ノードを実際に生成する経路を監視し、試聴・伴奏・演奏が選択した世界で鳴ることを確認する。
  test(`plays selected sound world ${world}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const path = "/src/music/audioEngine.ts";
      const { audioEngine } = await import(path);
      const calls: { world: string; seed: string; ok: boolean }[] = [];
      (window as any).soundCalls = calls;
      const original = audioEngine.triggerInstrument.bind(audioEngine);
      audioEngine.triggerInstrument = (options: any) => {
        const ok = original(options);
        calls.push({ world: options.soundWorld, seed: options.seed, ok });
        return ok;
      };
    });
    await page.getByTestId("start-button").click();
    await page.getByTestId(`world-${world}`).click();
    await expect(page.getByRole("button", { name: `まる・${label}`, exact: true })).toBeVisible();
    await page.evaluate(() => { (window as any).soundCalls.length = 0; });
    await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 250, y: 300 } });
    await expect.poll(async () => page.evaluate((expected) => (window as any).soundCalls.some((call: any) => call.world === expected && call.ok && !call.seed.startsWith("bgm-")), world)).toBe(true);
    await expect.poll(async () => page.evaluate((expected) => (window as any).soundCalls.some((call: any) => call.world === expected && call.ok && call.seed.startsWith("bgm-")), world)).toBe(true);
    await page.getByTestId("play-button").click();
    await page.getByTestId("mood-pop").click();
    await expect(page.getByTestId("pause-button")).toBeVisible();
    await expect.poll(async () => page.evaluate((expected) => (window as any).soundCalls.some((call: any) => call.world === expected && call.ok && call.seed.startsWith("part-")), world)).toBe(true);
    await page.getByRole("button", { name: "編集へ戻る" }).click();
    await expect(page.getByTestId("canvas-editor")).toBeVisible();
  });
}
