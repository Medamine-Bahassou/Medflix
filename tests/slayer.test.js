const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../slayer');
test('source-scoped routes survive Arabic, URL encoding and chapter suffixes', () => {
  for (const source of S.sources) {
    const path = '/manga/مانجا/12.5/';
    const id = S.id(source.key, path);
    assert.match(id, /^s:[a-z]+:[a-zA-Z0-9_-]+$/);
    assert.equal(S.url(id), new URL(path, source.origin).href);
    assert.notEqual(id, S.id(source.key === 'spark' ? 'starz' : 'spark', path));
  }
  assert.throws(() => S.decode('s:unknown:YWJj'));
});
test('Arabic chapter numbers and unsupported filters do not silently mislabel results', () => {
  assert.equal(S.number('الفصل ١٢.٥'), '12.5');
  assert.equal(S.supports({ search: 'solo' }), true);
  for (const key of ['type', 'status', 'genres', 'is_hot', 'order_by']) assert.equal(S.supports({ [key]: 'x' }), false);
  const u = new URL(S.listUrl(S.sources[0], { search: 'a&b' }, 2));
  assert.equal(u.pathname, '/page/2/');
  assert.equal(u.searchParams.get('s'), 'a&b');
});

test('APK image transformations preserve TLS and distinguish current and legacy domains', () => {
 assert.equal(S.transformImage('https://temp.lekmanga.site/manga/a/1.jpg', 'spark'), 'https://tempdarko.link-manga.net/manga/a/1.jpg');
 assert.equal(S.transformImage('https://s4.lekmanga.site/manga/a/1.jpg', 'starz'), 'https://s4likey.like-manga.net/manga/a/1.jpg');
});
