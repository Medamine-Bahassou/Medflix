const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const zip=require('../zip');
test('ZIPs round trip UTF-8 filenames, binary bytes and CRCs through Python zipfile',async()=>{
 const blob=await zip.create([{name:'رواية/chapter 1.txt',blob:new Blob(['نص الفصل'])},{name:'Manga/0001.png',blob:new Blob([new Uint8Array([0,1,2,255])])}]);
 const result=spawnSync('python3',['-c',`import sys,io,zipfile,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
assert z.read('رواية/chapter 1.txt').decode() == 'نص الفصل'
assert z.read('Manga/0001.png') == bytes([0,1,2,255])
print(len(z.namelist()))`],{input:Buffer.from(await blob.arrayBuffer())});
 assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.toString().trim(),'2');
});
test('ZIP names cannot traverse folders and collisions after sanitizing are rejected',async()=>{
 assert.equal(zip.safeName('../a\\b'),'__a_b');
 await assert.rejects(zip.create([{name:'a?.txt',blob:new Blob(['1'])},{name:'a_.txt',blob:new Blob(['2'])}]),/Duplicate/);
});
