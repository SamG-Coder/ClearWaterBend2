import {createBendWebGPU} from './webgpu.js';
const $=id=>document.getElementById(id),canvas=$('image');
const diagnostics=window.bendWebGPUDiagnostics={ready:false,backend:'bend-cuda-webshader-direct-wgsl',errors:[]};
let adapter,abort;
function progress(p){
 diagnostics.progress=p;
 $('status').textContent=p.stage==='compile'?`Compiling GPU pipeline ${p.entry}…`:`Evaluating Bend on WebGPU · ${p.seconds.toFixed(1)} s`;
 if(p.stage==='evaluate')$('metrics').textContent=`${p.rounds} task rounds\n${p.dispatches} compute dispatches\n${p.tasks} tasks`;
}
async function render(){
 abort=new AbortController();$('render').disabled=true;$('cancel').disabled=false;diagnostics.ready=false;
 try{
  adapter??=await createBendWebGPU({onProgress:progress});
  const result=await adapter.render({signal:abort.signal,size:Number($('size').value)});
  canvas.width=result.width;canvas.height=result.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.pixels.buffer),result.width,result.height),0,0);
  const {pixels,...report}=result;Object.assign(diagnostics,report,{ready:true});
  $('status').textContent=`Rendered on WebGPU in ${(result.executionMs/1000).toFixed(2)} s`;
  $('metrics').textContent=`${result.rounds} task rounds\n${result.dispatches} compute dispatches\n${(result.heapBytes/1048576).toFixed(1)} MiB heap used\n${(result.compileMs/1000).toFixed(2)} s pipeline compilation`;
  $('save').disabled=false;
 }catch(e){
  $('status').textContent=e.name==='AbortError'?'Render cancelled.':e.message;
  if(e.name!=='AbortError'){diagnostics.errors.push(e.message);console.error(e);adapter?.dispose();adapter=null;}
 }finally{$('render').disabled=false;$('cancel').disabled=true;}
}
$('render').onclick=render;$('cancel').onclick=()=>abort?.abort();
$('save').onclick=()=>{const a=document.createElement('a');a.download='clearwater-bend2-webgpu.png';a.href=canvas.toDataURL('image/png');a.click();};
window.bendWebGPULab={render,get adapter(){return adapter;}};
render();
