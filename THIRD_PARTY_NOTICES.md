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

The upstream compiler files are unchanged. Generated `clearwater.mjs` and
`clearwater.cu` include the upstream runtimes and must travel with the Apache
license and this attribution. `scripts/compiler.mjs` adapts file loading on
Windows; `scripts/run-cuda.py` supplies a device-memory host adapter. Neither
adds language primitives or modifies Bend's evaluator or checker.

## Development and execution tools

Playwright (Microsoft, Apache-2.0) is a development-only browser test dependency.
It is not shipped in the browser build. NVIDIA CUDA/NVRTC and the NVIDIA driver
are external native execution dependencies installed by the user; their binaries
are not redistributed in this repository or browser build.
