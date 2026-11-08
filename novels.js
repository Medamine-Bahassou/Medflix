// website novels: the same public catalogue as Android; the reader keeps its place in IndexedDB.
const NV_SITE = 'https://novltime.com', NV_API = NV_SITE + '/api/v1';
const nvUrl = (path, q = {}) => NV_API + path + (Object.keys(q).length ? '?' + new URLSearchParams(q) : '');
const nvCover = u => u ? new URL(u, NV_SITE).href : '';
const nvCard = o => ({ path: '/novels/series/' + o.id, type: 'novel', title: o.title, poster: nvCover(o.coverURL) });
parsers.novelJSON = j => { if (!j.success) throw new Error(t('unreachable')); return j; };
// cursors expire: only stable first pages belong in the shared page cache.
const nvLoad = async (path, q) => q?.cursor ? parsers.novelJSON(JSON.parse(await api.fetch(nvUrl(path, q)))) : load('novelJSON', nvUrl(path, q));
const nvReadHash = (id, slug) => '#/novels/read/' + encodeURIComponent(id) + '/' + encodeURIComponent(slug);
const nvChapterLink = (id, c) => `<a class="ep" href="${esc(nvReadHash(id, c.slug))}"><b>${t('chapter')} ${esc(c.order)}</b><span dir="auto">${esc(c.title)}</span></a>`;

