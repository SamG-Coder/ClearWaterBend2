// Apache-2.0. Portable memory/dispatch boundary for the upstream Bend evaluator.
// Heap terms retain the upstream 64-bit layout as (low, high) u32 words.
struct Params { count:u32, parity:u32, capacity:u32, heap_words:u32, width:u32, height:u32, depth:u32, reserved:u32 }
@group(0) @binding(0) var<storage,read_write> heap:array<atomic<u32>>;
@group(0) @binding(1) var<storage,read_write> queue_a:array<vec2<u32>>;
@group(0) @binding(2) var<storage,read_write> queue_b:array<vec2<u32>>;
@group(0) @binding(3) var<storage,read_write> control:array<atomic<u32>>;
@group(0) @binding(4) var<uniform> params:Params;
@group(0) @binding(5) var<storage,read_write> pixels:array<u32>;
@group(0) @binding(7) var<storage,read_write> scratch:array<u32>;
var<private> cw_sp:u32;
var<private> cw_private_base:u32;

fn cw_add64(a:vec2<u32>,b:vec2<u32>)->vec2<u32>{let lo=a.x+b.x;return vec2<u32>(lo,a.y+b.y+select(0u,1u,lo<a.x));}
fn cw_sub64(a:vec2<u32>,b:vec2<u32>)->vec2<u32>{return vec2<u32>(a.x-b.x,a.y-b.y-select(0u,1u,a.x<b.x));}
fn cw_mul64(a:vec2<u32>,b:vec2<u32>)->vec2<u32>{
 let a0=a.x&65535u;let a1=a.x>>16u;let b0=b.x&65535u;let b1=b.x>>16u;
 let p=a0*b0;let mid=a1*b0+(p>>16u);let low=(mid&65535u)+a0*b1;
 return vec2<u32>(a.x*b.x,a.y*b.x+a.x*b.y+a1*b1+(mid>>16u)+(low>>16u));
}
fn cw_shl64(a:vec2<u32>,n:u32)->vec2<u32>{if(n==0u){return a;}if(n<32u){return vec2<u32>(a.x<<n,(a.y<<n)|(a.x>>(32u-n)));}if(n<64u){return vec2<u32>(0u,a.x<<(n-32u));}return vec2<u32>(0u);}
fn cw_shr64(a:vec2<u32>,n:u32)->vec2<u32>{if(n==0u){return a;}if(n<32u){return vec2<u32>((a.x>>n)|(a.y<<(32u-n)),a.y>>n);}if(n<64u){return vec2<u32>(a.y>>(n-32u),0u);}return vec2<u32>(0u);}
fn cw_lt64(a:vec2<u32>,b:vec2<u32>)->bool{return a.y<b.y||(a.y==b.y&&a.x<b.x);}
fn cw_gt64(a:vec2<u32>,b:vec2<u32>)->bool{return cw_lt64(b,a);}
fn cw_le64(a:vec2<u32>,b:vec2<u32>)->bool{return !cw_lt64(b,a);}
fn cw_ge64(a:vec2<u32>,b:vec2<u32>)->bool{return !cw_lt64(a,b);}
fn cw_div64(a:vec2<u32>,b:vec2<u32>)->vec2<u32>{
 if(all(b==vec2<u32>(0u))){return vec2<u32>(0u);}if(a.y==0u&&b.y==0u){return vec2<u32>(a.x/b.x,0u);}
 var q=vec2<u32>(0u);var r=vec2<u32>(0u);
 for(var j=64u;j>0u;j--){let i=j-1u;let carry=r.y>>31u;r=cw_shl64(r,1u);r.x|=cw_shr64(a,i).x&1u;if(carry!=0u||cw_ge64(r,b)){r=cw_sub64(r,b);q|=cw_shl64(vec2<u32>(1u,0u),i);}}
 return q;
}
fn cw_mod64(a:vec2<u32>,b:vec2<u32>)->vec2<u32>{return cw_sub64(a,cw_mul64(cw_div64(a,b),b));}
fn cw_load32(p:u32)->u32 {if((p&2147483648u)!=0u){return scratch[cw_private_base+(p&2147483647u)];}return atomicLoad(&heap[p]);}
fn cw_store32(p:u32,v:u32){if((p&2147483648u)!=0u){scratch[cw_private_base+(p&2147483647u)]=v;}else{atomicStore(&heap[p],v);}}
fn cw_load64(p:u32)->vec2<u32>{return vec2<u32>(cw_load32(p),cw_load32(p+1u));}
fn cw_store64(p:u32,v:vec2<u32>){cw_store32(p,v.x);cw_store32(p+1u,v.y);}
fn cw_atomicAdd(p:u32,v:u32)->u32{if((p&2147483648u)!=0u){let old=cw_load32(p);cw_store32(p,old+v);return old;}return atomicAdd(&heap[p],v);}
fn cw_atomicSub(p:u32,v:u32)->u32{if((p&2147483648u)!=0u){let old=cw_load32(p);cw_store32(p,old-v);return old;}return atomicSub(&heap[p],v);}
fn cw_atomicCAS(p:u32,old:u32,value:u32)->u32{
 if((p&2147483648u)!=0u){let was=cw_load32(p);if(was==old){cw_store32(p,value);}return was;}
 loop{let r=atomicCompareExchangeWeak(&heap[p],old,value);if(r.exchanged||r.old_value!=old){return r.old_value;}}
}
fn fn_a32_load_acq(p:u32)->u32{return cw_load32(p);}
fn fn_a32_swp(p:u32,e:u32,v:u32)->bool{let old=cw_load32(e);let was=cw_atomicCAS(p,old,v);cw_store32(e,was);return was==old;}
fn fn_a32_cas(p:u32,e:u32,v:u32)->bool{return fn_a32_swp(p,e,v);}
fn fn_a32_cmpx(p:u32,x:u32,v:u32)->u32{return cw_atomicCAS(p,x,v);}
fn fn_a32_exch(p:u32,v:u32)->u32{if((p&2147483648u)!=0u){let old=cw_load32(p);cw_store32(p,v);return old;}return atomicExchange(&heap[p],v);}
fn fn_a32_fadd(p:u32,v:u32)->u32{loop{let old=cw_load32(p);let value=bitcast<u32>(bitcast<f32>(old)+bitcast<f32>(v));if(cw_atomicCAS(p,old,value)==old){return old;}}}
fn fn_err_post(h:u32,code:u32){_=cw_atomicCAS(h+96u,0u,code);}
fn fn_f32_unbox(v:vec2<u32>)->f32{return bitcast<f32>(v.x);}
fn fn_f32_rewrap(v:f32)->vec2<u32>{return vec2<u32>(bitcast<u32>(v),0u);}

