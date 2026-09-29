import {GpuRuntime} from './vendor/webshader/src/runtime/runtime.js';

const names=['cw_init','cw_step','cw_recycle','cw_status','cw_present'];
const scalarNames=['count','parity','capacity','heap_words','width','height','depth','reserved'];
const bindings=[['heap',0,4],['queue_a',1,8],['queue_b',2,8],['control',3,4],['pixels',5,4],['scratch',7,4]];

/** Execute upstream-generated Bend CUDA on WebGPU through CUDA WebShader's
 * artifact API. This host schedules work and copies pixels; it has no ocean math.
 */
export async function createBendWebGPU({onProgress=()=>{},queueCapacity=131072,heapBytes=128*1024*1024}={}){
 const load=async(path,type)=>{const r=await fetch(path);if(!r.ok)throw Error(`Cannot load ${path}: HTTP ${r.status}`);return r[type]();};
 const [wgsl,metadata]=await Promise.all([
  load('./generated/clearwater.wgsl','text'),load('./generated/webgpu-metadata.json','json')]);
 if(!Number.isSafeInteger(queueCapacity)||queueCapacity<1||queueCapacity>1048576)throw Error('Invalid task queue capacity');
 if(!Number.isSafeInteger(heapBytes)||heapBytes%8||heapBytes<metadata.HEAP_OFF*8)throw Error('Invalid Bend heap budget');
 const runtime=await GpuRuntime.create({useAdapterBufferLimits:true});
 const bytes=heapBytes,capacity=queueCapacity,scratchBytes=metadata.LANES*metadata.PRIVATE_WORDS*4;
 if(runtime.device.limits.maxStorageBufferBindingSize<Math.max(bytes,scratchBytes)){runtime.dispose();throw Error('This Bend evaluator needs a storage binding limit above 128 MiB.');}
 let lost=null;runtime.device.lost.then(info=>{lost=Error(`WebGPU device lost: ${info.message}`);});
 const buffers={heap:runtime.createBuffer(bytes),queue_a:runtime.createBuffer(capacity*8),queue_b:runtime.createBuffer(capacity*8),control:runtime.createBuffer(32),pixels:runtime.createBuffer(128*128*4),scratch:runtime.createBuffer(scratchBytes)};
 const initial={count:1,parity:0,capacity,heap_words:bytes/8,width:128,height:128,depth:7,reserved:0};
 const kernels={},invocations={};const compileStart=performance.now();
 try{
  for(const name of names){
   onProgress({stage:'compile',entry:name});
   const workgroupSize=name==='cw_present'?[8,8,1]:name==='cw_status'?[1,1,1]:[32,1,1];
   kernels[name]=await runtime.kernel({name,entryPoint:name,wgsl:wgsl+`\n// Entry: ${name}\n`,metadata:{workgroupSize,workgroupStorageBytes:0,uniformSize:32,uniformBinding:4,scalars:scalarNames.map((name,i)=>({name,type:'u32',offset:i*4})),bindings:bindings.map(([name,binding,stride])=>({name,binding,stride,elementType:'u32',readOnly:name==='program'}))}});
   invocations[name]=kernels[name].bind(buffers,initial);
  }
 }catch(e){runtime.dispose();throw e;}
 const compileMs=performance.now()-compileStart;
 let busy=false;
 return {
  metadata,compileMs,runtime,
  async render({signal,timeoutMs=900000,size=32}={}){
   if(![16,32,64,128].includes(size))throw Error('Image size must be 16, 32, 64 or 128');
   if(busy)throw Error('A Bend evaluation is already running');busy=true;
   const start=performance.now(),params={...initial,width:size,height:size,depth:Math.log2(size)};let rounds=0,dispatches=0,state,peakTasks=1;
   const dispatch=(batch,name,groups=1)=>batch.dispatch(invocations[name].setScalars(params),groups);
   try{
    let batch=runtime.batch();batch.clear(buffers.heap).clear(buffers.scratch).clear(buffers.control);dispatch(batch,'cw_init');batch.submit();
    while(rounds<4096){
     if(signal?.aborted)throw new DOMException('Render cancelled','AbortError');
     if(lost)throw lost;
     if(performance.now()-start>timeoutMs)throw Error('Bend evaluation exceeded the time limit');
     batch=runtime.batch();
     batch.clear(buffers.control);dispatch(batch,'cw_recycle',metadata.LANES/32);
     dispatch(batch,'cw_step',metadata.LANES/32);dispatches++;
     dispatch(batch,'cw_status');batch.submit();
     state=await runtime.read(buffers.control,Uint32Array);
     if(state[2])throw Error(`Bend WebGPU error ${state[2]} at round ${rounds}`);
     if(dispatches%25===0)onProgress({stage:'evaluate',rounds,dispatches,tasks:params.count,seconds:(performance.now()-start)/1000});
     if(state[1])break;
     if(!state[0])throw Error('Bend task queue emptied before producing a result');
     params.count=state[0];params.parity^=1;params.reserved=0;peakTasks=Math.max(peakTasks,params.count);rounds++;
    }
    if(!state?.[1])throw Error('Bend scheduler exceeded its round limit');
    batch=runtime.batch();dispatch(batch,'cw_present',[16,16]);batch.submit();
    const pixels=await runtime.read(buffers.pixels,Uint32Array,size*size*4);
    return {pixels,width:size,height:size,compileMs,executionMs:performance.now()-start,rounds,dispatches,peakTasks,heapBytes:state[5]*8,backend:'bend-cuda-webshader-direct-wgsl',device:runtime.describe()};
   }finally{busy=false;}
  },
  dispose(){runtime.dispose();}
 };
}
