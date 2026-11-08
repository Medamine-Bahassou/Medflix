// Browser downloads only: direct URLs for individual videos, temporary client Blobs for ZIPs/text.
// No download queue, file index, or payload is retained in the app.
const WebDownloads=(()=>{
  const active=new Set();
  const strings={
    en:{wbZip:'Download ZIP',wbZipLimit:'This selection exceeds ZIP limits. Export smaller groups.',wbHostOnly:'Open the provider to download this file.',wbZipBusy:'Preparing browser download…',wbCors:'This source blocks browser access to its files.',wbUnsupported:'This source did not provide a downloadable file.'},
    ar:{wbZip:'تحميل ZIP',wbZipLimit:'يتجاوز التحديد حدود ZIP. صدّر مجموعات أصغر.',wbHostOnly:'افتح المصدر لتحميل هذا الملف.',wbZipBusy:'جارٍ تجهيز تحميل المتصفح…',wbCors:'يمنع هذا المصدر وصول المتصفح إلى ملفاته.',wbUnsupported:'لم يوفر هذا المصدر ملفًا قابلًا للتحميل.'}
  };
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

  function deliver(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=BrowserZip.safeName(name);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function direct(url,name){if(!/^https:\/\//.test(url))throw Error('wbUnsupported');const a=document.createElement('a');a.href=url;a.download=BrowserZip.safeName(name);a.target='_blank';a.rel='noopener';document.body.append(a);a.click();a.remove();toast(t('openedBrowser'));}
  async function run(key,task){
    if(active.has(key)){toast(t('dlActive'));return;}
    active.add(key);
    try{await task();}catch(e){toast(t(/^ZIP (size|entry) limit$/.test(e.message)?'wbZipLimit':e.message in strings.en?e.message:'dlFailed'),true);}finally{active.delete(key);}
  }
  async function save(items,zip=false){
    const files=items.flatMap(item=>item.files.map(f=>({name:BrowserZip.safeName(item.title)+'/'+BrowserZip.safeName(item.unit+' '+item.n+' '+item.id)+'/'+BrowserZip.safeName(f.name),blob:f.blob})));
    if(!files.length)throw Error('wbUnsupported');
    if(!zip&&files.length===1){deliver(files[0].blob,items[0].files[0].name);return;}
    const name=items.length===1?BrowserZip.safeName(items[0].title+' - '+items[0].unit+' '+items[0].n):'Medflix-'+new Date().toISOString().slice(0,10);
    deliver(await BrowserZip.create(files),name+'.zip');
  }
  async function videoLinks(spec){return spec.token?[{token:spec.token}]:spec.kind==='cinema'?edDownloads(spec.slug):animeDownloadLinks(spec.epPath,spec.title,spec.alt,spec.ep);}
  async function resolved(spec){
    const links=await videoLinks(spec);links.sort((a,b)=>Number(b.quality===spec.quality)-Number(a.quality===spec.quality));
    for(const link of links){try{return await api.downloadUrl(link.token);}catch{}}
    const url=links[0]?.token?.replace(/^stream:/,'').replace(/^(aw:|ra:)/,'');
    if(url&&/^https:\/\//.test(url))return url;throw Error('wbHostOnly');
  }
  async function downloadVideo(specs,zip=false){
    return run('video:'+specs.map(s=>s.id).join('|'),async()=>{
      if(specs.length===1&&!zip){const s=specs[0];direct(await resolved(s),s.title+' '+(s.ep||'')+'.mp4');return;}
      toast(t('wbZipBusy'));const items=[],signal=new AbortController().signal;
      for(const s of specs){const blob=await binary(await resolved(s),signal);if(blob.type.startsWith('image/'))throw Error('wbUnsupported');items.push({id:s.id,title:s.title,n:s.ep||'',unit:t('episode'),files:[{name:s.title+' '+(s.ep||'')+'.'+extension(blob.type),blob}]});}
      await save(items,true);
    });
  }
  async function downloadManga(serie,chapters){
    return run('manga:'+chapters.map(c=>c.id).join('|'),async()=>{
      toast(t('wbZipBusy'));const items=[],signal=new AbortController().signal;
      for(const c of chapters){const chapter=await mChapter(c.id,true);if(!chapter.images.length)throw Error('noImages');const files=[];
        for(let i=0;i<chapter.images.length;i++){const blob=await binary(chapter.images[i],signal);if(!blob.type.startsWith('image/'))throw Error('noImages');files.push({name:String(i+1).padStart(4,'0')+'.'+extension(blob.type),blob});}
        items.push({id:String(c.id),title:serie.title,n:c.n,unit:t('chapter'),files});
      }
      await save(items,true);
    });
  }
  async function downloadNovels(id,chapters,novel,zip=false){
    return run('novel:'+id+':'+chapters.map(c=>c.slug).join('|'),async()=>{
      toast(t('wbZipBusy'));const items=[];
      for(const c of chapters){
        const url=nvUrl(`/novels/${encodeURIComponent(id)}/chapters/by-slug/${encodeURIComponent(c.slug)}`);
        // Reuse content already read in the normal page cache. Otherwise request it on the client, never via our API proxy.
        let data=scraper.cached(url);
        if(!data){let r;try{r=await ClientTransfer.fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});}catch{throw Error('wbCors');}if(!r.ok)throw Error('wbUnsupported');data=await r.json();}
        const chapter=parsers.novelJSON(data).data,paras=nvParagraphs(chapter);if(!paras.length)throw Error('nvNoText');
        items.push({id:c.slug,title:novel.title,n:c.order,unit:t('chapter'),files:[{name:novel.title+' '+c.order+'.txt',blob:new Blob(['\ufeff'+novel.title+'\n'+chapter.title+'\n\n'+paras.join('\n\n')],{type:'text/plain;charset=utf-8'})}]});
      }
      await save(items,zip||items.length>1);
    });
  }
  async function cleanupLegacyDownloads(){
    const [files,novels]=await Promise.all([api.get('webDownloads'),api.get('novelDownloads')]);
    for(const item of Object.values(files||{}))for(const file of item.files||[])if(file.key?.startsWith('web-file:'))await api.set(file.key,null);
    for(const key of Object.keys(novels||{}))if(key.startsWith('novel:'))await api.set(key,null);
    if(files)await api.set('webDownloads',null);if(novels)await api.set('novelDownloads',null);
  }
  return {strings,downloadVideo,downloadManga,downloadNovels,cleanupLegacyDownloads};
})();
