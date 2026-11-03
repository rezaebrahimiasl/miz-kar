/* Reza Desk — storage transactions (classic script, NOT a module: everything here is a global, shared with index.html's script).
 * Store.tx(plan): runs plan(w) — w.put(col, doc) / w.del(col, id) queue writes — and commits them in ONE IndexedDB readwrite
 * transaction on the 'docs' store (every collection lives there). Resolves {ok:true, ops} only after the transaction completed;
 * {ok:false, error} on any failure or abort, with nothing written. w.after(fn) registers what to do in memory (S, undo, dirty
 * state) once the transaction completed; it runs before the next queued transaction starts, so memory and disk stay in step. Calls are serialised (one after another), and plan runs when its turn comes, so a read-modify-write in plan
 * always sees the result of the previous write. Local mode only (uses the global idb); cloud mode keeps its own path.
 * Loaded by index.html after js/backup.js and before the main script; version-locked with index.html like the other parts.
 * Tests: tests/59-store.test.js. */
const STORE_VER='4.40';
const Store={_q:Promise.resolve(),
  tx(plan){const run=()=>new Promise(res=>{const ops=[],after=[];let t=null;
      try{plan({put:(col,doc)=>ops.push(['put',col,doc]),del:(col,id)=>ops.push(['del',col,id]),after:fn=>after.push(fn)});
        if(!ops.length){after.forEach(f=>f());return res({ok:true,ops})}
        t=idb.transaction('docs','readwrite');const st=t.objectStore('docs');
        for(const [op,col,x] of ops){if(op==='put')st.put({k:col+'/'+x.id,col,doc:x});else st.delete(col+'/'+x)}}
      catch(e){try{t&&t.abort()}catch(_){}return res({ok:false,error:e})}
      let done=false;const end=r=>{if(!done){done=true;res(r)}};
      t.oncomplete=()=>{let err=null;for(const f of after)try{f()}catch(e){err=err||e}end(err?{ok:true,ops,afterError:err}:{ok:true,ops})};t.onerror=()=>{};/* a failed request aborts the whole transaction (not prevented); the result is reported by onabort */t.onabort=()=>end({ok:false,error:t.error||new Error('transaction aborted')})});
    const p=this._q.then(run,run);this._q=p.then(()=>{},()=>{});return p}};
