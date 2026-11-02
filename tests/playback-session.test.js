const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('android/app/src/main/java/com/medanime/app/ui/PlaybackSession.kt', 'utf8');
const script = source.split('): String = """')[1].split('""".trimIndent()')[0];
function player(saved = {}, suspended = false, page) {
  const events = {}, reports = [], children = [];
  const v = { tagName: 'VIDEO', duration: 1200, currentTime: 0, paused: true, playbackRate: 1, volume: 1, muted: false,
    play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
  const root = { medflixPosition: { postMessage(s) { reports.push(JSON.parse(s)); } } };
  const context = { window: root, parent: root, frames: [{ postMessage(m) { children.push(m); } }],
    document: { querySelectorAll: () => [v], querySelector: () => page ? null : v, body: { innerText: page?.text || '' } }, innerWidth: page?.width || 800, innerHeight: 400,
    setTimeout: f => f(), addEventListener(name, cb) { events[name] = cb; } };
  vm.runInNewContext(script.replace('$saved', JSON.stringify(saved)).replace('$suspended', String(suspended)), context);
  return { v, reports, children, events, emit(name) { events[name]({ target: v }); },
    send(data) { events.message({ source: root, data }); },
    command(playing, origin = root) { events.message({ source: origin, data: { medflixPlay: playing } }); },
    suspend(on, origin = root) { events.message({ source: origin, data: { medflixSuspend: on } }); } };
}
test('restores position, speed and audio for a recreated host frame', () => {
  const p = player({ duration: 1200, time: 321, paused: false, rate: 1.5, volume: .4, muted: true });
  p.emit('loadedmetadata');
  assert.equal(p.v.currentTime, 321); assert.equal(p.v.playbackRate, 1.5);
  assert.equal(p.v.volume, .4); assert.equal(p.v.muted, true); assert.equal(p.v.paused, false);
});
test('PiP close pauses without losing the intended playing state; return resumes', () => {
  const p = player(); p.v.paused = false; p.v.currentTime = 123;
  p.suspend(true); p.emit('pause');
  assert.equal(p.v.paused, true); assert.equal(p.reports.at(-1).time, 123);
  assert.equal(p.reports.at(-1).paused, false);
  p.suspend(false); assert.equal(p.v.paused, false); assert.equal(p.children.length, 2);
});
test('a video paused by the user stays paused after returning', () => {
  const p = player({ duration: 1200, time: 88, paused: true });
  p.emit('loadedmetadata'); p.suspend(true); p.suspend(false);
  assert.equal(p.v.currentTime, 88); assert.equal(p.v.paused, true);
});
test('a seek moves the video and reaches nested frames, but not a shorter ad', () => {
  const p = player();
  p.send({ medflixSeek: 90 });
  assert.equal(p.v.currentTime, 90); assert.deepEqual(p.children, [{ medflixSeek: 90 }]);
  p.send({ medflixSeek: 5000 });
  assert.equal(p.v.currentTime, 90);
});
test("hosts' missing video pages are dead", () => {
  for (const text of ['File is no longer available as it expired or has been deleted.', 'File was deleted', 'Sorry This video not found!',
    'Video not found | DoodStream Not Found video you are looking for is not found.', 'Смотрите видео в ОК. Плеер Видео Видео не найдено']) {
    const p = player({}, false, { text });
    p.events.load();
    assert.ok(p.reports.some(r => r.dead), text);
  }
});
test("a loading page, an ad's small 404, or a page with a video aren't dead", () => {
  for (const [page, name] of [[{ text: 'Loading... Page is loading, please wait...' }, 'loading'], [{ text: '404 not found', width: 300 }, 'ad'], [undefined, 'video']]) {
    const p = player({}, false, page);
    p.events.load();
    assert.equal(p.reports.length, 0, name);
  }
});
test('a video failing before it has a length is dead; one playing is not', () => {
  const p = player();
  p.v.duration = NaN; p.v.error = { code: 4 }; p.v.closest = () => p.v;
  p.events.error({ target: p.v });
  assert.ok(p.reports.some(r => r.dead));
  const q = player();
  q.v.error = { code: 2 }; q.v.closest = () => q.v;
  q.events.error({ target: q.v });
  assert.equal(q.reports.length, 0);
});
test('the words for a dead page are the same on desktop', () => {
  const words = f => fs.readFileSync(f, 'utf8').match(/\/no longer available.*?\/i/)[0];
  assert.equal(words('main.js'), words('android/app/src/main/java/com/medanime/app/ui/PlaybackSession.kt'));
});
test('a late autoplay while dismissed is stopped', () => {
  const p = player({}, true); p.v.paused = false; p.emit('playing');
  assert.equal(p.v.paused, true); assert.equal(p.reports.length, 0);
});
test('does not seek a different video or an ad with a different duration', () => {
  const p = player({ duration: 24, time: 20, paused: false });
  p.emit('loadedmetadata'); assert.equal(p.v.currentTime, 0);
});
test('unrelated frames cannot issue playback commands', () => {
  const p = player(); p.v.paused = false; p.suspend(true, {});
  assert.equal(p.v.paused, false); assert.equal(p.children.length, 0);
});

test('PiP Play and Pause reach the video and are forwarded to nested frames', async () => {
  const p = player();
  p.command(true); await Promise.resolve();
  assert.equal(p.v.paused, false); assert.equal(p.reports.at(-1).paused, false);
  assert.equal(p.children.at(-1).medflixPlay, true);
  p.command(false);
  assert.equal(p.v.paused, true); assert.equal(p.reports.at(-1).paused, true);
  assert.equal(p.children.at(-1).medflixPlay, false);
});
test('PiP commands cannot restart playback after dismissal', () => {
  const p = player({}, true); p.command(true);
  assert.equal(p.v.paused, true); assert.equal(p.children.length, 0);
});
test('unrelated frame cannot send PiP Play', () => {
  const p = player(); p.command(true, {});
  assert.equal(p.v.paused, true); assert.equal(p.children.length, 0);
});
test('a refused Play request reports that the video is still paused', async () => {
  const p = player();
  p.v.play = () => Promise.reject(new Error('host refused'));
  p.command(true); await Promise.resolve(); await Promise.resolve();
  assert.equal(p.reports.at(-1).paused, true);
});
