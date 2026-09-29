# Clearwater

A real **Bend 2** port of Clearwater's ocean core, with an upstream JavaScript
reference view, an independently executed NVIDIA CUDA render, and an experimental
WebGPU evaluator hosted by CUDA WebShader.

The implementation is [`src/clearwater.bend`](src/clearwater.bend). It passes the
unmodified upstream Bend 2 checker and compiles through the unmodified upstream
JavaScript and CUDA emitters. There are no foreign rendering functions, added
language primitives, unchecked definitions or hidden calls to the old CUDA ocean.

**Status: incomplete Clearwater feature port; experimental WebGPU runtime.**
The ocean core is genuine Bend 2. `index.html` is the interactive JavaScript CPU
reference; `webgpu.html` executes the generated evaluator on WebGPU using CUDA
WebShader. Generated CUDA functions are translated directly into WGSL. Initial
driver compilation can take several minutes. Native CUDA runs separately through
the Windows adapter. All rendering arithmetic uses Float32; small rounding
differences between backends are expected.

## Run

Requires Node.js 24+, Git and `clang++` on PATH (`CXX` can override it). The compiler version is pinned and checked at build
time; do not replace the submodule with an arbitrary Bend version.

```powershell
git submodule update --init --recursive
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:5182**. Drag to look; WASD moves; E/Q changes camera height.
The controls change the actual Bend calculation. Default FFT preview size is
64 × 64 in each of three cascades; 256 × 256 matches Clearwater's original size.
The small reference frame is deliberate: this browser path executes on the CPU.
Play advances simulation time by 0.08 seconds per completed reference frame.

Open **http://127.0.0.1:5182/webgpu.html** for GPU execution. It defaults to a
32 × 32 image with the same three 32 × 32 FFT cascades and optical calculation
as the native showcase. Image sizes 16, 32, 64 and 128 are available. Scene time,
camera and water settings are currently fixed by the Bend `render_scene` function.
The page has progress, cancellation, rerendering and PNG export. There is no
CPU-rendering fallback on this page. It requires WebGPU and a device exposing at
least a 128 MiB storage-buffer binding limit. Static hosting requires HTTPS
(localhost also works).

## What has been ported

| System | Current implementation |
| --- | --- |
| Spectrum | Original U32 hash and Gaussian seeds, three 4.6 m / 37 m / 293 m cascades, slope normalization |
| Wave evolution | Gravity/capillary dispersion, finite water depth, Hermitian pairing, Nyquist handling |
| FFT | Packed two-channel Stockham 2D transform, structurally terminating recursion, balanced parallel calls |
| Choppy surface | Horizontal displacement spectrum, second FFT, three-step inverse mapping, Jacobian normal correction |
| Surface sampling | Periodic bilinear sampling, distance filtering and slope variance |
| Optics | Five-step water intersection, Fresnel, refraction, specular response, seabed texture, absorption, scattering, haze and tone mapping |
| View | Original camera projection, horizon terrain, free camera and ocean controls |
| CUDA | Upstream-generated device program and fork/join scheduler, executed on RTX 5080 and compared with upstream JS |
| Still to port | Stateful storm response, volumetric clouds, rain/lightning, ripple simulation, photon caustics, persistent foam/bubbles/spray, buoy, bloom and diffraction glare |
| Browser GPU | Upstream CUDA functions and control flow compiled through Clang's typed AST directly into WGSL; CUDA WebShader handles GPU resources and dispatch |

A direct probe against CUDA WebShader at `ef46ff1` was also performed. After
preprocessing the device source, its compiler rejects Bend's
`typedef unsigned long long u64`. The generated runtime depends on 64-bit tagged
terms, reference counts, allocator and scheduler state. Browser GPU support needs
an actual lowering/runtime implementation. This repository now supplies that
bridge in `src/webgpu/`, rather than passing the unsupported source to the old
parser. The original observed failure is recorded in
[`reports/webshader-probe.json`](reports/webshader-probe.json).

`Field`, `Ocean`, `Camera` and `Frame` are ordinary checked Bend datatypes. `Field`
is an immutable binary tree so independent parallel tasks can share reads. It is
not a new built-in array or GPU operation. Frame computation and all optical math
are Bend; JavaScript handles input, image decoding, data marshaling and presentation.
The plain-color seabed in the small native test is intentional: it isolates
CUDA/JavaScript/WebGPU parity without a browser image decoder.

## WebGPU execution

`npm run build` checks real Bend, emits CUDA with the unmodified upstream
compiler, obtains its typed C++ AST from Clang, and lowers the reachable evaluator.
The build emits directly compiled WGSL functions and a WebGPU runtime adapter.
It does not emit bytecode, run an instruction interpreter, translate an imitation
language or substitute the original CUDA ocean equations.
`generated/webgpu-manifest.json` records source/output hashes and dependency pins.

The bridge retains 64-bit tagged terms as two U32 words, a reference-counted heap,
and upstream task continuations. C arithmetic, branches, loops and function calls
become ordinary WGSL shader code. Task continuations become eligible in a later
dispatch, and retired heap blocks are
recycled only after the task round ends. This replaces CUDA acquire/release and
scheduler behavior with WebGPU command boundaries.

`webgpu.js` uses CUDA WebShader's `GpuRuntime.kernel(artifact)`, buffers, batches
and readback APIs. All ocean math executes in the generated GPU evaluator.
JavaScript handles scheduling, progress and pixel presentation. This is a bridge
for the pinned Bend device ABI and this pure image program, not general CUDA
support, arbitrary Bend IO, or a performance-equivalent native CUDA runtime.

## Actual CUDA execution

With Python 3, an NVIDIA GPU and the CUDA toolkit/NVRTC installed locally:

```powershell
npm run build
python scripts/run-cuda.py
node scripts/compare-cuda.mjs
```

`generated/clearwater.cu` comes directly from upstream `Comp.compile_book`. The
Windows adapter allocates a 1 GiB device heap, initializes upstream's documented-in-
source layout, launches its unchanged `bend_dev` scheduler, and reads the image.
This avoids the POSIX host and concurrent managed access requirements of upstream's
native launcher. The adapter is tied to the pinned compiler layout. It is not a
general replacement for upstream's IO host or a WebGPU backend.

The test renders `showcase!()` at 128 × 128, with 32 × 32 wave cascades. Native
timing includes simulation, rendering, scheduler launches and image readback; it
excludes compilation and initial heap allocation/clearing. These are correctness
measurements, not a real-time or high-resolution performance claim.

On an upstream-supported native host, the same source can also be checked with
`bend src/clearwater.bend --check-only`. `main` returns the standard Bend `Image`
datatype; it does not open a window. The repo check exercises the TypeScript
checker; a Lean/BendTT `--verdict` run has not been performed.

## Verification

```powershell
node scripts/native-reference.mjs  # needs clang++; compiles original CUDA math as C++
npm test
node scripts/browser-test.mjs     # with npm start running; Edge on Windows
npm run test:webgpu              # real local WebGPU; arithmetic and image parity
```

Tests compare FFTs with a direct DFT, spectrum/evolution/Fresnel values with the
original compiled Clearwater equations, periodic sampling at seams, checker
rejection of false proofs and affine misuse, and a nontrivial rendered image.
The native GPU image is independently compared with upstream-generated JS.
Browser tests check initial render and a depth change.

WebGPU arithmetic tests compare 23,895 operations with BigInt, including 64-bit
overflow and shifts from 0 through 64. The GPU image test uses the real WebShader
host and compares with upstream JavaScript at the same resolution, with a shifted
image as a negative control. Adapter tests check heap/queue exhaustion and verify
that retired blocks cannot be reused before a later dispatch. Native GPU builds stay local; CI builds the browser
artifacts and checks the CPU reference without claiming hosted GPU validation.

Evidence is in [`reports/verification.json`](reports/verification.json),
[`reports/cuda.json`](reports/cuda.json),
[`reports/cuda-parity.json`](reports/cuda-parity.json), and
[`reports/browser.json`](reports/browser.json). WebGPU evidence is written to
`reports/webgpu.json`, `reports/webgpu-u64.json` and `reports/webgpu-runtime.json`.
The reference CUDA source is kept
only for tests and is excluded from the browser distribution.

## Licensing

Clearwater's original MIT attribution and seabed texture attribution are retained.
Bend's Apache-2.0 license is included and copied into the static build alongside
the generated runtime. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
