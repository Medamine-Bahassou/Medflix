// website novels: the same public catalogue as Android; the reader keeps its place in IndexedDB.
const NV_SITE = 'https://novltime.com', NV_API = NV_SITE + '/api/v1';
const nvUrl = (path, q = {}) => NV_API + path + (Object.keys(q).length ? '?' + new URLSearchParams(q) : '');
const nvCover = u => u ? new URL(u, NV_SITE).href : '';
const nvCard = o => ({ path: '/novels/series/' + o.id, type: 'novel', title: o.title, poster: nvCover(o.coverURL) });
parsers.novelJSON = j => { if (!j.success) throw new Error(t('unreachable')); return j; };
// cursors expire: only stable first pages belong in the shared page cache.
const nvLoad = async (path, q, force = false, keep = false) => q?.cursor ? parsers.novelJSON(JSON.parse(await api.fetch(nvUrl(path, q)))) : load('novelJSON', nvUrl(path, q), force, keep);
const nvReadHash = (id, slug) => '#/novels/read/' + encodeURIComponent(id) + '/' + encodeURIComponent(slug);
const NV_SORT = [['trending','mHot'],['views','mSortViews'],['latest','mSortNew'],['rating','mSortRating']];
const NV_GENRES = [['action','أكشن','Action'],['adventure','مغامرة','Adventure'],['fantasy','خيال','Fantasy'],['romance','رومانسي','Romance'],['drama','دراما','Drama'],['comedy','كوميدي','Comedy'],['mystery','غموض','Mystery'],['horror','رعب','Horror'],['system','نظام','System'],['xianxia','شيانشيا','Xianxia']];
const nvGenre = key => { const g = NV_GENRES.find(x => x[0] === key); return g ? g[lang === 'ar' ? 1 : 2] : key; };
const nvContinued = () => Object.values(store.novels).sort((a,b) => b.at-a.at).map(r => ({ path: '/novels/series/' + r.id, type: 'novel', title: r.title, poster: r.poster, href: nvReadHash(r.id, r.slug), badge: t('resumeCh', r.n), rm: 'novels:' + r.id }));
const nvKey = (id,slug) => 'novel:' + id + '/' + slug;
const nvPending = new Map();
const nvParagraphs = c => (c.contentJson?.length ? c.contentJson.map(b=>b.text || '') : String(c.content || '').split('\n')).map(p=>p.trim()).filter(Boolean);
const nvChapterLink = (id, c) => {
  const key=nvKey(id,c.slug), read=store.novelSeen[c.id]===2, saved=!!store.novelDownloads[key], busy=nvPending.has(key);
  return `<div class="nv-chapter ${picks?.has(String(c.id))?'sel':''}" data-pick="${esc(c.id)}"><a class="ep ${read?'seen':''} ${saved?'dld':''} ${store.novels[id]?.slug===c.slug?'last':''}" href="${esc(nvReadHash(id,c.slug))}"><b>${t('chapter')} ${esc(c.order)}</b><span dir="auto">${esc(c.title)}</span></a><div class="nv-chapter-actions"><button class="icon-btn ${read?'on':''}" data-nv-act="${read?'unread':'read'}" title="${t(read?'markUnread':'markRead')}" aria-label="${t(read?'markUnread':'markRead')}" aria-pressed="${read}">${ICON.check}</button><button class="icon-btn ${saved?'on':''}" data-nv-act="dl" ${busy?'disabled aria-busy="true"':''} title="${t(busy?'dlActive':'downloadShort')}" aria-label="${t(busy?'dlActive':'downloadShort')}">${busy?'<i class="nv-dl-spin"></i>':ICON.download}</button></div></div>`;
};
// chapter text is saved separately from its small index, so a large library is never rewritten for every download.
async function nvChapterData(id,slug,novel,keep=false) {
  const saved=await api.get(nvKey(id,slug));
  if(saved?.c && nvParagraphs(saved.c).length)return saved;
  const [j,details]=await Promise.all([nvLoad(`/novels/${encodeURIComponent(id)}/chapters/by-slug/${encodeURIComponent(slug)}`,undefined,false,keep),novel?{data:{novel}}:nvLoad(`/novels/${encodeURIComponent(id)}/view`,undefined,false,keep)]);
  if(!nvParagraphs(j.data).length)throw Error(t('nvNoText'));
  const x=await nvLoad(`/chapters/${encodeURIComponent(j.data.id)}/context`,undefined,false,keep).catch(()=>null);
  return {c:j.data,n:details.data.novel,x};
}
function nvDownload(id,slug,novel) {
  const key=nvKey(id,slug);
  if(nvPending.has(key))return nvPending.get(key);
  const job=(async()=>{
    const data=await nvChapterData(id,slug,novel,true);
    await api.set(key,data); // only report a download after the text was actually stored (quota errors must surface).
    store.novelDownloads[key]={id,slug,chapterId:data.c.id,n:data.c.order,title:data.n.title,at:Date.now()};
    try { await persist('novelDownloads'); } catch(e) { delete store.novelDownloads[key];throw e; }
  })().finally(()=>nvPending.delete(key));
  nvPending.set(key,job);return job;
}
async function nvDeleteDownload(id,slug) {
  const key=nvKey(id,slug);await api.set(key,null);delete store.novelDownloads[key];await persist('novelDownloads');
}
function nvMark(ids,value) { for(const id of ids)value?store.novelSeen[id]=value:delete store.novelSeen[id];persist('novelSeen'); }
function nvFinish(chapter,progress) { if(progress>=.97 && store.novelSeen[chapter.id]!==2)nvMark([chapter.id],2); }


