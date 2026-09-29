// Real CUDA execution of checked Bend: high-bit division, zero divisors, U32
// overflow, repeated small-helper calls, and caller variables live after calls.
import {compile} from './compiler.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const source=await readFile('compiler/scalar-regression.bend','utf8');
const built=await compile(source);
await mkdir('generated/compiler-regression',{recursive:true});
const cuda=resolve('generated/compiler-regression/probe.cu');
await writeFile(cuda,built.cuda());
execFileSync('python',['scripts/run-cuda.py'],{stdio:'inherit',env:{...process.env,BEND_CUDA_SOURCE:cuda,BEND_CUDA_REPORT_DIR:resolve('generated/compiler-regression')}});
const actual=await readFile('generated/compiler-regression/cuda-rgb.bin');
const {default:B}=await import('data:text/javascript;base64,'+Buffer.from(built.javascript).toString('base64'));
const mix=x=>BigInt.asUintN(32,x*1664525n+1013904223n);
for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const a=4294967295n-BigInt(x),b=BigInt(y&31);
  const q=b===0n?0n:a/b,r=b===0n?a:a%b;
  const expected=Number((q^r^mix(BigInt(x))^mix(BigInt(y))^BigInt(x))&16777215n);
  assert.equal(B.probe(x,y),expected,`JS oracle ${x},${y}`);
  assert.equal(actual.readUIntBE((y*128+x)*3,3),expected,`generated CUDA ${x},${y}`);
}
await writeFile('reports/cuda-emitter.json',JSON.stringify({passed:true,pixels:16384,oracle:'independent BigInt and unmodified upstream JavaScript',checks:['unsigned division near 2^32','division and remainder by zero','wrapping multiplication','inlined helper caller liveness']},null,2)+'\n');
console.log('16,384 CUDA compiler regression pixels passed.');
