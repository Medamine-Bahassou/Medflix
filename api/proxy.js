// Vercel function: the website's stand-in for main.js's fetching. A browser can't read the sites (no CORS) nor set
// their headers (user agent, referer, origin, cookies), so web.js asks here: POST { url, method, headers, body, redirect, stopAt }
// -> { status, url, headers, cookies, data }. Stateless: the session cookies witanime needs travel back to web.js's jar.
// The website sends everything as GET ?url=&h=&m=&b= (no cookies: nothing is the visitor's own), so Vercel's cache shares
// each answer between all visitors for a few minutes; POST stays for a body too long for an address.
const MediaHosts = require('../hosts');
const { fetch: exitFetch, ProxyAgent } = require('undici');

// same sites as main.js's fetch allowlist, plus the download hosts (MediaHosts) and egydead's MegaMax player pages (mirrors)
const SITES = ['witanime.site', 'eva.animerco.org', 'ristoanime.me', 'appswat.com', 'animeschedule.net', 'cima.my-cima.net', 'wecima.singles', 'olympustaff.com',
  'sparkmanga.net', 'manga-starz.net', 'graphql.anilist.co', 'api.tvmaze.com', 'api.jikan.moe', 'www.wikidata.org', 'kitsu.io', 'v3.sg.media-imdb.com', 'www.imdb.com',
  'caching.graphql.imdb.com', 'api.aniskip.com', 'myanimelist.net', 'www.rottentomatoes.com', 'backend.metacritic.com', 'www.animefillerlist.com'];
const allowed = u => u.protocol === 'https:' && (SITES.includes(u.hostname) || /(^|\.)(egydead|myseed|arabseed)\.[a-z]+$/.test(u.hostname)
  || MediaHosts.host(u.href) || /^\/iframe\/[A-Za-z0-9]+$/.test(u.pathname));
// desktop Chrome, as on desktop and Android: the sites serve the markup the scraper expects
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const KEEP = ['location', 'retry-after', 'cf-mitigated', 'content-type'];
// Cloudflare challenges every request from Vercel's servers on most of the sites (witanime, egydead...), whatever the
// headers, and lets home connections through. Those go out through EXIT_PROXY (env): a residential proxy, or a scraping
// service's proxy port, http://user:pass@host:port. Those ports re-sign the sites' certificates, so they aren't checked there
const exit = process.env.EXIT_PROXY && new ProxyAgent({ uri: process.env.EXIT_PROXY, requestTls: { rejectUnauthorized: false } });
const viaExit = new Set(); // hosts that were challenged: straight to the exit while this instance is warm (it's paid per use)

module.exports = async (req, res) => {
  const shared = req.method === 'GET';
  if (!shared && req.method !== 'POST') return res.status(405).end();
  let q;
  try { q = shared ? { url: req.query.url, headers: JSON.parse(req.query.h || '{}'), method: req.query.m, body: req.query.b } : req.body || {}; } catch { return res.status(400).json({ error: 'bad headers' }); }
  const { url, method = 'GET', headers = {}, body, redirect = 'follow', stopAt } = q;
  let u;
  try { u = new URL(url); } catch { return res.status(400).json({ error: 'bad url' }); }
  if (!allowed(u)) return res.status(403).json({ error: 'blocked: ' + u.origin });
  const send = out => (out ? exitFetch : fetch)(u, { method, body, redirect, signal: AbortSignal.timeout(55e3), ...(out && { dispatcher: exit }),
    // node's fetch adds sec-fetch-mode: cors, and witanime's sources call 404s on that without the rest a browser sends with it
    headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'empty', ...headers } });
  try {
    let r = await send(exit && viaExit.has(u.hostname));
    if (exit && r.headers.get('cf-mitigated') && !viaExit.has(u.hostname)) { viaExit.add(u.hostname); r.body?.cancel(); r = await send(true); }
    let data = '';
    if (stopAt) { // witanime's episode page (~3MB): only its <head> is needed, read up to the token and stop
      const reader = r.body.getReader(), dec = new TextDecoder(), re = new RegExp(stopAt);
      for (;;) { const { done, value } = await reader.read(); if (done) break; data += dec.decode(value, { stream: true }); if (re.test(data)) { reader.cancel(); break; } }
    } else data = await r.text();
    // RistoAnime's pages (~350KB) and animeschedule's (~7MB) are mostly inline scripts, styles, <noscript> image copies and
    // indentation nothing reads: dropped before they're sent on and parsed. RistoAnime's season list's call needs the page's post id,
    // which only a script has: that one line is kept
    if (/^(ristoanime\.me|animeschedule\.net)$/.test(u.hostname) && /html/.test(r.headers.get('content-type') || '')) {
      const id = data.match(/post_id:\s*'\d+'/)?.[0];
      data = data.replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/ data-srcset="[^"]*"/g, '')
        .replace(/\s{2,}/g, ' ') + (id ? `<script>${id}</script>` : ''); // its indentation alone is ~4.5MB of animeschedule's; text is read whitespace-collapsed anyway
    }
    // shared: no visitor's cookies in it, and only good answers kept (5 min, then served stale for a day while it refreshes)
    if (shared) res.setHeader('Cache-Control', r.status < 400 ? 'public, s-maxage=300, stale-while-revalidate=86400' : 'no-store');
    res.json({ status: r.status, url: r.url, headers: Object.fromEntries(KEEP.map(k => [k, r.headers.get(k)]).filter(([, v]) => v)), cookies: shared ? [] : r.headers.getSetCookie(), data });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
};
