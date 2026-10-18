import fs from "node:fs/promises";
import {chromium} from "@playwright/test";
const svg=await fs.readFile("public/icon.svg","utf8");
const browser=await chromium.launch({headless:true});
try {
  for(const size of [192,512]) {
    const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
    await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>'+svg);
    await page.screenshot({path:'public/icon-'+size+'.png',omitBackground:true});
    await page.close();
  }
} finally {await browser.close();}
