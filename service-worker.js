const CACHE='pc-wake-mqtt-v2-1';
const FILES=['./','./index.html','./app.js','./state.js','./mqtt-wss.js','./manifest.json','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pc-wake-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 // Yalnizca statik PWA dosyalari onbellege alinir; MQTT WebSocket trafigi asla alinmaz.
 if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
 const allowed=FILES.map(p=>new URL(p,self.registration.scope).href);
 if(!allowed.includes(url.href))return;
 e.respondWith(fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return response;}).catch(()=>caches.match(e.request)));
});
