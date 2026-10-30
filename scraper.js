// Scrapes witanime.site HTML (Laravel + Livewire, server-rendered) into plain objects,
// cached in the app DB so pages open instantly and offline.
const SITE = 'https://witanime.site';
const HOUR = 3600e3;

const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const parse = html => new DOMParser().parseFromString(html, 'text/html');
const pathOf = href => { try { return new URL(href, SITE).pathname; } catch { return ''; } };

// Any poster card on the site: /anime/x, /movie/x or /watch/x/ep with an <img> and <h3>.
function parseCards(root) {
  const seen = new Set(), out = [];
  for (const a of root.querySelectorAll('a[href]')) {
    const p = pathOf(a.getAttribute('href'));
    const m = p.match(/^\/(anime|movie|watch)\/([^/]+)(?:\/([^/]+))?$/);
    const img = a.querySelector('img'), ttl = a.querySelector('h3, h2, h4');
    const poster = img?.getAttribute('data-src') || img?.getAttribute('src');
    if (!m || !poster || !ttl || seen.has(p)) continue;
    seen.add(p);
    const spans = [...a.querySelectorAll('[dir=ltr] span')].map(txt);
    const badge = [...a.querySelectorAll('div, span')].map(txt).find(t => /الحلقة|TV|Movie|OVA|ONA|Special|فيلم/i.test(t) && t.length < 20);
    out.push({
      path: p,
      type: m[1] === 'watch' ? 'episode' : m[1],
      title: txt(ttl),
      poster,
      rating: spans.find(s => /^\d+(\.\d+)?$/.test(s) && s.includes('.')) || '',
      year: spans.find(s => /^(19|20)\d\d$/.test(s)) || '',
      badge: (badge || '').replace('الحلقة', 'EP'),
      ep: m[1] === 'watch' ? m[3] : null,
      showPath: m[1] === 'watch' ? (m[2] === 'movie' ? `/movie/${m[3]}` : `/anime/${m[2]}`) : p,
    });
  }
  return out;
}

// sorted listings paginate with Livewire buttons (wire:click="gotoPage(N)") instead of links
const maxPage = (doc, base) => Math.max(1, ...[...doc.querySelectorAll('a[href]')]
  .map(a => pathOf(a.getAttribute('href')).match(new RegExp(`^${base}/page/(\\d+)$`))?.[1]).filter(Boolean).map(Number),
  ...[...doc.querySelectorAll('[wire\\:click^="gotoPage("]')].map(b => +b.getAttribute('wire:click').match(/\d+/)[0]));

