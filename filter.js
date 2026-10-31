// Filter page (#/filter/<page>?<witanime /browse query>): witanime's browse filters, which it reads from the URL.
// Option values are the site's; [value, Arabic, English] (English omitted = same as the value).
const FILTERS = {
  type: [['TV'], ['Movie', 'فيلم'], ['TV Short'], ['OVA'], ['ONA'], ['Special'], ['Music'], ['PV'], ['CM']],
  status: [['ongoing', 'مستمر', 'Ongoing'], ['completed', 'مكتمل', 'Completed'], ['upcoming', 'قادم', 'Upcoming']],
  year: Array.from({ length: new Date().getFullYear() - 1969 }, (_, i) => [String(new Date().getFullYear() - i)]),
  season: [['winter', 'الشتاء', 'Winter'], ['spring', 'الربيع', 'Spring'], ['summer', 'الصيف', 'Summer'], ['fall', 'الخريف', 'Fall']],
  version: [['sub', 'مترجم', 'Subbed'], ['dub', 'مدبلج', 'Dubbed'], ['both', 'مترجم ومدبلج', 'Sub & dub']],
  country: [['JP', 'اليابان', 'Japan'], ['CN', 'الصين', 'China'], ['KR', 'كوريا الجنوبية', 'South Korea'], ['US', 'الولايات المتحدة', 'USA']],
  source: [['Manga', 'مانجا'], ['Web Manga', 'مانجا ويب'], ['Light Novel', 'رواية خفيفة'], ['Novel', 'رواية'], ['Web Novel', 'رواية ويب'],
    ['Visual Novel', 'رواية مرئية'], ['Webtoon', 'ويبتون'], ['Book', 'كتاب'], ['Game', 'لعبة'], ['Anime', 'أنمي'], ['Original', 'قصة أصلية'],
    ['Music', 'أغنية'], ['Mixed Media', 'وسائط متعددة'], ['Other', 'أخرى']],
  sort: [['A-Z'], ['Z-A'], ['Top Rated', 'الأعلى تقييمًا'], ['Most Viewed', 'الأكثر مشاهدة']],
};
// English names come from the slug: 'slice-of-life' -> 'Slice of life'
const GENRES = [
  ['mythology', 'أساطير'],
  ['kids', 'أطفال'],
  ['action', 'أكشن'],
  ['ecchi', 'إيتشي'],
  ['isekai', 'إيسكاي'],
  ['strategy-game', 'استراتيجي'],
  ['avant-garde', 'الخارج عن المألوف'],
  ['time-travel', 'السفر عبر الزمن'],
  ['survival', 'بقاء'],
  ['baseball', 'بيسبول'],
  ['historical', 'تاريخي'],
  ['detective', 'تحري'],
  ['suspense', 'تشويق'],
  ['educational', 'تعليمي'],
  ['reincarnation', 'تناسخ'],
  ['tennis', 'تنس'],
  ['josei', 'جوسيه'],
  ['harem', 'حريم'],
  ['reverse-harem', 'حريم عكسي'],
  ['pets', 'حيوانات أليفة'],
  ['supernatural', 'خارق للطبيعة'],
  ['fantasy', 'خيال'],
  ['sci-fi', 'خيال علمي'],
  ['drama', 'دراما'],
  ['gore', 'دموي'],
  ['horror', 'رعب'],
  ['archery', 'رماية بالقوس'],
  ['romance', 'رومانسي'],
  ['combat-sports', 'رياضات قتالية'],
  ['motorsport', 'رياضة السيارات'],
  ['sports', 'رياضي'],
  ['zombies', 'زومبي'],
  ['parody', 'ساخر'],
  ['samurai', 'ساموراي'],
  ['magic', 'سحر'],
  ['seinen', 'سينين'],
  ['slice-of-life', 'شريحة من الحياة'],
  ['shoujo', 'شوجو'],
  ['shounen', 'شونين'],
  ['medical', 'طبي'],
  ['gourmet', 'طعام راقي'],
  ['military', 'عسكري'],
  ['mystery', 'غموض'],
  ['mahou-shoujo', 'فتيات سحرية'],
  ['space', 'فضاء'],
  ['performing-arts', 'فنون الأداء'],
  ['visual-arts', 'فنون بصرية'],
  ['martial-arts', 'فنون قتالية'],
  ['cats', 'قطط'],
  ['super-power', 'قوى خارقة'],
  ['badminton', 'كرة الريشة'],
  ['basketball', 'كرة السلة'],
  ['volleyball', 'كرة الطائرة'],
  ['soccer', 'كرة قدم'],
  ['comedy', 'كوميديا'],
  ['video-game', 'لعبة فيديو'],
  ['post-apocalyptic', 'ما بعد نهاية العالم'],
  ['school', 'مدرسي'],
  ['vampire', 'مصاصي الدماء'],
  ['adventure', 'مغامرة'],
  ['workplace', 'مهني'],
  ['music', 'موسيقى'],
  ['mecha', 'ميكا'],
  ['psychological', 'نفسي']
];
// The anime filters on the other sections, so the filter page lists their matches too (see moreResults in app.js).
// A filter a section has no equivalent for leaves it out (null): nothing there can match it.
// Manga, in the manga API's terms (MangaSwat's; manga.js's olyQuery turns them into Olympus's): country and source pick the
// kind (Japan: manga, Korea: manhwa, China: manhua; adapted from a manga or webtoon), genres match by their Arabic names; the
// API takes one genre, the others (and) are checked on each card. The anime types, year, season and version have no equivalent
const MGENRES = { action: 32, adventure: 14, comedy: 19, drama: 4, ecchi: 90, fantasy: 12, gore: 369, gourmet: 450, harem: 63, historical: 83,
  horror: 20, isekai: 65, josei: 104, magic: 18, 'martial-arts': 37, mecha: 333, medical: 75, military: 1149, music: 818, mystery: 23,
  psychological: 59, reincarnation: 1014, romance: 5, school: 11, 'sci-fi': 13, seinen: 41, shoujo: 16, shounen: 34, 'slice-of-life': 21,
  sports: 394, 'super-power': 33, supernatural: 86, survival: 1454, suspense: 38, vampire: 129, 'video-game': 415, zombies: 418 };
