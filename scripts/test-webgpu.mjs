import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import Bend from '../generated/clearwater.mjs';
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:960}});
 let shaderHash;
 page.on('response',response=>{
  if(new URL(response.url()).pathname==='/generated/clearwater.wgsl')shaderHash=response.body().then(body=>createHash('sha256').update(body).digest('hex'));
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5182/webgpu.html');
 const timer=setInterval(async()=>{try{console.log(await page.evaluate(()=>window.bendWebGPUDiagnostics?.progress));}catch{}},15000);
 try{await page.waitForFunction(()=>window.bendWebGPUDiagnostics?.ready||window.bendWebGPUDiagnostics?.errors.length,{},{timeout:3600000});}finally{clearInterval(timer);}
 const result=await page.evaluate(()=>({report:window.bendWebGPUDiagnostics,pixels:Array.from(document.getElementById('image').getContext('2d').getImageData(0,0,document.getElementById('image').width,document.getElementById('image').height).data)}));
 assert.deepEqual(result.report.errors,[]);assert.deepEqual(errors,[]);assert.equal(result.report.ready,true);assert.equal(result.report.backend,'bend-cuda-webshader-direct-wgsl');
 const {width,height}=result.report,expected=new Uint8Array(width*height*4);
 function flatten(t,x,y,size){if(t.$==='Pix'){for(let yy=y;yy<y+size;yy++)for(let xx=x;xx<x+size;xx++){const at=(yy*width+xx)*4;expected.set([(t.color>>>16)&255,(t.color>>>8)&255,t.color&255,255],at);}return;}assert.equal(t.$,'Qua');const h=size/2;flatten(t.tl,x,y,h);flatten(t.tr,x+h,y,h);flatten(t.bl,x,y+h,h);flatten(t.br,x+h,y+h,h);}
 flatten(Bend.render_scene(BigInt(Math.log2(width)),width),0,0,width);
 let peak=0,sum=0,different=0,shifted=0;
 for(let i=0;i<expected.length;i++){if(i%4===3){assert.equal(result.pixels[i],255);continue;}const e=Math.abs(result.pixels[i]-expected[i]);peak=Math.max(peak,e);sum+=e*e;different+=e!==0;shifted+=(result.pixels[i]-expected[(i+4)%expected.length])**2;}
 const channels=width*height*3,rms=Math.sqrt(sum/channels),shiftedRms=Math.sqrt(shifted/channels);
 await writeFile('reports/webgpu-rgba.bin',new Uint8Array(result.pixels));
 await writeFile('reports/webgpu-reference-rgba.bin',expected);
 assert.ok(shaderHash,'browser fetched generated shader');
 const report={...result.report,generatedWgslSha256:await shaderHash,peakChannelError:peak,rmsChannelError:rms,differentChannels:different,comparedColorChannels:channels,shiftedRms,oracle:'unmodified upstream Bend JavaScript render_scene',runtime:'CUDA WebShader GpuRuntime artifact API',criteria:{peak:6,rms:.5},passed:peak<=6&&rms<.5&&shiftedRms>1};
 await writeFile('reports/webgpu.json',JSON.stringify(report,null,2)+'\n');console.log(report);
 await page.screenshot({path:'reports/webgpu-page.png',fullPage:true});
 assert.ok(peak<=6&&rms<.5,`WebGPU parity: peak ${peak}, RMS ${rms}`);assert.ok(shiftedRms>1,'shifted-image negative control');
}finally{await browser.close();}
