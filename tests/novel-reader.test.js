const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const writes=[],c={store:{novelMarks:{}},persist:k=>writes.push(k),esc:s=>String(s).replaceAll('<','&lt;')};vm.createContext(c);vm.runInContext(fs.readFileSync('novel-reader.js','utf8'),c);return {c,reader:vm.runInContext('NovelReader',c),writes};}
test('Arabic search ignores diacritics and preserves the original matched character offsets',()=>{
 const {reader}=setup(),text='قال: الْكِتَاب جميل';const hits=reader.ranges(text,'الكتاب');assert.equal(hits.length,1);assert.equal(text.slice(...hits[0]),'الْكِتَاب');
 assert.equal(reader.ranges('إلى الكتاب الآخر','الى').length,1);assert.equal(reader.ranges('<script>','[').length,0);assert.equal(reader.ranges('Book book','BOOK').length,2);assert.equal(reader.ranges('Text',' ').length,0);
});
test('display settings preserve valid zero values and clamp malformed preferences',()=>{
 const {reader}=setup();const l=reader.look({nvSize:30,nvLook:{size:100,line:-2,gap:0,margin:1000,bright:0,font:'url(evil)'}});
 assert.equal(l.size,40);assert.equal(l.line,1.2);assert.equal(l.gap,0);assert.equal(l.margin,64);assert.equal(l.bright,.25);assert.equal(l.font,'');assert.equal(reader.look({nvSize:28}).size,28);
});
test('bookmarks and highlights are independent and persist without modifying read progress',()=>{
 const {c,reader,writes}=setup(),chapter={slug:'one',order:1};
 assert.equal(reader.toggleMark('book',chapter,2,'mark','Paragraph'),true);assert.equal(reader.toggleMark('book',chapter,2,'hl','Paragraph'),true);
 assert.equal(reader.toggleMark('book',chapter,2,'mark','Paragraph'),false);assert.equal(c.store.novelMarks.book.length,1);assert.equal(c.store.novelMarks.book[0].kind,'hl');
 assert.equal(reader.toggleMark('other',chapter,2,'mark','Other'),true);assert.equal(c.store.novelMarks.book[0].text,'Paragraph');assert.ok(writes.every(k=>k==='novelMarks'));assert.equal(c.store.novels,undefined);
});
