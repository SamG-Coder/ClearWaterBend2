# Clearwater

A real **Bend 2** port of Clearwater's ocean core, with an upstream JavaScript
reference view and an independently executed NVIDIA CUDA render.

The implementation is [`src/clearwater.bend`](src/clearwater.bend). It passes the
unmodified upstream Bend 2 checker and compiles through the unmodified upstream
JavaScript and CUDA emitters. There are no foreign rendering functions, added
language primitives, unchecked definitions or hidden calls to the old CUDA ocean.

**Status: incomplete port.** The ocean core and reference renderer work. This is
not yet the full Clearwater feature set or a WebShader/WebGPU backend. The browser
explicitly identifies itself as the upstream JavaScript CPU reference. Native
CUDA runs separately through the included Windows host adapter.

## Run

Requires Node.js 24+ and Git. The compiler version is pinned and checked at build
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
| Browser GPU | Not implemented; the current page runs upstream-generated JavaScript in a worker |

A direct probe against CUDA WebShader at `ef46ff1` was also performed. After
preprocessing the device source, its compiler rejects Bend's
`typedef unsigned long long u64`. The generated runtime depends on 64-bit tagged
terms, reference counts, allocator and scheduler state. Browser GPU support needs
an actual lowering/runtime implementation; removing the typedef or renaming the
source would not preserve the program. The observed failure is recorded in
[`reports/webshader-probe.json`](reports/webshader-probe.json).

`Field`, `Ocean`, `Camera` and `Frame` are ordinary checked Bend datatypes. `Field`
is an immutable binary tree so independent parallel tasks can share reads. It is
not a new built-in array or GPU operation. Frame computation and all optical math
are Bend; JavaScript handles input, image decoding, data marshaling and presentation.
The plain-color seabed in the small native test is intentional: it isolates
CUDA/JavaScript parity without a browser image decoder.

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
```

Tests compare FFTs with a direct DFT, spectrum/evolution/Fresnel values with the
original compiled Clearwater equations, periodic sampling at seams, checker
rejection of false proofs and affine misuse, and a nontrivial rendered image.
The native GPU image is independently compared with upstream-generated JS.
Browser tests check initial render and a depth change.

Evidence is in [`reports/verification.json`](reports/verification.json),
[`reports/cuda.json`](reports/cuda.json),
[`reports/cuda-parity.json`](reports/cuda-parity.json), and
[`reports/browser.json`](reports/browser.json). The reference CUDA source is kept
only for tests and is excluded from the browser distribution.

## Licensing

Clearwater's original MIT attribution and seabed texture attribution are retained.
Bend's Apache-2.0 license is included and copied into the static build alongside
the generated runtime. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
