import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const fragment=await readFile('compiler/repack-word.ts.inc','utf8');
const repack=new Function(stripTypeScriptTypes(fragment)+'\nreturn repack_word;')();
const bits=Array.from({length:32},(_,i)=>`bit_${i}`);
const lines=bits.map((b,i)=>`u32 ${b} = ((word >> ${i}) & 1);`);
const run=(statements=lines,values=bits)=>repack({seg:{lines:statements}},values);
assert.equal(run(),'((u64)(u32)(word))');
for(const edit of ['word = 9;','word += 1;','word <<= 1;','++word;','word--;','escape(&word);',
  'bit_0 = 1;','bit_0 ^= 1;','--bit_0;','escape(&bit_0);'])assert.equal(run([...lines,edit]),null,edit);
assert.equal(run(lines,[...bits].reverse()),null);
assert.equal(run(lines,bits.slice(1)),null);
assert.equal(run(lines.map((l,i)=>i===31?l.replace('word','different'):l)),null);
assert.equal(run(lines.map((l,i)=>i===3?l.replace('& 1','& 0'):l)),null);
console.log('Word reconstruction fold: identity accepted; 14 mutation/layout cases rejected.');
