// Browser downloads only: direct URLs for individual videos, temporary client Blobs for ZIPs/text.
// No download queue, file index, or payload is retained in the app.
const WebDownloads=(()=>{
  const active=new Set();
  const strings={
    en:{wbZip:'Download ZIP',wbPagesMissing:n=>`⁦${n}⁩ pages are missing at the source`,wbProgress:(n,all)=>`Chapter ⁦${n}/${all}⁩ ready`,wbSomeFailed:n=>`⁦${n}⁩ chapters could not be downloaded`,wbAvailable:n=>`Download available chapters (${n})`,wbZipLimit:'This selection exceeds ZIP limits. Export smaller groups.',wbHostOnly:'Open the provider to download this file.',wbZipBusy:'Preparing browser download…',wbCors:'This source blocks browser access to its files.',wbUnsupported:'This source did not provide a downloadable file.'},
    ar:{wbZip:'تحميل ZIP',wbPagesMissing:n=>`⁦${n}⁩ من الصفحات مفقودة في المصدر`,wbProgress:(n,all)=>`الفصل ⁦${n}/${all}⁩ جاهز`,wbSomeFailed:n=>`تعذّر تحميل ⁦${n}⁩ من الفصول`,wbAvailable:n=>`تحميل الفصول المتاحة (${n})`,wbZipLimit:'يتجاوز التحديد حدود ZIP. صدّر مجموعات أصغر.',wbHostOnly:'افتح المصدر لتحميل هذا الملف.',wbZipBusy:'جارٍ تجهيز تحميل المتصفح…',wbCors:'يمنع هذا المصدر وصول المتصفح إلى ملفاته.',wbUnsupported:'لم يوفر هذا المصدر ملفًا قابلًا للتحميل.'}
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
  // a moment's refusal or a dropped connection shouldn't cost a chapter
  async function retry(job,tries=3){for(let k=1;;k++){try{return await job();}catch(e){if(k>=tries)throw e;await new Promise(r=>setTimeout(r,500*2**k));}}}
  // a few at a time: one by one a long selection takes minutes, all at once gets refused. the first failure stops what hasn't started
  async function each(list,n,job){let next=0;const work=async()=>{while(next<list.length){const i=next++;try{await job(list[i],i);}catch(e){next=list.length;throw e;}}};await Promise.all(Array.from({length:Math.min(n,list.length)},work));}
  // a chapter that still fails doesn't lose the others, and fewer than were picked are only saved when asked
  async function gather(list,n,job,zip){
    const items=[];let done=0,failed=0,error;
    await each(list,n,async(c,i)=>{try{items[i]=await job(c);}catch(e){failed++;error=e;}if(list.length>1)toast(t('wbProgress',++done,list.length));});
    const got=items.filter(Boolean);
    if(!failed)return save(got,zip);
    if(!got.length)throw error;
    pickSheet(t('wbSomeFailed',failed),[['available',t('wbAvailable',got.length)],['cancel',t('cancel')]],'',v=>{if(v==='available')return save(got,zip).catch(()=>toast(t('dlFailed'),true));});
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
      toast(t('wbZipBusy'));let missing=0;
      // a stalled connection would hold the whole selection up forever, and its slot
      const page=src=>retry(()=>{const stop=new AbortController(),timer=setTimeout(()=>stop.abort(),60000);return binary(src,stop.signal).finally(()=>clearTimeout(timer));});
      // 2 chapters x 3 pages: the browser's 6 connections to a host, none left waiting into the frame's timeout
      await gather(chapters,2,async c=>{const chapter=c.images?.length?c:await retry(()=>mChapter(c.id,true));if(!chapter.images.length)throw Error('noImages');const files=[];let gone=0;
        await each(chapter.images,3,async(src,i)=>{
          let blob;try{blob=await page(src);}catch(e){if(++gone>chapter.images.length*.1)throw e;return;} // sites do have dead pages (a 404 in 1 chapter of 2 tried): a few don't cost the chapter, more means it's us being blocked
          if(!blob.type.startsWith('image/'))throw Error('noImages');files[i]={name:String(i+1).padStart(4,'0')+'.'+extension(blob.type),blob};
        });
        missing+=gone;return {id:String(c.id),title:serie.title,n:c.n,unit:t('chapter'),files:files.filter(Boolean)};
      },true);
      if(missing)toast(t('wbPagesMissing',missing),true);
    });
  }
  async function downloadNovels(id,chapters,novel,zip=false){
    return run('novel:'+id+':'+chapters.map(c=>c.slug).join('|'),async()=>{
      toast(t('wbZipBusy'));
      await gather(chapters,4,async c=>{
        const url=nvUrl(`/novels/${encodeURIComponent(id)}/chapters/by-slug/${encodeURIComponent(c.slug)}`);
        // on screen or already read: no request. else the reader's route, since novltime answers 403 to every site's browser, opaque frames too. not load(): a long selection would fill the page cache
        const data=c.contentJson?.length||c.content?{success:true,data:c}:scraper.cached(url)||await retry(async()=>parsers.novelJSON(JSON.parse(await api.fetch(url))));
        const chapter=parsers.novelJSON(data).data,paras=nvParagraphs(chapter);if(!paras.length)throw Error('nvNoText');
        return {id:c.slug,title:novel.title,n:c.order,unit:t('chapter'),files:[{name:novel.title+' '+c.order+'.txt',blob:new Blob(['\ufeff'+novel.title+'\n'+chapter.title+'\n\n'+paras.join('\n\n')],{type:'text/plain;charset=utf-8'})}]};
      },zip||chapters.length>1);
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
