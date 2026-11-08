const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function sectionContext(){
 const c={location:{hash:'#/'},lang:'en',scraper:{changed:()=>c.changes++},changes:0};vm.createContext(c);
 vm.runInContext(fs.readFileSync('manga.js','utf8').split('// Optional provider')[0],c);return c;
}
test('navigation renders a ready source without waiting for a stalled source and adds changed rows once',async()=>{
 const c=sectionContext(),slow=deferred();c.tasks=[async()=>({items:['ready']}),()=>slow.promise];
 const result=await c.firstSections(c.tasks);assert.equal(result[0].items[0],'ready');assert.equal(result[1],null);
 slow.resolve({items:['late']});await tick();assert.equal(c.changes,1);
 await c.firstSections(c.tasks);await tick();assert.equal(c.changes,1,'identical cached rows must not cause a redraw loop');
});
test('revisiting a section displays the previous rows even while all source requests are pending',async()=>{
 const c=sectionContext();await c.firstSections([async()=>({items:['cached']})]);
 const slow=deferred();const result=await c.firstSections([()=>slow.promise]);
 assert.equal(result[0].items[0],'cached');c.location.hash='#/manga';slow.resolve({items:['new']});await tick();assert.equal(c.changes,0);
});
test('one failed source leaves the other rows usable; failure of every source still reports an error',async()=>{
 const c=sectionContext();const result=await c.firstSections([async()=>{throw Error('down');},async()=>({items:['ok']})]);
 assert.equal(result[1].items[0],'ok');c.location.hash='#/another';
 await assert.rejects(c.firstSections([async()=>{throw Error('down');}]),e=>e.name==='AggregateError');
});
test('simultaneous page requests hydrate the disk cache once and preserve both fetched pages',async()=>{
 const hydration=deferred();let reads=0;
 const c={window:{},URL,DOMParser:function(){},setTimeout:()=>0,clearTimeout:()=>{},api:{get:()=>{reads++;return hydration.promise;},fetch:async url=>JSON.stringify({url})}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('scraper.js','utf8'),c);
 vm.runInContext('parsers.novelJSON = j=>j',c);
 const a=vm.runInContext('load("novelJSON","https://novltime.com/a")',c),b=vm.runInContext('load("novelJSON","https://novltime.com/b")',c);
 assert.equal(reads,1);hydration.resolve({});await Promise.all([a,b]);
 assert.equal(vm.runInContext('Object.keys(cache).length',c),2);
});
test('anime enrichment reuses cached extras and does not keep redrawing unchanged data',async()=>{
 const src=fs.readFileSync('risto.js','utf8'),start=src.indexOf('      const soon = (name,p) =>'),end=src.indexOf('      const tastes =',start);
 const c={homeExtras:new Map(),extraKey:'',ready:Promise.resolve(),location:{hash:'#/anime'},hash:'#/anime',redraw:()=>c.redraws++,redraws:0};vm.createContext(c);vm.runInContext(src.slice(start,end)+'\nglobalThis.soon=soon;',c);
 let slow=deferred();assert.equal(await c.soon('art',slow.promise),null);slow.resolve(['cover']);await tick();assert.equal(c.redraws,1);
 slow=deferred();assert.deepEqual(await c.soon('art',slow.promise),['cover']);slow.resolve(['cover']);await tick();assert.equal(c.redraws,1);
});