const parsers = {
  home(doc) {
    const hero = [...doc.querySelectorAll('[data-hero-slide]')].map(s => {
      const link = [...s.querySelectorAll('a[href]')].map(a => pathOf(a.getAttribute('href'))).find(p => /^\/(anime|movie)\//.test(p));
      const watch = [...s.querySelectorAll('a[href]')].map(a => pathOf(a.getAttribute('href'))).find(p => p.startsWith('/watch/'));
      const ps = [...s.querySelectorAll('p')].map(txt).sort((a, b) => b.length - a.length);
      const img = [...s.querySelectorAll('img')].find(i => /banners|posters/.test(i.getAttribute('data-src') || i.src));
      return { path: link || '', watch: watch || '', title: txt(s.querySelector('h2, h1, .text-balance')) || img?.alt || '', desc: ps[0] || '', banner: img?.getAttribute('data-src') || img?.getAttribute('src') || '' };
    }).filter(h => h.path && h.banner);
    const rows = [];
    for (const h2 of doc.querySelectorAll('main h2, h2')) {
      let box = h2.parentElement;
      for (let i = 0; i < 6 && box && !parseCards(box).length; i++) box = box.parentElement;
      const items = box ? parseCards(box) : [];
      if (items.length && !rows.some(r => r.items[0].path === items[0].path)) rows.push({ title: txt(h2), items });
    }
    return { hero, rows };
  },

  list(doc, url) {
    const base = pathOf(url).replace(/\/page\/\d+$/, '');
    return { items: parseCards(doc.querySelector('main') || doc), pages: maxPage(doc, base) };
  },

  details(doc, url) {
    const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent); } catch { return null; } }).find(j => j?.['@type'] === 'TVSeries' || j?.['@type'] === 'Movie') || {};
    const og = p => doc.querySelector(`meta[property="og:${p}"]`)?.getAttribute('content') || '';
    const h1 = doc.querySelector('main h1, h1');
    const box = h1?.closest('section') || doc.querySelector('main') || doc;
    const alt = (h1?.nextElementSibling?.tagName === 'P' ? txt(h1.nextElementSibling) : '') || [ld.alternateName].flat().filter(Boolean)[0] || '';
    const meta = h1?.parentElement?.querySelector(':scope > div');
    const ps = [...(h1?.parentElement?.querySelectorAll(':scope > p') || [])].filter(p => txt(p) !== alt);
    const desc = ps.map(txt).sort((a, b) => b.length - a.length)[0] || ld.description || og('description');
    const descEl = ps.find(p => txt(p) === desc);
    const genres = [...(descEl?.nextElementSibling?.querySelectorAll(':scope > span') || [])].map(txt);
    if (!genres.length && ld.genre) genres.push(...[ld.genre].flat());
    const info = [...box.querySelectorAll('div')]
      .filter(d => d.children.length === 2 && d.children[0].tagName === 'SPAN' && d.children[1].tagName === 'P')
      .map(d => [txt(d.children[0]), txt(d.children[1])]);
    const imgs = [...box.querySelectorAll('img')].map(i => i.getAttribute('data-src') || i.getAttribute('src'));
    const trailer = [...doc.querySelectorAll('template')].map(t => t.content.querySelector('iframe[src*="youtube"]')?.src).find(Boolean)
      || doc.querySelector('iframe[src*="youtube"]')?.src || '';

    const seen = new Set(), episodes = [];
    for (const a of doc.querySelectorAll('a[href*="/watch/"]')) {
      const p = pathOf(a.getAttribute('href'));
      if (seen.has(p)) continue;
      seen.add(p);
      const last = p.split('/').pop();
      episodes.push({ path: p, ep: p.startsWith('/watch/movie/') ? 'Movie' : last });
    }
    const num = e => parseFloat(e.ep);
    if (episodes.every(e => !isNaN(num(e)))) episodes.sort((a, b) => num(a) - num(b));

    const self = pathOf(url);
    const ldImgs = [ld.image].flat().filter(Boolean);
    return {
      path: self, title: txt(h1) || ld.name || og('title'), alt, desc, genres, info, trailer,
      tags: meta ? [...meta.children].map(txt).filter(Boolean) : [],
      poster: imgs.find(s => s?.includes('/posters/')) || ldImgs.find(s => s.includes('/posters/')) || og('image') || '',
      banner: imgs.find(s => s?.includes('/banners/')) || ldImgs.find(s => s.includes('/banners/')) || imgs[0] || og('image') || '',
      episodes,
      related: parseCards(doc).filter(c => c.path !== self && c.type !== 'episode'),
    };
  },
};

// the home page's "latest episodes" row pages through /new-episodes?page=N: { page, html, hasOlder }
// the site gives no page count: pages is one past the current while older ones exist
parsers.newEpisodes = (text, url) => {
  const d = JSON.parse(text), page = +new URL(url, SITE).searchParams.get('page');
  return { items: parseCards(parse(d.html || '')), pages: page + (d.hasOlder ? 1 : 0) };
};

