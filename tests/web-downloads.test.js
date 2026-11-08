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
  fetch:async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','X-File-Total':'4','X-File-Offset':'0'}}),
  mChapter:async id=>({id,n:'1',serie:{id:'series',title:'Manga'},images:['https://appswat.com/v2/media/1','https://appswat.com/v2/media/2']}),
  nvParagraphs:c=>[c.content],nvKey:(id,slug)=>'novel:'+id+'/'+slug,
  URL:{createObjectURL(blob){const key='blob:'+(++serial);objectUrls.set(key,blob);return key;},revokeObjectURL:key=>objectUrls.delete(key)},
  document:{body:{append(){}},createElement:()=>({click(){exports.push({name:this.download,blob:objectUrls.get(this.href)});},remove(){}})},disk,exports};
 vm.createContext(c);vm.runInContext(fs.readFileSync('web-downloads.js','utf8'),c);c.wb=vm.runInContext('WebDownloads',c);return c;
}
test('manga pages are saved individually and can be read from their blobs without refetching',async()=>{
 const c=setup();const job=await c.wb.enqueue({id:'manga:1',kind:'manga',chapterId:'1',ep:'1',title:'Book'});
 assert.equal(job.state,'done');assert.equal(job.files.length,2);
 c.mChapter=()=>{throw Error('offline');};const saved=await c.wb.chapter('1');assert.equal(saved.images.length,2);assert.equal(saved.serie.title,'Manga');
 await c.wb.remove(job);assert.equal(c.store.webDownloads[job.id],undefined);assert.equal(c.disk.get(job.files[0].key),null);
});
test('a failed later page deletes partial files and never reports completion',async()=>{
 const c=setup();let n=0;c.fetch=async()=>{if(++n===2)throw Error('network');return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','X-File-Total':'4','X-File-Offset':'0'}});};
 await assert.rejects(c.wb.enqueue({id:'manga:1',kind:'manga',chapterId:'1',title:'Book'}));
 assert.equal(c.store.webDownloads['manga:1'].state,'error');assert.equal(c.disk.get('web-file:manga:1:0'),null);
 c.fetch=async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','X-File-Total':'4','X-File-Offset':'0'}});
 await c.wb.enqueue(c.store.webDownloads['manga:1']);assert.equal(c.store.webDownloads['manga:1'].state,'done');
});
test('queue runs at most two transfers and cancellation deletes the active item',async()=>{
 const c=setup();let active=0,max=0,release;const gate=new Promise(r=>release=r);
 c.fetch=async()=>new Response(new Uint8Array([0,0,0,4]),{headers:{'Content-Type':'video/mp4','X-File-Total':'4','X-File-Offset':'0'}});
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
