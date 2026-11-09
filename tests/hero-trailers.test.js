const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function setup() {
  let now=0;
  const c={store:{prefs:{}},URL,scraper:{},edMovieOf:async()=>({}),Date:class extends Date{static now(){return now;}}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('const heroTrailers ='),source.indexOf('const SOUND ='))+'\nthis.youtubeId=youtubeId;this.trailerId=trailerId;',c);
  c.advance=n=>now+=n;
  return c;
}
test('carousel recognizes YouTube embeds, watch links, short links, mobile, shorts and iframe markup',()=>{
  const c=setup(),id='Abc_123-xYz';
  for(const value of [id,`https://www.youtube.com/embed/${id}`,`https://youtube.com/watch?feature=share&v=${id}`,`https://youtu.be/${id}?t=2`,
    `https://m.youtube.com/watch?v=${id}`,`//www.youtube-nocookie.com/embed/${id}`,`https://youtube.com/shorts/${id}`,`youtube.com/live/${id}`,
    `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&amp;mute=1"></iframe>`]) assert.equal(c.youtubeId(value),id,value);
  for(const value of ['https://evil.example/watch?v='+id,'https://notyoutube.com/embed/'+id,'https://youtube.com/@channel','https://youtube.com/embed/invalid'])assert.equal(c.youtubeId(value),'');
});
test('provided trailers skip lookup; anime lookups pass alternate names and source paths and deduplicate',async()=>{
  const c=setup(),pending=deferred(),calls=[];
  c.scraper.trailer=(...a)=>{calls.push(a);return pending.promise;};
  assert.equal(await c.trailerId({info:'#/title/anime/a',trailer:'https://youtu.be/Abc_123-xYz'}),'Abc_123-xYz');assert.equal(calls.length,0);
  const h={info:'#/title/anime/b',title:'Name',alt:'Alternate'},a=c.trailerId(h),b=c.trailerId(h);
  pending.resolve('https://youtube.com/watch?v=Abc_123-xYz');assert.equal(await a,'Abc_123-xYz');await b;
  assert.equal(calls.length,1);assert.deepEqual(calls[0],['Name','Alternate','/anime/b']);
});
test('missing trailers expire and transient errors can be retried',async()=>{
  const c=setup(),h={info:'#/title/anime/a',title:'A'};let calls=0;
  c.scraper.trailer=async()=>++calls===1?'':'https://youtu.be/Abc_123-xYz';
  assert.equal(await c.trailerId(h),'');assert.equal(await c.trailerId(h),'');assert.equal(calls,1);
  c.advance(61000);assert.equal(await c.trailerId(h),'Abc_123-xYz');
  const bad={info:'#/title/anime/error'};c.scraper.trailer=async()=>{throw Error('offline');};await assert.rejects(c.trailerId(bad),/offline/);
  c.scraper.trailer=async()=>'https://youtu.be/Abc_123-xYz';assert.equal(await c.trailerId(bad),'Abc_123-xYz');
});
test('cinema refreshes a cached miss and follows a season to the series trailer',async()=>{
  const c=setup(),calls=[];
  c.edMovieOf=async(slug,force)=>{calls.push([slug,!!force]);return slug==='season/show'?{up:'serie/show'}:{trailer:'<iframe src="https://youtu.be/Abc_123-xYz"></iframe>'};};
  assert.equal(await c.trailerId({info:'#/cinema/season/show'}),'Abc_123-xYz');
  assert.deepEqual(calls,[['season/show',false],['season/show',true],['serie/show',false]]);
});
function carousel() {
  const c=setup(),timeouts=new Map(),intervals=new Map(),events={};let timer=0,root;
  const node=()=>({hidden:true,style:{},innerHTML:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){}});
  const roots=[];
  const view={querySelectorAll:()=>[],set innerHTML(value){if(root)root.isConnected=false;root=node();Object.assign(root,{isConnected:true,info:node(),button:node(),dots:node(),mute:node(),frames:[],frame:{contentWindow:{postMessage(){}}},querySelector:()=>root.button,insertAdjacentHTML(_,html){this.frames.push(html);}});roots.push(root);}};
  Object.assign(c,{view,heroTimer:null,heroMsg:null,heroArt:new Map(),SOUND:['',''],heroState:null,backdropKey:h=>h.info,carouselImage:h=>h.banner||'',resolveBackdrop:async()=>'',pageRefresh:null,esc:String,img:x=>x,t:x=>x,ICON:{},Ratings:{art:async()=>''},
    document:{hidden:false,querySelectorAll:()=>[]},navigator:{},location:{hash:'#/',protocol:'http:',origin:'http://localhost'},matchMedia:()=>({matches:false}),
    addEventListener:(n,f)=>events[n]=f,removeEventListener(){},Image:class{},showTrailer(){},
    setTimeout:(f,ms)=>{const id=++timer;timeouts.set(id,{f,ms});return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:f=>{const id=++timer;intervals.set(id,f);return id;},clearInterval:id=>intervals.delete(id),
    $:sel=>sel==='.hero .tv iframe'?root.frame:sel==='.hero'?root:sel==='.hero .info'?root.info:sel==='.hero-mute'?root.mute:sel==='.dots'?root.dots:null});
  vm.runInContext(source.slice(source.indexOf('function heroPage('),source.indexOf('const animeHero =')),c);
  return {c,roots,timeouts,intervals,get root(){return root;},async start(){const e=[...timeouts].find(([,v])=>v.ms===2500);timeouts.delete(e[0]);e[1].f();await tick();}};
}
test('slow trailer lookup holds its slide and trailers from a replaced carousel cannot attach',async()=>{
  const x=carousel(),pending=deferred();x.c.scraper.trailer=()=>pending.promise;
  const hero=[{title:'A',info:'#/title/anime/a'},{title:'B',info:'#/title/anime/b'}];
  x.c.heroPage(hero,'');const first=x.root;
  await x.start();[...x.intervals.values()][0]();assert.match(first.info.innerHTML,/<h2>A<\/h2>/,'rotation waits for the trailer');
  x.c.heroPage(hero,'');pending.resolve('https://youtu.be/Abc_123-xYz');await tick();
  assert.equal(first.frames.length,0);assert.equal(x.root.frames.length,0);
  await x.start();assert.equal(x.root.frames.length,1);assert.match(x.root.frames[0],/embed\/Abc_123-xYz/);assert.equal(x.root.button.hidden,false);
});
test('late trailer from a previously selected slide cannot cover the current slide',async()=>{
  const x=carousel(),slow=deferred();x.c.scraper.trailer=title=>title==='A'?slow.promise:Promise.resolve('https://youtu.be/Zyx-321_cbA');
  x.c.heroPage([{title:'A',info:'#/title/anime/a'},{title:'B',info:'#/title/anime/b'}],'');await x.start();
  x.root.dots.onclick({target:{dataset:{i:'1'}}});slow.resolve('https://youtu.be/Abc_123-xYz');await tick();assert.equal(x.root.frames.length,0);
  await x.start();assert.match(x.root.frames[0],/embed\/Zyx-321_cbA/);
});

