// SPDX-License-Identifier: Apache-2.0
// Reproducible changes to the pinned Bend 2 C/CUDA emitter. The checker and
// JavaScript oracle stay upstream. No generated CUDA text is rewritten.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {patchReturnValues} from './return-values.mjs';

export const emitterVersion='cuda-scalar-v1';
export async function loadCudaEmitter() {
  let source=(await readFile(new URL('../vendor/bend/bend2/comp.ts',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  const anchor='  if (!flat) {\n    return emit_body({ ...fl, def: k }, h!, T, ers,';
  const replacement=`  // Clearwater compiler patch: keep small scalar helpers in their caller.
  // Upstream's spin ABI otherwise spills results through Term[] even when the
  // function is a few arithmetic operations. Exclude recursive and boxed
  // layouts and cap expansion using the existing per-emission fuel budget.
  const inlineNodes = flat && h !== null && !loop_of(fl, k).length
    && !ret.ks.includes("box") && lays.every(l => !l.ks.includes("box"))
    ? term_nodes(fl, h!) : Infinity;
  const inlineSmall = inlineNodes <= 24 && FUEL >= inlineNodes;
  if (inlineSmall) {
    FUEL -= inlineNodes;
    if (tail) bind_dead(fl, []);
    return emit_body({ ...fl, def: k, uses: new Map(), rest: [] }, h!, T, ers,
      lays.map((lay) => val_new(ws.splice(0, lay.ks.length), lay)), dst);
  }
  if (!flat) {
    return emit_body({ ...fl, def: k }, h!, T, ers,`;
  if(source.split(anchor).length!==2)throw Error('Pinned Bend emitter patch anchor mismatch');
  source=source.replace(anchor,replacement);
  // U32_QUO's expanded quotient corrects a documented Metal constant-folding
  // bug. CUDA has exact unsigned division; keep that workaround on Metal only.
  const quotient='  ((a) / 2 / (b) * 2 + ((a) - (a) / 2 / (b) * 2 * (b) >= (b)))';
  if(source.split(quotient).length!==2)throw Error('Pinned quotient patch anchor mismatch');
  source=source.replace(quotient,quotient+'\n#ifndef __METAL_VERSION__\n#undef U32_QUO\n#define U32_QUO(a, b) ((u32)(a) / (u32)(b))\n#endif');
  source=patchReturnValues(source);
  const repackAnchor='    if (vs.length === 1 && vs[0].ws.length > 1) {';
  if(source.split(repackAnchor).length!==2)throw Error('Pinned word emitter patch anchor mismatch');
  source=source.replace(repackAnchor,repackAnchor+'\n      const original = repack_word(fl, vs[0].ws);\n      if (original !== null) return val_new([original], lay);');
  source=(await readFile(new URL('./repack-word.ts.inc',import.meta.url),'utf8'))+'\n'+source;
  source=source.replace('from "./bend.ts"','from "../../vendor/bend/bend2/bend.ts"');
  const hash=createHash('sha256').update(source).digest('hex');
  const directory=new URL('../generated/compiler/',import.meta.url);
  await mkdir(directory,{recursive:true});
  const target=new URL(`comp-${hash}.ts`,directory);
  await writeFile(target,source);
  return import(target.href);
}
