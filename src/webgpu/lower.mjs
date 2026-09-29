// Typed C AST -> WGSL for upstream Bend's emitted device evaluator.
// All non-boundary functions are lowered from the actual compiler output.
const aliases={Term:'unsigned long long',u64:'unsigned long long',u32:'unsigned int',u32a:'unsigned int',u8:'unsigned char',f32:'float'};
const overridden=new Set(['a32_swp','a32_load_acq','a32_cas','a32_exch','a32_cmpx','a32_fadd','err_post','f32_unbox','f32_rewrap','heap_alloc','heap_free','spare_free']);
const children=n=>n?.inner||[];
const ident=s=>'v_'+s.replace(/[^a-zA-Z0-9_]/g,'_');
export function qtype(n){let s=(n?.type?.desugaredQualType||n?.type?.qualType||'void').replace(/\b(const|volatile|restrict|struct)\b/g,'').trim();return s.replace(/\b(Term|u64|u32a|u32|u8|f32)\b/g,k=>aliases[k]).replace(/\s+/g,' ').trim();}
export function scalar(q){if(q.includes('*')||q.includes('['))return 'u32';if(q==='unsigned long long')return 'vec2<u32>';if(['unsigned int','unsigned char','unsigned long'].includes(q))return 'u32';if(['int','long','char'].includes(q))return 'i32';if(q==='bool')return 'bool';if(q==='float'||q==='double')return 'f32';if(q==='Env')return 'Env';if(q==='void')return '';throw Error('Unsupported C type '+q);}
export function words(q){if(q.includes('*'))return 1;const arr=/^(.*?)\[(\d+)\](.*)$/.exec(q);if(arr)return Number(arr[2])*words(arr[1]+arr[3]);if(q==='Env')return 2;if(q==='Bank')return 6;return q==='unsigned long long'?2:1;}
const pointee=q=>q.replace(/\s*\*\s*$/,'').trim();
export const unwrap=n=>['ParenExpr','ImplicitCastExpr','CStyleCastExpr','ConstantExpr'].includes(n?.kind)?unwrap(children(n)[0]):n;
export function walk(n,fn){if(!n)return;fn(n);children(n).forEach(c=>walk(c,fn));}

