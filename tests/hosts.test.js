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
test('current Streamtape norobotlink with chained substring offsets', async () => {
  const result = await hosts.resolve('https://streamtape.com/v/a', async () => `document.getElementById('norobotlink').innerHTML = '//streamtape.com/get_vid' + ('xcdeo?id=a&token=b').substring(1).substring(2);`);
  assert.equal(result, 'https://streamtape.com/get_video?id=a&token=b');
});
test('Firestream escaped JSON download URL', async () => {
  assert.equal(await hosts.resolve('https://firestream.to/d/a', async () => JSON.stringify({downloadUrl:'https://cdn.example/a.mp4',posterUrl:''})), 'https://cdn.example/a.mp4');
});
test('media validation rejects hotlink JSON, HTML and ZIP payloads', () => {
  for (const [code,type,body] of [[403,'application/json','{"su'],[200,'application/octet-stream','{"su'],[200,'text/html','<htm'],[200,'application/zip','PK\x03\x04']])
    assert.equal(hosts.videoResponse(code,type,Buffer.from(body)),false);
  assert.equal(hosts.videoResponse(206,'video/mp4',Buffer.from([0,0,0,32])),true);
});
test('direct files have video controls and cannot inject player markup', () => {
  const html=hosts.videoHtml('https://example.com/file?x=" onerror="bad');
  assert.ok(html.includes('<video controls autoplay playsinline'));
  assert.ok(html.includes('&quot; onerror=&quot;bad'));
  assert.ok(!html.includes('x=" onerror="bad'));
});
test('casting: files a TV can fetch by itself, best first, and never streamtape', () => {
  const l = (label, quality) => ({ label, quality, token: 'aw:https://x/' + label });
  const order = hosts.castOrder([l('Firestream', 'FHD'), l('Streamtape', 'FHD'), l('Pixeldrain', 'SD'), l('Mediafire', 'FHD'), l('Pixeldrain', 'HD'), l('Krakenfiles', 'FHD'), l('st', 'HD')]);
  assert.deepEqual(order.map(x => x.label + ' ' + x.quality), ['Mediafire FHD', 'Pixeldrain HD', 'Pixeldrain SD', 'Krakenfiles FHD', 'Firestream FHD']);
  assert.equal(hosts.castOrder([{ label: 'x', quality: '', token: 'https://streamtape.com/v/1' }]).length, 0);
});
