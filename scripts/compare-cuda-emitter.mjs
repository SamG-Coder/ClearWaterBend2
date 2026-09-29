// Compare both real Bend emitters on the same checked source book.
import {compile,revision} from './compiler.mjs';
import * as upstream from '../vendor/bend/bend2/comp.ts';
import {emitterVersion} from '../compiler/cuda-emitter.mjs';
import {cudaAST} from '../src/webgpu/clang.mjs';
import {lower} from '../src/webgpu/lower.mjs';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const built=await compile();
const baseline=upstream.compile_book(built.book),optimized=built.cuda();
async function measure(cuda){
  const ast=await cudaAST(cuda),wgsl=lower(ast);
  return {cudaBytes:Buffer.byteLength(cuda),cudaSha256:createHash('sha256').update(cuda).digest('hex'),deviceFunctions:wgsl.functions.length,workLoopScratchWords:wgsl.functions.find(f=>f.name==='work_loop').privateWords,helperOutputArrays:(cuda.match(/Term _o_\d+\[\d+\];/g)||[]).length,loweredEvaluatorBytes:Buffer.byteLength(wgsl.source)};
}
const report={bendRevision:revision,cudaEmitter:emitterVersion,bendSourceSha256:createHash('sha256').update(built.source).digest('hex'),baseline:await measure(baseline),optimized:await measure(optimized)};
await writeFile('reports/cuda-generator-comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(report);
