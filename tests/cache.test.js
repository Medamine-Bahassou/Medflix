const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function scraperContext(saved={}) {
  let now=10*86400e3;
  const c={window:{},URL,DOMParser:class{},Date:class extends Date{static now(){return now;}},setTimeout:()=>0,clearTimeout(){},api:{get:async key=>saved[key]||{},set:async()=>{},fetch:async()=>'{"value":1}'}};
  vm.createContext(c);vm.runInContext(fs.readFileSync('scraper.js','utf8'),c);
  vm.runInContext('parsers.novelJSON = value=>value',c);
  c.advance=ms=>now+=ms;return c;
}
test('simultaneous repeated lookups share one task and reuse its saved value',async()=>{
  const c=scraperContext(),pending=deferred();let calls=0;c.task=()=>{calls++;return pending.promise;};
  const a=c.remember('rating',c.task),b=c.remember('rating',c.task);await tick();assert.equal(calls,1);
  pending.resolve({score:8.2});await Promise.all([a,b]);await c.remember('rating',c.task);assert.equal(calls,1);
});
test('lookup errors release the pending request so the next visit can retry',async()=>{
  const c=scraperContext();let calls=0;c.task=async()=>{if(++calls===1)throw Error('offline');return {score:8};};
  await assert.rejects(c.remember('rating',c.task),/offline/);assert.equal((await c.remember('rating',c.task)).score,8);assert.equal(calls,2);
});
test('stale lookups serve their saved copy immediately and share one background update',async()=>{
  const old={score:7},c=scraperContext({lookups:{rating:{at:0,data:old}}}),pending=deferred();let calls=0;c.task=()=>{calls++;return pending.promise;};
  assert.equal(await c.remember('rating',c.task),old);assert.equal(await c.remember('rating',c.task),old);assert.equal(calls,1);
  pending.resolve({score:8});await tick();assert.equal((await c.remember('rating',c.task)).score,8);
});
test('page data stays fresh for five minutes, updates quietly afterwards, and explicit refresh bypasses freshness',async()=>{
  const c=scraperContext();let calls=0;c.api.fetch=async()=>JSON.stringify({value:++calls});
  const read=force=>vm.runInContext(`load('novelJSON','https://novltime.com/example',${force})`,c);
  await read(false);c.advance(120000);await read(false);assert.equal(calls,1);
  c.advance(181000);assert.equal((await read(false)).value,1);await tick();assert.equal(calls,2);assert.equal((await read(false)).value,2);
  assert.equal((await read(true)).value,3);
});
function cacheStorage() {
  const entries=new Map(),key=r=>typeof r==='string'?r:r.url;
  return {entries,keys:async()=>[...entries.keys()],delete:async name=>entries.delete(name),async open(name){
    if(!entries.has(name))entries.set(name,new Map());const data=entries.get(name);
    return {match:async r=>data.get(key(r))?.clone(),put:async(r,response)=>data.set(key(r),response.clone()),keys:async()=>[...data.keys()],delete:async r=>data.delete(key(r))};
  }};
}
function worker(storage=cacheStorage()) {
  const events={};let now=0,calls=0;
  const c={caches:storage,self:{addEventListener:(name,handler)=>events[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}},Date:class extends Date{static now(){return now;}},fetch:async r=>{calls++;return new Response(r.url);}};
  vm.createContext(c);vm.runInContext(fs.readFileSync('image-cache-sw.js','utf8'),c);
  return {c,events,storage,get calls(){return calls;},advance:ms=>now+=ms};
}
const image=n=>({url:'https://images.example/'+n+'.jpg',method:'GET',destination:'image',mode:'no-cors'});
test('images are reused concurrently, on repeated visits and after worker restart',async()=>{
  const x=worker();await Promise.all([x.c.imageResponse(image(1)),x.c.imageResponse(image(1))]);assert.equal(x.calls,1);
  assert.equal(await (await x.c.imageResponse(image(1))).text(),image(1).url);assert.equal(x.calls,1);
  const restarted=worker(x.storage);await restarted.c.imageResponse(image(1));assert.equal(restarted.calls,0);
});
test('image cache is bounded, expires weekly, and failed images can be evicted',async()=>{
  const x=worker();for(let n=0;n<130;n++)await x.c.imageResponse(image(n));
  assert.equal([...x.storage.entries.values()][0].size,128);
  let done;x.events.message({data:{type:'image-error',url:image(129).url},waitUntil:p=>done=p});await done;
  const before=x.calls;await x.c.imageResponse(image(129));assert.equal(x.calls,before+1);
  x.advance(8*86400e3);await x.c.imageResponse(image(129));assert.equal(x.calls,before+2);assert.equal(x.storage.entries.size,1);
});
test('image caching never intercepts API calls, video, scripts or CORS requests',()=>{
  const x=worker();let caught=0;
  for(const request of [{...image(1),destination:'script'},{...image(1),destination:'video'},{...image(1),destination:''},{...image(1),mode:'cors'},{...image(1),method:'POST'}])x.events.fetch({request,respondWith(){caught++;}});
  assert.equal(caught,0);
});
test('a browser that refuses cache storage still gets its image from the network',async()=>{
  const x=worker({keys:async()=>[],open:async()=>{throw Error('storage unavailable');}});
  assert.equal(await (await x.c.imageResponse(image(1))).text(),image(1).url);assert.equal(x.calls,1);
});
test('clear-cache removes images while preserving unrelated browser caches',async()=>{
  const x=worker();await x.c.imageResponse(image(1));await x.storage.open('other-app');
  // this is also how web.js clears the image cache when its saved pages are cleared.
  await Promise.all((await x.storage.keys()).filter(k=>k.startsWith('medflix-images-')).map(k=>x.storage.delete(k)));
  await x.c.imageResponse(image(1));assert.equal(x.calls,2);assert.ok(x.storage.entries.has('other-app'));
});

function proxyContext(fetch) {
  const source=fs.readFileSync('web.js','utf8'),c={URL,URLSearchParams,fetch};vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('  const proxyFlights ='),source.indexOf('  const http ='))+'\nthis.viaProxy=viaProxy;',c);return c;
}
test('proxy reads share their in-flight response, including GraphQL queries',async()=>{
  const pending=deferred();let calls=0;
  const c=proxyContext(async()=>{calls++;await pending.promise;return {ok:true,json:async()=>({status:200,data:'cached data'})};});
  const req={url:'https://graphql.anilist.co',method:'POST',body:JSON.stringify({query:'{Media(id:1){id}}'})};
  const a=c.viaProxy(req),b=c.viaProxy(req);assert.equal(calls,1);pending.resolve();assert.equal((await a).data,'cached data');await b;
  await c.viaProxy(req);assert.equal(calls,2,'transport deduplication must not override page refresh policy');
});
test('playback POSTs and GraphQL mutations remain separate requests',async()=>{
  let calls=0;const c=proxyContext(async()=>{calls++;return {ok:true,json:async()=>({status:200})};});
  for(const req of [{url:'https://example.com/player',method:'POST',body:'token=1'},{url:'https://graphql.anilist.co',method:'POST',body:JSON.stringify({query:'mutation {test}'})}])await Promise.all([c.viaProxy(req),c.viaProxy(req)]);
  assert.equal(calls,4);
});
test('cross-origin opaque images can be saved and served without fetching their bytes again',async()=>{
  const x=worker();let calls=0;const opaque=()=>({ok:false,type:'opaque',clone:opaque});x.c.fetch=async()=>{calls++;return opaque();};
  assert.equal((await x.c.imageResponse(image(1))).type,'opaque');await x.c.imageResponse(image(1));assert.equal(calls,1);
});
