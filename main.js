const { app, BrowserWindow, Notification, WebContentsView, ipcMain, net, protocol, session, shell } = require('electron');
const crypto = require('crypto');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

dns.setDefaultResultOrder('ipv4first');
require('net').setDefaultAutoSelectFamily?.(false);
app.commandLine.appendSwitch('disable-ipv6');

const SITE = 'https://witanime.site';
const AR = 'https://eva.animerco.org'; // backup video servers
const MANGA = 'https://appswat.com'; // the manga section's API (MeshManga)
const AS = 'https://animeschedule.net'; // the schedule's air times
const TEK = ['https://api.mangatek.com', 'https://mangatek.com']; // the manga section's second source (its API, and reader pages for the page lists)
const MC = 'https://cima.my-cima.net'; // the movies section's backup servers (MyCima)
// more backup servers, films' and anime's: Cloudflare lets a request through that names the site as its referrer, so its
// pages (pop-up ads and all) are never opened in a window for the check (see refused below)
const WC = 'https://wecima.singles';
const RA = 'https://ristoanime.me'; // anime backup servers
const SUGGEST = ['https://kitsu.io', 'https://v3.sg.media-imdb.com']; // the search's typo-tolerant title suggestions (app.js)
const EGYDEAD = /^https:\/\/([a-z0-9-]+\.)*(egydead|myseed|arabseed)\.[a-z]+$/; // the movies section: the site hops between domains
// plain Chrome of the version Electron really runs: Cloudflare's check fails a user agent that disagrees with the
// browser's client hints (they name the real version)
const CHROME = process.versions.chrome.split('.')[0];
const UA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME}.0.0.0 Safari/537.36`;
const DB_FILE = path.join(app.getPath('userData'), 'medanime-db.json');

// --- persistence: one JSON file, written at most once per second ---
let db = {};
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DB_FILE + '.tmp', JSON.stringify(db), e => !e && fs.rename(DB_FILE + '.tmp', DB_FILE, () => {})), 1000);
};

ipcMain.handle('db:get', (_, key) => db[key]);
ipcMain.on('titlebar', (e, color) => BrowserWindow.fromWebContents(e.sender)?.setTitleBarOverlay({ color }));
ipcMain.handle('db:set', (_, key, value) => { db[key] = value; save(); });

// witanime rate-limits bursts with HTTP 429 (its player API allows ~20 calls a minute): wait and retry,
// rather than failing the page or skipping a server that would have worked.
// Refused by Cloudflare's check (egydead puts its whole site behind it): pass it once (passCheck), then ask again.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry429(send, origin = SITE, page = origin + '/') {
  for (let i = 0, checked = false; ; i++) {
    const res = await send();
    if (res.headers.get('cf-mitigated') === 'challenge' && !checked && !refused.has(siteKey(origin))) { checked = true; i--; await passCheck(origin, page).catch(() => {}); continue; }
    if (res.status !== 429 || i === 3) return res;
    await sleep((+res.headers.get('retry-after') || 2 ** i) * 1000);
  }
}
// Cloudflare's check runs only in a page: the site's home opens in a window of the app's own session (same user agent,
// same cookies), shown if the check doesn't clear by itself so its box can be ticked. Its clearance cookie then lets
// the app's requests through. Resolves once the site's own page loads.
// It stays up until passed, closed, or 2 minutes go by, whatever it reloads meanwhile: egydead's re-asks its box every
// ~30s until it's ticked. Not passed: that site isn't checked again this run and its requests just fail.
const siteKey = origin => EGYDEAD.test(origin) ? 'egydead' : origin; // egydead hops between domains: one check for all
const checks = {}, refused = new Set([WC]);
// page: the refused page itself (egydead's home isn't behind the check, so passing there clears nothing)
const passCheck = (origin, page) => checks[siteKey(origin)] ||= new Promise((ok, fail) => {
  const key = siteKey(origin);
  const w = new BrowserWindow({ width: 560, height: 680, show: false, title: 'Cloudflare', autoHideMenuBar: true, backgroundColor: '#000000',
    parent: BrowserWindow.getAllWindows().find(b => !b.getParentWindow()) });
  let over = false;
  const done = settle => {
    if (over) return; over = true; delete checks[key]; clearTimeout(reveal); clearTimeout(limit); settle();
    if (w.isDestroyed()) return;
    if (key === 'egydead' && settle === ok) { w.hide(); edWin?.isDestroyed() || edWin?.destroy(); edWin = w; } else w.destroy(); // kept: egydead's requests are made from it
  };
  const give = () => done(() => { refused.add(key); fail(new Error('Cloudflare check not passed')); });
  const reveal = setTimeout(() => !w.isDestroyed() && w.show(), 1500);
  const limit = setTimeout(give, 120e3);
  w.webContents.on('did-navigate', (_, url, code) => code < 400 && done(ok)); // the check reloads the page once passed
  w.on('closed', give);
  w.loadURL(page).catch(() => {});
});

// Only ever fetch pages of the scraped site (renderer is not trusted to hit arbitrary URLs).
// form: POSTs these fields instead of a GET (egydead's watch page, MyCima's search)
ipcMain.handle('fetch', async (_, url, form) => {
  const u = new URL(url, SITE);
  if (![SITE, AR, RA, MANGA, AS, MC, WC, ...TEK, ...SUGGEST].includes(u.origin) && !EGYDEAD.test(u.origin)) throw new Error('blocked: ' + u.origin);
  const headers = { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', ...(u.origin === WC && { Referer: WC + '/' }) };
  if (u.pathname === '/new-episodes') return pagerFetch(u.href, headers);
  if (/(^|\.)egydead\./.test(u.hostname)) return edFetch(u);
  // a form is the site's own XHR (myseed answers its server calls only to one): sent as its page sends it
  const opts = form ? { method: 'POST', body: new URLSearchParams(form).toString(), headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Origin: u.origin } } : { headers };
  const res = await retry429(() => session.defaultSession.fetch(u.href, opts), u.origin, form ? u.origin + '/' : u.href); // a form's page can't be opened: its site's home
  if (!res.ok) throw new Error(`HTTP ${res.status} ${u.pathname}${res.headers.get('cf-mitigated') ? ' · Cloudflare check' : ''}`);
  return res.text();
});
// egydead refuses the app's own requests even once its check is passed (with its cookie, same user agent): only its
// page's go through. So they're made from inside its page, the check's window kept hidden on the site (as on Android).
// It hops domains: asked on the domain that window landed on
let edWin = null;
async function edFetch(u) {
  for (let checked = false; ; checked = true) {
    if (!edWin || edWin.isDestroyed()) {
      if (refused.has('egydead')) throw new Error(`HTTP 403 ${u.pathname} · Cloudflare check`);
      await passCheck(u.origin, u.href).catch(() => {});
      continue;
    }
    const at = new URL(edWin.webContents.getURL()).origin + u.pathname + u.search;
    const [status, cf, text] = await edWin.webContents.executeJavaScript(`fetch(${JSON.stringify(at)}).then(async r => [r.status, r.headers.get('cf-mitigated'), await r.text()])`);
    if (cf === 'challenge' && !checked) { edWin.destroy(); continue; } // its clearance ran out: the check again, shown
    if (status >= 400) throw new Error(`HTTP ${status} ${u.pathname}${cf ? ' · Cloudflare check' : ''}`);
    return text;
  }
}
// egydead's MegaMax player only wraps other hosts. Its page lists their embeds when asked the way its own script
// asks on play (an Inertia partial reload, which needs the page's version): { status, data: [{ label, mirrors: [{ driver, link }] }] }
ipcMain.handle('mirrors', async (_, url) => {
  if (!/^https:\/\/[^/]+\/iframe\/[A-Za-z0-9]+$/.test(url)) throw new Error('bad url');
  const get = async (headers = {}) => {
    const res = await session.defaultSession.fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  const page = JSON.parse((await get()).match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const part = await get({ 'X-Inertia': 'true', 'X-Inertia-Version': page.version, 'X-Inertia-Partial-Component': page.component, 'X-Inertia-Partial-Data': 'streams' });
  return JSON.parse(part).props.streams;
});
// The home page's "latest episodes" pager is a JSON call that 404s unless it looks like the page's own
// same-origin request (referer + Sec-Fetch-Site). session.fetch ignores `origin`, net.request honours it.
const pagerFetch = (url, headers) => new Promise((ok, fail) => {
  const req = net.request({ url, origin: SITE, headers: { ...headers, Accept: 'application/json', Referer: SITE + '/' } });
  req.on('response', res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => res.statusCode < 400 ? ok(body) : fail(new Error(`HTTP ${res.statusCode} /new-episodes`)));
  });
  req.on('error', fail);
  req.end();
});

// --- image cache ---
// Posters/banners from the scraped sites load through medimg://i/?u=<url> and are kept on disk for good.
// A saved image shows at once and is re-downloaded from the site once per app run.
const IMG_DIR = path.join(app.getPath('userData'), 'images');
// manga: only appswat's (or its meshmanga.com mirror's) sized posters/covers and mangatek's covers; chapter pages are read once and would just fill the disk
const IMG_HOSTS = /^https:\/\/(images\.witanime\.site|eva\.animerco\.org\/wp-content\/uploads|(appswat|meshmanga)\.com\/v2\/media\/__sized__|api\.mangatek\.com\/covers|img\.animeschedule\.net\/production|media\.kitsu\.app\/episodes|([a-z0-9-]+\.)*(egydead|myseed|arabseed)\.[a-z]+\/wp-content\/uploads)\//;
const imgChecked = new Set();
protocol.registerSchemesAsPrivileged([{ scheme: 'medimg', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

async function downloadImage(src, file) {
  const res = await session.defaultSession.fetch(src, { headers: { 'User-Agent': UA } }); // no referer: witanime blocks hotlinks
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // a page sent in place of the image (a block, an error page, as 200) would replace the good copy for good
  if (/^text\//.test(res.headers.get('content-type') || '')) throw new Error('not an image');
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(file + '.tmp', buf);
  await fs.promises.rename(file + '.tmp', file);
  return buf;
}
async function serveImage(req) {
  const src = new URL(req.url).searchParams.get('u') || '';
  if (!IMG_HOSTS.test(src)) return new Response(null, { status: 403 });
  const file = path.join(IMG_DIR, crypto.createHash('sha1').update(src).digest('hex'));
  const saved = await fs.promises.readFile(file).catch(() => null);
  if (saved) {
    if (!imgChecked.has(src)) { imgChecked.add(src); downloadImage(src, file).catch(() => {}); }
    return new Response(saved);
  }
  try { return new Response(await downloadImage(src, file)); }
  catch { return new Response(null, { status: 502 }); }
}

// No popups/pop-unders from the site or its ad scripts.
app.on('web-contents-created', (_, wc) => wc.setWindowOpenHandler(() => ({ action: 'deny' })));

// --- player ---
// The site resolves a server token to the video host's embed URL in three hops; we replay them
// here and load the host's player straight into our view, so the witanime page never shows.
// The API 404s unless it sees a client-hint header, and the gate only answers same-origin iframe loads.
const CH = { 'sec-ch-ua': `"Chromium";v="${CHROME}"` };
let csrf = '';
const post = url => retry429(() => session.defaultSession.fetch(SITE + url, { method: 'POST', credentials: 'include', headers: { ...CH, Accept: 'application/json', 'X-CSRF-TOKEN': csrf } }));

// an episode's server list: { players: {FHD: [...]}, downloads: {FHD: [...]} }.
// The site only answers for the episode whose page the session just loaded, and it rate-limits each session,
// so the player and the download menu share one lookup of the episode being watched.
let lastManifest = null; // { epPath, at, promise }
function manifest(epPath) {
  if (lastManifest?.epPath === epPath && Date.now() - lastManifest.at < 5 * 60e3) return lastManifest.promise;
  const m = lastManifest = { epPath, at: Date.now(), promise: loadManifest(epPath) };
  m.promise.catch(() => lastManifest === m && (lastManifest = null));
  return m.promise;
}
async function loadManifest(epPath) {
  if (!/^\/watch\/[^?#]+$/.test(epPath)) throw new Error('bad path');
  const page = await retry429(() => session.defaultSession.fetch(SITE + epPath, { credentials: 'include', headers: CH }));
  if (page.status === 429) throw new Error('rate-limited');
  // the token is in <head>: stop reading there instead of pulling the whole ~3MB page
  const reader = page.body.getReader(), dec = new TextDecoder();
  let head = '';
  for (let m; ;) {
    const { done, value } = await reader.read();
    if (done) break;
    head += dec.decode(value, { stream: true });
    if ((m = head.match(/name="csrf-token" content="([^"]+)"/))) { csrf = m[1]; reader.cancel(); break; }
  }
  const res = await post(epPath + '/sources');
  if (res.status === 429) throw new Error('rate-limited');
  if (!res.ok) throw new Error(`sources HTTP ${res.status}`);
  return res.json();
}
const flat = (byQuality = {}) => Object.entries(byQuality).flatMap(([quality, list]) => list.map(s => ({ ...s, quality })));
ipcMain.handle('sources', async (_, epPath) => flat((await manifest(epPath)).players));
ipcMain.handle('download-links', async (_, epPath) => flat((await manifest(epPath)).downloads));

// token -> the host's URL: the gate redirects there, but only for the kind of request the site's own page makes
const gateOnce = (kind, token, dest) => new Promise((ok, fail) => {
  const req = net.request({ url: `${SITE}/watch/${kind}-gate/${token}`, redirect: 'manual', useSessionCookies: true,
    headers: { ...CH, 'Sec-Fetch-Dest': dest, 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'same-origin' } });
  req.on('redirect', (_s, _m, to) => { req.abort(); ok({ status: 302, url: to }); });
  req.on('response', r => ok({ status: r.statusCode, headers: { get: k => [r.headers[k]].flat()[0] } }));
  req.on('error', fail);
  req.end();
});
const gate = async (kind, token, dest) => {
  const res = await retry429(() => gateOnce(kind, token, dest));
  if (!res.url) throw new Error(`gate HTTP ${res.status}`);
  return res.url;
};

ipcMain.handle('stream', async (_, token) => {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
  const res = await post('/watch/stream-source/' + token);
  if (!res.ok) throw new Error(`server HTTP ${res.status}`);
  const { referrerPolicy } = await res.json();
  return { url: await gate('stream', token, 'iframe'), referrer: referrerPolicy === 'origin' ? SITE + '/' : '' };
});

// --- downloads ---
// Only MediaFire is automated: its page carries the direct file link (Workupload has a captcha, MEGA decrypts
// in the browser, Google Drive links are often dead). Its files are a zip around one .mp4, unpacked as it arrives.
const zlib = require('zlib');
const { pipeline, Readable, Transform } = require('stream');
const DL_DIR = path.join(app.getPath('videos'), 'MedAnime');
const downloads = new Map(); // id -> { ac: AbortController, received, total }

// desktop has no progress notification: overall progress goes on the taskbar icon, and each finished episode
// gets a system notification
const taskbar = win => {
  let r = 0, t = 0;
  for (const d of downloads.values()) { r += d.received; t += d.total; }
  win?.setProgressBar(downloads.size ? (t ? r / t : 2) : -1); // 2 = indeterminate, -1 = hidden
};

// drops the zip's local file header; what follows is the raw deflate stream of the first file
const zipEntryBody = () => {
  let head = Buffer.alloc(0), passing = false;
  return new Transform({ transform(chunk, _, cb) {
    if (passing) return cb(null, chunk);
    head = Buffer.concat([head, chunk]);
    if (head.length < 30) return cb();
    if (head.readUInt32LE(0) !== 0x04034b50 || head.readUInt16LE(8) !== 8) return cb(new Error('not a deflated zip'));
    const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    if (head.length < start) return cb();
    passing = true;
    cb(null, head.subarray(start));
  } });
};

function notifyFinished(win, state, labelDone, labelFailed, body) {
  if (state === 'cancelled' || !Notification.isSupported()) return;
  const n = new Notification({ title: state === 'done' ? labelDone : labelFailed, body, icon: path.join(__dirname, 'assets/icon.png') });
  n.on('click', () => { win?.show(); win?.focus(); });
  n.show();
}

ipcMain.handle('download', async (e, id, token, name, labels = {}) => {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
  const res = await post('/watch/download-source/' + token);
  if (!res.ok) throw new Error(`server HTTP ${res.status}`);
  const page = await gate('download', token, 'document');
  if (!new URL(page).hostname.endsWith('mediafire.com')) throw new Error('unsupported host');
  const html = await (await session.defaultSession.fetch(page)).text();
  const direct = html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/)?.[1];
  if (!direct) throw new Error('no download link');

  fs.mkdirSync(DL_DIR, { recursive: true });
  const file = path.join(DL_DIR, name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.mp4');
  const ac = new AbortController();
  const body = await session.defaultSession.fetch(direct, { signal: ac.signal });
  if (!body.ok) throw new Error(`file HTTP ${body.status}`);
  const total = +body.headers.get('content-length') || 0;
  const dl = { ac, received: 0, total };
  downloads.set(id, dl);
  const win = BrowserWindow.fromWebContents(e.sender);
  let sent = 0;
  const send = state => !e.sender.isDestroyed() && e.sender.send('download:progress', { id, state, received: dl.received, total, file });
  const progress = new Transform({ transform(chunk, _, cb) {
    dl.received += chunk.length;
    if (Date.now() - sent > 500) { sent = Date.now(); send('active'); taskbar(win); }
    cb(null, chunk);
  } });
  pipeline(Readable.fromWeb(body.body), progress, zipEntryBody(), zlib.createInflateRaw(), fs.createWriteStream(file), err => {
    downloads.delete(id);
    taskbar(win);
    if (err) fs.rm(file, { force: true }, () => {});
    const state = !err ? 'done' : ac.signal.aborted ? 'cancelled' : 'error';
    send(state);
    notifyFinished(win, state, labels.labelDone, labels.labelFailed, labels.title || name);
  });
  send('active');
  return file;
});
ipcMain.handle('download-open', async (_, token) => {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
  const res = await post('/watch/download-source/' + token);
  if (!res.ok) throw new Error(`server HTTP ${res.status}`);
  const url = await gate('download', token, 'document');
  if (!url.startsWith('https://')) throw new Error('bad url');
  await shell.openExternal(url);
});
ipcMain.on('download:cancel', (_, id) => downloads.get(id)?.ac.abort());
// a manga chapter: its page images, one file each, in Videos/MedAnime/Manga/<series>/<chapter>/
ipcMain.handle('download-pages', async (e, id, urls, folder, labels = {}) => {
  if (!Array.isArray(urls) || !urls.length || !urls.every(u => /^https:\/\/((appswat|meshmanga)\.com\/v2\/media|img\.mangatek\.com)\//.test(u))) throw new Error('bad urls');
  const clean = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').trim() || '_';
  const dir = path.join(DL_DIR, 'Manga', ...folder.map(clean));
  await fs.promises.mkdir(dir, { recursive: true });
  const ac = new AbortController(), dl = { ac, received: 0, total: urls.length }, files = [];
  downloads.set(id, dl);
  const win = BrowserWindow.fromWebContents(e.sender);
  const send = state => !e.sender.isDestroyed() && e.sender.send('download:progress', { id, state, received: dl.received, total: dl.total, file: dir, files });
  (async () => {
    let state = 'done';
    try {
      for (const [i, u] of urls.entries()) {
        const res = await session.defaultSession.fetch(u, { signal: ac.signal, headers: { 'User-Agent': UA } });
        dl.received = i + 1;
        if (res.status === 404) continue; // the site lists some pages that don't exist: skip them, like its reader does
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const f = path.join(dir, String(i + 1).padStart(4, '0') + (path.extname(new URL(u).pathname) || '.jpg'));
        await fs.promises.writeFile(f, Buffer.from(await res.arrayBuffer()));
        files.push(f);
        send('active'); taskbar(win);
      }
    } catch {
      state = ac.signal.aborted ? 'cancelled' : 'error';
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
    downloads.delete(id);
    taskbar(win);
    send(state);
    notifyFinished(win, state, labels.labelDone, labels.labelFailed, labels.title);
  })();
  return dir;
});
// a downloaded episode file or chapter folder; never anything outside the downloads folder
ipcMain.handle('download:delete', (_, file) => file?.startsWith(DL_DIR + path.sep) && fs.promises.rm(file, { force: true, recursive: true }));

ipcMain.on('player:visible', (_, v) => player?.setVisible(v));
ipcMain.handle('player:snapshot', async () => {
  const img = player && await player.webContents.capturePage();
  return img && !img.isEmpty() ? img.toDataURL() : ''; // empty while the view isn't on screen yet
});
// the feedback form (app.js feedbackSheet), emailed on by web3forms. its access key is public by design
ipcMain.handle('feedback', async (_, { email = '', message = '' }) => {
  const res = await session.defaultSession.fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ access_key: '197ce167-d8f2-4479-ae56-1ebfcdd5b787', subject: 'Medflix feedback (desktop)', email: String(email), message: String(message) }) });
  const data = await res.json().catch(() => ({}));
  if (!data.success) throw new Error(data.message || 'HTTP ' + res.status);
});
ipcMain.on('open-external', (_, url) => /^https:\/\//.test(url) && shell.openExternal(url)); // site pages, and egydead's download hosts

let player = null, playerBounds, playerFull = false;
const PLAYER_CDNS = /(^|\.)(jsdelivr\.net|cdnjs\.cloudflare\.com|jwpcdn\.com|jwplayer\.com|jquery\.com|googleapis\.com|gstatic\.com|unpkg\.com|bootstrapcdn\.com|fluidplayer\.com|videojs\.com|cloudflare\.com)$/;
ipcMain.on('player', (e, url, b, referrer) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!url) { if (player) { playerFull = false; win.contentView.removeChildView(player); player.webContents.close(); player = null; } return; }
  if (!url.startsWith('https://')) return;
  if (!player) {
    player = new WebContentsView();
    player.setBackgroundColor('#000000');
    const wc = player.webContents;
    // the embed may navigate itself, but not off to another site
    wc.on('will-navigate', (ev, to) => { if (new URL(to).origin !== new URL(wc.getURL()).origin) ev.preventDefault(); });
    wc.on('before-input-event', (ev, i) => { if (i.type === 'keyDown' && i.key === 'Escape' && !playerFull) e.sender.send('player:back'); });
    // video fullscreen: stretch the view over the whole window, then put it back
    wc.on('enter-html-full-screen', () => { playerFull = true; const { width, height } = win.getContentBounds(); player.setBounds({ x: 0, y: 0, width, height }); });
    wc.on('leave-html-full-screen', () => { playerFull = false; player.setBounds(playerBounds); });
    // only show the view once the host's page has loaded (or after 5s, some hosts never stop loading),
    // so the renderer's spinner stays visible until then
    const view = player, show = () => player === view && !win.contentView.children.includes(view) && win.contentView.addChildView(view);
    wc.once('did-stop-loading', show);
    setTimeout(show, 5000);
  }
  playerBounds = b;
  if (!playerFull) player.setBounds(b);
  if (player.webContents.getURL() !== url) player.webContents.loadURL(url, { httpReferrer: referrer || undefined });
});

app.whenReady().then(() => {
  session.defaultSession.setUserAgent(UA);
  fs.mkdirSync(IMG_DIR, { recursive: true });
  protocol.handle('medimg', serveImage);
  // ponytail: crude ad blocker, drops third-party scripts injected into witanime pages.
  // Video hosts load inside their own iframes (different referrer) so they pass. Add a real filter list if ads slip through.
  const allowed = /(^|\.)(witanime\.site|cloudflare\.com|cloudflareinsights\.com)$/;
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
    let cancel = false;
    try {
      const host = new URL(d.url).hostname;
      const ref = d.referrer ? new URL(d.referrer).hostname : '';
      cancel = d.resourceType === 'script' && ref.endsWith('witanime.site') && !allowed.test(host);
      // the video host's own page (uqload & co.) pulls its ads from ad networks: inside the player, only scripts of the
      // host itself, of the frame asking (some hosts' player is a frame on another domain of theirs) and of the usual player
      // CDNs run. The others get an empty script instead of an error: hosts that check whether their ad script failed to
      // load (to say "disable your ad blocker") see it load. Frames and video segments (media/xhr) come from any domain.
      // ponytail: name-based first-party test, add a filter list if a host's ads come from its own domain
      if (player && d.webContentsId === player.webContents.id && d.resourceType === 'script') {
        const site = h => h.split('.').slice(-2)[0], frame = d.frame?.url || d.referrer;
        const own = [player.webContents.getURL(), frame].some(u => { try { return site(new URL(u).hostname) === site(host); } catch { return false; } });
        if (!own && !PLAYER_CDNS.test(host)) return cb({ redirectURL: 'data:text/javascript,' });
      }
    } catch {}
    cb({ cancel });
  });

  // YouTube embeds (trailers) refuse to play without a Referer ("Video player configuration error"), and a file://
  // page sends none: present the site the trailer link came from
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://www.youtube.com/embed/*', '*://www.youtube-nocookie.com/embed/*'] }, (d, cb) => {
    if (!d.requestHeaders.Referer) d.requestHeaders.Referer = 'https://witanime.site/';
    cb({ requestHeaders: d.requestHeaders });
  });

  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#000000', title: 'Medflix', autoHideMenuBar: true, icon: path.join(__dirname, 'assets/icon.png'),
    // No title bar; the OS-native min/max/close buttons are drawn over our nav.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#ffffff', height: 44 }, // Linux ignores alpha, so the renderer keeps this in sync with the nav
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