// animeschedule.net: the anime schedule. Its timetable (this week, Monday to Sunday), one entry per show (by its slug, "route"):
// its Japanese airing (raw) over sub, then dub. at: ISO time with offset; ep: the episode number
const AS = 'https://animeschedule.net';
parsers.airTimes = doc => {
  const rank = { raw: 0, sub: 1, dub: 2 }, best = {};
  for (const s of doc.querySelectorAll('.timetable-column-show[route]')) {
    const route = s.getAttribute('route'), at = s.querySelector('time.show-air-time')?.getAttribute('datetime'), r = rank[s.querySelector('[airType]')?.getAttribute('airType')] ?? 3;
    if (at && !(best[route]?.r <= r)) best[route] = { route, title: txt(s.querySelector('.show-title-bar')), at, r,
      poster: s.querySelector('img[data-src]')?.getAttribute('data-src') || s.querySelector('img.show-poster')?.getAttribute('src'),
      ep: txt(s.querySelector('.show-episode')).replace(/^\D+/, '') };
  }
  return Object.values(best);
};
// a title's words as both sites can agree on them: "2nd Season" / "Season 2" / "II" / a last "2" -> s2, "Cour 2" / "Part 2" /
// "2nd Cour" -> p2 (season and part 1 dropped), long vowels shortened (Reijou / Reijo, Juuou / Jyu Oh)
const airWords = s => ` ${norm(s)} `
  .replace(/ (\d+)(?:st|nd|rd|th) season(?= )| season ?(\d+)(?= )/g, (_, a, b) => ` s${a || b}`)
  .replace(/ (?:cour|part) (\d+)(?= )| (\d+)(?:st|nd|rd|th) cour(?= )/g, (_, a, b) => ` p${a || b}`)
  .replace(/ (ii|iii|\d)(?= $)/, (_, n) => ` s${n[0] === 'i' ? n.length : n}`)
  .replace(/ [sp]1(?= )/g, '')
  .replace(/jy/g, 'j').replace(/uu/g, 'u').replace(/o[uh]/g, 'o').split(' ').filter(Boolean);
// how alike two titles are, 0-1: 1 for the same words; 0 for another season or part; else the words of one found in the
// other, over the longer one's count (a word matching a longer one it starts: Ranma1 / Ranma)
const airScore = (a, b) => {
  const x = airWords(a), y = airWords(b), part = l => l.filter(w => /^[sp]\d+$/.test(w)).sort().join();
  if (x.join('') === y.join('')) return 1;
  if (part(x) !== part(y)) return 0;
  const like = (u, v) => u === v || u.length >= 4 && v.length >= 4 && (u.startsWith(v) || v.startsWith(u));
  return x.filter(u => y.some(v => like(u, v))).length / Math.max(x.length, y.length);
};

// ---------- animerco: backup servers for the same episode ----------
// Only witanime's catalog is shown (so no title is ever listed twice); animerco is just searched for the
// matching episode, and its servers are offered after witanime's.
const AR = 'https://eva.animerco.org';
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
// "Black Clover 2nd Season" -> { base: 'Black Clover', season: 2 }. null for later cours/parts: their episode numbering can't be mapped.
function splitSeason(title) {
  if (/\b(?:cour|part)\s*[2-9]\b/i.test(title)) return null;
  let season = 1;
  const base = title
    .replace(/\b(?:(\d+)(?:st|nd|rd|th)|(first|second|third|fourth|fifth|sixth))\s+season\b|\bseason\s+(\d+)\b/i,
      (_, n, w, n2) => { season = +(n || n2) || ORD[w.toLowerCase()]; return ''; })
    .replace(/\b(?:cour|part)\s*1\b/i, '').replace(/[\s:\-–]+$/, '').trim();
  return { base, season };
}
// share of words two titles have in common
const similar = (a, b) => {
  const x = new Set(norm(a).split(' ')), y = new Set(norm(b).split(' '));
  return [...x].filter(t => y.has(t)).length / new Set([...x, ...y]).size;
};
const numbered = (doc, sel) => Object.fromEntries([...doc.querySelectorAll(`li[data-number] ${sel}`)].map(a => [a.closest('li').dataset.number, a.href]));
Object.assign(parsers, {
  arSearch: doc => [...doc.querySelectorAll('a[href]')].map(a => ({ url: a.href, title: txt(a) }))
    .filter(r => /\/(animes|movies)\/[^/]+\/$/.test(r.url) && r.title && !/^\d+(\.\d+)?$/.test(r.title)),
  arShow: doc => numbered(doc, 'a[href*="/seasons/"]'),
  arSeason: doc => numbered(doc, 'a[href*="/episodes/"]'),
});

