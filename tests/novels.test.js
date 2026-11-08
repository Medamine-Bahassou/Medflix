const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(load) {
  const nodes=new Map(), events={}, writes=[];
  const ctx={parsers:{},api:{web:true},load,URL,URLSearchParams,location:{hash:'#/novels'},lang:'en',
    store:{novels:{},prefs:{}},t:(k,n)=>k+(n===undefined?'':':'+n),esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    view:{innerHTML:''},grid:cs=>'<div class="grid">'+cs.map(c=>c.title).join('')+'</div>',row:()=>'',card:c=>c.title,
    inList:()=>false,toggleList:()=>{},ICON:{back:''},toast:()=>{},persist:k=>writes.push(k),requestAnimationFrame:f=>f(),scrollTo:()=>{},
    document:{documentElement:{scrollHeight:2000}},innerHeight:1000,scrollY:0,clearTimeout,setTimeout,
    addEventListener:(k,f)=>events[k]=f,removeEventListener:(k,f)=>{if(events[k]===f)delete events[k];},
    $:sel=>{if(!nodes.has(sel))nodes.set(sel,{style:{setProperty(){}},dataset:{},isConnected:true,insertAdjacentHTML(_,html){this.html=(this.html||'')+html;}});return nodes.get(sel);},nodes,events,writes};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('novels.js','utf8'),ctx);return ctx;
}
test('novel catalogue uses Arabic search and sort and appends cursor results without duplicates',async()=>{
  const calls=[];
  const c=setup(async(_,url)=>{calls.push(url);return {success:true,data:[{id:'a',title:'A',coverURL:'/a.webp'}],meta:{hasMore:true,nextCursor:'one'}};});
  c.location.hash='#/novels?search=test&sort=views';
  c.api.fetch=async url=>{calls.push(url);return JSON.stringify({success:true,data:[{id:'a',title:'A'},{id:'b',title:'B'}],meta:{hasMore:false}});};
  await c.novelsRoute([]);
  assert.match(calls[0],/language=ar/);assert.match(calls[0],/search=test/);assert.match(calls[0],/sort=views/);
  const button=c.nodes.get('#nv-more');await button.onclick({currentTarget:button});
  assert.equal(c.nodes.get('#nv-results .grid').html,'B');assert.equal(button.hidden,true);
  assert.match(calls[1],/cursor=one/);
});
test('late catalogue result does not replace the next page',async()=>{
  let done;const c=setup(()=>new Promise(r=>done=r));
  const pending=c.novelsBrowse();c.location.hash='#/anime';c.view.innerHTML='anime';
  done({data:[],meta:{}});await pending;assert.equal(c.view.innerHTML,'anime');
});
test('reader escapes chapter text, restores progress and saves progress without leaving scroll handlers behind',async()=>{
  const c=setup(async(_,url)=>{
    if(url.endsWith('/view'))return {data:{novel:{title:'Book',coverURL:'/a.webp'}}};
    if(url.endsWith('/context'))return {data:{next:{slug:'chapter-2'},prev:null}};
    return {data:{id:'ch1',slug:'chapter-1',order:1,title:'First',contentJson:[{text:'<script>bad()</script>'}]}};
  });
  c.location.hash='#/novels/read/book/chapter-1';c.store.novels.book={slug:'chapter-1',progress:.5};
  let offset;c.scrollTo=(_,y)=>offset=y;
  await c.novelRead('book','chapter-1');
  assert.equal(offset,500);assert.match(c.view.innerHTML,/&lt;script>/);assert.doesNotMatch(c.view.innerHTML,/<script>/);
  assert.match(c.view.innerHTML,/#\/novels\/read\/book\/chapter-2/);
  c.scrollY=750;c.events.scroll();c.location.hash='#/novels';c.events.hashchange();
  assert.equal(c.store.novels.book.progress,.75);assert.equal(c.events.scroll,undefined);assert.ok(c.writes.includes('novels'));
});
test('empty chapter is rejected rather than saved as a reading position',async()=>{
  const c=setup(async(_,u)=>u.endsWith('/view')?{data:{novel:{}}}:{data:{id:'1',content:''}});
  c.location.hash='#/novels/read/b/ch';await assert.rejects(c.novelRead('b','ch'),/nvNoText/);assert.equal(c.store.novels.b,undefined);
});
