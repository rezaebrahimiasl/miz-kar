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
  // reload the given records from disk into memory (S); used when a memory callback failed after a successful transaction
  resync(ops){return new Promise(res=>{try{const t=idb.transaction('docs','readonly'),st=t.objectStore('docs');
    for(const [op,col,x] of ops){const id=op==='put'?x.id:x;const q=st.get(col+'/'+id);q.onsuccess=()=>{if(!S[col])return;const d=q.result&&q.result.doc;const i=S[col].findIndex(z=>z.id===id);if(d){if(i>=0)S[col][i]=d;else S[col].push(d)}else if(i>=0)S[col].splice(i,1)}}
    t.oncomplete=()=>res();t.onerror=t.onabort=()=>res()}catch(_){res()}})}};
