import { expect, test } from "@playwright/test";

for (const [width, height] of [[390, 844], [667, 375]]) {
  // 親の解放、カード入替、反復、保存・再読込、実行表示をスマホ縦横で確かめる。
  test(`program editing and playback at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
    await page.getByRole("radio", { name: /プログラミングであそぶ/ }).check();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByTestId("start-button").click();
    await page.getByTestId("world-bounce").click();
    await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: width * .6, y: height * .6 } });
    await page.getByTestId("scene-program").click();
    await page.getByTestId("program-step-0").locator(".program-command").click();
    await page.getByRole("group", { name: "1番の動きを選ぶ" }).getByRole("button", { name: "なみなみ", exact: true }).click();
    await page.getByRole("button", { name: "＋ めいれいを たす" }).click();
    await page.getByRole("group", { name: "2番の動きを選ぶ" }).getByRole("button", { name: "はじける", exact: true }).click();
    await page.getByRole("button", { name: "2番を前へ" }).click();
    await page.getByRole("button", { name: "3かい", exact: true }).click();
    await page.getByTestId("program-step-0").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("program-editor.png") });
    await expect(page.getByTestId("program-step-0")).toContainText("はじける");
    await page.getByRole("button", { name: "できた", exact: true }).click();
    await expect.poll(() => page.evaluate(async () => {
      const path = "/src/storage/projectStore.ts";
      return (await (await import(path)).loadLatestProject())?.scenePrograms?.[0];
    })).toEqual({ moves: ["pop", "wave"], repeat: 3 });
    await page.reload();
    await page.getByRole("button", { name: "つづきから" }).click();
    await expect(page.getByTestId("scene-program")).toContainText("2こ");
    if (width === 390) {
      await page.getByRole("button", { name: "おとな向け設定" }).click();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "作品を書き出す", exact: true }).click();
      await page.getByLabel("作品ファイル").setInputFiles((await (await download).path())!);
      await expect(page.getByTestId("scene-program")).toContainText("2こ");
    }
    await page.getByTestId("play-button").click();
    await expect(page.locator(".program-playback [aria-current=step]")).toContainText("はじける");
    await expect(page.locator(".program-playback [aria-current=step]")).toContainText("なみなみ", { timeout: 3000 });
    await expect(page.locator(".mood-badge")).toContainText("なみなみ");
    await expect(page.locator(".program-playback > span")).toContainText("2/3かい", { timeout: 3000 });
    await page.getByTestId("pause-button").click();
    await page.screenshot({ path: info.outputPath("program-playback.png") });
    await page.getByRole("button", { name: "編集へ戻る" }).click();
    await page.getByTestId("scene-program").click();
    await page.getByRole("button", { name: "2番を消す" }).click();
    await expect(page.getByRole("button", { name: "1番を消す" })).toBeDisabled();
    await page.getByRole("button", { name: "うごき１つに もどす" }).click();
    await expect(page.getByTestId("program-step-0")).toContainText("ゆらゆら");
    await expect(page.getByRole("button", { name: "1かい", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
}
