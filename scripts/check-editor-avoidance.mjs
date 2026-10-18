import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
    await context.addInitScript(() => {
      window.androidBridge = {};
      localStorage.setItem("otocanvas.camera.v1", "off");
    });
    // 配布ファイルのみで起動し、外部通信に依存しない編集操作を検証する。
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== "https://localhost") return route.abort();
      const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const contentType = ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png" })[path.extname(name)] ?? "application/octet-stream";
      await route.fulfill({ body: await readFile(path.resolve("dist", name)), contentType });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://localhost/");
    await page.getByTestId("start-button").click();
    await page.getByTestId("world-bounce").click();
    await page.waitForTimeout(750);
    await page.getByTestId("world-bounce").click();
    const canvas = page.getByTestId("canvas-editor").locator("canvas");
    const bounds = await canvas.boundingBox();
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.click(center.x, center.y);
    expect(await canvas.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("none");
    const home = page.getByRole("button", { name: "ホームへ", exact: true });
    const homeBounds = await home.boundingBox();
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(homeBounds.x + homeBounds.width / 2, homeBounds.y + homeBounds.height / 2, { steps: 12 });
    await expect(home).toHaveAttribute("data-drag-avoid", "true");
    await page.waitForTimeout(450);
    expect(await home.evaluate(el => getComputedStyle(el).opacity)).toBe("0");
    await expect(page.locator(".editor-palette--left")).not.toHaveAttribute("data-drag-avoid", "true");
    // 隠れた位置で待っても点滅せず、中央へ戻るとドラッグ中でも復帰する。
    await page.mouse.move(center.x, center.y, { steps: 12 });
    await expect(home).toHaveAttribute("data-drag-avoid", "false");
    await page.mouse.up();
    await expect(page.locator('[data-drag-avoid="true"]')).toHaveCount(0);

    await page.getByTestId("tools-toggle").click();
    await page.waitForTimeout(650);
    const palette = page.locator(".editor-palette--left");
    const toggleBounds = await page.getByTestId("tools-toggle").boundingBox();
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(toggleBounds.x + toggleBounds.width / 2, toggleBounds.y + toggleBounds.height / 2, { steps: 15 });
    await expect(palette).toHaveAttribute("data-drag-avoid", "true");
    await page.waitForTimeout(400);
    expect(await palette.evaluate(el => el.inert)).toBe(true);
    await page.mouse.up();
    await expect(palette).not.toHaveAttribute("data-drag-avoid", "true");
    await expect(page.getByTestId("tools-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(await palette.evaluate(el => el.inert)).toBe(false);
    await expect(page.locator(".canvas-editor")).toHaveAttribute("data-shape-count", "1");

    // undoで中央へ戻した後、タッチのpointercancelでも退避解除する。
    await page.getByRole("button", { name: "ひとつ戻す", exact: true }).click();
    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: center.x, y: center.y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: homeBounds.x + 15, y: homeBounds.y + 15 }] });
    await expect(home).toHaveAttribute("data-drag-avoid", "true");
    await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(page.locator('[data-drag-avoid="true"]')).toHaveCount(0);
    expect(errors).toEqual([]);
    console.log(`PASS: ${width}px drag avoidance, restore, open palette, cancellation, no purple border`);
    await context.close();
  }
} finally {
  await browser.close();
}
