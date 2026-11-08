const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(fetch){
 const state={frames:0,removed:0};let port;
 const c={fetch,Response,ReadableStream,DOMException,setTimeout:()=>0,clearTimeout(){},MessageChannel:class{constructor(){this.port1={close(){state.closed=true;}};this.port2={};port=this.port1;}},document:{createElement(){return {setAttribute(){},remove(){state.removed++;},contentWindow:{postMessage(message,target,ports){state.message=message;state.port=ports[0];state.target=target;c.reply?.(port);}}};},body:{append(frame){state.frames++;frame.onload();}}},state};
 vm.createContext(c);vm.runInContext(fs.readFileSync('client-transfer.js','utf8'),c);c.transfer=vm.runInContext('ClientTransfer',c);return c;
}
test('CORS-readable files use direct fetch without creating a transfer frame',async()=>{
 const c=setup(async()=>new Response('file'));const r=await c.transfer.fetch('https://source.test/file',{});assert.equal(await r.text(),'file');assert.equal(c.state.frames,0);
});
test('isolated browser transfer streams bytes to its parent and removes the frame',async()=>{
 const c=setup(async()=>{throw new TypeError('CORS');});
 c.reply=port=>{port.onmessage({data:{type:'headers',status:200,headers:{'content-type':'image/png'}}});port.onmessage({data:{type:'chunk',bytes:new Uint8Array([1,2,3]).buffer}});port.onmessage({data:{type:'end'}});};
 const r=await c.transfer.fetch('https://source.test/image',{});assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([1,2,3]));assert.equal(c.state.message.url,'https://source.test/image');assert.equal(c.state.frames,1);assert.equal(c.state.removed,1);
});
test('aborting an isolated transfer removes the frame and rejects without any relay request',async()=>{
 const urls=[],c=setup(async url=>{urls.push(url);throw new TypeError('CORS');}),ac=new AbortController();
 const pending=c.transfer.fetch('https://source.test/file',{signal:ac.signal});await new Promise(r=>setImmediate(r));ac.abort();await assert.rejects(pending,/cancelled/);assert.deepEqual(urls,['https://source.test/file']);assert.equal(c.state.removed,1);
});
test('transfer frame refuses messages from another parent origin',async()=>{
 let callback,calls=0;const parent={};const c={parent,location:{href:'https://med-flix-ten.vercel.app/download-frame.html'},URL,fetch:async()=>{calls++;},addEventListener:(name,fn)=>callback=fn};vm.createContext(c);vm.runInContext(fs.readFileSync('download-frame.js','utf8'),c);
 await callback({source:parent,origin:'https://unrelated.test',data:{type:'download',url:'https://source.test/file'},ports:[{}]});assert.equal(calls,0);
});
