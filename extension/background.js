// Medflix's website asks the sites through here: from the visitor's own browser (their connection, their cookies), which
// Cloudflare lets through or lets them pass its check in, where Vercel's servers are always refused (see api/proxy.js)

// same sites as api/proxy.js: the page only gets these, though it can ask with the visitor's cookies
const SITES = ['witanime.site', 'eva.animerco.org', 'ristoanime.me', 'appswat.com', 'animeschedule.net', 'cima.my-cima.net', 'wecima.singles', 'olympustaff.com',
  'sparkmanga.net', 'manga-starz.net', 'graphql.anilist.co', 'api.tvmaze.com', 'api.jikan.moe', 'www.wikidata.org', 'kitsu.io', 'v3.sg.media-imdb.com', 'www.imdb.com',
  'caching.graphql.imdb.com', 'api.aniskip.com', 'myanimelist.net', 'www.rottentomatoes.com', 'backend.metacritic.com', 'www.animefillerlist.com'];
const HOSTS = ['mediafire.com', 'pixeldrain.com', 'krakenfiles.com', 'streamtape.com', 'streamtape.cc', 'arabseed.top', 'firestream.to']; // hosts.js
const allowed = u => u.protocol === 'https:' && (SITES.includes(u.hostname) || /(^|\.)(egydead|myseed|arabseed)\.[a-z]+$/.test(u.hostname)
  || HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)) || /^\/iframe\/[A-Za-z0-9]+$/.test(u.pathname));
const KEEP = ['location', 'retry-after', 'cf-mitigated', 'content-type'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// witanime answers its API (episode servers, the latest-episodes pager) only to its own pages' calls, and a fetch can't
// say so itself (browsers fix these headers): rewritten on the requests made from here (no tab), as the site's own XHR
const own = (id, domain, headers) => ({ id, condition: { requestDomains: [domain], tabIds: [-1] },
  action: { type: 'modifyHeaders', requestHeaders: Object.entries(headers).map(([header, value]) => ({ header, operation: 'set', value })) } });
chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1, 2], addRules: [
  own(1, 'witanime.site', { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://witanime.site', Referer: 'https://witanime.site/' }),
  own(2, 'wecima.singles', { Referer: 'https://wecima.singles/' }), // Cloudflare lets WeCima through with itself as the referrer (main.js)
] });

// Cloudflare's check: the site opens in a tab for the visitor to pass (it can need a box ticked), closed once it lets us through
const checks = {};
const pass = origin => checks[origin] ||= (async () => {
  const tab = await chrome.tabs.create({ url: origin + '/' });
  try {
    for (let i = 0; i < 40; i++) { // 2 minutes
      await sleep(3000);
      if (!await chrome.tabs.get(tab.id).catch(() => null)) return; // closed by the visitor: give up (the api call keeps this worker awake)
      if (!(await fetch(origin + '/', { credentials: 'include' })).headers.get('cf-mitigated')) return;
    }
  } finally { chrome.tabs.remove(tab.id).catch(() => {}); delete checks[origin]; }
})();

const ask = async ({ url, method = 'GET', headers = {}, body, redirect = 'follow' }) => {
  const u = new URL(url);
  if (!allowed(u)) throw new Error('blocked: ' + u.origin);
  for (let checked = false; ; checked = true) {
    // cookie, user agent, sec-* in headers are the browser's own here: fetch drops them
    const r = await fetch(u, { method, headers, body, redirect, credentials: 'include' });
    if (r.headers.get('cf-mitigated') === 'challenge' && !checked) { await pass(u.origin); continue; }
    return { status: r.status, url: r.url, headers: Object.fromEntries(KEEP.map(k => [k, r.headers.get(k)]).filter(([, v]) => v)), cookies: [], data: await r.text() };
  }
};
chrome.runtime.onMessage.addListener((req, _, reply) => { ask(req).then(reply, e => reply({ error: String(e.message || e) })); return true; });
