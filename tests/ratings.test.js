const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function ratings(fetch = async () => { throw Error('offline'); }) {
  const ctx = { DOMParser: class { parseFromString() { return { querySelectorAll: () => [] }; } }, api: { fetch }, IntersectionObserver: class { observe() {} }, MutationObserver: class { observe() {} }, document: { documentElement: {} }, esc: s => s, t: k => ({ seasonShort: 'S', epShort: 'E', avgShort: 'AVG' })[k] || k, scraper: { remember: (k, go) => go(), kitsuShow: async () => null } };
  vm.createContext(ctx);
  const code = fs.readFileSync('ratings.js', 'utf8').replace('  return {\n    // a supplied', '  this.testing = { lookup, filmPick, filmScore, spelled, tvmazeRows, imdbRows, pickShow, rated, tier, seasonAvg, gridHtml, aniPick, aniNext, aniVotes, malEpisodes, malVotes, votesHtml };\n  return {\n    // a supplied');
  vm.runInContext(code + '\nthis.ratings = Ratings;', ctx);
  return { ...ctx.testing, ...ctx.ratings };
}
const film = (title, year = '') => ({ type: 'cinema', title, year, path: '/cinema/movie' });
test('episode graph: the sites\' spellings of a show are one name', () => {
  const { spelled } = ratings();
  assert.equal(spelled('Naruto: Shippuuden'), spelled('Naruto: Shippūden'));
  assert.equal(spelled('Naruto: Shippuden'), spelled('Naruto: Shippūden'));
  assert.equal(spelled('مسلسل Breaking Bad الموسم الاول'), 'breaking bad');
  assert.equal(spelled('Breaking Bad Season 2'), 'breaking bad');
  assert.equal(spelled('المؤسس عثمان'), '');
});
test('episode graph: an anime takes the animation, and two of a name are none', () => {
  const { pickShow, spelled } = ratings();
  const live = { name: 'One Piece', type: 'Scripted' }, anime = { name: 'One Piece', type: 'Animation' };
  const want = new Set([spelled('One Piece')]);
  assert.equal(pickShow([live, anime], want, true), anime);
  assert.equal(pickShow([live, anime], want, false), null);
  assert.equal(pickShow([live], want, true), null);
  assert.equal(pickShow([{ name: 'The One Piece', type: 'Animation' }], want, true), null);
});
test('episode grid: tvmaze rows in order, specials out, no score yet kept as null', () => {
  const { tvmazeRows, rated } = ratings();
  const e = (season, number, average) => ({ season, number, rating: { average } });
  const rows = tvmazeRows([e(2, 1, 8), e(1, 2, 7.5), e(1, 1, 9), e(1, null, 9), e(1, 3, null)]);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [[1, 1, 9], [1, 2, 7.5], [1, 3, null], [2, 1, 8]]);
  assert.equal(rated(rows), 3);
});
test('episode grid: imdb rows read its numbers, and skip what has none', () => {
  const { imdbRows } = ratings();
  const edge = (season, episodeNumber, aggregateRating) => ({ node: { series: { displayableEpisodeNumber: { displayableSeason: { season }, episodeNumber: { episodeNumber } } }, ratingsSummary: { aggregateRating } } });
  assert.deepEqual(JSON.parse(JSON.stringify(imdbRows([edge('1', '2', 8.6), edge('1', '1', 9.1), edge('unknown', '3', 8), edge('1', '4', null), { node: {} }]))), [[1, 1, 9.1], [1, 2, 8.6], [1, 4, null]]);
});
test('episode grid: a score takes the tier it reaches', () => {
  const { tier } = ratings();
  // the picture asked for: 9.7 the top tier, 9.5 and 9.0 the next, 8.9 the next
  assert.deepEqual([9.7, 9.6, 9.5, 9, 8.9, 8, 7.9, 7, 6, 5, 4.9, 1].map(tier), [0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 6]);
});
test('episode grid: a season averages only its scored episodes', () => {
  const { seasonAvg } = ratings();
  const rows = [[1, 1, 9], [1, 2, null], [1, 3, 8], [2, 1, null]];
  assert.equal(seasonAvg(rows, 1), '8.5');
  assert.equal(seasonAvg(rows, 2), '–');
});
test('episode grid: columns by season, rows by episode, "?" for no score, blank for no such episode', () => {
  const { gridHtml } = ratings();
  const html = gridHtml([[1, 1, 8.9], [1, 2, 9.7], [2, 1, 9], [2, 2, null], [2, 3, null]]);
  const rows = html.split('<tbody>')[1].split('</tbody>')[0].split('</tr>').filter(r => r.includes('<td')).map(r => [...r.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]));
  assert.deepEqual(rows, [['8.9', '9.0'], ['9.7', '?'], ['', '?']]);
  assert.match(html, /<th>S1<\/th><th>S2<\/th>/);
  assert.match(html, /eg-t2[^>]*>8\.9/);
  assert.match(html, /eg-t0[^>]*>9\.7/);
  assert.match(html, /<th>AVG<\/th><th>9\.3<\/th><th>9\.0<\/th>/);
});
test('episode grid sheet: spins, then says so when no site has the show', async () => {
  const { graph } = ratings();
  const el = { isConnected: true, innerHTML: '' }, asked = graph(el, ['Nothing Known'], '', false);
  assert.match(el.innerHTML, /spin/);
  await asked;
  assert.match(el.innerHTML, /noEpRatings/);
});
test('episode grid sheet: closed before the answer, nothing is drawn', async () => {
  const { graph } = ratings();
  const el = { isConnected: false, innerHTML: '' };
  await graph(el, ['Nothing Known'], '', false);
  assert.match(el.innerHTML, /spin/);
});
test('episode grid: a year-long season shows as its year, and date-like numbers make no empty rows', () => {
  const { gridHtml } = ratings();
  const html = gridHtml([[2004, 1, 8], [2004, 20210101, 7]]);
  assert.match(html, /<th>2004<\/th>/);
  assert.equal((html.match(/<tr>/g) || []).length, 4); // head, the 2 it has, foot
});
test('myanimelist: its polls read out of 10, an unvoted episode is null', () => {
  const { malEpisodes } = ratings();
  const row = (n, raw) => `<tr class="episode-list-data"><td class="episode-number nowrap" data-raw="${n}">${n}</td><td class="episode-aired nowrap">x</td><td  class="episode-poll ac nowrap scored" style="background-size: 85.8% 3px;" data-raw="${raw}" ></td></tr>`;
  const head = '<td class="episode-poll" data-sort-key="episode-poll">';
  assert.deepEqual(JSON.parse(JSON.stringify(malEpisodes(head + row(1, '4.25') + row(2, '0') + '<tr class="episode-list-data"><td class="episode-number nowrap" data-raw="3">3</td></tr>' + row(4, '4')))), [[1, 8.5], [2, null], [3, null], [4, 8]]);
});
test('votes: both sites read 10 down to 1', () => {
  const { malVotes, aniVotes } = ratings();
  const stat = (s, n) => `<tr><td width="20" class="score-label score-${s}">${s}</td><td><span>&nbsp;67.9% <small>(${n} votes)</small></span></td></tr>`;
  assert.deepEqual(Array.from(malVotes('<div class="score-label score-9">9.47</div><table class="score-stats">' + stat(10, 276544) + stat(9, 77856) + stat(1, 3))), [276544, 77856, 0, 0, 0, 0, 0, 0, 0, 3]);
  assert.deepEqual(Array.from(aniVotes({ stats: { scoreDistribution: [{ score: 10, amount: 7 }, { score: 100, amount: 5 }] } })), [5, 0, 0, 0, 0, 0, 0, 0, 0, 7]);
});
test('anilist: one title of the name, a manga is not its novel, an anime is the show', () => {
  const { aniPick } = ratings();
  const media = (romaji, format) => ({ format, title: { romaji }, synonyms: [] });
  const manga = media('Solo Leveling', 'MANGA'), novel = media('Solo Leveling', 'NOVEL'), show = media('Frieren', 'TV');
  assert.equal(aniPick([novel, manga], ['Solo Leveling'], false), manga);
  assert.equal(aniPick([manga, media('Solo Leveling', 'MANGA')], ['Solo Leveling'], false), null);
  assert.equal(aniPick([media('Solo Leveling', 'ONE_SHOT'), manga], ['Solo Leveling'], false), manga);
  const other = { ...media('Wan Piece', 'MANGA'), synonyms: ['One Piece'] }, onePiece = media('ONE PIECE', 'MANGA');
  assert.equal(aniPick([other, onePiece], ['One Piece'], false), onePiece);
  assert.equal(aniPick([other], ['One Piece'], false), other);
  assert.equal(aniPick([{ ...media('One Piece Party', 'MANGA'), title: { romaji: 'One Piece Party', native: 'ONE PIECE パーティー' } }, onePiece], ['One Piece'], false), onePiece);
  assert.equal(aniPick([media('Frieren', 'MOVIE'), show, media('Frieren 2nd Season', 'TV')], ['Frieren'], true), show);
});
test('anilist: the next season is the show, a film only when nothing else follows', () => {
  const { aniNext } = ratings();
  const edge = (id, format, type = 'ANIME', relationType = 'SEQUEL') => ({ relationType, node: { id, format, type } });
  assert.equal(aniNext({ relations: { edges: [edge(1, 'MANGA', 'MANGA'), edge(2, 'MOVIE'), edge(3, 'TV'), edge(4, 'TV', 'ANIME', 'PREQUEL')] } }, 'SEQUEL').id, 3);
  assert.equal(aniNext({ relations: { edges: [edge(2, 'MOVIE')] } }, 'SEQUEL').id, 2);
  assert.equal(aniNext({ relations: { edges: [edge(4, 'TV', 'ANIME', 'PREQUEL')] } }, 'SEQUEL'), undefined);
});
test('manga sheet: shows the votes of a site that has them, and says so when none has', async () => {
  const anilist = { id: 1, idMal: 2, format: 'MANGA', title: { romaji: 'Berserk' }, synonyms: [], stats: { scoreDistribution: [{ score: 100, amount: 3 }, { score: 50, amount: 1 }] } };
  const r = ratings(async url => { if (url.includes('anilist')) return JSON.stringify({ data: { Page: { media: [anilist] } } }); throw Error('offline'); });
  const box = { querySelector: () => ({}), querySelectorAll: () => [] }, el = { isConnected: true, innerHTML: '', querySelector: s => (s === '.eg' ? box : {}), querySelectorAll: () => [] };
  await r.graph(el, ['Berserk'], '', false, true);
  assert.match(box.innerHTML, /eg-votes/);
  assert.match(box.innerHTML, /75\.0%/);
  const none = { isConnected: true, innerHTML: '' };
  await ratings().graph(none, ['Nothing Known'], '', false, true);
  assert.match(none.innerHTML, /noRatings/);
});
test('film ratings distinguish remakes, TV and ambiguous names', () => {
  const { filmPick } = ratings();
  const old = { names: ['Dune'], year: 1984, series: false }, remake = { names: ['Dune'], year: 2021, series: false }, tv = { names: ['Dune'], year: 2000, series: true };
  assert.equal(filmPick([old, remake, tv], film('Dune', '2021')), remake);
  assert.equal(filmPick([old, remake], film('Dune')), null);
  assert.equal(filmPick([old, tv], { ...film('Dune الموسم الثاني', '2005'), path: '/cinema/season/dune' }), tv);
  assert.equal(filmPick([old], film('Dune 2', '1984')), undefined);
  assert.equal(filmPick([remake], film('Dune', '2020')), remake);
});
test('mixed Arabic and Latin titles and numeric titles match', () => {
  const { filmPick } = ratings();
  const siccin = { names: ['Siccin 9'], year: 2026, series: false }, war = { names: ['1917'], year: 2019, series: false };
  assert.equal(filmPick([siccin], film('سجين Siccin 9', '2026')), siccin);
  assert.equal(filmPick([war], film('1917', '2019')), war);
});
test('Metacritic is independent of IMDb and uses the TV score despite season year', async () => {
  const { lookup } = ratings(async url => {
    if (!url.includes('backend.metacritic.com')) throw Error('IMDb/RT unavailable');
    return JSON.stringify({ data: { items: [
      { title: 'Dexter: Resurrection', type: 'movie', premiereYear: 2025, criticScoreSummary: { score: 90 } },
      { title: 'Dexter: Resurrection', type: 'show', premiereYear: 2025, criticScoreSummary: { score: 67 } },
    ] } });
  });
  const got = await lookup({ ...film('Dexter: Resurrection الموسم الثاني', '2026'), path: '/cinema/season/dexter' });
  assert.deepEqual(Array.from(got, r => ({ ...r })), [{ source: 'Metacritic', value: '67' }]);
});
test('a supplied IMDb rating does not prevent other source lookups', async () => {
  const calls = [];
  const r = ratings(async url => { calls.push(url); return JSON.stringify({ data: { items: [{ title: 'Inception', type: 'movie', premiereYear: 2010, criticScoreSummary: { score: 74 } }] } }); });
  const got = await r.lookup({ ...film('Inception', '2010'), imdb: '8.8' });
  assert.deepEqual(Array.from(got, x => x.source), ['IMDb', 'Metacritic']);
  assert.equal(calls.length, 2);
  assert.match(r.slot({ ...film('Inception'), imdb: '8.8' }), /data-rating=/);
});
test('IMDb GraphQL matches original titles and the correct media type', async () => {
  const r = ratings(async (url, form) => {
    if (!url.includes('caching.graphql.imdb.com')) throw Error('offline');
    assert.match(form.query, /mainSearch/);
    return JSON.stringify({ data: { mainSearch: { edges: [{ node: { entity: { titleType: { id: 'movie' }, titleText: { text: 'Translated' }, originalTitleText: { text: 'Inception' }, releaseYear: { year: 2010 }, ratingsSummary: { aggregateRating: 8.8 } } } }] } } });
  });
  const got = await r.lookup(film('Inception', '2010'));
  assert.equal(got[0].value, '8.8');
  assert.equal((await r.lookup({ ...film('Inception'), path: '/cinema/serie/inception' })).length, 0);
});
test('missing, invalid and out-of-range scores stay absent; a real zero is retained', () => {
  const { filmScore } = ratings();
  for (const v of [null, undefined, '', NaN, -1, 101]) assert.equal(filmScore('Metacritic', v), null);
  assert.equal(filmScore('Metacritic', 0).value, '0');
});
test('anilist score: the English name when the title finds nothing, the exact name, the TV show over a special of its name', async () => {
  const media = (romaji, averageScore, format = 'TV', synonyms = []) => ({ format, title: { romaji }, synonyms, averageScore });
  const score = async (c, answers) => { const r = ratings(async (url, form) => { if (!url.includes('anilist')) throw Error('offline'); return JSON.stringify({ data: { Page: { media: answers[JSON.parse(form.variables).search] || [] } } }); }); return (await r.lookup({ type: 'anime', ...c })).find(x => x.source === 'AniList')?.value; };
  assert.equal(await score({ title: 'Ao Ashi Season 2', alt: 'Aoashi Season 2' }, { 'Aoashi Season 2': [media('Aoashi 2nd Season', 80, 'TV', ['Aoashi Season 2'])] }), '8.0');
  assert.equal(await score({ title: 'Black Clover', alt: 'Black Clover' }, { 'Black Clover': [media('Black Clover', 79), media('Petit Clover', 67, 'SPECIAL', ['Black Clover'])] }), '7.9');
  assert.equal(await score({ title: 'Kokoro', alt: 'Dangers: The Movie' }, { Kokoro: [media('Kokoro', 83), media('Kokoro Movie', 81, 'MOVIE', ['Dangers: The Movie'])] }), '8.1');
  assert.equal(await score({ title: 'Show Season 2' }, { 'Show Season 2': [media('Show', 70), media('Show Season 2 Part', 60)] }), undefined); // only the season's own name: no guess
});
test('slider picture: a film by its name and year, the animated one of a name, an English name by AniList, none for manga', async () => {
  const still = (url, width = 1920, height = 1080) => ({ node: { url, width, height } });
  const title = (text, year, id, genre, stills, poster) => ({ node: { entity: { titleType: { id }, titleText: { text }, releaseYear: { year }, titleGenres: { genres: [{ genre: { text: genre } }] }, primaryImage: poster && { url: poster }, images: { edges: stills } } } });
  const art = (slide, imdb, anilist = []) => {
    const asked = [];
    const r = ratings(async (url, form) => {
      asked.push(url);
      if (url.includes('anilist')) return JSON.stringify({ data: { Page: { media: anilist } } });
      return JSON.stringify({ data: { mainSearch: { edges: imdb[form.query.match(/searchTerm:"([^"]+)"/)[1]] || [] } } });
    });
    return r.art(slide).then(url => ({ url, asked }));
  };
  const film = { title: 'The Odyssey', year: '2026', info: '#/cinema/movie/x' };
  const odyssey = { 'the odyssey': [title('The Odyssey', 1997, 'movie', 'Drama', [still('https://i/old._V1_.jpg')]), title('The Odyssey', 2026, 'movie', 'Drama', [still('https://i/tall._V1_.jpg', 4160, 6240), still('https://i/small._V1_.jpg', 600, 400), still('https://i/new._V1_.jpg', 6240, 4160)])] };
  assert.equal((await art(film, odyssey)).url, 'https://i/new._V1_QL75_UX1920_.jpg');
  // no wide frame: keep the background empty rather than stretching its poster
  assert.equal((await art(film, { 'the odyssey': [title('The Odyssey', 2026, 'movie', 'Drama', [], 'https://i/p._V1_.jpg')] })).url, '');
  assert.equal((await art({ ...film, year: '' }, odyssey)).url, ''); // two of that name, no year: neither
  const anime = { title: 'One Piece', info: '#/title/anime/one-piece' };
  assert.equal((await art(anime, { 'one piece': [title('One Piece', 2023, 'tvSeries', 'Adventure', [still('https://i/live._V1_.jpg')]), title('One Piece', 1999, 'tvSeries', 'Animation', [still('https://i/ani._V1_.jpg')])] })).url, 'https://i/ani._V1_QL75_UX1920_.jpg');
  const slayer = await art({ title: 'Kimetsu no Yaiba', info: '#/title/anime/k' }, { 'demon slayer kimetsu no yaiba': [title('Demon Slayer: Kimetsu no Yaiba', 2019, 'tvSeries', 'Animation', [still('https://i/ds._V1_.jpg')])] }, [{ title: { romaji: 'Kimetsu no Yaiba', english: 'Demon Slayer: Kimetsu no Yaiba' }, synonyms: [] }]);
  assert.equal(slayer.url, 'https://i/ds._V1_QL75_UX1920_.jpg');
  for (const info of ['#/manga/series/1', '#/novels/series/1']) { const r = await art({ title: 'Solo Leveling', info }, odyssey); assert.equal(r.url, ''); assert.equal(r.asked.length, 0); }
  assert.equal((await art({ title: 'المؤسس عثمان', info: '#/cinema/serie/x' }, odyssey)).url, '');
});
