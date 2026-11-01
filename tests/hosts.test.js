const { test } = require('node:test');
const assert = require('node:assert/strict');
const hosts = require('../hosts');
test('host boundaries and labels', () => {
  assert.equal(hosts.host('https://evilmediafire.com/x'), undefined);
  assert.equal(hosts.supports('Streamtape HD'), true);
  assert.equal(hosts.supports('MEGA'), false);
});
test('Pixeldrain file URL and list rejection', async () => {
  assert.equal(await hosts.resolve('https://pixeldrain.com/u/Abc123', () => {throw Error();}), 'https://pixeldrain.com/api/file/Abc123');
  await assert.rejects(hosts.resolve('https://pixeldrain.com/l/Abc123', () => ''));
});
test('MediaFire entities', async () => {
  assert.equal(await hosts.resolve('https://mediafire.com/file/a', async () => '<a href="https://download1.mediafire.com/a?x=1&amp;y=2">'), 'https://download1.mediafire.com/a?x=1&y=2');
});
test('Krakenfiles form exchange', async () => {
  const calls = [];
  const result = await hosts.resolve('https://krakenfiles.com/view/a/file.html', async (url, form) => {
    calls.push([url,form]);
    return form ? JSON.stringify({status:'ok',url:'https://cdn.krakenfiles.com/a.mp4'}) : '<input id="dl-token" value="token"><div data-file-hash="abc">';
  });
  assert.equal(result, 'https://cdn.krakenfiles.com/a.mp4');
  assert.deepEqual(calls[1], ['https://krakenfiles.com/download/abc',{token:'token'}]);
});
test('arabseed form post from its own page', async () => {
  let call;
  const result = await hosts.resolve('https://d.arabseed.top/xmpp4cvly3dc', async (...a) => { call = a; return '<a class="btn" href="https://cdn.cdn.makeup/d/k/[myseed].Show.S02E02.720p.mp4">'; });
  assert.equal(result, 'https://cdn.cdn.makeup/d/k/[myseed].Show.S02E02.720p.mp4');
  assert.deepEqual(call, ['https://d.arabseed.top/xmpp4cvly3dc', {op: 'download2', id: 'xmpp4cvly3dc', method_free: '1'}, {Referer: 'https://d.arabseed.top/xmpp4cvly3dc'}]);
});
test('Streamtape concatenation without script evaluation', async () => {
  const result = await hosts.resolve('https://streamtape.com/v/a', async () => `document.getElementById('robotlink').innerHTML = '//streamtape.com/' + 'xxget_video?id=a&token=b'.substring(2);`);
  assert.equal(result, 'https://streamtape.com/get_video?id=a&token=b');
  await assert.rejects(hosts.resolve('https://streamtape.com/v/a', async () => 'challenge'));
});
test('download menu includes supported playback hosts without duplicate quality rows', () => {
  const downloads = [{label:'mediafire',quality:'HD',token:'a'}];
  const players = [{label:'mediafire',quality:'HD',token:'b'},{label:'streamtape',quality:'HD',token:'c'},{label:'unknown',quality:'HD',token:'d'}];
  assert.deepEqual(hosts.downloadLinks(downloads, players), [...downloads,{label:'streamtape',quality:'HD',token:'stream:c'}]);
});
