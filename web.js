// Website (Vercel) stand-in for the Electron / Android api: the sites are asked through api/proxy.js, user data is kept in
// IndexedDB, and the player is an iframe (as mobile.js). File bytes are fetched directly by the browser in web-downloads.js.
// Anime comes from RistoAnime here (risto.js): Cloudflare refuses witanime to Vercel's servers.
if (!window.api) (() => {
  const SITE = 'https://witanime.site', AR = 'https://eva.animerco.org';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // everything goes as GET (no cookies: no answer is the visitor's own), which Vercel's cache shares between all visitors
  // for a few minutes; a body too long for an address (a big GraphQL query) is POSTed
  const proxyFlights = new Map();
  const viaProxy = async req => {
    const q = new URLSearchParams({ url: req.url, h: JSON.stringify(req.headers || {}), ...(req.method && { m: req.method }), ...(req.body && { b: req.body }) });
    const read = !req.method || req.method === 'GET' || /^(?:graphql\.anilist\.co|caching\.graphql\.imdb\.com)$/.test(new URL(req.url).hostname) && /^[\s]*(?:query\b|\{)/.test(JSON.parse(req.body || '{}').query || '');
    const key = q.toString();
    const request = async () => {
      const r = key.length < 6000 ? await fetch('/api/proxy?' + q)
        : await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `proxy HTTP ${r.status}`);
      return r.json();
    };
    if (!read) return request(); // playback tokens and other POSTs must keep their own responses
    if (!proxyFlights.has(key)) proxyFlights.set(key, request().finally(() => proxyFlights.delete(key)));
    return proxyFlights.get(key);
  };
  const http = async (url, opt = {}) => {
    for (let i = 0; ; i++) { // rate-limited bursts (429): wait and retry (see main.js)
      // a site's gateway timing out (502-504, novltime's API now and then) or the proxy failing to reach it: asked again, a plain read only (a POST may have landed)
      const res = await viaProxy({ url, ...opt }).catch(e => { if (opt.method === 'POST' || i === 2) throw e; });
      if (res && ![429, 502, 503, 504].includes(res.status) || i === 3 || res && res.status >= 500 && (opt.method === 'POST' || i === 2)) return res;
      await sleep(res?.status === 429 ? (+res.headers['retry-after'] || 2 ** i) * 1000 : 800 * (i + 1));
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

  // the worker caches images only; HTML, scripts, playback and user data keep their existing update paths.
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('image-cache-sw.js?v=' + encodeURIComponent(window.BUILD || '1'), { updateViaCache: 'none' }).catch(() => {});
    }, { once: true });
    document.addEventListener('error', e => {
      if (e.target?.tagName === 'IMG') navigator.serviceWorker.controller?.postMessage({ type: 'image-error', url: e.target.currentSrc || e.target.src });
    }, true); // don't keep an opaque response that turned out not to be a usable image
  }
  const clearImages = async () => {
    if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).filter(k => k.startsWith('medflix-images-')).map(k => caches.delete(k)));
  };

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
  // Google's Cast sender, loaded the first time it may be wanted. false: this browser can't cast (Firefox, Safari, Brave by default)
  let castSdk, castingAt = '';
  const castReady = () => castSdk ||= new Promise(ok => {
    window.__onGCastApiAvailable = on => {
      if (!on || !window.cast?.framework) return ok(false); // (its framework can fail to load though the browser is able)
      cast.framework.CastContext.getInstance().setOptions({ receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
      ok(true);
    };
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.onerror = () => ok(false);
    document.head.append(s);
    setTimeout(() => ok(false), 8000); // it says nothing at all on some browsers: a tap on Cast must still get an answer
  }).then(on => { if (!on) castSdk = null; return on; }); // a slow connection, maybe: asked again next time
  // a file we play ourselves: Plyr (vendor/, MIT) in its frame, in the theme, with what the Android player has. it fails to load: the video's own controls stay
  const PLYR = 'vendor/plyr-3.8.5', playerHead = `<link rel="stylesheet" href="${PLYR}.css"><script src="${PLYR}.js"></script><style>
    :root{--plyr-color-main:#e50914;--plyr-font-family:system-ui,sans-serif}.plyr{height:100%}.plyr video{object-fit:contain}
    .plyr--loading::after{content:"";position:absolute;z-index:1;top:50%;left:50%;width:44px;height:44px;margin:-22px;border:3px solid #fff3;border-top-color:#e50914;border-radius:50%;animation:s .7s linear infinite;pointer-events:none}@keyframes s{to{transform:rotate(360deg)}}
    .plyr--loading .plyr__control--overlaid{display:none}
    .skip-intro{position:absolute;z-index:4;right:16px;bottom:72px;padding:10px 18px;border:0;border-radius:6px;background:#fff;color:#000;font:700 14px system-ui,sans-serif;cursor:pointer}.skip-intro[hidden]{display:none}</style>`;
  const frameVideo = () => { const f = frame(); try { return f?.hasAttribute('srcdoc') ? f.contentDocument?.querySelector('video') : null; } catch { return null; } }; // a host's player is another site's page
  // over the video, as on Android: the page's header isn't there in the player's fullscreen. a new server's frame gets it too
  let intro = null;
  const dressIntro = (f, v) => {
    const d = f.contentDocument;
    if (!intro || d.querySelector('.skip-intro')) return;
    const { from, to, label } = intro, b = d.createElement('button');
    b.className = 'skip-intro'; b.type = 'button'; b.textContent = label;
    const tick = () => { b.hidden = !(v.currentTime >= from && v.currentTime < to); };
    b.onclick = () => { v.currentTime = to; b.hidden = true; };
    (d.querySelector('.plyr') || d.body).append(b); // in Plyr's own box: that's what goes fullscreen
    ['timeupdate', 'seeking'].forEach(n => v.addEventListener(n, tick)); // seeking: at once, a slow file takes a while to get there
    tick();
  };
  async function dressVideo(f) {
    const v = f.contentDocument?.querySelector('video'), key = 'video:' + location.hash;
    if (!v) return;
    if (f.contentWindow.Plyr) new f.contentWindow.Plyr(v, f.contentWindow.JSON.parse(JSON.stringify({ // through the frame's JSON: Plyr ignores an object from another window. absolute: the frame's own address is about:srcdoc. blankVideo: it would ask Plyr's CDN
      iconUrl: new URL(PLYR + '.svg', location.href).href, blankVideo: '', autoplay: true, seekTime: 10, keyboard: { focused: true, global: true }, tooltips: { controls: true, seek: true }, i18n: t('plyr'),
      controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'], settings: ['speed'], speed: { selected: 1, options: [.5, .75, 1, 1.25, 1.5, 2] } })));
    dressIntro(f, v);
    // back from inside the frame: a remote or Esc would otherwise stop here. in its fullscreen, Esc is the browser's
    f.contentDocument.addEventListener('keydown', e => { if (['Escape', 'GoBack', 'BrowserBack'].includes(e.key) && !f.contentDocument.fullscreenElement) { focus(); back(); } });
    // where it was left, per episode; finished, from the start again
    const saved = await window.api.get(key).catch(() => null);
    if (saved > 5 && f.isConnected) v.readyState ? v.currentTime = saved : v.addEventListener('loadedmetadata', () => { if (saved < v.duration * .95) v.currentTime = saved; }, { once: true });
    let at = 0;
    const save = () => { at = Date.now(); window.api.set(key, v.ended ? null : v.currentTime).catch(() => {}); };
    v.addEventListener('timeupdate', () => Date.now() - at > 5000 && v.currentTime > 5 && save());
    ['pause', 'ended'].forEach(n => v.addEventListener(n, save));
  }
  const limit = (promise, ms) => Promise.race([promise, sleep(ms).then(() => { throw new Error('timed out'); })]);
  // the popup ads of each host's player, measured in Chrome without an ad blocker: videa and mp4upload's a sandbox stops, and they play
  // on (videa first: 1080p from the start, where ok.ru stayed at 240p); ok.ru and vk open none. share4max/megamax's script takes every
  // click until its popup opens, so in a sandbox the video never starts; dood looks for a sandbox too (see mobile.js). Those can't be
  // stopped from here: the last choice, never the default
  const SERVER_RANK = { videa: 0, ok: 1, vk: 1, vkvideo: 1, mp4upload: 1, share4max: 3, megamax: 3, leech: 3, dood: 3, doodstream: 3 };
  // the ad blocker: a page can't filter another site's frame, but a sandbox without allow-popups/allow-top-navigation stops its
  // popups, pop-unders and redirects. so every host plays in one, except those that refuse to play sandboxed (above; earnvids and
  // streamhg in mobile.js). ponytail: name match on the hostname, a host on a new domain that refuses one needs adding here
  const UNSANDBOXABLE = /dood|d0+d|ds2play|share4max|megamax|leech|earnvid|streamhg/i;
  // and those the user turned it off for (the player's ⋮): a host that says "sandbox not allowed" can't be told apart from outside
  let adsAllowed = new Set();
  kv('readonly', s => s.get('adsAllowed')).then(l => adsAllowed = new Set(l || [])).catch(() => {});
  const frameHost = () => { const f = frame(); return f && !f.hasAttribute('srcdoc') && f.dataset.src ? new URL(f.dataset.src).hostname : null; };
  const unblocked = host => UNSANDBOXABLE.test(host) || adsAllowed.has(host);
  // those can still send the tab to an ad: the browser asks before leaving instead
  addEventListener('beforeunload', e => { if (frame()?.dataset.guard) e.preventDefault(); });

  window.api = {
    web: true, // risto.js: anime from RistoAnime
    serverRank: label => SERVER_RANK[String(label).toLowerCase().split(' ')[0]] ?? 2, // 3: opens popups nothing here can stop
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
    async set(key, value) {
      await kv('readwrite', s => s.put(value, key));
      if (key === 'pages' && value && !Object.keys(value).length) await clearImages().catch(() => {});
    },

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
      if (castingAt && castingAt === location.hash) return; // the TV has this one: a resize mustn't start it here again
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
        // takes effect on the next load, so before it. No allow-popups: that's the point
        const open = !native && unblocked(new URL(url).hostname);
        if (!native && !open) f.sandbox = 'allow-scripts allow-same-origin allow-forms allow-presentation'; else f.removeAttribute('sandbox');
        f.dataset.guard = open ? '1' : '';
        f.onload = native ? () => dressVideo(f).catch(console.error) : null;
        if (native) f.srcdoc = MediaHosts.videoHtml(url, playerHead); else f.src = url;
        f.dataset.playerKey = key;
        f.dataset.src = url;
      }
    },
    playerFull: () => frame()?.requestFullscreen().catch(() => {}),
    // the ad blocker for the host playing now: null with our own video (nothing to block), or a host that never plays sandboxed
    adBlocked: () => { const h = frameHost(); return h && !UNSANDBOXABLE.test(h) ? !adsAllowed.has(h) : null; },
    adBlockToggle() {
      const h = frameHost(), f = frame();
      if (!h) return;
      adsAllowed.has(h) ? adsAllowed.delete(h) : adsAllowed.add(h);
      kv('readwrite', s => s.put([...adsAllowed], 'adsAllowed')).catch(() => {});
      const url = f.dataset.src;
      f.dataset.playerKey = ''; f.removeAttribute('src'); // a sandbox change takes effect on the next load: load it again
      window.api.player(url, f.getBoundingClientRect(), '', false);
    },
    // our own video only (app.js watchServer: one that can't play goes on to the next server; skip intro). a host's says nothing here
    playerHealth: async () => { const v = frameVideo(); return !v ? 'works' : v.error ? 'dead' : v.readyState >= 2 ? 'works' : 'waiting'; },
    playerTime: () => frameVideo()?.currentTime,
    playerSeek: at => { const v = frameVideo(); if (v) v.currentTime = at; },
    playerIntro(span, label) { intro = span && { from: span[0], to: span[1], label }; const v = frameVideo(); if (v) dressIntro(frame(), v); }, // null: a new episode, none known yet
    // a TV (Chromecast, Android TV). A host's player is another site's page, out of reach, so the TV is handed a file of this episode and
    // fetches it by itself, through Google's Cast sender (Chrome, Edge). No bytes pass through here. Asked for when the ⋮ opens: by the
    // tap on Cast it's ready, and the TV picker only opens straight from a tap
    castReady,
    async cast({ title, poster, links } = {}) {
      const v = document.querySelector('.player video') || frame()?.contentDocument?.querySelector('video');
      if (await castReady().catch(() => false)) {
        const ctx = cast.framework.CastContext.getInstance();
        if (!ctx.getCurrentSession()) await ctx.requestSession().catch(e => { throw new Error(/cancel/i.test(e) ? 'cancelled' : /unavailable/i.test(e) ? 'no tv' : String(e)); });
        toast(t('castLooking'));
        const session = ctx.getCurrentSession();
        const here = v?.currentSrc && !v.currentSrc.startsWith('blob:') ? [{ url: v.currentSrc, at: v.currentTime }] : []; // the file already playing: from this moment
        const rest = MediaHosts.castOrder(await links?.().catch(() => []) || []);
        for (const l of [...here, ...rest]) {
          try {
            const url = l.url || await limit(api.downloadUrl(l.token), 15000);
            if (/\.mkv(\?|$)/i.test(new URL(url).pathname)) continue; // the TV's player reads mp4
            const media = new chrome.cast.media.MediaInfo(url, 'video/mp4');
            media.metadata = Object.assign(new chrome.cast.media.GenericMediaMetadata(), { title, images: poster ? [new chrome.cast.Image(poster)] : [] });
            const request = new chrome.cast.media.LoadRequest(media);
            request.currentTime = l.at || 0;
            await limit(session.loadMedia(request), 30000); // a file that won't play: the next one
            castingAt = location.hash;
            return; // playing there: stopped here (app.js)
          } catch (e) { console.error(e); }
        }
        throw new Error('no file');
      }
      if (!v?.currentSrc) throw new Error('not castable');
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
