# SPDX-License-Identifier: Apache-2.0
# Includes host-boundary initialization adapted from bendlang/bend.
"""Run unmodified upstream Bend device code on Windows using device allocations.

This host adapter replaces the POSIX/concurrent-managed-memory host requirement.
It does not replace Bend's compiler, allocator, evaluator or GPU fork/join scheduler.
Requires a locally installed NVIDIA driver and CUDA NVRTC. Not run on hosted CI.
"""
import ctypes as C
import hashlib
import json
import os
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
cuda_root = Path(os.environ.get('CUDA_PATH', r'C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.3'))
runtime_path = next(cuda_root.rglob('nvrtc64_*.dll'))
_dll_dir = os.add_dll_directory(str(runtime_path.parent))
rtc = C.CDLL(str(runtime_path))
driver = C.WinDLL('nvcuda.dll')
ptr = C.c_void_p
u32 = C.c_uint
u64 = C.c_ulonglong
size_t = C.c_size_t

def function(lib, name, args):
    f = getattr(lib, name)
    f.argtypes = args
    f.restype = C.c_int
    return f

init = function(driver, 'cuInit', [u32])
device_get = function(driver, 'cuDeviceGet', [C.POINTER(C.c_int), C.c_int])
device_name = function(driver, 'cuDeviceGetName', [ptr, C.c_int, C.c_int])
attribute = function(driver, 'cuDeviceGetAttribute', [C.POINTER(C.c_int), C.c_int, C.c_int])
retain = function(driver, 'cuDevicePrimaryCtxRetain', [C.POINTER(ptr), C.c_int])
current = function(driver, 'cuCtxSetCurrent', [ptr])
alloc = function(driver, 'cuMemAlloc_v2', [C.POINTER(u64), size_t])
free = function(driver, 'cuMemFree_v2', [u64])
zero = function(driver, 'cuMemsetD8_v2', [u64, C.c_ubyte, size_t])
download = function(driver, 'cuMemcpyDtoH_v2', [ptr, u64, size_t])
load = function(driver, 'cuModuleLoadData', [C.POINTER(ptr), ptr])
get_kernel = function(driver, 'cuModuleGetFunction', [C.POINTER(ptr), ptr, C.c_char_p])
launch = function(driver, 'cuLaunchKernel', [ptr,u32,u32,u32,u32,u32,u32,u32,ptr,ptr,ptr])
sync = function(driver, 'cuCtxSynchronize', [])
create = function(rtc,'nvrtcCreateProgram',[C.POINTER(ptr),C.c_char_p,C.c_char_p,C.c_int,ptr,ptr])
compile_program = function(rtc,'nvrtcCompileProgram',[ptr,C.c_int,C.POINTER(C.c_char_p)])
log_size = function(rtc,'nvrtcGetProgramLogSize',[ptr,C.POINTER(size_t)])
get_log = function(rtc,'nvrtcGetProgramLog',[ptr,ptr])
cubin_size = function(rtc,'nvrtcGetCUBINSize',[ptr,C.POINTER(size_t)])
get_cubin = function(rtc,'nvrtcGetCUBIN',[ptr,ptr])
destroy = function(rtc,'nvrtcDestroyProgram',[C.POINTER(ptr)])

def check(code, operation):
    if code:
        raise RuntimeError(f'{operation}: CUDA/NVRTC error {code}')

# These kernels only perform host-boundary initialization, status and readback.
# The layout and initialization match upstream corpus_lay / corpus_setup.
adapter = r'''
extern "C" __global__ void clearwater_init(u64* H, u64 bytes) {
  u64 cap = (bytes / 8 - HEAP_OFF) / (PAGE_LEN + 10);
  u64 at = HEAP_OFF + (cap << PAGE_BITS);
  for (u32 c = 0; c < NCLS_ALL; ++c) {
    Bank* b = bank_at(H, c); b->off = at;
    at += 2 * (cap >> ((c < NCLS ? NCLS : c) - PAGE_BITS));
  }
  for (u32 i = 0; i < STAT_LEN; ++i) H[STAT_OFF+i] = STAT_IMG[i];
  a32_store(a32_at(H,H_CAP),(u32)cap);
  a32_store(a32_at(H,H_BUMP),1);
  Env e = {H,H+ALC_OFF};
  u64 at_main = task_node(e,FID_SHOWCASE,TERM_HOLE,0,0);
  ring_push(H,0,term_tsk(FID_SHOWCASE,at_main));
  a32_store(a32_at(H,H_CURSOR),1);
}
extern "C" __global__ void clearwater_status(u64* H,u64* out) {
  out[0]=a32_exch(a32_at(H,H_CURSOR),0);
  out[1]=a32_load(a32_at(H,H_ROOT_DONE));
  out[2]=a32_load(a32_at(H,H_ERROR_CODE));
  out[3]=H[H_ROOT_WORD];
  out[4]=a32_load(a32_at(H,H_BUMP));
}
'''
source_path = ROOT / 'generated/clearwater.cu'
source = source_path.read_bytes()
check(init(0),'driver init')
device=C.c_int();check(device_get(C.byref(device),0),'device')
name=C.create_string_buffer(256);check(device_name(name,256,device.value),'device name')
major=C.c_int();minor=C.c_int()
check(attribute(C.byref(major),75,device.value),'compute major')
check(attribute(C.byref(minor),76,device.value),'compute minor')
ctx=ptr();check(retain(C.byref(ctx),device.value),'retain context');check(current(ctx),'set context')
options=[f'--gpu-architecture=sm_{major.value}{minor.value}'.encode(),b'-DCUBE_LOG=7',b'--fmad=false',b'-default-device']
full_source=source+b'\n'+adapter.encode()
key=hashlib.sha256(full_source+b'\0'.join(options)).hexdigest()
cache=ROOT/'generated'/f'clearwater-{key[:16]}.cubin'
start=time.perf_counter()
if not cache.exists():
    program=ptr();check(create(C.byref(program),full_source,b'clearwater.cu',0,None,None),'create compiler')
    result=compile_program(program,len(options),(C.c_char_p*len(options))(*options))
    length=size_t();check(log_size(program,C.byref(length)),'compiler log size')
    log=C.create_string_buffer(length.value);check(get_log(program,log),'compiler log')
    (ROOT/'reports/cuda-compile.txt').write_text(log.value.decode(),encoding='utf8')
    if result:
        print(log.value.decode());check(result,'compile')
    check(cubin_size(program,C.byref(length)),'cubin size')
    data=C.create_string_buffer(length.value);check(get_cubin(program,data),'get cubin')
    cache.write_bytes(data.raw);check(destroy(C.byref(program)),'destroy compiler')
