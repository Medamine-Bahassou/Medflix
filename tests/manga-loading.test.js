const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function context(load) {
  const state = { updates: 0 };
  const ctx = { lang: 'en', addEventListener: () => {}, parsers: {}, location: { hash: '#/manga/series/42' }, Slayer: require('../slayer'),
    scraper: { changed: () => state.updates++ }, URLSearchParams, URL, setTimeout, clearTimeout,
    norm: s => String(s).toLowerCase().trim(), load, state };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('manga.js', 'utf8'), ctx);
  return ctx;
}
test('series returns its own cached details and chapters while other provider searches are pending', async () => {
  const calls = [];
  const c = context(async (kind, url) => {
    calls.push(kind);
    if (kind === 'mangaSeries') return { id: 42, title: 'Example', alt: '' };
    if (kind === 'mangaChapters') return { count: 1, items: [{ id: '73', n: '12' }] };
    return new Promise(() => {});
  });
  const result = await vm.runInContext('mSeriesFull("42")', c);
  assert.equal(result.s.title, 'Example');
  assert.equal(result.chs[0].id, '73');
  assert.equal(result.ids.length, 1);
});
test('optional results refresh the current page once and repeated renders reuse the lookup', async () => {
  const c = context(() => {});
  let done;
  c.work = () => new Promise(resolve => { done = resolve; });
  assert.equal(vm.runInContext('mOptional("test", work, null)', c), null);
  await Promise.resolve();
  done({ items: [1] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.state.updates, 1);
  assert.equal(vm.runInContext('mOptional("test", work, null).items[0]', c), 1);
  assert.equal(c.state.updates, 1);
});
test('a lookup finishing after navigation does not redraw the new screen', async () => {
  const c = context(() => {});
  let done;
  c.work = () => new Promise(resolve => { done = resolve; });
  vm.runInContext('mOptional("test", work, null)', c);
  await Promise.resolve();
  c.location.hash = '#/anime'; done([1]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.state.updates, 0);
});
test('home renders the first available row without waiting for other rows or banner requests', async () => {
  const c = context(async (kind, url) => kind === 'mangaList' && url.includes('is_hot=true')
    ? { items: [{ path: '/manga/series/42', title: 'Example', poster: 'cover.jpg' }] }
    : new Promise(() => {}));
  c.chips = c.row = () => ''; c.continued = () => []; c.t = s => s;
  c.heroPage = slides => { c.state.rendered = slides; };
  await vm.runInContext('mangaHome(false)', c);
  assert.equal(c.state.rendered[0].title, 'Example');
});
test('reader requests metadata and page AJAX directly without fetching the whole chapter list', async () => {
  const calls = [];
  const c = context(async kind => {
    calls.push(kind);
    if (kind === 'slayerSeries') return { postId: 42, title: 'Example', poster: '' };
    if (kind === 'slayerPages') return ['https://example.test/1.jpg'];
    throw Error('unnecessary request: ' + kind);
  });
  c.cid = require('../slayer').id('spark', '/manga/example/12/');
  const chapter = await vm.runInContext('slayerChapter(cid, false)', c);
  assert.equal(chapter.images.length, 1);
  assert.deepEqual(calls, ['slayerSeries', 'slayerPages']);
});
test('cache migration discards error titles and preserves valid offline series', async () => {
  const url = 'https://sparkmanga.net/manga/fall-for-me/';
  const check = async title => {
    let fetches = 0;
    const data = { title, postId: '187967' };
    const c = { window: {}, Slayer: require('../slayer'), URLSearchParams,
      DOMParser: function() {}, setTimeout: () => 0, clearTimeout: () => {},
      api: { get: async () => ({ [url]: { at: Date.now(), data } }), fetch: async () => { fetches++; throw Error('network unavailable'); } } };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync('scraper.js', 'utf8'), c);
    const request = vm.runInContext(`load('slayerSeries', ${JSON.stringify(url)})`, c);
    if (title.startsWith('Access Denied')) await assert.rejects(request, /network unavailable/);
    else assert.equal((await request).title, 'Fall for Me');
    assert.equal(fetches, title.startsWith('Access Denied') ? 1 : 0);
  };
  await check('Access Denied Fall for Me');
  await check('Fall for Me');
});
