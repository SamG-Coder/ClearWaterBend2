// SPDX-License-Identifier: Apache-2.0
// Patch the Bend emitter's internal flat-helper ABI, retaining its status word.
import {readFileSync} from 'node:fs';
export function patchReturnValues(source) {
  function replace(before,after){
    if(source.split(before).length!==2)throw Error('Bend value-return patch anchor mismatch: '+before.slice(0,60));
    source=source.replace(before,after);
  }
  replace('  file_push(fl, `Term ${o}[${out.ws.length}];`);','');
  replace('  block(fl, `if (${name}(${["e", o, ...xs].join(", ")}) == 0) {`, () => {',
    '  file_push(fl, `BendResult_${name} ${o} = ${name}(${["e", ...xs].join(", ")});`);\n  block(fl, `if (${o}.ok == 0) {`, () => {');
  replace('  out.ws.forEach((v, j) => file_push(fl, `${v} = ${o}[${j}];`));',
    '  out.ws.forEach((v, j) => file_push(fl, `${v} = ${o}.v${j};`));');
  const start=source.indexOf('  fl.spins.push({ ...seg, lines:');
  const end=source.indexOf('  return name;',start);
  if(start<0||end<0)throw Error('Bend native helper emitter missing');
  source=source.slice(0,start)+readFileSync(new URL('./native-result.ts.inc',import.meta.url),'utf8')+source.slice(end);
  return source;
}
