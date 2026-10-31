// Manga section: MeshManga's catalogue, read from the JSON API its site runs on (appswat.com).
// Routes: #/manga, #/manga/browse/<page>?<api query>, #/manga/series/<id>, #/manga/read/<chapter id>
const MANGA_API = 'https://appswat.com/v2/api/v2/';
const mUrl = (path, params = {}) => MANGA_API + path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
// the API's fixed ids, with labels
const MTYPES = [['131', 'مانهوا', 'Manhwa'], ['132', 'مانها', 'Manhua'], ['133', 'مانجا', 'Manga'], ['134', 'كوميك', 'Comic']];
const MSTATUS = [['79', 'مستمر', 'Ongoing'], ['80', 'مكتمل', 'Completed'], ['81', 'متوقف', 'Hiatus']];
const MSORT = [['', 'mSortNew'], ['-views_count', 'mSortViews'], ['-rating', 'mSortRating'], ['title', 'mSortTitle']];
const mLabel = (list, v) => { const o = list.find(o => o[0] === String(v)); return o ? (lang === 'ar' ? o[1] : o[2]) : v; };
const mTypeName = name => mLabel(MTYPES.map(([id, ar, en]) => [en.toLowerCase(), ar, en]), name);
const mCard = s => ({ path: '/manga/series/' + s.id, type: 'manga', title: s.title, poster: s.poster?.medium || s.poster?.thumbnail || '',
  rating: +s.rating ? (+s.rating).toFixed(1) : '', badge: s.type?.name ? mTypeName(s.type.name) : '', g: (s.genres || []).map(x => String(x.id)) }); // g: genre ids (the filter page)

// chapter labels carry extras ("FREE 1", "153 [S3 START]", "05 (side story)"): show just the number
const chNum = v => { const m = String(v ?? '').match(/(?<![a-z\d.])\d+(\.\d+)?/i); return m ? String(+m[0]) : v; };

// JSON responses go through the same 90-day cache as the scraped pages (see load() in scraper.js)
Object.assign(parsers, {
  mangaList: j => ({ items: j.results.map(mCard), count: j.count }),
  // latest chapters feed: one card per series, opening that chapter
  mangaLatest: j => {
    const seen = new Set();
    return { items: j.results.filter(c => c.serie && !seen.has(c.serie.id) && seen.add(c.serie.id))
      .map(c => ({ ...mCard(c.serie), badge: `${t('chShort')} ${chNum(c.chapter)}`, href: '#/manga/read/' + c.id })) };
  },
  mangaSeries: j => ({ id: j.id, title: j.title, alt: j.alternative || '', story: j.story || '', type: j.type?.name || '', status: String(j.status?.id || ''),
    genres: (j.genres || []).map(g => g.name), poster: j.poster?.medium || '', cover: j.cover?.medium || j.poster?.medium || '',
    rating: +j.rating ? (+j.rating).toFixed(1) : '', views: j.views_count || 0 }),
  mangaChapters: j => ({ items: j.results.map(c => ({ id: c.id, n: chNum(c.chapter) })), count: j.count }), // newest first
  mangaChapter: j => ({ id: j.id, n: chNum(j.chapter), prev: j.previous_chapter_id, next: j.next_chapter_id,
    serie: { id: j.serie.id, title: j.serie.title, poster: j.serie.poster?.medium || '' },
    images: (j.images || []).sort((a, b) => a.order - b.order).map(i => i.image) }),
  mangaGenres: j => (j.results || j).map(g => [String(g.id), g.name]),
});

// Olympus Staff (olympustaff.com, Team-X), merged in: a series both sites carry shows once, as MangaSwat's, with Olympus's
// chapters filling the numbers MangaSwat lacks. Olympus ids carry "o:" (series o:<slug>, chapter o:<slug>:<number>).
const OLY = 'https://olympustaff.com/';
const oUrl = (path, params = {}) => OLY + path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
const O_TYPES = { 'مانهوا كورية': 'Manhwa', 'مانها صيني': 'Manhua', 'مانجا ياباني': 'Manga' };
const oType = s => O_TYPES[txt({ textContent: s })] ? mTypeName(O_TYPES[txt({ textContent: s })]) : txt({ textContent: s });
const oCard = (slug, title, poster, type) => ({ path: '/manga/series/o:' + slug, type: 'manga', title: title.trim(), poster: poster || '',
  rating: '', badge: oType(type), names: [title.trim()] });
// a listing's cards: the series list's (.bsx) or the search's (.tx-card)
const oCards = doc => [...doc.querySelectorAll('.bsx > a[href], a.tx-card[href]')].map(a => {
  const slug = (a.getAttribute('href') || '').split('/series/')[1] || '';
  if (!slug || /[/?]/.test(slug)) return null;
  return oCard(slug, a.getAttribute('title') || txt(a.querySelector('.tx-card-title')), a.querySelector('img')?.getAttribute('src'), txt(a.querySelector('.type, .tx-type')));
}).filter(Boolean);
// the last of a listing's page links (?page=N), 1 when there are none
const oLastPage = (doc, base) => Math.max(1, ...[...doc.querySelectorAll(`a[href^="${base}?page="], a[href^="${base}&page="]`)]
  .map(a => +((a.getAttribute('href') || '').split('page=').pop().split('&')[0]) || 1));
