import {build} from "esbuild";
import {readFileSync} from "node:fs";
import {mkdirSync} from "node:fs";
mkdirSync("tmp", {recursive:true});
import {chromium} from "@playwright/test";
await build({stdin:{contents:readFileSync("scripts/drag-harness.tsx","utf8").replace("reducedMotion={true}","reducedMotion={false} playing={true}"),resolveDir:process.cwd()+"/scripts",loader:"tsx"},bundle:true,outfile:"tmp/drag-harness.js",jsx:"automatic"});
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
 await page.mouse.move(before.x,before.y);await page.mouse.down();
 for(let i=1;i<=8;i++){await page.mouse.move(before.x+30*i,before.y);await page.waitForTimeout(16);}
 const held=await center();
 await page.mouse.up();
 await page.waitForTimeout(160);
 const floating=await center();
 if(floating.x-held.x<20)throw Error('No inertia '+JSON.stringify({held,floating}));
 await page.waitForTimeout(900);
 const bounced=await center();
 await page.waitForTimeout(250);
 const later=await center();
 if(later.x>=bounced.x)throw Error('No wall reflection '+JSON.stringify({bounced,later}));
 console.log('PASS: release coasts and right wall reflects',JSON.stringify({held,floating,bounced,later}));
}finally{await browser.close();}
