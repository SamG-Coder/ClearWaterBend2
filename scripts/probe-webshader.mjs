// Optional diagnostic against a local WebShader checkout; not a build dependency.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const checkout=process.argv[2];
if(!checkout)throw Error('Usage: node scripts/probe-webshader.mjs <cuda-webshader checkout>');
const {compile}=await import(pathToFileURL(path.resolve(checkout,'src/compiler/compiler.js')));
const source=(await readFile('generated/clearwater-device.cu','utf8')).replace(/^\s*#pragma.*$/gm,'');
const revision=execFileSync('git',['-C',checkout,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
let report;
try {compile(source,{entry:'bend_dev',workgroupSize:[128,1,1]});report={revision,compiled:true,executed:false};}
catch(error){report={revision,compiled:false,executed:false,error:error.message};}
await writeFile('reports/webshader-probe.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
