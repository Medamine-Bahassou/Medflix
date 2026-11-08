const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const disk=new Map(),exports=[],objectUrls=new Map();let serial=0;
 const store={webDownloads:{},novelDownloads:{}};
 const c={store,Blob,URLSearchParams,DOMException,AbortController,BrowserZip:require('../zip'),location:{hash:'#/test'},setTimeout:()=>0,clearTimeout:()=>{},t:k=>k,toast:()=>{},
  persist:async k=>disk.set(k,structuredClone(store[k])),api:{get:async k=>disk.get(k),set:async(k,v)=>disk.set(k,v),downloadUrl:async token=>token},
  fetch:async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','Content-Length':'4'}}),
  mChapter:async id=>({id,n:'1',serie:{id:'series',title:'Manga'},images:['https://appswat.com/v2/media/1','https://appswat.com/v2/media/2']}),
  nvParagraphs:c=>[c.content],nvKey:(id,slug)=>'novel:'+id+'/'+slug,
  URL:{createObjectURL(blob){const key='blob:'+(++serial);objectUrls.set(key,blob);return key;},revokeObjectURL:key=>objectUrls.delete(key)},
  document:{body:{append(){}},createElement:()=>({click(){exports.push({name:this.download,blob:objectUrls.get(this.href)});},remove(){}})},disk,exports};
 c.ClientTransfer={fetch:(...args)=>c.fetch(...args)};
 vm.createContext(c);vm.runInContext(fs.readFileSync('web-downloads.js','utf8'),c);c.wb=vm.runInContext('WebDownloads',c);return c;
}
test('manga pages are saved individually and can be read from their blobs without refetching',async()=>{
 const c=setup();const job=await c.wb.enqueue({id:'manga:1',kind:'manga',chapterId:'1',ep:'1',title:'Book'});
 assert.equal(job.state,'done');assert.equal(job.files.length,2);
 c.mChapter=()=>{throw Error('offline');};const saved=await c.wb.chapter('1');assert.equal(saved.images.length,2);assert.equal(saved.serie.title,'Manga');
 await c.wb.remove(job);assert.equal(c.store.webDownloads[job.id],undefined);assert.equal(c.disk.get(job.files[0].key),null);
});
test('a failed later page deletes partial files and never reports completion',async()=>{
 const c=setup();let n=0;c.fetch=async()=>{if(++n===2)throw Error('network');return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','Content-Length':'4'}});};
 await assert.rejects(c.wb.enqueue({id:'manga:1',kind:'manga',chapterId:'1',title:'Book'}));
 assert.equal(c.store.webDownloads['manga:1'].state,'error');assert.equal(c.disk.get('web-file:manga:1:0'),null);
 c.fetch=async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','Content-Length':'4'}});
 await c.wb.enqueue(c.store.webDownloads['manga:1']);assert.equal(c.store.webDownloads['manga:1'].state,'done');
});
test('queue runs at most two transfers and cancellation deletes the active item',async()=>{
 const c=setup();let active=0,max=0,release;const gate=new Promise(r=>release=r);
 c.fetch=async()=>new Response(new Uint8Array([0,0,0,4]),{headers:{'Content-Type':'video/mp4','Content-Length':'4'}});
 c.api.downloadUrl=async token=>{active++;max=Math.max(max,active);await gate;active--;return token;};
 const promises=[1,2,3].map(n=>c.wb.enqueue({id:'v'+n,kind:'anime',title:'Show',token:'https://pixeldrain.com/api/file/'+n}));
 await tick();assert.equal(max,2);release();await Promise.all(promises);assert.equal(max,2);
 const d=setup();d.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError'))));
 const pending=d.wb.enqueue({id:'cancel',kind:'anime',title:'Show',token:'https://pixeldrain.com/api/file/1'});await tick();
 await d.wb.remove(d.store.webDownloads.cancel);await assert.rejects(pending);assert.equal(d.store.webDownloads.cancel,undefined);
});
test('mixed manga and novel ZIP includes actual page images and chapter text; unfinished items cannot export',async()=>{
 const c=setup();await c.wb.enqueue({id:'manga:1',kind:'manga',chapterId:'1',title:'Manga',ep:'1'});
 c.store.novelDownloads['novel:n/one']={id:'n',slug:'one',title:'Novel',n:1,at:Date.now()};c.disk.set('novel:n/one',{n:{title:'Novel'},c:{title:'First',content:'Chapter text'}});
 await c.wb.exportZip(c.wb.records());assert.equal(c.exports.length,1);const buffer=Buffer.from(await c.exports[0].blob.arrayBuffer());assert.ok(buffer.includes(Buffer.from('Chapter text')));assert.ok(buffer.includes(Buffer.from('0001.png')));assert.ok(buffer.includes(Buffer.from('Novel 1.txt')));
 await c.wb.exportZip([{id:'pending',state:'queued'}]);assert.equal(c.exports.length,1);
});
test('file bytes are fetched directly by the client with CORS and never through an API route',async()=>{
 const c=setup(),calls=[];
 c.fetch=async(url,options)=>{calls.push({url,options});return new Response(new Uint8Array([0,0,0,4]),{headers:{'Content-Type':'video/mp4','Content-Length':'4'}});};
 const source='https://pixeldrain.com/api/file/client-only';
 const job=await c.wb.enqueue({id:'client',kind:'anime',title:'Show',token:source});
 assert.equal(calls.length,1);assert.equal(calls[0].url,source);assert.equal(calls[0].options.mode,'cors');assert.equal(calls[0].options.credentials,'omit');
 assert.equal(job.received,4);assert.equal(job.total,4);assert.equal(job.state,'done');
 assert.deepEqual(new Uint8Array(await c.disk.get(job.files[0].key).arrayBuffer()),new Uint8Array([0,0,0,4]));
});
test('CORS rejection offers the provider without using a server fallback or marking files saved',async()=>{
 const c=setup(),calls=[];c.fetch=async url=>{calls.push(url);throw new TypeError('Failed to fetch');};
 const source='https://pixeldrain.com/api/file/cors-blocked';
 await assert.rejects(c.wb.enqueue({id:'cors',kind:'anime',title:'Show',token:source}),/wbCors/);
 assert.deepEqual(calls,[source]);assert.equal(c.store.webDownloads.cors.error,'wbCors');assert.equal(c.store.webDownloads.cors.provider,source);
 assert.equal(c.store.webDownloads.cors.files.length,0);assert.equal(c.exports.length,0);
});
test('encoded responses use received bytes instead of their compressed Content-Length',async()=>{
 const c=setup();c.fetch=async()=>new Response(new Uint8Array([0,0,0,4]),{headers:{'Content-Type':'video/mp4','Content-Length':'2','Content-Encoding':'gzip'}});
 const job=await c.wb.enqueue({id:'encoded',kind:'anime',title:'Show',token:'https://pixeldrain.com/api/file/encoded'});assert.equal(job.state,'done');assert.equal(job.total,0);assert.equal(job.received,4);
});
test('an incomplete client response is rejected without retaining a partial payload',async()=>{
 const c=setup();c.fetch=async()=>new Response(new Uint8Array([0,0]),{headers:{'Content-Type':'video/mp4','Content-Length':'4'}});
 await assert.rejects(c.wb.enqueue({id:'truncated',kind:'anime',title:'Show',token:'https://pixeldrain.com/api/file/truncated'}));assert.equal(c.store.webDownloads.truncated.state,'error');assert.equal(c.store.webDownloads.truncated.files.length,0);
});
