// The website's anime section: RistoAnime (WordPress) in place of witanime, which Cloudflare refuses Vercel's servers.
// Its pages go through scraper.js's cache (load, remember) and come out in the same shapes as witanime's (home, list,
// details), under the same paths: /anime/<series slug>, /anime/<slug>~<season id> (another season of it),
// /anime/~<episode post slug> (a latest-episode card: resolved to its season's page), /movie/<post slug>,
// /watch/<show key>/<episode>, /watch/movie/<post slug>. The desktop and Android apps keep witanime.
if (window.api?.web) (() => {
  const AJ = RA + '/wp-content/themes/TopAnime/Ajaxt/'; // its own pages' XHR endpoints
  const slugOf = href => { try { return decodeURIComponent(new URL(href, RA).pathname.replace(/^\/(series\/)?|\/$/g, '')); } catch { return ''; } };
  const postUrl = slug => `${RA}/${encodeURIComponent(slug)}/`, seriesUrl = slug => `${RA}/series/${encodeURIComponent(slug)}/`;
  // "جميع حلقات انمي Black Clover مترجمة اون لاين", "انمي Black Clover الموسم 2 الحلقة 6 مترجمة اون لاين" -> the show's own name
  const clean = s => s.replace(/^جميع حلقات\s+/, '').replace(/^(?:انمي|أنمي|فيلم)\s+/, '').replace(/\s+الحلقة\s+\d.*$/, '')
    .replace(/\s+(?:مترجم|مدبلج)\S*(?:\s+اون\s*لاين|\s+اونلاين)?\s*$/, '').trim();
  const bg = el => el?.getAttribute('style')?.match(/url\(([^)]+)\)/)?.[1] || el?.getAttribute('data-style')?.match(/url\(([^)]+)\)/)?.[1] || '';

  // its poster cards: a series (/series/x), a film's post ("فيلم-..."), or an episode's post
  const cards = (root, sel = '.MovieItem, .SlideItem') => [...root.querySelectorAll(sel)].map(el => {
    const a = el.querySelector('a[href]'), slug = slugOf(a?.getAttribute('href')), name = txt(el.querySelector('.title h4') || el.querySelector('.title'));
    if (!slug) return null;
    const nums = txt(el.querySelector('.release-year')).match(/\d+(?:\.\d+)?/g) || [];
    const c = { title: clean(name), poster: bg(el.querySelector('.poster')), rating: nums.find(n => n !== '10') || '', year: txt(el.querySelector('.year')), badge: '', ep: null };
    if (/^\/series\//.test(new URL(a.getAttribute('href'), RA).pathname)) return { ...c, path: `/anime/${slug}`, type: 'anime' };
    if (/^فيلم/.test(slug)) return { ...c, path: `/movie/${slug}`, type: 'movie' };
    const ep = txt(el.querySelector('.Episode em')) || name.match(/الحلقة\s+(\d+(?:\.\d+)?)/)?.[1];
    return ep ? { ...c, path: `/watch/~${slug}/${ep}`, type: 'episode', ep, badge: 'EP ' + ep, showPath: `/anime/~${slug}` } : { ...c, path: `/anime/~${slug}`, type: 'anime' };
  }).filter(Boolean);
  // a page's season list, or the bare links the season call answers with
  const episodes = (root, sel = '.EpisodesList a[href]') => [...root.querySelectorAll(sel)].map(a => ({ n: txt(a.querySelector('em')), url: a.getAttribute('href') })).filter(e => e.n);

  parsers.raList = doc => ({ items: cards(doc, '.MovieItem'), slides: cards(doc, '.SlideItem'),
    pages: Math.max(1, ...[...doc.querySelectorAll('.pagination a')].map(a => +txt(a)).filter(Boolean)) });
  // a series, season, film or episode page: they share one layout
  parsers.raPage = doc => {
    const tax = [...doc.querySelectorAll('.TaxContent li')].map(li => [txt(li.querySelector('span')).replace(/\s*:\s*$/, ''), [...li.querySelectorAll('a')].map(txt).filter(v => v && v !== 'now')]);
    const val = re => tax.find(([k]) => re.test(k))?.[1] || [];
    const poster = doc.querySelector('.InnerPoster img')?.getAttribute('src') || '';
    return {
      title: clean(txt(doc.querySelector('h1.PostTitle'))), alt: val(/الانجليزي/)[0] || '', desc: txt(doc.querySelector('.StoryArea p')),
      genres: val(/النوع/), year: val(/عرض من|الاصدار/)[0] || '', poster, banner: bg(doc.querySelector('.singleCover .BG')) || poster,
      info: tax.filter(([k, v]) => v.length && !/النوع|التصنيف/.test(k)).map(([k, v]) => [k, v.join('، ')]),
      episodes: episodes(doc),
      seasons: [...doc.querySelectorAll('.SeasonsList li a[data-season]')].map(a => ({ id: a.dataset.season, name: txt(a), active: a.parentElement.classList.contains('active') })),
      postId: [...doc.querySelectorAll('script')].map(s => s.textContent.match(/post_id:\s*'(\d+)'/)?.[1]).find(Boolean) || '',
      seasonUrl: doc.querySelector('[itemprop=containsSeason] > a[itemprop=url]')?.getAttribute('href') || '', // an episode's post: its season
      related: cards(doc.querySelector('#MainFiltar') || doc.createElement('div'), '.MovieItem'),
    };
  };

  const mostViewed = () => remember('ra:views', async () => cards(parse(await api.fetch(AJ + 'Filtering.php', { type: 'views' })), '.MovieItem'));
  const list = (url, force) => load('raList', url, force);
  async function details(path, force) {
    const [, kind, key] = path.match(/^\/(anime|movie)\/(.+)$/) || [];
    if (!key) throw new Error('bad path');
    const show = p => ({ alt: '', trailer: '', tags: [p.year].filter(Boolean), title: p.title, desc: p.desc, genres: p.genres, info: p.info, poster: p.poster, banner: p.banner });
    if (kind === 'movie') return { ...show(await load('raPage', postUrl(key), force)), path, related: [], episodes: [{ path: `/watch/movie/${key}`, ep: 'Movie', url: postUrl(key) }] };
    if (key[0] === '~') { // an episode's post: its season's own page (the app moves there), else the post's own list
      const p = await load('raPage', postUrl(key.slice(1)), force), season = p.seasonUrl && slugOf(p.seasonUrl);
      if (season) return details('/anime/' + season, force);
    }
    const [slug, id] = key[0] === '~' ? [key] : key.split('~');
    const p = await load('raPage', slug[0] === '~' ? postUrl(slug.slice(1)) : seriesUrl(slug), force);
    const season = id && p.seasons.find(s => s.id === id);
    // another season: its list comes from the page's own call (kept a day: older seasons hardly change)
    const eps = season && !season.active ? await remember(`ra:season:${id}`, async () => episodes(parse(await api.fetch(AJ + 'Single/Episodes.php', { season: id, post_id: p.postId })), 'a[href]')) : p.episodes;
    const title = season ? clean(season.name) : p.title;
    return { ...show(p), path, title,
      alt: /الموسم\s+(?:[2-9]|\d\d)/.test(title) ? '' : p.alt, // the English name is season 1's: Anime Witcher would match that one
      episodes: eps.map(e => ({ path: `/watch/${key}/${e.n}`, ep: e.n, url: e.url })).sort((a, b) => parseFloat(a.ep) - parseFloat(b.ep)),
      related: [...p.seasons.filter(s => s !== season && !(s.active && !id)).map(s => ({ path: s.active ? `/anime/${slug}` : `/anime/${slug}~${s.id}`,
        type: 'anime', title: clean(s.name), poster: p.poster, rating: '', year: '', badge: '', ep: null })), ...p.related] };
  }
  // an episode's page on the site, through its show's list
  const episodeUrl = async epPath => {
    const [, key, n] = epPath.match(/^\/watch\/(.+)\/([^/]+)$/) || [];
    if (!key) throw new Error('bad path');
    const d = await details(key === 'movie' ? `/movie/${n}` : `/anime/${key}`);
    const e = d.episodes.find(e => e.path === epPath) || d.episodes.find(e => e.ep === n);
    if (!e) throw new Error('episode not found');
    return e.url.replace(/\/?$/, '/');
  };

  // its lists repeat a show once per episode (most viewed: one show's whole season): one card per show, the first (newest,
  // most viewed); shows() turns those episode cards into the show's own
  const byShow = items => items.filter((c, i) => items.findIndex(o => o.title === c.title) === i);
  const shows = items => byShow(items).map(c => c.type === 'episode' ? { ...c, path: c.showPath, type: 'anime', badge: '', ep: null, showPath: undefined } : c);
  const genreUrl = (g, page = 1) => `${RA}/genre/${encodeURIComponent(g)}/${page > 1 ? `?page=${page}/` : ''}`;
  const TASTE = ['أكشن', 'كوميدي', 'رومانسي']; // a new visitor's genre rows
  // the visitor's last anime (app.js store.history, newest first): their genres pick the genre rows
  // the slider's pictures: RistoAnime only has small episode stills, blurry at full width. AniList's wide banner (or its large
  // cover) by the show's Latin name, all of them in one query, kept a day. Page() answers a miss with an empty list, where
  // Media() would fail the whole query
  const latin = s => s.replace(/الموسم\s+(\d+)/, 'Season $1').replace(/[\u0600-\u06FF]+/g, '').replace(/\s+/g, ' ').trim();
  const art = names => remember('ra:art:' + names.join('|'), async () => {
    // each name twice: as is, and without its season (AniList often names a later season by its arc alone)
    const ask = (k, n) => `${k}: Page(perPage: 1) { media(search: ${JSON.stringify(n)}, type: ANIME, sort: SEARCH_MATCH) { bannerImage coverImage { extraLarge } } }`;
    const query = `{${names.map((n, i) => ask('a' + i, n) + ' ' + ask('b' + i, n.replace(/\s*Season \d+$/, ''))).join(' ')}}`;
    const d = JSON.parse(await api.fetch('https://graphql.anilist.co', { query })).data;
    return names.map((_, i) => { const m = d[`a${i}`]?.media[0] || d[`b${i}`]?.media[0]; return m?.bannerImage || m?.coverImage?.extraLarge || ''; });
  });
  // several late rows landing together: one redrawing
  const homeExtras = new Map();
  let redrawT;
  const redraw = () => { clearTimeout(redrawT); redrawT = setTimeout(() => scraper.changed(), 300); };
  const watched = () => Object.values(store.history).filter(h => h.show?.startsWith('/anime/')).sort((a, b) => b.at - a.at).slice(0, 5);

  Object.assign(scraper, {
    // the feed: what's new, then rows picked from what the visitor watches (their last show's suggestions, their genres),
    // shows they already watch moved to the end of those rows
    async home(force) {
      const hash=location.hash;
      const mine = watched(), seen = new Set(mine.map(h => h.title));
      const extraKey=mine.map(h=>h.show).join('|');
      const fresh = items => [...items.filter(c => !seen.has(c.title)), ...items.filter(c => seen.has(c.title))];
      const core = list(RA + '/', force);
      // no artificial wait after the core list: cached rows join at once, slower ones redraw when ready.
      const ready = core.then(() => Promise.resolve(), () => {});
      const soon = (name,p) => {
        const key=extraKey+':'+name;
        let got=false,changed=false;
        p=p.then(v=>{got=true;changed=JSON.stringify(homeExtras.get(key))!==JSON.stringify(v);homeExtras.set(key,v);if(homeExtras.size>40)homeExtras.delete(homeExtras.keys().next().value);return v;},()=>{got=true;return null;});
        return Promise.race([p,ready.then(()=>{if(!got)p.then(v=>v&&changed&&location.hash===hash&&redraw());return homeExtras.get(key)||null;})]);
      };
      const tastes = Promise.all(mine.map(h => details(h.show).catch(() => null))).then(l => l.filter(Boolean)); // cached pages, mostly
      const genres = tastes.then(l => {
        const count = {};
        l.flatMap(d => d.genres).forEach(g => count[g] = (count[g] || 0) + 1);
        return [...new Set([...Object.keys(count).sort((a, b) => count[b] - count[a]), ...TASTE])].slice(0, 3);
      });
      const slides = core.then(h => byShow(h.slides).slice(0, 8));
      const [h, views, films, last, byGenre, pics] = await Promise.all([core, soon('views',mostViewed()), soon('films',list(`${RA}/movies/`, force)), soon('last',tastes.then(l => l[0])),
        soon('genres',genres.then(gs => Promise.all(gs.map(async g => ({ g, d: await list(genreUrl(g), force).catch(() => null) }))))),
        soon('art',slides.then(l => art(l.map(c => latin(c.title)))))]);
      const genreRow = i => byGenre?.[i]?.d && { title: t('genreRow', byGenre[i].g), items: fresh(shows(byGenre[i].d.items)), base: '/genre/' + byGenre[i].g };
      return { hero: (await slides).map((c, i) => ({ path: c.showPath || c.path, watch: c.type === 'episode' ? c.path : '', title: c.title, desc: '', banner: pics?.[i] || c.poster })),
        rows: [
          { title: 'أحدث الحلقات', items: byShow(h.items) },
          last && { title: t('becauseWatched', last.title), items: fresh(last.related) },
          { title: 'أكثر الأنميات مشاهدة', items: shows(views || []) },
          genreRow(0),
          films && { title: 'أحدث الأفلام', items: films.items, base: '/movies' },
          genreRow(1),
          genreRow(2),
        ].filter(r => r?.items.length) };
    },
    // witanime's listings by their paths (app.js SECTIONS, filter.js): its filters have no match here, the plain list is shown
    async list(base, page = 1, force) {
      if (/Most Viewed/.test(base)) return { items: shows(await mostViewed()), pages: 1 };
      const genre = base.match(/^\/genre\/(.+)/)?.[1];
      if (genre) { const d = await list(genreUrl(genre, page), force); return { ...d, items: shows(d.items) }; }
      return list(/^\/movies/.test(base) ? `${RA}/movies/${page > 1 ? `page/${page}/` : ''}` : `${RA}/series/${page > 1 ? `?offset=${page}` : ''}`, force);
    },
    newEpisodes: async (page, force) => { const d = await list(page > 1 ? `${RA}/?page=${page}/` : RA + '/', force); return { ...d, items: byShow(d.items) }; },
    search: q => list(`${RA}/?s=${encodeURIComponent(q)}`),
    details,
    ristoanime: async () => [], // the main source here: not again as a backup
    SITE: RA,
  });
  window.Risto = {
    // its servers, as tokens web.js plays straight away (api.stream)
    async sources(epPath) {
      const doc = parse(await api.fetch((await episodeUrl(epPath)) + 'watch/'));
      return [...doc.querySelectorAll('li[data-watch]')].map(li => li.dataset.watch).filter(u => u.startsWith('https://')).map(u => ({ label: hostName(u), quality: '', token: 'ra:' + u }));
    },
    // its download page: the hosts' own pages, opened in a new tab
    async downloads(epPath) {
      const doc = parse(await api.fetch((await episodeUrl(epPath)) + 'download/'));
      return [...doc.querySelectorAll('a[href^="http"]')].filter(a => a.querySelector('em') && !a.getAttribute('href').startsWith(RA))
        .map(a => ({ label: txt(a.querySelector('em')).split('.')[0], quality: 'HD', token: a.getAttribute('href') }));
    },
  };
})();
