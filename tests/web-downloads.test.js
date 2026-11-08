const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
 const exports=[],writes=[],toasts=[],urls=new Map(),choices=[],opened=[];let serial=0;
 const c={Blob,AbortController,DOMException,BrowserZip:require('../zip'),t:k=>k,toast:(...args)=>toasts.push(args),setTimeout:(f,ms)=>ms>5000?0:setImmediate(f),clearTimeout(){},
  NV_SITE:'https://novltime.com',pickSheet:(title,opts,cur,onPick)=>choices.push({title,opts,onPick}),api:{fetch:async url=>(await c.fetch(url)).text(),openExternal:url=>opened.push(url),downloadUrl:async token=>token,get:async()=>null,set:async(k,value)=>{writes.push({k,value});if(value!==null)throw Error('download must not persist data');}},
  scraper:{cached:()=>null},parsers:{novelJSON:j=>j},nvUrl:path=>'https://novltime.com/api/v1'+path,nvParagraphs:c=>[c.content],
  mChapter:async id=>({id,images:['https://source.test/0001.png','https://source.test/0002.png']}),
  fetch:async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png','Content-Length':'4'}}),
  URL:{createObjectURL(blob){const key='blob:'+(++serial);urls.set(key,blob);return key;},revokeObjectURL:key=>urls.delete(key)},
  document:{body:{append(){}},createElement:()=>({click(){exports.push({name:this.download,href:this.href,target:this.target,blob:urls.get(this.href)});},remove(){}})},exports,writes,toasts,choices,opened};
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
 const c=setup(),requests=[];c.fetch=async url=>{requests.push(url);if(url.endsWith('0002.png'))throw new TypeError('CORS blocked');return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});};
 await c.wb.downloadManga({title:'Manga'},[{id:'1',n:1}]);assert.equal(c.exports.length,0);assert.equal(c.writes.length,0);assert.ok(requests.every(u=>u.startsWith('https://source.test/')));assert.equal(c.toasts.at(-1)[0],'wbCors');
});
test('duplicate clicks share an active action, not a persistent download queue',async()=>{
 const c=setup();let release;const gate=new Promise(r=>release=r),fetch=c.fetch;c.fetch=async(...args)=>{await gate;return fetch(...args);};
 const pending=c.wb.downloadManga({title:'Manga'},[{id:'1',n:1}]);await c.wb.downloadManga({title:'Manga'},[{id:'1',n:1}]);assert.equal(c.toasts.at(-1)[0],'dlActive');release();await pending;assert.equal(c.exports.length,1);assert.equal(c.writes.length,0);
});
test('novel text comes by the reader route or the read cache, and is saved by the browser',async()=>{
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
test('manga reader Download uses its displayed pages directly and delivers a ZIP without an app download job',async()=>{
 const c=setup(),requests=[];c.mChapter=()=>{throw Error('reader download must not refetch chapter metadata');};
 const fetch=c.fetch;c.fetch=(url,options)=>{requests.push(url);return fetch(url,options);};
 await c.wb.downloadManga({title:'Manga'},[{id:'216',n:216,images:['https://source.test/reader-page.png']}]);
 assert.deepEqual(requests,['https://source.test/reader-page.png']);assert.equal(c.exports.length,1);assert.match(c.exports[0].name,/216\.zip$/);assert.equal(c.exports[0].blob.type,'application/zip');assert.equal(c.writes.length,0);
});
test('a passing refusal is retried, and a long novel selection keeps its order in one ZIP',async()=>{
 const c=setup();let refused=0,running=0,most=0;c.fetch=async url=>{running++;most=Math.max(most,running);await new Promise(setImmediate);running--;if(url.endsWith('/c3')&&!refused++)throw Error('proxy HTTP 500');return new Response(JSON.stringify({success:true,data:{title:url.slice(-2),content:'text of '+url.slice(-2)}}));};
 const list=Array.from({length:9},(_,i)=>({slug:'c'+i,order:i}));await c.wb.downloadNovels('book',list,{title:'Novel'});
 assert.equal(refused,2,'refused once, then asked again');assert.equal(most,4);assert.equal(c.choices.length,0);assert.equal(c.exports.length,1);assert.equal(c.exports[0].blob.type,'application/zip');
 const zip=Buffer.from(await c.exports[0].blob.arrayBuffer()).toString('latin1');let at=0;for(const x of list){const here=zip.indexOf('text of '+x.slug,at);assert.ok(here>at);at=here;}
 assert.deepEqual(c.toasts.at(-1).slice(0,1),['wbProgress']);assert.equal(c.writes.length,0);
});
test('a chapter that keeps failing leaves the rest: asked first, never a silently short ZIP',async()=>{
 const c=setup();c.fetch=async url=>{if(url.endsWith('/two'))throw Error('down');return new Response(JSON.stringify({success:true,data:{title:'T',content:'text'}}));};
 await c.wb.downloadNovels('book',[{slug:'one',order:1},{slug:'two',order:2},{slug:'three',order:3}],{title:'Novel'});
 assert.equal(c.exports.length,0);assert.equal(c.choices[0].title,'wbSomeFailed');assert.deepEqual(Array.from(c.choices[0].opts,o=>o[0]),['available','cancel']);
 c.choices[0].onPick('cancel');assert.equal(c.exports.length,0);
 await c.choices[0].onPick('available');assert.equal(c.exports.length,1);const zip=Buffer.from(await c.exports[0].blob.arrayBuffer());assert.ok(zip.includes(Buffer.from('chapter 1 one/')));assert.ok(zip.includes(Buffer.from('chapter 3 three/')));assert.ok(!zip.includes(Buffer.from('chapter 2 two/')));
});
test('a manga chapter missing too many pages is not saved, and the others keep their pages',async()=>{
 const c=setup();c.mChapter=async id=>({id,images:id==='bad'?['https://source.test/ok.png','https://source.test/gone.png']:['https://source.test/1.png','https://source.test/2.png','https://source.test/3.png','https://source.test/4.png']});
 const png=()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});c.fetch=async url=>{if(url.endsWith('gone.png'))throw new TypeError('CORS');return png();};
 await c.wb.downloadManga({title:'Manga'},[{id:'bad',n:1},{id:'good',n:2}]);assert.equal(c.choices[0].title,'wbSomeFailed');
 await c.choices[0].onPick('available');const zip=Buffer.from(await c.exports[0].blob.arrayBuffer());assert.ok(!zip.includes(Buffer.from('chapter 1 bad/')));for(const n of ['0001','0002','0003','0004'])assert.ok(zip.includes(Buffer.from('chapter 2 good/'+n+'.png')));
});
test('a dead page does not cost a long chapter: the rest are saved under their own numbers, and it is said',async()=>{
 const c=setup();c.mChapter=async id=>({id,images:Array.from({length:12},(_,i)=>'https://source.test/'+(i+1)+'.png')});
 c.fetch=async url=>url.endsWith('/5.png')?new Response('gone',{status:404}):new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
 await c.wb.downloadManga({title:'Manga'},[{id:'1',n:1}]);assert.equal(c.choices.length,0);assert.equal(c.exports.length,1);assert.equal(c.toasts.at(-1)[0],'wbPagesMissing');
 const zip=Buffer.from(await c.exports[0].blob.arrayBuffer());assert.ok(zip.includes(Buffer.from('0004.png')));assert.ok(!zip.includes(Buffer.from('0005.png')));assert.ok(zip.includes(Buffer.from('0006.png')));
});
test('open novel reader exports its loaded chapter with no network or cache dependency',async()=>{
 const c=setup();c.fetch=()=>{throw Error('reader export must not transfer text');};c.api.fetch=c.fetch;c.scraper.cached=()=>{throw Error('reader export must use displayed text');};
 await c.wb.downloadNovels('book',[{slug:'one',order:1,title:'First',contentJson:[{text:'On-screen chapter'}],content:'On-screen chapter'}],{title:'Novel'});
 assert.equal(c.exports.length,1);assert.equal(c.exports[0].name,'Novel 1.txt');assert.match(await c.exports[0].blob.text(),/On-screen chapter/);assert.equal(c.writes.length,0);
});
