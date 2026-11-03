// Source ratings only. Lazy lookup avoids requesting every off-screen card.
const Ratings = (() => {
  const cache = new Map();
  let queue = Promise.resolve();
  const enqueue = c => {
    const task = queue.then(() => lookup(c)).catch(() => null);
    queue = task.then(() => new Promise(resolve => setTimeout(resolve, 2200)));
    return task;
  };
  const norm = s => String(s || '').toLowerCase().replace(/(?:الموسم|الحلقة)\s.*|\bseason\s+\d+.*/gi, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  async function lookup(c) {
    const cinema = c.type === 'cinema', title = norm(c.title), year = String(c.year || '');
    if (!title) return [];
    if (cinema) return (await Promise.all([imdb(c), rotten(c), metacritic(c)].map(p => p.catch(() => null)))).filter(Boolean);
    return (await Promise.all([anilist(c, title).catch(() => null), mal(c).catch(() => null)])).filter(Boolean);
  }
  // film remakes need a release year; a show's page may carry its season's year instead
  const filmName = s => norm(String(s || '').replace(/(?:الموسم|الجزء|الحلقة)\s+.*|\bseason\s+\d+.*/gi, '').replace(/\p{Script=Arabic}+/gu, ' '));
  const series = c => /^\/cinema\/(serie|season|episode)\//.test(c.path || '');
  const filmPick = (rows, c) => {
    const named = rows.filter(h => h.series === series(c) && h.names.some(n => filmName(n) === filmName(c.title)));
    return series(c) ? named[0] : /^\d{4}$/.test(String(c.year || '')) ? named.find(h => /^\d{4}$/.test(String(h.year)) && Math.abs(Number(h.year) - Number(c.year)) <= 1) : named.length === 1 ? named[0] : null;
  };
  const filmScore = (source, v, top = 100) => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= top ? { source, value: top === 10 ? Number(v).toFixed(1) : String(Math.round(Number(v))) } : null;
  async function imdb(c) {
    if (Number(c.imdb) > 0) return filmScore('IMDb', c.imdb, 10);
    const q = filmName(c.title);
    if (!q) return null;
    const query = 'query{mainSearch(first:6,options:{searchTerm:' + JSON.stringify(q) + ',type:TITLE}){edges{node{entity{... on Title{titleType{id} titleText{text} originalTitleText{text} releaseYear{year} ratingsSummary{aggregateRating}}}}}}}';
    const j = JSON.parse(await api.fetch('https://caching.graphql.imdb.com/', { query }, false, true));
    const rows = (j.data?.mainSearch?.edges || []).map(e => e.node?.entity).filter(Boolean).map(h => ({ names: [h.titleText?.text, h.originalTitleText?.text], year: h.releaseYear?.year, series: /^tv(Series|MiniSeries)$/.test(h.titleType?.id), value: h.ratingsSummary?.aggregateRating }));
    return filmScore('IMDb', filmPick(rows, c)?.value, 10);
  }
  async function rotten(c) {
    const q = filmName(c.title);
    if (!q) return null;
    const d = new DOMParser().parseFromString(await api.fetch('https://www.rottentomatoes.com/search?search=' + encodeURIComponent(q), null, false, true), 'text/html');
    const rows = [...d.querySelectorAll('search-page-result[type="movie"], search-page-result[type="tvSeries"]')].flatMap(sec => [...sec.querySelectorAll('search-page-media-row')].map(r => ({
      names: [r.querySelector('a[slot="title"]')?.textContent], series: sec.getAttribute('type') === 'tvSeries',
      year: ['release-year', 'releaseyear', 'startyear', 'start-year'].map(k => r.getAttribute(k)).find(Boolean), value: r.getAttribute('tomatometer-score') || r.getAttribute('tomatometerscore'),
    })));
    return filmScore('Rotten Tomatoes', filmPick(rows, c)?.value);
  }
  async function metacritic(c) {
    const q = filmName(c.title);
    if (!q) return null;
    const j = JSON.parse(await api.fetch('https://backend.metacritic.com/finder/metacritic/search/' + encodeURIComponent(q) + '/web?offset=0&limit=12&mcoTypeId=1%2C2&componentName=search-tabs&componentDisplayName=Search+Page+Tab+Filters&componentType=FilterConfig', null, false, true));
    const rows = (j.data?.items || []).filter(h => ['show', 'movie'].includes(h.type)).map(h => ({ names: [h.title], year: h.premiereYear, series: h.type === 'show', value: h.criticScoreSummary?.score }));
    return filmScore('Metacritic', filmPick(rows, c)?.value);
  }
  // a title's score, asked by each of its names (Scores.malFind): its search page has a row per title, its name in bold, its type, and last its
  // score; a search it's sure of goes straight to the title's own page, and one finding nothing is a 404. manga.php has the light novels too
  async function mal(c) {
    const kind = c.type === 'manga' ? 'manga' : 'anime', exact = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), key = s => exact(s).replace(/^the /, '');
    const score = s => { const v = Number(s); return v > 0 && v <= 10 ? { source: 'MyAnimeList', value: v.toFixed(2) } : null; };
    const page = async url => { try { return new DOMParser().parseFromString(await api.fetch(url, null, false, true), 'text/html'); } catch (e) { if (/HTTP 404/.test(e.message)) return null; throw e; } };
    // a title's own page, with every name it goes by
    const title = d => {
      if (!/\/(anime|manga)\/\d+/.test(d.querySelector('meta[property="og:url"]')?.content || '')) return null;
      const lines = [...d.querySelectorAll('.spaceit_pad')].map(x => x.textContent.trim()), line = k => lines.find(l => l.startsWith(k + ':'))?.slice(k.length + 1).trim() || '';
      return { names: [d.querySelector('meta[property="og:title"]')?.content, line('English'), line('Synonyms'), ...line('Synonyms').split(', ')].filter(Boolean), type: line('Type'), score: d.querySelector('span[itemprop="ratingValue"]')?.textContent };
    };
    // what it went straight to is what it took the words for: most of them there, and every number (another season's isn't this one)
    const trusts = (asked, t) => {
      const words = exact(asked).split(' '), theirs = new Set(t.names.flatMap(n => exact(n).split(' '))), digits = l => [...l].flatMap(w => w.match(/\d+/g) || []), own = new Set(digits(theirs));
      return words.filter(w => theirs.has(w)).length * 2 >= words.length && digits(words).every(n => own.has(n));
    };
    const names = [c.title, ...(c.alt || '').split(/[|,،]/)].map(s => s.trim().replace(/\s*cour 1$/i, '').replace(/cour (\d+)$/i, 'part $1')).filter(exact), want = new Set(names.map(key));
    let near = [];
    for (const name of names.slice(0, 3)) {
      const d = await page(`https://myanimelist.net/${kind}.php?q=${encodeURIComponent(name)}&cat=${kind}`);
      if (!d) continue;
      const t = title(d);
      if (t) { if (!/Novel/.test(t.type) && trusts(name, t) && score(t.score)) return score(t.score); continue; }
      const rows = [...new Set([...d.querySelectorAll('a.hoverinfo_trigger strong')].map(s => s.closest('tr')).filter(Boolean))].filter(r => !/Novel/.test(r.children[2]?.textContent));
      const named = r => r.querySelector('a.hoverinfo_trigger strong').textContent, same = rows.filter(r => want.has(key(named(r))));
      if (same.length === 1 && score(same[0].lastElementChild.textContent)) return score(same[0].lastElementChild.textContent);
      if (!same.length && !near.length) near = rows.slice(0, 2).map(r => r.querySelector('a.hoverinfo_trigger[href*="/' + kind + '/"]')?.href).filter(Boolean);
    }
    // none by name: its first rows' own pages, for one with that name among its others
    for (const url of near) {
      const d = await page(url), t = d && title(d);
      if (t && !/Novel/.test(t.type) && t.names.some(n => want.has(key(n)))) return score(t.score);
    }
    return null;
  }
  async function anilist(c, title) {
    const query = 'query($search:String,$type:MediaType){Page(perPage:10){media(search:$search,type:$type){title{romaji english native} synonyms averageScore}}}';
    const j = JSON.parse(await api.fetch('https://graphql.anilist.co', { query, variables: JSON.stringify({ search: c.title, type: c.type === 'manga' ? 'MANGA' : 'ANIME' }) }));
    const matches = (j.data?.Page?.media || []).filter(m => [...Object.values(m.title), ...m.synonyms].some(n => norm(n) === title));
    const v = matches.length === 1 && matches[0].averageScore;
    return v > 0 ? { source: 'AniList', value: (v / 10).toFixed(1) } : null;
  }
  const logo = source => source === 'MyAnimeList' ? '<svg viewBox="0 0 64 30" aria-label="MyAnimeList" role="img"><rect width="64" height="30" rx="4" fill="#2e51a2"/><text x="32" y="22" text-anchor="middle" font-family="Arial" font-weight="900" font-size="20" fill="#fff">MAL</text></svg>' : source === 'IMDb' ? '<svg viewBox="0 0 64 30" aria-label="IMDb" role="img"><rect width="64" height="30" rx="4" fill="#f5c518"/><text x="5" y="22" font-family="Arial" font-weight="900" font-size="22" fill="#000">IMDb</text></svg>' : '<svg viewBox="0 0 40 30" aria-label="AniList" role="img"><path fill="#02a9ff" d="M0 30 9 0h8l9 30h-8l-2-7H9l-2 7zm11-14h3l-1.5-6z"/><path fill="#9fcdff" d="M25 0h7v23h8v7H25z"/></svg>';
  const badge = (source, value) => ['Rotten Tomatoes', 'Metacritic'].includes(source) ? `<b>${source === 'Metacritic' ? 'MC' : 'RT'} ${esc(value)}%</b>` : `${logo(source)}<b>★ ${esc(value)}</b><small>/10</small>`;
  // ---------- the show page's graph: each episode's rating, as [season, episode, score] ----------
  // the sites spell a name their own way: "Shippuuden", "Shippūden", "Shippuden"
  const spelled = s => filmName(String(s || '').normalize('NFD').replace(/\p{M}/gu, '')).replace(/([ou])u/g, '$1');
  const inOrder = rows => rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // season and number left out: a special, not on the line. Anime seasons are often years on tvmaze
  const tvmazeRows = eps => inOrder(eps.filter(e => e.season > 0 && e.number > 0 && e.rating?.average > 0).map(e => [e.season, e.number, e.rating.average]));
  const imdbRows = edges => inOrder(edges.flatMap(({ node: n }) => {
    const d = n.series?.displayableEpisodeNumber, s = +d?.displayableSeason?.season, ep = +d?.episodeNumber?.episodeNumber, score = n.ratingsSummary?.aggregateRating;
    return s > 0 && ep > 0 && score > 0 ? [[s, ep, score]] : [];
  }));
  // the one show of one of these names (two: none, rather than the wrong one's). An anime's is the animation: One Piece is live action too
  const pickShow = (shows, want, anime) => {
    const same = shows.filter(s => want.has(spelled(s.name)) && (!anime || s.type === 'Animation'));
    return same.length === 1 ? same[0] : null;
  };
  const getJson = url => api.fetch(url, null, false, true).then(JSON.parse);
  const asked = names => [...new Set(names.map(filmName).filter(Boolean))].slice(0, 6); // kitsu's list can run to 20 languages: tvmaze allows 20 calls in 10s
  const findShow = async (names, anime) => {
    const want = new Set(names.map(spelled).filter(Boolean));
    for (const q of asked(names)) { // spelled is for comparing, not asking: "Tokyo Ghoul" isn't "tokyo ghol" to a search
      const hit = pickShow((await getJson('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q))).map(x => x.show), want, anime);
      if (hit) return hit;
    }
    return null;
  };
  const imdbId = async names => {
    const want = new Set(names.map(spelled));
    for (const q of asked(names)) {
      const hits = ((await getJson(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`)).d || []).filter(h => /^tt\d+$/.test(h.id) && /^tv(Series|MiniSeries)$/.test(h.qid) && want.has(spelled(h.l)));
      if (hits.length === 1) return hits[0].id;
    }
    return '';
  };
  async function imdbEps(tt) {
    const edges = [];
    for (let after = '', page = 0; page < 10; page++) { // 250 a page, what it allows: One Piece's 1200 is 5
      const query = `query{title(id:${JSON.stringify(tt)}){episodes{episodes(first:250${after && `,after:${JSON.stringify(after)}`}){pageInfo{hasNextPage endCursor} edges{node{series{displayableEpisodeNumber{displayableSeason{season} episodeNumber{episodeNumber}}} ratingsSummary{aggregateRating}}}}}}}`;
      const e = JSON.parse(await api.fetch('https://caching.graphql.imdb.com/', { query }, false, true)).data?.title?.episodes?.episodes;
      edges.push(...(e?.edges || []));
      if (!e?.pageInfo?.hasNextPage) break;
      after = e.pageInfo.endCursor;
    }
    return imdbRows(edges);
  }
  // both sites, each an extra: found by the show's names, else kitsu's (witanime's "Kimetsu no Yaiba" is "Demon Slayer"). tvmaze
  // names its imdb id, so the two are one show. Fewer than 2 rated: no line to draw
  const episodes = (names, id, anime) => scraper.remember('epRatings:' + [id, ...names.map(spelled)].join(), async () => {
    let all = names.filter(spelled), show = await findShow(all, anime).catch(() => null);
    if (!show && anime) {
      const kitsu = (await scraper.kitsuShow(all).catch(() => null))?.names || [];
      all = [...all, ...kitsu];
      show = await findShow(kitsu, true).catch(() => null);
    }
    const tt = id || show?.externals?.imdb || await imdbId(all).catch(() => '');
    const [tvmaze, imdb] = await Promise.all([show ? getJson(`https://api.tvmaze.com/shows/${show.id}/episodes`).then(tvmazeRows).catch(() => []) : [], tt ? imdbEps(tt).catch(() => []) : []]);
    return tvmaze.length > 1 || imdb.length > 1 ? { imdb, tvmaze, url: show?.url || '' } : null; // none isn't kept: it may be a blip
  });
  // the y axis: whole scores, from just under the lowest
  const graphFloor = rows => Math.min(9, Math.floor(Math.min(...rows.map(r => r[2]))));
  const seasonName = s => (s > 1900 ? String(s) : t('seasonShort') + s);
  const epLine = r => `⁦${seasonName(r[0])} ${t('epShort')} ${r[1]}⁩ · ★ ${r[2].toFixed(1)}`;
  function drawGraph(box, rows) {
    const W = Math.max(box.clientWidth, 280), H = 200, L = 26, T = 8, B = 20, lo = graphFloor(rows);
    const x = i => L + i * (W - L - 2) / (rows.length - 1), y = v => T + (10 - v) * (H - T - B) / (10 - lo);
    let i = rows.reduce((best, r, n) => (r[2] > rows[best][2] ? n : best), 0); // starts on the best one, to say what the line means
    const starts = rows.flatMap((r, n) => (!n || rows[n - 1][0] !== r[0] ? [n] : []));
    const lines = starts.map((n, k) => `<polyline points="${rows.slice(n, starts[k + 1]).map((r, m) => `${x(n + m).toFixed(1)},${y(r[2]).toFixed(1)}`).join(' ')}"/>`).join('');
    const grid = Array.from({ length: 10 - lo + 1 }, (_, k) => lo + k).map(v => `<line class="eg-grid" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 4}">${v}</text>`).join('');
    // room for it: a thousand episodes of year-long seasons would be a smudge of numbers
    const seasons = starts.map((n, k) => `${n ? `<line class="eg-grid" x1="${x(n)}" x2="${x(n)}" y1="${T}" y2="${H - B}"/>` : ''}${x(starts[k + 1] ?? rows.length - 1) - x(n) > 34 ? `<text x="${x(n) + 2}" y="${H - 6}">${esc(seasonName(rows[n][0]))}</text>` : ''}`).join('');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="${esc(t('epRatings'))}">${grid}${seasons}${lines}<circle r="4"/></svg><p dir="auto"></p>`;
    const svg = box.firstChild, dot = svg.querySelector('circle'), read = box.lastChild;
    const show = () => { dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(rows[i][2])); read.textContent = epLine(rows[i]); };
    svg.onpointerdown = svg.onpointermove = e => { const b = svg.getBoundingClientRect(); i = Math.max(0, Math.min(rows.length - 1, Math.round(((e.clientX - b.left) / b.width * W - L) / (W - L - 2) * (rows.length - 1)))); show(); };
    show();
  }
  async function graph(el, names, id, anime) {
    const g = await episodes(names, id, anime).catch(() => null);
    if (!g || !el.isConnected) return; // left the page meanwhile: this section's gone with it
    const sources = [['IMDb', g.imdb], ['TVmaze', g.tvmaze]].filter(([, rows]) => rows.length > 1);
    el.hidden = false;
    el.innerHTML = `<h2>${t('epRatings')}</h2><div class="fchips">${sources.map(([name], k) => `<button class="fchip ${k ? '' : 'on'}" data-k="${k}">${name}</button>`).join('')}</div><div class="eg"></div>${g.url && sources.some(([name]) => name === 'TVmaze') ? `<small><a href="${esc(g.url)}" target="_blank" rel="noopener">TVmaze · CC BY-SA</a></small>` : ''}`;
    const box = el.querySelector('.eg');
    el.querySelector('.fchips').onclick = e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      el.querySelectorAll('.fchip').forEach(c => c.classList.toggle('on', c === b));
      drawGraph(box, sources[b.dataset.k][1]);
    };
    drawGraph(box, sources[0][1]);
  }
  const observer = new IntersectionObserver(entries => entries.forEach(async ({target, isIntersecting}) => {
    if (!isIntersecting) return;
    observer.unobserve(target);
    const c = JSON.parse(target.dataset.rating), key = JSON.stringify(c);
    if (!cache.has(key)) cache.set(key, scraper.remember('ratings3:' + key, () => enqueue(c))); // new lookup rules: discard the old cached misses and IMDb-only film answers
    const r = await cache.get(key);
    if (r?.length && target.isConnected) { target.innerHTML = r.map(x => badge(x.source, x.value)).join(''); target.title = r.map(x => x.source).join(' · '); }
  }), {rootMargin:'100px'});
  new MutationObserver(() => document.querySelectorAll('[data-rating]:not([data-rating-ready])').forEach(el => { el.dataset.ratingReady = '1'; observer.observe(el); })).observe(document.documentElement, {childList:true, subtree:true});
  return {
    // a supplied IMDb score is shown immediately; the other sources are still looked up
    slot: c => `<span class="source-rating" data-rating="${esc(JSON.stringify({title:c.title, alt:c.alt || '', type:c.type, path:c.path || '', year:c.year || '', imdb:c.imdb || ''}))}">${c.imdb ? badge('IMDb', c.imdb) : ''}</span>`,
    graph,
  };
})();