async function novelsRoute(rest) {
  if (!api.web) return location.replace('#/');
  if (rest[0] === 'series') return novelDetails(rest[1]);
  if (rest[0] === 'read') return novelRead(rest[1], rest.slice(2).join('/'));
  return rest[0] === 'browse' || location.hash.includes('?') ? novelsBrowse() : novelsHome();
}
async function novelsHome(force = false) {
  const hash = location.hash;
  const sections = [['trending','mHot'],['views','mPopular'],['latest','mNew']];
  const results = await firstSections(sections.map(([sort]) => () => nvLoad('/novels', {language:'ar',limit:24,sort},force)));
  if (location.hash !== hash) return;
  const good = results.find(Boolean);
  const lists = results.map(r => r?.data || []);
  const slides = (lists[0].length ? lists[0] : good.data).filter(n => n.coverURL).slice(0,5).map(n => ({ banner:nvCover(n.coverURL), title:n.title, desc:n.descriptionShort || '', info:'#' + nvCard(n).path }));
  heroPage(slides, `${chips([[t('browseAll'),'#/novels/browse'], ...NV_GENRES.slice(0,5).map(([g]) => [nvGenre(g),'#/novels/browse?genre='+g])])}
    ${row('continueReading',nvContinued())}
    ${sections.map(([sort,label],i) => row(label,lists[i].map(nvCard),'#/novels/browse?sort='+sort)).join('')}`, () => novelsHome(true));
}
async function novelsBrowse(force = false) {
  const hash = location.hash, q = new URLSearchParams(hash.split('?')[1] || '');
  const params = { language: 'ar', limit: 30, sort: q.get('sort') || 'trending', ...(q.get('search') && { search: q.get('search') }), ...(q.get('genre') && { genre: q.get('genre') }) };
  const j = await nvLoad('/novels', params, force);
  if (location.hash !== hash) return;
  const go = (key,value) => { const p = new URLSearchParams(q); value ? p.set(key,value) : p.delete(key); location.hash = '#/novels/browse' + (p.size ? '?' + p : ''); };
  const filters = [['sort',t('f_sort'),NV_SORT.map(([v,k])=>[v,t(k)])],['genre',t('nvGenre'),NV_GENRES.map(([g])=>[g,nvGenre(g)])]];
  view.innerHTML = `<div class="page flt-page nv-page"><h1>${t('novels')}</h1>
    <form class="fsearch" id="nv-search">${ICON.search}<input name="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="${t('nvSearchPh')}" aria-label="${t('nvSearchPh')}" value="${esc(q.get('search') || '')}"></form>
    <div class="fchips">${q.size ? `<a class="fchip clear" href="#/novels/browse">${ICON.x} ${t('reset')}</a>` : ''}${filters.map(([k,name,opts])=>{const cur=opts.find(([v])=>v===q.get(k));return `<button class="fchip ${cur?'on':''}" data-k="${k}">${esc(cur?.[1] || name)}${CHEVRON}</button>`;}).join('')}</div>
    <div id="nv-results">${grid(j.data.map(nvCard))}</div>
    <button class="btn ghost nv-more" id="nv-more" ${j.meta?.hasMore?'':'hidden'}>${t('more')}</button></div>`;
  $('#nv-search').onsubmit = e => { e.preventDefault(); go('search',e.target.search.value.trim()); };
  $('.nv-page .fchips').onclick = e => { const k=e.target.closest('[data-k]')?.dataset.k; if(!k)return;const [,name,opts]=filters.find(f=>f[0]===k);pickSheet(name,k==='genre'?[['',t('all')],...opts]:opts,q.get(k)|| (k==='sort'?'trending':''),v=>go(k,v)); };
  pageRefresh = () => novelsBrowse(true);
  let cursor = j.meta?.nextCursor;
  const seen = new Set(j.data.map(o => o.id));
  $('#nv-more').onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const next = await nvLoad('/novels', { ...params, cursor });
      if (location.hash !== hash || !b.isConnected) return;
      const items = next.data.filter(o => !seen.has(o.id) && seen.add(o.id));
      $('#nv-results .grid')?.insertAdjacentHTML('beforeend', items.map(nvCard).map(card).join(''));
      cursor = next.meta?.nextCursor; b.hidden = !next.meta?.hasMore || !cursor;
    } catch { toast(t('unreachable'), true); } finally { b.disabled = false; }
  };
}
async function novelDetails(id) {
  const hash = location.hash;
  const [j, chapters] = await Promise.all([nvLoad(`/novels/${encodeURIComponent(id)}/view`), nvLoad(`/novels/${encodeURIComponent(id)}/chapters/published`, { limit: 100, sort: 'asc' })]);
  if (location.hash !== hash) return;
  const d = j.data, n = d.novel, c = nvCard(n), saved = store.novels[id], first = chapters.data[0];
  const start = saved?.slug ? nvReadHash(id, saved.slug) : first ? nvReadHash(id, first.slug) : '';
  view.innerHTML = `<div class="det-hero"><div class="bg" style="background-image:url('${esc(c.poster.replaceAll("'",'%27'))}')"></div><div class="det">${c.poster ? `<img class="poster" src="${esc(c.poster)}" alt="">` : ''}<div><h1 dir="auto">${esc(n.title)}</h1>
    ${(n.alternativeTitles || []).length ? `<div class="alt" dir="auto">${esc(n.alternativeTitles.join(' · '))}</div>` : ''}
    <div class="chips"><span class="chip">${t(n.completionStatus==='COMPLETED'?'nvDone':'nvOngoing')}</span>${(n.genres || []).map(g=>`<span class="chip">${esc(nvGenre(g))}</span>`).join('')}${d.author ? `<span class="chip">${t('nvAuthor')}: ${esc(d.author.displayName || d.author.username || '')}</span>` : ''}</div>
    <p class="desc" dir="auto">${esc(n.descriptionLong || n.descriptionShort || '')}</p><div class="actions">${start?`<a class="btn red" href="${esc(start)}">${ICON.novel} ${t(saved?.slug?'resumeCh':'read',saved?.n)}</a>`:''}<button class="btn ghost" id="nv-list">${inList(c.path)?ICON.check:ICON.plus} ${t(inList(c.path)?'inList':'myList')}</button></div></div></div></div>
    <div class="section"><h2>${t('chapters')} <small>${esc(n.stats?.chapterCount || chapters.data.length)}</small><div class="ep-tools"><input id="nv-jump" placeholder="${t('jumpCh')}" aria-label="${t('jumpCh')}" type="number"><button class="btn ghost small" id="nv-reverse" aria-label="${t('reverse')}" title="${t('reverse')}">${ICON.sort}</button>${selBtn('btn ghost small')}</div></h2>${selBar()}<div class="eps nv-chapters"></div><button class="btn ghost nv-more" id="nv-ch-more" ${chapters.meta?.hasMore?'':'hidden'}>${t('more')}</button></div>
    <div class="rows">${row('nvSimilar',(d.similar || []).map(nvCard))}</div>`;
  let reversed = false;
  const allChapters = [...chapters.data];
  const shown = () => { const filter=$('#nv-jump').value;return (reversed?[...allChapters].reverse():allChapters).filter(c=>!filter || +c.order===+filter); };
  const drawChapters = () => { if(location.hash!==hash)return;$('.nv-chapters').innerHTML=shown().map(c=>nvChapterLink(id,c)).join('') || `<p class="hint">${t('nothing')}</p>`; };
  drawChapters();
  $('#nv-jump').oninput = drawChapters;
  $('#nv-reverse').onclick = () => { reversed=!reversed;drawChapters(); };
  $('#nv-list').onclick = e => { const on=toggleList(c); e.currentTarget.innerHTML=(on?ICON.check:ICON.plus)+' '+t(on?'inList':'myList'); };
  const picked = ids => allChapters.filter(c=>ids.includes(String(c.id)));
  const acts = (ids,one) => { const xs=picked(ids);return [['read',t('markRead')],['unread',t('markUnread')],one && ['prev',t('markPrevRead')],['dl',t('downloadShort')],xs.some(c=>store.novelDownloads[nvKey(id,c.slug)]) && ['del',t('delDownload')],ids.length>1 && ['zip',t('wbZip')],one && ['select',t('select')]].filter(Boolean); };
  const run = async (act,ids) => {
    const xs=picked(ids);
    if(act==='select')return selectFrom(ids[0]);
    if(act==='read'||act==='unread')nvMark(ids,act==='read'?2:0);
    if(act==='prev'&&xs[0])nvMark(allChapters.filter(c=>+c.order<+xs[0].order).map(c=>c.id),2);
    if(act==='zip') {
      try { for(const c of xs)await nvDownload(id,c.slug,n);await WebDownloads.exportZip(WebDownloads.records().filter(r=>r.kind==='novel'&&r.novelId===id&&xs.some(c=>c.slug===r.slug))); }catch{toast(t('dlFailed'),true);}return;
    }
    if(act==='dl') {
      let failed=false;
      for(const c of xs) {
        const job=nvDownload(id,c.slug,n);drawChapters();
        try { await job; } catch { failed=true; }drawChapters();
      }
      if(failed)toast(t('dlFailed'),true);
      else { const items=WebDownloads.records().filter(r=>r.kind==='novel'&&r.novelId===id&&xs.some(c=>c.slug===r.slug));if(items.length>1)await WebDownloads.exportZip(items);else if(items.length)await WebDownloads.saveFile(items[0]); }
    }
    if(act==='del') { try { for(const c of xs)await nvDeleteDownload(id,c.slug); }catch{toast(t('dlFailed'),true);} }
    drawChapters();
  };
  const selectFrom=selectable($('.nv-chapters'),()=>shown().map(c=>String(c.id)),acts,run);
  $('.nv-chapters').onclick=e=>{const btn=e.target.closest('[data-nv-act]');if(!btn)return;const cid=btn.closest('[data-pick]')?.dataset.pick;if(cid)run(btn.dataset.nvAct,[cid]);};
  pagePress=['.nv-chapter',el=>pickSheet(t('chapter')+' '+picked([el.dataset.pick])[0]?.order,acts([el.dataset.pick],true),'',v=>run(v,[el.dataset.pick]))];
  let cursor = chapters.meta?.nextCursor;
  const seen = new Set(chapters.data.map(x=>x.id));
  $('#nv-ch-more').onclick = async e => {
    const b=e.currentTarget;b.disabled=true;
    try {
      const next=await nvLoad(`/novels/${encodeURIComponent(id)}/chapters/published`,{limit:100,sort:'asc',cursor});
      if(location.hash!==hash || !b.isConnected)return;
      allChapters.push(...next.data.filter(x=>!seen.has(x.id)&&seen.add(x.id)));drawChapters();
      cursor=next.meta?.nextCursor;b.hidden=!next.meta?.hasMore||!cursor;
    } catch { toast(t('unreachable'),true); } finally { b.disabled=false; }
  };
}
async function novelRead(id, slug) {
  const hash=location.hash;
  const {c,n,x:context}=await nvChapterData(id,slug);
  if(location.hash!==hash)return;
  const paragraphs=nvParagraphs(c);
  if(!store.novelSeen[c.id])nvMark([c.id],1);
  const old=store.novels[id], progress=old?.slug===slug ? Math.max(0,Math.min(1,+old.progress||0)) : 0;
  store.novels[id]={id,slug,title:n.title,poster:nvCover(n.coverURL),n:c.order,progress,at:Date.now()};persist('novels');
  const size=Math.max(16,Math.min(36,+store.prefs.nvSize||22)), paper=['black','dim','sepia','light'].includes(store.prefs.nvPaper)?store.prefs.nvPaper:'black';
  const near=k=>context?.data?.[k]?.slug;
  view.innerHTML=`<div class="nv-reader" data-paper="${paper}" style="--nv-size:${size}px"><header class="rd-head"><a class="icon-btn" href="#/novels/series/${encodeURIComponent(id)}" title="${t('rdIndex')}" aria-label="${t('rdIndex')}">${ICON.back}</a><div class="ttl"><a href="#/novels/series/${encodeURIComponent(id)}" dir="auto">${esc(n.title)}</a><small>${t('chapter')} ${esc(c.order)}</small></div><span class="sp"></span><div class="dd nv-paper" id="nv-paper"><button class="dd-btn" aria-label="${t('rdDisplay')}"><span class="lbl">${t('paper_'+paper)}</span>${ICON.caretDown}</button><div class="dd-menu" id="nv-paper-menu"></div></div></header>
    <article class="nv-text" lang="ar" dir="auto"><h1>${t('chapter')} ${esc(c.order)} — ${esc(c.title)}</h1>${paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</article><footer class="rd-bar nv-reader-foot"><label class="nv-size-label" for="nv-size">${t('rdSize')}<input id="nv-size" type="range" min="16" max="36" value="${size}"></label><span class="rd-sep"></span>${near('prev')?`<a class="btn ghost small" href="${esc(nvReadHash(id,near('prev')))}">${t('prevCh')}</a>`:''}${near('next')?`<a class="btn red small" href="${esc(nvReadHash(id,near('next')))}">${t('nextCh')}</a>`:context ? `<span>${t('nvFinished')}</span>` : ''}</footer></div>`;
  $('#nv-size').oninput=e=>{ $('.nv-reader').style.setProperty('--nv-size',e.target.value+'px');store.prefs.nvSize=+e.target.value;persist('prefs'); };
  const drawPaper = () => { $('#nv-paper .lbl').textContent=t('paper_'+$('.nv-reader').dataset.paper); $('#nv-paper-menu').innerHTML=['black','dim','sepia','light'].map(k=>`<button class="dd-item ${$('.nv-reader').dataset.paper===k?'on':''}" data-paper="${k}" aria-pressed="${$('.nv-reader').dataset.paper===k}"><span class="ck">${ICON.check}</span>${t('paper_'+k)}</button>`).join(''); };
  drawPaper();
  $('#nv-paper .dd-btn').onclick=()=>{ const dd=$('#nv-paper'); dd.classList.contains('open') ? closeMenu(dd) : openMenu(dd); };
  $('#nv-paper-menu').onclick=e=>{ const v=e.target.closest('.dd-item')?.dataset.paper; if(!['black','dim','sepia','light'].includes(v))return; $('.nv-reader').dataset.paper=v;store.prefs.nvPaper=v;persist('prefs');drawPaper();closeMenu($('#nv-paper')); };

  requestAnimationFrame(()=>{if(location.hash===hash)scrollTo(0,progress*Math.max(0,document.documentElement.scrollHeight-innerHeight));});
  let timer;
  const save=()=>{if(location.hash!==hash)return;store.novels[id].progress=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);store.novels[id].at=Date.now();nvFinish(c,store.novels[id].progress);persist('novels');};
  const onScroll=()=>{if(location.hash!==hash)return;store.novels[id].progress=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);nvFinish(c,store.novels[id].progress);clearTimeout(timer);timer=setTimeout(save,250);};
  nvFinish(c,progress);addEventListener('scroll',onScroll,{passive:true});addEventListener('pagehide',save);
  addEventListener('hashchange',()=>{persist('novels');clearTimeout(timer);removeEventListener('scroll',onScroll);removeEventListener('pagehide',save);},{once:true});
}
