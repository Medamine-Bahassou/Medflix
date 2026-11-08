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
test('a show on page 1 is not repeated on page 2',async()=>{
  const s=setup({main:{1:[['Show A',6,'/anime/s:~a']],2:[['Show A',5,'/anime/s:~a'],['Show B',1,'/anime/s:~b']]},more:{}});
  await s.newEpisodes(1);
  assert.deepEqual(titles(await s.newEpisodes(2)),['Show B 1']);
});
test('latest list still shows when the main site is down',async()=>{
  const s=setup({main:{},more:{1:[['Show A',6,'/anime/~a']]}});
  assert.deepEqual(titles(await s.newEpisodes(1)),['Show A 6']);
});
