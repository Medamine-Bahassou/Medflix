// Live scraper check against the real site: `npx electron selftest.js`
const { app, BrowserWindow } = require('electron');
require('./main.js');

app.once('browser-window-created', (_, win) => win.webContents.once('did-finish-load', async () => {
  await new Promise(r => setTimeout(r, 4000)); // let the app's own first route run: a newer view drops loads started before it
  try {
    const r = await win.webContents.executeJavaScript(`(async () => {
      scraper.watch(null);
      const ok = (c, m) => { if (!c) throw new Error(m); };
      const h = await scraper.home(true);
      ok(h.hero.length && h.hero[0].banner && h.hero[0].path, 'hero');
      ok(h.rows.length >= 3 && h.rows.every(r => r.items.every(i => i.title && i.poster)), 'home rows');
      const b = await scraper.browse(2, true);
      ok(b.items.length >= 15 && b.pages > 50, 'browse ' + b.items.length + ' ' + b.pages);
      const ne = await scraper.newEpisodes(2, true);
      ok(ne.items.length >= 10 && ne.items.every(i => i.type === 'episode') && ne.pages === 3, 'new episodes ' + ne.items.length + ' ' + ne.pages);
      const m = await scraper.movies(1, true);
      ok(m.items.length && m.items[0].type === 'movie', 'movies');
      const air = await scraper.airTimes(true);
      ok(air.length > 50 && air.every(a => a.title && a.poster && !isNaN(new Date(a.at))), 'schedule ' + air.length);
      ok(scraper.airScore('Ao no Hako Season 2', 'Ao no Hako 2nd Season') === 1 && scraper.airScore('Ao no Hako', 'Ao no Hako 2nd Season') === 0, 'title match');
      const s = await scraper.search('naruto');
      ok(s.items.some(i => i.path === '/anime/naruto'), 'search');
      const d = await scraper.details('/anime/one-piece', true);
      ok(d.title === 'One Piece' && d.desc.length > 50 && d.poster && d.episodes.length > 1000 && d.episodes[0].ep === '1', 'details');
      const mv = await scraper.details('/movie/chao', true);
      ok(mv.title && mv.episodes.some(e => e.path === '/watch/movie/chao'), 'movie details');
      const ec = await edList('all', 1, true);
      ok(ec.items.length >= 8 && ec.items.every(i => i.path.startsWith('/cinema/فيلم-')) && ec.pages > 50 && ec.items.every(i => i.title && i.poster && i.path.startsWith('/cinema/')), 'cinema list ' + ec.items.length + ' ' + ec.pages);
      ok((await edList('english', 2, true)).items.length >= 15, 'cinema page 2');
      const es = await edSearch('demon slayer');
      ok(!es.some(i => /demon slayer/i.test(i.title)), 'anime films filtered: ' + es.map(i => i.title));
      const slug = ec.items[0].path.slice('/cinema/'.length), em = await load('edMovie', edUrl(slug), true);
      ok(em.title && em.poster && em.desc && /(myseed|arabseed|egydead)/.test(em.origin) && em.cat.length, 'cinema movie');
      const ew = await edWatch(em, slug);
      ok(ew.servers.length && ew.servers.every(s => s.url.startsWith('https://')), 'cinema servers');
      ok((await myseedNow(em, slug)).includes('player-gateway.php'), 'myseed link');
      ok(!ew.servers.some(s => s.backup && ew.servers.some(o => o !== s && o.label === s.label)), 'cinema servers deduped');
      const bslug = 'فيلم-boyka-undisputed-2016-مترجم', bw = await seedWatch(await load('edMovie', edUrl(bslug), true), bslug); // an old film: myseed still lists long-gone hosts
      ok(bw.servers.length && !bw.servers.some(s => DEAD_HOSTS.test(new URL(s.url).hostname)), 'dead hosts dropped: ' + bw.servers.map(s => s.label));
      const mw = await mcWatch({ title: 'Camp Rock 3', year: '2026', dub: false });
      const ww = await wcWatch({ title: 'Weapons', year: '2025', dub: false });
      ok(ww.servers.length >= 3 && ww.servers.every(s => s.url.startsWith('https://') && s.backup) && ww.downloads.length, 'wecima film servers ' + ww.servers.map(s => s.label));
      const wa = await scraper.wecima('Kusuriya no Hitorigoto 2nd Season', '', '4', false), wm = await scraper.wecima('Suzume no Tojimari', '', '', true);
      ok(wa.length >= 3 && wm.length && [...wa, ...wm].every(s => s.url.startsWith('https://')), 'wecima anime servers ' + wa.length + ' ' + wm.length);
      const ra = await scraper.ristoanime('Black Clover 2nd Season', '', '4', false), r1 = await scraper.ristoanime('BLEACH: Sennen Kessen-hen - Kashin-tan', '', '9', false);
      ok(ra.length >= 3 && r1.length >= 3 && [...ra, ...r1].every(s => s.url.startsWith('https://')), 'ristoanime servers ' + ra.length + ' ' + r1.length);
      ok(mw.servers.length >= 3 && mw.servers.every(s => s.url.startsWith('https://') && s.ref) && mw.downloads.length, 'mycima servers ' + mw.servers.map(s => s.label));
      ok(closeness('spiderman', 'Spider-Man: No Way Home') === 1 && closeness('naurto', 'Naruto') > .5 && closeness('naurto', 'Bleach') < .3, 'search closeness');
      const fz = await fuzzySearch('naurto', 'anime', v => scraper.search(v).then(r => r.items));
      ok(fz.length && /naruto/i.test(fz[0].title), 'fuzzy anime search: ' + fz.slice(0, 3).map(c => c.title));
      const ff = await fuzzySearch('weapns', 'film', edSearch);
      ok(ff.some(c => /weapons/i.test(c.title)), 'fuzzy film search: ' + ff.slice(0, 3).map(c => c.title));
      const nano = await mChapters(247366, true); // 201 chapters: past MangaSwat's 200-a-page cap
      ok(nano.length === 201 && new Set(nano.map(c => c.id)).size === 201, 'manga chapter pages ' + nano.length);
      const sr = await load('edMovie', edUrl('serie/مسلسل-المؤسس-عثمان'), true), ss = await load('edMovie', edUrl(sr.seasons[0].path.slice(8)), true);
      ok(sr.seasons.length >= 4 && ss.episodes.length > 10 && ss.episodes[0].n === '1' && ss.up === 'serie/مسلسل-المؤسس-عثمان', 'cinema series ' + sr.seasons.length + ' ' + ss.episodes.length);
      const sl = await edList('series', 1, true);
      ok(sl.items.length >= 15 && sl.items.every(i => i.path.startsWith('/cinema/serie/')), 'cinema series list');
      const fe = (await edList('english-series', 1, true)).items.find(i => i.path.startsWith('/cinema/episode/')), fm = await load('edMovie', edUrl(fe.path.slice(8)), true);
      ok(fe.href.endsWith('/show') && !/الحلقة/.test(fe.title) && ['season/', 'serie/'].some(d => fm.up.startsWith(d)), 'episode card opens its show: ' + fe.title + ' ' + fm.up);
      const tl = await olyList({}, 1, true);
      ok(tl.items.length === 10 && tl.items.every(i => i.title && i.poster && i.path.startsWith('/manga/series/o:')), 'olympus list');
      const solo = await mSeriesFull('o:demonic-emperor', true); // Demonic Emperor: on both sites, shown as MangaSwat's
      ok(solo.s.id === 1702433 && solo.chs.length > 900, 'manga twins ' + solo.s.id);
      ok(mMerge([[{ title: 'Solo Leveling' }], [{ title: 'Solo leveling!' }, { title: 'Other' }]]).length === 2, 'manga dedupe');
      const tc = await mChapter('o:demonic-emperor:0'); // Demonic Emperor ch.0, Olympus only
      ok(tc.images.length > 0 && tc.images.every(u => u.startsWith('https://cdn.olympustaff.com/uploads/')), 'olympus pages ' + tc.images.length);
      return { manga: [tl.items.length, solo.chs.length + ' solo chapters'], cinema: [em.title, em.year, em.origin, ew.servers.length + ' servers', ew.downloads.length + ' downloads', es.length + ' non-anime demon slayer hits'], rows: h.rows.map(r => r.title + ':' + r.items.length), hero: h.hero.length, pages: b.pages, eps: d.episodes.length, tags: d.tags, genres: d.genres, info: d.info.length, related: d.related.length, trailer: !!d.trailer, movie: mv.title };
    })()`);
    console.log('PASS', JSON.stringify(r, null, 1));
  } catch (e) { console.log('FAIL', e.message); process.exitCode = 1; }
  app.quit();
}));
