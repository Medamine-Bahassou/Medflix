const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const episodes=n=>Array.from({length:n},(_,i)=>({ep:String(i+1),path:'/watch/show/'+(i+1)}));
function listContext(n=1200,pending=false) {
  const nodes=new Map();let focused;
  const node=()=>({style:{},value:'',setAttribute(){},classList:{toggle(){}},closest:()=>({style:{}})});
  const eps={innerHTML:'',closest:()=>({style:{}}),querySelectorAll(){return [...this.innerHTML.matchAll(/data-pick="([^"]+)"/g)].map(m=>({dataset:{pick:m[1]},focus:()=>focused=m[1]}));}};
  const c={d:{episodes:episodes(n),episodesPending:pending,title:'Show',alt:'',banner:'',poster:''},eps,h:null,info:{},kinds:{},type:'anime',
    actionEpisodes:episodes(n).map(e=>({id:e.path,ep:e.ep})),store:{prefs:{},seen:{}},$:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},keepEpisodePosition:(_,update)=>update(),
    epRow:(n,info,pic,href,seen,last,path)=>`<a data-pick="${path}">${n}</a>`,epSkeleton:n=>n?`<skeletons data-count="${n}"></skeletons>`:'',
    playHash:p=>'#'+p,persist(){},scraper:{episodeInfo:()=>new Promise(()=>{}),filler:()=>new Promise(()=>{})},
    epActions:(list,all,ids)=>{c.selectedIds=ids;},t:(key,n,total)=>key==='episodesShown'?`${n}/${total}`:key};
  vm.createContext(c);
  const start=source.indexOf('  const EPISODE_BATCH ='),end=source.indexOf("  if (type === 'anime' && eps)",start);
  vm.runInContext(source.slice(start,end)+'\nthis.drawEps=drawEps;',c);
  return {c,nodes,get focused(){return focused;},visible:()=>Array.from(eps.querySelectorAll(),el=>el.dataset.pick)};
}
test('long shows render 24 episodes and expand only when Show more is clicked',()=>{
  const x=listContext();assert.equal(x.visible().length,24);assert.equal(x.nodes.get('#ep-count').textContent,'24/1200');
  assert.equal(x.nodes.get('#ep-more').style.visibility,'');
  x.nodes.get('#ep-more').onclick();assert.equal(x.visible().length,48);assert.equal(x.focused,'/watch/show/25');assert.equal(x.c.selectedIds().length,48);
  x.c.drawEps();assert.equal(x.visible().length,48,'a background update preserves the expanded limit');
});
test('pending placeholders fill the remaining slots and completion stays bounded',()=>{
  const x=listContext(20,true);assert.equal(x.visible().length,20);assert.match(x.c.eps.innerHTML,/skeletons data-count="4"/);assert.equal(x.nodes.get('#ep-more').disabled,true);
  x.c.d.episodes=episodes(1200);x.c.d.episodesPending=false;x.c.drawEps();
  assert.equal(x.visible().length,24);assert.doesNotMatch(x.c.eps.innerHTML,/skeletons/);assert.equal(x.nodes.get('#ep-more').disabled,false);
});
test('episode search finds a number outside the preview and reverse order remains usable',()=>{
  const x=listContext();x.nodes.get('#epf').value='800';x.nodes.get('#epf').oninput();assert.deepEqual(x.visible(),['/watch/show/800']);
  x.nodes.get('#epf').value='';x.nodes.get('#epf').oninput();assert.equal(x.visible().length,24);
  x.nodes.get('#rev').onclick();assert.equal(x.visible()[0],'/watch/show/1200');assert.equal(x.visible().length,24);
});
test('short shows leave the pagination footer space reserved when there is nothing to expand',()=>{
  const x=listContext(12);assert.equal(x.visible().length,12);assert.equal(x.nodes.get('#ep-more').style.visibility,'hidden');assert.equal(x.nodes.get('#ep-count').textContent,'12/12');
});
test('background episode insertion preserves the viewed row, keyboard focus and section height',()=>{
  let y=200,top=320,focused=false;
  const row=()=>({dataset:{pick:'ep-20'},isConnected:true,getBoundingClientRect:()=>({top:top-y,bottom:top-y+88}),focus:()=>focused=true});
  const section={style:{},getBoundingClientRect:()=>({height:1000})},page={querySelectorAll:()=>[]},list={closest:s=>s==='.det-page'?page:section,querySelectorAll:()=>[row()]};
  const c={document:{activeElement:{closest:()=>row()}},innerHeight:600,scrollTo:options=>y=options.top};Object.defineProperty(c,'scrollY',{get:()=>y});
  vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function keepEpisodePosition('),source.indexOf('async function title(')),c);
  c.keepEpisodePosition(list,()=>{top+=300;},true);
  assert.equal(top-y,120);assert.equal(section.style.minHeight,'1000px');assert.equal(focused,true);
});