const arPages = new Map(); // episode page URL -> { at, html (a promise) }
async function animerco(title, alt, ep, movie) {
  const parts = movie ? { base: title, season: 1 } : splitSeason(title);
  if (!parts) return [];
  const names = [parts.base, movie ? alt : alt && splitSeason(alt)?.base].filter(Boolean);
  let best = null, score = 0;
  for (const name of names) {
    for (const r of await load('arSearch', `${AR}/?s=${encodeURIComponent(name)}`)) {
      const s = r.url.includes(movie ? '/movies/' : '/animes/') ? similar(r.title, name) : 0;
      if (s > score) [best, score] = [r, s];
    }
    if (score === 1) break;
  }
  if (score < .75) return []; // not confident it's the same show: better no backup than the wrong one
  let page = best.url;
  if (!movie) {
    const season = (await load('arShow', page))[parts.season];
    if (!season) return [];
    const n = String(parseFloat(ep));
    page = (await load('arSeason', season))[n] || (await load('arSeason', season, true))[n]; // new episode? refetch once
    if (!page) return [];
  }
  // server links are signed and expire within the hour: the episode page is only kept in memory, for half of that
  const hit = arPages.get(page);
  if (!(Date.now() - hit?.at < 30 * 60e3)) arPages.set(page, { at: Date.now(), html: api.fetch(page).catch(e => (arPages.delete(page), Promise.reject(e))) });
  return [...parse(await arPages.get(page).html).querySelectorAll('ul.server-list a[data-embed-url]')]
    .map(a => ({ label: txt(a.querySelector('.server')), url: a.dataset.embedUrl }));
}

