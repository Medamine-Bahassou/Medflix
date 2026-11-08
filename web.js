// Website (Vercel) stand-in for the Electron / Android api: the sites are asked through api/proxy.js, user data is kept in
// IndexedDB, and the player is an iframe (as mobile.js). File bytes are fetched directly by the browser in web-downloads.js.
// Anime comes from RistoAnime here (risto.js): Cloudflare refuses witanime to Vercel's servers.
if (!window.api) (() => {
  const SITE = 'https://witanime.site', AR = 'https://eva.animerco.org';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // everything goes as GET (no cookies: no answer is the visitor's own), which Vercel's cache shares between all visitors
  // for a few minutes; a body too long for an address (a big GraphQL query) is POSTed
  const viaProxy = async req => {
    const q = new URLSearchParams({ url: req.url, h: JSON.stringify(req.headers || {}), ...(req.method && { m: req.method }), ...(req.body && { b: req.body }) });
    const r = q.toString().length < 6000 ? await fetch('/api/proxy?' + q)
      : await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `proxy HTTP ${r.status}`);
    return r.json();
  };
  const http = async (url, opt = {}) => {
    for (let i = 0; ; i++) { // rate-limited bursts (429): wait and retry (see main.js)
      const res = await viaProxy({ url, ...opt });
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

  const frame = () => document.querySelector('.player > iframe.mplayer');

  window.api = {
    web: true, // risto.js: anime from RistoAnime
    // form: POST these fields (see main.js for each site's quirk)
    async fetch(url, form) {
      const u = new URL(url, SITE);
      const json = ['https://caching.graphql.imdb.com', 'https://graphql.anilist.co'].includes(u.origin);
      const res = await http(u.href, json ? { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json',
          ...(u.hostname.includes('imdb') && { 'x-imdb-client-name': 'imdb-web-next-localized' }) } }
        : form ? { method: 'POST', body: new URLSearchParams(form).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Origin: u.origin } }
        : u.origin === 'https://wecima.singles' ? { headers: { Referer: u.origin + '/' } } : {}); // Cloudflare lets WeCima through with itself as the referrer
      if (res.status >= 400) throw new Error(`HTTP ${res.status} ${u.pathname}${refusal(res)}`);
      return res.data;
    },
    get: key => kv('readonly', s => s.get(key)),
    set: (key, value) => kv('readwrite', s => s.put(value, key)),

    awSources: (title, alt, ep) => aw.sources(title, alt, ep),
    sources: epPath => Risto.sources(epPath),
    async mirrors(url) { // egydead's MegaMax player: the hosts it wraps (see main.js)
      if (!/^https:\/\/[^/]+\/iframe\/[A-Za-z0-9]+$/.test(url)) throw new Error('bad url');
      const page = JSON.parse((await http(url)).data.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      const res = await http(url, { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': page.version, 'X-Inertia-Partial-Component': page.component, 'X-Inertia-Partial-Data': 'streams' } });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(res.data).props.streams;
    },
    downloadLinks: epPath => Risto.downloads(epPath),
    async stream(token) {
      if (token.startsWith('ra:')) return { url: token.slice(3), referrer: '' }; // RistoAnime's: the host's embed itself
      if (!token.startsWith('aw:')) throw new Error('bad token');
      const page = token.slice(3);
      return { url: MediaHosts.host(page) ? await MediaHosts.resolve(page, hostRequest) : page, referrer: '', native: true };
    },
    // animerco's /player/ pages refuse to be framed by other sites; most just wrap the host's own embed, so use that
    async unwrap(url) {
      if (!url.startsWith(AR + '/player/')) return url;
      const inner = (await http(url)).data.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
      if (!inner) throw new Error('not embeddable');
      return new URL(inner, url).href;
    },
    // fallback for host pages that cannot supply a downloadable file here
    async openDownloadPage(token) {
      const url = token.replace(/^aw:/, '');
      if (!/^https:\/\//.test(url)) throw new Error('bad token');
      window.open(url, '_blank', 'noopener');
    },
    async downloadUrl(token) {
      const url=token.replace(/^stream:/,'').replace(/^(aw:|ra:)/,'');
      if(!/^https:\/\//.test(url))throw Error('bad token');
      if(/\.(mp4|mkv|zip)(?:\?|$)/i.test(new URL(url).pathname)||/^download\d*\.mediafire\.com$/.test(new URL(url).hostname))return url;
      return MediaHosts.resolve(url,hostRequest);
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
    // a TV (Chromecast, Android TV) through the browser's own Remote Playback: only a video playing here, in the page (a
    // downloaded episode) or in the player's own frame (Anime Witcher's files, MediaHosts.videoHtml); a host's player is
    // another site's page, out of reach. The TV then plays it and this page is its remote: nothing here is stopped ({ screen })
    async cast() {
      const v = document.querySelector('.player video') || frame()?.contentDocument?.querySelector('video');
      if (!v?.currentSrc) throw new Error(frame() ? 'not castable' : 'no video');
      if (!v.remote) { if (!v.webkitShowPlaybackTargetPicker) throw new Error('not castable'); v.webkitShowPlaybackTargetPicker(); return { screen: true }; } // Safari: AirPlay
      try { await v.remote.prompt(); } catch (e) { throw new Error(e.name === 'NotAllowedError' ? 'cancelled' : 'not castable'); } // NotAllowed: the picker closed
      return { screen: true };
    },
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
