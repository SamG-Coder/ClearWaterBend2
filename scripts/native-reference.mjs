// Execute selected functions from the original CUDA source as ordinary C++.
// CUDA launch indices are supplied explicitly; all numerical bodies are verbatim.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const original=await readFile('reference/clearwater.cu','utf8');
function extract(name) {
  const match=new RegExp('__(?:device|global)__[^\\n]*\\b'+name+'\\(').exec(original);
  if(!match)throw Error('Missing original function '+name);
  const begin=match.index,open=original.indexOf('{',begin);
  let depth=1,end=open+1;
  while(depth){const c=original[end++];if(c==='{')depth++;if(c==='}')depth--;}
  return original.slice(begin,end).replace(/__(?:device|global)__/g,'');
}
const names=['sat','square','lerp','smooth','hashU','random','lengthL','wrap','windDensity','seed_spectrum','evolve_spectrum','chop_spectrum','fresnel'];
const code=`#include <cmath>
#include <cstdio>
#include <vector>
struct float2 {float x,y;}; struct float4 {float x,y,z,w;};
float2 make_float2(float x,float y){return {x,y};}
float4 make_float4(float x,float y,float z,float w){return {x,y,z,w};}
float rsqrtf(float x){return 1.0f/sqrtf(x);}
struct dim3 {unsigned x,y,z;}; dim3 blockIdx{0,0,0},blockDim{1,1,1},threadIdx{0,0,0};
${names.map(extract).join('\n')}
int main(){
 std::vector<float2> seed(196608);std::vector<float4> output(196608),chop(196608);std::vector<float> energy(196608,1);
 float scales[3]={0.017f,0.002f,0.0004f};float4 weather[2]={{5,0,0,0},{.8f,.6f,0,0}};
 for(unsigned c=0;c<3;c++)for(unsigned z=0;z<256;z++)for(unsigned x=0;x<256;x++){blockIdx={x,z,c};seed_spectrum(seed.data(),42);}
 for(unsigned c=0;c<3;c++)for(unsigned z=0;z<256;z++)for(unsigned x=0;x<256;x++){blockIdx={x,z,c};evolve_spectrum(seed.data(),scales,output.data(),4.0f,1.0f,1.8f,weather,energy.data(),0.0f);}
 printf("{\\\"cells\\\":[");bool first=true;
 unsigned ids[]={0,1,127,128,129,255,256,32768,32896,65535,18537,65278};
 for(unsigned c=0;c<3;c++)for(unsigned id:ids){
  blockIdx={id%256,id/256,c};unsigned offset=c*65536+id;
  evolve_spectrum(seed.data(),scales,output.data(),4.0f,1.0f,1.8f,weather,energy.data(),0.0f);
  chop_spectrum(output.data(),chop.data(),1.0f);
  auto a=seed[offset];auto b=output[offset];auto d=chop[offset];
  printf("%s{\\\"id\\\":%u,\\\"c\\\":%u,\\\"seed\\\":[%.10g,%.10g],\\\"evolved\\\":[%.10g,%.10g,%.10g,%.10g],\\\"chop\\\":[%.10g,%.10g,%.10g,%.10g]}",first?"":",",id,c,a.x,a.y,b.x,b.y,b.z,b.w,d.x,d.y,d.z,d.w);first=false;
 }
 printf("],\\\"fresnel\\\":[");for(int i=0;i<=10;i++)printf("%s%.10g",i?",":"",fresnel(i*.1f));printf("]}\\n");
}
`;
await mkdir('generated',{recursive:true});
await writeFile('generated/reference.cpp',code);
const executable=path.resolve('generated/reference'+(process.platform==='win32'?'.exe':''));
execFileSync(process.env.CXX||'clang++',['-std=c++17','-O2','-ffp-contract=off','generated/reference.cpp','-o',executable],{stdio:'inherit'});
const fixture=JSON.parse(execFileSync(executable,{encoding:'utf8'}));
await mkdir('reports',{recursive:true});
await writeFile('reports/native-reference.json',JSON.stringify(fixture,null,2)+'\n');
console.log(`Original Clearwater C++ oracle: ${fixture.cells.length} spectrum cells and ${fixture.fresnel.length} Fresnel angles.`);