// ---------- WeCima: more backup servers, for anime (here) and films (cinema.js) ----------
// Never listed either. Its pages sit behind Cloudflare's check, which lets a request through when it names the site as
// its referrer (main.js and mobile.js do), so none of its pages, nor their pop-up ads, is ever opened: they're only read for links.
const WC = 'https://wecima.singles';
parsers.wcSearch = doc => [...doc.querySelectorAll('.GridItem a[href][title]')].map(a => ({ url: a.getAttribute('href'), title: a.getAttribute('title') }));
const wcSearch = q => load('wcSearch', `${WC}/?s=${encodeURIComponent(q)}`);
const wcLinks = async url => {
  const doc = parse(await api.fetch(url));
  return { servers: [...doc.querySelectorAll('li[data-watch]')].map(li => li.dataset.watch).filter(u => u.startsWith('https://')),
    downloads: [...doc.querySelectorAll('.List--Download--Wecima--Single a[href]')].map(a => a.getAttribute('href')).filter(u => u.startsWith('https://')) };
};
const AR_NTH = ['الاول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
// "انمي Kusuriya no Hitorigoto الموسم الثاني الحلقة 4 مترجمة" -> { base: 'Kusuriya no Hitorigoto', season: 2, ep: '4' }
const wcEpisode = title => {
  const m = title.replace(/[أإآ]/g, 'ا').match(/^انمي\s+(.+?)(?:\s+الموسم\s+(\S+))?\s+الحلقة\s+(\d+(?:\.\d+)?)/);
  return m && { base: m[1], season: m[2] ? +m[2] || AR_NTH.indexOf(m[2]) + 1 : 1, ep: m[3] };
};
// its anime films are listed like any film ("فيلم Suzume no Tojimari 2022 مترجم اون لاين")
async function wecima(title, alt, ep, movie) {
  const parts = movie ? { base: title, season: 1 } : splitSeason(title);
  if (!parts) return [];
  const n = String(parseFloat(ep));
  for (const name of [parts.base, movie ? alt : alt && splitSeason(alt)?.base].filter(s => norm(s))) { // latin names only: similar() ignores the rest
    const hit = (await wcSearch(movie ? name : `${name} الحلقة ${n}`)).find(r => {
      if (movie) return /^فيلم\s/.test(r.title) && similar(edTitle(r.title).title, name) >= .75;
      const e = wcEpisode(r.title);
      return e && e.season === parts.season && e.ep === n && similar(e.base, name) >= .75;
    });
    if (hit) return (await wcLinks(hit.url)).servers.map(url => ({ label: hostName(url), url }));
  }
  return [];
}

// ---------- ristoanime: more backup servers, for series' episodes ----------
// Never listed either. Its own search only finds whole series, and files some under other names ("Bleach" season 4 for
// witanime's "Bleach: Sennen Kessen-hen - Kashin-tan"), so WordPress's API is searched for the episode's own post instead
// ("انمي Black Clover الموسم 2 الحلقة 4 مترجمة اون لاين"); its servers sit on the episode's /watch page.
const RA = 'https://ristoanime.me';
async function ristoanime(title, alt, ep, movie) {
  const parts = !movie && splitSeason(title);
  if (!parts) return []; // films: wecima covers them
  const n = String(parseFloat(ep)), named = parts.base !== title.trim(); // named: witanime's title says which season
  for (const name of [parts.base, alt && splitSeason(alt)?.base].filter(s => norm(s))) { // latin names only: similar() ignores the rest
    const hits = JSON.parse(await api.fetch(`${RA}/wp-json/wp/v2/posts?per_page=100&_fields=link,title&search=${encodeURIComponent(`${name} ${n}`)}`)).map(p => {
      const m = txt(parse(p.title?.rendered || '').body).replace(/[أإآ]/g, 'ا').match(/^انمي\s+(.+?)(?:\s+الموسم\s+(\S+))?\s+الحلقة\s+(\d+(?:\.\d+)?)/);
      return m && m[3] === n && similar(m[1], name) >= .75 && { url: p.link, season: m[2] ? +m[2] || AR_NTH.indexOf(m[2]) + 1 : 1 };
    }).filter(Boolean);
    // its season numbers can differ from witanime's split ones: an unnamed season takes the only one it has
    const hit = hits.find(h => h.season === parts.season) || (!named && new Set(hits.map(h => h.season)).size === 1 && hits[0]);
    if (!hit) continue;
    return [...parse(await api.fetch(hit.url.replace(/\/?$/, '/watch'))).querySelectorAll('li[data-watch]')]
      .map(li => li.dataset.watch).filter(u => u.startsWith('https://')).map(url => ({ label: hostName(url), url }));
  }
  return [];
}

// ---------- kitsu: episodes' names and stills (witanime lists numbers only) ----------
const KITSU = 'https://kitsu.io/api/edge';
const fold = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
parsers.kitsuFind = j => (j.data || []).map(a => ({ id: a.id, names: [a.attributes.canonicalTitle, ...Object.values(a.attributes.titles || {})].filter(Boolean).map(fold) }));
parsers.kitsuEps = j => ({ count: j.meta?.count || 0, eps: (j.data || []).map(({ attributes: a }) =>
  ({ n: String(a.number), name: a.canonicalTitle || a.titles?.en_us || a.titles?.en || a.titles?.en_jp || '', thumb: a.thumbnail?.original || '' })) });
// { "1": { name, thumb } } for a show, found on kitsu by one of its names (only an exact one: a near miss is often another season)
async function episodeInfo(names) {
  const want = names.map(fold).filter(Boolean);
  if (!want.length) return {};
  const hit = (await load('kitsuFind', `${KITSU}/anime?filter[text]=${encodeURIComponent(names[0])}&page[limit]=5&fields[anime]=canonicalTitle,titles`, false, true))
    .find(a => a.names.some(n => want.includes(n)));
  if (!hit) return {};
  const page = o => load('kitsuEps', `${KITSU}/anime/${hit.id}/episodes?sort=number&page[limit]=20&page[offset]=${o}&fields[episodes]=number,canonicalTitle,titles,thumbnail`, false, true);
  const pages = [await page(0)];
  // ponytail: kitsu gives 20 a page, so a 1000-episode show is 50 requests (once, then cached); 5 at a time to stay polite
  for (let o = 20; o < pages[0].count; o += 100)
    pages.push(...await Promise.all([0, 20, 40, 60, 80].filter(d => o + d < pages[0].count).map(d => page(o + d).catch(() => ({ eps: [] })))));
  return Object.fromEntries(pages.flatMap(p => p.eps).map(e => [e.n, e]));
}

// Everything scraped is kept for 90 days and shown straight from the cache, but the site is asked again on
// every visit (at most once a minute per page); a changed page is saved and the current view redrawn.
// force=true waits for the site instead.
const KEEP = 90 * 24 * HOUR, RECHECK = 60e3;
let cache = null, saveT = null, onChange = null;
const used = new Set(), checking = new Set(), inflight = new Map(); // URLs the current view was built from; background checks in flight; deduplicated live fetches
const viewed = new Map(); // the current view's own pages (url -> kind), asked again by recheck(); not keep's extras (kitsu's 20-episode pages)
// bumped by newView(): a load started for a page the user already left never settles, so a slow page can't draw
// over the one that replaced it (and leave the nav highlighting a different page). keep=true opts out (background work).
let gen = 0;
const never = new Promise(() => {});
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.set('pages', cache), 1000); };