// same series on both sites = a shared title, ignoring case and punctuation (Arabic-only titles never match)
const mKeys = names => names.map(norm).filter(Boolean);
// lists of cards, interleaved, each series once: a card whose title is already listed (by an earlier list first) is dropped.
// seen carries over between pages of the same browse.
function mMerge(lists, seen = new Set()) {
  const kept = lists.map(l => (l || []).filter(c => {
    const k = mKeys([c.title, ...(c.names || [])]);
    if (k.some(x => seen.has(x))) return false;
    k.forEach(x => seen.add(x));
    return true;
  }));
  return Array.from({ length: Math.max(0, ...kept.map(l => l.length)) }, (_, i) => kept.map(l => l[i])).flat().filter(Boolean);
}
const oChs = (doc, url) => [...doc.querySelectorAll(`.chapter-card a.chapter-link[href^="${url}/"]`)]
  .map(a => (a.getAttribute('href') || '').split('/').pop()).filter(Boolean);
Object.assign(parsers, {
  olyList: (doc, url) => { const base = url.split('?')[0]; return { items: oCards(doc), pages: oLastPage(doc, base) }; },
  // its home page's updates: a series each, its newest free chapter first (a paid chapter has no link, a "buy" box instead)
  olyLatest: doc => ({ items: [...doc.querySelectorAll('.uta')].map(b => {
    const slug = (b.querySelector('.imgu a[href]')?.getAttribute('href') || '').split('/series/')[1] || '';
    if (!slug || slug.includes('/')) return null;
    const n = (b.querySelector(`li a[href^="${OLY}series/${slug}/"]`)?.getAttribute('href') || '').split('/').pop();
    if (!n) return null;
    return { ...oCard(slug, txt(b.querySelector('.info h3')), b.querySelector('.imgu img')?.getAttribute('src'), ''),
      badge: `${t('chShort')} ${chNum(n)}`, href: `#/manga/read/o:${slug}:${n}` };
  }).filter(Boolean) }),
  olySeries: (doc, url) => {
    const slug = url.split('/series/')[1].split('?')[0], base = OLY + 'series/' + slug;
    const info = label => txt([...doc.querySelectorAll('.full-list-info')].find(e => e.textContent.includes(label))?.querySelector('a'));
    const st = info('الحالة'), title = txt(doc.querySelector('.author-info-title h1, .author-info-title h6')) || slug;
    const poster = doc.querySelector('.whitebox img.shadow-sm')?.getAttribute('src') || '';
    return { id: 'o:' + slug, title, alt: '', story: txt(doc.querySelector('.review-content')), type: O_TYPES[info('النوع')] || info('النوع'),
      status: st.includes('مستمر') ? '79' : st.includes('مكتمل') ? '80' : st ? '81' : '',
      genres: [...new Set([...doc.querySelectorAll('a[href*="series?genre="]')].map(txt).filter(Boolean))],
      poster, cover: poster, rating: '', views: 0, names: [title], pages: oLastPage(doc, base), chs: oChs(doc, base) };
  },
  olySeriesChs: (doc, url) => oChs(doc, url.split('?')[0]),
  olyChapter: (doc, url) => {
    const [, slug, n] = url.match(/\/series\/([^/]+)\/([^/?#]+)/) || [];
    const images = [...new Set([...doc.querySelectorAll('.image_list img.manga-chapter-img')].map(i => i.getAttribute('src')).filter(Boolean))];
    return { id: `o:${slug}:${n}`, n: chNum(n), prev: null, next: null,
      serie: { id: 'o:' + slug, title: txt(doc.querySelector(`a[href="${OLY}series/${slug}"]`)), poster: '' }, images };
  },
});
const olyLatest = force => load('olyLatest', OLY, force);
const olyList = (p, page = 1, force = false) => load('olyList', oUrl(p.keyword != null ? 'search' : 'series', { ...p, page }), force);
// a series' page: its details, and its chapters (about 40 a page, ?page=N), every page. A paid chapter has no link: left out
async function olySeries(slug, force) {
  const url = OLY + 'series/' + slug, s = await load('olySeries', url, force);
  const rest = await Promise.all(Array.from({ length: s.pages - 1 }, (_, i) => load('olySeriesChs', `${url}?page=${i + 2}`, force).catch(() => [])));
  const chapters = [...new Set([...s.chs, ...rest.flat()])].map(n => ({ id: `o:${slug}:${n}`, n: chNum(n) }));
  return { ...s, chapters };
}

// the other site's copy of a series, found by searching its title
async function olyTwin(s, force) {
  const k = mKeys([s.title, ...String(s.alt || '').split(/[|,،]/)]);
  const hit = k.length && (await olyList({ keyword: s.title }).catch(() => null))?.items.find(c => mKeys(c.names).some(x => k.includes(x)));
  return hit ? olySeries(hit.path.split('/o:').pop(), force).catch(() => null) : null;
}
// MangaSwat's search only finds its own title, which may be one of the other site's names: each Latin name is tried in turn
async function swatTwin(m) {
  const k = mKeys(m.names);
  for (const name of [...new Set(m.names.map(n => String(n || '').trim()).filter(n => /[a-z]/i.test(n)))].slice(0, 4)) {
    const r = await load('mangaList', mUrl('series/', { search: name, page_size: 20 })).catch(() => null);
    const hit = r?.items.find(c => k.includes(norm(c.title)));
    if (hit) return hit.path.split('/').pop();
  }
}
// newest first, by number: the sites list chapters in upload order, so an extra added later (37.5, 0.5) sits out of place
const byNum = chs => [...chs].sort((a, b) => (parseFloat(b.n) || 0) - (parseFloat(a.n) || 0));
// a series' downloaded chapters, number -> chapter id, from downloads filed under any of its ids (MangaSwat's, Olympus's).
// A chapter may have been saved from either site while the list shows the other's: matched by number, the saved copy is
// found, and opened (it works offline)
const savedChs = ids => {
  const shows = new Set(ids.filter(Boolean).map(i => '/manga/series/' + i));
  return new Map(Object.values(store.downloads).filter(d => d.kind === 'manga' && d.state === 'done' && shows.has(d.show))
    .map(d => [String(chNum(d.ep)), String(d.chapterId)]));
};
// a series as shown, chapters newest first: MangaSwat's (plus its Olympus twin's extra chapters), or Olympus's alone.
// ids: the series' ids on both sites (downloads may be filed under either)
async function mSeriesFull(id, force) {
  if (/^t\d+$/.test(id)) { // a series saved under a removed source's id: found again by its title
    const p = '/manga/series/' + id, title = store.manga[id]?.title || store.list[p]?.title || Object.values(store.downloads).find(d => d.show === p)?.title;
    const hit = title && (await load('mangaList', mUrl('series/', { search: title, page_size: 10 }), force).catch(() => null))?.items[0]
      || title && (await olyList({ keyword: title }, 1, force).catch(() => null))?.items[0];
    if (!hit) throw new Error(t('unreachable'));
    return mSeriesFull(hit.path.split('/').pop(), force);
  }
  if (String(id).startsWith('o:')) {
    const m = await olySeries(String(id).slice(2), force);
    const sw = await swatTwin(m), f = sw && await mSeriesFull(sw, force);
    return f ? { ...f, ids: [...f.ids, m.id] } : { s: m, chs: byNum(m.chapters), ids: [m.id] };
  }
  const [s, chs] = await Promise.all([load('mangaSeries', mUrl(`series/${id}/`), force), mChapters(id, force)]);
  const tw = await olyTwin(s, force);
  if (!tw) return { s, chs: byNum(chs), ids: [s.id] };
  const have = new Set(chs.map(c => c.n));
  return { s, chs: byNum([...chs, ...tw.chapters.filter(c => !have.has(c.n))]), ids: [s.id, tw.id] };
}
// one chapter from either site: { id, n, prev, next, serie: { id, title, poster }, images }
async function mChapter(cid, keep) {
  cid = String(cid);
  if (/^t\d+$/.test(cid)) { // a chapter saved under a removed source's id: resolved by its series and number
    const r = Object.values(store.manga).find(m => String(m.chapterId) === cid), d = store.downloads['manga:' + cid];
    const sid = r?.id || d?.show?.split('/').pop(), n = chNum(r?.n ?? d?.ep);
    const ch = sid && (await mSeriesFull(sid)).chs.find(x => x.n === n);
    if (!ch) throw new Error(t('unreachable'));
    cid = String(ch.id);
  }
  if (!cid.startsWith('o:')) return load('mangaChapter', mUrl(`chapters/${cid}/`), false, keep);
  const [slug, n] = cid.slice(2).split(':');
  return load('olyChapter', `${OLY}series/${slug}/${n}`, false, keep);
}

// the API hands out at most 200 chapters a page, whatever page_size asks for: fetch every page
async function mChapters(id, force) {
  const at = page => load('mangaChapters', mUrl(`series/${id}/chapters/`, { page, page_size: 200 }), force);
  const first = await at(1);
  const rest = await Promise.all(Array.from({ length: Math.ceil(first.count / 200) - 1 }, (_, i) => at(i + 2)));
  return [first, ...rest].flatMap(p => p.items);
}

async function mangaRoute([what, arg], force) {
  if (what === 'browse') return mangaBrowse(force);
  if (what === 'series') return mangaSeries(arg, force);
  if (what === 'read') return mangaReader(arg);
  return mangaHome(force);
}

// slider slides for series cards: their covers and stories (one cached request each)
async function mangaHero(items) {
  const top = await Promise.all(items.map(c => load('mangaSeries', mUrl(`series/${c.path.split('/').pop()}/`)).catch(() => null)));
  return top.filter(s => s?.cover).map(s => ({ banner: s.cover, title: s.title, desc: s.story, info: '#/manga/series/' + s.id,
    play: store.manga[s.id] && '#/manga/read/' + store.manga[s.id].chapterId }));
}

async function mangaHome(force) {
  const none = () => ({ items: [] }); // Olympus down: just MangaSwat's
  const [hot, latest, popular, fresh, oLatest] = await Promise.all([
    load('mangaList', mUrl('series/', { is_hot: true, page_size: 30 }), force),
    load('mangaLatest', mUrl('chapters/', { page_size: 60, order_by: '-created_at' }), force),
    load('mangaList', mUrl('series/', { order_by: '-views_count', page_size: 30 }), force),
    load('mangaList', mUrl('series/', { order_by: '-created_at', page_size: 30 }), force),
    olyLatest(force).catch(none),
  ]);
  heroPage(await mangaHero(hot.items.slice(0, 5)), `
      ${chips([[t('browseAll'), '#/manga/browse/1'], ...MTYPES.map(o => [mLabel(MTYPES, o[0]), '#/manga/browse/1?type=' + o[0]])])}
      ${row(t('continueReading'), continued(['manga']))}
      ${row(t('mHot'), hot.items, '#/manga/browse/1?is_hot=true')}
      ${row(t('mLatest'), mMerge([latest.items, oLatest.items]))}
      ${row(t('mPopular'), popular.items, '#/manga/browse/1?order_by=-views_count')}
      ${row(t('mNew'), fresh.items, '#/manga/browse/1')}`, () => mangaHome(true));
}

async function mangaBrowse(force) {
  const qs = location.hash.split('?')[1] || '';
  const p = new URLSearchParams(qs);
  const go = edit => { const q = new URLSearchParams(qs); edit(q); location.hash = '#/manga/browse/1' + (q.size ? '?' + q : ''); };
  const genres = await load('mangaGenres', mUrl('genres/', { page_size: 300 })).catch(() => []);
  const chips = [
    ['type', t('f_type'), MTYPES.map(o => [o[0], mLabel(MTYPES, o[0])])],
    ['status', t('f_status'), MSTATUS.map(o => [o[0], mLabel(MSTATUS, o[0])])],
    ['genres', t('f_genres'), genres],
    ['order_by', t('f_sort'), MSORT.map(([v, k]) => [v, t(k)])],
  ];
  const active = chips.filter(([k]) => p.get(k)).length + (p.get('is_hot') ? 1 : 0);
  view.innerHTML = `<div class="page flt-page"><h1>${t('manga')}</h1>
    <form class="fsearch" id="msearch">
      ${ICON.search}
      <input name="search" type="search" value="${esc(p.get('search') || '')}" placeholder="${t('mSearchPh')}" enterkeyhint="search" autocomplete="off">
    </form>
    <div class="fchips">
      ${active ? `<a class="fchip clear" href="#/manga/browse/1">${ICON.x} ${t('reset')} · ${active}</a>` : ''}
      ${p.get('is_hot') ? `<span class="fchip on">${t('mHot')}</span>` : ''}
      ${chips.map(([k, name, opts]) => { const cur = opts.find(o => o[0] === p.get(k)); return `<button class="fchip ${cur && cur[0] ? 'on' : ''}" data-k="${k}">${esc(cur && cur[0] ? cur[1] : name)}${CHEVRON}</button>`; }).join('')}
    </div>
    <div id="fres"><div class="center" style="min-height:200px"><div class="spin"></div></div></div></div>`;
  $('#msearch').onsubmit = e => { e.preventDefault(); const v = e.target.search.value.trim(); go(q => v ? q.set('search', v) : q.delete('search')); };
  $('.fchips').onclick = e => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    const [, name, opts] = chips.find(c => c[0] === k);
    pickSheet(name, k === 'order_by' ? opts : [['', t('all')], ...opts], p.get(k) || '', v => go(q => v ? q.set(k, v) : q.delete(k)));
  };

  const PER = 30, oq = olyQuery(p), seen = new Set();
  // a page of each site, merged; past the end of one site's pages, just the other's
  const at = async (page, force) => {
    const [d, o] = await Promise.all([load('mangaList', mUrl('series/', { ...Object.fromEntries(p), page, page_size: PER }), force).catch(e => page === 1 && !oq ? Promise.reject(e) : null),
      oq && olyList(oq, page, force).catch(() => null)]);
    if (!d && !o) throw new Error(t('unreachable'));
    return { items: mMerge([d?.items, o?.items], seen), pages: Math.max(1, Math.ceil((d?.count || 0) / PER), o?.pages || 0) };
  };
  const d = await at(1, force);
  if (!location.hash.startsWith('#/manga/browse')) return;
  $('#fres').innerHTML = grid(d.items);
  lazyGrid($('#fres'), d.pages, n => at(n, true));
  pageRefresh = () => mangaBrowse(true);
}

// the browse filters in Olympus's terms; null when they can't apply: its list only filters by type, and can't sort
function olyQuery(p) {
  if (p.get('genres') || p.get('status') || p.get('is_hot') || p.get('order_by')) return null;
  if (p.get('search')) return { keyword: p.get('search') };
  if (!p.get('type')) return {};
  const name = MTYPES.find(o => o[0] === p.get('type'))?.[2];
  const ar = Object.entries(O_TYPES).find(([, v]) => v === name)?.[0];
  return ar ? { type: ar } : null;
}

async function mangaSeries(id, force) {
  const { s, chs, ids } = await mSeriesFull(id, force);
  if (String(s.id) !== id) return location.replace('#/manga/series/' + s.id); // an Olympus copy of a MangaSwat series
  const path = '/manga/series/' + id, r = store.manga[id];
  const rCh = r && (chs.find(c => c.id === r.chapterId) || chs.find(c => c.n === chNum(r.n)));
  const start = rCh ? { id: rCh.id, label: t('resumeCh', chNum(r.n)) } : chs.length ? { id: chs[chs.length - 1].id, label: t('read') } : null;
  view.innerHTML = `
    <div class="det-hero"><div class="bg" style="background-image:url('${esc(img(s.cover))}')"></div>
      <div class="det">
        ${s.poster ? `<img class="poster" src="${esc(img(s.poster))}" alt="">` : ''}
        <div>
          <h1>${esc(s.title)}</h1>${s.alt ? `<div class="alt">${esc(s.alt)}</div>` : ''}
          <div class="chips">
            ${s.type ? `<span class="chip">${esc(mTypeName(s.type))}</span>` : ''}${s.status ? `<span class="chip">${esc(mLabel(MSTATUS, s.status))}</span>` : ''}
            <span class="chip">${t('views', s.views.toLocaleString(lang))}</span>
            ${s.genres.map(g => `<span class="chip">${esc(g)}</span>`).join('')}
          </div>
          <p class="desc" dir="auto">${esc(s.story)}</p>
          <div class="actions">${Ratings.site(s.rating)}${Ratings.slot({title:s.title, type:"manga"})}
            ${start ? `<a class="btn red" href="#/manga/read/${start.id}">${ICON.play} ${esc(start.label)}</a>` : ''}
            <button class="btn ghost" id="fav">${inList(path) ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList')}</button>
            <button class="btn ghost" id="rf">${ICON.refresh} ${t('refresh')}</button>
          </div>
        </div>
      </div>
    </div>
    <section class="section" id="title-cast" hidden></section>
    <div class="section"><h2>${t('chapters')} <small>${chs.length}</small>
      <div class="ep-tools"><input id="epf" placeholder="${t('jumpCh')}" type="number"><button class="btn ghost small" id="rev" aria-label="${t('reverse')}" title="${t('reverse')}">${ICON.sort}</button>
        ${selBtn('btn ghost small')}</div></h2>
      ${selBar()}
      <div class="eps" id="eps"></div></div>`;
  let rev = false;
  const shown = (f = $('#epf').value) => (rev ? [...chs].reverse() : chs).filter(c => !f || parseFloat(c.n) === +f); // the number itself: 1 is chapter 1, not 10-19
  const drawChs = () => {
    const copies = savedChs(ids);
    $('#eps').innerHTML = shown().map(c => { const own = copies.get(String(c.n)); return `<a class="ep ${store.mangaSeen[c.id] || store.mangaSeen[own] ? 'seen' : ''}
      ${r?.chapterId === c.id || (own && String(r?.chapterId) === own) ? 'last' : ''} ${own ? 'dld' : ''} ${picks?.has(String(c.id)) ? 'sel' : ''}"
      data-pick="${c.id}" href="#/manga/read/${own || c.id}">${t('chShort')} ${esc(c.n)}</a>`; }).join('');
  };
  drawChs();
  $('#epf').oninput = () => drawChs();
  $('#rev').onclick = () => { rev = !rev; drawChs(); };
  $('#fav').onclick = e => { const on = toggleList({ path, title: s.title, poster: s.poster, type: 'manga' }); e.currentTarget.innerHTML = on ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList'); };
  CastInfo.mount($('#title-cast'), [s.title, ...(s.alt || '').split(/[,،]/)], 'manga');
  // chapters' actions, on one (long-press) or several picked: mark them read or unread (both ids: the listed chapter's and
  // its saved copy's, which may come from the other site), or every one before; download them or delete their saved copies
  const pick = cids => chs.filter(c => cids.includes(String(c.id))); // newest first, as listed
  const mark = (xs, v) => {
    const copies = savedChs(ids);
    for (const x of xs) for (const k of [x.id, copies.get(String(x.n))]) if (k != null) v ? (store.mangaSeen[k] = v) : delete store.mangaSeen[k];
    persist('mangaSeen');
  };
  const acts = (cids, one) => {
    const xs = pick(cids), copies = savedChs(ids), read = one && [xs[0].id, copies.get(String(xs[0].n))].some(k => store.mangaSeen[k] === 2);
    return [
      (!one || !read) && ['read', t('markRead')],
      (!one || read) && ['unread', t('markUnread')],
      one && chs.indexOf(xs[0]) < chs.length - 1 && ['prev', t('markPrevRead')], // chs: newest first, the earlier ones after it
      xs.some(x => !copies.has(String(x.n))) && ['dl', t('downloadShort')],
      xs.some(x => copies.has(String(x.n))) && ['del', t(one ? 'delDownload' : 'delDownloads')],
      one && ['select', t('select')],
    ].filter(Boolean);
  };
  const run = async (v, cids) => {
    const xs = pick(cids), copies = savedChs(ids);
    if (v === 'select') return selectFrom(cids[0]);
    if (v === 'read' || v === 'unread') mark(xs, v === 'read' ? 2 : 0);
    if (v === 'prev') mark(chs.slice(chs.indexOf(xs[0]) + 1), 2);
    if (v === 'dl') queueChapters({ id: s.id, title: s.title, poster: s.poster }, xs.filter(x => !copies.has(String(x.n))).reverse()); // oldest first
    if (v === 'del') {
      const ds = xs.map(x => store.downloads['manga:' + copies.get(String(x.n))]).filter(Boolean);
      const what = ds.length > 1 ? t('confirmDelN', ds.length) : t('confirmDel', `${s.title} · ${t('chapter')} ${ds[0]?.ep}`);
      if (!ds.length || !await confirmSheet(what, t('confirmDelHint'), t('del'))) return;
      for (const d of ds) await removeDownload(d);
      saveDownloads();
    }
    drawChs();
  };
  const selectFrom = selectable($('#eps'), () => shown().map(c => c.id), acts, run);
  pagePress = ['.ep', a => pickSheet(`${t('chapter')} ${pick([a.dataset.pick])[0]?.n}`, acts([a.dataset.pick], true), '', v => run(v, [a.dataset.pick]))];
  pageRefresh = () => mangaSeries(id, true);
  $('#rf').onclick = () => pageRefresh().then(() => toast(t('updated')));
}

async function mangaReader(cid) {
  const dl = store.downloads['manga:' + cid], saved = dl?.state === 'done' && dl.files?.length;
  // a downloaded chapter opens from its saved copy straight away, without waiting for the site (online or not)
  const c = saved ? { id: /^\d+$/.test(cid) ? +cid : cid, n: dl.ep, prev: dl.meta?.prev, next: dl.meta?.next, serie: { id: dl.show.split('/').pop(), title: dl.title, poster: dl.poster }, images: [] }
    : await mChapter(cid);
  c.n = chNum(c.n);
  // the series as listed (an Olympus chapter may belong to a MangaSwat series); prev/next walk its merged chapter list
  // a downloaded chapter: within the series it was downloaded from (saved on the phone too, so its list also shows offline)
  const sid = String(c.serie.id), full = await mSeriesFull(dl?.show?.split('/').pop() || sid).catch(() => null), chs = full?.chs || [];
  if (full) c.serie = { id: full.s.id, title: full.s.title, poster: full.s.poster };
  const at = chs.findIndex(x => x.id === c.id || x.n === c.n);
  // a listed chapter opens its downloaded copy when there is one; offline, prev/next skip to the nearest downloaded chapter
  const copies = savedChs([...(full?.ids || []), sid, dl?.show?.split('/').pop()]), own = x => copies.get(String(x.n)) || x.id, opens = x => navigator.onLine || copies.has(String(x.n));
  if (at >= 0) { const nx = chs.slice(0, at).reverse().find(opens), pv = chs.slice(at + 1).find(opens); c.next = nx && own(nx); c.prev = pv && own(pv); }
  const pages = saved ? dl.files.map(api.fileSrc) : c.images;
  const s = c.serie;
  // every chapter resumes its own spot, by chapter id: page index + how far down that page (tall manhwa strips need the fraction)
  const r = store.manga[s.id], spots = r?.spots || (r ? { [r.chapterId]: r.page || 0 } : {}); // older saves kept one spot, the last chapter's
  const page = spots[c.id] || 0;
  store.manga[s.id] = { id: s.id, title: s.title, poster: s.poster, chapterId: c.id, n: c.n, spots, at: Date.now() };
  store.mangaSeen[c.id] ||= 1; // 1: opened, 2: read to the last page (see markRead)
  persist('manga'); persist('mangaSeen');
  const horiz = !!store.prefs.mangaH; // horizontal: one page per screen, swiped sideways
  view.innerHTML = `<div class="reader ${horiz ? 'horiz' : ''}">
    <header class="rd-head">
      <button class="icon-btn" id="back" title="${t('back')}" aria-label="${t('back')}">${ICON.back}</button>
      <div class="ttl"><a href="#/manga/series/${s.id}">${esc(s.title)}</a><small>${t('chapter')} ${esc(c.n)}</small></div>
      <span class="sp"></span><button class="icon-btn ${saved ? 'on' : ''}" id="rdl" title="${saved ? t('offline') : t('downloadShort')}">${ICON.download}</button>
    </header>
    <footer class="rd-bar">
      <div class="rd-spd" id="rspd" hidden>
        <button class="icon-btn" id="rslow" title="${t('slower')}" aria-label="${t('slower')}">${ICON.minus}</button>
        <input type="range" id="rspdR" min="0.5" max="10" step="0.5" aria-label="${t('autoScroll')}">
        <button class="icon-btn" id="rfast" title="${t('faster')}" aria-label="${t('faster')}">${ICON.plus}</button>
        <b id="rspdN"></b>
      </div>
      ${horiz ? '' : `<button class="icon-btn" id="rauto" title="${t('autoScroll')}" aria-label="${t('autoScroll')}">${ICON.play}</button>`}
      <button class="icon-btn" id="rlock" title="${t('lockUi')}" aria-label="${t('lockUi')}">${ICON.lock}</button>
      <button class="icon-btn ${horiz ? 'on' : ''}" id="rmode" title="${t('readMode')}">${horiz ? ICON.horiz : ICON.vert}</button>
      <span class="rd-sep"></span>
      <div class="rd-nav">
        <button class="icon-btn" id="rprev" title="${t('prevCh')}" ${c.prev ? '' : 'disabled'}>${ICON.prev}</button>
        ${chs.length ? `<button type="button" id="rsel"><span>${t('chShort')} ${esc(c.n)}</span>${ICON.caretUp}</button>` : ''}
        <button class="icon-btn" id="rnext" title="${t('nextCh')}" ${c.next ? '' : 'disabled'}>${ICON.next}</button>
      </div>
    </footer>
    <button type="button" class="rd-unlock" id="runlock" title="${t('unlockUi')}" aria-label="${t('unlockUi')}">${ICON.unlock}</button>
    ${horiz ? '' : '<div class="rd-scroll" id="rscroll"><i></i></div>'}
    <div class="rd-zoom"><div class="rd-pages">${pages.map((src, i) => (h => horiz ? `<div class="pg">${h}</div>` : h)(`<img src="${esc(src)}" alt="" ${i > 2 && i > page ? 'loading="lazy"' : ''}>`)).join('')
      || `<div class="empty"><b>${t('noImages')}</b></div>`}</div></div>
    <div class="rd-end">
      <span>${t('endOfChapter')} ${esc(c.n)}</span>
      ${c.next ? `<button class="btn red" id="rnext2">${t('nextCh')} ${ICON.next}</button>` : `<a class="btn ghost" href="#/manga/series/${s.id}">${t('chapters')}</a>`}
    </div>
  </div>`;
  // chapter to chapter replaces the history entry, so back leaves the reader (like the video player)
  const open = id => location.replace('#/manga/read/' + id);
  $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/manga/series/' + s.id));
  if (c.prev) $('#rprev').onclick = () => open(c.prev);
  if (c.next) $('#rnext').onclick = $('#rnext2').onclick = () => open(c.next);
  // chapter list in a bottom sheet, scrolled to the open chapter; read ones are marked
  if ($('#rsel')) $('#rsel').onclick = () => {
    pickSheet(t('chapters'), chs.map(x => [String(own(x)), `${t('chapter')} ${x.n}`]), String(at >= 0 ? own(chs[at]) : c.id), open);
    // read ones dimmed; downloaded ones (from either site) marked, and offline the rest (which can't open) faded
    document.querySelectorAll('.sheet-opt').forEach((o, i) => {
      const x = chs[i], has = copies.has(String(x.n));
      o.classList.toggle('seen', !!(store.mangaSeen[x.id] || store.mangaSeen[o.dataset.v]));
      o.classList.toggle('off', !has && !navigator.onLine);
      if (store.mangaSeen[x.id] === 2 || store.mangaSeen[o.dataset.v] === 2) o.firstElementChild.insertAdjacentHTML('beforeend', `<i class="rd-badge">${t('chRead')}</i>`);
      if (has) o.firstElementChild.insertAdjacentHTML('beforeend', `<i class="dl-mark" title="${t('offline')}">${ICON.download}</i>`);
    });
    document.querySelector('.sheet-opt.on')?.scrollIntoView({ block: 'center' });
  };
  $('#rmode').onclick = () => { store.prefs.mangaH = !horiz; persist('prefs'); mangaReader(cid); };
  if (!horiz) autoScroll();
  $('#rdl').onclick = () => saved ? toast(t('dlDone')) : queueChapters(s, [{ id: c.id, n: c.n }]);
  // lock: the bars stay hidden (chapter to chapter); a faint unlock button, dragged anywhere (remembered), brings them back
  const reader = $('.reader'), ul = $('#runlock');
  // phones: the status bar goes and comes back with the bars (shown again on any other page: route)
  new MutationObserver(() => api.statusBar?.(!reader.matches('.hide-ui, .locked'))).observe(reader, { attributes: true, attributeFilter: ['class'] });
  const lock = on => { reader.classList.toggle('locked', rdLocked = on); reader.classList.remove('hide-ui'); };
  const place = ([x, y] = store.prefs.unlockAt || [.5, .85]) => { ul.style.left = x * 100 + '%'; ul.style.top = y * 100 + '%'; };
  lock(rdLocked); place();
  $('#rlock').onclick = () => lock(true);
  let p0, moved;
  ul.onpointerdown = e => { p0 = [e.clientX, e.clientY]; moved = false; ul.setPointerCapture(e.pointerId); };
  ul.onpointermove = e => {
    if (!ul.hasPointerCapture(e.pointerId) || !moved && Math.hypot(e.clientX - p0[0], e.clientY - p0[1]) < 8) return;
    moved = true;
    place(store.prefs.unlockAt = [Math.min(innerWidth - 28, Math.max(28, e.clientX)) / innerWidth, Math.min(innerHeight - 28, Math.max(28, e.clientY)) / innerHeight]);
  };
  ul.onpointerup = () => moved && persist('prefs');
  ul.onclick = () => moved ? (moved = false) : lock(false); // the click that ends a drag doesn't unlock
  // scrollbar (vertical mode): the thumb follows the scroll (see the scroll listener); dragging it or tapping the track jumps there
  const sb = $('#rscroll');
  if (sb) sb.onpointerdown = e => {
    const go = e => { const r = sb.getBoundingClientRect(); scrollTo(scrollX, Math.min(1, Math.max(0, (e.clientY - r.top - 22) / (r.height - 44))) * (document.documentElement.scrollHeight - innerHeight)); };
    sb.setPointerCapture(e.pointerId);
    go(e);
    sb.onpointermove = go;
    sb.onpointerup = sb.onpointercancel = () => (sb.onpointermove = null);
  };
  // resume: keep the saved spot at mid-screen while the pages above it load and change height, until the reader scrolls themselves
  const imgs = [...document.querySelectorAll('.rd-pages img')], target = imgs[Math.floor(page)];
  readerPos = { id: s.id, cid: c.id, imgs, pinning: false, horiz };
  const box = $('.rd-pages');
  readerZoom(box, horiz);
  if (horiz) {
    scrollTo(0, 0);
    box.tabIndex = -1; box.focus(); // arrow keys page through on desktop
    const slides = imgs.map(i => i.parentElement); // each page scrolls on its own when taller than the screen
    slides[Math.floor(page)]?.scrollIntoView({ inline: 'start', block: 'nearest' });
    const obs = new IntersectionObserver(es => es.forEach(e => {
      const m = store.manga[s.id];
      if (!e.isIntersecting || !m || !e.target.isConnected) return;
      if ((m.spots[c.id] = slides.indexOf(e.target)) === slides.length - 1) markRead(c.id);
      clearTimeout(readerSave);
      readerSave = setTimeout(() => persist('manga'), 300);
    }), { root: box, threshold: .6 });
    slides.forEach(i => obs.observe(i));
  } else if (page && target) {
    const pin = () => scrollTo(0, target.getBoundingClientRect().top + scrollY + (page % 1) * target.offsetHeight - innerHeight / 2);
    const stop = () => { readerPos.pinning = false; imgs.forEach(i => i.removeEventListener('load', pin)); ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(e => removeEventListener(e, stop)); };
    imgs.slice(0, Math.floor(page) + 1).forEach(i => i.addEventListener('load', pin));
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(e => addEventListener(e, stop));
    readerPos.pinning = true;
    pin();
  }
}

// auto-scroll (vertical mode): the page glides down at 0.5x-10x (40px/s per 1x, remembered). Holding the button opens
// the speed row (slider, -/+ in half steps) above the bar; playing hides it again. A tap on the pages, the end of the
// chapter or leaving the reader pauses it; the play button resumes.
function autoScroll() {
  const btn = $('#rauto'), box = $('.rd-zoom'), range = $('#rspdR');
  let run = 0, y = 0, last = 0, open = false, held = false, holdT;
  const speed = () => store.prefs.mangaSpeed || 3;
  const draw = () => {
    btn.classList.toggle('on', !!run);
    btn.innerHTML = run ? ICON.pause : ICON.play;
    $('#rspd').hidden = !open;
    range.value = speed();
    $('#rspdN').textContent = speed() + 'x';
  };
  const stop = () => { cancelAnimationFrame(run); run = 0; if (btn.isConnected) draw(); }; // a tap's own bar toggle brings the bars back
  const step = now => {
    if (!btn.isConnected) return stop();
    if (Math.abs(scrollY - y) > 2) y = scrollY; // the reader scrolled by hand: carry on from there
    y += speed() * 40 * Math.min(now - last, 100) / 1000; // y keeps the fraction: slow speeds move under a pixel a frame
    last = now;
    scrollTo(0, y);
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1) return stop();
    run = requestAnimationFrame(step);
  };
  // a long press opens the speed row; the click that ends it doesn't also play
  btn.onpointerdown = () => { held = false; holdT = setTimeout(() => { held = true; open = !open; draw(); navigator.vibrate?.(15); }, 450); };
  btn.onpointerup = btn.onpointerleave = btn.onpointercancel = () => clearTimeout(holdT);
  btn.oncontextmenu = e => e.preventDefault(); // Android's long-press menu
  btn.onclick = () => {
    if (held) return held = false;
    if (run) return stop();
    y = scrollY; last = performance.now(); open = false;
    run = requestAnimationFrame(step);
    draw();
  };
  const set = v => { store.prefs.mangaSpeed = Math.min(10, Math.max(.5, Math.round(v * 2) / 2)); draw(); };
  range.oninput = () => set(+range.value); // live while dragging, saved on release
  range.onchange = () => persist('prefs');
  $('#rslow').onclick = () => { set(speed() - .5); persist('prefs'); };
  $('#rfast').onclick = () => { set(speed() + .5); persist('prefs'); };
  box.addEventListener('click', () => run && stop());
}

// zoom: pinch (1-4x, around the fingers), double-tap (2.5x at that spot / back to 1x), ctrl+wheel on desktop.
// Only the pages zoom (the WebView's own zoom would blow up the bars too): vertical mode widens the page column
// inside a sideways scroller (.rd-zoom) and the window scrolls down as usual; horizontal mode widens each page
// inside its own slide, which pans both ways. A single tap still shows/hides the bars, once it's clear it wasn't a double tap.
function readerZoom(box, horiz) {
  const reader = $('.reader'), zbox = $('.rd-zoom');
  let z = 1;
  const set = (nz, fx, fy) => { // keep the content under (fx, fy) — viewport coords — in place
    nz = Math.min(4, Math.max(1, nz));
    if (nz === z) return;
    const k = nz / z;
    if (horiz) {
      const pg = document.elementFromPoint(fx, fy)?.closest('.pg');
      const r = pg?.getBoundingClientRect(), x = pg && pg.scrollLeft + fx - r.left, y = pg && pg.scrollTop + fy - r.top;
      reader.style.setProperty('--z', z = nz);
      if (pg) { pg.scrollLeft = x * k - (fx - r.left); pg.scrollTop = y * k - (fy - r.top); }
    } else {
      const top = box.getBoundingClientRect().top + scrollY, x = zbox.scrollLeft + fx, y = scrollY + fy - top;
      reader.style.setProperty('--z', z = nz);
      zbox.scrollLeft = x * k - fx;
      scrollTo(scrollX, top + y * k - fy);
    }
    reader.classList.toggle('zoomed', z > 1);
  };
  // pinch
  let d0 = 0, z0 = 1;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  zbox.addEventListener('touchstart', e => { if (e.touches.length === 2) { d0 = dist(e.touches); z0 = z; } }, { passive: true });
  zbox.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !d0) return;
    e.preventDefault(); // no page scroll / page turn while pinching
    set(z0 * dist(e.touches) / d0, ...mid(e.touches));
  }, { passive: false });
  zbox.addEventListener('touchend', e => { if (e.touches.length < 2) d0 = 0; });
  // desktop
  zbox.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); set(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); } }, { passive: false });
  // taps: double = zoom, single in the middle 70% = bars (taps on the edges are left alone so reading isn't interrupted)
  let last = 0, tapT;
  const inMid = (v, max) => v > max * .15 && v < max * .85;
  box.onclick = e => {
    if (Date.now() - last < 300) {
      clearTimeout(tapT); last = 0;
      return set(z > 1 ? 1 : 2.5, e.clientX, e.clientY);
    }
    last = Date.now();
    if (inMid(e.clientX, innerWidth) && inMid(e.clientY, innerHeight)) tapT = setTimeout(() => reader.classList.toggle('hide-ui'), 300);
  };
}

