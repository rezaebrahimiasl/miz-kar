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
const Store={_q:Promise.resolve(),_RETRY:Symbol('retry'),_inflight:new Map(),
  /* tx(plan, commit): the ownership check runs in the transaction's own turn, right after plan built the writes and before the
     IndexedDB transaction opens: if any record is staged by the active operation (and this is not that operation's commit), nothing
     is opened, the turn is given back, the call waits until the operation has ended and then runs plan again from the real state —
     repeated until no record is held. The queue is never blocked while waiting (no deadlock with the operation's own commit).
     Records of an open transaction are marked in-flight until it ends (an operation staging such a record waits for it: settle). */
  tx(plan,commit){const attempt=()=>{const p=this._q.then(()=>run(),()=>run());this._q=p.then(()=>{},()=>{});return p.then(r=>r===this._RETRY?this.idle().then(attempt):r)};
    const run=()=>new Promise(res=>{const ops=[],after=[];let t=null;
      try{plan({put:(col,doc)=>ops.push(['put',col,doc]),del:(col,id)=>ops.push(['del',col,id]),after:fn=>after.push(fn)});
        if(!commit&&this._act&&ops.some(([op,col,x])=>this._act.puts.has(col+'/'+(op==='put'?x.id:x))))return res(this._RETRY);
        if(!ops.length){let err=null;for(const f of after)try{f()}catch(e){err=err||e}return res(err?{ok:true,ops,afterError:err}:{ok:true,ops})}
        t=idb.transaction('docs','readwrite');const st=t.objectStore('docs');
        for(const [op,col,x] of ops){if(op==='put')st.put({k:col+'/'+x.id,col,doc:x});else st.delete(col+'/'+x)}}
      catch(e){try{t&&t.abort()}catch(_){}return res({ok:false,error:e})}
      const keys=ops.map(([op,col,x])=>col+'/'+(op==='put'?x.id:x));keys.forEach(k=>this._inflight.set(k,(this._inflight.get(k)||0)+1));
      let done=false;const end=r=>{if(!done){done=true;keys.forEach(k=>{const n=(this._inflight.get(k)||1)-1;if(n)this._inflight.set(k,n);else this._inflight.delete(k)});res(r)}};
      t.oncomplete=()=>{let err=null;for(const f of after)try{f()}catch(e){err=err||e}if(!err)return end({ok:true,ops});
        // a memory callback failed: the disk is right, memory may be half-updated → reload exactly the written records from disk
        try{console.warn('Store.tx after',err)}catch(_){}Store.resync(ops).then(()=>end({ok:true,ops,afterError:err}),()=>end({ok:true,ops,afterError:err}))};t.onerror=()=>{};/* a failed request aborts the whole transaction (not prevented); the result is reported by onabort */t.onabort=()=>end({ok:false,error:t.error||new Error('transaction aborted')})});
    return attempt()},
  // an operation about to stage a record that an ordinary transaction is writing right now waits for the queue to pass it
  async settle(col,id){while(id&&this._inflight.has(col+'/'+id))await this._q},
  /* Store.batch(key, fn): makes a multi-record business operation atomic (unit of work). fn(B) receives the operation B and must
     write only through it (save(c,i,d,B) / putRaw(c,d,B) — see opsFor() in index.html): those writes are staged — memory (S) changes
     at once, so the operation reads its own writes and may still ask the user; nothing touches the disk. When fn finishes, all staged
     records are committed in ONE transaction; on any error or a failed commit, the staged records are put back exactly as they were,
     the operation's own undo entries are removed, and nothing was written.
     Isolation: there is no global "current operation". A write without B is an ordinary write: it is never staged into B and commits
     on its own; if it touches a record B has staged, it waits until B has ended (no deadlock: B's own writes carry B and never wait).
     Operations run one after another (queue); each key at most once at a time (a second call → Store.BUSY, also while queued).
     Follow-up updates (recvKick) are held until the end. Cloud mode: fn runs directly (no B). */
  _act:null,_busy:new Set(),BUSY:Symbol('busy'),_bq:Promise.resolve(),
  stage(B,col,doc,prev){const k=col+'/'+doc.id;if(!B.orig.has(k))B.orig.set(k,prev?JSON.parse(JSON.stringify(prev)):null);B.puts.set(k,[col,doc]);B.n++},
  // run an undo recorder for B and remember exactly which undo entries it added (removed again if B fails)
  undo(B,fn){const u=typeof UB!=='undefined'?UB:null;const n=u?u.ops.length:0,s0=u?new Set(u.seen):null;fn();
    if(u&&UB===u){for(let i=n;i<u.ops.length;i++)B.uops.add(u.ops[i]);u.seen.forEach(k=>{if(!s0.has(k))B.useen.add(k)})}},
  held(col,id){const B=this._act;return !!(B&&id&&B.puts.has(col+'/'+id))},
  idle(){return this._act?this._act.end:Promise.resolve()},
  batch(key,fn){if(typeof mode!=='undefined'&&mode!=='local')return fn();if(key&&this._busy.has(key))return Promise.resolve(this.BUSY);if(key)this._busy.add(key);
    const go=()=>this._batch(key,fn);const p=this._bq.then(go,go);this._bq=p.then(()=>{},()=>{});return p},
  async _batch(key,fn){let endR;const B={orig:new Map(),puts:new Map(),n:0,uops:new Set(),useen:new Set(),end:new Promise(r=>endR=r),batch:()=>{throw new Error('nested operation: an operation must not start another one (it would wait for itself)')}};this._act=B;
    const hold=typeof _rvH!=='undefined';if(hold)_rvH++;
    const rollback=()=>{for(const [k,o] of B.orig){const i=k.indexOf('/'),col=k.slice(0,i),id=k.slice(i+1);if(!S[col])continue;const j=S[col].findIndex(x=>x.id===id);if(o){if(j>=0)S[col][j]=o;else S[col].push(o)}else if(j>=0)S[col].splice(j,1)}
      try{if(typeof UB!=='undefined'&&UB){UB.ops=UB.ops.filter(o=>!B.uops.has(o));B.useen.forEach(k=>UB.seen.delete(k))}}catch(_){}};/* only this operation's undo entries are dropped */
    try{const res=await fn(B);if(B.err)throw B.err;
      const r=B.puts.size?await this.tx(w=>{for(const [col,doc] of B.puts.values())w.put(col,doc)},true):{ok:true};
      if(!r.ok)throw r.error||new Error('write failed');B.done=true;
      for(let i=0;i<B.n;i++)try{markDirty()}catch(_){}return res}
    catch(e){if(!B.done)rollback();throw e}
    finally{this._act=null;endR();if(key)this._busy.delete(key);if(hold){_rvH--;if(!_rvH&&typeof _rvP!=='undefined'&&_rvP){_rvP=0;try{recvKick()}catch(_){}}}try{render()}catch(_){}}},
  // reload the given records from disk into memory (S); used when a memory callback failed after a successful transaction
  resync(ops){return new Promise(res=>{try{const t=idb.transaction('docs','readonly'),st=t.objectStore('docs');
    for(const [op,col,x] of ops){const id=op==='put'?x.id:x;const q=st.get(col+'/'+id);q.onsuccess=()=>{if(!S[col])return;const d=q.result&&q.result.doc;const i=S[col].findIndex(z=>z.id===id);if(d){if(i>=0)S[col][i]=d;else S[col].push(d)}else if(i>=0)S[col].splice(i,1)}}
    t.oncomplete=()=>res();t.onerror=t.onabort=()=>res()}catch(_){res()}})}};
