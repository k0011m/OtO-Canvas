import { expect, test } from "@playwright/test";

// 静止時にも15種類の図解が別々で、動きを減らす設定でアニメーションを止める。
test("distinct motion diagrams work at desktop and mobile sizes", async ({ page }, info) => {
  await page.setViewportSize({ width: 1200, height: 2400 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("scene-motion").click();
  await expect(page.locator(".motion-diagram svg")).toHaveCount(15);
  await expect(page.locator("animateMotion, animate")).toHaveCount(0);
  const diagrams = await page.locator(".motion-diagram svg").evaluateAll((nodes) => nodes.map((node) =>
    [...node.querySelectorAll(".motion-route, .motion-scenery")].map((path) => [path.tagName, ...["d", "cx", "cy", "r"].map((name) => path.getAttribute(name))]).join("")));
  expect(new Set(diagrams).size).toBe(15);
  await page.locator(".mood-dialog").screenshot({ path: info.outputPath("motion-diagrams.png") });
  await page.getByTestId("mood-breathe").scrollIntoViewIfNeeded();
  await page.locator(".mood-dialog").screenshot({ path: info.outputPath("middle-diagrams.png") });
  await page.getByTestId("mood-carousel").scrollIntoViewIfNeeded();
  await page.locator(".mood-dialog").screenshot({ path: info.outputPath("last-diagrams.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("mood-wave").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("mobile-diagrams.png") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("animateMotion").first()).toBeAttached();
  const token = page.getByTestId("mood-wave").locator(".motion-token");
  const first = await token.evaluate((node) => (node as SVGGraphicsElement).getCTM()?.e);
  await expect.poll(() => token.evaluate((node) => (node as SVGGraphicsElement).getCTM()?.e)).not.toBe(first);
  await page.getByTestId("mood-wave").click();
  await expect(page.getByTestId("scene-motion")).toContainText("なみなみ");
});