// Active and retired free lists are separate. Retired blocks cannot be reused
// until a later dispatch, when all earlier object accesses have completed.
fn fn_heap_alloc(e:Env,cls:u32)->vec2<u32>{
 let headp=e.alc+cls*CW_LANES*2u;let head=cw_load64(headp);
 if(any(head!=vec2<u32>(0u))){cw_store64(headp,cw_load64(head.x*2u));return head;}
 let count=1u<<cls;let at=atomicAdd(&heap[0],count);
 if(at>params.heap_words||count>params.heap_words-at){fn_err_post(0u,3u);return vec2<u32>(CW_HEAP_OFF,0u);}
 return vec2<u32>(at,0u);
}
fn fn_heap_free(e:Env,cls:u32,loc:vec2<u32>){
 if(atomicLoad(&heap[96])!=0u){return;}
 let hp=e.alc+(32u+cls)*CW_LANES*2u;let tp=e.alc+(64u+cls)*CW_LANES*2u;let head=cw_load64(hp);
 cw_store64(loc.x*2u,head);cw_store64(hp,loc);if(all(head==vec2<u32>(0u))){cw_store64(tp,loc);}
}
fn fn_spare_free(e:Env,cls:u32,loc:vec2<u32>){if(cw_ge64(loc,vec2<u32>(CW_HEAP_OFF,0u))){fn_heap_free(e,cls,loc);}}
fn cw_enqueue(t:vec2<u32>){let id=atomicAdd(&control[0],1u);if(id>=params.capacity){fn_err_post(0u,22u);return;}if(params.parity==0u){queue_b[id]=t;}else{queue_a[id]=t;}}

