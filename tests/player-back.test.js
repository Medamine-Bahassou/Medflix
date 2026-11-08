const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// a page's history as the browser keeps it: an embedded host's own navigations add entries with the same address
function setup(entries=['#/title/show','#/play/show/1'],length=entries.length) {
  const timers=[],c={timers,setTimeout:f=>timers.push(f),moved:[],steps:[]};
  c.location={hash:entries.at(-1),replace(h){c.moved.push(h);c.location.hash=h;}};
  c.history={length,go(n){c.steps.push(n);const at=entries.length-1+n;if(at>=0&&entries[at]!==undefined&&length<50)c.location.hash=entries[at];}};
  const app=fs.readFileSync('app.js','utf8'),start=app.indexOf('let playerFrom ='),end=app.indexOf('\n}',app.indexOf('function leavePlayer'))+2;
  vm.createContext(c);vm.runInContext(app.slice(start,end).replaceAll('let ','var '),c);
  c.playerFrom='#/title/show';c.playerAt=2;
  return c;
}
test('back leaves at once when the player added nothing',()=>{
  const c=setup();c.leavePlayer('#/title/show');
  assert.equal(c.steps[0],-1);assert.equal(c.location.hash,'#/title/show');
});
test('back steps over the entries the embedded host added',()=>{
  const c=setup(['#/title/show','#/play/show/1','#/play/show/1','#/play/show/1']);c.leavePlayer('#/title/show');
  assert.equal(c.steps[0],-3);assert.equal(c.location.hash,'#/title/show');
  c.timers[0]();assert.deepEqual(Array.from(c.moved),[]); // the safety net has nothing to do
});
test('a step that did not leave goes to the page by its address (history.length stops at 50)',()=>{
  const c=setup(['#/title/show','#/play/show/1'],50);c.playerAt=50;c.leavePlayer('#/title/show');
  assert.equal(c.location.hash,'#/play/show/1');c.timers[0]();
  assert.deepEqual(Array.from(c.moved),['#/title/show']);
});
test('opened directly or reloaded: goes to the show, not off the site',()=>{
  const c=setup(['about:blank','#/play/show/1']);c.playerFrom='';c.leavePlayer('#/title/show');
  assert.deepEqual(Array.from(c.steps),[]);assert.deepEqual(Array.from(c.moved),['#/title/show']);
});
