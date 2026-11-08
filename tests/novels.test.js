const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(load) {
  const nodes=new Map(), events={}, writes=[];
  const ctx={parsers:{},api:{web:true,get:async()=>null,set:async()=>{}},load,URL,URLSearchParams,location:{hash:'#/novels'},lang:'en',
    store:{novels:{},novelSeen:{},novelDownloads:{},prefs:{}},t:(k,n)=>k+(n===undefined?'':':'+n),esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    view:{innerHTML:''},grid:cs=>'<div class="grid">'+cs.map(c=>c.title).join('')+'</div>',row:()=>'',card:c=>c.title,
    picks:null,pagePress:null,selBtn:()=>'',selBar:()=>'',selectable:()=>()=>{},pageRefresh:null,CHEVRON:'',openMenu:()=>{},closeMenu:()=>{},pickSheet:()=>{},heroPage:()=>{},chips:()=>'',inList:()=>false,toggleList:()=>{},ICON:{back:'',search:'',x:'',sort:'',novel:'',plus:'',check:''},toast:()=>{},persist:k=>writes.push(k),requestAnimationFrame:f=>f(),scrollTo:()=>{},
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
  c.nodes.get('#nv-paper-menu').onclick({target:{closest:()=>({dataset:{paper:'sepia'}})}});
  assert.equal(c.store.prefs.nvPaper,'sepia');assert.equal(c.nodes.get('.nv-reader').dataset.paper,'sepia');
  assert.equal(offset,500);assert.match(c.view.innerHTML,/&lt;script>/);assert.doesNotMatch(c.view.innerHTML,/<script>/);
  assert.match(c.view.innerHTML,/#\/novels\/read\/book\/chapter-2/);
  c.scrollY=750;c.events.scroll();c.location.hash='#/novels';c.events.hashchange();
  assert.equal(c.store.novels.book.progress,.75);assert.equal(c.events.scroll,undefined);assert.ok(c.writes.includes('novels'));
});
test('empty chapter is rejected rather than saved as a reading position',async()=>{
  const c=setup(async(_,u)=>u.endsWith('/view')?{data:{novel:{}}}:{data:{id:'1',content:''}});
  c.location.hash='#/novels/read/b/ch';await assert.rejects(c.novelRead('b','ch'),/nvNoText/);assert.equal(c.store.novels.b,undefined);
});
test('home reuses the shared hero and rows and remains usable if a secondary list fails',async()=>{
  const c=setup(async(_,url)=>{
    const sort=new URL(url).searchParams.get('sort');
    if(sort==='views')throw Error('temporarily unavailable');
    return {data:[{id:sort,title:sort,descriptionShort:'Synopsis',coverURL:'/cover.webp'}]};
  });
  const rows=[];let hero;
  c.row=(label,items,href)=>{rows.push({label,items,href});return label;};
  c.heroPage=(slides,body)=>hero={slides,body};
  await c.novelsRoute([]);
  assert.equal(hero.slides[0].banner,'https://novltime.com/cover.webp');
  assert.equal(hero.slides[0].info,'#/novels/series/trending');
  assert.equal(hero.slides[0].desc,'Synopsis');
  assert.equal(rows.find(r=>r.label==='mHot').href,'#/novels/browse?sort=trending');
  assert.equal(rows.find(r=>r.label==='mNew').items.length,1);
});
test('browse filter sheets preserve search when selecting a genre',async()=>{
  const c=setup(async()=>({data:[],meta:{}}));c.location.hash='#/novels/browse?search=dragon';
  let pick;c.pickSheet=(name,opts,cur,onPick)=>pick=onPick;
  await c.novelsBrowse();
  c.nodes.get('.nv-page .fchips').onclick({target:{closest:()=>({dataset:{k:'genre'}})}});
  pick('fantasy');assert.equal(c.location.hash,'#/novels/browse?search=dragon&genre=fantasy');
});
test('novel chapters can be filtered by exact number and reversed across loaded pages',async()=>{
  const c=setup(async(_,url)=>url.endsWith('/view')?{data:{novel:{id:'book',title:'Book',genres:[]}}}:{data:[{id:'1',slug:'one',order:1,title:'First'},{id:'2',slug:'two',order:2,title:'Second'}],meta:{}});
  c.location.hash='#/novels/series/book';c.nodes.set('#nv-jump',{value:''});
  await c.novelDetails('book');
  const chapters=c.nodes.get('.nv-chapters');
  assert.ok(chapters.innerHTML.indexOf('First')<chapters.innerHTML.indexOf('Second'));
  c.nodes.get('#nv-reverse').onclick();assert.ok(chapters.innerHTML.indexOf('Second')<chapters.innerHTML.indexOf('First'));
  c.nodes.get('#nv-jump').value='1';c.nodes.get('#nv-jump').oninput();assert.match(chapters.innerHTML,/First/);assert.doesNotMatch(chapters.innerHTML,/Second/);
});
test('read state distinguishes opening a chapter, finishing it, and marking it unread',async()=>{
  const c=setup(async(_,url)=>url.endsWith('/view')?{data:{novel:{id:'book',title:'Book'}}}:url.endsWith('/context')?{data:{next:null}}:{data:{id:'ch',slug:'one',order:1,content:'Text'}});
  c.location.hash='#/novels/read/book/one';await c.novelRead('book','one');
  assert.equal(c.store.novelSeen.ch,1);
  c.scrollY=990;c.events.scroll();assert.equal(c.store.novelSeen.ch,2);
  vm.runInContext('nvMark(["ch"],0)',c);assert.equal(c.store.novelSeen.ch,undefined);
  c.location.hash='#/novels';c.events.hashchange();
});
test('chapter download is deduplicated and its saved text opens without any network requests',async()=>{
  const calls=[],disk=new Map();
  const c=setup(async(_,url,force,keep)=>{calls.push({url,keep});return url.endsWith('/context')?{data:{next:{slug:'two'}}}:{data:{id:'ch',slug:'one',order:1,content:'Saved text'}};});
  c.api.get=async key=>disk.get(key);c.api.set=async(key,value)=>disk.set(key,value);
  const n={id:'book',title:'Book'};c.n=n;
  await Promise.all([vm.runInContext('nvDownload("book","one",n)',c),vm.runInContext('nvDownload("book","one",n)',c)]);
  assert.equal(calls.length,2);assert.ok(calls.every(x=>x.keep));assert.equal(c.store.novelDownloads['novel:book/one'].chapterId,'ch');
  c.load=()=>{throw Error('offline');};c.location.hash='#/novels/read/book/one';
  await c.novelRead('book','one');assert.match(c.view.innerHTML,/Saved text/);assert.match(c.view.innerHTML,/book\/two/);
  c.location.hash='#/novels';c.events.hashchange();
  await vm.runInContext('nvDeleteDownload("book","one")',c);
  assert.equal(disk.get('novel:book/one'),null);assert.equal(c.store.novelDownloads['novel:book/one'],undefined);
});
test('storage failures never mark a chapter as downloaded and a retry can succeed',async()=>{
  const c=setup(async(_,u)=>u.endsWith('/context')?{data:{}}:{data:{id:'c',slug:'one',content:'Text'}});
  c.n={id:'book',title:'Book'};c.api.set=async()=>{throw Error('quota');};
  await assert.rejects(vm.runInContext('nvDownload("book","one",n)',c),/quota/);
  assert.equal(c.store.novelDownloads['novel:book/one'],undefined);
  c.api.set=async()=>{};await vm.runInContext('nvDownload("book","one",n)',c);
  assert.ok(c.store.novelDownloads['novel:book/one']);
});
