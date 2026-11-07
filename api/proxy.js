// Vercel function: the website's stand-in for main.js's fetching. A browser can't read the sites (no CORS) nor set
// their headers (user agent, referer, origin, cookies), so web.js asks here: POST { url, method, headers, body, redirect, stopAt }
// -> { status, url, headers, cookies, data }. Stateless: the session cookies witanime needs travel back to web.js's jar.
const MediaHosts = require('../hosts');

// same sites as main.js's fetch allowlist, plus the download hosts (MediaHosts) and egydead's MegaMax player pages (mirrors)
const SITES = ['witanime.site', 'eva.animerco.org', 'ristoanime.me', 'appswat.com', 'animeschedule.net', 'cima.my-cima.net', 'wecima.singles', 'olympustaff.com',
  'sparkmanga.net', 'manga-starz.net', 'graphql.anilist.co', 'api.tvmaze.com', 'api.jikan.moe', 'www.wikidata.org', 'kitsu.io', 'v3.sg.media-imdb.com', 'www.imdb.com',
  'caching.graphql.imdb.com', 'api.aniskip.com', 'myanimelist.net', 'www.rottentomatoes.com', 'backend.metacritic.com', 'www.animefillerlist.com'];
const allowed = u => u.protocol === 'https:' && (SITES.includes(u.hostname) || /(^|\.)(egydead|myseed|arabseed)\.[a-z]+$/.test(u.hostname)
  || MediaHosts.host(u.href) || /^\/iframe\/[A-Za-z0-9]+$/.test(u.pathname));
// desktop Chrome, as on desktop and Android: the sites serve the markup the scraper expects
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const KEEP = ['location', 'retry-after', 'cf-mitigated', 'content-type'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { url, method = 'GET', headers = {}, body, redirect = 'follow', stopAt } = req.body || {};
  let u;
  try { u = new URL(url); } catch { return res.status(400).json({ error: 'bad url' }); }
  if (!allowed(u)) return res.status(403).json({ error: 'blocked: ' + u.origin });
  try {
    const r = await fetch(u, { method, body, redirect, signal: AbortSignal.timeout(55e3),
      // node's fetch adds sec-fetch-mode: cors, and witanime's sources call 404s on that without the rest a browser sends with it
      headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'empty', ...headers } });
    let data = '';
    if (stopAt) { // witanime's episode page (~3MB): only its <head> is needed, read up to the token and stop
      const reader = r.body.getReader(), dec = new TextDecoder(), re = new RegExp(stopAt);
      for (;;) { const { done, value } = await reader.read(); if (done) break; data += dec.decode(value, { stream: true }); if (re.test(data)) { reader.cancel(); break; } }
    } else data = await r.text();
    res.json({ status: r.status, url: r.url, headers: Object.fromEntries(KEEP.map(k => [k, r.headers.get(k)]).filter(([, v]) => v)), cookies: r.headers.getSetCookie(), data });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
};
