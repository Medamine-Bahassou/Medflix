// Source ratings only. Lazy lookup avoids requesting every off-screen card.
const Ratings = (() => {
  const cache = new Map();
  let queue = Promise.resolve();
  const enqueue = c => {
    const task = queue.then(() => lookup(c)).catch(() => null);
    queue = task.then(() => new Promise(resolve => setTimeout(resolve, 2200)));
    return task;
  };
  const exact = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
    const kind = c.type === 'manga' ? 'manga' : 'anime', key = s => exact(s).replace(/^the /, '');
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
    const alts = (c.alt || '').split(/[|,،]/);
    // a film's page: its title can be its TV show's name, its English one says which ("The Dangers in My Heart: The Movie")
    const names = (/^\/movie\//.test(c.path || '') ? [...alts, c.title] : [c.title, ...alts]).map(s => s.trim().replace(/\s*cour 1$/i, '').replace(/cour (\d+)$/i, 'part $1')).filter(exact), want = new Set(names.map(key));
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
    const query = 'query($search:String,$type:MediaType){Page(perPage:10){media(search:$search,type:$type){format title{romaji english native} synonyms averageScore}}}';
    const manga = c.type === 'manga', named = (m, is) => [...Object.values(m.title), ...m.synonyms].some(is);
    for (const search of new Set([c.title, c.alt].filter(Boolean))) { // its search can miss a title it knows by the other name ("Ao Ashi Season 2", "Aoashi Season 2")
      const j = JSON.parse(await api.fetch('https://graphql.anilist.co', { query, variables: JSON.stringify({ search, type: manga ? 'MANGA' : 'ANIME' }) }));
      const media = j.data?.Page?.media || [], by = want => media.filter(m => named(m, n => exact(n) === exact(want)));
      // the exact name first, the English one before the title (a film's page: its romaji name can be its TV show's), then one with the season dropped
      const hits = [c.alt && by(c.alt), by(c.title), media.filter(m => named(m, n => norm(n) === title))].find(l => l?.length) || [];
      const main = hits.filter(m => m.format === (manga ? 'MANGA' : 'TV')); // a special can go by its show's name
      const hit = hits.length === 1 ? hits[0] : main.length === 1 ? main[0] : null;
      if (hit) return hit.averageScore > 0 ? { source: 'AniList', value: (hit.averageScore / 10).toFixed(1) } : null;
    }
    return null;
  }
  // the sites' own logos, the same files the app shows (android's drawable-nodpi/logo_*.png)
  const LOGO = { IMDb: 'imdb', 'Rotten Tomatoes': 'rt', Metacritic: 'mc', MyAnimeList: 'mal', AniList: 'anilist' };
  // one badge per source, its full name on hover: a percent for Rotten Tomatoes, Metacritic's score out of 100, the rest out of 10
  const badge = (source, value) => {
    const score = Number.isFinite(+value) ? String(+value) : String(value), percent = source === 'Rotten Tomatoes', scale = !percent && source !== 'Metacritic';
    return `<span class="rb" role="img" aria-label="${esc(source + ': ' + score + (percent ? '%' : scale ? '/10' : '/100'))}"><img src="assets/ratings/${LOGO[source] || 'anilist'}.png" alt=""><span class="rb-name">${esc(source)}</span><span class="rb-score"><b>${esc(score)}${percent ? '%' : ''}</b>${scale ? '<small>/10</small>' : ''}</span></span>`;
  };
  // ---------- the show page's graph: each episode's rating, as [season, episode, score] ----------
  // the sites spell a name their own way: "Shippuuden", "Shippūden", "Shippuden"
  const spelled = s => filmName(String(s || '').normalize('NFD').replace(/\p{M}/gu, '')).replace(/([ou])u/g, '$1');
  const inOrder = rows => rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // season and number left out: a special, no place in the grid. No score yet stays (null): the grid's "?". Anime seasons are often years on tvmaze
  const tvmazeRows = eps => inOrder(eps.filter(e => e.season > 0 && e.number > 0).map(e => [e.season, e.number, e.rating?.average > 0 ? e.rating.average : null]));
  const imdbRows = edges => inOrder(edges.flatMap(({ node: n }) => {
    const d = n.series?.displayableEpisodeNumber, s = +d?.displayableSeason?.season, ep = +d?.episodeNumber?.episodeNumber, score = n.ratingsSummary?.aggregateRating;
    return s > 0 && ep > 0 ? [[s, ep, score > 0 ? score : null]] : [];
  }));
  const rated = rows => rows.filter(r => r[2] > 0).length;
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
  // ---------- AniList and myanimelist ----------
  const SHOWS = ['TV', 'TV_SHORT', 'ONA'], ANI_LINKS = 'id idMal format relations{edges{relationType node{id format type}}}';
  // the one title of one of these names (two: none, rather than the wrong one's): its own name before another's synonym, as "Wan Piece" goes by
  // "One Piece" too. Not its native: latin letters alone, "ONE PIECE パーティー" would read "one piece". A manga's isn't its light novel or its pilot, often of that very name
  const aniPick = (rows, names, anime) => {
    const want = new Set(names.map(exact).filter(Boolean));
    const kept = rows.filter(m => (anime ? SHOWS.includes(m.format) : !['NOVEL', 'ONE_SHOT'].includes(m.format))), named = list => list.some(n => want.has(exact(n)));
    const own = kept.filter(m => named([m.title.romaji, m.title.english])), same = own.length ? own : kept.filter(m => named(m.synonyms));
    return same.length === 1 ? same[0] : null;
  };
  const aniAsk = query => api.fetch('https://graphql.anilist.co', { query }, false, true).then(JSON.parse).then(j => j.data);
  const aniFind = async (names, anime) => {
    const latin = [...new Set(names.map(s => s.trim().replace(/\s*cour 1$/i, '').replace(/cour (\d+)$/i, 'part $1')).filter(exact))]; // an exact name: a near one is often another season
    for (const q of latin.slice(0, 3)) {
      const hit = aniPick((await aniAsk(`{Page(perPage:10){media(search:${JSON.stringify(q)},type:${anime ? 'ANIME' : 'MANGA'}){${ANI_LINKS} title{romaji english} synonyms stats{scoreDistribution{score amount}}}}}`)).Page.media, latin, anime);
      if (hit) return hit;
    }
    return null;
  };
  // its next season that way; a show before a film, when both follow it
  const aniNext = (m, way) => {
    const next = (m.relations?.edges || []).filter(e => e.relationType === way && e.node.type === 'ANIME').map(e => e.node);
    return next.find(n => SHOWS.includes(n.format)) || next[0];
  };
  // every season's myanimelist id, first to last: it lists each as its own title. Films are walked through, not kept: Demon Slayer's seasons have Mugen Train between them
  const seasonIds = async hit => {
    const seen = new Set([hit.id]);
    const walk = async way => {
      const out = [];
      for (let m = hit, i = 0; i < 12; i++) {
        const next = aniNext(m, way);
        if (!next || seen.has(next.id)) break;
        seen.add(next.id);
        m = (await aniAsk(`{Media(id:${next.id}){${ANI_LINKS}}}`).catch(() => null))?.Media;
        if (!m) break;
        out.push(m);
      }
      return out;
    };
    return [...(await walk('PREQUEL')).reverse(), hit, ...await walk('SEQUEL')].filter(m => SHOWS.includes(m.format)).map(m => m.idMal);
  };
  // a page of its episode list: each one's number and its poll's score, out of 5 there, out of 10 like the grid's others. No votes yet: null
  const malEpisodes = html => html.split('episode-list-data').slice(1).flatMap(row => {
    const n = row.match(/episode-number[^>]*data-raw="(\d+)"/)?.[1], v = +row.match(/episode-poll[^>]*data-raw="([\d.]+)"/)?.[1];
    return n ? [[+n, v > 0 ? v * 2 : null]] : [];
  });
  // how many gave each score, 10 down to 1; from its table: the title's own score, higher up the page, is a score-label too
  const malVotes = html => {
    const votes = Array(10).fill(0);
    for (const [, s, n] of html.slice(html.indexOf('score-stats')).matchAll(/score-label score-(\d+)[\s\S]*?\((\d+) votes\)/g)) votes[10 - s] = +n;
    return votes;
  };
  const aniVotes = m => [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(s => m.stats?.scoreDistribution?.find(d => d.score === s * 10)?.amount || 0);
  const summed = votes => votes.reduce((a, b) => a + b, 0);
  const malSeasons = async ids => {
    const rows = [];
    for (const [i, id] of ids.entries()) {
      if (!id) continue;
      try {
        for (let offset = 0; offset < 2000; offset += 100) { // 100 a page: One Piece's 1200 is 12
          const page = malEpisodes(await api.fetch(`https://myanimelist.net/anime/${id}/x/episode?offset=${offset}`, null, false, true));
          rows.push(...page.map(([n, v]) => [i + 1, n, v]));
          if (page.length < 100) break;
        }
      } catch {} // the seasons it did give stand
    }
    return inOrder(rows);
  };
  // a manga's: neither site rates its chapters, so how many gave it each score
  const mangaVotes = names => scraper.remember('mangaRatings:' + names.map(exact).join(), async () => {
    const hit = await aniFind(names, false).catch(() => null);
    if (!hit) return null;
    const mal = hit.idMal ? await api.fetch(`https://myanimelist.net/manga/${hit.idMal}/x/stats`, null, false, true).then(malVotes).catch(() => []) : [];
    const votes = [['AniList', aniVotes(hit)], ['MyAnimeList', mal]].filter(([, v]) => summed(v) > 0);
    return votes.length ? { votes } : null;
  });
  // both sites, each an extra: found by the show's names, else kitsu's (witanime's "Kimetsu no Yaiba" is "Demon Slayer"). tvmaze
  // names its imdb id, so the two are one show. Fewer than 2 rated: nothing to compare. An anime has myanimelist's too, its seasons
  // by AniList, which rates none of its episodes: its own part is the title's votes
  const episodes = (names, id, anime) => scraper.remember('epRatings2:' + [id, ...names.map(spelled)].join(), async () => {
    let all = names.filter(spelled);
    const ani = anime ? aniFind(all, true).catch(() => null) : null, ml = ani ? ani.then(hit => (hit ? seasonIds(hit).then(malSeasons) : [])).catch(() => []) : [];
    let show = await findShow(all, anime).catch(() => null);
    if (!show && anime) {
      const kitsu = (await scraper.kitsuShow(all).catch(() => null))?.names || [];
      all = [...all, ...kitsu];
      show = await findShow(kitsu, true).catch(() => null);
    }
    const tt = id || show?.externals?.imdb || await imdbId(all).catch(() => '');
    const [tvmaze, imdb, mal, hit] = await Promise.all([show ? getJson(`https://api.tvmaze.com/shows/${show.id}/episodes`).then(tvmazeRows).catch(() => []) : [], tt ? imdbEps(tt).catch(() => []) : [], ml, ani]);
    const votes = hit && summed(aniVotes(hit)) > 0 ? [['AniList', aniVotes(hit)]] : [];
    return rated(tvmaze) > 1 || rated(imdb) > 1 || rated(mal) > 1 || votes.length ? { imdb, tvmaze, url: show?.url || '', mal, votes } : null; // none isn't kept: it may be a blip
  });
  const seasonName = s => (s > 1900 ? String(s) : t('seasonShort') + s);
  // the grid's colours, best first (style.css .eg-t0...), by the score each starts at
  const tier = v => { const i = [9.6, 9, 8, 7, 6, 5].findIndex(m => v >= m); return i < 0 ? 6 : i; };
  const seasonAvg = (rows, s) => { const v = rows.filter(r => r[0] === s && r[2] > 0).map(r => r[2]); return v.length ? (v.reduce((a, b) => a + b) / v.length).toFixed(1) : '–'; };
  // a column a season, a row an episode. By the numbers it has, not 1 to the last: a talk show's can be dates, a million rows
  function gridHtml(rows) {
    const seasons = [...new Set(rows.map(r => r[0]))], eps = [...new Set(rows.map(r => r[1]))].sort((a, b) => a - b), at = new Map(rows.map(r => [r[0] + '/' + r[1], r[2]]));
    const cell = (s, n) => {
      const k = s + '/' + n, v = at.get(k), name = `${seasonName(s)} ${t('epShort')} ${n}`;
      return !at.has(k) ? '<td></td>' : v > 0 ? `<td class="eg-t${tier(v)}" title="${name}">${v.toFixed(1)}</td>` : `<td class="eg-q" title="${name}">?</td>`; // listed, no score yet
    };
    return `<div class="eg-legend">${[0, 1, 2, 3, 4, 5, 6].map(i => `<span><i class="eg-t${i}"></i>${t('tier' + i)}</span>`).join('')}</div>
      <div class="eg-scroll"><table><thead><tr><th></th>${seasons.map(s => `<th>${seasonName(s)}</th>`).join('')}</tr></thead>
      <tbody>${eps.map(n => `<tr><th>${t('epShort')}${n}</th>${seasons.map(s => cell(s, n)).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th>${t('avgShort')}</th>${seasons.map(s => `<th>${seasonAvg(rows, s)}</th>`).join('')}</tr></tfoot></table></div>`;
  }
  // how many gave the title each score, 10 down to 1, in the grid's colours
  const votesHtml = votes => {
    const top = Math.max(...votes, 1), all = summed(votes) || 1;
    return `<p class="sheet-text">${t('voteShare')} · ${summed(votes).toLocaleString()}</p><div class="eg-votes">${votes.map((n, i) => `<div><b>${10 - i}</b><span><i class="eg-t${tier(10 - i)}" style="width:${n / top * 100}%"></i></span><small>\u2066${(n / all * 100).toFixed(1)}%\u2069</small></div>`).join('')}</div>`;
  };
  async function graph(el, names, id, anime, manga) {
    el.innerHTML = '<div class="spin"></div>';
    const g = await (manga ? mangaVotes(names) : episodes(names, id, anime)).catch(() => null);
    if (!el.isConnected) return; // closed meanwhile
    const sources = g ? [['MyAnimeList', g.mal || []], ['IMDb', g.imdb || []], ['TVmaze', g.tvmaze || []]].filter(([, rows]) => rated(rows) > 1) : [], votes = g?.votes || [];
    if (!sources.length && !votes.length) { el.innerHTML = `<p class="sheet-text">${t(manga ? 'noRatings' : 'noEpRatings')}</p>`; return; }
    const draw = k => { box.innerHTML = k < sources.length ? gridHtml(sources[k][1]) : votesHtml(votes[k - sources.length][1]); };
    el.innerHTML = `<div class="fchips">${[...sources, ...votes].map(([name], k) => `<button class="fchip ${k ? '' : 'on'}" data-k="${k}">${name}</button>`).join('')}</div><div class="eg"></div>${g.url && sources.some(([name]) => name === 'TVmaze') ? `<small><a href="${esc(g.url)}" target="_blank" rel="noopener">TVmaze · CC BY-SA</a></small>` : ''}`;
    const box = el.querySelector('.eg');
    el.querySelector('.fchips').onclick = e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      el.querySelectorAll('.fchip').forEach(c => c.classList.toggle('on', c === b));
      draw(+b.dataset.k);
    };
    draw(0);
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
  // ---------- the slider's picture ----------
  // a title's frames on IMDb: the sites only have small posters. Its own files run to 10000px: amazon's image service sizes them by address
  const sized = (url, by) => url.replace(/\._V1_.*\.(\w+)$/, `._V1_QL75_${by}_.$1`);
  const frames = async name => {
    const query = 'query{mainSearch(first:6,options:{searchTerm:' + JSON.stringify(name) + ',type:TITLE}){edges{node{entity{... on Title{titleType{id} titleText{text} originalTitleText{text} releaseYear{year} titleGenres{genres{genre{text}}} primaryImage{url} images(first:20,filter:{types:["still_frame"]}){edges{node{url width height}}}}}}}}}';
    const j = JSON.parse(await api.fetch('https://caching.graphql.imdb.com/', { query }, false, true));
    return (j.data?.mainSearch?.edges || []).map(e => e.node?.entity).filter(h => /^(movie|tvMovie|tvSeries|tvMiniSeries)$/.test(h?.titleType?.id)).map(h => ({
      names: [h.titleText?.text, h.originalTitleText?.text], year: h.releaseYear?.year, series: h.titleType.id !== 'movie' && h.titleType.id !== 'tvMovie',
      anime: !!h.titleGenres?.genres?.some(g => g.genre?.text === 'Animation'), poster: h.primaryImage?.url,
      still: h.images?.edges.map(e => e.node).find(i => i.width >= 1280 && i.width / i.height >= 1.3)?.url, // its portraits and small old ones would blur again
    }));
  };
  // wide stills only: portrait posters leave an empty backdrop instead of being stretched across it.
  const art = h => scraper.remember('art:wide2:' + h.info + '|' + h.title + '|' + (h.year || ''), async () => {
    const name = filmName(h.title);
    if (!name) return ''; // only an Arabic name: IMDb has it under another
    if (/^#\/cinema\//.test(h.info)) { // by name, kind and year: two 2026 films are called The Odyssey
      const hit = filmPick(await frames(name), { title: h.title, year: h.year, path: decodeURIComponent(h.info.slice(1)) });
      return hit?.still ? sized(hit.still, 'UX1920') : '';
    }
    if (!/^#\/title\//.test(h.info)) return '';
    // the animated one (One Piece has a live action of its name). A romaji name is often not IMDb's: AniList knows its English one
    const still = async (ask, want) => (await frames(ask)).find(r => r.anime && r.still && r.names.some(n => want.includes(filmName(n))))?.still;
    let url = await still(name, [name]);
    if (!url) {
      const query = `{Page(perPage:6){media(search:${JSON.stringify(name)},type:ANIME,sort:SEARCH_MATCH){title{romaji english} synonyms}}}`;
      const media = JSON.parse(await api.fetch('https://graphql.anilist.co', { query })).data?.Page?.media || [];
      const hit = media.find(m => [...Object.values(m.title), ...m.synonyms].some(n => filmName(n) === name));
      for (const other of new Set(hit ? [hit.title.english, hit.title.romaji].filter(Boolean).map(filmName).filter(n => n && n !== name) : [])) if ((url = await still(other, [name, other]))) break;
    }
    return url ? sized(url, 'UX1920') : '';
  });
  return {
    // a supplied IMDb score is shown immediately; the other sources are still looked up
    slot: c => `<span class="source-rating" data-rating="${esc(JSON.stringify({title:c.title, alt:c.alt || '', type:c.type, path:c.path || '', year:c.year || '', imdb:c.imdb || ''}))}">${c.imdb ? badge('IMDb', c.imdb) : ''}</span>`,
    graph,
    art,
  };
})();
