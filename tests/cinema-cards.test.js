const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('cinema.js', 'utf8');
const media = vm.runInNewContext(source.slice(source.indexOf('const edMedia ='), source.indexOf('const edCards =')) + '\nedMedia');
test('software, games, music and unclassified downloads are not movies', () => {
  for (const row of [
    ['episode/برنامج-whatsapp', 'برامج كمبيوتر', 'برنامج WhatsApp'],
    ['whatsapp-for-windows', 'برامج كمبيوتر', 'WhatsApp for Windows'],
    ['واتس-اب', 'موبايلات', 'تحميل برنامج واتس اب'],
    ['game-download', 'ألعاب', 'Some Game'],
    ['inception-album', 'البومات اجنبية', 'تحميل VA Best Of Inception'],
    ['inception-trailer', 'كليبات', 'Inception Trailer'],
    ['unknown', '', 'Some Download'],
    ['episode/برنامج-unknown', '', 'برنامج Some App'],
  ]) assert.equal(media(...row), false, row.join(' / '));
});
test('movie metadata, series paths and TV categories remain accepted', () => {
  for (const row of [
    ['فيلم-inception', 'أفلام أجنبية', 'فيلم Inception 2010 مترجم'],
    ['by-any-means', 'أفلام أجنبية', 'By Any Means'],
    ['serie/breaking-bad', '', 'Breaking Bad'],
    ['season/breaking-bad', '', 'Breaking Bad'],
    ['episode/breaking-bad-s01e01', '', 'Breaking Bad الحلقة 1'],
    ['episode/برنامج-tv-show', 'برامج تلفزيونية', 'برنامج TV Show'],
    ['فيلم-whatsapp', 'أفلام أجنبية', 'فيلم WhatsApp'],
  ]) assert.equal(media(...row), true, row.join(' / '));
});

test('section rankings deduplicate and sort rated movies separately from series', () => {
  const top = vm.runInNewContext(source.slice(source.indexOf('const edShowKey ='), source.indexOf('const edCards =')) + source.slice(source.indexOf('const edTopRated ='), source.indexOf('async function cinemaHome')) + '\nedTopRated');
  const film = (id, rating) => ({ path: '/cinema/' + id, title: id, rating });
  const lists = [{ items: [film('a', '7.1'), film('b', '9'), film('unrated', ''), film('serie/show', '9.5')] },
    { items: [film('b', '9'), ...Array.from({ length: 12 }, (_, i) => film('extra-' + i, '6'))] }];
  const movies = top(lists);
  assert.equal(movies.length, 10);
  assert.deepEqual(Array.from(movies.slice(0, 2), c => c.path), ['/cinema/b', '/cinema/a']);
  assert.equal(new Set(movies.map(c => c.path)).size, movies.length);
  assert.deepEqual(Array.from(top(lists, true), c => c.path), ['/cinema/serie/show']);
});
