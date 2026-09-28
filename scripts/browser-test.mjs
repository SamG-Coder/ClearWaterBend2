import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5182');
  await page.waitForFunction(()=>window.clearwaterDiagnostics?.ready,{},{timeout:180000});
  const first=await page.evaluate(()=>({...clearwaterDiagnostics}));
  assert.deepEqual(first.errors,[]);
  await mkdir('reports',{recursive:true});await page.screenshot({path:'reports/clearwater.png'});
  await page.locator('#depth').fill('3');await page.locator('#depth').dispatchEvent('input');
  await page.waitForFunction(n=>clearwaterDiagnostics.frames>n,first.frames,{timeout:180000});
  assert.equal(await page.evaluate(()=>clearwaterDiagnostics.state.depth),3);
  const second=await page.evaluate(()=>({...clearwaterDiagnostics}));
  assert.deepEqual(second.errors,[]);assert.deepEqual(errors,[]);
  await writeFile('reports/browser.json',JSON.stringify({initial:first,afterDepthChange:second,pageErrors:errors},null,2)+'\n');
  console.log(JSON.stringify({frames:second.frames,initialMs:first.totalMs,afterDepthChangeMs:second.totalMs,errors},null,2));
}finally{await browser.close();}
