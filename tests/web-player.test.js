const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup() {
  const f={style:{},dataset:{},attrs:{},removeAttribute(k){delete this.attrs[k];delete this[k];},set sandbox(v){this.attrs.sandbox=v;}};
  const host={append(){host.frame=f;}};
  const ctx={window:{},URL,URLSearchParams,AnimeWitcher:{create:()=>({})},MediaHosts:{videoHtml:()=>''},indexedDB:{open:()=>({})},
    document:{querySelector:s=>s==='.player'?host:host.frame||null,createElement:()=>f}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('web.js','utf8'),ctx);
  return {api:ctx.window.api,f};
}
test('only hosts that play on in a sandbox get one, and it goes before the next load',()=>{
  const {api,f}=setup(),b={x:0,y:0,width:1,height:1};
  api.player('https://videa.hu/player?v=1',b);assert.match(f.attrs.sandbox,/allow-scripts/);assert.doesNotMatch(f.attrs.sandbox,/allow-popups/);
  api.player('https://www.mp4upload.com/embed-1.html',b);assert.ok(f.attrs.sandbox);
  api.player('https://share4max.com/iframe/abc',b);assert.equal(f.attrs.sandbox,undefined);
  api.player('https://dood.to/e/abc',b);assert.equal(f.attrs.sandbox,undefined);
});
test('hosts without popups come first, hosts whose popups cannot be stopped last',()=>{
  const {api}=setup(),rank=api.serverRank;
  assert.ok(rank('videa FHD')<rank('ok')&&rank('ok')<rank('uqload')&&rank('uqload')<rank('share4max'));
  assert.equal(rank('Dood'),3);
});
