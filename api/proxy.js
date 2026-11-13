// Vercel function: the website's stand-in for main.js's fetching. A browser can't read the sites (no CORS) nor set
// their headers (user agent, referer, origin, cookies), so web.js asks here: POST { url, method, headers, body, redirect, stopAt }
// -> { status, url, headers, cookies, data }. Stateless: the session cookies witanime needs travel back to web.js's jar.
// The website sends everything as GET ?url=&h=&m=&b= (no cookies: nothing is the visitor's own), so Vercel's cache shares
// each answer between all visitors for a few minutes; POST stays for a body too long for an address.
const MediaHosts = require('../hosts');
const { fetch: exitFetch, ProxyAgent } = require('undici');

// same sites as main.js's fetch allowlist, plus the download hosts (MediaHosts) and egydead's MegaMax player pages (mirrors)
const SITES = ['novltime.com', 'witanime.site', 'eva.animerco.org', 'ristoanime.me', 'shahiid-anime.net', 'ww3.okanime.xyz', 'appswat.com', 'animeschedule.net', 'cima.my-cima.net', 'wecima.singles', 'olympustaff.com',
  'sparkmanga.net', 'manga-starz.net', 'graphql.anilist.co', 'api.tvmaze.com', 'api.jikan.moe', 'www.wikidata.org', 'kitsu.io', 'v3.sg.media-imdb.com', 'www.imdb.com',
  'caching.graphql.imdb.com', 'api.aniskip.com', 'myanimelist.net', 'www.rottentomatoes.com', 'backend.metacritic.com', 'www.animefillerlist.com',
  'vidara.to']; // vidara: a film's embed asked whether it's still queued for encoding (cinema.js seedWatch)
const allowed = u => u.protocol === 'https:' && (SITES.includes(u.hostname) || /(^|\.)(egydead|myseed|arabseed)\.[a-z]+$/.test(u.hostname)
  || MediaHosts.host(u.href) || (/(^|\.)(megamax\.me|share4max\.com)$/.test(u.hostname) && /^\/iframe\/[A-Za-z0-9]+$/.test(u.pathname))
  || STREAMS.test(u.hostname) && /^\/(e|api\/videos)\/\w+$/.test(u.pathname)); // a host's video read for the website's own player (web.js hostStream)
const STREAMS = /^(voe\.sx|[a-z]*byse[a-z]*\.com)$/; // byse's domains change: bysezejataos.com and the like
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
  // vidara's stream token only plays from the IP that asked for it: asked for the visitor's (it trusts X-Forwarded-For), and never shared
  const own = u.hostname === 'vidara.to' && u.pathname === '/api/stream';
  const ip = own && (req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim());
  const live = own || STREAMS.test(u.hostname); // their stream links expire within hours: never kept for other visitors
  const send = out => (out ? exitFetch : fetch)(u, { method, body, redirect, signal: AbortSignal.timeout(u.hostname === 'novltime.com' ? 10e3 : 55e3), ...(out && { dispatcher: exit }),
    // node's fetch adds sec-fetch-mode: cors, and witanime's sources call 404s on that without the rest a browser sends with it
    headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'empty', ...headers, ...(ip && { 'X-Forwarded-For': ip }) } });
  try {
    let r = await send(exit && viaExit.has(u.hostname));
    if (exit && r.headers.get('cf-mitigated') && !viaExit.has(u.hostname)) { viaExit.add(u.hostname); r.body?.cancel(); r = await send(true); }
    let data = '';
    if (stopAt) { // witanime's episode page (~3MB): only its <head> is needed, read up to the token and stop
      const reader = r.body.getReader(), dec = new TextDecoder(), re = new RegExp(stopAt);
      for (;;) { const { done, value } = await reader.read(); if (done) break; data += dec.decode(value, { stream: true }); if (re.test(data)) { reader.cancel(); break; } }
    } else data = await r.text();
    // voe's embed sends the browser on by script to one of its ever-changing domains: followed here, for the same video only
    const hop = u.hostname === 'voe.sx' && data.match(/window\.location\.href = '(https:\/\/[^/']+\/e\/(\w+))'/);
    if (hop && '/e/' + hop[2] === u.pathname) data = await (await fetch(hop[1], { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) })).text();
    // RistoAnime's pages (~350KB), Shahiid's (~150KB) and animeschedule's (~7MB) are mostly inline scripts, styles, <noscript> image copies and
    // indentation nothing reads: dropped before they're sent on and parsed. RistoAnime's season list's call needs the page's post id,
    // which only a script has: that one line is kept
    if (/^(ristoanime\.me|shahiid-anime\.net|animeschedule\.net)$/.test(u.hostname) && /html/.test(r.headers.get('content-type') || '')) {
      const id = data.match(/post_id:\s*'\d+'/)?.[0];
      data = data.replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/ data-srcset="[^"]*"/g, '')
        .replace(/\s{2,}/g, ' ') + (id ? `<script>${id}</script>` : ''); // its indentation alone is ~4.5MB of animeschedule's; text is read whitespace-collapsed anyway
    }
    // shared: no visitor's cookies in it, and only real answers kept (5 min, then served stale for a week while it refreshes: a show
    // page nobody opened for days still comes at once). A page that isn't there is an answer too: asked again by every visitor, it
    // cost each of them the site's seconds. A refusal or a failing site isn't
    if (shared) res.setHeader('Cache-Control', !live && r.status < 400 || [404, 410].includes(r.status) ? 'public, s-maxage=300, stale-while-revalidate=604800' : 'no-store');
    res.json({ status: r.status, url: r.url, headers: Object.fromEntries(KEEP.map(k => [k, r.headers.get(k)]).filter(([, v]) => v)), cookies: shared ? [] : r.headers.getSetCookie(), data });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
};
