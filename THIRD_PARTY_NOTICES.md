# Third-party notices

## Clearwater

The source equations, optical design and `assets/seabed.jpg` derive from
[SamG-Coder/clearwater](https://github.com/SamG-Coder/clearwater), revision
`1de10a3f1afe28669ba6d02d365fc04d5199876b`, and the original
[Aureliengmz/clearwater](https://github.com/Aureliengmz/clearwater).
Copyright (c) 2026 Lumaris. MIT license: [LICENSE](LICENSE).

`reference/clearwater.cu` is the original source retained for independent numerical
tests. It is not the implementation used by the Bend renderer. The browser seabed
input is a decoded, resized copy of the original licensed texture.

## Bend 2

The upstream compiler, standard library, JavaScript runtime and CUDA runtime are
from [bendlang/bend](https://github.com/bendlang/bend), pinned as a Git submodule at
`3378e6237ed431d17629efd36d24c96241815b7e` (CLI version 2.0.32).
Copyright 2026 HigherOrderCO. Apache License 2.0:
[licenses/Bend-Apache-2.0.txt](licenses/Bend-Apache-2.0.txt).

The vendored upstream files are unchanged. `compiler/cuda-emitter.mjs` applies
a local modification to an isolated build copy of `bend2/comp.ts`: bounded
small-helper inlining, typed helper return records, unchanged-word reconstruction
folding, and CUDA unsigned division emission. This modified
compiler and its derived code retain the upstream Apache-2.0 license. The
parser, checker, standard library, and JavaScript emitter remain upstream.
Generated `clearwater.mjs` and
`clearwater.cu` include the upstream runtimes and must travel with the Apache
license and this attribution. `scripts/compiler.mjs` adapts file loading on
Windows; `scripts/run-cuda.py` supplies a device-memory host adapter. Neither
adds language primitives or modifies Bend's checker.

The WebGPU bridge in `src/webgpu/` adapts the generated CUDA evaluator's memory,
allocation and scheduling boundaries. `runtime.wgsl` and generated evaluator
artifacts derive from the upstream Apache-2.0 runtime; retain the Bend license
and attribution when distributing them. The checker remains unchanged; the CUDA
emitter modifications are disclosed above. The WebGPU scheduler uses separate compute dispatches rather than CUDA's
native synchronization and launch behavior.

## CUDA WebShader

The browser GPU host imports the unmodified `GpuRuntime` from
[SamG-Coder/cuda-webshader](https://github.com/SamG-Coder/cuda-webshader), pinned
at `ef46ff1bf02a306bad94ddc18286d25d3d902c14` in `vendor/webshader`.
Copyright (c) 2026 SamG-Coder and CUDA WebShader contributors. MIT license:
[licenses/CUDA-WebShader-MIT.txt](licenses/CUDA-WebShader-MIT.txt).
Its runtime/compiler JavaScript and license are included in the static build.
The Bend bridge supplies WGSL artifacts to its public runtime API; it does not
claim the existing CUDA WebShader parser supports arbitrary upstream Bend CUDA.

## Development and execution tools

Playwright (Microsoft, Apache-2.0) is a development-only browser test dependency.
It is not shipped in the browser build. NVIDIA CUDA/NVRTC and the NVIDIA driver
are external native execution dependencies installed by the user; their binaries
are not redistributed in this repository or browser build.

Clang is a build-time dependency for the typed CUDA/C++ AST. LLVM/Clang binaries
are not bundled in this repository or the static site.
