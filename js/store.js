/* Reza Desk — storage transactions (classic script, NOT a module: everything here is a global, shared with index.html's script).
 * Store.tx(plan): runs plan(w) — w.put(col, doc) / w.del(col, id) queue writes — and commits them in ONE IndexedDB readwrite
 * transaction on the 'docs' store (every collection lives there). Resolves {ok:true, ops} only after the transaction completed;
 * {ok:false, error} on any failure or abort, with nothing written. w.after(fn) registers what to do in memory (S, undo, dirty
 * state) once the transaction completed (if one throws, the written records are reloaded from disk into S and the result
 * carries afterError); it runs before the next queued transaction starts, so memory and disk stay in step. Calls are serialised (one after another), and plan runs when its turn comes, so a read-modify-write in plan
 * always sees the result of the previous write. Local mode only (uses the global idb); cloud mode keeps its own path.
 * Loaded by index.html after js/backup.js and before the main script; version-locked with index.html like the other parts.
 * Tests: tests/59-store.test.js. */
const STORE_VER='4.40';
const Store={_q:Promise.resolve(),
  tx(plan){const run=()=>new Promise(res=>{const ops=[],after=[];let t=null;
      try{plan({put:(col,doc)=>ops.push(['put',col,doc]),del:(col,id)=>ops.push(['del',col,id]),after:fn=>after.push(fn)});
        if(!ops.length){let err=null;for(const f of after)try{f()}catch(e){err=err||e}return res(err?{ok:true,ops,afterError:err}:{ok:true,ops})}
        t=idb.transaction('docs','readwrite');const st=t.objectStore('docs');
        for(const [op,col,x] of ops){if(op==='put')st.put({k:col+'/'+x.id,col,doc:x});else st.delete(col+'/'+x)}}
      catch(e){try{t&&t.abort()}catch(_){}return res({ok:false,error:e})}
      let done=false;const end=r=>{if(!done){done=true;res(r)}};
      t.oncomplete=()=>{let err=null;for(const f of after)try{f()}catch(e){err=err||e}if(!err)return end({ok:true,ops});
        // a memory callback failed: the disk is right, memory may be half-updated → reload exactly the written records from disk
        try{console.warn('Store.tx after',err)}catch(_){}Store.resync(ops).then(()=>end({ok:true,ops,afterError:err}),()=>end({ok:true,ops,afterError:err}))};t.onerror=()=>{};/* a failed request aborts the whole transaction (not prevented); the result is reported by onabort */t.onabort=()=>end({ok:false,error:t.error||new Error('transaction aborted')})});
    const p=this._q.then(run,run);this._q=p.then(()=>{},()=>{});return p},
  /* Store.batch(key, fn): makes a multi-record business operation atomic (unit of work). While fn runs, save0/putRaw stage their
     records: memory (S) changes at once, so fn reads its own writes and may still ask the user; nothing touches the disk. When fn
     finishes, all staged records are committed in ONE transaction (Store.tx); on any error or a failed commit, memory is put back
     exactly as it was and nothing was written. key: one run per key at a time (a second call while the first runs returns
     Store.BUSY — protects against double taps). Follow-up updates (recvKick) are held until the end. Cloud mode: fn runs as before. */
  _b:null,_busy:new Set(),BUSY:Symbol('busy'),_bq:Promise.resolve(),
  stage(col,doc,prev){const B=this._b,k=col+'/'+doc.id;if(!B.orig.has(k))B.orig.set(k,prev?JSON.parse(JSON.stringify(prev)):null);B.puts.set(k,[col,doc]);B.n++},
  // operations never join each other: a second one waits in a queue until the first has committed or rolled back, then runs as its own
  // unit (its own commit, its own rollback). The key is taken at once, so a double tap is refused even while it waits.
  batch(key,fn){if(typeof mode!=='undefined'&&mode!=='local')return fn();if(key&&this._busy.has(key))return Promise.resolve(this.BUSY);if(key)this._busy.add(key);
    const go=()=>this._batch(key,fn);const p=this._bq.then(go,go);this._bq=p.then(()=>{},()=>{});return p},
  async _batch(key,fn){
    const B={orig:new Map(),puts:new Map(),n:0,ub:typeof UB!=='undefined'?UB:null};B.ubn=B.ub?B.ub.ops.length:0;B.ubs=B.ub?new Set(B.ub.seen):null;this._b=B;const hold=typeof _rvH!=='undefined';if(hold)_rvH++;
    const rollback=()=>{for(const [k,o] of B.orig){const i=k.indexOf('/'),col=k.slice(0,i),id=k.slice(i+1);if(!S[col])continue;const j=S[col].findIndex(x=>x.id===id);if(o){if(j>=0)S[col][j]=o;else S[col].push(o)}else if(j>=0)S[col].splice(j,1)}
      try{if(B.ub&&UB===B.ub){UB.ops.length=B.ubn;UB.seen=new Set(B.ubs)}}catch(_){}};/* undo entries of the failed operation are dropped */
    try{let res;try{res=await fn()}finally{this._b=null}if(B.err)throw B.err;
      const r=B.puts.size?await this.tx(w=>{for(const [col,doc] of B.puts.values())w.put(col,doc)}):{ok:true};
      if(!r.ok)throw r.error||new Error('write failed');B.done=true;
      for(let i=0;i<B.n;i++)try{markDirty()}catch(_){}return res}
    catch(e){if(!B.done)rollback();throw e}
    finally{if(key)this._busy.delete(key);if(hold){_rvH--;if(!_rvH&&typeof _rvP!=='undefined'&&_rvP){_rvP=0;try{recvKick()}catch(_){}}}try{render()}catch(_){}}},
  // reload the given records from disk into memory (S); used when a memory callback failed after a successful transaction
  resync(ops){return new Promise(res=>{try{const t=idb.transaction('docs','readonly'),st=t.objectStore('docs');
    for(const [op,col,x] of ops){const id=op==='put'?x.id:x;const q=st.get(col+'/'+id);q.onsuccess=()=>{if(!S[col])return;const d=q.result&&q.result.doc;const i=S[col].findIndex(z=>z.id===id);if(d){if(i>=0)S[col][i]=d;else S[col].push(d)}else if(i>=0)S[col].splice(i,1)}}
    t.oncomplete=()=>res();t.onerror=t.onabort=()=>res()}catch(_){res()}})}};
