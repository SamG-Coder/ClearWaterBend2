import {compile, revision} from './compiler.mjs';
import {mkdir, writeFile, copyFile} from 'node:fs/promises';
const result = await compile();
console.log(`Checked ${result.book.order.length} definitions with upstream Bend 2 (${revision}).`);
if (!process.argv.includes('--check')) {
  await mkdir('generated', {recursive:true});
  await writeFile('generated/clearwater.mjs', result.javascript);
  await writeFile('generated/clearwater.cu', result.cuda());
  console.log('Generated JavaScript and CUDA using the unmodified upstream emitters.');
  await mkdir('dist/generated', {recursive:true});
  for (const file of ['index.html','style.css','app.js','worker.js','LICENSE','THIRD_PARTY_NOTICES.md','src/clearwater.bend','assets/seabed.jpg','licenses/Bend-Apache-2.0.txt']) {
    const target='dist/'+file;
    await mkdir(new URL('../'+target.substring(0,target.lastIndexOf('/')+1),import.meta.url),{recursive:true});
    await copyFile(file,target);
  }
  await copyFile('generated/clearwater.mjs','dist/generated/clearwater.mjs');
  await writeFile('dist/.nojekyll','');
}
