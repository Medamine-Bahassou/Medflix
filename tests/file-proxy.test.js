const {test}=require('node:test');
const assert=require('node:assert/strict');
const file=require('../api/file');
async function run(url,start){const out={headers:{}};await file({method:'GET',query:{url,start}},{setHeader(k,v){out.headers[k]=v;},status(s){out.status=s;return this;},json(j){out.json=j;},send(b){out.body=b;},end(){}});return out;}
test('binary proxy blocks private, credentialed and unrelated URLs before fetching',async()=>{
 for(const url of ['https://127.0.0.1/x','http://pixeldrain.com/api/file/test','https://appswat.com/not-media','https://user:pass@pixeldrain.com/api/file/test','https://download1.mediafire.com:9000/x'])assert.equal((await run(url)).status,403);
});
test('redirect destinations are revalidated and range chunks retain their total size',async()=>{
 const old=global.fetch;
 try{
  let calls=0;global.fetch=async()=>{calls++;return new Response('',{status:302,headers:{location:'https://127.0.0.1/file'}});};
  assert.equal((await run('https://pixeldrain.com/api/file/test')).status,403);assert.equal(calls,1);
  global.fetch=async(u,opt)=>{assert.equal(opt.headers.Range,'bytes=3-2097154');return new Response(new Uint8Array([4,5,6]),{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 3-5/6'}});};
  const out=await run('https://pixeldrain.com/api/file/test','3');assert.equal(out.status,200);assert.equal(out.headers['X-File-Total'],'6');assert.equal(out.body.length,3);
 }finally{global.fetch=old;}
});
test('HTML and ignored or incomplete ranges are reported as errors, never downloaded files',async()=>{
 const old=global.fetch;
 try{
  global.fetch=async()=>new Response('<html>',{headers:{'content-type':'text/html','content-length':'6'}});assert.equal((await run('https://pixeldrain.com/api/file/test')).status,415);
  global.fetch=async()=>new Response('abc',{headers:{'content-type':'application/octet-stream','content-length':'3'}});assert.equal((await run('https://pixeldrain.com/api/file/test','3')).status,502);
  global.fetch=async()=>new Response('abc',{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-5/6'}});assert.equal((await run('https://pixeldrain.com/api/file/test')).status,502);
 }finally{global.fetch=old;}
});