compile_ms=(time.perf_counter()-start)*1000
module=ptr();binary=C.create_string_buffer(cache.read_bytes());check(load(C.byref(module),binary),'load CUDA module')
kernels={}
for label in ['clearwater_init','clearwater_status','bend_dev','window_dev']:
    kernel=ptr();check(get_kernel(C.byref(kernel),module,label.encode()),label);kernels[label]=kernel
def dispatch(label,args,grid=(1,1,1),block=(1,1,1),shared=0):
    params=(ptr*len(args))(*(C.cast(C.byref(v),ptr) for v in args))
    check(launch(kernels[label],*grid,*block,shared,None,params,None),label)

heap=u64();status=u64();pixels=u64()
heap_bytes=1024*1024*1024
check(alloc(C.byref(heap),heap_bytes),'allocate Bend heap')
check(alloc(C.byref(status),40),'allocate status')
check(alloc(C.byref(pixels),128*128*4),'allocate pixels')
try:
    check(zero(heap,0,heap_bytes),'clear heap')
    dispatch('clearwater_init',[heap,u64(heap_bytes)])
    result=(u64*5)();passes=0;start=time.perf_counter()
    while True:
        dispatch('clearwater_status',[heap,status]);check(download(result,status,40),'status readback')
        frontier,done,error,root,pages=result
        if error:raise RuntimeError(f'Upstream Bend device runtime error {error}; passes={passes}, pages={pages}')
        if done:break
        if not frontier:raise RuntimeError('Bend frontier drained without a result')
        if time.perf_counter()-start>120:raise RuntimeError('Bend device run exceeded 120 seconds')
        if frontier<128:dispatch('bend_dev',[heap,u32(0)],block=(128,1,1),shared=2304*8)
        if frontier<16384:dispatch('bend_dev',[heap,u32(0)],grid=(128,1,1),block=(128,1,1),shared=2304*8)
        dispatch('bend_dev',[heap,u32(1)],grid=(128,1,1),block=(128,1,1),shared=2304*8)
        dispatch('bend_dev',[heap,u32(2)],block=(128,1,1),shared=2304*8)
        passes+=1
    dispatch('window_dev',[heap,u64(root),u32(128),u32(128),u32(7),pixels],grid=(16,16,1),block=(8,8,1))
    rgba=(u32*(128*128))();check(download(rgba,pixels,128*128*4),'image readback')
    elapsed=(time.perf_counter()-start)*1000
    raw=bytes(channel for p in rgba for channel in [(p>>16)&255,(p>>8)&255,p&255])
    (ROOT/'reports/cuda.ppm').write_bytes(b'P6\n128 128\n255\n'+raw)
    (ROOT/'reports/cuda-rgb.bin').write_bytes(raw)
    report={'device':name.value.decode(),'bendSourceSha256':hashlib.sha256(source).hexdigest(),'compiler':'unmodified upstream Bend 2 + NVIDIA NVRTC','host':'device-memory Windows adapter','resolution':[128,128],'heapBytes':heap_bytes,'passes':passes,'allocatedPages':pages,'compileMs':compile_ms,'executionAndReadbackMs':elapsed,'runtimeError':error,'distinctColors':len(set(rgba))}
    (ROOT/'reports/cuda.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,indent=2))
finally:
    check(free(pixels),'free pixels');check(free(status),'free status');check(free(heap),'free heap')
