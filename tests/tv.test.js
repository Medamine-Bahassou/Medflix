const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pick}=require('../tv');
const box=(left,top,width=100,height=150,name)=>({name:name||`${left},${top}`,rect:{left,top,width,height,right:left+width,bottom:top+height}});
// two rows of three cards, a link above the second, and a hero button over them
const hero=box(0,0,120,40,'hero'),a=box(0,100),b=box(110,100),c=box(220,100),link=box(0,260,60,20,'link'),d=box(0,300),e=box(110,300),f=box(220,300);
const all=[hero,a,b,c,link,d,e,f],go=(from,key,list=all)=>pick(from.rect,list.filter(x=>x!==from),key)?.name;
test('left and right stay on the row, and its end does not wrap into the next',()=>{
 assert.equal(go(a,'ArrowRight'),b.name);assert.equal(go(b,'ArrowLeft'),a.name);assert.equal(go(c,'ArrowRight'),undefined);assert.equal(go(d,'ArrowLeft'),undefined);
});
test('down goes to the one most in line, not just the nearest edge',()=>{
 assert.equal(go(b,'ArrowDown'),e.name);assert.equal(go(c,'ArrowDown'),f.name);assert.equal(go(e,'ArrowUp'),b.name);
});
test('a link straight below is reached, one off to the side is passed over',()=>{
 assert.equal(go(a,'ArrowDown'),link.name);assert.equal(go(link,'ArrowDown'),d.name);assert.equal(go(b,'ArrowDown'),e.name);
});
test('from a row to what is above it, and nothing past the top',()=>{
 assert.equal(go(a,'ArrowUp'),hero.name);assert.equal(go(hero,'ArrowUp'),undefined);
});
test('a focused card grown over its neighbours still finds them',()=>{
 const grown={left:-4,right:104,top:88,bottom:244,width:108,height:156};assert.equal(pick(grown,[b,c],'ArrowRight').name,b.name);
});
test('right to left is the same geometry: left is always on the left',()=>{
 const rtl=[box(220,0,100,150,'first'),box(110,0,100,150,'second')];assert.equal(pick(rtl[0].rect,[rtl[1]],'ArrowLeft').name,'second');assert.equal(pick(rtl[0].rect,[rtl[1]],'ArrowRight'),null);
});
