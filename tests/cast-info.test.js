const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function credits(answer, primary = false, pages = {}) {
  const calls = [];
  const ctx = { URLSearchParams, edMovieOf: async slug => pages[slug], api: { fetch: async (url, form) => { if (url.includes("graphql.anilist.co") && !primary) return JSON.stringify({ data: { Media: null } }); calls.push(url); return JSON.stringify(await answer(new URL(url), form)); } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('cast-info.js', 'utf8') + '\nthis.credits = CastInfo;', ctx);
  return { ...ctx.credits, calls };
}
const snak = value => ({ datavalue: { value } });
test('anime matches alternate titles and only uses Japanese voice actors', async () => {
  const c = credits(url => url.pathname.endsWith('/characters') ? { data: [{ character: { name: 'Naruto', images: { jpg: { image_url: 'character.jpg' } } }, voice_actors: [{ language: 'English', person: { name: 'English actor' } }, { language: 'Japanese', person: { name: 'Japanese actor', images: { jpg: { image_url: 'actor.jpg' } } } }] }] } : { data: [{ mal_id: 20, title: 'Naruto', titles: [] }] });
  const result = await c.load(['Naruto'], 'anime');
  assert.equal(result[0].actor, 'Japanese actor');
  assert.equal(result[0].photo, 'character.jpg');
  assert.equal(result[0].actorPhoto, 'actor.jpg');
  await c.load(['Naruto'], 'anime');
  assert.equal(c.calls.length, 2);
});
test('unrelated anime search hits are rejected', async () => {
  const c = credits(() => ({ data: [{ mal_id: 1, title: 'Naruto Shippuden' }] }));
  assert.equal((await c.load(['Naruto'], 'anime')).length, 0);
  assert.equal(c.calls.length, 1);
});
test('film cast joins actor and character entities, including missing character photos', async () => {
  const c = credits(url => {
    const p = url.searchParams;
    if (p.get('action') === 'wbsearchentities') return { search: [{ id: 'Q1', label: 'Inception', description: '2010 film', match: { text: 'Inception' } }] };
    if (p.get('ids') === 'Q1') return { entities: { Q1: { claims: { P577: [{ mainsnak: snak({ time: '+2010-01-01' }) }], P161: [{ mainsnak: snak({ id: 'Q2' }), qualifiers: { P453: [snak({ id: 'Q3' })] } }] } } } };
    return { entities: { Q2: { labels: { en: { value: 'Leonardo DiCaprio' } }, claims: { P18: [{ mainsnak: snak('Actor photo.jpg') }] } }, Q3: { labels: { en: { value: 'Cobb' } } } } };
  });
  const [row] = await c.load(['Inception'], 'cinema', '2010');
  assert.equal(row.name, 'Cobb');
  assert.equal(row.actor, 'Leonardo DiCaprio');
  assert.ok(row.photo.includes('Actor%20photo.jpg'));
});
test('failed requests can be retried', async () => {
  let fail = true;
  const c = credits(() => { if (fail) throw Error('offline'); return { data: [] }; });
  await assert.rejects(c.load(['Naruto'], 'anime'));
  fail = false;
  assert.equal((await c.load(['Naruto'], 'anime')).length, 0);
});
test('cleans catalog boilerplate and seasons while preserving title numbers', () => {
  const c = credits(() => ({}));
  assert.equal(c.norm('مشاهدة مسلسل Breaking Bad الموسم الثاني مترجم'), 'breaking bad');
  assert.equal(c.norm('فيلم Iron Man 2 2010 مترجم'), 'iron man 2');
});
test('ambiguous movie remakes are rejected without a release year', async () => {
  const c = credits(url => url.searchParams.get('action') === 'wbsearchentities' ? { search: ['Q1', 'Q2'].map(id => ({ id, label: 'Dune', description: 'film' })) } : { entities: Object.fromEntries(['Q1', 'Q2'].map(id => [id, { claims: { P161: [{ mainsnak: snak({ id: 'Q3' }) }] } }])) });
  assert.equal((await c.load(['Dune'], 'cinema')).length, 0);
  assert.equal(c.calls.length, 3); // imdb's suggestions, then wikidata's search and entities
});
test('individual seasons do not make the parent series ambiguous', async () => {
  const c = credits(url => {
    const p = url.searchParams;
    if (p.get('action') === 'wbsearchentities') return { search: [{ id: 'Q1', label: 'Breaking Bad', description: 'television series' }, { id: 'Q2', label: 'Breaking Bad, season 2', description: 'season of television series' }] };
    if (p.get('ids') === 'Q1') return { entities: { Q1: { claims: { P161: [{ mainsnak: snak({ id: 'Q3' }) }] } } } };
    return { entities: { Q3: { labels: { en: { value: 'Bryan Cranston' } } } } };
  });
  const [row] = await c.load(['Breaking Bad'], 'cinema');
  assert.equal(row.actor, 'Bryan Cranston');
});
test('films take their IMDb cast: the page id first, else one title-and-year suggestion', async () => {
  const cast = { data: { title: { credits: { edges: [{ node: { name: { nameText: { text: 'Nani' }, primaryImage: { url: 'https://m.media-amazon.com/images/M/x._V1_.jpg' } }, characters: [{ name: 'Jadal' }] } }, { node: { name: { nameText: { text: 'Extra' }, primaryImage: null }, characters: null } }] } } } };
  const c = credits((url, form) => url.hostname === 'v3.sg.media-imdb.com' ? { d: [{ id: 'tt1', l: 'The Paradise', y: 2026, qid: 'movie' }, { id: 'tt2', l: 'The Paradise', y: 2012, qid: 'movie' }, { id: 'tt3', l: 'The Paradise', y: 2026, qid: 'tvSeries' }] } : (assert.match(form.query, /"tt1"/), cast));
  const rows = await c.load(['The Paradise'], 'cinema', '2026');
  assert.equal(JSON.stringify(rows.map(r => [r.name, r.actor, r.photo])), JSON.stringify([['Jadal', 'Nani', 'https://m.media-amazon.com/images/M/x._V1_UX240_.jpg'], ['', 'Extra', '']]));
  const byId = credits((url, form) => (assert.equal(url.hostname, 'caching.graphql.imdb.com'), assert.match(form.query, /"tt9"/), cast), false, { 'serie/x': { imdbId: 'tt9', team: [] } });
  assert.equal((await byId.load(['Anything'], 'series', '', null, 'serie/x')).length, 2);
  assert.equal(byId.calls.length, 1);
});
test('Arabic titles take the page cast first; foreign ones only when IMDb has nothing', async () => {
  const team = [{ name: 'علا', photo: 'p.jpg', actor: 'ياسمين رئيس', actorPhoto: '' }];
  const ar = credits(() => { throw Error('not asked'); }, false, { 'فيلم-x': { imdbId: 'tt1', team } });
  assert.equal((await ar.load(['صنع في مصر'], 'cinema', '2014', null, 'فيلم-x'))[0].actor, 'ياسمين رئيس');
  assert.equal(ar.calls.length, 0);
  const en = credits(() => ({ d: [] }), false, { 'film-y': { team } });
  assert.equal((await en.load(['Unknown Film'], 'cinema', '2020', null, 'film-y'))[0].name, 'علا');
});
test('AniList loads every page, matches aliases, deduplicates and omits voices for manhwa', async () => {
  const c = credits((url, form) => {
    const v = JSON.parse(form.variables), page = v.page;
    return { data: { Media: { id: 1, title: { romaji: 'Na Honjaman Level Up', english: 'Solo Leveling' }, characters: { pageInfo: { hasNextPage: page === 1 }, edges: (page === 1 ? [1, 2] : [2, 3]).map(id => ({ node: { id, name: { full: 'Character ' + id }, image: { large: 'photo' } }, voiceActors: [{ name: { full: 'Voice' } }] })) } } } };
  }, true);
  const rows = await c.load(['Solo Leveling'], 'manga');
  assert.equal(rows.length, 3);
  assert.ok(rows.every(x => !x.actor));
  assert.equal(c.calls.length, 2);
});
test('AniList Japanese voice and photo are used for anime', async () => {
  const c = credits(() => ({ data: { Media: { id: 1, title: { english: 'Naruto' }, characters: { pageInfo: { hasNextPage: false }, edges: [{ node: { id: 1, name: { full: 'Naruto' }, image: { large: 'character' } }, voiceActors: [{ name: { full: 'Junko' }, image: { large: 'actor' } }] }] } } } }), true);
  const [row] = await c.load(['Naruto'], 'anime');
  assert.equal(row.actor, 'Junko');
  assert.equal(row.actorPhoto, 'actor');
});
test('TV series use character photos and retain source attribution', async () => {
  const c = credits(url => url.pathname.includes('search') ? [{ show: { id: 1, name: 'Breaking Bad', url: 'https://www.tvmaze.com/shows/1' } }] : [{ character: { name: 'Walter', image: { medium: 'character' } }, person: { name: 'Bryan', image: { medium: 'actor' } } }]);
  const [row] = await c.load(['Breaking Bad'], 'series');
  assert.equal(row.photo, 'character');
  assert.equal(row.actor, 'Bryan');
  assert.ok(row.source.includes('tvmaze'));
});

function castPageContext() {
  const observers = [];
  const nodes = { input: { value: '', hidden: true, focus() {} }, toggle: { focus() {}, setAttribute(k, v) { this[k] = v; } }, images: [], grid: { innerHTML: '', insertAdjacentHTML(_, html) { this.innerHTML += html; } }, status: {}, source: {}, more: { hidden: true } };
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    show(targets = [...this.targets]) { this.callback(targets.map(target => ({ target, isIntersecting: true }))); }
  }
  const root = { isConnected: true, innerHTML: '', addEventListener() {}, querySelectorAll: () => nodes.images, querySelector: sel => ({ input: nodes.input, '.cast-grid': nodes.grid, '[role=status]': nodes.status, '.cast-source': nodes.source, '.cast-more': nodes.more, '.cast-search-toggle': nodes.toggle })[sel] };
  const ctx = { URLSearchParams, IntersectionObserver: Observer, setTimeout, clearTimeout, location: { hash: '#/title/anime/naruto/' }, ICON: { next: '→', back: '←' }, t: k => k,
    esc: s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'), img: s => s,
    document: { createElement: () => root }, view: { replaceChildren: el => assert.equal(el, root) },
    api: { fetch: async () => JSON.stringify({ data: { Media: { id: 1, title: { english: 'Naruto' }, characters: { pageInfo: { hasNextPage: false }, edges: Array.from({ length: 30 }, (_, i) => ({ node: { id: i, name: { full: 'Character ' + i }, image: { large: 'photo' } }, voiceActors: [{ name: { full: 'Actor ' + i } }] })) } } } }) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('cast-info.js', 'utf8') + '\nthis.cast = CastInfo;', ctx);
  return { ctx, root, nodes, observers };
}
test('loaded cast heading links to full page while preview stays small', async () => {
  const { ctx } = castPageContext();
  const el = { isConnected: true, innerHTML: '', addEventListener() {}, querySelectorAll: () => [] };
  ctx.cast.mount(el, ['Naruto'], 'anime');
  assert.equal(el.hidden, false);
  assert.ok(el.innerHTML.includes('charactersCast'));
  assert.ok(el.innerHTML.includes('aria-busy="true"'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(el.hidden, false);
  assert.equal((el.innerHTML.match(/<article/g) || []).length, 12);
  assert.ok(el.innerHTML.includes('<small>30</small>'));
  const href = el.innerHTML.match(/href="([^"]+)"/)[1];
  const params = JSON.parse(decodeURIComponent(href.slice('#/characters/'.length)));
  assert.equal(params.names[0], 'Naruto');
  assert.equal(params.back, ctx.location.hash);
});
test('full cast page appends cards on scroll and searches the entire cast', async () => {
  const { ctx, nodes, root, observers } = castPageContext();
  await ctx.cast.page({ names: ['Naruto'], kind: 'anime', back: '#/title/anime/naruto/' });
  assert.equal((nodes.grid.innerHTML.match(/<article/g) || []).length, 24);
  assert.equal(nodes.more.hidden, false);
  observers.find(o => o.targets.has(nodes.more)).show();
  assert.equal((nodes.grid.innerHTML.match(/<article/g) || []).length, 30);
  assert.equal(nodes.more.hidden, true);
  assert.ok(root.innerHTML.includes('href="#/title/anime/naruto/"'));
  assert.equal(nodes.input.hidden, true);
  nodes.toggle.onclick();
  assert.equal(nodes.input.hidden, false);
  assert.equal(nodes.toggle['aria-expanded'], 'true');
  nodes.input.value = 'Actor 29'; nodes.input.oninput();
  assert.equal((nodes.grid.innerHTML.match(/<article/g) || []).length, 1);
  assert.ok(nodes.grid.innerHTML.includes('Character 29'));
  assert.equal(nodes.status.textContent, '1 / 30');
  nodes.input.value = 'no match'; nodes.input.oninput();
  assert.equal(nodes.grid.innerHTML, '');
  assert.equal(nodes.status.textContent, '0 / 30');
  nodes.toggle.onclick();
  assert.equal(nodes.input.hidden, true);
  assert.equal(nodes.input.value, '');
  assert.equal(nodes.status.textContent, '30 / 30');
  ctx.cast.dispose();
});

test('portraits request visible images one at a time and release the queue on error or navigation', async () => {
  const { ctx, nodes, root, observers } = castPageContext();
  const makeImage = id => ({ isConnected: true, dataset: { src: 'photo-' + id }, classList: { add() {} }, removeAttribute() { delete this.src; } });
  const first = makeImage(1), second = makeImage(2), offscreen = makeImage(3);
  nodes.images = [first, second, offscreen];
  await ctx.cast.page({ names: ['Naruto'], kind: 'anime' });
  const observer = observers.find(o => o.targets.has(first));
  observer.show([first, second]);
  assert.equal(first.src, 'photo-1');
  assert.equal(second.src, undefined);
  assert.equal(offscreen.src, undefined);
  first.onerror();
  assert.equal(first.hidden, true);
  assert.equal(second.src, 'photo-2');
  second.onload();
  observer.show([offscreen]);
  assert.equal(offscreen.src, 'photo-3');
  ctx.cast.dispose();
  assert.equal(offscreen.src, undefined);
  assert.equal(offscreen.onload, null);
});

test('loading section disappears completely when credits are empty or fail', async () => {
  for (const failure of [false, true]) {
    const { ctx } = castPageContext();
    ctx.api.fetch = async () => { if (failure) throw Error('offline'); return JSON.stringify({ data: { Media: null } }); };
    // the fallback expects an array rather than the GraphQL shape
    const fetch = ctx.api.fetch;
    ctx.api.fetch = async url => url.includes('anilist') ? fetch() : failure ? fetch() : JSON.stringify({ data: [] });
    const el = { isConnected: true, innerHTML: '', querySelectorAll: () => [] };
    ctx.cast.mount(el, ['Naruto'], 'anime');
    assert.equal(el.hidden, false);
    assert.ok(el.innerHTML.includes('cast-skeleton'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(el.hidden, true);
    assert.equal(el.innerHTML, '');
  }
});

test('large casts publish the first page before the remaining requests finish', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const c = credits(async (url, form) => {
    const page = JSON.parse(form.variables).page;
    if (page === 2) await gate;
    return { data: { Media: { id: 1, title: { english: 'One Piece' }, characters: {
      pageInfo: { hasNextPage: page === 1 }, edges: [{ node: { id: page, name: { full: 'Character ' + page } } }]
    } } } };
  }, true);
  let first;
  const ready = new Promise(resolve => { first = resolve; });
  let finished = false;
  const result = c.load(['One Piece'], 'anime', '', rows => first(rows)).then(rows => { finished = true; return rows; });
  assert.equal((await ready).length, 1);
  assert.equal(finished, false);
  let replay;
  const joined = c.load(['One Piece'], 'anime', '', rows => { replay = rows; });
  assert.equal(replay.length, 1);
  release();
  assert.equal((await result).length, 2);
  await joined;
  assert.equal(c.calls.length, 2);
});
