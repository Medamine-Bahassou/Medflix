const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
 const exports=[],writes=[],toasts=[],urls=new Map();let serial=0;
 const c={Blob,AbortController,DOMException,BrowserZip:require('../zip'),t:k=>k,toast:(...args)=>toasts.push(args),setTimeout:()=>0,
  api:{downloadUrl:async token=>token,get:async()=>null,set:async(k,value)=>{writes.push({k,value});if(value!==null)throw Error('download must not persist data');}},
  scraper:{cached:()=>null},parsers:{novelJSON:j=>j},nvUrl:path=>'https://novltime.com/api/v1'+path,nvParagraphs:c=>[c.content],
  mChapter:async id=>({id,images:['https://source.test/0001.png','https://source.test/0002.png']}),
  fetch:async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','Content-Length':'4'}}),
  URL:{createObjectURL(blob){const key='blob:'+(++serial);urls.set(key,blob);return key;},revokeObjectURL:key=>urls.delete(key)},
  document:{body:{append(){}},createElement:()=>({click(){exports.push({name:this.download,href:this.href,target:this.target,blob:urls.get(this.href)});},remove(){}})},exports,writes,toasts};
 c.ClientTransfer={fetch:(...args)=>c.fetch(...args)};vm.createContext(c);vm.runInContext(fs.readFileSync('web-downloads.js','utf8'),c);c.wb=vm.runInContext('WebDownloads',c);return c;
}
test('single video Download hands the source URL straight to the browser without fetching or storing its bytes',async()=>{
 const c=setup();c.fetch=()=>{throw Error('single videos must use the native browser downloader');};
 await c.wb.downloadVideo([{id:'v',title:'Show',ep:1,token:'https://source.test/video.mp4'}]);
 assert.equal(c.exports.length,1);assert.equal(c.exports[0].href,'https://source.test/video.mp4');assert.equal(c.exports[0].target,'_blank');assert.equal(c.writes.length,0);
});
test('manga Download creates a browser ZIP with no app file index or persisted payload',async()=>{
 const c=setup(),requests=[];const fetch=c.fetch;c.fetch=(url,opt)=>{requests.push({url,opt});return fetch(url,opt);};
 await c.wb.downloadManga({title:'Manga'},[{id:'216',n:216}]);
 assert.equal(c.exports.length,1);assert.match(c.exports[0].name,/Manga.*216\.zip$/);assert.equal(c.exports[0].blob.type,'application/zip');
 assert.ok(requests.every(r=>r.url.startsWith('https://source.test/')&&r.opt.mode==='cors'));assert.equal(c.writes.length,0);
 await c.wb.downloadManga({title:'Manga'},[{id:'216',n:216}]);assert.equal(c.exports.length,2);assert.equal(requests.length,4,'repeat download must not use an in-app saved copy');
});
test('multiple chapters produce one combined ZIP containing all actual page files',async()=>{
 const c=setup();await c.wb.downloadManga({title:'Manga'},[{id:'1',n:1},{id:'2',n:2}]);
 assert.equal(c.exports.length,1);const archive=Buffer.from(await c.exports[0].blob.arrayBuffer());assert.ok(archive.includes(Buffer.from('chapter 1 1/0001.png')));assert.ok(archive.includes(Buffer.from('chapter 2 2/0002.png')));assert.equal(c.writes.length,0);
});
test('failed or CORS-blocked transfers never save partial archives or use server fallback',async()=>{
 const c=setup(),requests=[];let count=0;c.fetch=async url=>{requests.push(url);if(++count===2)throw new TypeError('CORS blocked');return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});};
 await c.wb.downloadManga({title:'Manga'},[{id:'1',n:1}]);assert.equal(c.exports.length,0);assert.equal(c.writes.length,0);assert.ok(requests.every(u=>u.startsWith('https://source.test/')));assert.equal(c.toasts.at(-1)[0],'wbCors');
});
test('duplicate clicks share an active action, not a persistent download queue',async()=>{
 const c=setup();let release;const gate=new Promise(r=>release=r),fetch=c.fetch;c.fetch=async(...args)=>{await gate;return fetch(...args);};
 const pending=c.wb.downloadManga({title:'Manga'},[{id:'1',n:1}]);await c.wb.downloadManga({title:'Manga'},[{id:'1',n:1}]);assert.equal(c.toasts.at(-1)[0],'dlActive');release();await pending;assert.equal(c.exports.length,1);assert.equal(c.writes.length,0);
});
test('novel text is exported from the client or existing read cache without making a server proxy request',async()=>{
 const c=setup(),requests=[];c.fetch=async(url,opt)=>{requests.push(url);return new Response(JSON.stringify({success:true,data:{title:'First',content:'Chapter text'}}),{headers:{'Content-Type':'application/json'}});};
 await c.wb.downloadNovels('book',[{slug:'one',order:1}],{title:'Novel'});
 assert.equal(requests[0],'https://novltime.com/api/v1/novels/book/chapters/by-slug/one');assert.equal(c.exports.length,1);assert.match(await c.exports[0].blob.text(),/Chapter text/);assert.equal(c.writes.length,0);
 c.scraper.cached=()=>({success:true,data:{title:'First',content:'Already read'}});c.fetch=()=>{throw Error('cache export must not request a server');};
 await c.wb.downloadNovels('book',[{slug:'one',order:1}],{title:'Novel'});assert.match(await c.exports[1].blob.text(),/Already read/);assert.equal(c.writes.length,0);
});
test('cleanup removes legacy app payloads without creating any new saved downloads',async()=>{
 const c=setup();c.api.get=async key=>key==='webDownloads'?{x:{files:[{key:'web-file:x:0'}]}}:{'novel:b/one':{}};
 await c.wb.cleanupLegacyDownloads();assert.deepEqual(c.writes.map(w=>w.k),['web-file:x:0','novel:b/one','webDownloads','novelDownloads']);assert.ok(c.writes.every(w=>w.value===null));
});
