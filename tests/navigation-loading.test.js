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
function playbackRoute(){
 const app=fs.readFileSync('app.js','utf8'),sources=deferred(),details=deferred(),timers=new Map(),errors=[],players=[];let html='',nodes=new Map(),timerId=0;
 const node=()=>({style:{},classList:{contains:()=>false,toggle(){}},querySelector(){return node();},addEventListener(){},getBoundingClientRect:()=>({x:0,y:0,width:800,height:450})});
 const view={style:{},classList:{toggle(){}},querySelectorAll:()=>[],firstElementChild:null,get innerHTML(){return html;},set innerHTML(s){html=s;this.firstElementChild={};nodes=new Map([...s.matchAll(/id="([^"]+)"/g)].map(m=>['#'+m[1],node()]));if(s.includes('class="stage"'))nodes.set('.stage',node());}};
 view.innerHTML='<div class="previous">Previous page</div>';
 const nav=node(),c={view,location:{hash:'#/play/show/1',replace(){}},history:{length:1},document:{body:{classList:{remove(){}}}},api:{web:true,player:(...args)=>players.push(args),sources:()=>sources.promise,awSources:async()=>[],stream:async()=>({url:'https://example.invalid/player',native:true})},
  scraper:{newView(){},details:()=>details.promise,animerco:async()=>[],wecima:async()=>[],ristoanime:async()=>[]},
  store:{downloads:{},history:{},seen:{},streams:{},prefs:{}},$:sel=>sel==='#nav'?nav:nodes.get(sel)||null,console:{error:e=>errors.push(e)},failed:e=>errors.push(e),spinner:()=>view.innerHTML='<div class="center"><div class="spin"></div></div>',
  setTimeout:f=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id),clearInterval(){},scrollTo(){},heroTimer:null,cardData:new Map(),pageRefresh:null,pagePress:null,picks:null,playerObs:null,
  closeContextMenu(){},CastInfo:{dispose(){}},closeSearch(){},closeDrawer(){},markActive(){},syncBar(){},immersed:false,
  showOf:()=>'/anime/show',playHash:p=>'#/play/'+p.replace(/^\/watch\//,''),persist(){},esc:String,t:k=>k,ICON:{},skipBtn:'',playBar:()=>'',skipIntro(){},markFiller(){},showPlayBar(){},bestPerHost:l=>l,serverRank:()=>0,QUALITY:['4K','FHD','HD','SD'],CHECK:'',ddSkel:()=>'',watchServer(){},noNames:String,
  ResizeObserver:class{observe(){}disconnect(){}},openMenu(){},closeMenu(){}};
 vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('async function play(epPath)'),app.indexOf('\nlet playerObs;',app.indexOf('async function play(epPath)'))),c);
 vm.runInContext(app.slice(app.indexOf('let routeVersion = 0;'),app.indexOf('\nlet redrawTimer;')),c);
 return {c,sources,details,timers,errors,players,flushSpinner(){for(const [id,f] of timers){timers.delete(id);f();}}};
}
test('delayed route spinner cannot erase the anime player while servers are loading',async()=>{
 const s=playbackRoute(),pending=s.c.route();
 s.details.resolve({title:'Show',episodes:[{path:'/watch/show/1',ep:'1'}]});await tick();
 assert.match(s.c.view.innerHTML,/id="srv"/);
 s.flushSpinner();
 s.sources.resolve([{label:'Host',quality:'HD',token:'ra:host'}]);await pending;await tick();
 assert.deepEqual(s.errors.map(e=>e.message),[]);assert.match(s.c.view.innerHTML,/id="srv"/);
 assert.ok(s.players.some(([url])=>url==='https://example.invalid/player'));
});
test('delayed route spinner still appears while the next page has not rendered',async()=>{
 const s=playbackRoute(),pending=s.c.route();s.flushSpinner();assert.match(s.c.view.innerHTML,/class="spin"/);
 s.details.resolve({title:'Show',episodes:[{path:'/watch/show/1',ep:'1'}]});s.sources.resolve([]);await pending;
 assert.deepEqual(s.errors.map(e=>e.message),[]);assert.match(s.c.view.innerHTML,/id="srv"/);
});
test('show page head: names escaped, play in the row and floating, its menu holds what it is given',()=>{
 const app=fs.readFileSync('app.js','utf8'),c={t:(k,v)=>v===undefined?k:k+':'+v,esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),ICON:new Proxy({},{get:(_,k)=>'['+String(k)+']'})};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('const detTabs ='),app.indexOf('// the ⋮ menu: any tap'))+'\nglobalThis.detHead=detHead;',c);
 const page=c.detHead({list:['chapters',951],banner:"it's.jpg",poster:'p.jpg',title:'<Demon>',alt:'Other',kinds:['Manhua','Ongoing'],views:'249,053',chips:['Action'],desc:'Story',rating:'<i class="r"></i>',play:{href:'#/read/1',label:'Read'},actions:'<button id="fav"></button>',more:'<button id="grf"></button>',refresh:true});
 assert.doesNotMatch(page,/<Demon>/);
 assert.match(page,/url\('it%27s\.jpg'\)/); // a quote in an address can't end the url()
 assert.equal(page.match(/href="#\/read\/1"/g).length,2);assert.match(page,/class="btn red det-fab" data-pane="eps"/); // the list tab keeps its play button
 assert.match(page,/class="det-tabs"/);assert.match(page,/class="det-kinds"><span>Manhua<\/span><span>Ongoing<\/span>/);assert.match(page,/class="det-stat"/);
 assert.match(page,/class="det-more"><button id="grf"><\/button><button class="icon-btn det-rf" id="rf"/);
 // a film: no tabs, no poster, no play, no refresh
 const bare=c.detHead({title:'Film'});
 assert.doesNotMatch(bare,/det-tabs|det-fab|class="poster"|id="rf"|det-stat|det-kinds/);assert.match(bare,/class="det bare"/);
});
