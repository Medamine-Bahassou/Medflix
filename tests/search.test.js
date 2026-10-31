const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8').split('// ---------- search: what the user meant ----------')[1].split('let searchRun =')[0];
function searchContext(fetch = async () => { throw new Error('offline'); }) {
  const ctx = { api: { fetch }, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(source + '\nthis.search = { fold, searchQuery, closeness, fuzzySearch };', ctx);
  return ctx.search;
}
const { fold, searchQuery, closeness } = searchContext();
test('normalizes Arabic letters, diacritics, tatweel and Arabic/Persian digits', () => {
  assert.equal(fold('أَكـاديميّة ٢ ۳'), 'اكاديميه 2 3');
  assert.equal(searchQuery('ابحث عن ناروتو مترجم'), 'ناروتو');
  assert.equal(searchQuery('please find Naruto'), 'naruto');
  assert.equal(searchQuery('A Silent Voice'), 'a silent voice');
  assert.equal(searchQuery('Sword Art Online'), 'sword art online');
});
test('exact titles outrank sequels, reordered words, prefixes and typos', () => {
  assert.equal(closeness('SpiderMan', 'Spider-Man'), 1);
  assert.ok(closeness('Naruto', 'Naruto') > closeness('Naruto', 'Naruto Shippuden'));
  for (const [q, title] of [['naurto', 'Naruto'], ['slayer demon', 'Demon Slayer'], ['nar', 'Naruto'], ['atack titan', 'Attack on Titan']]) {
    assert.ok(closeness(q, title) >= .62, q);
  }
});
test('short substrings, missing words and wrong seasons or years are rejected', () => {
  for (const [q, title] of [['it', 'Titan'], ['one piece', 'One Punch Man'], ['Naruto 2', 'Naruto 3'], ['Dune 2021', 'Dune 1984']]) {
    assert.equal(closeness(q, title), 0, q);
  }
});
test('ranks typo matches when suggestions are unavailable, filters noise and deduplicates', async () => {
  const { fuzzySearch } = searchContext();
  const calls = [];
  const cards = [{ path: '/spin', title: 'Naruto Shippuden' }, { path: '/other', title: 'Boruto' }, { path: '/main', title: 'Naruto' }];
  const result = await fuzzySearch('watch naurto', 'anime', async q => { calls.push(q); return cards; });
  assert.equal(calls[0], 'naurto');
  assert.deepEqual(Array.from(result, c => c.path), ['/main', '/spin']);
});
test('alternate English/Japanese names retrieve the catalog title', async () => {
  const { fuzzySearch } = searchContext(async () => JSON.stringify({ data: [{ attributes: { canonicalTitle: 'Ore dake Level Up na Ken', titles: { en: 'Solo Leveling', en_jp: 'Ore dake Level Up na Ken' } } }] }));
  const result = await fuzzySearch('solo leveling', 'anime', async q => q === 'Ore dake Level Up na Ken' ? [{ path: '/solo', title: q }] : []);
  assert.deepEqual(Array.from(result, c => c.path), ['/solo']);
});
test('popular but unrelated suggestions cannot introduce results', async () => {
  const { fuzzySearch } = searchContext(async () => JSON.stringify({ d: [{ l: 'Titanic', qid: 'movie' }] }));
  const result = await fuzzySearch('it', 'film', async () => [{ path: '/titanic', title: 'Titanic' }]);
  assert.equal(result.length, 0);
});
test('empty or punctuation-only queries make no network calls', async () => {
  const { fuzzySearch } = searchContext();
  assert.equal((await fuzzySearch('!!!', 'anime', async () => { throw Error('must not run'); })).length, 0);
});
test('a typo suggestion retries the corrected title against the source', async () => {
  const { fuzzySearch } = searchContext(async () => JSON.stringify({ data: [{ attributes: { canonicalTitle: 'Naruto', titles: { en: 'Naruto' } } }] }));
  const result = await fuzzySearch('naurto', 'anime', async q => q === 'Naruto' ? [{ path: '/naruto', title: 'Naruto' }] : []);
  assert.deepEqual(Array.from(result, c => c.path), ['/naruto']);
});
test('slow older searches cannot overwrite the newest results', async () => {
  const page = fs.readFileSync('app.js', 'utf8').split('let searchRun =')[1].split('// manga and film matches, as rows')[0];
  const pending = {}, result = { innerHTML: '' }, view = { innerHTML: '' }, location = { hash: '#/search/new?in=anime' };
  const ctx = { view, location, t: k => k, esc: s => s, ICON: { filter: '' }, skel: () => '', skelRows: () => '',
    grid: items => items.map(c => c.title).join(''), $: sel => sel === '#search' ? { q: {} } : result,
    fuzzySearch: q => new Promise(resolve => { pending[q] = resolve; }) };
  vm.createContext(ctx);
  vm.runInContext('let searchRun =' + page, ctx);
  const old = ctx.search('old?in=anime'), latest = ctx.search('new?in=anime');
  pending.new([{ title: 'new result' }]); await latest;
  const rendered = view.innerHTML;
  pending.old([{ title: 'old result' }]); await old;
  assert.equal(view.innerHTML, rendered);
  assert.ok(rendered.includes('new result'));
});
test('Ao Ashi 2nd Season matches Aoashi Season 2 without accepting the wrong season', () => {
  assert.equal(closeness('Ao Ashi 2nd Season', 'Aoashi Season 2'), 1);
  assert.equal(closeness('Ao Ashi 2nd Season', 'Aoashi'), 0);
  assert.equal(closeness('Ao Ashi 2nd Season', 'Aoashi Season 3'), 0);
  assert.ok(closeness('Ao Ashi', 'Aoashi Season 2') >= .62);
  assert.equal(closeness('Aoashi second season', 'Ao Ashi Season2'), 1);
});
test('season search retries the joined base title when literal queries and suggestions find nothing', async () => {
  const { fuzzySearch } = searchContext();
  const calls = [];
  const result = await fuzzySearch('Ao Ashi 2nd Season', 'anime', async q => {
    calls.push(q);
    return q === 'aoashi' ? [{ path: '/aoashi', title: 'Aoashi' }, { path: '/aoashi-2', title: 'Aoashi Season 2' }, { path: '/aoashi-3', title: 'Aoashi Season 3' }] : [];
  });
  assert.ok(calls.includes('aoashi'));
  assert.ok(!calls.includes('season')); // generic suffixes cannot be the only fallback
  assert.deepEqual(Array.from(result, c => c.path), ['/aoashi-2']);
});
test('a suggested alias cannot erase an explicitly requested season', async () => {
  const { fuzzySearch } = searchContext(async () => JSON.stringify({ data: [{ attributes: {
    canonicalTitle: 'Aoashi Season 2', titles: { en: 'Ao Ashi 2nd Season', en_jp: 'Aoashi' }
  } }] }));
  const result = await fuzzySearch('Ao Ashi 2nd Season', 'anime', async () => [
    { path: '/base', title: 'Aoashi' }, { path: '/season2', title: 'Aoashi Season 2' }
  ]);
  assert.deepEqual(Array.from(result, c => c.path), ['/season2']);
});
