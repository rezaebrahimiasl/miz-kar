const V='miz-kar-v4.22';const KEEP=[V,'miz-shell','miz-share'];const SHELL=['./','index.html','manifest.webmanifest','icon2-192.png','icon2-512.png','icon2-maskable-512.png','logo.webp','qr.js'];
// Install: cache the app shell fresh from the network (bypassing the HTTP cache)
// The offline shell may only ever be the real app: an HTML page that contains the app's version marker
const isApp=t=>typeof t==='string'&&/const APP_VER='\d+(?:\.\d+)*';/.test(t);const SCOPE=new URL('./',self.location).pathname;const isShellUrl=u=>{const p=new URL(u,self.location).pathname;return p===SCOPE||p===SCOPE+'index.html'};
async function appOnly(res){if(!res||!res.ok||res.redirected||!/text\/html/i.test(res.headers.get('content-type')||''))return null;const t=await res.clone().text();return isApp(t)?t:null}
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>fetch(u,{cache:'reload'}).then(async r=>{if(!r.ok)return;if(isShellUrl(u)){const t=await appOnly(r);if(t)return c.put(u,new Response(t,{headers:{'Content-Type':'text/html; charset=utf-8'}}));return}return c.put(u,r)}).catch(()=>{})))).then(()=>self.skipWaiting()))});
// Activate: remove only old versioned caches; the shell copy and shared items are kept so the app always opens offline
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// This version's cache first (its shell entries were validated when stored); the long-lived copy only if it is really the app
async function shellFromCache(){const c=await caches.open(V);for(const k of ['index.html','./']){const r=await c.match(k);if(r)return r}const s=await (await caches.open('miz-shell')).match('index.html');return s&&isApp(await s.clone().text())?s:null}
async function saveShell(res){try{const t=await appOnly(res);if(!t)return;const mk=()=>new Response(t,{headers:{'Content-Type':'text/html; charset=utf-8'}});const c1=await caches.open(V),c2=await caches.open('miz-shell');await c1.put('index.html',mk());await c2.put('index.html',mk())}catch(_){}}
self.addEventListener('fetch',e=>{const r=e.request;
  if(r.method==='POST'&&new URL(r.url).pathname.endsWith('/share-target')){e.respondWith((async()=>{try{const f=await r.formData();const text=['title','text','url'].map(k=>f.get(k)).filter(Boolean).join('\n');const img=f.get('image');const c=await caches.open('miz-share');await c.put('share-text',new Response(text));if(img&&img.size)await c.put('share-image',new Response(img,{headers:{'Content-Type':img.type||'image/jpeg'}}));else await c.delete('share-image')}catch(_){}return Response.redirect('./?share=1',303)})());return}
  if(r.method!=='GET'||r.url.includes('version.json'))return;const u=new URL(r.url);if(u.origin!==self.location.origin&&!u.hostname.includes('fonts.g'))return;
  // Pages: open instantly from the saved copy (works offline); refresh the saved copy in the background
  if(r.mode==='navigate'){e.respondWith((async()=>{const cached=await shellFromCache();
      const net=fetch(r.url.split('?')[0],{cache:'no-store'}).then(async res=>{if(res.ok&&!res.redirected)await saveShell(res.clone());return res});
      if(cached){e.waitUntil(net.catch(()=>{}));return cached}
      try{return await net}catch(_){return new Response('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;direction:rtl;padding:24px;line-height:2">میز کار هنوز روی این گوشی ذخیره نشده. یک بار با اینترنت باز کن؛ از آن به بعد بدون اینترنت هم باز می‌شود.<br><button onclick="location.reload()" style="font:inherit;padding:8px 16px;margin-top:12px">دوباره امتحان کن</button>',{headers:{'Content-Type':'text/html; charset=utf-8'}})}})());return}
  if(isShellUrl(r.url)){e.respondWith(fetch(r).catch(()=>shellFromCache().then(c=>c||Response.error())));return} // the shell is stored only through saveShell
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&(r.url.startsWith(self.location.origin)||r.url.includes('fonts.g'))){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res})))});