// a chapter counts as read once its last page is reached
const markRead = id => store.mangaSeen[id] !== 2 && (store.mangaSeen[id] = 2, persist('mangaSeen'));

// locked reader: the first back only warns, a second one within 2s leaves
let lockBackAt = 0;
const lockedBack = () => {
  if (!document.querySelector('.reader.locked') || Date.now() - lockBackAt < 2000) return false;
  lockBackAt = Date.now();
  toast(t('backAgain'));
  return true;
};

// reading: the bars slide away on any scroll past the top and come back only on a center tap
let readerY = 0, readerSave, readerPos, rdLocked = false, sbIdle;
addEventListener('scroll', () => {
  const r = document.querySelector('.reader');
  if (r && scrollY !== readerY) r.classList.toggle('hide-ui', scrollY > 80);
  r?.style.setProperty('--sp', scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)); // scrollbar thumb
  if (r) { r.classList.add('scrolling'); clearTimeout(sbIdle); sbIdle = setTimeout(() => r.classList.remove('scrolling'), 1500); } // the thumb fades once scrolling stops
  readerY = scrollY;
  // remember the spot at the middle of the screen: page index + fraction down it; kept in memory now, written to disk once scrolling settles
  const m = r && !readerPos?.pinning && !readerPos.horiz && readerPos.imgs[0]?.isConnected && store.manga[readerPos.id];
  if (!m) return;
  // the last page loaded (unloaded pages are 0px tall, so all "on screen") and scrolled to its bottom
  const end = readerPos.imgs.at(-1);
  if (end.naturalHeight && end.getBoundingClientRect().bottom <= innerHeight) markRead(readerPos.cid);
  const mid = innerHeight / 2, i = readerPos.imgs.findLastIndex(img => img.getBoundingClientRect().top < mid);
  if (i < 0) return;
  const b = readerPos.imgs[i].getBoundingClientRect();
  m.spots[readerPos.cid] = +(i + Math.min(.999, (mid - b.top) / b.height)).toFixed(3);
  clearTimeout(readerSave);
  readerSave = setTimeout(() => persist('manga'), 300);
}, { passive: true });
