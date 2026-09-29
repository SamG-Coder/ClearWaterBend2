import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';

// Clang supplies a typed AST for the CUDA emitted by upstream Bend. It does not
// parse or alter Bend source. Only the runtime's lane geometry is configured.
export async function cudaAST(cuda) {
  const configured=cuda.replace('#define CUBE_T    128','#define CUBE_T    32');
  if(configured===cuda)throw Error('Unsupported upstream lane configuration');
  const declarations=`
struct cw_dim { unsigned int x,y,z; };
extern cw_dim threadIdx,blockIdx,blockDim,gridDim;
void __threadfence(); void __syncthreads(); int __clz(int);
unsigned int atomicCAS(unsigned int*,unsigned int,unsigned int);
unsigned int atomicAdd(unsigned int*,unsigned int);
unsigned int atomicSub(unsigned int*,unsigned int);
float sin(float); float cos(float); float tan(float); float asin(float);
float acos(float); float atan(float); float atan2(float,float);
float sqrt(float); float exp(float); float log(float); float log2(float);
float exp2(float); float pow(float,float); float floor(float); float ceil(float);
float trunc(float); float fabs(float); float fmod(float,float);
float fmin(float,float); float fmax(float,float);
`;
  await mkdir('generated',{recursive:true});
  const metadata='\n'+['HEAP_OFF','ALC_OFF','STAK_OFF','STAT_OFF','STAT_LEN','CUBE','LANES','FID_RENDER_SCENE'].map(k=>`static const u64 CW_${k} = ${k};`).join('\n');
  await writeFile('generated/webgpu-device.cpp',declarations+configured+metadata);
  const options=['-x','c++','-std=c++17','-Wno-unknown-pragmas','-Wno-ignored-attributes'];
  execFileSync(process.env.CXX||'clang++',[...options,'-D__CUDACC_RTC__=1','-DCUBE_LOG=5','-D__global__=','-D__shared__=','-E','-P','generated/webgpu-device.cpp','-o','generated/webgpu-pre.cpp'],{stdio:'inherit'});
  const output=openSync('generated/webgpu-ast.json','w');
  try {execFileSync(process.env.CXX||'clang++',[...options,'-fsyntax-only','-Xclang','-ast-dump=json','generated/webgpu-pre.cpp'],{stdio:['ignore',output,'inherit']});}finally{closeSync(output);}
  const raw=await readFile('generated/webgpu-ast.json','utf8');
  return JSON.parse(raw);
}
