/* Recovered public client protocol. Runtime settings remain on the owner's backend. */
(function(root) {
  const base = 'https://firestore.googleapis.com/v1/projects/animewitcher-1c66d/databases/(default)/documents/';
  const decode = v => v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x]) => [k,decode(x)])) : v.arrayValue ? (v.arrayValue.values || []).map(decode) : v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? null;
  const normal = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function match(hits, title, alt) {
    const names = [title,alt].filter(Boolean).map(normal);
    const found = hits.filter(h => !h.dubbed && [h.name,h.details?.english_title].some(n => names.includes(normal(n))));
    return found.length === 1 ? found[0] : null;
  }
  function create(request) {
    const cache = new Map();
    const json = async (url, options) => JSON.parse(await request(url, options));
    const document = async path => decode({mapValue:{fields:(await json(base + path.split('/').map(encodeURIComponent).join('/'))).fields}});
    async function load(title,alt,ep) {
      if (!/^\d+(?:\.\d+)?$/.test(String(ep))) return [];
      const settings = await document('Settings/constants');
      const cfg = settings.search_settings;
      const data = await json(`https://${cfg.app_id.toLowerCase()}-dsn.algolia.net/1/indexes/series/query`, {method:'POST',headers:{'Content-Type':'application/json','X-Algolia-Application-Id':cfg.app_id,'X-Algolia-API-Key':cfg.api_key},body:JSON.stringify({query:title,hitsPerPage:30})});
      const anime = match(data.hits || [],title,alt);
      if (!anime) return [];
      const path = anime.path || anime.doc_ref;
      if (!/^anime_list\/[^/]+$/.test(path || '')) return [];
      const summary = await document(path + '/episodes_summery/summery');
      const episodes = (summary.episodes || []).filter(e => Number(String(e.name).match(/\d+(?:\.\d+)?/)?.[0]) === Number(ep));
      if (episodes.length !== 1 || !/^[\w-]+$/.test(episodes[0].doc_id)) return [];
      const servers = await document(path + '/episodes/' + episodes[0].doc_id + '/servers2/all_servers');
      return (servers.servers || []).filter(s => s.visible !== false && /^https?:\/\//.test(s.link)).map(s => ({
        label: ({MF:'mediafire',MF2:'mediafire',PD:'pixeldrain',KF:'krakenfiles',ST:'streamtape',SF:'firestream'}[s.name] || s.name) + ' · AW',
        quality: ({'1080p':'FHD','720p':'HD','480p':'SD','360p':'SD','2160p':'4K'}[s.quality] || s.quality),
        token: 'aw:' + s.link, url:s.link
      }));
    }
    return {sources(title,alt,ep) {
      const key=JSON.stringify([title,alt,ep]);
      if (!cache.has(key)) { if (cache.size > 100) cache.clear(); const p=load(title,alt,ep); cache.set(key,p); p.catch(()=>cache.delete(key)); }
      return cache.get(key);
    }};
  }
  const api={create,match,decode};
  if (typeof module !== 'undefined') module.exports=api; else root.AnimeWitcher=api;
})(globalThis);
