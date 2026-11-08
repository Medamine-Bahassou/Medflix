// Sandboxed to an opaque origin. Only our own parent can start a transfer or receive its bytes.
addEventListener('message',async event=>{
  if(event.source!==parent || event.origin!==new URL(location.href).origin || event.data?.type!=='download' || !event.ports[0])return;
  const port=event.ports[0],url=event.data.url;
  try{
    if(typeof url!=='string'||!url.startsWith('https://'))throw Error('bad URL');
    const r=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!r.ok||r.type==='opaque'||r.status===206||!r.body){await r.body?.cancel();throw Error('unavailable');}
    port.postMessage({type:'headers',status:r.status,headers:Object.fromEntries(['content-type','content-length','content-encoding'].map(k=>[k,r.headers.get(k)]).filter(([,v])=>v!=null))});
    const reader=r.body.getReader();
    for(;;){const {done,value}=await reader.read();if(done)break;const bytes=value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);port.postMessage({type:'chunk',bytes},[bytes]);}
    port.postMessage({type:'end'});
  }catch{port.postMessage({type:'error'});}finally{port.close();}
},{once:true});
