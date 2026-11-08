// Bounded binary chunks for public download hosts and the manga sources' own image paths.
const CHUNK=2*1024*1024;
const allowed=u=>u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(
  /^https:\/\/((appswat|meshmanga)\.com\/v2\/media|cdn\.olympustaff\.com\/uploads|([a-z0-9-]+\.)*(sparkmanga|manga-starz|lek-manga|like-manga|link-manga)\.net\/(wp-content\/uploads|manga))\//.test(u.href)
  || (/^(download\d*\.)?mediafire\.com$/.test(u.hostname)&&u.hostname!=='mediafire.com')
  || (u.hostname==='pixeldrain.com'&&/^\/api\/file\/[\w-]+$/.test(u.pathname))
  || /(^|\.)arabseed\.top$/.test(u.hostname));
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).end();
  let url;const start=Number(req.query.start||0);
  try{url=new URL(req.query.url);}catch{return res.status(400).json({error:'bad URL'});}
  if(!Number.isSafeInteger(start)||start<0)return res.status(400).json({error:'bad range'});
  try{
    let r;
    for(let i=0;i<6;i++){
      if(!allowed(url))return res.status(403).json({error:'unsupported file host'});
      r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(50000),headers:{Range:`bytes=${start}-${start+CHUNK-1}`,'User-Agent':'Mozilla/5.0','Referer':url.origin+'/'}});
      if(![301,302,303,307,308].includes(r.status))break;
      await r.body?.cancel();url=new URL(r.headers.get('location'),url);r=null;
    }
    if(!r?.ok)return res.status(502).json({error:'file unavailable'});
    const type=r.headers.get('content-type')||'application/octet-stream';
    if(/text\/|json|javascript|xml/i.test(type)){await r.body?.cancel();return res.status(415).json({error:'host returned a page, not a file'});}
    const range=r.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/),length=Number(r.headers.get('content-length'));
    if((r.status===206&&(!range||+range[1]!==start))||(start>0&&r.status!==206)){await r.body?.cancel();return res.status(502).json({error:'invalid file range'});}
    const total=range?+range[3]:length;
    if(!Number.isSafeInteger(total)||total<1||(!range&&total>CHUNK)){await r.body?.cancel();return res.status(413).json({error:'host does not support chunk downloads'});}
    const reader=r.body.getReader(),parts=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>CHUNK){await reader.cancel();return res.status(413).json({error:'chunk too large'});}parts.push(Buffer.from(value));}
    if(!size||(range&&size!==+range[2]-start+1)||(!range&&size!==total))return res.status(502).json({error:'incomplete file'});
    const data=Buffer.concat(parts);
    if(start===0&&/^[\s]*[<{[]/.test(data.subarray(0,64).toString()))return res.status(415).json({error:'not a media file'});
    res.setHeader('Content-Type',type);res.setHeader('X-File-Total',String(total));res.setHeader('X-File-Offset',String(start));res.status(200).send(data);
  }catch{return res.status(502).json({error:'download failed'});}
};
module.exports.allowed=allowed;
