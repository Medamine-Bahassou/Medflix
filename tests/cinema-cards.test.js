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
