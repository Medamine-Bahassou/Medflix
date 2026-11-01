const {test} = require('node:test');
const assert = require('node:assert/strict');
const AW = require('../animewitcher');
const hits = [
 {name:'Black Clover',path:'anime_list/Black Clover'},
 {name:'Black Clover 2nd Season',path:'anime_list/Black Clover 2nd Season'},
 {name:'Black Clover 2nd Season',dubbed:true,path:'anime_list/dub'}
];
test('season-specific matching excludes dubbed editions and ambiguous titles',()=>{
 assert.equal(AW.match(hits,'Black Clover 2nd Season','').path,'anime_list/Black Clover 2nd Season');
 assert.equal(AW.match(hits,'Black Clover 3rd Season',''),null);
 assert.equal(AW.match([...hits,{...hits[1]}],'Black Clover 2nd Season',''),null);
});
const value = v => typeof v === 'string' ? {stringValue:v} : typeof v === 'boolean' ? {booleanValue:v} : Array.isArray(v) ? {arrayValue:{values:v.map(value)}} : {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,value(x)]))}};
test('episode summary supplies the real ID; qualities and AW provenance survive',async()=>{
 const calls=[];
 const aw=AW.create(async(url)=>{
  calls.push(url);
  if(url.includes('algolia.net')) return JSON.stringify({hits});
  const data=url.endsWith('Settings/constants') ? {search_settings:{app_id:'example',api_key:'test'}}
   : url.includes('episodes_summery') ? {episodes:[{name:'الحلقة 4',doc_id:'004'},{name:'الحلقة 5',doc_id:'005'}]}
   : {servers:[{name:'PD',quality:'1080p',link:'https://pixeldrain.com/u/a',visible:true},{name:'ST',quality:'720p',link:'https://streamtape.com/v/b',visible:false}]};
  return JSON.stringify({fields:value(data).mapValue.fields});
 });
 const result=await aw.sources('Black Clover 2nd Season','',4);
 assert.equal(result.length,1);
 assert.equal(result[0].label,'pixeldrain · AW');
 assert.equal(result[0].quality,'FHD');
 assert.equal(result[0].token,'aw:https://pixeldrain.com/u/a');
 assert.ok(calls.some(u=>u.endsWith('/episodes/004/servers2/all_servers')));
 const count=calls.length;
 await aw.sources('Black Clover 2nd Season','',4);
 assert.equal(calls.length,count);
 assert.deepEqual(await aw.sources('Black Clover 2nd Season','','Special'),[]);
});
