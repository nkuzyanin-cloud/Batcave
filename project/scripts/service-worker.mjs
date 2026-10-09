import { readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
function walk(p) {
  return readdirSync(p, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? walk(`${p}/${x.name}`) : [`${p}/${x.name}`],
  );
}
const files = walk('dist')
  .filter((x) => !x.endsWith('sw.js'))
  .map((x) => x.slice(5));
const hash = createHash('sha256');
for (const file of files) hash.update(readFileSync(`dist/${file}`));
const version = hash.digest('hex').slice(0, 16);
writeFileSync(
  'dist/sw.js',
  `const PREFIX='batcave-'+self.registration.scope;const CACHE=PREFIX+'${version}';const FILES=${JSON.stringify(files)};const ROOT=new URL('./',self.location.href).href;
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);for(let i=0;i<FILES.length;i+=12)await c.addAll(FILES.slice(i,i+12).map(f=>new Request(new URL(f,ROOT),{cache:'reload'})));})()));
self.addEventListener('message',e=>{if(e.data==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith(PREFIX)&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.href.startsWith(ROOT))return;e.respondWith((async()=>{const c=await caches.open(CACHE);const hit=await c.match(e.request,{ignoreSearch:true});if(hit)return hit;if(e.request.mode==='navigate')return (await c.match(new URL('index.html',ROOT)))||fetch(e.request);return fetch(e.request);})());});`,
);
console.log(`Offline cache: ${files.length} resources, version ${version}`);
