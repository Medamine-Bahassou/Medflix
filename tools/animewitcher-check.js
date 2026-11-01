#!/usr/bin/env node
// Read-only reproduction of the recovered APK's catalogue lookup.
// Search credentials are read from public runtime settings and never printed or saved.
const ROOT = 'https://firestore.googleapis.com/v1/projects/animewitcher-1c66d/databases/(default)/documents';
function decode(value) {
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k,decode(v)]));
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  if ('integerValue' in value) return Number(value.integerValue);
  return value.stringValue ?? value.doubleValue ?? value.booleanValue ?? null;
}
async function json(url, options) {
  const r = await fetch(url, {...options, signal: AbortSignal.timeout(25000)});
  const body = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.error?.status || 'request failed'}`);
  return body;
}
async function main() {
  const query = process.argv.slice(2).join(' ') || 'Black Clover 2nd Season';
  const settings = decode({mapValue: {fields: (await json(ROOT + '/Settings/constants')).fields}});
  console.log('Startup settings: accessible');
  const config = settings.search_settings;
  if (!config?.app_id || !config?.api_key) throw new Error('Search settings unavailable');
  const result = await json(`https://${config.app_id.toLowerCase()}-dsn.algolia.net/1/indexes/series/query`, {
    method:'POST', headers:{'Content-Type':'application/json','X-Algolia-Application-Id':config.app_id,'X-Algolia-API-Key':config.api_key},
    body:JSON.stringify({query,hitsPerPage:10,attributesToRetrieve:['name','mal_id','path','doc_ref','details.english_title']})
  });
  const norm = x => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  // Exact titles preserve season/cour numbers. Never substitute the first search hit.
  const matches = result.hits.filter(h => [h.name,h.details?.english_title].some(n => norm(n) === norm(query)));
  console.log(`Search: ${result.nbHits} results; ${matches.length} exact title matches`);
  if (matches.length !== 1) throw new Error('A unique anime match is required; specify its exact title');
  const anime = matches[0];
  const path = anime.path || anime.doc_ref;
  if (!/^anime_list\/[^/]+$/.test(path || '')) throw new Error('Unexpected anime document path');
  console.log(`Match: ${anime.name}; MAL ID: ${anime.mal_id || 'unavailable'}`);
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const document = await json(ROOT + '/' + encoded);
  console.log(`Anime document: accessible (${Object.keys(document.fields || {}).length} fields)`);
  const summary = decode({mapValue:{fields:(await json(ROOT + '/' + encoded + '/episodes_summery/summery')).fields}});
  console.log(`Episode summary: accessible (${summary.episodes.length} episodes)`);
  const episode = summary.episodes[0];
  if (!episode || !/^[\w-]+$/.test(episode.doc_id)) throw new Error('No episode ID available');
  const servers = decode({mapValue:{fields:(await json(ROOT + '/' + encoded + '/episodes/' + episode.doc_id + '/servers2/all_servers')).fields}});
  console.log(`Episode ${episode.doc_id}: ${servers.servers.length} server links available`);
}
main().catch(e => { console.error('Blocked:', e.message); process.exitCode = 1; });
