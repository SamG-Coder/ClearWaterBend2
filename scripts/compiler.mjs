// Upstream parser/checker/JS oracle, with a reproducible C/CUDA emitter patch.
// No language patches or extra primitives.
import * as Bend from '../vendor/bend/bend2/bend.ts';
import * as Comp from '../vendor/bend/bend2/comp.ts';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {loadCudaEmitter,emitterVersion} from '../compiler/cuda-emitter.mjs';
export const revision = '3378e6237ed431d17629efd36d24c96241815b7e';
export async function compile(sourceOverride) {
  try {
  const cwd = new URL('../vendor/bend/', import.meta.url);
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {cwd, encoding:'utf8'}).trim();
  if (actual !== revision) throw Error(`Unexpected Bend revision: ${actual}`);
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'bend2'], {cwd});
  const source = sourceOverride ?? await readFile(new URL('../src/clearwater.bend', import.meta.url), 'utf8');
  if (/^\s*(law |@unsafe|foreign |import (?!Base\s*$))/m.test(source))
    throw Error('Clearwater must use checked Bend definitions and the standard Base library only.');
  const book = Bend.book_nil();
  const base = await readFile(new URL('../vendor/bend/bend2/base.bend', import.meta.url), 'utf8');
  // Avoid upstream POSIX import-path assumptions on Windows. Source parsing,
  // elaboration and checking are the unmodified upstream.
  Bend.parse_book(book, '', base, '', {});
  for (const key of book.order) book.tlds[key].b = true;
  Bend.parse_book(book, '', source.replace(/^import Base\s*$/m, ''), '', {});
  Bend.book_valid(book);
  if (book.hols) throw Error(`Unfilled holes: ${book.hols}`);
  const cudaCompiler=process.env.BEND_CUDA_UPSTREAM==='1'?Comp:await loadCudaEmitter();
  const cudaVersion=process.env.BEND_CUDA_UPSTREAM==='1'?'upstream':emitterVersion;
  return {book, source, javascript:Comp.js_lib(book, true), cuda:()=>`// Bend CUDA emitter: ${cudaVersion}\n`+cudaCompiler.compile_book(book)};
  } catch (error) {
    if (error?.$ === 'Err') throw Error(Bend.err_show(error));
    throw error;
  }
}