function fetchPage(kind, url) {
  let p = inflight.get(url);
  if (!p) {
    p = api.fetch(url).then(text => {
      const isJson = /^(manga|kitsu)/.test(kind);
      const data = parsers[kind](isJson ? JSON.parse(text) : kind === 'newEpisodes' ? text : parse(text), url);
      cache[url] = { at: Date.now(), data };
      save();
      return data;
    }).finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p;
}
async function load(kind, url, force = false, keep = false) {
  const g = gen, fresh = data => (keep || g === gen ? data : never);
  if (!cache) { // drop what wasn't confirmed by the site in 90 days
    cache = (await api.get('pages')) || {};
    for (const [u, e] of Object.entries(cache)) if (!(Date.now() - e.at < KEEP)) delete cache[u];
    if (!keep && g !== gen) return never;
  }
  used.add(url);
  if (!keep) viewed.set(url, kind);
  const hit = cache[url];
  if (!hit || force) {
    try { return fresh(await fetchPage(kind, url)); }
    catch (e) { if (!keep && g !== gen) return never; if (hit) return hit.data; throw e; } // offline / site down: serve the saved copy
  }
  if (!checking.has(url) && Date.now() - (hit.checked || hit.at) > RECHECK) {
    checking.add(url);
    hit.checked = Date.now();
    fetchPage(kind, url)
      .then(data => JSON.stringify(data) !== JSON.stringify(hit.data) && used.has(url) && onChange?.())
      .catch(() => {}) // offline: keep the saved copy
      .finally(() => checking.delete(url));
  }
  return hit.data;
}

window.scraper = {
  home: force => load('home', '/', force),
  airTimes: force => load('airTimes', AS + '/', force).then(a => (Array.isArray(a) ? a : [])), // [] : an older cached format
  airScore,
  AS,
  // base may carry a query (`/browse?sort=Most Viewed`); the page number goes before it
  list(base, page = 1, force) {
    const [p, q] = base.split('?');
    return load('list', (page > 1 ? `${p}/page/${page}` : p) + (q ? '?' + q : ''), force);
  },
  browse: (page, force) => scraper.list('/browse', page, force),
  movies: (page, force) => scraper.list('/movies', page, force),
  newEpisodes: (page, force) => load('newEpisodes', `/new-episodes?page=${page}`, force),
  search: q => load('list', `/search?q=${encodeURIComponent(q)}`),
  details: (path, force) => load('details', path, force),
  episodeInfo,
  animerco,
  ristoanime,
  wecima,
  // the app calls newView() when it changes page, and gets onChange() when a page it shows came back different
  newView: () => { used.clear(); viewed.clear(); gen++; },
  // a page left open: its pages asked again behind it (as on a visit), redrawn by onChange only if the site changed
  recheck: () => viewed.forEach((kind, url) => load(kind, url, false, true).catch(() => {})),
  watch: fn => { onChange = fn; },
  SITE,
};
