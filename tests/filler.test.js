const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');

const SHOWS = ['Hunter × Hunter ', 'Hunter × Hunter (2011)', 'One Pace (One Piece)', 'One Piece', 'Naruto Shippuden', 'Demon Slayer', 'Bleach: Thousand-Year Blood War (Bleach: Sennen Kessen-hen)'];
const slugOf = n => n.trim().replace(/\W+/g, '-').toLowerCase();

function scraperWith(kitsu = []) {
  const asked = [];
  const a = n => ({ textContent: n, getAttribute: () => '/shows/' + slugOf(n) });
  const tr = (n, c) => ({ className: c, querySelector: () => ({ textContent: String(n) }) });
  const pages = { list: SHOWS.map(a), rows: [tr(1, 'manga_canon odd'), tr(2, 'filler even'), tr(3, 'mixed_canon/filler odd'), tr(4, 'anime_canon even')] };
  const c = {
    window: {}, URLSearchParams, setTimeout: () => 0, clearTimeout: () => {},
    DOMParser: function () { this.parseFromString = html => ({ querySelectorAll: sel => pages[html] && sel.includes(html === 'list' ? 'ShowList' : 'eps-') ? pages[html] : [] }); },
    api: {
      get: async () => null, set: async () => {},
      fetch: async url => {
        asked.push(url);
        if (url.includes('kitsu.io')) return JSON.stringify({ data: kitsu.map((name, i) => ({ id: String(i), attributes: { canonicalTitle: name[0], titles: { en: name[1] } } })) });
        return url.endsWith('/shows') ? 'list' : 'rows';
      },
    },
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('scraper.js', 'utf8'), c);
  return { filler: names => vm.runInContext('filler', c)(names), asked };
}
const shown = asked => asked.filter(u => /\/shows\/./.test(u)).map(u => u.split('/').pop());

test('marks filler and mixed episodes, leaves canon out', async () => {
  const { filler } = scraperWith();
  assert.deepEqual({ ...await filler(['One Piece']) }, { 2: 'filler', 3: 'mixed' });
});

test('an exact name beats another show\'s alias', async () => {
  const { filler, asked } = scraperWith();
  await filler(['One Piece']);
  assert.deepEqual(shown(asked), ['one-piece']);
});

test('a year is part of the name: the 2011 show is not the 1999 one', async () => {
  const a = scraperWith(), b = scraperWith();
  await a.filler(['Hunter x Hunter']);
  await b.filler(['Hunter x Hunter (2011)']);
  assert.deepEqual(shown(a.asked), ['hunter-hunter']);
  assert.deepEqual(shown(b.asked), ['hunter-hunter-2011-']);
});

test('finds a show by either of its names and by spelling', async () => {
  const a = scraperWith(), b = scraperWith();
  await a.filler(['Bleach: Sennen Kessen-hen']);
  await b.filler(['Naruto: Shippuuden']);
  assert.equal(shown(a.asked).length, 1);
  assert.deepEqual(shown(b.asked), ['naruto-shippuden']);
});

test('falls back to kitsu\'s names, and only asks kitsu when it must', async () => {
  const { filler, asked } = scraperWith([['Kimetsu no Yaiba', 'Demon Slayer']]);
  await filler(['Kimetsu no Yaiba']);
  assert.deepEqual(shown(asked), ['demon-slayer']);
  const own = scraperWith();
  await own.filler(['One Piece']);
  assert.ok(!own.asked.some(u => u.includes('kitsu.io')));
});

test('a show it does not list gets no marks', async () => {
  const { filler, asked } = scraperWith();
  assert.deepEqual({ ...await filler(['One Piece Season 2']) }, {});
  assert.deepEqual(shown(asked), []);
});
