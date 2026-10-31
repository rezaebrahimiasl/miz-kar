/* Reza Desk — automatic local backups (classic script, NOT a module: everything here is a global, shared with index.html's script).
 * Full copies of the data in a separate IndexedDB database ('miz-kar-snap'), so they survive a damaged main store. Nothing here
 * leaves the phone. A copy is taken before every restore, rollback, sync, conflict fix and delete, once a day, before the app's
 * update button reloads, and on the first start of a new version (before the new version changes anything).
 * Every copy is checked after it is written; identical copies are not stored twice; retention never lets a run of newer copies
 * (for example of damaged or shrunken data) push out the newest daily copy or the copy with the most rows.
 * Reads the app's state (LOAD_OK, mode, S, COLS, backupData, rowCount, newId, nowTs, APP_VER) only when called.
 * Loaded by index.html after js/engine.js and before the main script; the service worker pre-caches it with the same version as
 * index.html. Tests: tests/52-auto-backup.test.js (and 40-backup-restore). */
const BACKUP_VER='4.34';
const SNAP_KEEP=10,SNAP_KEEP_LOW=5;  // copies kept; fewer when the browser says storage is over 80% used
let snapDb=null;
function snapOpen(){if(snapDb)return Promise.resolve(snapDb);return new Promise((res,rej)=>{const r=indexedDB.open('miz-kar-snap',1);r.onupgradeneeded=()=>r.result.createObjectStore('snaps',{keyPath:'id'});r.onsuccess=()=>{snapDb=r.result;res(snapDb)};r.onerror=()=>rej(r.error)})}
async function snapList(){try{const d=await snapOpen();return await new Promise((res,rej)=>{const q=d.transaction('snaps').objectStore('snaps').getAll();q.onsuccess=()=>res(q.result.sort((a,b)=>b.at.localeCompare(a.at)));q.onerror=()=>rej(q.error)})}catch(_){return[]}}
async function snapGet(id){const d=await snapOpen();return new Promise((res,rej)=>{const q=d.transaction('snaps').objectStore('snaps').get(id);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
// fingerprint of the data (FNV-1a + length): an identical copy is not stored again
function snapHash(t){let h=0x811c9dc5;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)}return (h>>>0).toString(36)+':'+t.length}
// a copy is usable only if it parses, is a miz-kar backup with data, and every section has the row count recorded when it was taken
function snapCheck(s){try{if(!s||typeof s.txt!=='string')return false;const j=JSON.parse(s.txt);if(!j||j.app!=='miz-kar'||!j.data||typeof j.data!=='object')return false;
  for(const [c,n] of Object.entries(s.counts||{}))if(!Array.isArray(j.data[c])||j.data[c].length!==n)return false;return true}catch(_){return false}}
// which copies stay (L newest first): the newest daily copy and the copy with the most rows always; the rest newest first, up to max
function snapKeep(L,max){const keep=new Set();const daily=L.find(x=>x.reason==='daily');if(daily)keep.add(daily.id);
  const big=L.reduce((a,x)=>!a||(x.n||0)>(a.n||0)?x:a,null);if(big)keep.add(big.id);for(const x of L){if(keep.size>=max)break;keep.add(x.id)}return keep}
async function snapMax(){try{const e=await navigator.storage.estimate();if(e&&e.quota&&e.usage/e.quota>0.8)return SNAP_KEEP_LOW}catch(_){}return SNAP_KEEP}
// the data as text at this very moment (synchronous: later changes to S cannot leak into the copy)
function snapData(){const b=backupData();b.data={...b.data,contacts:[]};const counts=Object.fromEntries(COLS.filter(c=>c!=='contacts').map(c=>[c,(b.data[c]||[]).length]));
  return {h:snapHash(JSON.stringify(b.data)),counts,n:Object.values(counts).reduce((a,x)=>a+x,0),txt:JSON.stringify(b)}}
// take a copy (of the data now, or of D captured earlier by snapData); returns its id (or the id of an identical newest copy), or null when no verified copy could be made
async function snapTake(reason,minGapMin,D){if(!LOAD_OK||mode!=='local')return null;try{const L=await snapList();if(minGapMin&&L[0]&&L[0].reason===reason&&Date.now()-new Date(L[0].at)<minGapMin*60000)return null;
  D=D||snapData();const h=D.h;if(L[0]&&L[0].h===h&&snapCheck(L[0]))return L[0].id;
  const s={id:newId(),at:nowTs(),reason,n:D.n,counts:D.counts,h,ver:APP_VER,txt:D.txt};if(!snapCheck(s))return null;
  const keep=snapKeep([s,...L],await snapMax());
  const d=await snapOpen();await new Promise((res,rej)=>{const t=d.transaction('snaps','readwrite');const st=t.objectStore('snaps');st.put(s);L.filter(x=>!keep.has(x.id)).forEach(x=>st.delete(x.id));t.oncomplete=res;t.onerror=()=>rej(t.error)});
  return snapCheck(await snapGet(s.id))?s.id:null}catch(_){return null}}
// on start, called right after the data is loaded and before any other start-up code: on the first start of a new version the data
// is captured synchronously (before the first await, so nothing that runs later can change it) and stored as a copy; then the daily copy
async function snapBoot(){let last='';try{last=localStorage.getItem('miz.ranVer')||''}catch(_){}
  if(last!==APP_VER){const D=last&&LOAD_OK&&mode==='local'?snapData():null;const r=D?await snapTake('upgrade',0,D):null;if(r||!last)try{localStorage.setItem('miz.ranVer',APP_VER)}catch(_){}}
  setTimeout(()=>snapTake('daily',720),6000)}
// for the backup page: newest copy, number of copies, whether the browser promised to keep the storage
async function snapStatus(){const L=await snapList();let kept=null;try{kept=navigator.storage&&navigator.storage.persisted?await navigator.storage.persisted():null}catch(_){}
  return {n:L.length,last:L[0]||null,lastOk:L[0]?snapCheck(L[0]):false,kept}}
