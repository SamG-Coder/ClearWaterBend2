import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const wgsl=await readFile('generated/clearwater.wgsl','utf8');
const metadata=JSON.parse(await readFile('generated/webgpu-metadata.json','utf8'));
const probes=`
@compute @workgroup_size(1) fn probe_queue(){cw_enqueue(vec2<u32>(1u));cw_enqueue(vec2<u32>(2u));}
@compute @workgroup_size(1) fn probe_retire(){let e=Env(0u,CW_ALC_OFF*2u);let a=fn_heap_alloc(e,3u);fn_heap_free(e,3u,a);let b=fn_heap_alloc(e,3u);atomicStore(&control[3],a.x);atomicStore(&control[4],b.x);}
@compute @workgroup_size(1) fn probe_reuse(){let e=Env(0u,CW_ALC_OFF*2u);atomicStore(&control[5],fn_heap_alloc(e,3u).x);}
`;
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{
 const page=await browser.newPage();await page.route('**/gpu-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('http://127.0.0.1:5182/gpu-test');
 const result=await page.evaluate(async({wgsl,metadata})=>{
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');const device=await adapter.requestDevice();
  const module=device.createShaderModule({code:wgsl});const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(JSON.stringify(errors));
  const layout=device.createBindGroupLayout({entries:[0,1,2,3,4,5,7].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===4?'uniform':'storage'}}))});const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const kernels={};for(const entryPoint of ['cw_init','cw_status','cw_recycle','probe_queue','probe_retire','probe_reuse'])kernels[entryPoint]=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}});
  const make=size=>device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  const bytes=metadata.HEAP_OFF*8+1048576,heap=make(bytes),qa=make(16),qb=make(16),control=make(32),pixels=make(4),scratch=make(metadata.LANES*metadata.PRIVATE_WORDS*4),uniform=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const bindings=[[0,heap],[1,qa],[2,qb],[3,control],[4,uniform],[5,pixels],[7,scratch]],bind=device.createBindGroup({layout,entries:bindings.map(([binding,buffer])=>({binding,resource:{buffer}}))});
  const read=device.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  function dispatch(enc,name,n=1){const pass=enc.beginComputePass();pass.setPipeline(kernels[name]);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(n);pass.end();}
  async function run(sequence,{capacity=2,words=bytes/8,clear=true}={}){
   device.queue.writeBuffer(uniform,0,new Uint32Array([1,0,capacity,words,32,32,5,0]));const enc=device.createCommandEncoder();if(clear){enc.clearBuffer(heap);enc.clearBuffer(control);}
   for(const name of sequence)dispatch(enc,name,name==='cw_recycle'?metadata.LANES/32:1);
   enc.copyBufferToBuffer(control,0,read,0,32);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const out=Array.from(new Uint32Array(read.getMappedRange()));read.unmap();return out;
  }
  const oom=await run(['cw_init','cw_status'],{words:metadata.HEAP_OFF+1});
  const overflow=await run(['cw_init','probe_queue','cw_status'],{capacity:1});
  const retired=await run(['cw_init','probe_retire']);
  const reused=await run(['cw_recycle','probe_reuse'],{clear:false});device.destroy();return {oom,overflow,retired,reused};
 },{wgsl:wgsl+'\n'+probes,metadata});
 assert.equal(result.oom[2],3,'heap exhaustion must be reported');assert.equal(result.overflow[2],22,'queue exhaustion must be reported');
 assert.notEqual(result.retired[3],result.retired[4],'retired memory cannot be reused in the same dispatch');assert.equal(result.retired[3],result.reused[5],'retired memory becomes reusable after recycling');
 const report={backend:'direct WebGPU memory/scheduler adapter',heapExhaustion:3,queueExhaustion:22,retiredUntilNextRound:true,recycledBlockReused:true,passed:true};await writeFile('reports/webgpu-runtime.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();}
