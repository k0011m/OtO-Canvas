import {expect,test} from "@playwright/test";
test.use({serviceWorkers:"block"});

// JSを取得できない白画面状態から、作品用保存領域を消さずに復旧できることを確認する。
test("boot recovery preserves saved data", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("boot-test-marker","keep"));
  await page.route("**/assets/index-*.js", route => route.abort());
  await page.goto("/");
  await expect(page.locator("#boot-recovery")).toBeVisible();
  await page.evaluate(async () => {
    const cache = await caches.open("oto-canvas-shell-test");
    await cache.put("/test",new Response("old"));
    await new Promise<void>((resolve,reject) => {
      const request=indexedDB.open("boot-recovery-test",1);
      request.onupgradeneeded=()=>request.result.createObjectStore("works");
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result, tx=db.transaction("works","readwrite");
        tx.objectStore("works").put("saved-work","one");
        tx.oncomplete=()=>{db.close();resolve();};
      };
    });
  });
  await page.unroute("**/assets/index-*.js");
  await page.locator("#boot-retry").click();
  await expect(page.getByTestId("start-button")).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem("boot-test-marker"))).toBe("keep");
  expect(await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open("boot-recovery-test",1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result, get=db.transaction("works").objectStore("works").get("one");
      get.onsuccess=()=>{resolve(get.result);db.close();};
    };
  }))).toBe("saved-work");
  expect(await page.evaluate(()=>caches.has("oto-canvas-shell-test"))).toBe(false);
});
