# Bend CUDA generator investigation

The comparison uses the original `reference/clearwater.cu` and both emitters on
the same checked `src/clearwater.bend`. The Bend program remains an ocean-core
port, not full feature parity with the original Clearwater demo.

The original CUDA uses 27 dedicated kernels and contiguous vector buffers.
Bend's generated CUDA includes a tagged heap, task scheduler and a work loop
with 150 function/continuation cases. The current Bend field is an immutable
binary tree. The emitter changes below do not change that representation.

## Corrected emission

The upstream flat-helper ABI wrote results through `Term*` output arrays and
returned a success flag. The patched emitter returns a typed record containing
both the flag and values. It preserves failure propagation and each result's
word size. Small nonrecursive scalar helpers can also inline, with separate
callee use tracking and a bounded expansion budget.

CUDA now uses native unsigned division; Metal retains its upstream workaround
for constant folding near `2^32`. Existing zero-divisor guards remain intact.
Reconstruction of an unchanged 32-bit word from its individual bits folds back
to the original word, with mutation and address-escape rejection.

| Generated property | Upstream emitter | Patched emitter |
|---|---:|---:|
| Helper output arrays | 237 | 0 |
| Reachable translated device functions | 68 | 57 |
| Work-loop scratch frame, U32 words | 681 | 29 |
| CUDA file, bytes | 349,199 | 350,079 |
| Translated evaluator, bytes, excluding adapter | 708,068 | 656,368 |

The extra result type declarations mean CUDA file size alone does not show the
improvement in its data flow. `cuda-generator-comparison.json` records hashes
and reproducible measurements.

## Validation and limits

Native CUDA passes the 128 × 128 Clearwater image comparison against the
unmodified JavaScript oracle: peak channel error 3/255 and RMS 0.0267/255.
A separate checked Bend program produces 16,384 CUDA pixels matching independent
BigInt arithmetic and JavaScript. The word-fold tests reject 14 mutation/layout
counterexamples. The original checker and numerical/render tests still pass.

These corrections do not establish that browser compilation is solved. The
original browser pipeline creation took 545.7 seconds. Intermediate helper
inlining took 507.0 seconds; adding typed return values took 505.8 seconds, with
both versions passing image parity. The final version, including the word fold,
took 325.5 seconds for pipeline creation and 2.95 seconds for evaluation/readback.
It passed image parity: peak RGB error 5/255, RMS 0.1552/255, with 11 differing
channels out of 3,072. This is about 40% less pipeline-creation time than the
original observed run, but still several minutes. `webgpu.json` includes the
hash of the shader actually fetched by the browser.

The long wait has been localized to creation of the `cw_step` pipeline, not to
a specific DXC or driver optimization pass. The remaining large work loop and
general task/heap representation still need profiling before attributing an
exact internal cause. A small change in timings from single runs is not a
controlled performance benchmark.
