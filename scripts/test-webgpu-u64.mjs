import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile('src/webgpu/runtime.wgsl','utf8');
const helpers=source.slice(source.indexOf('fn cw_add64'),source.indexOf('fn cw_load32'));
const mask=(1n<<64n)-1n,cases=[];
const edges=[0n,1n,0xffffffffn,0x100000000n,1n<<63n,mask,mask-1n];
for(const a of edges)for(const b of edges)cases.push([a,b]);
let seed=0x12345678n;
for(let i=0;i<128;i++){seed=(seed*6364136223846793005n+1442695040888963407n)&mask;const a=seed;seed=(seed*6364136223846793005n+1442695040888963407n)&mask;cases.push([a,seed]);}
const words=cases.flatMap(([a,b])=>[Number(a&0xffffffffn),Number(a>>32n),Number(b&0xffffffffn),Number(b>>32n)]);
const operations=['cw_add64(a,b)','cw_sub64(a,b)','cw_mul64(a,b)','cw_div64(a,b)','cw_mod64(a,b)',...Array.from({length:65},(_,i)=>`cw_shl64(a,${i}u)`),...Array.from({length:65},(_,i)=>`cw_shr64(a,${i}u)`)];
const wgsl=helpers+`\n@group(0) @binding(0) var<storage,read> input:array<vec4<u32>>;\n@group(0) @binding(1) var<storage,read_write> output:array<vec2<u32>>;\n@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){if(id.x>=arrayLength(&input)){return;}let a=input[id.x].xy;let b=input[id.x].zw;${operations.map((op,i)=>`output[id.x*${operations.length}u+${i}u]=${op};`).join('\n')}}`;
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{
 const page=await browser.newPage();await page.route('**/gpu-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1:5182/gpu-test');
 await page.evaluate(()=>window.stop());
 const actual=await page.evaluate(async({wgsl,words,count,ops})=>{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');const device=await adapter.requestDevice();
  const module=device.createShaderModule({code:wgsl}),info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(JSON.stringify(errors));
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
  const input=device.createBuffer({size:words.length*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(input,0,new Uint32Array(words));
  const size=count*ops*8,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:output}}]});
  const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(output,0,read,0,size);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const result=Array.from(new Uint32Array(read.getMappedRange()));read.unmap();device.destroy();return result;
 },{wgsl,words,count:cases.length,ops:operations.length});
 let at=0;
 for(const [a,b] of cases){const expected=[a+b,a-b,a*b,b?a/b:0n,b?a%b:a,...Array.from({length:65},(_,i)=>a<<BigInt(i)),...Array.from({length:65},(_,i)=>a>>BigInt(i))];for(let op=0;op<expected.length;op++){const got=BigInt(actual[at])|(BigInt(actual[at+1])<<32n);assert.equal(got,expected[op]&mask,`u64 operation ${op}: ${a}, ${b}`);at+=2;}}
 const report={backend:'WebGPU',cases:cases.length,operations:operations.length,assertions:at/2,oracle:'JavaScript BigInt modulo 2^64',passed:true};await writeFile('reports/webgpu-u64.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();}