@compute @workgroup_size(32) fn cw_init(@builtin(global_invocation_id) gid:vec3<u32>){
 if(gid.x!=0u){return;}cw_sp=0u;cw_private_base=0u;
 atomicStore(&heap[0],CW_HEAP_OFF);atomicStore(&heap[2],params.heap_words);
 for(var i=0u;i<CW_STAT_LEN;i++){cw_store64((CW_STAT_OFF+i)*2u,v_STAT_IMG[i]);}
 let e=Env(0u,CW_ALC_OFF*2u);let loc=fn_task_node(e,CW_ENTRY,vec2<u32>(4294967295u),0u,0u);
 cw_store64(loc.x*2u,vec2<u32>(params.depth,0u));cw_store64((loc.x+1u)*2u,vec2<u32>(params.width,0u));
 queue_a[0]=vec2<u32>(loc.x,83886080u|(CW_ENTRY<<8u));
}
@compute @workgroup_size(32) fn cw_recycle(@builtin(global_invocation_id) gid:vec3<u32>){
 let lane=gid.x;if(lane>=CW_LANES){return;}let base=(CW_ALC_OFF+lane)*2u;
 for(var c=0u;c<32u;c++){
  let hp=base+c*CW_LANES*2u;let pp=base+(32u+c)*CW_LANES*2u;let tp=base+(64u+c)*CW_LANES*2u;
  let retired=cw_load64(pp);if(any(retired!=vec2<u32>(0u))){let tail=cw_load64(tp);cw_store64(tail.x*2u,cw_load64(hp));cw_store64(hp,retired);cw_store64(pp,vec2<u32>(0u));cw_store64(tp,vec2<u32>(0u));}
 }
}
@compute @workgroup_size(32) fn cw_step(@builtin(global_invocation_id) gid:vec3<u32>){
 let lane=gid.x;if(lane>=CW_LANES){return;}let e=Env(0u,(CW_ALC_OFF+lane)*2u);cw_private_base=lane*CW_PRIVATE_WORDS;
 for(var i=lane;i<params.count;i+=CW_LANES){
  if(atomicLoad(&heap[96])!=0u){return;}cw_sp=0u;
  var task:vec2<u32>;if(params.parity==0u){task=queue_a[i];}else{task=queue_b[i];}
  let result=fn_work_loop(e,(CW_STAK_OFF+lane)*2u,task,0u);
  if(all(result==vec2<u32>(0u))){continue;}
  let tail=fn_task_tail(result).x;let remaining=cw_load32((tail+1u)*2u);
  if(remaining==0u){cw_enqueue(result);}else{
   let at=fn_term_loc(result).x;let fid=fn_term_aux(result).x;let arity=v_FID_T[fid][0];
   for(var j=0u;j<arity;j++){let child=cw_load64((at+j)*2u);if(fn_term_tag(child).x==5u){cw_store64((at+j)*2u,vec2<u32>(4294967295u));cw_enqueue(child);}}
  }
 }
}
@compute @workgroup_size(1) fn cw_status(){
 atomicStore(&control[1],atomicLoad(&heap[64]));atomicStore(&control[2],atomicLoad(&heap[96]));
 atomicStore(&control[3],atomicLoad(&heap[128]));atomicStore(&control[4],atomicLoad(&heap[129]));atomicStore(&control[5],atomicLoad(&heap[0]));
}
@compute @workgroup_size(8,8) fn cw_present(@builtin(global_invocation_id) gid:vec3<u32>){
 if(gid.x>=params.width||gid.y>=params.height){return;}
 let root=cw_load64(128u);let rgb=fn_window_pix(0u,root,params.depth,gid.x,gid.y);
 pixels[gid.y*params.width+gid.x]=(rgb>>16u)|(((rgb>>8u)&255u)<<8u)|((rgb&255u)<<16u)|4278190080u;
}
