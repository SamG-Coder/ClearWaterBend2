import Bend from '../generated/clearwater.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
const width=128,height=128,expected=new Uint8Array(width*height*3);
function flatten(t,x,y,size){
  if(t.$==='Pix'){
    for(let yy=y;yy<y+size;yy++)for(let xx=x;xx<x+size;xx++){
      const i=(yy*width+xx)*3,p=t.color;expected[i]=(p>>>16)&255;expected[i+1]=(p>>>8)&255;expected[i+2]=p&255;
    }return;
  }
  assert.equal(t.$,'Qua');const half=size/2;
  flatten(t.tl,x,y,half);flatten(t.tr,x+half,y,half);flatten(t.bl,x,y+half,half);flatten(t.br,x+half,y+half,half);
}
flatten(Bend.main(),0,0,128);
const actual=await readFile('reports/cuda-rgb.bin');assert.equal(actual.length,expected.length);
let maxError=0,squared=0,different=0,overTwo=0;
for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-expected[i]);maxError=Math.max(maxError,error);squared+=error*error;different+=error!==0;overTwo+=error>2;}
const rms=Math.sqrt(squared/actual.length);
// The sources use Float32 throughout. libm/NVIDIA trig may round differently;
// Choppy inverse mapping and the sharp specular lobe amplify these small
// differences at a few pixels. Bound peak error to 4/255 and RMS to 0.15/255;
// also require 99.8% of channels to be identical. This is not bitwise parity.
const passes=(peak,rms,count)=>peak<=4&&rms<.15&&count/actual.length<.002;
assert.ok(passes(maxError,rms,different),`CUDA vs upstream JS image mismatch: max ${maxError}, RMS ${rms}, changed ${different}`);
let shiftedSum=0,shiftedPeak=0,shiftedCount=0;
for(let i=0;i<actual.length;i++){const e=Math.abs(actual[i]-expected[(i+3)%expected.length]);shiftedSum+=e*e;shiftedPeak=Math.max(shiftedPeak,e);shiftedCount+=e!==0;}
assert.ok(!passes(shiftedPeak,Math.sqrt(shiftedSum/actual.length),shiftedCount),'negative control: shifted render must fail');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),body=Buffer.concat([tag,data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),body.length+4);return out;}
function png(rgb){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;const rows=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++)Buffer.from(rgb).copy(rows,y*(width*3+1)+1,y*width*3,(y+1)*width*3);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
await writeFile('reports/cuda.png',png(actual));await writeFile('reports/javascript.png',png(expected));
const report={reference:'unmodified upstream Bend JavaScript compiler',target:'unmodified upstream Bend CUDA device compiler and scheduler',width,height,maxChannelError:maxError,rmsChannelError:rms,differentChannels:different,channelsOverTwo:overTwo,criteria:{maxChannelError:4,rmsChannelError:.15,changedChannelFraction:.002},shiftedImageNegativeControl:true,passed:true};
await writeFile('reports/cuda-parity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
