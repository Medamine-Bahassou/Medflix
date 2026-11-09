const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// the merging only: page parsing is checked live, the sites' markup changes
function setup({main,more}) {
  const ep=(title,n,path)=>({title,ep:String(n),type:'episode',path:path+'/'+n,showPath:path});
  const scraper={newEpisodes:async p=>({items:(more[p]||[]).map(x=>ep(...x)),pages:2})};
  const ctx={window:{api:{web:true}},scraper,parsers:{},AR_NTH:['الاول','الثاني','الثالث','الرابع'],Risto:{},URL,URLSearchParams,location:{hash:''},console,
    load:async(_,url)=>({items:(main[/page\/2/.test(url)?2:1]||[]).map(x=>ep(...x)),pages:2})};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('shahiid.js','utf8'),ctx);
  scraper.ctx=ctx;
  return scraper;
}
const titles=d=>Array.from(d.items,c=>`${c.title} ${c.ep}`); // an outer array: deepEqual refuses the vm's own
test('a show on both sites is one card, however each names it',async()=>{
  const s=setup({main:{1:[['Tokyo Revengers: Santen Sensou-hen',6,'/anime/s:~a'],['Black Clover 2nd Season',6,'/anime/s:~b'],['Tensei shita Daiseijo wa, Seijo de Aru Koto wo Hitakakusu',7,'/anime/s:~c']]},
    more:{1:[['Tokyo Revengers: Santen Sensou-hen الموسم 4',6,'/anime/~a'],['Black Clover الموسم 2',6,'/anime/~b'],['Tensei shita Daiseijo wa',7,'/anime/~c'],['Only On Risto',3,'/anime/~d']]}});
  assert.deepEqual(titles(await s.newEpisodes(1)),['Tokyo Revengers: Santen Sensou-hen 6','Black Clover 2nd Season 6','Tensei shita Daiseijo wa, Seijo de Aru Koto wo Hitakakusu 7','Only On Risto 3']);
});
test('the card with the newer episode stays, in the main list\'s place',async()=>{
  const s=setup({main:{1:[['Show A',5,'/anime/s:~a'],['Show B',2,'/anime/s:~b']]},more:{1:[['Show A',6,'/anime/~a']]}});
  const d=await s.newEpisodes(1);
  assert.deepEqual(titles(d),['Show A 6','Show B 2']);assert.equal(d.items[0].path,'/anime/~a/6');
});
test('other seasons and a shorter name at another episode stay apart',async()=>{
  const s=setup({main:{1:[['Black Clover 2nd Season',6,'/anime/s:~a'],['Naruto Shippuden',9,'/anime/s:~b']]},more:{1:[['Black Clover الموسم 3',6,'/anime/~a'],['Naruto',4,'/anime/~b']]}});
  assert.equal((await s.newEpisodes(1)).items.length,4);
});
test('a show\'s specials are not the show',async()=>{
  const s=setup({main:{1:[['One Piece',1180,'/anime/s:~a'],['One Piece +',3,'/anime/s:~b']]},more:{}});
  assert.equal((await s.newEpisodes(1)).items.length,2);
});
test('a lost poster only takes a cover under the show\'s own name',async()=>{
  const media=(romaji,extraLarge)=>({title:{romaji},synonyms:[],bannerImage:null,coverImage:{extraLarge}});
  const s=setup({main:{},more:{}}),c=s.ctx;c.remember=(_,f)=>f();
  c.api={fetch:async(_,form)=>JSON.stringify({data:{Page:{media:/Wandance/.test(form.query)?[media('Wandance','cover.jpg')]:[media('Another Show','wrong.jpg')]}}})};
  assert.equal(await s.cover('Wandance'),'cover.jpg');
  assert.equal(await s.cover('Unknown Show'),undefined);
});
test('a show on page 1 is not repeated on page 2',async()=>{
  const s=setup({main:{1:[['Show A',6,'/anime/s:~a']],2:[['Show A',5,'/anime/s:~a'],['Show B',1,'/anime/s:~b']]},more:{}});
  await s.newEpisodes(1);
  assert.deepEqual(titles(await s.newEpisodes(2)),['Show B 1']);
});
test('latest list still shows when the main site is down',async()=>{
  const s=setup({main:{},more:{1:[['Show A',6,'/anime/~a']]}});
  assert.deepEqual(titles(await s.newEpisodes(1)),['Show A 6']);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function detailSetup() {
  const s=setup({main:{},more:{}}), c=s.ctx;
  const first={title:'One Piece',alt:'One Piece',poster:'poster.jpg',desc:'Story',genres:[],info:[],episodes:[{n:'3',url:'https://shahiid-anime.net/episodes/three/'}],more:true,seriesUrl:''};
  const older=deferred();let changes=0,fetches=0;
  Object.assign(c,{setTimeout,parse:x=>x,splitSeason:()=>null,api:{fetch:async url=>{
    if(url.includes('graphql'))return JSON.stringify({data:{Page:{media:[]}}});
    fetches++;return older.promise;
  }},remember:(_,f)=>f()});
  c.parsers.shPage=x=>x;
  c.load=async(_,url)=>url.includes('?epp=')?older.promise:first;
  s.changed=()=>changes++;
  c.location.hash='#/title/anime/s:one-piece';
  return {s,c,first,older,get changes(){return changes;},get fetches(){return fetches;}};
}
test('anime details render before older episode pages and refresh once the full list arrives',async()=>{
  const x=detailSetup();
  const initial=await x.s.details('/anime/s:one-piece');
  assert.equal(initial.title,'One Piece');assert.equal(initial.episodes.length,1);assert.equal(initial.episodesPending,true);
  await tick();assert.equal(x.changes,0);assert.ok(x.fetches>0);
  x.older.resolve({episodes:[{n:'1',url:'https://shahiid-anime.net/episodes/one/'}],more:false});await tick();
  assert.equal(x.changes,1);
  const full=await x.s.details('/anime/s:one-piece');
  assert.equal(full.episodesPending,false);assert.deepEqual(Array.from(full.episodes,e=>e.ep),['1','3']);await tick();assert.equal(x.changes,1,'cached enrichment must not loop redraws');
});
test('a late episode list does not redraw a different page',async()=>{
  const x=detailSetup();await x.s.details('/anime/s:one-piece');
  x.c.location.hash='#/manga';x.older.resolve({episodes:[],more:false});await tick();
  assert.equal(x.changes,0);
});
test('failed episode pagination leaves the title usable',async()=>{
  const x=detailSetup();await x.s.details('/anime/s:one-piece');
  x.older.reject(Error('site down'));await tick();
  const d=await x.s.details('/anime/s:one-piece');assert.equal(d.title,'One Piece');assert.equal(d.episodes.length,1);assert.equal(d.episodesPending,false);assert.equal(x.changes,1);
});
test('secondary-source title is returned while cross-source matching is stalled',async()=>{
  const x=detailSetup(),search=deferred();
  // the wrapper captures the original detail reader when it is installed.
  const base={title:'One Piece',episodes:[{ep:'1112'}],path:'/anime/~one-piece-1112'};
  x.c.scraper={details:async()=>base,changed:()=>{}};x.c.Risto={};
  x.c.load=()=>search.promise;
  vm.runInContext(fs.readFileSync('shahiid.js','utf8'),x.c);
  const d=await x.c.scraper.details(base.path);
  assert.equal(d,base);
  search.resolve({items:[]});await tick();
});
test('playback still resolves older episodes from the complete list',async()=>{
  const x=detailSetup(),urls=[];
  const fetch=x.c.api.fetch;
  x.c.api.fetch=async url=>{urls.push(url);return url.includes('/episodes/one/')?'':fetch(url);};
  x.c.parse=value=>typeof value==='string'?{querySelectorAll:()=>[]}:value;
  const sources=x.c.Risto.sources('/watch/s:one-piece/1');
  await tick();assert.ok(!urls.some(u=>u.includes('/episodes/one/')),'wait for the requested episode to be found');
  x.older.resolve({episodes:[{n:'1',url:'https://shahiid-anime.net/episodes/one/'}],more:false});
  await sources;assert.ok(urls.some(u=>u.includes('/episodes/one/')));
});

test('trailer lookup uses native names and normalized accents without accepting unrelated shows',async()=>{
  const s=setup({main:{},more:{}}),c=s.ctx;c.remember=(_,f)=>f();
  c.api={fetch:async()=>JSON.stringify({data:{Page:{media:[{title:{romaji:'Shingeki no Kyōjin',native:'進撃の巨人'},synonyms:[],trailer:{site:'youtube',id:'Abc_123-xYz'}}]}}})};
  assert.match(await s.trailer('Shingeki no Kyojin'),/Abc_123-xYz/);
  assert.match(await s.trailer('進撃の巨人'),/Abc_123-xYz/);
  assert.equal(await s.trailer('Unknown Show'),'');
});
test('a match without a trailer does not hide the alternate name trailer',async()=>{
  const s=setup({main:{},more:{}}),c=s.ctx;c.remember=(_,f)=>f();
  c.api={fetch:async(_,form)=>{const title=form.query.includes('Alias')?'Alias':'Actual';return JSON.stringify({data:{Page:{media:[{title:{romaji:title},synonyms:[],trailer:title==='Alias'?null:{site:'youtube',id:'Abc_123-xYz'}}]}}});}};
  assert.match(await s.trailer('Actual','Alias'),/Abc_123-xYz/);
});
test('a shortened carousel name falls back to page metadata without loading episode pagination',async()=>{
  const s=setup({main:{},more:{}}),c=s.ctx,calls=[];c.remember=(_,f)=>f();
  c.load=async(kind,url)=>{calls.push(url);return {title:'Actual',alt:'Alternate',trailer:''};};
  c.api={fetch:async(_,form)=>JSON.stringify({data:{Page:{media:form.query.includes('Alternate')?[{title:{english:'Alternate'},synonyms:[],trailer:{site:'youtube',id:'Abc_123-xYz'}}]:[]}}})};
  assert.match(await s.trailer('Short',undefined,'/anime/s:actual'),/Abc_123-xYz/);
  assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/seasons/actual/'));
});
