const V='miz-kar-v3.3';const KEEP=[V,'miz-shell','miz-share'];const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
// Install: cache the app shell fresh from the network (bypassing the HTTP cache)
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>fetch(u,{cache:'reload'}).then(r=>{if(r.ok)return c.put(u,r)}).catch(()=>{})))).then(()=>self.skipWaiting()))});
// Activate: remove only old versioned caches; the shell copy and shared items are kept so the app always opens offline
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function shellFromCache(){for(const k of ['index.html','./']){const r=await caches.match(k,{ignoreSearch:true});if(r)return r}return null}
async function saveShell(res){try{const c1=await caches.open(V),c2=await caches.open('miz-shell');await c1.put('index.html',res.clone());await c2.put('index.html',res.clone())}catch(_){}}
self.addEventListener('fetch',e=>{const r=e.request;
  if(r.method==='POST'&&new URL(r.url).pathname.endsWith('/share-target')){e.respondWith((async()=>{try{const f=await r.formData();const text=['title','text','url'].map(k=>f.get(k)).filter(Boolean).join('\n');const img=f.get('image');const c=await caches.open('miz-share');await c.put('share-text',new Response(text));if(img&&img.size)await c.put('share-image',new Response(img,{headers:{'Content-Type':img.type||'image/jpeg'}}));else await c.delete('share-image')}catch(_){}return Response.redirect('./?share=1',303)})());return}
  if(r.method!=='GET'||r.url.includes('version.json'))return;const u=new URL(r.url);if(u.origin!==self.location.origin&&!u.hostname.includes('fonts.g'))return;
  // Pages: open instantly from the saved copy (works offline); refresh the saved copy in the background
  if(r.mode==='navigate'){e.respondWith((async()=>{const cached=await shellFromCache();
      const net=fetch(r.url.split('?')[0],{cache:'no-store'}).then(async res=>{if(res.ok&&!res.redirected)await saveShell(res.clone());return res});
      if(cached){e.waitUntil(net.catch(()=>{}));return cached}
      try{return await net}catch(_){return new Response('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;direction:rtl;padding:24px;line-height:2">میز کار هنوز روی این گوشی ذخیره نشده. یک بار با اینترنت باز کن؛ از آن به بعد بدون اینترنت هم باز می‌شود.<br><button onclick="location.reload()" style="font:inherit;padding:8px 16px;margin-top:12px">دوباره امتحان کن</button>',{headers:{'Content-Type':'text/html; charset=utf-8'}})}})());return}
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&(r.url.startsWith(self.location.origin)||r.url.includes('fonts.g'))){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res})))});