async function novelsRoute(rest) {
  if (!api.web) return location.replace('#/');
  if (rest[0] === 'series') return novelDetails(rest[1]);
  if (rest[0] === 'read') return novelRead(rest[1], rest.slice(2).join('/'));
  return novelsBrowse();
}
async function novelsBrowse() {
  const hash = location.hash, q = new URLSearchParams(hash.split('?')[1] || '');
  const params = { language: 'ar', limit: 30, sort: q.get('sort') || 'trending', ...(q.get('search') && { search: q.get('search') }), ...(q.get('genre') && { genre: q.get('genre') }) };
  const j = await nvLoad('/novels', params);
  if (location.hash !== hash) return;
  const resumed = Object.values(store.novels).sort((a,b) => b.at-a.at).map(r => ({ path: '/novels/series/' + r.id, type: 'novel', title: r.title, poster: r.poster, href: nvReadHash(r.id, r.slug), badge: t('resumeCh', r.n), rm: 'novels:' + r.id }));
  view.innerHTML = `<div class="page nv-page"><h1>${t('novels')}</h1>
    <form class="nv-filters"><input name="search" type="search" placeholder="${t('nvSearchPh')}" aria-label="${t('nvSearchPh')}" value="${esc(q.get('search') || '')}">
    <select name="sort" aria-label="${t('f_sort')}">${[['trending','mHot'],['views','mSortViews'],['latest','mSortNew'],['rating','mSortRating']].map(([v,k]) => `<option value="${v}" ${params.sort===v?'selected':''}>${t(k)}</option>`).join('')}</select>
    <select name="genre" aria-label="${t('nvGenre')}"><option value="">${t('all')}</option>${[['action','أكشن','Action'],['adventure','مغامرة','Adventure'],['fantasy','خيال','Fantasy'],['romance','رومانسي','Romance'],['drama','دراما','Drama'],['comedy','كوميدي','Comedy'],['mystery','غموض','Mystery'],['horror','رعب','Horror'],['system','نظام','System'],['xianxia','شيانشيا','Xianxia']].map(([v,ar,en]) => `<option value="${v}" ${q.get('genre')===v?'selected':''}>${lang==='ar'?ar:en}</option>`).join('')}</select><button class="btn red">${t('apply')}</button></form>
    ${!q.get('search') ? row('continueReading', resumed) : ''}<div id="nv-results">${grid(j.data.map(nvCard))}</div>
    <button class="btn" id="nv-more" ${j.meta?.hasMore?'':'hidden'}>${t('browseAll')}</button></div>`;
  $('.nv-filters').onsubmit = e => { e.preventDefault(); location.hash = '#/novels?' + new URLSearchParams(new FormData(e.target)); };
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
  view.innerHTML = `<div class="page"><div class="det"><img class="poster" src="${esc(c.poster)}" alt=""><div><h1 dir="auto">${esc(n.title)}</h1>
    <div class="chips"><span class="chip">${t(n.completionStatus==='COMPLETED'?'nvDone':'nvOngoing')}</span>${d.author ? `<span class="chip">${t('nvAuthor')}: ${esc(d.author.displayName || d.author.username || '')}</span>` : ''}</div>
    <p class="desc" dir="auto">${esc(n.descriptionLong || n.descriptionShort || '')}</p><div class="nv-actions">${start?`<a class="btn red" href="${esc(start)}">${t(saved?.slug?'resumeCh':'read',saved?.n)}</a>`:''}<button class="btn" id="nv-list">${t(inList(c.path)?'listRemove':'listAdd')}</button></div></div></div>
    <h2>${t('chapters')}</h2><div class="nv-chapters">${chapters.data.map(x=>nvChapterLink(id,x)).join('') || `<p>${t('nothing')}</p>`}</div><button class="btn" id="nv-ch-more" ${chapters.meta?.hasMore?'':'hidden'}>${t('browseAll')}</button>
    ${row('nvSimilar',(d.similar || []).map(nvCard))}</div>`;
  $('#nv-list').onclick = e => { toggleList(c); e.currentTarget.textContent=t(inList(c.path)?'listRemove':'listAdd'); };
  let cursor = chapters.meta?.nextCursor;
  const seen = new Set(chapters.data.map(x=>x.id));
  $('#nv-ch-more').onclick = async e => {
    const b=e.currentTarget;b.disabled=true;
    try {
      const next=await nvLoad(`/novels/${encodeURIComponent(id)}/chapters/published`,{limit:100,sort:'asc',cursor});
      if(location.hash!==hash || !b.isConnected)return;
      $('.nv-chapters').insertAdjacentHTML('beforeend',next.data.filter(x=>!seen.has(x.id)&&seen.add(x.id)).map(x=>nvChapterLink(id,x)).join(''));
      cursor=next.meta?.nextCursor;b.hidden=!next.meta?.hasMore||!cursor;
    } catch { toast(t('unreachable'),true); } finally { b.disabled=false; }
  };
}
async function novelRead(id, slug) {
  const hash=location.hash;
  const [j, details]=await Promise.all([nvLoad(`/novels/${encodeURIComponent(id)}/chapters/by-slug/${encodeURIComponent(slug)}`),nvLoad(`/novels/${encodeURIComponent(id)}/view`)]);
  const c=j.data, n=details.data.novel;
  const context=await nvLoad(`/chapters/${encodeURIComponent(c.id)}/context`).catch(()=>null);
  if(location.hash!==hash)return;
  const paragraphs=(c.contentJson?.length ? c.contentJson.map(b=>b.text || '') : String(c.content || '').split('\n')).map(p=>p.trim()).filter(Boolean);
  if(!paragraphs.length)throw new Error(t('nvNoText'));
  const old=store.novels[id], progress=old?.slug===slug ? Math.max(0,Math.min(1,+old.progress||0)) : 0;
  store.novels[id]={id,slug,title:n.title,poster:nvCover(n.coverURL),n:c.order,progress,at:Date.now()};persist('novels');
  const size=Math.max(16,Math.min(36,+store.prefs.nvSize||22)), paper=['black','dim','sepia','light'].includes(store.prefs.nvPaper)?store.prefs.nvPaper:'black';
  const near=k=>context?.data?.[k]?.slug;
  view.innerHTML=`<div class="nv-reader" data-paper="${paper}" style="--nv-size:${size}px"><header class="nv-reader-bar"><a class="btn" href="#/novels/series/${encodeURIComponent(id)}">${ICON.back} ${t('rdIndex')}</a><span dir="auto">${esc(n.title)}</span><label>${t('rdSize')} <input id="nv-size" type="range" min="16" max="36" value="${size}"></label><label>${t('rdDisplay')} <select id="nv-paper">${['black','dim','sepia','light'].map(k=>`<option value="${k}" ${paper===k?'selected':''}>${t('paper_'+k)}</option>`).join('')}</select></label></header>
    <article class="nv-text" lang="ar" dir="auto"><h1>${t('chapter')} ${esc(c.order)} — ${esc(c.title)}</h1>${paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</article><footer class="nv-reader-foot">${near('prev')?`<a class="btn" href="${esc(nvReadHash(id,near('prev')))}">${t('prevCh')}</a>`:''}${near('next')?`<a class="btn red" href="${esc(nvReadHash(id,near('next')))}">${t('nextCh')}</a>`:context ? `<span>${t('nvFinished')}</span>` : ''}</footer></div>`;
  $('#nv-size').oninput=e=>{ $('.nv-reader').style.setProperty('--nv-size',e.target.value+'px');store.prefs.nvSize=+e.target.value;persist('prefs'); };
  $('#nv-paper').onchange=e=>{ $('.nv-reader').dataset.paper=e.target.value;store.prefs.nvPaper=e.target.value;persist('prefs'); };
  requestAnimationFrame(()=>{if(location.hash===hash)scrollTo(0,progress*Math.max(0,document.documentElement.scrollHeight-innerHeight));});
  let timer;
  const save=()=>{if(location.hash!==hash)return;store.novels[id].progress=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);store.novels[id].at=Date.now();persist('novels');};
  const onScroll=()=>{if(location.hash!==hash)return;store.novels[id].progress=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);clearTimeout(timer);timer=setTimeout(save,250);};
  addEventListener('scroll',onScroll,{passive:true});addEventListener('pagehide',save);
  addEventListener('hashchange',()=>{persist('novels');clearTimeout(timer);removeEventListener('scroll',onScroll);removeEventListener('pagehide',save);},{once:true});
}
