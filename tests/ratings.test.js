const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function ratings(fetch = async () => { throw Error('offline'); }) {
  const ctx = { DOMParser: class { parseFromString() { return { querySelectorAll: () => [] }; } }, api: { fetch }, IntersectionObserver: class { observe() {} }, MutationObserver: class { observe() {} }, document: { documentElement: {} }, esc: s => s };
  vm.createContext(ctx);
  const code = fs.readFileSync('ratings.js', 'utf8').replace('  return {\n    // a supplied', '  this.testing = { lookup, filmPick, filmScore };\n  return {\n    // a supplied');
  vm.runInContext(code + '\nthis.ratings = Ratings;', ctx);
  return { ...ctx.testing, ...ctx.ratings };
}
const film = (title, year = '') => ({ type: 'cinema', title, year, path: '/cinema/movie' });
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