test('late catalogue sources append slides without cycling through new first images or resetting Conan',()=>{
  const x=carousel(),film={title:'Film',info:'#/cinema/film'},conan={title:'Conan',info:'#/title/anime/conan'},manga={title:'Manga',info:'#/manga/series/1'};
  x.c.heroPage([film],'');assert.match(x.root.info.innerHTML,/<h2>Film<\/h2>/);
  x.c.heroPage([manga,film],'');assert.match(x.root.info.innerHTML,/<h2>Film<\/h2>/);
  x.c.heroPage([conan,manga,film],'');assert.match(x.root.info.innerHTML,/<h2>Film<\/h2>/);
  assert.deepEqual(Array.from(x.c.heroState.slides,h=>h.title),['Film','Manga','Conan']);
  x.root.dots.onclick({target:{dataset:{i:'2'}}});assert.match(x.root.info.innerHTML,/<h2>Conan<\/h2>/);
  x.c.heroPage([conan,manga,film],'');assert.match(x.root.info.innerHTML,/<h2>Conan<\/h2>/);
  x.c.location.hash='#/anime';x.c.heroPage([conan],'');assert.equal(x.c.heroState.slides.length,1);
});
function backdrops(art,images) {
  const requests=[];
  const c={URL,img:x=>x,Ratings:{art},Image:class {
    set src(url){requests.push(url);const size=images[url];queueMicrotask(()=>{if(!size)return this.onerror();[this.naturalWidth,this.naturalHeight]=size;this.onload();});}
  }};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('const heroArt ='),source.indexOf('function heroPage('))+'\nthis.resolveBackdrop=resolveBackdrop;this.heroArt=heroArt;',c);
  return {c,requests};
}
test('one wide backdrop is shared across concurrent renders and later source image changes',async()=>{
  const pending=deferred();let calls=0;
  const x=backdrops(()=>{calls++;return pending.promise;},{'still.jpg':[1920,1080],'cover.jpg':[1920,1080]});
  const h={title:'Conan',info:'#/title/anime/conan',banner:'cover.jpg'};
  const a=x.c.resolveBackdrop(h),b=x.c.resolveBackdrop(h);
  assert.equal(x.c.heroArt.size,0,'do not flash a temporary cover');
  pending.resolve('still.jpg');assert.equal(await a,'still.jpg');assert.equal(await b,'still.jpg');assert.equal(calls,1);
  assert.equal(await x.c.resolveBackdrop({...h,banner:'different.jpg'}),'still.jpg');assert.deepEqual(x.requests,['still.jpg']);
});
test('portrait, undersized and broken images leave the backdrop empty; a valid wide source may be used',async()=>{
  const x=backdrops(async()=>'',{'poster.jpg':[600,900],'small.jpg':[600,340],'medium.jpg':[960,540],'banner.jpg':[1280,720]});
  for(const [info,banner] of [['portrait','poster.jpg'],['small','small.jpg'],['medium','medium.jpg'],['broken','missing.jpg']]) {
    assert.equal(await x.c.resolveBackdrop({info,banner}),'');
    assert.equal(await x.c.resolveBackdrop({info,banner:'banner.jpg'}),'','redraw cannot switch an empty result to another image');
  }
  assert.equal(await x.c.resolveBackdrop({info:'wide',banner:'banner.jpg'}),'banner.jpg');
});

test('carousel has an immediate stable cover even when no high-resolution backdrop exists',()=>{
  const x=backdrops(async()=>'',{}),c=x.c;
  vm.runInContext('this.carouselImage=carouselImage;',c);
  const h={info:'#/manga/series/1',banner:'cover.jpg'};
  assert.equal(c.carouselImage(h),'cover.jpg');
  assert.equal(c.carouselImage({...h,banner:'different-cover.jpg'}),'cover.jpg');
});
