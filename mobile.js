// Android (Capacitor) stand-in for the Electron preload API (preload.js / main.js): same calls, done with
// Capacitor's native HTTP (no CORS, any headers, shared cookie jar), IndexedDB, and an iframe player.
if (!window.api && window.Capacitor) (() => {
  const SITE = 'https://witanime.site', AR = 'https://eva.animerco.org', MANGA = 'https://appswat.com', TEK = ['https://api.mangatek.com', 'https://mangatek.com'], AS = 'https://animeschedule.net', MC = 'https://cima.my-cima.net', WC = 'https://wecima.social';
  const SUGGEST = ['https://kitsu.io', 'https://v3.sg.media-imdb.com']; // the search's title suggestions (app.js)
  // same desktop Chrome UA as the Electron build, so the sites serve the markup the scraper expects
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36';
  // witanime sits behind Cloudflare: talk to it as this WebView (same markup as desktop), the browser its cookies were earned in
  const WV_UA = navigator.userAgent, CH = { 'sec-ch-ua': `"Chromium";v="${WV_UA.match(/Chrome\/(\d+)/)?.[1] || 138}"` }; // witanime's API 404s without a client-hint header
  const Http = Capacitor.Plugins.CapacitorHttp;
  // Where Cloudflare refuses our native client (403/503), witanime is asked from inside a real WebView on the site
  // instead (DownloaderPlugin.siteFetch), which shows Cloudflare's check over the app when it has one
  let viaPage = false;
  const challenged = res => res.status === 403 || res.status === 503;
  // Cloudflare's own check: marked by a header, or its challenge page ("Just a moment…"). Not its challenge-platform script,
  // which Cloudflare adds to every page, witanime's own "access denied" page (data-status="403") included
  const cfCheck = res => header(res, 'cf-mitigated') === 'challenge' || (challenged(res) && /<title>\s*Just a moment|_cf_chl_opt|cf-chl-|challenge-form/i.test(String(res.data)));
  const siteBlock = res => res.status === 403 && /data-status="403"/.test(String(res.data));
  // what refused a request, for the error screen: who answered (Cloudflare's check, witanime's own block page...) and how we asked
  const refusal = res => {
    const title = String(res.data).match(/<title[^>]*>([^<]{1,80})/i)?.[1]?.trim();
    const who = cfCheck(res) ? 'Cloudflare check' : siteBlock(res) ? 'witanime block page' : header(res, 'cf-mitigated') ? 'Cloudflare ' + header(res, 'cf-mitigated') : title || '';
    return ` · ${res.via === 'page' ? 'in-app browser' : 'app'}${who ? ' · ' + who : ''}`;
  };
  const FORBIDDEN = /^(user-agent|referer|cookie|sec-|accept-language)/i; // the browser sets these itself
  const timeout = (p, ms, host) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('no answer from ' + host)), ms))]);
  const pageHttp = async (url, opt) => {
    const headers = Object.fromEntries(Object.entries(opt.headers || {}).filter(([k]) => !FORBIDDEN.test(k)));
    // a form (egydead's watch page): sent as its page sends it, from that page
    const form = opt.data && { body: new URLSearchParams(opt.data).toString(), referrer: url };
    // generous: the in-app browser may be waiting for Cloudflare's check to be ticked
    const ask = () => timeout(Downloader.siteFetch({ url, method: opt.method || 'GET', headers, stopAt: opt.stopAt || '', ...form }), 130e3, new URL(url).host);
    // interrupted: Cloudflare's check opened in that page meanwhile (another request's); ask again once it's through
    const r = await ask().catch(e => /interrupted/.test(e.message) ? ask() : Promise.reject(e));
    return { status: r.status, url: r.url, data: r.data, headers: r.headers, via: 'page' };
  };
  // egydead went behind Cloudflare's check too: once it refuses our native client there, egydead goes through its own
  // in-app page the same way. It hops domains (egydead.space redirects to the current one): the page sits on where it landed
  const ED_RE = /^https:\/\/([a-z0-9-]+\.)*(egydead|myseed|arabseed)\.[a-z]+\//;
  let edPage = ''; // that origin, once
  const visited = {}; // site -> when its page was last opened for Cloudflare's check (refused again soon after: just fail)
  const pageUrl = url => url.startsWith(SITE) ? viaPage && url : edPage && ED_RE.test(url) && edPage + url.replace(/^https:\/\/[^/]+/, '');
  const http = async (url, opt = {}, asPlayer = false) => {
    let res;
    const ua = url.startsWith(SITE) || asPlayer ? WV_UA : UA;
    for (let i = 0, checked = false; ; i++) { // witanime rate-limits bursts with 429: wait and retry (see main.js)
      const page = pageUrl(url);
      try {
        res = page ? await pageHttp(page, opt) : await Http.request({ url, method: 'GET', responseType: 'text',
          connectTimeout: 15e3, readTimeout: 30e3, ...opt, headers: { 'User-Agent': ua, 'Accept-Language': 'ar,en;q=0.8', ...opt.headers } });
      } catch (e) { // a connection that stalls or drops for our native client: witanime through the page instead
        if (!url.startsWith(SITE) || viaPage) throw e;
        viaPage = true; i--; continue;
      }
      if (!page && url.startsWith(SITE) && challenged(res)) { viaPage = true; i--; continue; } // this run: always through the page
      if (!page && ED_RE.test(url) && cfCheck(res)) { edPage = new URL(res.url || url).origin; i--; continue; }
      // refused in the in-app browser too: open the page itself there, full screen, once. Cloudflare's check can only be
      // passed that way (a script request can't), and it can be ticked. API calls and forms open the home page instead
      const site = new URL(page || url).origin;
      if (page && !checked && challenged(res) && !(Date.now() - visited[site] < 60e3)) {
        checked = true; i--; visited[site] = Date.now();
        const visit = (opt.method || 'GET') === 'GET' && !/json/.test(opt.headers?.Accept || '') ? page : new URL(page).origin + '/';
        // what only the site's own page has: witanime's csrf token, WordPress's API link on egydead
        const ok = page.startsWith(SITE) ? undefined : 'link[rel="https://api.w.org/"]';
        try { await Downloader.siteVisit({ url: visit, ok }); } catch (e) { e.message += ` · ${res.status} ${new URL(url).pathname}`; throw e; }
        continue;
      }
      if (res.status !== 429 || i === 3) break;
      await new Promise(r => setTimeout(r, (+header(res, 'retry-after') || 2 ** i) * 1000));
    }
    if (typeof res.data !== 'string') res.data = JSON.stringify(res.data); // JSON responses come back parsed
    return res;
  };
  const header = (res, name) => Object.entries(res.headers || {}).find(([k]) => k.toLowerCase() === name)?.[1];

  const Downloader = Capacitor.Plugins.Downloader;

  // --- storage: one IndexedDB key/value store (localStorage is too small for the page cache) ---
  const idb = new Promise((ok, fail) => {
    const r = indexedDB.open('medanime', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  const kv = async (mode, op) => {
    const q = op((await idb).transaction('kv', mode).objectStore('kv'));
    return new Promise((ok, fail) => { q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error); });
  };

  // --- witanime server tokens -> host URL (see main.js for why each header is needed) ---
  let csrf = '';
  const post = url => http(SITE + url, { method: 'POST', headers: { ...CH, Accept: 'application/json', 'X-CSRF-TOKEN': csrf } });
  // shared by the player and the download menu for the episode being watched (see main.js)
  let lastManifest = null;
  const manifest = epPath => {
    if (lastManifest?.epPath === epPath && Date.now() - lastManifest.at < 5 * 60e3) return lastManifest.promise;
    const m = lastManifest = { epPath, at: Date.now(), promise: loadManifest(epPath) };
    m.promise.catch(() => lastManifest === m && (lastManifest = null));
    return m.promise;
  };
  const loadManifest = async epPath => {
    if (!/^\/watch\/[^?#]+$/.test(epPath)) throw new Error('bad path');
    const page = await http(SITE + epPath, { headers: CH, stopAt: 'name="csrf-token" content="[^"]+"' }); // the page only reads up to it
    if (page.status === 429) throw new Error('rate-limited');
    if (page.status >= 400) throw new Error(`episode page HTTP ${page.status}${refusal(page)}`);
    csrf = page.data.match(/name="csrf-token" content="([^"]+)"/)?.[1] || '';
    const res = await post(epPath + '/sources');
    if (res.status === 429) throw new Error('rate-limited');
    if (res.status >= 400) throw new Error(`sources HTTP ${res.status}${refusal(res)}`);
    return JSON.parse(res.data);
  };
  const flat = (byQuality = {}) => Object.entries(byQuality).flatMap(([quality, list]) => list.map(s => ({ ...s, quality })));
  let gates = Promise.resolve(); // the page catches one gate's redirect at a time
  const gate = async (kind, token, dest) => {
    const url = `${SITE}/watch/${kind}-gate/${token}`;
    // stream gates only answer iframe loads, and WebView reports neither callback for an iframe's redirect, so the page
    // can't catch where they go: always asked natively, as the WebView (its user agent, and the cookies its check earned)
    if (viaPage && dest !== 'iframe') {
      const mine = gates.then(() => Downloader.siteGate({ url }));
      gates = mine.catch(() => {});
      return (await mine).url;
    }
    const opt = { disableRedirects: true, headers: { ...CH, 'Sec-Fetch-Dest': dest, 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'same-origin' } };
    const res = viaPage ? await Http.request({ url, method: 'GET', responseType: 'text', connectTimeout: 15e3, readTimeout: 30e3, ...opt,
      headers: { 'User-Agent': WV_UA, 'Accept-Language': 'ar,en;q=0.8', ...opt.headers } }) : await http(url, opt);
    const to = header(res, 'location') || (res.url?.startsWith(SITE) ? '' : res.url); // redirect not reported: use the final URL
    if (!to) throw new Error(`gate HTTP ${res.status}${refusal(res)}`);
    return to;
  };
  // --- player: an iframe over the stage rect; z-index keeps it under the header's server menu ---
  const frame = () => document.querySelector('.player > iframe.mplayer');

  window.api = {
    // form: POST these fields (egydead's watch page); asPlayer: asked as the player's iframe (this WebView) asks, for links
    // that only play in the browser that got them (myseed's)
    async fetch(url, form, asPlayer) {
      const u = new URL(url, SITE);
      if (![SITE, AR, MANGA, AS, MC, WC, ...TEK, ...SUGGEST].includes(u.origin) && !/^https:\/\/([a-z0-9-]+\.)*(egydead|myseed|arabseed)\.[a-z]+$/.test(u.origin)) throw new Error('blocked: ' + u.origin);
      // form: egydead's watch page, which its server can take over 30s to build the first time it's asked
      const res = await http(u.href, form ? { method: 'POST', data: form, readTimeout: 90e3,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }
        // the latest-episodes pager 404s unless it looks like the home page's own call (see main.js): Origin, or X-Requested-With
        : u.pathname === '/new-episodes' ? { headers: { Accept: 'application/json', Referer: SITE + '/', Origin: SITE, 'X-Requested-With': 'XMLHttpRequest' } }
        // WeCima: Cloudflare lets it through with the site as the referrer (see main.js); its pages are never opened
        : u.origin === WC ? { headers: { Referer: WC + '/' } } : {}, asPlayer);
      if (res.status >= 400) throw new Error(`HTTP ${res.status} ${u.pathname}${refusal(res)}`);
      return res.data;
    },
    // everything but the page cache is also kept in the phone's MEDFLIX folder once allowed (see DownloaderPlugin),
    // and read from there first, so settings, lists and downloads come back after reinstalling the app
    async get(key) {
      const f = key !== 'pages' && (await Downloader.readData({ key }).catch(() => null))?.value;
      const v = f ? JSON.parse(f) : await kv('readonly', s => s.get(key));
      // files saved while the folder was still called MedAnime (DownloaderPlugin renames it)
      return key === 'downloads' && v ? JSON.parse(JSON.stringify(v).replaceAll('/MedAnime/Downloads/', '/MEDFLIX/Downloads/')) : v;
    },
    set(key, value) {
      if (key !== 'pages') Downloader.writeData({ key, value: JSON.stringify(value) }).catch(() => {}); // not allowed: IndexedDB only
      return kv('readwrite', s => s.put(value, key));
    },
    unblock: async () => { viaPage = true; }, // Verify: witanime through the site's page from now on (it shows Cloudflare's check if there is one)
    storage: () => Downloader.storage(), // { granted, hasData, path }
    requestStorage: () => Downloader.requestStorage(),
    scrollbar: on => Downloader.scrollbar({ on }).catch(() => {}), // the WebView's own scrollbar, hidden in the manga reader

    sources: async epPath => flat((await manifest(epPath)).players),
    async mirrors(url) { // egydead's MegaMax player: the hosts it wraps (see main.js)
      if (!/^https:\/\/[^/]+\/iframe\/[A-Za-z0-9]+$/.test(url)) throw new Error('bad url');
      const page = JSON.parse((await http(url)).data.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      const res = await http(url, { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': page.version, 'X-Inertia-Partial-Component': page.component, 'X-Inertia-Partial-Data': 'streams' } });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(res.data).props.streams;
    },
    downloadLinks: async epPath => flat((await manifest(epPath)).downloads),
    async stream(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
      const src = await post('/watch/stream-source/' + token);
      if (src.status >= 400) throw new Error(`server HTTP ${src.status}`);
      return { url: await gate('stream', token, 'iframe'), referrer: '' };
    },

    // downloads: the file link, resolved as main.js does (MediaFire's direct link); the download service does the rest
    async downloadUrl(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
      const src = await post('/watch/download-source/' + token);
      if (src.status >= 400) throw new Error(`server HTTP ${src.status}`);
      const page = await gate('download', token, 'document');
      if (!new URL(page).hostname.endsWith('mediafire.com')) throw new Error('unsupported host');
      const direct = (await http(page)).data.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/)?.[1];
      if (!direct) throw new Error('no download link');
      return direct;
    },
    downloadEnqueue: job => Downloader.enqueue(job).catch(e => console.error(e)), // see pumpDownloads (app.js)
    async openDownloadPage(token) { // hosts the app can't download from: their page in the system browser
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
      const src = await post('/watch/download-source/' + token);
      if (src.status >= 400) throw new Error(`server HTTP ${src.status}`);
      await Downloader.openUrl({ url: await gate('download', token, 'document') });
    },
    downloadCancel: id => Downloader.cancel({ id }),
    downloadHold: (on, labels) => Downloader.hold({ on, ...labels }).catch(() => {}), // see saveDownloads (app.js)
    downloadDelete: file => Downloader.remove({ path: file }),
    onDownload: fn => Downloader.addListener('progress', fn),
    downloadStatus: () => Downloader.status(), // { id: latest progress } of downloads that ran while the page was closed
    fileSrc: file => Capacitor.convertFileSrc('file://' + file),
    // animerco's /player/ pages refuse to be framed by other sites; most just wrap the host's own embed, so use that
    async unwrap(url) {
      if (!url.startsWith(AR + '/player/')) return url;
      const inner = (await http(url)).data.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
      if (!inner) throw new Error('not embeddable on mobile');
      return new URL(inner, url).href;
    },

    player(url, b) {
      let f = frame();
      if (!url || f?.dataset.src !== url) Downloader.castReset(); // casting takes the video of what's in it now
      if (!url) return f?.remove();
      const host = document.querySelector('.player');
      if (!host) return;
      if (!f) {
        f = document.createElement('iframe');
        f.className = 'mplayer';
        f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        f.allowFullscreen = true;
        f.referrerPolicy = 'no-referrer';
        // no sandbox: several movie hosts (earnvids, streamhg, doodstream) refuse to play in one. What it guarded against
        // is refused natively instead (MainActivity): popups, navigating the app away, and the players' alert boxes
        host.append(f);
      }
      Object.assign(f.style, { left: b.x + 'px', top: b.y + 'px', width: b.width + 'px', height: b.height + 'px' });
      if (f.dataset.src !== url) f.src = f.dataset.src = url;
    },
    // the app's own fullscreen for the player (some hosts, StreamHG's, only fill their box with theirs): MainActivity
    // shows it over everything, in landscape; back leaves it
    playerFull: () => frame()?.requestFullscreen().catch(() => {}),
    // play / pause the video in the player's frame (MEGA's has no pause button on phones): see MainActivity's frame script
    playerToggle: () => frame()?.contentWindow.postMessage({ medToggle: 1 }, '*'),
    // Android TV / Chromecast: the TV plays the video the player here is playing, or the downloaded file (see Cast.java).
    // page: the player's address, for MEGA's (its key is after the #, which never reaches the network to be caught)
    cast: o => Downloader.cast({ ...o, page: frame()?.dataset.src }),
    playerVisible() {}, // the iframe sits under the menu, nothing to hide
    playerSnapshot: async () => '',
    onPlayerBack() {}, // Android's back button walks the hash history on its own
    openExternal: url => /^https:\/\//.test(url) && Downloader.openUrl({ url }), // window.open is refused (MainActivity)
    // a newer APK on GitHub's latest release (npm run release tags it b + this build's stamp digits): its download link
    async checkUpdate() {
      const res = await Http.request({ url: 'https://api.github.com/repos/Medamine-Bahassou/Medflix/releases/latest', method: 'GET',
        responseType: 'text', connectTimeout: 15e3, readTimeout: 15e3, headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
      if (res.status !== 200 || !window.BUILD) return null;
      const r = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const url = r.assets?.find(a => a.name.endsWith('.apk'))?.browser_download_url;
      // both 12 digits (yyyymmddhhmm): compared as strings
      return url && r.tag_name.replace(/\D/g, '') > BUILD.replace(/\D/g, '') ? { tag: r.tag_name, url } : null;
    },
    titleBar() {},
  };
})();
