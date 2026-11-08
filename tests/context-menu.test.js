const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 let menu=null;
 const events={};
 const document={activeElement:null,addEventListener:(name,fn)=>events[name]=fn,body:{append(el){menu=el;}},createElement(){const el={style:{},classList:{add(){}},setAttribute(){},getBoundingClientRect:()=>({width:280,height:140}),remove(){menu=null;},querySelectorAll(){return this.buttons;},contains:target=>target===el};
 Object.defineProperty(el,'innerHTML',{set(html){this.html=html;this.buttons=[...html.matchAll(/data-v="([^"]*)"/g)].map(m=>({dataset:{v:m[1]},focus(){document.activeElement=this;}}));}});return el;}};
 const source={isConnected:true,matches:()=>true,focus(){document.activeElement=this;}};
 document.activeElement=source;
 const c={document,innerWidth:320,innerHeight:240,esc:String,view:{append:el=>{menu=el;}},requestAnimationFrame:f=>f(),ICON:{x:''},CHECK:'',t:k=>k,$:()=>menu,addEventListener:(name,fn)=>events[name]=fn,source,events,getMenu:()=>menu};
 vm.createContext(c);const app=fs.readFileSync('app.js','utf8');vm.runInContext(app.slice(app.indexOf('// right-click actions use'),app.indexOf('// Long-press (or right-click) menus:')),c);
 const filter=fs.readFileSync('filter.js','utf8');vm.runInContext(filter.slice(filter.indexOf('function pickSheet('),filter.indexOf('async function filterView(')),c);
 return c;
}
test('right-click picker uses a cursor menu clamped inside the viewport and preserves the selected action',()=>{
 const c=setup();let selected;c.onPick=v=>selected=v;
 vm.runInContext('contextPoint={x:310,y:230,target:source};pickSheet("Chapter 225",[["read","Mark as read"],["prev","Mark earlier as read"]],"",onPick);contextPoint=null;',c);
 const menu=c.getMenu();assert.equal(menu.className,'context-menu');assert.equal(menu.style.left,'32px');assert.equal(menu.style.top,'92px');
 menu.onclick({target:{closest:()=>menu.buttons[1]}});assert.equal(selected,'prev');assert.equal(c.getMenu(),null);assert.equal(c.document.activeElement,c.source);
});
test('menu supports keyboard navigation and outside pointer dismissal',()=>{
 const c=setup();c.contextMenu('Actions',[['read','Read'],['select','Select']],'',()=>{},{x:10,y:10,target:c.source});
 const menu=c.getMenu();assert.equal(c.document.activeElement,menu.buttons[0]);
 menu.onkeydown({key:'ArrowDown',preventDefault(){}});assert.equal(c.document.activeElement,menu.buttons[1]);
 c.events.pointerdown({target:{}});assert.equal(c.getMenu(),null);
});
test('normal and touch pickers retain their existing sheet behavior',()=>{
 const c=setup();c.pickSheet('Actions',[['read','Read']],'',()=>{});assert.equal(c.getMenu().className,'sheet-wrap');
});
