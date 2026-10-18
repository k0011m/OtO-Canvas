import {build} from "esbuild";
import {mkdirSync} from "node:fs";
mkdirSync("tmp", {recursive:true});
import {chromium} from "@playwright/test";
await build({entryPoints:["scripts/drag-harness.tsx"],bundle:true,outfile:"tmp/drag-harness.js",jsx:"automatic"});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:800,height:600}});
 await page.setContent('<div id="root" style="width:800px;height:600px"></div>');
 await page.addScriptTag({path:"tmp/drag-harness.js"});
 await page.waitForTimeout(1000);
 const canvas=page.locator('canvas');
 // 演出を抑えた単一図形のピクセル重心で実際の移動量を検証する。
 const center=async()=>canvas.evaluate(el=>{
 const {data}=el.getContext('2d').getImageData(0,0,el.width,el.height);
 let x=0,y=0,n=0;
 for(let i=0;i<data.length;i+=4)if(data[i]>180&&data[i+1]>100&&data[i+1]<210&&data[i+2]<110){x+=(i/4)%el.width;y+=Math.floor(i/4/el.width);n++;}
 const r=el.getBoundingClientRect();if(!n)throw Error('no pixels');
 return {x:r.left+x/n*r.width/el.width,y:r.top+y/n*r.height/el.height};
 });
 const before=await center();
 await page.mouse.move(before.x,before.y);await page.mouse.down();await page.mouse.move(before.x+120,before.y+70,{steps:12});
 await page.waitForTimeout(400);
 const held=await center();
 await page.mouse.up();await page.waitForTimeout(800);
 const released=await center();
 for(const p of [held,released])if(Math.abs(p.x-before.x-120)>8||Math.abs(p.y-before.y-70)>8)throw Error(JSON.stringify({before,held,released}));
 console.log('PASS drag follows pointer and persists after release',JSON.stringify({before,held,released}));
}finally{await browser.close();}
