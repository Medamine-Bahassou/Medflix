// Website download queue. Payloads live under separate IndexedDB keys; the index stays small.
const WebDownloads=(()=>{
  const controllers=new Map(),waiters=new Map(),urls=new Set();let exporting=false;
  const strings={
    en:{wbZip:'Download ZIP',wbZipLimit:'This selection exceeds ZIP limits. Export smaller groups.',wbSave:'Save to device',wbHost:'Open provider',wbHostOnly:'This host did not provide a downloadable file. Open its page to download.',wbHint:'Keep this tab open while downloading. Saved files stay in this browser; select them to export one ZIP.',wbCancelAll:'Cancel pending',wbZipBusy:'Creating ZIP…',wbStorageFull:'Browser storage is full. Save or delete existing downloads, then retry.',wbFileMissing:'Saved file is missing. Download it again.',wbCors:'This host blocks browser downloads. Use Open provider to download directly.',wbUnsupported:'This file host cannot be downloaded here.',wbNoSaved:'Select completed downloads first.'},
    ar:{wbZip:'تحميل ZIP',wbZipLimit:'يتجاوز التحديد حدود ملف ZIP. صدّر مجموعات أصغر.',wbSave:'حفظ على الجهاز',wbHost:'فتح صفحة التحميل',wbHostOnly:'لم يوفر هذا المصدر ملفًا قابلًا للتحميل. افتح صفحته للتحميل.',wbHint:'أبقِ هذا التبويب مفتوحًا أثناء التحميل. تبقى الملفات في هذا المتصفح؛ حددها لتصدير ملف ZIP واحد.',wbCancelAll:'إلغاء التحميلات المعلقة',wbZipBusy:'جارٍ إنشاء ZIP…',wbStorageFull:'مساحة المتصفح ممتلئة. احفظ أو احذف تنزيلات سابقة ثم أعد المحاولة.',wbFileMissing:'الملف المحفوظ غير موجود. أعد تحميله.',wbCors:'يمنع هذا المصدر التحميل داخل المتصفح. افتح صفحة التحميل لحفظ الملف مباشرة.',wbUnsupported:'لا يمكن تحميل هذا الملف من مصدره هنا.',wbNoSaved:'حدد تنزيلات مكتملة أولًا.'}
  };
  const jobs=()=>store.webDownloads;
  const records=()=>[...Object.values(jobs()),...Object.values(store.novelDownloads||{}).map(n=>({...n,id:nvKey(n.id,n.slug),novelId:n.id,kind:'novel',ep:n.n,state:'done'}))].sort((a,b)=>b.at-a.at);
  const key=(id,i)=>'web-file:'+id+':'+i;
  const saveIndex=async()=>{await persist('webDownloads');};
  const check=signal=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
  const extension=type=>/png/.test(type)?'png':/webp/.test(type)?'webp':/gif/.test(type)?'gif':/image/.test(type)?'jpg':/zip/.test(type)?'zip':/matroska/.test(type)?'mkv':'mp4';
  async function binary(url,signal,progress){
    check(signal);if(!/^https:\/\//.test(url))throw Error('wbUnsupported');
    let response;
    try { response=await ClientTransfer.fetch(url,{signal,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'}); }
    catch(e){check(signal);throw Error('wbCors');}
    if(!response.ok || response.type==='opaque' || response.status===206){await response.body?.cancel();throw Error('wbUnsupported');}
    const type=response.headers.get('Content-Type')||'application/octet-stream';
    if(/text\/|json|javascript|xml/i.test(type)){await response.body?.cancel();throw Error('wbUnsupported');}
    // browsers decompress encoded responses: their Content-Length is not the number of bytes we receive.
    const encoding=response.headers.get('Content-Encoding');
    const length=encoding && encoding!=='identity'?0:Number(response.headers.get('Content-Length'));
    const total=Number.isSafeInteger(length)&&length>0?length:0,parts=[];let received=0;
    if(!response.body)throw Error('wbUnsupported');
    const reader=response.body.getReader();
    for(;;){const {done,value}=await reader.read();check(signal);if(done)break;parts.push(value);received+=value.length;progress?.(received,total);}
    if(!received || (total && received!==total))throw Error('wbUnsupported');
    let result=new Blob(parts,{type});
    const head=await result.slice(0,64).text();if(/^[\s]*[<{[]/.test(head))throw Error('wbUnsupported');
    const magic=new Uint8Array(await result.slice(0,4).arrayBuffer());if(magic[0]===0x50&&magic[1]===0x4b)result=new Blob(parts,{type:'application/zip'});
    return result;
  }
  async function put(job,blob,name,signal){check(signal);const i=job.files.length;await api.set(key(job.id,i),blob);job.files.push({name,key:key(job.id,i),size:blob.size,type:blob.type});check(signal);await saveIndex();}
  async function perform(job,signal){
    if(job.kind==='manga'){
      const chapter=await mChapter(job.chapterId,true);check(signal);job.chapter={...chapter,images:[]};
      if(!chapter.images.length)throw Error('noImages');job.total=chapter.images.length;
      for(let i=0;i<chapter.images.length;i++){
        job.provider=chapter.images[i];
        const blob=await binary(chapter.images[i],signal);if(!blob.type.startsWith('image/'))throw Error('noImages');
        await put(job,blob,String(i+1).padStart(4,'0')+'.'+extension(blob.type),signal);job.received=i+1;
      }
      return;
    }
    const links=job.token?[{token:job.token,label:job.host||''}]:job.kind==='cinema'?await edDownloads(job.slug):await animeDownloadLinks(job.epPath,job.title,job.alt,job.ep);
    check(signal);
    const ranked=[...links].sort((a,b)=>Number(b.quality===job.quality)-Number(a.quality===job.quality));
    job.provider=ranked[0]?.token?.replace(/^(?:stream:)?(?:aw:|ra:)?/,'');
    let blocked=false;
    for(const link of ranked){
      try{
        check(signal);const url=await api.downloadUrl(link.token);check(signal);
        const blob=await binary(url,signal,(got,total)=>{job.received=got;job.total=total;});
        if(blob.type.startsWith('image/'))throw Error('wbUnsupported');
        await put(job,blob,BrowserZip.safeName(job.title)+' '+job.ep+'.'+extension(blob.type),signal);return;
      }catch(e){check(signal);if(e.message==='wbCors')blocked=true;}
    }
    throw Error(blocked?'wbCors':'wbHostOnly');
  }
  function pump(){
    while(controllers.size<2){
      const job=Object.values(jobs()).find(j=>j.state==='queued');if(!job)return;
      const ac=new AbortController();controllers.set(job.id,ac);job.state='active';job.files=[];saveIndex().catch(()=>{});
      (async()=>{
        try{await perform(job,ac.signal);check(ac.signal);job.state='done';await saveIndex();waiters.get(job.id)?.resolve(job);}
        catch(e){for(const file of job.files||[])await api.set(file.key,null).catch(()=>{});job.files=[];job.state=ac.signal.aborted?'cancelled':'error';job.error=e.name==='QuotaExceededError'?'wbStorageFull':e.message;await saveIndex().catch(()=>{});waiters.get(job.id)?.reject(e);}
        finally{controllers.delete(job.id);waiters.delete(job.id);pump();}
      })();
    }
  }
  function enqueue(spec){
    const current=jobs()[spec.id];if(current?.state==='done')return Promise.resolve(current);
    if(waiters.has(spec.id))return waiters.get(spec.id).promise;
    let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});waiters.set(spec.id,{promise,resolve,reject});
    if(current?.files?.length)for(const f of current.files)api.set(f.key,null).catch(()=>{});
    jobs()[spec.id]={...spec,state:'queued',files:[],received:0,total:0,at:Date.now()};
    saveIndex().then(pump,e=>{jobs()[spec.id].state='error';waiters.get(spec.id)?.reject(e);waiters.delete(spec.id);});return promise;
  }
  async function batch(specs,zip=false){
    toast(t('dlQueuedN',specs.length));const results=await Promise.allSettled(specs.map(enqueue));
    if(results.some(r=>r.status==='rejected')){toast(t('dlFailed'),true);return;}
    const completed=results.map(r=>r.value);
    if(zip || completed.length>1)await exportZip(completed);else if(completed.length)await saveFile(completed[0]);
  }
  const queueManga=(serie,chapters,zip=false)=>batch(chapters.map(c=>({id:'manga:'+c.id,kind:'manga',chapterId:String(c.id),title:serie.title,poster:serie.poster,show:'/manga/series/'+serie.id,ep:c.n})),zip);
  const queueVideo=(specs,zip=false)=>batch(specs.map(s=>({...s,kind:s.kind||'anime'})),zip);
  function cancel(id){const job=jobs()[id];if(!job||!['queued','active'].includes(job.state))return;controllers.get(id)?.abort();job.state='cancelled';if(!controllers.has(id)){waiters.get(id)?.reject(Error('cancelled'));waiters.delete(id);}saveIndex().catch(()=>{});}
  async function remove(item){
    if(item.kind==='novel'){await nvDeleteDownload(item.novelId,item.slug);return;}
    cancel(item.id);
    // wait until an active transfer has released its payloads before deleting the record.
    const waiter=waiters.get(item.id)?.promise;if(waiter)await waiter.catch(()=>{});
    for(const file of item.files||[])await api.set(file.key,null);delete jobs()[item.id];await saveIndex();
  }
  async function filesFor(item){
    if(item.kind==='novel'){
      const data=await api.get(item.id);if(!data?.c)throw Error('wbFileMissing');
      return [{name:BrowserZip.safeName(item.title)+' '+item.ep+'.txt',blob:new Blob(['\ufeff'+data.n.title+'\n'+data.c.title+'\n\n'+nvParagraphs(data.c).join('\n\n')],{type:'text/plain;charset=utf-8'})}];
    }
    if(item.state!=='done')throw Error('wbNoSaved');
    return Promise.all(item.files.map(async f=>{const blob=await api.get(f.key);if(!blob?.size)throw Error('wbFileMissing');return {name:f.name,blob};}));
  }
  function deliver(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function exportZip(items){
    if(exporting)return;exporting=true;toast(t('wbZipBusy'));
    try{
      const chosen=items.filter(i=>i.state==='done');if(!chosen.length||chosen.length!==items.length)throw Error('wbNoSaved');
      const entries=[];for(const item of chosen){const folder=BrowserZip.safeName(item.title)+'/'+BrowserZip.safeName(item.kind+' '+item.ep+' '+item.id);for(const f of await filesFor(item))entries.push({name:folder+'/'+BrowserZip.safeName(f.name),blob:f.blob});}
      if(!entries.length)throw Error('wbNoSaved');const name=chosen.length===1?BrowserZip.safeName(chosen[0].title+' - '+t(['manga','novel'].includes(chosen[0].kind)?'chapter':'episode')+' '+(chosen[0].ep??'')):'Medflix-'+new Date().toISOString().slice(0,10);deliver(await BrowserZip.create(entries),name+'.zip');
    }catch(e){toast(t(/^ZIP (size|entry) limit$/.test(e.message)?'wbZipLimit':e.message in strings.en?e.message:'dlFailed'),true);}finally{exporting=false;}
  }
  async function saveFile(item){try{const files=await filesFor(item);if(files.length!==1)return exportZip([item]);deliver(files[0].blob,BrowserZip.safeName(files[0].name));}catch(e){toast(t('wbFileMissing'),true);}}
  async function chapter(cid){const job=jobs()['manga:'+cid];if(job?.state!=='done')return null;const files=await filesFor(job);return {...job.chapter,images:files.map(f=>{const u=URL.createObjectURL(f.blob);urls.add(u);return u;})};}
  function releaseUrls(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
  async function init(){for(const job of Object.values(jobs()))if(['active','queued'].includes(job.state)){for(const f of job.files||[])await api.set(f.key,null);job.files=[];job.state='cancelled';job.error='dlCancelled';}await persist('webDownloads');}
  return {strings,records,enqueue,queueManga,queueVideo,exportZip,saveFile,remove,chapter,releaseUrls,init};
})();
