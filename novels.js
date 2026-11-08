// website novels: the same public catalogue as Android; the reader keeps its place in IndexedDB.
const NV_SITE = 'https://novltime.com', NV_API = NV_SITE + '/api/v1';
const nvUrl = (path, q = {}) => NV_API + path + (Object.keys(q).length ? '?' + new URLSearchParams(q) : '');
const nvCover = u => u ? new URL(u, NV_SITE).href : '';
const nvCard = o => ({ path: '/novels/series/' + o.id, type: 'novel', title: o.title, poster: nvCover(o.coverURL) });
parsers.novelJSON = j => { if (!j.success) throw new Error(t('unreachable')); return j; };
// cursors expire: only stable first pages belong in the shared page cache.
const nvLoad = async (path, q, force = false) => q?.cursor ? parsers.novelJSON(JSON.parse(await api.fetch(nvUrl(path, q)))) : load('novelJSON', nvUrl(path, q), force);
const nvReadHash = (id, slug) => '#/novels/read/' + encodeURIComponent(id) + '/' + encodeURIComponent(slug);
const NV_SORT = [['trending','mHot'],['views','mSortViews'],['latest','mSortNew'],['rating','mSortRating']];
const NV_GENRES = [['action','أكشن','Action'],['adventure','مغامرة','Adventure'],['fantasy','خيال','Fantasy'],['romance','رومانسي','Romance'],['drama','دراما','Drama'],['comedy','كوميدي','Comedy'],['mystery','غموض','Mystery'],['horror','رعب','Horror'],['system','نظام','System'],['xianxia','شيانشيا','Xianxia']];
const nvGenre = key => { const g = NV_GENRES.find(x => x[0] === key); return g ? g[lang === 'ar' ? 1 : 2] : key; };
const nvContinued = () => Object.values(store.novels).sort((a,b) => b.at-a.at).map(r => ({ path: '/novels/series/' + r.id, type: 'novel', title: r.title, poster: r.poster, href: nvReadHash(r.id, r.slug), badge: t('resumeCh', r.n), rm: 'novels:' + r.id }));
const nvChapterLink = (id, c) => `<a class="ep ${store.novels[id]?.slug === c.slug ? 'last' : ''}" href="${esc(nvReadHash(id, c.slug))}"><b>${t('chapter')} ${esc(c.order)}</b><span dir="auto">${esc(c.title)}</span></a>`;

async function novelsRoute(rest) {
  if (!api.web) return location.replace('#/');
  if (rest[0] === 'series') return novelDetails(rest[1]);
  if (rest[0] === 'read') return novelRead(rest[1], rest.slice(2).join('/'));
  return rest[0] === 'browse' || location.hash.includes('?') ? novelsBrowse() : novelsHome();
}
async function novelsHome(force = false) {
  const hash = location.hash;
  const sections = [['trending','mHot'],['views','mPopular'],['latest','mNew']];
  const results = await Promise.allSettled(sections.map(([sort]) => nvLoad('/novels', { language:'ar', limit:24, sort }, force)));
  if (location.hash !== hash) return;
  const good = results.find(r => r.status === 'fulfilled');
  if (!good) throw results[0].reason;
  const lists = results.map(r => r.status === 'fulfilled' ? r.value.data : []);
  const slides = (lists[0].length ? lists[0] : good.value.data).filter(n => n.coverURL).slice(0,5).map(n => ({ banner:nvCover(n.coverURL), title:n.title, desc:n.descriptionShort || '', info:'#' + nvCard(n).path }));
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
    <div class="section"><h2>${t('chapters')} <small>${esc(n.stats?.chapterCount || chapters.data.length)}</small><div class="ep-tools"><input id="nv-jump" placeholder="${t('jumpCh')}" aria-label="${t('jumpCh')}" type="number"><button class="btn ghost small" id="nv-reverse" aria-label="${t('reverse')}" title="${t('reverse')}">${ICON.sort}</button></div></h2><div class="eps nv-chapters"></div><button class="btn ghost nv-more" id="nv-ch-more" ${chapters.meta?.hasMore?'':'hidden'}>${t('more')}</button></div>
    <div class="rows">${row('nvSimilar',(d.similar || []).map(nvCard))}</div>`;
  let reversed = false;
  const allChapters = [...chapters.data];
  const drawChapters = () => { const filter=$('#nv-jump').value; const shown=(reversed?[...allChapters].reverse():allChapters).filter(c=>!filter || +c.order===+filter); $('.nv-chapters').innerHTML=shown.map(c=>nvChapterLink(id,c)).join('') || `<p class="hint">${t('nothing')}</p>`; };
  drawChapters();
  $('#nv-jump').oninput = drawChapters;
  $('#nv-reverse').onclick = () => { reversed=!reversed;drawChapters(); };
  $('#nv-list').onclick = e => { const on=toggleList(c); e.currentTarget.innerHTML=(on?ICON.check:ICON.plus)+' '+t(on?'inList':'myList'); };
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
  view.innerHTML=`<div class="nv-reader" data-paper="${paper}" style="--nv-size:${size}px"><header class="rd-head"><a class="icon-btn" href="#/novels/series/${encodeURIComponent(id)}" title="${t('rdIndex')}" aria-label="${t('rdIndex')}">${ICON.back}</a><div class="ttl"><a href="#/novels/series/${encodeURIComponent(id)}" dir="auto">${esc(n.title)}</a><small>${t('chapter')} ${esc(c.order)}</small></div><span class="sp"></span><select class="fchip nv-paper" id="nv-paper" aria-label="${t('rdDisplay')}">${['black','dim','sepia','light'].map(k=>`<option value="${k}" ${paper===k?'selected':''}>${t('paper_'+k)}</option>`).join('')}</select></header>
    <article class="nv-text" lang="ar" dir="auto"><h1>${t('chapter')} ${esc(c.order)} — ${esc(c.title)}</h1>${paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</article><footer class="rd-bar nv-reader-foot"><label class="nv-size-label" for="nv-size">${t('rdSize')}<input id="nv-size" type="range" min="16" max="36" value="${size}"></label><span class="rd-sep"></span>${near('prev')?`<a class="btn ghost small" href="${esc(nvReadHash(id,near('prev')))}">${t('prevCh')}</a>`:''}${near('next')?`<a class="btn red small" href="${esc(nvReadHash(id,near('next')))}">${t('nextCh')}</a>`:context ? `<span>${t('nvFinished')}</span>` : ''}</footer></div>`;
  $('#nv-size').oninput=e=>{ $('.nv-reader').style.setProperty('--nv-size',e.target.value+'px');store.prefs.nvSize=+e.target.value;persist('prefs'); };
  $('#nv-paper').onchange=e=>{ const v=e.target.value; $('.nv-reader').dataset.paper=v;store.prefs.nvPaper=v;persist('prefs'); };
  requestAnimationFrame(()=>{if(location.hash===hash)scrollTo(0,progress*Math.max(0,document.documentElement.scrollHeight-innerHeight));});
  let timer;
  const save=()=>{if(location.hash!==hash)return;store.novels[id].progress=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);store.novels[id].at=Date.now();persist('novels');};
  const onScroll=()=>{if(location.hash!==hash)return;store.novels[id].progress=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);clearTimeout(timer);timer=setTimeout(save,250);};
  addEventListener('scroll',onScroll,{passive:true});addEventListener('pagehide',save);
  addEventListener('hashchange',()=>{persist('novels');clearTimeout(timer);removeEventListener('scroll',onScroll);removeEventListener('pagehide',save);},{once:true});
}
