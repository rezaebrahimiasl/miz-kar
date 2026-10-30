const V='miz-kar-v4.31';const VER=V.slice(9);const KEEP=[V,'miz-shell','miz-share'];const SHELL=['./','index.html','manifest.webmanifest','icon2-192.png','icon2-512.png','icon2-maskable-512.png','logo.webp','qr.js','js/core.js'];
// Install (O3): download and validate EVERY file first; only then write the new cache and take over.
// If any file fails (offline, 404, captive portal, broken download) the install fails, the browser keeps the current
// worker, and activation, which is what deletes old caches, never happens: the last working offline app stays intact.
// The offline shell may only ever be the real app: an HTML page that contains the app's version marker
const isApp=t=>typeof t==='string'&&/const APP_VER='\d+(?:\.\d+)*';/.test(t);
// index.html and js/core.js belong together: each carries its version; a pair is only ever stored when both say the same version
const verOf=(t,k)=>((typeof t==='string'&&t.match(new RegExp('const '+k+"='(\\d+(?:\\.\\d+)*)';")))||[])[1]||'';const CORE='js/core.js';const isCoreUrl=u=>new URL(u,self.location).pathname===SCOPE+CORE;const SCOPE=new URL('./',self.location).pathname;const isShellUrl=u=>{const p=new URL(u,self.location).pathname;return p===SCOPE||p===SCOPE+'index.html'};
async function appOnly(res){if(!res||!res.ok||res.redirected||!/text\/html/i.test(res.headers.get('content-type')||''))return null;const t=await res.clone().text();return isApp(t)?t:null}
async function fetchAll(){const seen={};const got=await Promise.all(SHELL.map(async u=>{const r=await fetch(u,{cache:'reload'});if(!r.ok||r.redirected)throw new Error('install: '+u+' '+r.status);
  if(isShellUrl(u)){const t=await appOnly(r);if(!t)throw new Error('install: '+u+' is not the app');seen[u]=verOf(t,'APP_VER');return [u,new Response(t,{headers:{'Content-Type':'text/html; charset=utf-8'}})]}
  if(u===CORE){const t=await r.text();seen[u]=verOf(t,'CORE_VER');if(!seen[u])throw new Error('install: '+u+' has no version marker');return [u,new Response(t,{headers:{'Content-Type':r.headers.get('content-type')||'text/javascript'}})]}
  const b=await r.blob();return [u,new Response(b,{headers:{'Content-Type':r.headers.get('content-type')||''}})]}));
  // index.html (both keys) and js/core.js must carry the same version, or nothing is installed
  const vs=new Set(Object.values(seen));if(vs.size!==1||!seen[CORE])throw new Error('install: index.html and js/core.js versions differ: '+JSON.stringify(seen));return got}
self.addEventListener('install',e=>{e.waitUntil((async()=>{const had=await caches.has(V);const got=await fetchAll();
  try{const c=await caches.open(V);for(const [u,r] of got)await c.put(u,r)}catch(err){if(!had)await caches.delete(V).catch(()=>{});throw err}
  await self.skipWaiting()})())});
// Activate: remove only old versioned caches; the shell copy and shared items are kept so the app always opens offline
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// This version's cache first (its shell entries were validated when stored); the long-lived copy only if it is really the app
async function shellFromCache(){const c=await caches.open(V);for(const k of ['index.html','./']){const r=await c.match(k);if(r)return r}const s=await (await caches.open('miz-shell')).match('index.html');return s&&isApp(await s.clone().text())?s:null}
// a fresh index.html from the network is kept only together with a js/core.js of the same version (fetched now if it is newer than
// this worker); an older one is never stored. Core first, then index.html, in this worker's cache and in the long-lived copy
const vNum=v=>String(v||'').split('.').reduce((a,x)=>a*1000+(Number(x)||0),0);
async function saveShell(res){try{const t=await appOnly(res);if(!t)return;const v=verOf(t,'APP_VER');if(!v||vNum(v)<vNum(VER))return;let core='';
  if(v===VER){const h=await (await caches.open(V)).match(CORE);core=h?await h.text():''}if(verOf(core,'CORE_VER')!==v){const cr=await fetch(CORE,{cache:'no-store'});if(!cr.ok||cr.redirected)return;core=await cr.text();if(verOf(core,'CORE_VER')!==v)return}
  for(const c of [await caches.open(V),await caches.open('miz-shell')]){const h=await c.match('index.html');if(h&&vNum(verOf(await h.text(),'APP_VER'))>vNum(v))continue;/* never over a newer pair */await c.put(CORE,new Response(core,{headers:{'Content-Type':'text/javascript'}}));await c.put('index.html',new Response(t,{headers:{'Content-Type':'text/html; charset=utf-8'}}))}}catch(_){}}
// js/core.js always from the same cache as the index.html being served (this worker's cache, else the long-lived copy)
async function coreFromCache(){const c=await caches.open(V);if(await c.match('index.html')||await c.match('./')){const h=await c.match(CORE);if(h)return h}return (await (await caches.open('miz-shell')).match(CORE))||null}
self.addEventListener('fetch',e=>{const r=e.request;
  if(r.method==='POST'&&new URL(r.url).pathname.endsWith('/share-target')){e.respondWith((async()=>{try{const f=await r.formData();const text=['title','text','url'].map(k=>f.get(k)).filter(Boolean).join('\n');const img=f.get('image');const c=await caches.open('miz-share');await c.put('share-text',new Response(text));if(img&&img.size)await c.put('share-image',new Response(img,{headers:{'Content-Type':img.type||'image/jpeg'}}));else await c.delete('share-image')}catch(_){}return Response.redirect('./?share=1',303)})());return}
  if(r.method!=='GET'||r.url.includes('version.json'))return;const u=new URL(r.url);if(u.origin!==self.location.origin&&!u.hostname.includes('fonts.g'))return;
  // Pages: open instantly from the saved copy (works offline); refresh the saved copy in the background
  if(r.mode==='navigate'){e.respondWith((async()=>{const cached=await shellFromCache();
      const net=fetch(r.url.split('?')[0],{cache:'no-store'}).then(async res=>{if(res.ok&&!res.redirected)await saveShell(res.clone());return res});
      if(cached){e.waitUntil(net.catch(()=>{}));return cached}
      try{return await net}catch(_){return new Response('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;direction:rtl;padding:24px;line-height:2">میز کار هنوز روی این گوشی ذخیره نشده. یک بار با اینترنت باز کن؛ از آن به بعد بدون اینترنت هم باز می‌شود.<br><button onclick="location.reload()" style="font:inherit;padding:8px 16px;margin-top:12px">دوباره امتحان کن</button>',{headers:{'Content-Type':'text/html; charset=utf-8'}})}})());return}
  if(isCoreUrl(r.url)&&!new URL(r.url).search){e.respondWith(coreFromCache().then(h=>h||fetch(r)).catch(()=>fetch(r)));return}
  if(isShellUrl(r.url)){e.respondWith(fetch(r).catch(()=>shellFromCache().then(c=>c||Response.error())));return} // the shell is stored only through saveShell
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&(r.url.startsWith(self.location.origin)||r.url.includes('fonts.g'))){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res})))});