function mangaQuery(p, genres) {
  const q = {}, set = (k, v) => v && (!q[k] || q[k] === v) && (q[k] = v); // country and source must agree on the kind
  for (const [k, v] of p) {
    if (k.startsWith('genres[')) continue;
    const ok = k === 'search' ? set('search', v)
      : k === 'status' ? set('status', { ongoing: '79', completed: '80' }[v])
      : k === 'country' ? set('type', { JP: '133', KR: '131', CN: '132' }[v])
      : k === 'source' ? set('type', { Manga: '133', 'Web Manga': '133', Webtoon: '131' }[v])
      : k === 'sort' && (set('order_by', { 'Z-A': '-title', 'Top Rated': '-rating', 'Most Viewed': '-views_count' }[v]) || true); // A-Z: the default
    if (!ok) return null;
  }
  const ids = genres.map(g => MGENRES[g] && String(MGENRES[g]));
  if (!ids.every(Boolean)) return null;
  if (ids.length) { q.genres = ids[0]; q.and = ids.slice(1); }
  return q;
}
// Films and series (egydead), which can only be searched: by the search, else the year (its titles carry it), else its latest;
// then each card checked: year, type (Movie: films, TV: series), version (dubbed or not), and genres and country from the
// title's own page. Statuses other than completed, the other anime types, a season or a source have no equivalent
const EG_COUNTRY = { JP: 'اليابان', KR: 'كوريا', CN: 'الصين', US: 'امريكا' };
function filmQuery(p, genres) {
  const type = p.get('type'), status = p.get('status');
  if (p.get('season') || p.get('source') || status && status !== 'completed' || type && !['TV', 'Movie'].includes(type)) return null;
  return { search: p.get('search') || p.get('year') || '', year: p.get('year'), type, version: p.get('version'),
    genres: genres.map(g => GENRES.find(x => x[0] === g)?.[1]).filter(Boolean), country: EG_COUNTRY[p.get('country')] };
}
const optLabel = ([v, ar, en]) => lang === 'ar' ? ar || v : en || (ar ? v.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) : v);

const CHEVRON = ICON.caretDown.replace('class="ph', 'class="chev ph');
const CHECK = ICON.check.replace('class="ph', 'class="ck ph');
const FIELDS = ['sort', 'type', 'status', 'year', 'season', 'version', 'country', 'source'];

// bottom sheet (a centered dialog on desktop) used by the filter chips
const closeSheet = () => {
  const w = document.querySelector('.sheet-wrap.open');
  if (!w) return false;
  w.classList.remove('open');
  setTimeout(() => w.remove(), 250);
  return true;
};

