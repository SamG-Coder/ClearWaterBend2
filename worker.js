import Bend from './generated/clearwater.mjs';
let texture;
function field(pixels, start, size) {
  if (size === 1) {
    const k = start * 4;
    return {$:'Leaf', value:{$:'V4',x:pixels[k]/255,y:pixels[k+1]/255,z:pixels[k+2]/255,w:1}};
  }
  const half=size/2;
  return {$:'Branch',left:field(pixels,start,half),right:field(pixels,start+half,half)};
}
function flatten(tree, out, i=0) {
  if(tree.$==='Pixel') {if(i<out.length)out[i]=tree.rgba;return i+1;}
  return flatten(tree.right,out,flatten(tree.left,out,i));
}
self.onmessage = async ({data}) => {
  try {
    if(data.type==='init') {
      const bitmap=await createImageBitmap(await (await fetch('./assets/seabed.jpg')).blob());
      const canvas=new OffscreenCanvas(128,128),ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0,128,128);
      texture=field(ctx.getImageData(0,0,128,128).data,0,128*128);
      bitmap.close();self.postMessage({type:'ready'});return;
    }
    const {state,width,height}=data;
    const start=performance.now();
    const ocean=Bend.ocean(BigInt(state.fft),42,state.time,state.sea,state.depth);
    const simulationMs=performance.now()-start;
    const camera={$:'Camera',x:state.x,y:state.y,z:state.z,yaw:state.yaw,pitch:state.pitch,depth:state.depth,exposure:state.exposure};
    const tree=Bend.render_frame(BigInt(Math.ceil(Math.log2(width*height))),0,width,height,camera,ocean,texture,128);
    const pixels=new Uint32Array(width*height);flatten(tree,pixels);
    self.postMessage({type:'frame',pixels,width,height,simulationMs,totalMs:performance.now()-start,time:state.time},[pixels.buffer]);
  }catch(e){self.postMessage({type:'error',message:e.stack||String(e)});}
};
