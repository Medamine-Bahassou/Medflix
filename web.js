// Website (Vercel) stand-in for the Electron / Android api: the sites are asked through api/proxy.js, user data is kept in
// IndexedDB, and the player is an iframe (as mobile.js). No downloads: every host's page opens in a new tab instead.
if (!window.api) (() => {
  const SITE = 'https://witanime.site', AR = 'https://eva.animerco.org';
  const CH = { 'sec-ch-ua': '"Chromium";v="138"' }; // witanime's API 404s without a client-hint header (matches the proxy's UA)
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // the proxy is stateless: the cookies the sites set (witanime's session, which its csrf token belongs to) are kept here
  const jar = {};
  // plain page reads (no form, no session) go as GET: Vercel's cache shares each answer between all visitors for a few
  // minutes, so the paid exit proxy (api/proxy.js) is asked about once per page, not once per visitor
  const viaProxy = async (req, shared) => {
    const r = shared ? await fetch('/api/proxy?' + new URLSearchParams({ url: req.url, h: JSON.stringify(req.headers || {}) }))
      : await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `proxy HTTP ${r.status}`);
    return r.json();
  };
  const http = async (url, opt = {}) => {
    const origin = new URL(url).origin, shared = !opt.method && !opt.stopAt && !opt.redirect; // the episode page and its gates carry the session
    for (let i = 0; ; i++) { // witanime rate-limits bursts with 429: wait and retry (see main.js)
      const cookie = !shared && Object.entries(jar[origin] || {}).map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await viaProxy({ url, ...opt, headers: { ...opt.headers, ...(cookie && { cookie }) } }, shared);
      for (const c of res.cookies) { const kv = c.split(';')[0], at = kv.indexOf('='); (jar[origin] ||= {})[kv.slice(0, at).trim()] = kv.slice(at + 1); }
      if (res.status !== 429 || i === 3) return res;
      await sleep((+res.headers['retry-after'] || 2 ** i) * 1000);
    }
  };
  const refusal = res => res.headers['cf-mitigated'] ? ' · Cloudflare check' : '';
  const hostRequest = async (url, form, headers = {}) => {
    const r = await http(url, form ? { method: 'POST', body: new URLSearchParams(form).toString(), headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } } : { headers });
    if (r.status >= 400) throw new Error(`host HTTP ${r.status}`);
    return r.data;
  };
  // Anime Witcher's backend (Firestore, Algolia) answers browsers itself
  const aw = AnimeWitcher.create(async (url, options) => { const r = await fetch(url, options); if (!r.ok) throw new Error(`AW HTTP ${r.status}`); return r.text(); });

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
  let lastManifest = null; // the player and the download menu share one lookup of the episode being watched (see main.js)
  const manifest = epPath => {
    if (lastManifest?.epPath === epPath && Date.now() - lastManifest.at < 5 * 60e3) return lastManifest.promise;
    const m = lastManifest = { epPath, at: Date.now(), promise: loadManifest(epPath) };
    m.promise.catch(() => lastManifest === m && (lastManifest = null));
    return m.promise;
  };
  const loadManifest = async epPath => {
    if (!/^\/watch\/[^?#]+$/.test(epPath)) throw new Error('bad path');
    const page = await http(SITE + epPath, { headers: CH, stopAt: 'name="csrf-token" content="[^"]+"' });
    if (page.status >= 400) throw new Error(`episode page HTTP ${page.status}${refusal(page)}`);
    csrf = page.data.match(/name="csrf-token" content="([^"]+)"/)?.[1] || '';
    const res = await post(epPath + '/sources');
    if (res.status >= 400) throw new Error(`sources HTTP ${res.status}${refusal(res)}`);
    return JSON.parse(res.data);
  };
  const flat = (byQuality = {}) => Object.entries(byQuality).flatMap(([quality, list]) => list.map(s => ({ ...s, quality })));
  // the gate redirects to the host, but only for the kind of request the site's own page makes
  const gate = async (kind, token, dest) => {
    const res = await http(`${SITE}/watch/${kind}-gate/${token}`, { redirect: 'manual', headers: { ...CH, 'Sec-Fetch-Dest': dest, 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'same-origin' } });
    if (!res.headers.location) throw new Error(`gate HTTP ${res.status}${refusal(res)}`);
    return new URL(res.headers.location, SITE).href;
  };
  const frame = () => document.querySelector('.player > iframe.mplayer');

  window.api = {
    // form: POST these fields (see main.js for each site's quirk)
    async fetch(url, form) {
      const u = new URL(url, SITE);
      const json = ['https://caching.graphql.imdb.com', 'https://graphql.anilist.co'].includes(u.origin);
      const res = await http(u.href, json ? { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json',
          ...(u.hostname.includes('imdb') && { 'x-imdb-client-name': 'imdb-web-next-localized' }) } }
        : form ? { method: 'POST', body: new URLSearchParams(form).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Origin: u.origin } }
        // the latest-episodes pager 404s unless it looks like the home page's own call
        : u.pathname === '/new-episodes' ? { headers: { Accept: 'application/json', Referer: SITE + '/', Origin: SITE, 'X-Requested-With': 'XMLHttpRequest' } }
        : u.origin === 'https://wecima.singles' ? { headers: { Referer: u.origin + '/' } } : {}); // Cloudflare lets WeCima through with itself as the referrer
      if (res.status >= 400) throw new Error(`HTTP ${res.status} ${u.pathname}${refusal(res)}`);
      return res.data;
    },
    get: key => kv('readonly', s => s.get(key)),
    set: (key, value) => kv('readwrite', s => s.put(value, key)),

    awSources: (title, alt, ep) => aw.sources(title, alt, ep),
    sources: async epPath => flat((await manifest(epPath)).players),
    async mirrors(url) { // egydead's MegaMax player: the hosts it wraps (see main.js)
      if (!/^https:\/\/[^/]+\/iframe\/[A-Za-z0-9]+$/.test(url)) throw new Error('bad url');
      const page = JSON.parse((await http(url)).data.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      const res = await http(url, { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': page.version, 'X-Inertia-Partial-Component': page.component, 'X-Inertia-Partial-Data': 'streams' } });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(res.data).props.streams;
    },
    downloadLinks: async epPath => { const m = await manifest(epPath); return MediaHosts.downloadLinks(flat(m.downloads), flat(m.players)); },
    async stream(token) {
      if (token.startsWith('aw:')) { const page = token.slice(3); return { url: MediaHosts.host(page) ? await MediaHosts.resolve(page, hostRequest) : page, referrer: '', native: true }; }
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
      const src = await post('/watch/stream-source/' + token);
      if (src.status >= 400) throw new Error(`server HTTP ${src.status}`);
      const page = await gate('stream', token, 'iframe');
      return { url: MediaHosts.host(page) ? await MediaHosts.resolve(page, hostRequest).catch(() => page) : page, referrer: '' };
    },
    // animerco's /player/ pages refuse to be framed by other sites; most just wrap the host's own embed, so use that
    async unwrap(url) {
      if (!url.startsWith(AR + '/player/')) return url;
      const inner = (await http(url)).data.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
      if (!inner) throw new Error('not embeddable');
      return new URL(inner, url).href;
    },
    // no downloads in a browser tab: the host's page opens in a new one (inAppHost is false here, see app.js)
    async openDownloadPage(token) {
      token = token.replace(/^aw:/, '');
      const tab = window.open('about:blank', '_blank'); // opened now: after the awaits below it would count as a popup
      try {
        if (!/^https:\/\//.test(token)) {
          const kind = token.startsWith('stream:') ? 'stream' : 'download';
          token = token.replace(/^stream:/, '');
          if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('bad token');
          const src = await post(`/watch/${kind}-source/${token}`);
          if (src.status >= 400) throw new Error(`server HTTP ${src.status}`);
          token = await gate(kind, token, kind === 'stream' ? 'iframe' : 'document');
        }
        tab.opener = null; tab.location = token;
      } catch (e) { tab?.close(); throw e; }
    },
    onDownload() {},
    downloadCancel() {},
    downloadDelete: async () => {},
    fileSrc: file => file,

    player(url, b, referrer, native = false) { // an iframe over the stage rect, as on Android (mobile.js)
      let f = frame();
      if (!url) return f?.remove();
      const host = document.querySelector('.player');
      if (!host) return;
      if (!f) {
        f = document.createElement('iframe');
        f.className = 'mplayer';
        f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        f.allowFullscreen = true;
        f.referrerPolicy = 'no-referrer';
        host.append(f);
      }
      Object.assign(f.style, { left: b.x + 'px', top: b.y + 'px', width: b.width + 'px', height: b.height + 'px' });
      const key = `${native}:${url}`;
      if (f.dataset.playerKey !== key) {
        f.removeAttribute('srcdoc');
        if (native) f.srcdoc = MediaHosts.videoHtml(url); else f.src = url;
        f.dataset.playerKey = key;
        f.dataset.src = url;
      }
    },
    playerFull: () => frame()?.requestFullscreen().catch(() => {}),
    playerVisible() {}, // the iframe sits under the menu, nothing to hide
    playerSnapshot: async () => '',
    onPlayerBack() {}, // the browser's back button walks the hash history
    openExternal: url => /^https:\/\//.test(url) && window.open(url, '_blank', 'noopener'),
    titleBar() {},
    // the feedback form (app.js feedbackSheet): web3forms answers browsers itself
    async feedback({ email = '', message = '' }) {
      const r = await (await fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: '197ce167-d8f2-4479-ae56-1ebfcdd5b787', subject: `Medflix feedback (web ${window.BUILD || ''})`, email, message }) })).json();
      if (!r?.success) throw new Error(r?.message || 'feedback failed');
    },
  };
})();