export function lower(ast){
  const funcs=new Map(),globals=new Map();
  walk(ast,n=>{if(n.kind==='FunctionDecl'&&children(n).some(c=>c.kind==='CompoundStmt'))funcs.set(n.name,n);});
  for(const n of ast.inner)if(n.kind==='VarDecl'&&(['FID_T','CID_T','STAT_IMG'].includes(n.name)||n.name?.startsWith('CW_')))globals.set(n.name,n);
  const used=new Set();
  function reach(name){if(used.has(name)||overridden.has(name))return;const fn=funcs.get(name);if(!fn)throw Error('Missing function '+name);used.add(name);walk(fn,n=>{if(n.kind==='CallExpr'){const callee=unwrap(children(n)[0]);const k=callee?.referencedDecl?.name;if(funcs.has(k))reach(k);}});}
  reach('work_loop');reach('window_pix');
  const chunks=['struct Env { mem:u32, alc:u32 }'];
  const evaluator=new WeakMap();
  function constant(n){
    if(!n?.kind)return null;if(evaluator.has(n))return evaluator.get(n);
    const cs=children(n);let v=null;
    try{
      if(n.kind==='IntegerLiteral')v=BigInt(n.value);
      else if(n.kind==='CXXBoolLiteralExpr')v=n.value?1n:0n;
      else if(['ParenExpr','ConstantExpr'].includes(n.kind))v=constant(cs[0]);
      else if(['ImplicitCastExpr','CStyleCastExpr'].includes(n.kind)){
        v=constant(cs[0]);const q=qtype(n);
        if(v!==null){if(q==='unsigned long long')v=BigInt.asUintN(64,v);else if(q==='unsigned char')v=BigInt.asUintN(8,v);else if(q==='unsigned int'||q==='unsigned long')v=BigInt.asUintN(32,v);else if(q==='int'||q==='long')v=BigInt.asIntN(32,v);else if(q==='bool')v=v?1n:0n;else if(q==='float'||q==='double')v=null;}
      }else if(n.kind==='UnaryOperator'){
        const a=constant(cs[0]);if(a!==null)v=({'+':()=>a,'-':()=>-a,'~':()=>~a,'!':()=>a?0n:1n})[n.opcode]?.()??null;
      }else if(n.kind==='BinaryOperator'){
        const a=constant(cs[0]),b=constant(cs[1]);if(a!==null&&b!==null){const ops={'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>b?a/b:null,'%':()=>b?a%b:null,'<<':()=>b<64n?a<<b:0n,'>>':()=>b<64n?a>>b:0n,'&':()=>a&b,'|':()=>a|b,'^':()=>a^b,'<':()=>+(a<b),'>':()=>+(a>b),'<=':()=>+(a<=b),'>=':()=>+(a>=b),'==':()=>+(a===b),'!=':()=>+(a!==b),'&&':()=>+(!!a&&!!b),'||':()=>+(!!a||!!b)};v=ops[n.opcode]?.()??null;if(v!==null)v=BigInt(v);}
      }else if(n.kind==='ConditionalOperator'){const c=constant(cs[0]);if(c!==null)v=constant(cs[c?1:2]);}
      if(v!==null){const q=qtype(n);if(q==='unsigned long long')v=BigInt.asUintN(64,v);else if(['unsigned int','unsigned long','unsigned char'].includes(q))v=BigInt.asUintN(q==='unsigned char'?8:32,v);}
    }catch{v=null;}
    evaluator.set(n,v);return v;
  }
  const literal=(v,t)=>t==='vec2<u32>'?`vec2<u32>(${BigInt.asUintN(32,v)}u,${BigInt.asUintN(32,v>>32n)}u)`:t==='bool'?v?'true':'false':t==='i32'?`${BigInt.asIntN(32,v)}i`:`${BigInt.asUintN(32,v)}u`;
  const zero=t=>t==='vec2<u32>'?'vec2<u32>(0u)':t==='bool'?'false':t==='f32'?'0.0f':t==='Env'?'Env(0u,0u)':t==='i32'?'0i':'0u';
  function cast(code,a,b,q=''){
    if(a===b)return q==='unsigned char'?`(${code}&255u)`:code;
    if(b==='bool')return a==='vec2<u32>'?`any(${code}!=vec2<u32>(0u))`:`(${code}!=${zero(a)})`;
    if(a==='bool'){const v=`select(0u,1u,${code})`;return b==='vec2<u32>'?`vec2<u32>(${v},0u)`:b==='u32'?v:`${b}(${v})`;}
    if(b==='vec2<u32>')return a==='i32'?`vec2<u32>(u32(${code}),select(0u,4294967295u,${code}<0i))`:`vec2<u32>(u32(${code}),0u)`;
    if(a==='vec2<u32>')return `${b}((${code}).x)`;
    return `${b}(${code})`;
  }
  function operation(op,a,b,type){
    if(type==='vec2<u32>'){
      const fn={'+':'cw_add64','-':'cw_sub64','*':'cw_mul64','/':'cw_div64','%':'cw_mod64','<<':'cw_shl64','>>':'cw_shr64','<':'cw_lt64','>':'cw_gt64','<=':'cw_le64','>=':'cw_ge64'}[op];
      if(fn)return `${fn}(${a},${b})`;
      if(op==='==')return `all(${a}==${b})`;if(op==='!=')return `any(${a}!=${b})`;
    }
    return `(${a} ${op} ${b})`;
  }
  const metadata={};
  for(const [name,n] of globals){
    if(name.startsWith('CW_')){metadata[name.slice(3)]=Number(constant(children(n)[0]));continue;}
    const init=children(n).find(c=>c.kind==='InitListExpr');
    function arrayInit(v){if(v.kind==='InitListExpr'){const xs=children(v).map(arrayInit),q=qtype(v),dims=[...q.matchAll(/\[(\d+)\]/g)].map(m=>+m[1]);let t=scalar(q.split('[')[0].trim());for(const d of dims.reverse())t=`array<${t},${d}>`;return `${t}(${xs.join(',')})`;}return literal(constant(v),scalar(qtype(v)));}
    chunks.push(`const ${ident(name)} = ${arrayInit(init)};`);
  }
  const diagnostics=[];
  for(const name of used){
    const fn=funcs.get(name),body=children(fn).find(n=>n.kind==='CompoundStmt'),params=children(fn).filter(n=>n.kind==='ParmVarDecl');
    const ret=scalar(fn.type.qualType.split('(')[0].trim().replace(/\b(Term|u64|u32|f32)\b/g,k=>aliases[k]));
    let serial=0;const fresh=()=>`cw_t${serial++}`;
    const addressed=new Set(),slots=new Map();let frame=0;
    walk(body,n=>{if(n.kind==='UnaryOperator'&&n.opcode==='&'){const v=unwrap(children(n)[0]);if(v?.kind==='DeclRefExpr')addressed.add(v.referencedDecl.id);}});
    const allDecls=[...params];walk(body,n=>{if(n.kind==='VarDecl')allDecls.push(n);});
    for(const n of allDecls)if(addressed.has(n.id)||qtype(n).includes('[')){slots.set(n.id,{offset:frame,q:qtype(n),name:ident(n.name)});frame+=words(qtype(n));}
    const load=(addr,t)=>t==='vec2<u32>'?`cw_load64(${addr})`:t==='f32'?`bitcast<f32>(cw_load32(${addr}))`:t==='i32'?`i32(cw_load32(${addr}))`:t==='bool'?`(cw_load32(${addr})!=0u)`:`cw_load32(${addr})`;
    const store=(addr,value,t)=>t==='vec2<u32>'?`cw_store64(${addr},${value});`:`cw_store32(${addr},${t==='f32'?`bitcast<u32>(${value})`:t==='bool'?`select(0u,1u,${value})`:`u32(${value})`});`;
    const slotaddr=s=>`(2147483648u+cw_base+${s.offset}u)`;
    function lvalue(n,pre){
      if(['ParenExpr','ImplicitCastExpr'].includes(n.kind))return lvalue(children(n)[0],pre);
      const cs=children(n);
      if(n.kind==='DeclRefExpr'){const s=slots.get(n.referencedDecl.id);return s?{addr:slotaddr(s)}:{direct:ident(n.referencedDecl.name)};}
      if(n.kind==='ArraySubscriptExpr'){
        function globalRoot(x){const u=unwrap(x);return u?.kind==='ArraySubscriptExpr'?globalRoot(children(u)[0]):u?.kind==='DeclRefExpr'&&globals.has(u.referencedDecl.name);}
        if(globalRoot(cs[0]))return {direct:`${expr(cs[0],pre)}[${cast(expr(cs[1],pre),scalar(qtype(cs[1])),'u32')}]`};
        const root=unwrap(cs[0]);
        if(root?.kind==='DeclRefExpr'&&globals.has(root.referencedDecl.name))return {direct:`${expr(cs[0],pre)}[${cast(expr(cs[1],pre),scalar(qtype(cs[1])),'u32')}]`};
        if(qtype(cs[0]).includes('[')&&!qtype(cs[0]).includes('*')&&root?.kind==='ArraySubscriptExpr')return {direct:`${expr(cs[0],pre)}[${expr(cs[1],pre)}]`};
        const base=expr(cs[0],pre),index=cast(expr(cs[1],pre),scalar(qtype(cs[1])),'u32');
        return {addr:`(${base}+${index}*${words(qtype(n))}u)`};
      }
      if(n.kind==='UnaryOperator'&&n.opcode==='*')return {addr:expr(cs[0],pre)};
      if(n.kind==='MemberExpr'){
        if(n.isArrow){const off={off:0,rd:2,wr:3,top:4}[n.name];if(off===undefined)throw Error('Unknown pointer member '+n.name);return {addr:`(${expr(cs[0],pre)}+${off}u)`};}
        return {direct:`${expr(cs[0],pre)}.${n.name}`};
      }
      throw Error('Unsupported lvalue '+n.kind);
    }
    const get=(lv,t)=>lv.direct??load(lv.addr,t);
    const set=(lv,v,t)=>lv.direct?`${lv.direct}=${v};`:store(lv.addr,v,t);
    function expr(n,pre){
      if(!n?.kind)throw Error('Missing expression');
      const cs=children(n),q=qtype(n),t=scalar(q),cv=constant(n);
      if(cv!==null&&!q.includes('*'))return literal(cv,t);
      if(n.kind==='FloatingLiteral')return `${Number(n.value).toPrecision(9)}f`;
      if(n.kind==='DeclRefExpr'){
        const s=slots.get(n.referencedDecl.id);if(s)return q.includes('[')?slotaddr(s):load(slotaddr(s),t);
        return ident(n.referencedDecl.name);
      }
      if(['ParenExpr','ConstantExpr','CXXConstructExpr','ExprWithCleanups'].includes(n.kind))return expr(cs[0],pre);
      if(['ImplicitCastExpr','CStyleCastExpr'].includes(n.kind)){
        if(n.castKind==='FunctionToPointerDecay')return expr(cs[0],pre);
        if(n.castKind==='ArrayToPointerDecay')return expr(cs[0],pre);
        return cast(expr(cs[0],pre),scalar(qtype(cs[0])),t,q);
      }
      if(n.kind==='MemberExpr'||n.kind==='ArraySubscriptExpr')return get(lvalue(n,pre),t);
      if(n.kind==='UnaryOperator'){
        const op=n.opcode;
        if(op==='&'){const lv=lvalue(cs[0],pre);if(!lv.addr)throw Error('Address of unspilled '+lv.direct);return lv.addr;}
        if(op==='*')return load(expr(cs[0],pre),t);
        if(op==='++'||op==='--'){
          const lv=lvalue(cs[0],pre),old=fresh();pre.push(`let ${old}=${get(lv,t)};`);let v;
          if(q.includes('*'))v=`(${old}${op==='++'?'+':'-'}${words(pointee(q))}u)`;
          else v=operation(op==='++'?'+':'-',old,literal(1n,t),t);
          pre.push(set(lv,v,t));return n.isPostfix?old:get(lv,t);
        }
        const a=expr(cs[0],pre);
        if(op==='!')return `!${cast(a,scalar(qtype(cs[0])),'bool')}`;
        if(op==='+')return a;
        if(op==='-'&&t==='vec2<u32>')return `cw_sub64(vec2<u32>(0u),${a})`;
        return `(${op}${a})`;
      }
      if(n.kind==='BinaryOperator'||n.kind==='CompoundAssignOperator'){
        const op=n.opcode;
        if(op===','){const a=expr(cs[0],pre);if(a)pre.push(`_=${a};`);return expr(cs[1],pre);}
        if(op==='='||n.kind==='CompoundAssignOperator'){
          const lv=lvalue(cs[0],pre),rt=scalar(qtype(cs[1]));let value=expr(cs[1],pre);
          if(op!=='='){
            const ot=q.includes('*')?'u32':t;
            if(q.includes('*'))value=`(${cast(value,rt,'u32')}*${words(pointee(q))}u)`;
            else value=cast(value,rt,t);
            value=operation(op.slice(0,-1),get(lv,t),value,ot);
          }
          const tmp=fresh();pre.push(`let ${tmp}=${value};`,set(lv,tmp,t));return tmp;
        }
        const a=expr(cs[0],pre),ta=scalar(qtype(cs[0]));
        if(op==='&&'||op==='||'){
          const more=[],b=expr(cs[1],more);if(!more.length)return `(${a}${op}${b})`;
          const tmp=fresh();pre.push(`var ${tmp}=${a};`,`if (${op==='||'?'!':''}${tmp}) {${more.join('\n')}\n${tmp}=${b};}`);return tmp;
        }
        let b=expr(cs[1],pre),tb=scalar(qtype(cs[1]));
        if(qtype(cs[0]).includes('*')&&['+','-'].includes(op))return `(${a}${op}${cast(b,tb,'u32')}*${words(pointee(qtype(cs[0])))}u)`;
        if(['<<','>>'].includes(op))b=cast(b,tb,'u32');
        return operation(op,a,b,ta);
      }
      if(n.kind==='ConditionalOperator'){
        const c=constant(cs[0]);if(c!==null)return expr(cs[c?1:2],pre);
        const condition=expr(cs[0],pre),yes=[],no=[],a=expr(cs[1],yes),b=expr(cs[2],no),tmp=fresh();
        pre.push(`var ${tmp}:${t};`,`if (${condition}) {${yes.join('\n')}\n${tmp}=${a};} else {${no.join('\n')}\n${tmp}=${b};}`);return tmp;
      }
      if(n.kind==='CallExpr'){
        const callee=unwrap(cs[0]).referencedDecl.name,args=cs.slice(1).map(v=>expr(v,pre));
        if(callee==='__threadfence')return '';
        if(callee==='__clz')return `i32(countLeadingZeros(u32(${args[0]})))`;
        const math={sin:'sin',cos:'cos',tan:'tan',asin:'asin',acos:'acos',atan:'atan',atan2:'atan2',sqrt:'sqrt',exp:'exp',log:'log',exp2:'exp2',log2:'log2',pow:'pow',floor:'floor',ceil:'ceil',trunc:'trunc',fabs:'abs',fmin:'min',fmax:'max'};
        if(math[callee])return `${math[callee]}(${args.join(',')})`;
        if(['atomicAdd','atomicSub','atomicCAS'].includes(callee))return `cw_${callee}(${args.join(',')})`;
        return `fn_${callee}(${args.join(',')})`;
      }
      if(n.kind==='InitListExpr')return `${t}(${cs.map(v=>expr(v,pre)).join(',')})`;
      throw Error('Unsupported expression '+n.kind+' '+JSON.stringify(n).slice(0,300));
    }
    function stmt(n){
      if(!n?.kind)return '';
      const cs=children(n),pre=[];
      if(n.kind==='CompoundStmt')return `{\n${cs.map(stmt).join('\n')}\n}`;
      if(n.kind==='DeclStmt')return cs.filter(v=>v.kind==='VarDecl').map(v=>{
        const ps=[],init=children(v).find(c=>!c.kind.endsWith('Attr')),s=slots.get(v.id),t=scalar(qtype(v));
        if(s){if(qtype(v).includes('[')){if(init)throw Error('Initialized local array');return '';}
          const value=init?expr(init,ps):zero(t);return [...ps,store(slotaddr(s),value,t)].join('\n');}
        const value=init?expr(init,ps):zero(t);return [...ps,`var ${ident(v.name)}:${t}=${value};`].join('\n');
      }).join('\n');
      if(n.kind==='ReturnStmt'){
        const value=cs[0]?expr(cs[0],pre):'',tmp=fresh();
        return [...pre,value?`let ${tmp}=${value};`:'',frame?'cw_sp=cw_base;':'',value?`return ${tmp};`:'return;'].join('\n');
      }
      if(n.kind==='IfStmt'){
        const c=constant(cs[0]);if(c!==null)return c?stmt(cs[1]):stmt(cs[2]);
        const cond=expr(cs[0],pre);return [...pre,`if (${cond}) ${block(cs[1])}${cs[2]?` else ${block(cs[2])}`:''}`].join('\n');
      }
      if(n.kind==='ForStmt'){
        const [init,,condition,step,body]=cs,cp=[],cond=condition?.kind?expr(condition,cp):'true';
        const sp=[];if(step?.kind){const code=expr(step,sp);if(code)sp.push(`_=${code};`);}
        return `{${stmt(init)}\nloop {${cp.join('\n')}\nif(!(${cond})){break;}\n${stmt(body)}\ncontinuing {${sp.join('\n')}}\n}}`;
      }
      if(n.kind==='WhileStmt'){const cond=expr(cs[0],pre);return `loop{${pre.join('\n')}\nif(!(${cond})){break;}\n${stmt(cs[1])}}`;}
      if(n.kind==='DoStmt'){const cond=expr(cs[1],pre);return `loop{${stmt(cs[0])}\ncontinuing{${pre.join('\n')}\nbreak if !(${cond});}}`;}
      if(n.kind==='SwitchStmt'){
        const v=expr(cs[0],pre),groups=[];let current;
        for(const child of children(cs[1])){
          if(child.kind==='CaseStmt'||child.kind==='DefaultStmt'){
            const cc=children(child),label=child.kind==='DefaultStmt'?'default':`case ${literal(constant(cc[0]),scalar(qtype(cc[0])))}`;
            current={label,body:[cc.at(-1)]};groups.push(current);
          }else {if(!current)throw Error('Statement before first switch case');current.body.push(child);}
        }
        if(!groups.some(g=>g.label==='default'))groups.push({label:'default',body:[]});
        return [...pre,`switch(${v}){${groups.map(g=>`${g.label}:{${g.body.map(stmt).join('\n')}}`).join('\n')}}`].join('\n');
      }
      if(n.kind==='CaseStmt')return `case ${literal(constant(cs[0]),scalar(qtype(cs[0])))}: ${block(cs[1])}`;
      if(n.kind==='DefaultStmt')return `default: ${block(cs[0])}`;
      if(n.kind==='BreakStmt')return 'break;';if(n.kind==='ContinueStmt')return 'continue;';if(n.kind==='NullStmt')return '';
      const code=expr(n,pre);if(code)pre.push(qtype(n)==='void'?`${code};`:`_=${code};`);return pre.join('\n');
    }
    const block=n=>n?.kind==='CompoundStmt'?stmt(n):`{${stmt(n)}}`;
    try{
      const init=[];
      if(frame)init.push(`let cw_base=cw_sp; cw_sp+=${frame}u;`, `if(cw_sp>CW_PRIVATE_WORDS){fn_err_post(0u,21u);cw_sp=cw_base;${ret?'return '+zero(ret)+';':'return;'}}`);
      for(const p of params){const s=slots.get(p.id),t=scalar(qtype(p));init.push(s?store(slotaddr(s),`p_${p.name}`,t):`var ${ident(p.name)}=${'p_'+p.name};`);}
      const text=`fn fn_${name}(${params.map(p=>`p_${p.name}:${scalar(qtype(p))}`).join(',')})${ret?' -> '+ret:''} {\n${init.join('\n')}\n${csbody(body)}\n${frame?'cw_sp=cw_base;':''}\n${ret?'return '+zero(ret)+';':''}\n}`;
      function csbody(b){return children(b).map(stmt).join('\n');}
      chunks.push(text);diagnostics.push({name,privateWords:frame});
    }catch(error){throw Error(`Lowering ${name}: ${error.message}`,{cause:error});}
  }
  return {source:chunks.join('\n\n'),functions:diagnostics,metadata,constant};
}