// single-choice bottom sheet: opts = [[value, label]], onPick(value)
function pickSheet(title, opts, cur, onPick) {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet">
    <div class="sheet-head"><b>${esc(title)}</b><button class="sheet-x" type="button" aria-label="${t('close')}">${ICON.x}</button></div>
    <div class="sheet-list">${opts.map(([v, label]) => `<button type="button" class="sheet-opt ${cur === v ? 'on' : ''}" data-v="${esc(v)}"><span>${esc(label)}</span>${CHECK}</button>`).join('')}</div>
  </div>`;
  view.append(w);
  requestAnimationFrame(() => w.classList.add('open'));
  w.onclick = e => {
    if (e.target === w || e.target.closest('.sheet-x')) return closeSheet();
    const v = e.target.closest('.sheet-opt')?.dataset.v;
    if (v != null) { closeSheet(); onPick(v); }
  };
}

async function filterView(force) {
  const qs = location.hash.split('?')[1] || '';
  const p = new URLSearchParams(qs);
  const genres = [...p.entries()].filter(([k]) => k.startsWith('genres[')).map(([, v]) => v);
  const pick = f => FILTERS[f].find(o => o[0] === p.get(f));
  const active = genres.length + FIELDS.filter(f => pick(f)).length;
  // a new query from the current one: always back to page 1
  const go = edit => {
    const q = new URLSearchParams(qs);
    edit(q);
    location.hash = '#/filter/1' + (q.size ? '?' + q : '');
  };

  view.innerHTML = `<div class="page flt-page"><h1>${t('filter')}</h1>
    <form class="fsearch" id="fsearch">
      ${ICON.search}
      <input name="search" type="search" value="${esc(p.get('search') || '')}" placeholder="${t('searchPh')}" enterkeyhint="search" autocomplete="off">
    </form>
    <div class="fchips">
      ${active ? `<a class="fchip clear" href="#/filter/1">${ICON.x} ${t('reset')} · ${active}</a>` : ''}
      <button class="fchip ${genres.length ? 'on' : ''}" data-f="genres">${t('f_genres')}${genres.length ? ` · ${genres.length}` : ''}${CHEVRON}</button>
      ${FIELDS.map(f => `<button class="fchip ${pick(f) ? 'on' : ''}" data-f="${f}">${pick(f) ? esc(optLabel(pick(f))) : t('f_' + f)}${CHEVRON}</button>`).join('')}
    </div>
    <div id="fres"><div class="center" style="min-height:200px"><div class="spin"></div></div></div></div>`;

  $('#fsearch').onsubmit = e => {
    e.preventDefault();
    const v = e.target.search.value.trim();
    go(q => v ? q.set('search', v) : q.delete('search'));
  };
  $('.fchips').onclick = e => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (!f) return;
    if (f !== 'genres') { // single choice
      const opts = f === 'sort' ? FILTERS.sort : [['', t('all'), t('all')], ...FILTERS[f]];
      return pickSheet(t('f_' + f), opts.map(o => [o[0], o[0] ? optLabel(o) : t('all')]), p.get(f) || (f === 'sort' ? 'A-Z' : ''),
        v => go(q => v && !(f === 'sort' && v === 'A-Z') ? q.set(f, v) : q.delete(f)));
    }
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet">
      <div class="sheet-head"><b>${t('f_genres')}</b><button class="sheet-x" type="button" aria-label="${t('close')}">${ICON.x}</button></div>
      <div class="genres">${GENRES.map(g => `<button type="button" class="chip ${genres.includes(g[0]) ? 'on' : ''}" data-v="${g[0]}">${esc(optLabel(g))}</button>`).join('')}</div>
      <div class="sheet-foot"><button class="btn ghost" data-clear>${t('reset')}</button><button class="btn red" data-apply>${t('apply')}</button></div>
    </div>`;
    view.append(w);
    requestAnimationFrame(() => w.classList.add('open'));
    w.onclick = ev => {
      const b = ev.target;
      if (b === w || b.closest('.sheet-x')) return closeSheet();
      b.closest('.chip')?.classList.toggle('on');
      if (b.closest('[data-clear]')) w.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
      if (b.closest('[data-apply]')) go(q => {
        [...q.keys()].filter(k => k.startsWith('genres[')).forEach(k => q.delete(k));
        [...w.querySelectorAll('.chip.on')].forEach((c, i) => q.set(`genres[${i}]`, c.dataset.v));
      });
    };
  };

  // witanime's /browse only has series; films are on /movies, which only follows the search, sort, genres and year filters.
  // Both are listed, interleaved, unless a type is picked (Movie: films alone) or a filter films can't follow is on.
  const type = p.get('type'), fq = new URLSearchParams([...p].filter(([k]) => k !== 'type'));
  const films = type === 'Movie' || !type && [...fq.keys()].every(k => ['search', 'sort', 'year'].includes(k) || k.startsWith('genres['));
  const srcs = [type !== 'Movie' && '/browse' + (qs ? '?' + qs : ''), films && '/movies' + (fq.size ? '?' + fq : '')].filter(Boolean);
  const counts = srcs.map(() => 1); // each source's page count, once its first page is in
  const at = async (n, force) => {
    let err; // one source down: the other's results still show
    const ls = await Promise.all(srcs.map((b, i) => n > counts[i] ? null : scraper.list(b, n, force).catch(e => (err = e, null))));
    if (err && !ls.some(Boolean)) throw err;
    ls.forEach((l, i) => l && (counts[i] = l.pages));
    const [a = [], b = []] = ls.map(l => l?.items);
    return { items: Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter(Boolean), pages: Math.max(...counts) };
  };
  const d = await at(1, force);
  if (!location.hash.startsWith('#/filter')) return;
  // the same search and filters on manga and films, as rows above the (endless) anime grid (with none set, their latest);
  // "nothing here" only once those came back empty too
  const mq = mangaQuery(p, genres), ff = filmQuery(p, genres);
  $('#fres').innerHTML = d.items.length || !(mq || ff) ? grid(d.items) : '';
  lazyGrid($('#fres'), d.pages, n => at(n, true));
  if (mq || ff) {
    $('#fres').insertAdjacentHTML('beforebegin', `<div class="rows sched-rows" id="mres">${skelRows(2)}</div>`);
    const more = await moreResults(mq, ff, d.items);
    if (!$('#mres')) return;
    $('#mres').innerHTML = more;
    if (!more && !d.items.length) $('#fres').innerHTML = grid([]);
  }
  pageRefresh = () => filterView(true);
}
