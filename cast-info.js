// optional credits: title pages stay usable when metadata is missing or offline.
const CastInfo = (() => {
  const cache = new Map(), updates = new Map();
  const clean = s => String(s || '').replace(/(?:الموسم|الجزء)\s+\S+.*|\bseason\s+\d+.*|مشاهدة|تحميل|مسلسل|فيلم|مترجم|مدبلج|كامل|اون لاين/gi, ' ').replace(/\b(?:19|20)\d{2}\b/g, '').trim();
  const norm = s => clean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const json = async url => JSON.parse(await api.fetch(url));
  const wd = params => json('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params }));
  const entities = async ids => {
    const unique = [...new Set(ids)], result = {};
    for (let i = 0; i < unique.length; i += 50) Object.assign(result, (await wd({ action: 'wbgetentities', ids: unique.slice(i, i + 50).join('|'), props: 'labels|claims', languages: 'en|ar' })).entities);
    return result;
  };
  const val = s => s?.datavalue?.value;
  const claim = (e, p) => val(e?.claims?.[p]?.[0]?.mainsnak);
  const label = e => e?.labels?.en?.value || e?.labels?.ar?.value || '';
  async function anilist(names, kind, publish) {
    const query = `query($search:String,$type:MediaType,$id:Int,$page:Int){Media(search:$search,type:$type,id:$id){id title{romaji english native} synonyms characters(page:$page,perPage:50,sort:[ROLE,RELEVANCE,ID]){pageInfo{hasNextPage} edges{node{id name{full} image{large}} voiceActors(language:JAPANESE){name{full} image{large}}}}}}`;
    const ask = async variables => {
      const r = JSON.parse(await api.fetch('https://graphql.anilist.co', { query, variables: JSON.stringify(variables) }));
      if (r.errors?.length) throw Error(r.errors[0].message);
      return r.data?.Media;
    };
    for (const name of names) {
      let media = await ask({ search: clean(name), type: kind === 'manga' ? 'MANGA' : 'ANIME', page: 1 });
      if (!media || ![...Object.values(media.title || {}), ...(media.synonyms || [])].some(n => n && names.some(s => norm(n) === norm(s)))) continue;
      const rows = new Map();
      for (let page = 1; ; ) {
        for (const e of media.characters.edges) {
          const a = kind === 'anime' ? e.voiceActors?.[0] : null;
          rows.set(e.node.id, { name: e.node.name.full, photo: e.node.image?.large || '', actor: a?.name.full || '', actorPhoto: a?.image?.large || '' });
        }
        publish([...rows.values()]);
        if (!media.characters.pageInfo.hasNextPage) return [...rows.values()];
        media = await ask({ id: media.id, page: ++page });
      }
    }
    return [];
  }
  async function series(names, year) {
    for (const name of names) {
      const hits = (await json('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(clean(name)))).map(x => x.show)
        .filter(s => names.some(n => norm(n) === norm(s.name)) && (!year || s.premiered?.startsWith(year)));
      if (hits.length !== 1) continue;
      return (await json(`https://api.tvmaze.com/shows/${hits[0].id}/cast`)).map(c => ({ name: c.character.name, photo: c.character.image?.medium || c.person.image?.medium || '', actor: c.person.name, actorPhoto: '', source: hits[0].url }));
    }
    return [];
  }
  async function fallback(tasks) {
    let error;
    for (const task of tasks) { try { const rows = await task(); if (rows.length) return rows; } catch (e) { error = e; } }
    if (error) throw error;
    return [];
  }
  async function anime(names, kind = 'anime') {
    for (const name of names) {
      const data = (await json('https://api.jikan.moe/v4/' + kind + '?' + new URLSearchParams({ q: clean(name), limit: 5 }))).data || [];
      const hit = data.find(a => [a.title, a.title_english, ...(a.titles || []).map(t => t.title)].some(n => names.some(s => norm(n) === norm(s))));
      if (!hit) continue;
      return ((await json(`https://api.jikan.moe/v4/${kind}/${hit.mal_id}/characters`)).data || []).map(c => {
        const actor = c.voice_actors?.find(v => v.language === 'Japanese')?.person;
        return { name: c.character.name, photo: c.character.images?.jpg?.image_url || '', actor: actor?.name || '', actorPhoto: actor?.images?.jpg?.image_url || '' };
      });
    }
    return [];
  }
  async function cinema(names, year) {
    for (const name of names) {
      const found = (await wd({ action: 'wbsearchentities', search: clean(name), language: /[\u0600-\u06ff]/.test(name) ? 'ar' : 'en', limit: 8 })).search || [];
      const candidates = found.filter(e => names.some(n => norm(e.match?.text || e.label) === norm(n)) && /film|movie|series|television|فيلم|مسلسل/i.test(e.description || '') && !/season|episode|موسم|حلقة/i.test(e.description || ''));
      const titles = await entities(candidates.map(e => e.id));
      // an ambiguous title is safer left unmatched than assigned another film's cast.
      const hits = candidates.map(e => titles[e.id]).filter(e => e?.claims?.P161?.length && (!year || String(claim(e, 'P577')?.time || '').includes(year)));
      if (hits.length !== 1) continue;
      const cast = hits[0].claims.P161.filter(c => c.rank !== 'deprecated');
      const ids = cast.flatMap(c => [val(c.mainsnak)?.id, ...(c.qualifiers?.P453 || []).map(s => val(s)?.id)]).filter(Boolean);
      const people = await entities(ids);
      const photo = e => { const f = claim(e, 'P18'); return typeof f === 'string' ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(f) + '?width=240' : ''; };
      return cast.map(c => {
        const actor = people[val(c.mainsnak)?.id], character = people[val(c.qualifiers?.P453?.[0])?.id];
        return { name: label(character) || val(c.qualifiers?.P4633?.[0]) || '', photo: photo(character) || photo(actor), actor: label(actor), actorPhoto: '' };
      }).filter(c => c.name || c.actor);
    }
    return [];
  }
  function load(names, kind, year = '', onUpdate) {
    names = [...new Set(names.filter(n => norm(n)))];
    const key = JSON.stringify([names, kind, year]);
    if (!updates.has(key)) updates.set(key, { rows: null, listeners: new Set() });
    const state = updates.get(key);
    if (onUpdate) { state.listeners.add(onUpdate); if (state.rows) onUpdate(state.rows); }
    const publish = rows => { state.rows = rows; for (const listener of state.listeners) listener(rows); };
    if (!cache.has(key)) {
      const task = kind === 'anime' || kind === 'manga' ? fallback([() => anilist(names, kind, publish), () => anime(names, kind)]) : kind === 'series' ? fallback([() => series(names, year), () => cinema(names, year)]) : cinema(names, year);
      cache.set(key, task.then(rows => { publish(rows); state.listeners.clear(); return rows; }).catch(e => { state.listeners.clear(); updates.delete(key); cache.delete(key); throw e; }));
    }
    return cache.get(key).finally(() => { if (onUpdate) state.listeners.delete(onUpdate); });
  }
  const portrait = (photo, name, small = false) => {
    const tag = photo ? 'button' : 'div';
    return `<${tag} class="cast-photo${small ? ' cast-voice' : ''}"${photo ? ` type="button" data-full="${esc(img(photo))}" data-name="${esc(name)}" aria-label="${esc(t('enlargeImage') + ': ' + name)}"` : ''}><span class="cast-placeholder" aria-hidden="true">${ICON.face}</span>${photo ? `<img data-src="${esc(img(photo))}" alt="${esc(name)}" loading="lazy">` : ''}</${tag}>`;
  };
  const cards = (items, kind) => items.map(c => `<article class="cast-card">${portrait(c.photo, c.name || c.actor)}<b dir="auto">${esc(c.name || c.actor)}</b>${c.actor ? `<small dir="auto">${esc(t(kind === 'anime' ? 'japaneseVoice' : 'actor'))}: ${esc(c.actor)}</small>` : ''}${c.actorPhoto ? portrait(c.actorPhoto, c.actor, true) : ''}</article>`).join('');
  const attribution = items => items[0]?.source ? `<small><a href="${esc(items[0].source)}" target="_blank" rel="noopener">TVmaze · CC BY-SA</a></small>` : '';
  const active = new Set(), pending = [];
  let imageBusy = false, pageRun = 0;
  function pumpImages() {
    if (imageBusy) return;
    const next = pending.shift();
    if (!next) return;
    const { image, owner, url } = next;
    if (!owner.root.isConnected || !image.isConnected || owner.closed) { pumpImages(); return; }
    imageBusy = true;
    let complete = false;
    const done = () => {
      if (complete) return;
      complete = true; clearTimeout(timeout);
      imageBusy = false; owner.cancel = null; pumpImages();
    };
    const timeout = setTimeout(() => { image.hidden = true; image.removeAttribute('src'); done(); }, 20000);
    owner.cancel = done;
    image.onload = () => { if (!owner.closed) image.classList.add('ok'); done(); };
    image.onerror = () => { image.hidden = true; done(); };
    image.src = url;
  }
  function lazyImages(root) {
    const owner = { root, closed: false, cancel: null };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        if (!entry.target.dataset.src) continue;
        pending.push({ image: entry.target, owner, url: entry.target.dataset.src });
        delete entry.target.dataset.src;
      }
      pumpImages();
    }, { rootMargin: '160px' });
    const watch = () => root.querySelectorAll('img[data-src]').forEach(image => observer.observe(image));
    const close = () => {
      owner.closed = true;
      observer.disconnect();
      // a disposed page must not block the next page's portraits.
      if (owner.cancel) {
        root.querySelectorAll('img').forEach(i => { i.onload = i.onerror = null; i.removeAttribute('src'); });
        owner.cancel();
      }
      active.delete(close);
    };
    active.add(close);
    return { watch, close };
  }
  const dispose = () => { pageRun++; for (const close of [...active]) close(); active.clear(); pending.length = 0; };
  function mount(el, names, kind, year = '') {
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<h2>${t('charactersCast')}</h2><div class="cast-track" aria-busy="true" aria-label="${t('loadingCast')}">${Array.from({ length: 6 }, () => '<div class="cast-card skel" aria-hidden="true"><div class="cast-photo cast-skeleton"></div><span class="bar"></span></div>').join('')}</div>`;
    const run = pageRun;
    const href = '#/characters/' + encodeURIComponent(JSON.stringify({ names, kind, year, back: location.hash }));
    let portraits;
    load(names, kind, year, items => {
      if (run !== pageRun || !el.isConnected) return;
      if (!items.length) { el.hidden = true; el.innerHTML = ''; return; }
      el.innerHTML = `<h2><a class="cast-heading" href="${esc(href)}"><span>${t('charactersCast')} <small>${items.length}</small></span><span class="cast-see-all">${t('viewAllCast')} ${ICON.next}</span></a></h2><div class="cast-track">${cards(items.slice(0, 12), kind)}</div>${attribution(items)}`;
      el.hidden = false;
      portraits?.close();
      portraits = lazyImages(el);
      portraits.watch();
    }).catch(() => { if (!portraits && run === pageRun && el.isConnected) { el.hidden = true; el.innerHTML = ''; } });
  }
  async function page({ names, kind, year = '', back = '#/' }) {
    const run = pageRun;
    const root = document.createElement('div');
    root.className = 'page cast-page';
    root.innerHTML = `<h1><a class="h1-back" href="${esc(back.startsWith('#/') ? back : '#/')}" aria-label="${t('back')}">${ICON.back}</a>${t('charactersCast')}<button type="button" class="icon-btn h1-btn cast-search-toggle" aria-label="${t('castSearch')}" aria-expanded="false" aria-controls="cast-page-query">${ICON.search}</button></h1><p dir="auto">${esc(names[0] || '')}</p><input id="cast-page-query" class="cast-search" type="search" hidden placeholder="${t('castSearch')}" aria-label="${t('castSearch')}"><p class="hint" role="status">${t('loadingCast')}</p><div class="grid cast-grid"></div><button class="btn ghost cast-more" hidden>${t('loadMoreCast')}</button><div class="cast-source"></div>`;
    view.replaceChildren(root);
    const input = root.querySelector('input'), toggle = root.querySelector('.cast-search-toggle');
    const setSearch = open => {
      input.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.innerHTML = open ? ICON.x : ICON.search;
      if (open) input.focus();
      else { input.value = ''; input.oninput?.(); toggle.focus(); }
    };
    toggle.onclick = () => setSearch(input.hidden);
    input.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); setSearch(false); } };
    const status = root.querySelector('[role=status]');
    try {
      let items = [], refresh = () => {};
      const loading = load(names, kind, year, rows => { items = rows; refresh(); });
      if (run !== pageRun || !root.isConnected) return;
      const grid = root.querySelector('.cast-grid'), more = root.querySelector('.cast-more');
      let shown = [], count = 0;
      let images = lazyImages(root);
      const append = () => {
        if (!root.isConnected) { sentinel.disconnect(); images.close(); return; }
        const batch = shown.slice(count, count + 24);
        grid.insertAdjacentHTML('beforeend', cards(batch, kind));
        count += batch.length;
        more.hidden = count >= shown.length;
        images.watch();
      };
      const sentinel = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && !more.hidden) append(); }, { rootMargin: '300px' });
      sentinel.observe(more);
      active.add(() => sentinel.disconnect());
      const draw = () => {
        const q = input.value.trim().toLocaleLowerCase();
        shown = items.filter(c => !q || `${c.name} ${c.actor}`.toLocaleLowerCase().includes(q));
        count = 0;
        images.close();
        images = lazyImages(root);
        grid.innerHTML = '';
        append();
        status.textContent = items.length ? `${shown.length} / ${items.length}` : t('noCast');
      };
      more.onclick = append;
      input.oninput = draw;
      root.querySelector('.cast-source').innerHTML = attribution(items);
      refresh = () => { if (run === pageRun && root.isConnected) { root.querySelector('.cast-source').innerHTML = attribution(items); draw(); } };
      if (items.length) refresh();
      await loading;
      refresh();
    } catch { if (root.isConnected) status.textContent = t('castUnavailable'); }
  }
  return { load, mount, page, dispose, clean, norm };
})();
