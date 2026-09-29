# Bend 2 CUDA emitter changes

`cuda-emitter.mjs` patches the pinned upstream `bend2/comp.ts` in an isolated,
content-addressed build copy. It modifies the actual emitter before compilation,
not Clearwater's generated CUDA. The upstream checkout, parser, checker, Base
library and JavaScript oracle stay unchanged. The patch is Apache-2.0, as is the
upstream compiler. No Bend primitives or foreign rendering functions are added.

The patch currently does four things:

- Inline small flat helpers (at most 24 intermediate-language nodes) instead of
  using a `spin_*` status return and a `Term[]` output buffer. Recursive functions
  and boxed layouts are excluded. The existing emission fuel bounds expansion.
  Callee use tracking is isolated so cleanup cannot consume caller variables.
- Return other flat-helper results as typed records by value instead of through
  `Term*` output arrays. The success flag and early failure returns are preserved;
  `w32` results stay 32-bit and boxed/wide results keep their original word size.
  The bridge supports these emitted records as ordinary WGSL structs.
- Emit direct unsigned division on non-Metal targets. Upstream's `U32_QUO`
  expansion works around a documented Metal constant-folding bug near `2^32`;
  Metal retains that workaround. The existing guards preserve Bend's division
  and remainder semantics for zero divisors.
- Reuse a 32-bit word when the emitter is about to reconstruct it from its own
  unchanged bit projections. Reject mismatched projections, assignments and
  address escapes. This preserves Float32 bit patterns without a numeric cast.

This does not convert immutable trees into contiguous arrays or remove Bend's
task runtime. Those require further compiler representation analysis, not a
substitution of the original Clearwater implementation.

Build normally with `npm run build`. Set `BEND_CUDA_UPSTREAM=1` to generate the
upstream baseline for comparisons. `npm run test:cuda-emitter` runs a separate
checked Bend program on NVIDIA CUDA and compares 16,384 pixels against independent
BigInt arithmetic and the upstream JavaScript emitter. It covers high-bit
division, zero divisors, wrapping multiplication and caller values across repeated
helper calls. `npm run test:cuda` compares the actual Clearwater GPU image with
the JavaScript oracle. GPU tests require local NVIDIA hardware and are not CI.

`node --experimental-transform-types scripts/compare-cuda-emitter.mjs` compares
both emitters using the same checked book. The current Clearwater result removes
all 237 helper output arrays, reduces reachable device functions from 68 to 57,
and reduces the work loop's translated scratch frame from 681 to 29 U32 words.
Generated CUDA grows slightly because typed result declarations are explicit;
the translated evaluator shrinks from 708,068 to 656,368 bytes. These structural
measurements are not a promise of a particular driver compilation time.
