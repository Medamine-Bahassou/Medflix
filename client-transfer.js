// Public hosts sometimes permit Origin:null (embedded/local readers), rather than the website's origin.
// Both paths fetch on the user's device. No media bytes are relayed by a server.
const ClientTransfer=(()=>{
  const framed=new Set(); // hosts only the frame can read: no doomed request (and console error) for every page of a chapter
  async function request(url,options){
    const host=new URL(url).host;
    if(!framed.has(host))try{return await fetch(url,options);}catch(e){if(options.signal?.aborted)throw e;framed.add(host);}
    return isolated(url,options.signal).catch(e=>{framed.delete(host);throw e;}); // it was the network, maybe: ask directly again next time
  }
  function isolated(url,signal){return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new DOMException('Cancelled','AbortError'));
    const frame=document.createElement('iframe'),channel=new MessageChannel();let stream,settled=false,timer;
    frame.hidden=true;frame.setAttribute('sandbox','allow-scripts');frame.src='download-frame.html';
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);channel.port1.close();frame.remove();};
    const fail=message=>{const e=new Error(message);if(settled)stream?.error(e);else reject(e);cleanup();};
    const abort=()=>fail('cancelled');
    signal?.addEventListener('abort',abort,{once:true});
    channel.port1.onmessage=({data})=>{
      if(data.type==='headers'){
        clearTimeout(timer);settled=true;
        const body=new ReadableStream({start(c){stream=c;},cancel(){cleanup();}});
        resolve(new Response(body,{status:data.status,headers:data.headers}));
      }else if(data.type==='chunk')stream?.enqueue(new Uint8Array(data.bytes));
      else if(data.type==='end'){stream?.close();cleanup();}
      else if(data.type==='error')fail('Browser transfer blocked');
    };
    frame.onload=()=>frame.contentWindow.postMessage({type:'download',url},'*',[channel.port2]);
    frame.onerror=()=>fail('Browser transfer blocked');
    timer=setTimeout(()=>fail('Browser transfer blocked'),20000);document.body.append(frame);
  });}
  return {fetch:request};
})();
