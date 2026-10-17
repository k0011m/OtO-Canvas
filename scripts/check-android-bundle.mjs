import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("android/app/src/main/assets/public");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block" });
await context.addInitScript(() => {
  window.androidBridge = {};
  localStorage.setItem("otocanvas.camera.v1", "off");
});
const failures = [];
const page = await context.newPage();
page.on("pageerror", e => failures.push(e.message));
// 通信を使用せず、Androidへ同梱したファイルだけをリクエストへ返す。
await context.route("**/*", async route => {
  const url = new URL(route.request().url());
  if (url.origin !== "https://localhost") { failures.push("External: " + url.href); return route.abort(); }
  const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const mime = name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : name.endsWith(".html") ? "text/html" : "application/octet-stream";
  try { await route.fulfill({ body: await readFile(path.join(root, name)), contentType: mime }); }
  catch { failures.push("Missing: " + name); await route.abort(); }
});
try {
  await page.goto("https://localhost/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-bounce").click();
  await page.waitForTimeout(700);
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position:{x:400,y:300} });
  await page.getByTestId("play-button").click();
  await page.getByTestId("play-scene-plan").click();
  await page.getByTestId("pause-button").waitFor({state:"visible",timeout:15000});
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("PASS: bundled assets only, Home -> edit -> compose -> playback; no external requests.");
} finally { await browser.close(); }
