// The website's main anime source: Shahiid Anime (WordPress). Of the sites Vercel's servers can read it posts new episodes
// first most often, so the anime section's lists and show pages come from it. RistoAnime only fills what it lacks, and adds
// its servers with OKAnime's. Same shapes as risto.js, under its own paths: /anime/s:<season slug>, /anime/s:+<series slug>,
// /anime/s:~<episode slug> (a latest-episode card: resolved to its season's page), /movie/s:<film slug>,
// /watch/s:<show key>/<episode>, /watch/movie/s:<film slug>. The desktop and Android apps keep witanime.
if (window.api?.web) (() => {
  const SH = 'https://shahiid-anime.net', OK = 'https://ww3.okanime.xyz';
  const r = { list: scraper.list, newEpisodes: scraper.newEpisodes, search: scraper.search, details: scraper.details, ristoanime: scraper.ristoanime, sources: Risto.sources, downloads: Risto.downloads };
  const isMain = path => /^\/(?:anime|movie|watch(?:\/movie)?)\/s:/.test(path);
  const onMainPage = () => decodeURIComponent(location.hash).includes('/s:');
  const seasonUrl = slug => `${SH}/seasons/${encodeURIComponent(slug)}/`;
  const seasonNumber = w => +w || AR_NTH.indexOf(w.replace(/[أإآ]/g, 'ا')) + 1;

  // "أونا Da Wang Rao Ming 3 الموسم الثالث الحلقة 8 مترجمة" -> "Da Wang Rao Ming 3 Season 3". Latin names only where there is one:
  // the other sites, AniList and the rest find shows by them ("ون بيس One Piece")
  const clean = s => {
    let name = s.replace(/\s+الحلقة\s+\S+.*$/, '').replace(/^(?:جميع حلقات\s+)?(?:أنمي|انمي|أونا|اونا|أوفا|اوفا|فيلم|مسلسل)\s+/, '')
      .replace(/(?:\s+(?:مترجم\S*|كامل|اون\s*لاين|اونلاين))+\s*$/, '').trim();
    const season = name.match(/الموسم\s+(\S+)/);
    if (season) name = name.replace(season[0], /season/i.test(name) || !seasonNumber(season[1]) ? '' : `Season ${seasonNumber(season[1])}`);
    return (/[a-z]/i.test(name) ? name.replace(/[\u0600-\u06FF]+/g, ' ') : name).replace(/\s+/g, ' ').replace(/[\s:\-–]+$/, '').trim();
  };
  // one show whichever site names it: "Black Clover الموسم 2" and "Black Clover 2nd Season" are the same one.
  // ponytail: names only, so a show one site calls by another name ("II" for season 2) still shows twice; an AniList id per show would fix it
  const named = c => {
    let n = 0;
    const base = String(c.title || '').toLowerCase().replace(/الموسم\s+(\S+)/, (_, w) => { n = seasonNumber(w); return ''; })
      .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b|\bseason\s+(\d+)\b/, (_, a, b) => { n = +(a || b); return ''; });
    return { base: base.replace(/[^a-z0-9+]/g, '') || base.replace(/\s/g, ''), n }; // +: "One Piece +" is its specials, not One Piece
  };
  const showKey = c => { const { base, n } = named(c); return `${c.type === 'movie' ? 'm:' : ''}${base}|${n || 1}`; };
  // looser, where the rest tells seasons apart: a site can name a later season by its arc alone ("Santen Sensou-hen" and
  // "Santen Sensou-hen الموسم 4") or cut a long name short (then the episode has to match too)
  const alike = (a, b) => {
    if ((a.type === 'movie') !== (b.type === 'movie')) return false;
    const x = named(a), y = named(b);
    if (x.n && y.n && x.n !== y.n) return false;
    return x.base === y.base || (Math.min(x.base.length, y.base.length) > 5 && (x.base.startsWith(y.base) || y.base.startsWith(x.base)) && String(a.ep ?? '') === String(b.ep ?? ''));
  };
  const uniq = items => { const seen = new Set(); return items.filter(c => !seen.has(showKey(c)) && seen.add(showKey(c))); };
  // one card per show, in the main list's order: the other site's card replaces it only when that one's episode is newer
  const newestPerShow = (main, more) => {
    const best = [];
    for (const c of [...main, ...more]) {
      const i = best.findIndex(o => alike(o, c));
      if (i < 0) best.push(c); else if (parseFloat(c.ep) > parseFloat(best[i].ep)) best[i] = c;
    }
    return best;
  };

  // its pictures come through wordpress's image service, which sizes them by address. Its pages ask for 200px, blurry on a card
  const sized = (url, width) => url.replace(/^(https:\/\/i\d\.wp\.com\/[^?]+).*$/, width ? `$1?w=${width}&ssl=1` : '$1?ssl=1');
  // AniList's pictures of a show: a real wide banner for its page, and a cover where the site lost its own (about 1 poster in 25 is a
  // 404 there). Only under the show's exact name: no picture beats another show's.
  const sameName = s => clean(String(s || '')).replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, 'Season $1').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const aniArt = (title, alt) => remember('sh:art3:' + JSON.stringify([title, alt || '']), async () => {
    let best = {};
    for (const search of new Set([alt, title].filter(Boolean))) {
      const query = `{Page(perPage:6){media(search:${JSON.stringify(search)},type:ANIME,sort:SEARCH_MATCH){title{romaji english native} synonyms bannerImage coverImage{extraLarge} trailer{id site}}}}`;
      const media = JSON.parse(await api.fetch('https://graphql.anilist.co', { query })).data?.Page?.media || [];
      const matches = media.filter(m => [...Object.values(m.title), ...(m.synonyms || [])].some(n => sameName(n) && sameName(n) === sameName(search)));
      const hit = matches.find(m => m.trailer?.site === 'youtube' && m.trailer.id) || matches[0];
      if (!hit) continue;
      best = { banner: hit.bannerImage || hit.coverImage?.extraLarge || '', cover: hit.coverImage?.extraLarge || '', trailer: hit.trailer?.site === 'youtube' ? `https://www.youtube.com/embed/${encodeURIComponent(hit.trailer.id)}?autoplay=1` : '' };
      if (best.trailer) return best;
    }
    return Object.keys(best).length ? best : null;
  });

  const epNumber = name => name.match(/الحلقة\s+0*(\d[\d.]*)/)?.[1];
  // its poster cards: an episode, a season, a series or a film. Its dubbed and foreign-series kinds are left out
  const cards = doc => [...doc.querySelectorAll('.one-poster')].map(el => {
    const a = el.querySelector('a[href]'), img = el.querySelector('img'), name = txt(el.querySelector('h2')) || img?.getAttribute('alt') || '';
    if (!a) return null;
    const [, kind, slug] = decodeURIComponent(new URL(a.getAttribute('href'), SH).pathname).split('/');
    const c = { title: clean(name), poster: sized(img?.getAttribute('src') || '', 400), rating: txt(el.querySelector('.rated-poster')), year: '', badge: '', ep: null };
    if (!slug || !c.title) return null;
    if (kind === 'anime') return { ...c, path: `/movie/s:${slug}`, type: 'movie' };
    if (kind === 'seasons') return { ...c, path: `/anime/s:${slug}`, type: 'anime' };
    if (kind === 'series') return { ...c, path: `/anime/s:+${slug}`, type: 'anime' };
    const ep = kind === 'episodes' && epNumber(name);
    return ep ? { ...c, path: `/watch/s:~${slug}/${ep}`, type: 'episode', ep, badge: 'EP ' + ep, showPath: `/anime/s:~${slug}` } : null;
  }).filter(Boolean);
  parsers.shList = doc => ({ items: cards(doc), pages: Math.max(1, ...[...doc.querySelectorAll('a[href*="/page/"]')].map(a => +a.getAttribute('href').match(/\/page\/(\d+)/)?.[1]).filter(Boolean)) });
  // a season, film or episode page: they share one layout. An episode row has two more links, which name no number
  parsers.shPage = doc => {
    const meta = [...doc.querySelectorAll('.head-s-meta-first > span')].map(s => { const [k, ...v] = txt(s).split(/\s*:\s*/); return [k, v.join(': ')]; }).filter(([, v]) => v);
    const crumb = kind => doc.querySelector(`.breadcrumb-list a[href*="/${kind}/"]`)?.getAttribute('href') || '';
    const story = doc.querySelector('.head-s-story'), lines = [...story?.querySelectorAll('div') || []].map(txt).filter(Boolean);
    const poster = sized(doc.querySelector('.head-s-movie-thumb img')?.getAttribute('src') || '');
    return { title: clean(txt(doc.querySelector('h1'))), alt: meta.find(([k]) => /الانجليزي|الإنجليزي/.test(k))?.[1] || '', poster,
      desc: lines.length > 1 ? lines.slice(1).join(' ') : lines[0] || txt(story).replace(/^[^:]*:\s*/, ''), // its first line only repeats the title
      genres: [...doc.querySelectorAll('.head-s-meta-ctas a')].map(txt).filter(Boolean), info: meta.filter(([k]) => !/الانجليزي|الإنجليزي|تقييم/.test(k)), // its copy of the score goes stale: the page's badges have the live one
      episodes: [...doc.querySelectorAll('a[href*="/episodes/"]')].map(a => ({ n: epNumber(txt(a)), url: a.getAttribute('href') })).filter(e => e.n),
      trailer: doc.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]')?.getAttribute('src') || '',
      more: !!doc.querySelector('#pagination .next-page'), seriesUrl: crumb('series'), seasonUrl: crumb('seasons') };
  };

  // a long show lists 20 episodes a page (?epp=N). A page with one after it is full and never changes: kept. Only the last one is
  // asked again, for new episodes. Rounds of 6, 12, 24... pages at once: One Piece (~60 pages) took ten rounds of six, 17 s; this is four. A page
  // past the end answers with no episodes (it costs a request, no more): the pages asked beyond the last are the price of not knowing it
  // a list just read is the same one a moment later: a page found under another address is asked for twice in a row (app.js title moves to its own)
  const lists = new Map();
  const allEpisodes = (url, first, force) => {
    const hit = lists.get(url);
    if (hit && !force && Date.now() - hit.at < 60e3) return hit.eps;
    const eps = readEpisodes(url, first, force);
    lists.set(url, { at: Date.now(), eps });
    eps.catch(() => lists.delete(url));
    if (lists.size > 8) lists.delete(lists.keys().next().value);
    return eps;
  };
  async function readEpisodes(url, first, force) {
    const eps = [...first.episodes];
    const page = async n => {
      const u = `${url}?epp=${n}`;
      let fetched;
      const full = await remember('sh:eps:' + u, async () => { fetched = parsers.shPage(parse(await api.fetch(u))); return fetched.more ? fetched : null; });
      return full || (fetched?.episodes.length ? load('shPage', u, force, true) : fetched) || load('shPage', u, force, true); // the real last page is kept by the page cache, an empty one past it isn't
    };
    // how many pages it had last time: all of them at once, and one more for what was added since
    const known = await remember('sh:pages:' + url, async () => null).catch(() => null);
    let last = 1;
    for (let n = 2, size = known || 6, more = first.more; more; n += size, size = size === known ? 6 : size * 2) {
      const batch = await Promise.all(Array.from({ length: size }, (_, i) => page(n + i)));
      batch.forEach((p, i) => { eps.push(...p.episodes); if (p.episodes.length) last = n + i; });
      more = batch[size - 1].more;
    }
    if (last > 6) remember('sh:pages:' + url, async () => last).catch(() => {});
    const seen = new Set();
    return eps.map(e => ({ ...e, n: String(parseFloat(e.n)) })).filter(e => !seen.has(e.n) && seen.add(e.n));
  }
  // details can render from one page; artwork, other seasons and long episode lists arrive behind it.
  const detailExtras = new Map();
  function detailExtra(key, task, fallback, force) {
    let entry = detailExtras.get(key);
    if (!entry || force || !entry.pending && Date.now() - entry.at > 60e3) {
      const previous = entry?.value;
      entry = { value: previous, at: Date.now(), pending: true };
      detailExtras.set(key, entry);
      entry.promise = Promise.resolve().then(task).then(value => {
        entry.value = value; entry.pending = false;
        return value;
      }, () => {
        entry.pending = false;
        if (!entry.value && fallback.episodesPending) entry.value = { ...fallback, episodesPending: false }; // a failed page must stop shimmering too
        return entry.value;
      });
      if (detailExtras.size > 32) detailExtras.delete(detailExtras.keys().next().value);
    }
    if (entry.pending) {
      const hash = location.hash, before = JSON.stringify(entry.value ?? fallback);
      entry.promise.then(value => {
        if (location.hash === hash && value != null && JSON.stringify(value) !== before) scraper.changed();
      });
    }
    return entry.value ?? fallback;
  }
  async function shDetails(path, force, complete = false) {
    const [, kind, key] = path.match(/^\/(anime|movie)\/s:(.+)$/) || [];
    if (!key) throw new Error('bad path');
    // the page doesn't wait long for its banner: the next visit has it
    const show = async p => {
      const art = await Promise.race([aniArt(p.title, p.alt).catch(() => null), new Promise(r => setTimeout(r, 1500))]);
      return { alt: p.alt, trailer: p.trailer || art?.trailer || '', tags: [], title: p.title, desc: p.desc, genres: p.genres, info: p.info, poster: p.poster, banner: art?.banner || p.poster };
    };
    if (kind === 'movie') {
      const url = `${SH}/anime/${encodeURIComponent(key)}/`;
      return { ...await show(await load('shPage', url, force)), path, related: [], episodes: [{ path: `/watch/movie/s:${key}`, ep: 'Movie', url }] };
    }
    const slugOf = href => decodeURIComponent(new URL(href, SH).pathname).split('/')[2];
    if (key[0] === '~') { // the app moves to the season's own page
      // an episode's address is nearly always its season's plus "-ep-N": that page is asked at once, beside the episode's own, which
      // names its season for sure. One request's wait instead of two in a row
      const ep = key.slice(1), guess = ep.replace(/-ep-[\d-]+$/, '');
      const sure = load('shPage', `${SH}/episodes/${encodeURIComponent(ep)}/`, force, complete).then(p => p.seasonUrl ? slugOf(p.seasonUrl) : Promise.reject(new Error('season not found')));
      sure.catch(() => {}); // not waited for when the guess is right
      const quick = guess !== ep && await shDetails('/anime/s:' + guess, force, complete).catch(() => null);
      return quick?.episodes.length ? quick : shDetails('/anime/s:' + await sure, force, complete);
    }
    if (key[0] === '+') { // a series is only its seasons: its first one's page
      const season = (await load('shList', `${SH}/series/${encodeURIComponent(key.slice(1))}/`, force, complete)).items.find(c => /s:[^+~]/.test(c.path));
      if (!season) throw new Error('season not found');
      return shDetails(season.path, force, complete);
    }
    const url = seasonUrl(key), p = await load('shPage', url, force, complete);
    const enrich = async () => {
      const [head, sisters, eps] = await Promise.all([show(p), p.seriesUrl ? load('shList', p.seriesUrl, false, true).then(d => d.items, () => []) : [], allEpisodes(url, p, force)]);
      return { ...head, path, episodesPending: false,
        episodes: eps.map(e => ({ path: `/watch/s:${key}/${e.n}`, ep: e.n, url: e.url })).sort((a, b) => parseFloat(a.ep) - parseFloat(b.ep)),
        related: uniq(sisters).filter(c => c.path !== path && showKey(c) !== showKey({ title: p.title, type: 'anime' })) };
    };
    const initial = { alt: p.alt, trailer: '', tags: [], title: p.title, desc: p.desc, genres: p.genres, info: p.info, poster: p.poster, banner: p.poster, path, episodesPending: !!p.more,
      episodes: p.episodes.map(e => ({ path: `/watch/s:${key}/${e.n}`, ep: e.n, url: e.url })).sort((a, b) => parseFloat(a.ep) - parseFloat(b.ep)), related: [] };
    return complete ? enrich() : detailExtra(path, enrich, initial, force);
  }

  const episodeUrl = async epPath => {
    const [, key, n] = epPath.match(/^\/watch\/(.+)\/([^/]+)$/) || [];
    if (!key) throw new Error('bad path');
    const d = await shDetails(key === 'movie' ? `/movie/${n}` : `/anime/${key}`, false, true);
    const e = d.episodes.find(e => e.path === epPath) || d.episodes.find(e => e.ep === n);
    if (!e) throw new Error('episode not found');
    return e.url;
  };

  // a page's server tabs: a film's carry their own iframe, an episode's are asked for (its own page's call, a plain GET)
  const frame = html => html?.match(/<iframe[^>]+src=["']([^"']+)/i)?.[1];
  async function shServers(url) {
    const tabs = [...parse(await api.fetch(url)).querySelectorAll('.buttosn[data-frameserver]')];
    const list = await Promise.all(tabs.map(async a => {
      const { frameserver, post, serv, is_film } = a.dataset;
      const src = is_film === 'yes' ? frame(frameserver) : frame(await api.fetch(`${SH}/wp-admin/admin-ajax.php?${new URLSearchParams({ action: 'codecanal_ajax_request', post, frameserver, serv })}`).catch(() => ''));
      if (!src) return null;
      const link = new URL(src, 'https://x').href.replace(/^http:/, 'https:'); // some are //ok.ru/...
      return { label: hostName(link), quality: txt(a).match(/\b(?:4K|FHD|HD|SD)\b/)?.[0] || '', url: link };
    }));
    return list.filter(Boolean);
  }
  async function shDownloads(url) {
    const page = parse(await api.fetch(url)).querySelector('a[href*="?download="]')?.getAttribute('href');
    if (!page) return [];
    return [...parse(await api.fetch(page)).querySelectorAll('a.btnsdownserver[href^="http"]')]
      .map(a => ({ label: txt(a).split(/[\s-]/)[0], quality: txt(a).match(/\b(?:4K|FHD|HD|SD)\b/)?.[0] || 'HD', token: a.getAttribute('href') }));
  }

  // the other site's show under a page's name: both only keep slugs close to the Latin title, so it's tried by address
  const slugs = (title, alt) => [...new Set([title, alt].map(s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).filter(Boolean))];
  // OKAnime's servers sit on the episode's page. Its robots.txt rules out /search, so a show under another name has none from it
  async function okanime(title, alt, ep, movie) {
    if (movie) return [];
    const n = String(parseFloat(ep));
    for (const slug of slugs(title, alt)) {
      const doc = await api.fetch(`${OK}/episode/${slug}-episode-${n}`).then(parse).catch(() => null);
      if (!doc) continue;
      return [...doc.querySelectorAll('[data-server]')].map(el => {
        const url = el.getAttribute('@click')?.match(/setServer\('([^']+)'\)/)?.[1];
        return url?.startsWith('https://') && { label: hostName(url), quality: txt(el.querySelector('span')), url };
      }).filter(Boolean).sort((a, b) => QUALITY.indexOf(a.quality) - QUALITY.indexOf(b.quality)); // the player keeps a host's first
    }
    return [];
  }
  // this site's servers for a RistoAnime page (a show found only there, or an older history entry)
  async function shahiid(title, alt, ep, movie) {
    if (movie || onMainPage()) return [];
    const n = String(parseFloat(ep));
    for (const slug of slugs(title, alt)) {
      const list = await shServers(`${SH}/episodes/${slug}-ep-${n}/`).catch(() => null);
      if (list?.length) return list;
    }
    return [];
  }

  // a RistoAnime page goes to the same show's page here, so a show has one page, unless that one's behind it
  async function sameShow(d, kind) {
    const term = (kind === 'movie' ? d.title : splitSeason(d.title)?.base || d.title).replace(/[\u0600-\u06FF]+/g, ' ').trim();
    if (!term) return null;
    const me = { title: d.title, type: kind }, items = (await load('shList', `${SH}/?s=${encodeURIComponent(term)}`, false, true).catch(() => null))?.items || [];
    const exact = items.filter(c => showKey(c) === showKey(me)), found = exact.length ? exact : items.filter(c => alike(c, me));
    const hit = found.find(c => /s:[^+~]/.test(c.path)) || found[0];
    if (!hit) return null;
    const m = await shDetails(hit.path, false, true).catch(() => null), last = x => Math.max(0, ...x.episodes.map(e => parseFloat(e.ep) || 0));
    // a looser match has to be at the same episode too: "Black Clover" isn't its own later season
    return m && last(m) >= last(d) && (exact.length || last(m) - last(d) <= 1) ? m : null;
  }

  const GENRE = { 'رومانسي': 'رومنسي' }; // its own spelling: the other one is a 404, on every visit to the home page
  let shown = []; // the shows of the latest list's pages so far: a show posted twice in a row is on the next page too
  Object.assign(scraper, {
    async newEpisodes(page, force) {
      const [a, b] = await Promise.allSettled([load('shList', `${SH}/episodes/${page > 1 ? `page/${page}/` : ''}`, force), r.newEpisodes(page, force)]);
      if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
      if (a.status === 'rejected') console.error(a.reason);
      if (page === 1) shown = [];
      const items = newestPerShow(a.value?.items || [], b.value?.items || []).filter(c => !shown.some(o => alike(o, c)));
      shown.push(...items);
      return { items, pages: Math.max(a.value?.pages || 1, b.value?.pages || 1) };
    },
    // witanime's listings by their paths, as in risto.js. Its most-viewed list has no match here
    async list(base, page = 1, force) {
      if (/Most Viewed/.test(base)) return r.list(base, page, force);
      const genre = GENRE[base.match(/^\/genre\/(.+)/)?.[1]] || base.match(/^\/genre\/(.+)/)?.[1], at = /^\/movies/.test(base) ? 'anime' : genre ? `series-cats/${encodeURIComponent(genre)}` : 'series';
      try {
        const d = await load('shList', `${SH}/${at}/${page > 1 ? `page/${page}/` : ''}`, force);
        return { ...d, items: uniq(d.items) };
      } catch (e) { console.error(e); return r.list(base, page, force); }
    },
    async search(q) {
      const [a, b] = await Promise.allSettled([load('shList', `${SH}/?s=${encodeURIComponent(q)}`), r.search(q)]);
      if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
      return { items: uniq([...a.value?.items || [], ...b.value?.items || []]), pages: 1 };
    },
    async details(path, force) {
      if (isMain(path)) return shDetails(path, force);
      const d = await r.details(path, force), [, kind] = path.match(/^\/(anime|movie)\//) || [];
      // cross-source matching used to hold even a cached title behind dozens of episode requests.
      return kind ? detailExtra('match:' + path, () => sameShow(d, kind).then(m => m || d), d, force) : d;
    },
    // the player's other servers: RistoAnime's only where it isn't the page's own source
    ristoanime: (...a) => onMainPage() ? r.ristoanime(...a) : Promise.resolve([]),
    okanime,
    shahiid,
    cover: title => aniArt(title).then(a => a?.cover), // a poster that didn't load (app.js)
    async trailer(title, alt, path) {
      const art = await aniArt(title, alt).catch(() => null);
      if (art?.trailer || !path) return art?.trailer || '';
      // the card can have a shortened name; ask only for its metadata, never the whole episode list.
      let d;
      if (isMain(path)) {
        const [, kind, key] = path.match(/^\/(anime|movie)\/s:(.+)$/) || [];
        let url = kind === 'movie' ? `${SH}/anime/${encodeURIComponent(key)}/` : key?.startsWith('~')
          ? `${SH}/episodes/${encodeURIComponent(key.slice(1))}/` : key?.startsWith('+') ? '' : key ? seasonUrl(key) : '';
        if (key?.startsWith('+')) {
          const seasons = await load('shList', `${SH}/series/${encodeURIComponent(key.slice(1))}/`, false, true);
          const season = seasons.items.find(c => /^\/anime\/s:[^+~]/.test(c.path));
          if (season) url = seasonUrl(season.path.slice('/anime/s:'.length));
        }
        if (url) d = await load('shPage', url, false, true);
      } else d = await r.details(path, false, true);
      return d?.trailer || (d && (await aniArt(d.title, d.alt))?.trailer) || '';
    }, // a source's trailer first, then its exact names on AniList
  });
  // web.js asks these for a page's own servers and downloads
  Object.assign(Risto, {
    sources: async epPath => isMain(epPath) ? (await shServers(await episodeUrl(epPath))).map(s => ({ label: s.label, quality: s.quality, token: 'ra:' + s.url })) : r.sources(epPath),
    downloads: async epPath => isMain(epPath) ? shDownloads(await episodeUrl(epPath)) : r.downloads(epPath),
  });
})();
