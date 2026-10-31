// Source ratings only. Lazy lookup avoids requesting every off-screen card.
const Ratings = (() => {
  const cache = new Map();
  let queue = Promise.resolve();
  const enqueue = c => {
    const task = queue.then(() => lookup(c)).catch(() => null);
    queue = task.then(() => new Promise(resolve => setTimeout(resolve, 2200)));
    return task;
  };
  const norm = s => String(s || '').toLowerCase().replace(/(?:الموسم|الحلقة)\s.*|\bseason\s+\d+.*/gi, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  async function lookup(c) {
    const cinema = c.type === 'cinema', title = norm(c.title), year = String(c.year || '');
    if (!title) return null;
    if (cinema) {
      const hits = JSON.parse(await api.fetch('https://v3.sg.media-imdb.com/suggestion/x/' + encodeURIComponent(title) + '.json')).d || [];
      const matches = hits.filter(h => /^tt\d+$/.test(h.id) && norm(h.l) === title && (!year || String(h.y) === year));
      if (matches.length !== 1) return null;
      const doc = new DOMParser().parseFromString(await api.fetch('https://www.imdb.com/title/' + matches[0].id + '/'), 'text/html');
      for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
        let j; try { j = JSON.parse(el.textContent); } catch { continue; }
        const v = Number(j.aggregateRating?.ratingValue);
        if (v > 0 && v <= 10) return { source: 'IMDb', value: v.toFixed(1) };
      }
      return null;
    }
    const query = 'query($search:String,$type:MediaType){Page(perPage:10){media(search:$search,type:$type){title{romaji english native} synonyms averageScore}}}';
    const j = JSON.parse(await api.fetch('https://graphql.anilist.co', { query, variables: JSON.stringify({ search: c.title, type: c.type === 'manga' ? 'MANGA' : 'ANIME' }) }));
    const matches = (j.data?.Page?.media || []).filter(m => [...Object.values(m.title), ...m.synonyms].some(n => norm(n) === title));
    const v = matches.length === 1 && matches[0].averageScore;
    return v > 0 ? { source: 'AniList', value: (v / 10).toFixed(1) } : null;
  }
  const logo = source => source === 'IMDb' ? '<svg viewBox="0 0 64 30" aria-label="IMDb" role="img"><rect width="64" height="30" rx="4" fill="#f5c518"/><text x="5" y="22" font-family="Arial" font-weight="900" font-size="22" fill="#000">IMDb</text></svg>' : '<svg viewBox="0 0 40 30" aria-label="AniList" role="img"><path fill="#02a9ff" d="M0 30 9 0h8l9 30h-8l-2-7H9l-2 7zm11-14h3l-1.5-6z"/><path fill="#9fcdff" d="M25 0h7v23h8v7H25z"/></svg>';
  const badge = (source, value) => `${logo(source)}<b>★ ${esc(value)}</b><small>/10</small>`;
  const observer = new IntersectionObserver(entries => entries.forEach(async ({target, isIntersecting}) => {
    if (!isIntersecting) return;
    observer.unobserve(target);
    const c = JSON.parse(target.dataset.rating), key = JSON.stringify(c);
    if (!cache.has(key)) cache.set(key, enqueue(c));
    const r = await cache.get(key);
    if (r && target.isConnected) { target.innerHTML = badge(r.source, r.value); target.title = r.source; }
  }), {rootMargin:'100px'});
  new MutationObserver(() => document.querySelectorAll('[data-rating]:not([data-rating-ready])').forEach(el => { el.dataset.ratingReady = '1'; observer.observe(el); })).observe(document.documentElement, {childList:true, subtree:true});
  return {
    // the page already gave its IMDb score (a film's page): shown as is
    slot: c => c.imdb ? `<span class="source-rating" title="IMDb">${badge('IMDb', c.imdb)}</span>` : `<span class="source-rating" data-rating="${esc(JSON.stringify({title:c.title, type:c.type, year:c.year || ''}))}"></span>`,
    site: v => v ? `<span class="source-rating site">${ICON.star}<b>${esc(v)}</b></span>` : '', // the site's own score
  };
})();
