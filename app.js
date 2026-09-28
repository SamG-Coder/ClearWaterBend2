const canvas=document.querySelector('#water'),ctx=canvas.getContext('2d');
const status=document.querySelector('#status'),worker=new Worker('./worker.js',{type:'module'});
const state={x:0,y:1.55,z:0,yaw:0,pitch:-.24,time:4,sea:1,depth:1.8,exposure:1,fft:6};
const diagnostics=window.clearwaterDiagnostics={ready:false,errors:[],backend:'upstream-bend-javascript-cpu',frames:0,state};
let busy=false,dirty=true,ready=false,playing=false,width=256,height=144;
function render(){dirty=true;if(!ready||busy)return;busy=true;dirty=false;status.textContent='Rendering Bend frame…';worker.postMessage({type:'frame',state:{...state},width,height});}
worker.onmessage=({data})=>{
  if(data.type==='error'){diagnostics.errors.push(data.message);status.textContent='Bend execution failed — see console';console.error(data.message);busy=false;return;}
  if(data.type==='ready'){ready=true;render();return;}
  if(data.type==='frame'){
    canvas.width=data.width;canvas.height=data.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data.pixels.buffer),data.width,data.height),0,0);
    Object.assign(diagnostics,{ready:true,frames:diagnostics.frames+1,simulationMs:data.simulationMs,totalMs:data.totalMs});
    status.textContent=`${data.width} × ${data.height} · ${(data.totalMs/1000).toFixed(2)} s / reference frame`;
    busy=false;
    if(playing){state.time+=.08;render();}else if(dirty)render();
  }
};
worker.postMessage({type:'init'});
for(const name of ['sea','depth','exposure'])document.querySelector('#'+name).addEventListener('input',e=>{state[name]=+e.target.value;document.querySelector('#'+name+'-value').value=state[name].toFixed(1)+(name==='depth'?' m':'');render();});
document.querySelector('#fft').onchange=e=>{state.fft=+e.target.value;render();};
document.querySelector('#resolution').onchange=e=>{width=+e.target.value;height=width*9/16;render();};
document.querySelector('#play').onclick=e=>{playing=!playing;e.target.textContent=playing?'Pause':'Play';if(playing)render();};
let drag;
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY,state.yaw,state.pitch];canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!drag)return;state.yaw=drag[2]-(e.clientX-drag[0])*.003;state.pitch=Math.max(-1.3,Math.min(1.1,drag[3]-(e.clientY-drag[1])*.003));render();};
canvas.onpointerup=()=>{drag=null;};
window.addEventListener('keydown',e=>{if(e.target.matches('input,select,button'))return;const k=e.key.toLowerCase(),speed=e.shiftKey?1.5:.4;let changed=true;if(k==='w'||k==='s'){const dir=k==='w'?1:-1;state.x+=Math.sin(state.yaw)*speed*dir;state.z-=Math.cos(state.yaw)*speed*dir;}else if(k==='a'||k==='d'){const dir=k==='d'?1:-1;state.x+=Math.cos(state.yaw)*speed*dir;state.z+=Math.sin(state.yaw)*speed*dir;}else if(k==='e'||k==='q')state.y=Math.max(.15,state.y+(k==='e'?speed:-speed));else changed=false;if(changed){e.preventDefault();render();}});
window.clearwaterLab={state,render,seek(t){state.time=t;render();},pause(){playing=false;document.querySelector('#play').textContent='Play';},resume(){playing=true;document.querySelector('#play').textContent='Pause';render();}};
