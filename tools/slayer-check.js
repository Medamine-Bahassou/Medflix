// DOM parser check in Electron, plus optional captured live responses from the REA investigation.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadURL('about:blank');
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, '../slayer.js'), 'utf8'));
    const result = await win.webContents.executeJavaScript(`(() => {
      const ok = (v, why) => { if (!v) throw Error(why); };
      const doc = new DOMParser().parseFromString('<body class="postid-42"><div class="page-item-detail"><div class="post-title"><a href="/manga/example/">Example</a></div><img data-src="https://sparkio.sparkmanga.net/cover.jpg"></div><a href="/page/4/">4</a><div class="post-title"><h1>Example</h1></div><div class="summary__content">Story</div><ul><li class="wp-manga-chapter"><a href="/manga/example/12.5/">الفصل ١٢.٥</a></li></ul></body>', 'text/html');
      const listing = Slayer.listing(doc, 'spark');
      ok(listing.items.length === 1 && listing.pages === 4, 'listing and pagination');
      const id = listing.items[0].path.split('/').pop(), s = Slayer.series(doc, id);
      ok(s.postId === '42' && s.title === 'Example' && s.story === 'Story', 'details');
      ok(s.chapters.length === 1 && +s.chapters[0].n === 12.5, 'chapters');
      ok(Slayer.url(s.chapters[0].id) === 'https://sparkmanga.net/manga/example/12.5/', 'chapter route');
      const polluted = new DOMParser().parseFromString('<head><meta property="og:image" content="/cover.webp"></head><body class="postid-187967"><h1>Access Denied</h1><div class="post-title"><h1>Fall for Me</h1></div><h1>Unrelated ad heading</h1><div class="summary_image"><img src="data:image/gif;base64,AAAA" data-srcset="/poster.webp 400w, /large.webp 800w"></div></body>', 'text/html');
      const sid = Slayer.id('spark', '/manga/fall-for-me/');
      const clean = Slayer.series(polluted, sid);
      ok(clean.title === 'Fall for Me', 'blocked embed must not enter the title');
      ok(clean.poster === 'https://sparkmanga.net/poster.webp', 'lazy source-set cover');
      polluted.querySelector('.summary_image').remove();
      ok(Slayer.series(polluted, sid).poster === 'https://sparkmanga.net/cover.webp', 'Open Graph cover fallback');
      let rejected = false;
      try { Slayer.series(new DOMParser().parseFromString('<body class="postid-187967"><div class="post-title"><h1>Access Denied</h1></div></body>', 'text/html'), sid); } catch { rejected = true; }
      ok(rejected, 'blocked document must not become metadata');
      return 'PASS: catalogue, pagination, details, chapter routes, blocked embed headings and cover fallbacks';
    })()`);
    console.log(result);
    if (process.env.SLAYER_CAPTURE_DIR) {
      const dir = process.env.SLAYER_CAPTURE_DIR;
      const home = fs.readFileSync(path.join(dir, 'spark-home.html'), 'utf8');
      const pages = JSON.parse(fs.readFileSync(path.join(dir, 'pages-test.json'), 'utf8')).data.data.content;
      const live = await win.webContents.executeJavaScript(`(() => {
        const parse = s => new DOMParser().parseFromString(s, 'text/html');
        const listing = Slayer.listing(parse(${JSON.stringify(home)}), 'spark');
        const images = Slayer.pages(parse(${JSON.stringify(pages)}));
        if (!listing.items.length || images.length !== 13) throw Error('live capture mismatch');
        return { catalogue: listing.items.length, chapterImages: images.length };
      })()`);
      console.log('PASS captured live responses:', live);
    }
    app.exit(0);
  } catch (e) { console.error(e); app.exit(1); }
});
