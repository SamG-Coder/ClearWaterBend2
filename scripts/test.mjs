import assert from 'node:assert/strict';
import {compile,revision} from './compiler.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const built=await compile();
const {default:B}=await import('data:text/javascript;base64,'+Buffer.from(built.javascript).toString('base64'));
const checks=[];
await assert.rejects(compile(built.source+'\ndef invalid() -> {0 == 1 : U32}:\n  {==}\n'),/Error/);
await assert.rejects(compile(built.source.replace('def hashU(+x: U32)','def hashU(x: U32)')),/consumed more than once/);
checks.push({name:'Unmodified checker rejects false proof and affine double use',passed:true});
function close(a,b,tolerance,label){assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${label}: ${a} vs ${b} (tol ${tolerance})`);}
function leaf(x,y=0,z=0,w=0){return {$:'Leaf',value:{$:'V4',x,y,z,w}};}
function field(values){if(values.length===1)return leaf(...values[0]);const n=values.length/2;return {$:'Branch',left:field(values.slice(0,n)),right:field(values.slice(n))};}
function flatten(t,out=[]){if(t.$==='Leaf')out.push([t.value.x,t.value.y,t.value.z,t.value.w]);else{flatten(t.left,out);flatten(t.right,out);}return out;}
function hash(x){x^=x>>>16;x=Math.imul(x,2146121005);x^=x>>>15;x=Math.imul(x,2221713035);return (x^(x>>>16))>>>0;}
for(const x of [0,1,123,0x7fffffff,0x80000000,0xffffffff])assert.equal(B.hashU(x),hash(x));
checks.push({name:'U32 hash including overflow and high bit',passed:true});
for(const n of [4,8,16]){
  const input=Array.from({length:n*n},(_,i)=>[Math.sin(i*.71),Math.cos(i*.37),Math.sin(i*.13),Math.cos(i*.23)]);
  for(const sign of [-1,1]){
    const actual=flatten(B.fft2(BigInt(Math.log2(n)),field(input),sign));let maxError=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const want=[0,0,0,0];
      for(let j=0;j<n;j++)for(let i=0;i<n;i++){
        const angle=sign*2*Math.PI*(x*i+y*j)/n,c=Math.cos(angle),s=Math.sin(angle),v=input[j*n+i];
        for(let k=0;k<4;k+=2){want[k]+=v[k]*c-v[k+1]*s;want[k+1]+=v[k]*s+v[k+1]*c;}
      }
      actual[y*n+x].forEach((v,k)=>{maxError=Math.max(maxError,Math.abs(v-want[k]));close(v,want[k],.0001*n,'FFT vs direct DFT');});
    }
    checks.push({name:`${n}x${n} packed FFT sign ${sign} vs independent DFT`,maxError,passed:true});
  }
}
const fixture=JSON.parse(await readFile('reports/native-reference.json','utf8'));
let maxSeedRelative=0,maxEvolveRelative=0;
for(const cell of fixture.cells){
  const v=B.seed_cell(cell.id,256,cell.c,42);
  [v.x,v.y].forEach((a,k)=>{const e=cell.seed[k],tol=Math.max(1e-7,Math.abs(e)*.00015);close(a,e,tol,'original CUDA seed');maxSeedRelative=Math.max(maxSeedRelative,Math.abs(a-e)/Math.max(1e-6,Math.abs(e)));});
  const x=cell.id%256,z=Math.floor(cell.id/256),j=((256-z)%256)*256+(256-x)%256;
  const b=B.seed_cell(j,256,cell.c,42);
  const actual=B.evolve_values(v,b,x,z,256,cell.c,[.017,.002,.0004][cell.c],4,1,1.8);
  [actual.x,actual.y,actual.z,actual.w].forEach((a,k)=>{const e=cell.evolved[k];close(a,e,Math.max(.000002,Math.abs(e)*.0003),'original CUDA evolution');maxEvolveRelative=Math.max(maxEvolveRelative,Math.abs(a-e)/Math.max(.0001,Math.abs(e)));});
  const opposite=B.evolve_values(b,v,j%256,Math.floor(j/256),256,cell.c,[.017,.002,.0004][cell.c],4,1,1.8);
  const kx=x===128?0:x<128?x:x-256,kz=z===128?0:z<128?z:z-256;
  const chop=B.chop_values(actual,opposite,kx,kz,cell.c,1);
  [chop.x,chop.y,chop.z,chop.w].forEach((a,k)=>close(a,cell.chop[k],Math.max(.000002,Math.abs(cell.chop[k])*.0004),'original CUDA chop'));
}
fixture.fresnel.forEach((x,i)=>close(B.fresnel(Math.fround(i*.1)),x,1e-6,'original CUDA Fresnel'));
checks.push({name:'Original Clearwater CUDA source compiled to C++ oracle',cells:fixture.cells.length,maxSeedRelative,maxEvolveRelative,passed:true});
const wrap=field(Array.from({length:16},(_,i)=>[i,0,0,0]));
close(B.sample4(wrap,-.25,0,4).x,.75,1e-6,'negative coordinate wrap');
close(B.sample4(wrap,3.75,0,4).x,.75,1e-6,'positive coordinate wrap');
checks.push({name:'Bilinear wrap across both sides of seam',passed:true});
const ocean=B.ocean(5n,42,4,1,1.8);
const camera={$:'Camera',x:0,y:1.55,z:0,yaw:0,pitch:-.24,depth:1.8,exposure:1};
const texture=leaf(.3,.27,.2,1);
const pixels=new Set();for(let y=0;y<36;y++)for(let x=0;x<64;x++){const p=B.pixel(camera,ocean,texture,1,x,y,64,36);assert.equal(p>>>24,255);pixels.add(p);}
assert.ok(pixels.size>400,`nontrivial render: ${pixels.size} distinct pixels`);
checks.push({name:'64x36 Bend render, finite packed opaque image',distinctPixels:pixels.size,passed:true});
await mkdir('reports',{recursive:true});await writeFile('reports/verification.json',JSON.stringify({bendRevision:revision,backend:'unmodified upstream JavaScript emitter',checks},null,2)+'\n');
console.log(`${checks.length} numerical/render checks passed.`);
