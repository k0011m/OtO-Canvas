import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist");
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
  const mime = name.endsWith(".svg") ? "image/svg+xml" : name.endsWith(".png") ? "image/png" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : name.endsWith(".html") ? "text/html" : "application/octet-stream";
  try { await route.fulfill({ body: await readFile(path.join(root, name)), contentType: mime }); }
  catch { failures.push("Missing: " + name); await route.abort(); }
});
try {
  await page.setViewportSize({width:390,height:844});
  await page.goto("https://localhost/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("world-bounce").click();
  await page.waitForTimeout(750);
  const bg = await page.locator('.world-screen').evaluate(el=>getComputedStyle(el).backgroundColor);
  if(bg !== 'rgb(255, 244, 220)') throw new Error('wrong background '+bg);
  await page.getByTestId("world-bounce").click();
  await page.getByTestId("canvas-editor").locator("canvas").click({ position:{x:200,y:300} });
  if(!(await page.getByTestId('editor-guide').textContent()).includes('いろを')) throw new Error('missing color hint');
  for (const width of [320,390,760,1024]) {
    await page.setViewportSize({width,height:844});
    const shapes=page.getByTestId('tools-toggle'), colors=page.getByTestId('colors-toggle');
    await shapes.click(); await page.waitForTimeout(650);
    if(width<=760) {
      const a=await shapes.boundingBox(), b=await colors.boundingBox();
      if(Math.abs(a.y-b.y-b.height-8)>1) throw new Error('button gap');
      const items=await page.locator('#palette-left').boundingBox();
      if(items.y>=a.y || items.x+items.width>width) throw new Error('shape expansion');
    }
    await colors.click(); await page.waitForTimeout(650);
    if(width<=760) {
      const b=await colors.boundingBox(), items=await page.locator('#palette-right').boundingBox();
      if(items.y<b.y || items.y+items.height>844) throw new Error('color expansion');
    }
    await page.screenshot({path:'tmp/palettes-'+width+'.png'});
    await colors.click();
    if(await shapes.getAttribute('aria-expanded')==='true') await shapes.click();
  }
  await page.getByTestId('colors-toggle').click();
  await page.getByTestId('color-ocean').click();
  if(await page.getByTestId('editor-guide').count()) throw new Error('hint did not dismiss');
  // Homeからの再開は保存作品、新規開始は空のキャンバスになることを確認する。
  await page.getByRole('button',{name:'ホームへ',exact:true}).click();
  await page.getByRole('button',{name:'つづきから',exact:true}).click();
  await page.getByRole('button',{name:'ホームへ',exact:true}).click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('world-bounce').click();
  await page.waitForTimeout(700);
  await page.getByTestId('world-bounce').click();
  if(!(await page.getByTestId('editor-guide').textContent()).includes('かたちを')) throw new Error('previous shapes remain');
  await page.getByTestId('colors-toggle').click();
  if(await page.getByTestId('color-sun').getAttribute('aria-pressed')!=='true') throw new Error('previous color remains');
  await page.getByTestId('colors-toggle').click();
  await page.getByTestId('canvas-editor').locator('canvas').click({position:{x:200,y:300}});
  await page.getByTestId("play-button").click();
  await page.getByTestId("play-scene-plan").click();
  await page.getByTestId("pause-button").waitFor({state:"visible",timeout:15000});
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("PASS: bundled assets only, Home -> edit -> compose -> playback; no external requests.");
} finally { await browser.close(); }
