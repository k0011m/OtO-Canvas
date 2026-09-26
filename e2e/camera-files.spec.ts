import { expect, test, type Page } from "@playwright/test";

/** 本物のカメラを使わずに映像を作り、音声要求と全トラックの解放を検証する。 */
async function mockCamera(page: Page, denied = false) {
  await page.addInitScript((reject) => {
    (window as any).cameraCalls = [];
    (window as any).cameraStreams = [];
    (window as any).cameraDenied = reject;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      (window as any).cameraCalls.push(constraints);
      if ((window as any).cameraDenied) throw new DOMException("denied", "NotAllowedError");
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#f4b942"; ctx.fillRect(0, 0, 320, 240);
      const stream = canvas.captureStream(1);
      (window as any).cameraStreams.push(stream);
      return stream;
    };
  }, denied);
}

/** 完成画面のテストでは曲の終了通知を発火し、30秒の待ち時間を省略する。 */
async function finishWork(page: Page) {
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 250, y: 300 } });
  await page.getByTestId("play-button").click();
  await page.getByTestId("play-scene-plan").click();
  await page.evaluate(async () => {
    const path = "/src/music/audioEngine.ts";
    (await import(path)).audioEngine.finishNaturally();
  });
  await expect(page.getByRole("heading", { name: "できた！", exact: true })).toBeVisible();
}

test.describe("first visit camera choice", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("decline hides camera without requesting permission", async ({ page }) => {
    await mockCamera(page);
    await page.goto("/");
    await page.getByRole("button", { name: "使わないではじめる" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "保護者の方へ：記念写真について" })).toHaveCount(0);
    await finishWork(page);
    await expect(page.getByRole("button", { name: /しゃしんを とる/ })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).cameraCalls.length)).toBe(0);
  });

  test("permission denial hides camera and can be changed in parent settings", async ({ page }) => {
    await mockCamera(page, true);
    await page.goto("/");
    await page.getByRole("button", { name: "同意してカメラを許可", exact: true }).click();
    await expect(page.getByRole("heading", { name: "保護者の方へ：記念写真について" })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("otocanvas.camera.v1"))).toBe("off");
    await page.getByRole("button", { name: "おとなの方へ", exact: true }).click();
    await expect(page.getByRole("button", { name: "説明に同意してカメラを許可" })).toBeEnabled();
    await page.evaluate(() => { (window as any).cameraDenied = false; });
    await page.getByRole("button", { name: "説明に同意してカメラを許可" }).click();
    await expect(page.getByText("現在：有効", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("otocanvas.camera.v1"))).toBe("on");
  });

  test("front camera captures JPEG and stops on capture and close", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockCamera(page);
    await page.goto("/");
    await page.getByRole("button", { name: "同意してカメラを許可", exact: true }).click();
    await finishWork(page);
    await page.getByRole("button", { name: /しゃしんを とる/ }).click();
    await page.getByRole("button", { name: "ピース！ とる", exact: true }).click();
    await expect(page.getByAltText("撮影した記念写真")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "しゃしんを ほぞん", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("otocanvas-peace.jpg");
    expect(await page.evaluate(() => (window as any).cameraStreams.every((s: MediaStream) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
    await page.screenshot({ path: info.outputPath("photo-preview.png") });
    await page.getByRole("button", { name: "とりなおす" }).click();
    await expect(page.getByRole("button", { name: "ピース！ とる", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "撮影を閉じる" }).click();
    expect(await page.evaluate(() => (window as any).cameraStreams.every((s: MediaStream) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
    const calls = await page.evaluate(() => (window as any).cameraCalls);
    expect(calls).toHaveLength(3);
    for (const call of calls) { expect(call.audio).toBe(false); expect(call.video.facingMode.ideal).toBe("user"); }
  });
});

// 専用ファイルを実際にダウンロードし、読み込みとキャッシュ整理後も編集内容を保持する。
test("project file round trip and cache cleanup preserve work", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 500, y: 350 } });
  await page.getByTestId("scene-motion").click();
  await page.getByTestId("mood-carousel").click();
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "作品を書き出す", exact: true }).click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe("my-work.otocanvas");
  await page.getByLabel("作品ファイル").setInputFiles((await downloaded.path())!);
  await expect(page.getByTestId("scene-motion")).toContainText("かいてんもくば");
  await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "1");
  expect(await page.evaluate(async () => { const path = "/src/storage/projectStore.ts"; return (await (await import(path)).listProjects()).length; })).toBe(2);
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  await page.getByLabel("作品ファイル").setInputFiles({ name: "broken.otocanvas", mimeType: "application/json", buffer: Buffer.from("broken") });
  await expect(page.getByText("作品ファイルのJSONが壊れています。", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await caches.open("oto-canvas-shell-test");
    await caches.open("unrelated-cache");
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "整理する", exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.getByTestId("scene-motion")).toContainText("かいてんもくば");
  const keys = await page.evaluate(() => caches.keys());
  expect(keys).not.toContain("oto-canvas-shell-test"); expect(keys).toContain("unrelated-cache");
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  await page.getByRole("button", { name: "すべて消す", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "つづきから" })).toHaveCount(0);
});

// 永続保存できない場合は、メモリ内だけの作品を失う再読み込みを止める。
test("cache cleanup does not reload when work cannot be persisted", async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => { throw new DOMException("blocked"); };
    Storage.prototype.setItem = () => { throw new DOMException("blocked"); };
  });
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position: { x: 500, y: 350 } });
  await page.getByRole("button", { name: "おとな向け設定" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "整理する", exact: true }).click();
  await expect(page.getByText("キャッシュを整理できませんでした。作品ファイルの書き出し後にもう一度お試しください。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "1");
});
