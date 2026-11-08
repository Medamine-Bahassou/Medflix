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

  const epNumber = name => name.match(/الحلقة\s+0*(\d[\d.]*)/)?.[1];
  // its poster cards: an episode, a season, a series or a film. Its dubbed and foreign-series kinds are left out
  const cards = doc => [...doc.querySelectorAll('.one-poster')].map(el => {
    const a = el.querySelector('a[href]'), img = el.querySelector('img'), name = txt(el.querySelector('h2')) || img?.getAttribute('alt') || '';
    if (!a) return null;
    const [, kind, slug] = decodeURIComponent(new URL(a.getAttribute('href'), SH).pathname).split('/');
    const c = { title: clean(name), poster: img?.getAttribute('src') || '', rating: txt(el.querySelector('.rated-poster')), year: '', badge: '', ep: null };
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
    const poster = (doc.querySelector('.head-s-movie-thumb img')?.getAttribute('src') || '').replace('resize=200%2C283', 'resize=350%2C496');
    return { title: clean(txt(doc.querySelector('h1'))), alt: meta.find(([k]) => /الانجليزي|الإنجليزي/.test(k))?.[1] || '', poster,
      desc: lines.length > 1 ? lines.slice(1).join(' ') : lines[0] || txt(story).replace(/^[^:]*:\s*/, ''), // its first line only repeats the title
      genres: [...doc.querySelectorAll('.head-s-meta-ctas a')].map(txt).filter(Boolean), info: meta.filter(([k]) => !/الانجليزي|الإنجليزي/.test(k)),
      episodes: [...doc.querySelectorAll('a[href*="/episodes/"]')].map(a => ({ n: epNumber(txt(a)), url: a.getAttribute('href') })).filter(e => e.n),
      more: !!doc.querySelector('#pagination .next-page'), seriesUrl: crumb('series'), seasonUrl: crumb('seasons') };
  };

  // a long show lists 20 episodes a page (?epp=N). A page with one after it is full and never changes: kept. Only the last one is
  // asked again, for new episodes. ponytail: One Piece is ~60 requests on a visitor's first visit (Vercel's cache shares them); only its newest pages first if that drags
  async function allEpisodes(url, first, force) {
    const eps = [...first.episodes];
    const page = async n => {
      const u = `${url}?epp=${n}`;
      return await remember('sh:eps:' + u, async () => { const p = parsers.shPage(parse(await api.fetch(u))); return p.more ? p : null; }) || load('shPage', u, force);
    };
    for (let n = 2, more = first.more; more; n += 6) {
      const batch = await Promise.all([0, 1, 2, 3, 4, 5].map(i => page(n + i)));
      batch.forEach(p => eps.push(...p.episodes));
      more = batch[5].more;
    }
    const seen = new Set();
    return eps.map(e => ({ ...e, n: String(parseFloat(e.n)) })).filter(e => !seen.has(e.n) && seen.add(e.n));
  }
  async function shDetails(path, force) {
    const [, kind, key] = path.match(/^\/(anime|movie)\/s:(.+)$/) || [];
    if (!key) throw new Error('bad path');
    const show = p => ({ alt: p.alt, trailer: '', tags: [], title: p.title, desc: p.desc, genres: p.genres, info: p.info, poster: p.poster, banner: p.poster });
    if (kind === 'movie') {
      const url = `${SH}/anime/${encodeURIComponent(key)}/`;
      return { ...show(await load('shPage', url, force)), path, related: [], episodes: [{ path: `/watch/movie/s:${key}`, ep: 'Movie', url }] };
    }
    const slugOf = href => decodeURIComponent(new URL(href, SH).pathname).split('/')[2];
    if (key[0] === '~') { // the app moves to the season's own page
      const season = (await load('shPage', `${SH}/episodes/${encodeURIComponent(key.slice(1))}/`, force)).seasonUrl;
      if (!season) throw new Error('season not found');
      return shDetails('/anime/s:' + slugOf(season), force);
    }
    if (key[0] === '+') { // a series is only its seasons: its first one's page
      const season = (await load('shList', `${SH}/series/${encodeURIComponent(key.slice(1))}/`, force)).items.find(c => /s:[^+~]/.test(c.path));
      if (!season) throw new Error('season not found');
      return shDetails(season.path, force);
    }
    const url = seasonUrl(key), p = await load('shPage', url, force);
    const sisters = p.seriesUrl ? (await load('shList', p.seriesUrl, false, true).catch(() => null))?.items || [] : [];
    return { ...show(p), path,
      episodes: (await allEpisodes(url, p, force)).map(e => ({ path: `/watch/s:${key}/${e.n}`, ep: e.n, url: e.url })).sort((a, b) => parseFloat(a.ep) - parseFloat(b.ep)),
      related: uniq(sisters).filter(c => c.path !== path && showKey(c) !== showKey({ title: p.title, type: 'anime' })) };
  }
  const episodeUrl = async epPath => {
    const [, key, n] = epPath.match(/^\/watch\/(.+)\/([^/]+)$/) || [];
    if (!key) throw new Error('bad path');
    const d = await shDetails(key === 'movie' ? `/movie/${n}` : `/anime/${key}`);
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
    const m = await shDetails(hit.path).catch(() => null), last = x => Math.max(0, ...x.episodes.map(e => parseFloat(e.ep) || 0));
    // a looser match has to be at the same episode too: "Black Clover" isn't its own later season
    return m && last(m) >= last(d) && (exact.length || last(m) - last(d) <= 1) ? m : null;
  }

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
      const genre = base.match(/^\/genre\/(.+)/)?.[1], at = /^\/movies/.test(base) ? 'anime' : genre ? `series-cats/${encodeURIComponent(genre)}` : 'series';
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
      return kind && await sameShow(d, kind).catch(() => null) || d;
    },
    // the player's other servers: RistoAnime's only where it isn't the page's own source
    ristoanime: (...a) => onMainPage() ? r.ristoanime(...a) : Promise.resolve([]),
    okanime,
    shahiid,
  });
  // web.js asks these for a page's own servers and downloads
  Object.assign(Risto, {
    sources: async epPath => isMain(epPath) ? (await shServers(await episodeUrl(epPath))).map(s => ({ label: s.label, quality: s.quality, token: 'ra:' + s.url })) : r.sources(epPath),
    downloads: async epPath => isMain(epPath) ? shDownloads(await episodeUrl(epPath)) : r.downloads(epPath),
  });
})();
