// Movies section: ArabSeed / MySeed (m.myseed.tv) films and series (WordPress, server-rendered pages, no Cloudflare challenge),
// with selectors also covering EgyDead.
// No anime here: witanime already has every anime title, and the site files them under "انمي" categories/titles,
// so those cards are dropped wherever they show up (lists, related, search).
// A film's slug is its root path ("by-any-means"); a series' carries its folder ("serie/x", "season/x-s02", "episode/x-s02e01").
// Routes: #/cinema, #/cinema/browse/<cat>, #/cinema/<slug>, #/cinema/<slug>/watch (an episode slug plays straight away)
const ED = 'https://m.myseed.tv';
const ECATS = [ // [id, listing path, ar, en]
  ['all', '/recently/', 'أحدث الأفلام', 'Latest movies'], // everything just added, newest first: its films (see edList); /movies/ is a hub that opens on Arabic films
  ['english', '/category/foreign-movies/', 'أفلام أجنبية', 'Foreign movies'],
  ['arabic', '/category/arabic-movies/', 'أفلام عربية', 'Arabic movies'],
  ['netflix', '/category/netflix/netflix-movies/', 'أفلام نتفليكس', 'Netflix movies'],
  ['asian', '/category/asian-movies/', 'أفلام آسيوية', 'Asian movies'],
  ['hindi', '/category/indian-movies/', 'أفلام هندية', 'Indian movies'],
  ['turkish', '/category/turkish-movies/', 'أفلام تركية', 'Turkish movies'],
  ['cartoon', '/category/animation-movies/', 'أفلام كرتون', 'Cartoon movies'],
  ['dubbed', '/category/dubbed-movies/', 'أفلام مدبلجة', 'Dubbed movies'],
  ['classic', '/category/افلام-كلاسيكيه/', 'أفلام كلاسيكية', 'Classic movies'],
  // series: category pages list episodes, shown as their show (one card per show, opening its season; see edCards)
  ['series', '/series/', 'أحدث المسلسلات', 'Latest series'],
  ['english-series', '/category/foreign-series/', 'مسلسلات أجنبية', 'Foreign series'],
  ['arabic-series', '/category/arabic-series/', 'مسلسلات عربية', 'Arabic series'],
  ['egyptian-series', '/category/مسلسلات-مصريه/', 'مسلسلات مصرية', 'Egyptian series'],
  ['netflix-series', '/category/netflix/netflix-series/', 'مسلسلات نتفليكس', 'Netflix series'],
  ['turkish-series', '/category/turkish-series/', 'مسلسلات تركية', 'Turkish series'],
  ['asian-series', '/category/مسلسلات-كوريه/', 'مسلسلات كورية', 'Korean series'],
  ['hindi-series', '/category/مسلسلات-هندية/', 'مسلسلات هندية', 'Indian series'],
  ['cartoon-series', '/category/cartoon-series/', 'مسلسلات كرتون', 'Cartoon series'],
  ['dubbed-series', '/category/dubbed-series/', 'مسلسلات مدبلجة', 'Dubbed series'],
  ['ramadan', '/category/مسلسلات-رمضان/', 'مسلسلات رمضان', 'Ramadan series'],
  ['tv-shows', '/category/برامج-تلفزيونية/', 'برامج تلفزيونية', 'TV shows'],
];
const eCat = id => ECATS.find(c => c[0] === id);
const eCatName = c => lang === 'ar' ? c[2] : c[3];
const isAnimeCat = (cat, name = '') => /انمي|انميات|أنمي/.test(cat + ' ' + name);
const imgSrc = el => el?.getAttribute('data-src') || el?.getAttribute('src') || '';
// "مشاهدة فيلم By Any Means 2026 مترجم" -> { title: 'By Any Means', year: '2026' }
const edTitle = s => {
  s = s.replace(/^\s*(مشاهدة\s+)?(و\s*تحميل\s+)?((فيلم|مسلسل|برنامج|انمي|أنمي)\s+)?/, '').replace(/\s+(مترجم|مدبلج)[ةه]?(\s+.*)?$/, '').trim();
  const year = s.match(/\b(19|20)\d\d\b(?!.*\b(19|20)\d\d\b)/)?.[0] || '';
  return { title: s.replace(new RegExp(`\\s*\\(?${year}\\)?\\s*$`), '').trim() || s, year };
};
// movies sit at the site root (/slug/); series and seasons under /selary/ (kept in the slug as serie/, season/, episode/, which saved history uses).
// edPath: a slug's path on the site now
const edSlug = href => {
  let u = pathOf(href);
  try { u = decodeURIComponent(u); } catch {}
  const p = u.match(/^\/(?:(serie|season|episode)s?\/|(selary)\/)?([^/]+)\/?$/i);
  if (!p || /^(page|category|find|movies|series|watch|download|login|register|actor|author|tag|main|genre)$/i.test(p[1] || p[3])) return '';
  const dir = p[1] ? p[1].toLowerCase() : p[2] ? 'serie' : (/الحلقة|-eps\d+|^(مسلسل|برنامج)-/.test(p[3]) ? 'episode' : '');
  return (dir ? dir + '/' : '') + p[3];
};
const edPath = slug => slug.replace(/^(serie|season|episode)\//, (_, d) => d === 'episode' ? '' : 'selary/');
const edShowKey = c => c.path.startsWith('/cinema/') && /^\/cinema\/(serie|season|episode)\//.test(c.path) && c.title.replace(/\s*(الموسم|الحلقة)\s.*$/, '');
const edHref = slug => '#/cinema/' + slug.split('/').map(encodeURIComponent).join('/');
// search also lists software and games using movie cards: require evidence that a post is screen media
const edMedia = (slug, cat, name) => {
  if (/كمبيوتر|موبايل|تطبيقات|ألعاب|العاب|\b(?:software|apps|games)\b/i.test(cat)) return false;
  return /أفلام|افلام|مسلسلات|كرتون|أنيميشن|انيميشن|وثائقي|مسرحي|برامج (?:تلفزيونية|تليفزيونية)|\b(?:movies|films|series|tv shows)\b/i.test(cat)
    || /^(?:serie|season)\/|^episode\/(?!برنامج-)|^(?:فيلم|مسلسل)-/.test(slug)
    || /^(?:(?:مشاهدة|تحميل|و)\s+)*(?:فيلم|مسلسل|الحلقة)\s/.test(name.trim());
};
const edCards = (root, perSeason) => { // perSeason: a season isn't merged into its show (the search's)
  const els = [...(root?.querySelectorAll('a.movie__block[href], .series__box > a[href], .innov-series-card > a[href], li.movieItem > a[href]') || [])];
  const animeStems = new Set();
  const raw = els.map(a => {
    const slug = edSlug(a.getAttribute('href')), cat = txt(a.querySelector('.cat_name, .post__category'));
    const name = a.getAttribute('title') || txt(a.querySelector('h1, h3, .title___')), t = edTitle(name);
    if (isAnimeCat(cat, name)) {
      const w = norm(t.title).split(' ').filter(Boolean);
      if (w.length) animeStems.add(w.slice(0, 2).join(' '));
      return null;
    }
    return slug && edMedia(slug, cat, name) && { slug, cat, name, t, a };
  }).filter(Boolean);
  return raw.filter(r => {
    if (!animeStems.size || !/أنيميشن|كرتون/.test(r.cat)) return true;
    const stem = norm(r.t.title).split(' ').filter(Boolean).slice(0, 2).join(' ');
    return !stem || !animeStems.has(stem);
  }).map(({ slug, cat, name, t, a }) => ({
    path: '/cinema/' + slug, type: 'cinema', ...t,
    // an episode stands for its show: named as it, with the episode as a badge, and opening the show (see cinemaRoute)
    ...(slug.startsWith('episode/') && { title: t.title.replace(/\s*الحلقة\s.*$/, '') || t.title, badge: name.match(/الحلقة\s+\d+/)?.[0] || '', href: edHref(slug) + '/show' }),
    poster: imgSrc(a.querySelector('img')),
    desc: txt(a.querySelector('.post__info p, .story')),
    rating: txt(a.querySelector('.post__ratings')).match(/^\d+(\.\d+)?$/)?.[0] || '',
    dub: /مدبلج/.test(name + cat),
  })).filter((c, i, all) => all.findIndex(o => o.path === c.path || (!perSeason && edShowKey(c) && edShowKey(o) === edShowKey(c))) === i); // a pinned film is listed twice; a show's newest episode/season stands for it
};
const edUrl = slug => `${ED}/${edPath(slug)}/`;
// a season page's episodes, oldest first (sorted by episode number)
const edEpisodes = doc => [...doc.querySelectorAll('.episodes__list a[href], .EpsList a[href]')]
  .map(a => ({ slug: edSlug(a.getAttribute('href')), n: txt(a.querySelector('b') || a).match(/\d+(\.\d+)?/)?.[0] || txt(a) }))
  .filter((e, i, all) => e.slug?.startsWith('episode/') && all.findIndex(o => o.slug === e.slug) === i)
  .sort((a, b) => (parseFloat(a.n) || 0) - (parseFloat(b.n) || 0));
const dubbed = items => items?.map(c => c.dub ? { ...c, badge: t('dubbed') } : c); // labelled when drawn: the cached cards stay language-neutral

Object.assign(parsers, {
  // every block: some categories open with a (often empty) pinned one. the series search keeps every season: the search shows each,
  // and a season's page doesn't link the others (cinemaTitle)
  edList: (doc, url) => ({ items: edCards(doc, /type=series/.test(url)),
    pages: Math.max(1, ...[...doc.querySelectorAll('a[href*="/page/"]')].map(a => +a.getAttribute('href').match(/\/page\/(\d+)/)?.[1] || 0)) }),
  edMovie(doc, url) {
    const selfSlug = url ? edSlug(url) : '';
    const field = (...labels) => [...doc.querySelectorAll('.LeftBox li, .info__area__ul > li')].find(l => labels.some(k => txt(l.querySelector('.title__kit span, span')).startsWith(k)));
    const vals = (...labels) => [...(field(...labels)?.querySelectorAll('a, .as-info-value') || [])].map(txt).filter(Boolean);
    const poster = imgSrc(doc.querySelector('.poster__single img, .single-thumbnail img'));
    const seasonsCards = edCards(doc.querySelector('.seasons-list')).reverse();
    const seasonsBtns = [...doc.querySelectorAll('.seasons__list__btns a[href], #seasons__list li[data-url]')].map(el => {
      const s = edSlug(el.getAttribute('href') || el.dataset.url);
      return s && { path: '/cinema/' + s, type: 'cinema', title: txt(el), poster };
    }).filter((s, i, a) => s && a.findIndex(o => o?.path === s.path) === i);
    const h1 = txt(doc.querySelector('h1.post__name, .singleTitle'));
    if (!h1) throw new Error('not a title page'); // an error page, or another site's (egydead's, whose menu once showed as the name): never cached
    return {
      ...edTitle(h1), dub: /مدبلج/.test(h1),
      origin: new URL(doc.querySelector('.bread__crumbs a[href^="http"], .breadcrumbs-single a[href^="http"]')?.getAttribute('href') || ED).origin, // the site's current domain
      poster,
      banner: imgSrc(doc.querySelector('.lcp-cover-img, .aseed-lcp-img, .single__cover img')) || doc.querySelector('.singleCover')?.style.backgroundImage.match(/url\(["']?([^"')]+)/)?.[1] || poster,
      // the plot is .post__story's ("قصة العرض"); .post__content, earlier in the page, is the site's "watch and download" line
      desc: txt(doc.querySelector('.post__story p')) || txt(doc.querySelector('.post__content, .extra-content p, .singleStory')),
      cat: vals('القسم', 'تصنيف'), genres: vals('النوع', 'نوع'),
      tags: [...vals('السنه', 'سنة'), ...vals('الجوده', 'جودة'), ...vals('البلد', 'بلد'), ...vals('اللغه', 'لغة'), ...vals('مده العرض', 'مدة')].filter(Boolean),
      trailer: doc.querySelector('.show__trailer[data-iframe]')?.getAttribute('data-iframe') || doc.querySelector('#trailerPopup iframe[src*="youtube"]')?.getAttribute('src')
        || [...doc.querySelectorAll('[data-trailer], iframe[src], iframe[data-src], a[href]')].map(el => el.getAttribute('data-trailer') || el.getAttribute('data-src') || el.getAttribute('src') || el.getAttribute('href')).find(u => /(?:youtube(?:-nocookie)?\.com\/(?:embed|watch|shorts|live)\b|youtu\.be\/)/i.test(u || '')) || '',
      related: edCards(doc.querySelector('.related__blocks, .related_section, .related-posts')),
      seasons: seasonsCards.length ? seasonsCards : seasonsBtns,
      episodes: edEpisodes(doc),
      // the page's own cast ("فريق العمل"; actors only: it lists directors and writers too). a role of just "ممثل" (actor) is no character;
      // the photos are 80px thumbnails of a .jpg original, and a placeholder where the site has none
      team: [...doc.querySelectorAll('.work__team .persons__list a[href*="/actor/"]')].map(a => ({ name: txt(a.querySelector('.role')).replace(/^ممثل(ة)?$/, ''),
        photo: (a.querySelector('img')?.getAttribute('data-src') || '').replace(/.*default-user-image.*/, '').replace(/-\d+x\d+\.webp$/, '.jpg'), actor: txt(a.querySelector('.name')), actorPhoto: '' })),
      imdbId: doc.querySelector('.imdb__rating__link')?.getAttribute('href')?.match(/\/(tt\d+)/)?.[1] || '', // its cast is asked of imdb by it
      imdb: txt(doc.querySelector('.imdb__rating__link .rate__txt')).match(/^\d+(\.\d+)?/)?.[0] || '', // the page's IMDb box ("6.8 / 10"): no lookup needed
      // an episode's season (or series), a season's series: the last such link in the breadcrumbs before self
      up: [...doc.querySelectorAll('.bread__crumbs a[href], .breadcrumbs-single a[href]')].map(a => edSlug(a.getAttribute('href'))).filter(s => s && s !== selfSlug && /^(season|serie)\//.test(s)).pop() || '',
    };
  },
});

// MegaMax and ArabSeed's redirectors (/vid/?id=, /vids.php?t=) wrap video hosts: unwrap to the direct embed URLs
// and order known fast hosts first.
const GOOD_HOSTS = ['myseed', 'vidmoly', 'vidara', 'earnvids', 'voe', 'dsvplay'];
// old films still list these long-gone hosts first. upstream.to's certificate is gone; m.arabseed.me's embed-x.html sends to some film page
const DEAD_HOSTS = /(^|\.)(openload|oload|verystream|gounlimited|clipwatching|watchvideo|mystream|uptostream|streamango|rapidvideo|vidlox|vidoza|upstream)\.|^m\.arabseed\./;
const LAST_HOST = 'uqload'; // plays, but with ads: listed last and never picked by default
const hostRank = h => h === LAST_HOST ? 100 : (r => r < 0 ? 99 : r)(GOOD_HOSTS.indexOf(h));
const hostName = u => { try { return new URL(u).hostname.replace(/^www\./, '').split('.')[0]; } catch { return ''; } };
const b64Url = s => { try { return atob(s.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } };
const myseedUrl = (tok, origin) => `https://d.myseed.tv/player-gateway.php?src=myseed&front=${new URL(origin).hostname}&t=${tok}`;
async function unwrapServer(s, origin) {
  if (s.url.startsWith('//')) s = { ...s, url: 'https:' + s.url }; // its ok.ru links have no scheme
  if (s.url.startsWith('/vids.php')) {
    // the website can't play myseed's: its gateway plays only framed from myseed's own site (Android's WebView poses as it,
    // Player.kt), else it shows a "visit the official site" banner, and its video file refuses any other referrer. Not offered
    if (api.web) return [];
    const tok = new URL(s.url, origin).searchParams.get('t');
    return tok ? [{ ...s, label: 'myseed', url: myseedUrl(tok, origin) }] : [];
  }
  const id = s.url.includes('/vid/?id=') && new URL(s.url, origin).searchParams.get('id');
  if (id) {
    const u = b64Url(id);
    return u.startsWith('https://') ? [{ ...s, label: hostName(u) || s.label, url: u }] : [];
  }
  if (!/\/iframe\/[A-Za-z0-9]+$/.test(s.url) || !api.mirrors) {
    return s.url.startsWith('https://') ? [{ ...s, label: /^سيرفر\s*\d*$/.test(s.label) && hostName(s.url) || s.label }] : [];
  }
  try {
    const st = await api.mirrors(s.url);
    const list = (st?.data || []).flatMap(q => [...q.mirrors].sort((a, b) => hostRank(a.driver) - hostRank(b.driver)).map(m => ({ label: m.driver, quality: q.label.replace(/\s*\(.*\)/, ''),
      url: m.link.startsWith('//') ? 'https:' + m.link : m.link }))).filter(m => m.url.startsWith('https://'));
    return list.length ? list : [s];
  } catch (e) { console.error(e); return [s]; }
}

const edBase = (m, slug) => `${m.origin}/${edPath(slug).split('/').map(encodeURIComponent).join('/')}`;
// myseed's link only plays for the browser the watch page was made for (its user agent), and not for long. The site
// keeps that page cached, made for whoever asked first ("Link expired" for everyone else): it's asked for anew, past the
// cache and as the player asks, each time myseed is played rather than taken from the saved answer
// (quality: one the page doesn't list is asked for as its menu asks)
async function myseedNow(m, slug, quality = '') {
  const html = await api.fetch(`${edBase(m, slug)}/watch/?_=${Date.now()}`, null, true);
  const direct = parse(html).querySelector('.servers__list li[data-direct-arabseed="1"]');
  const link = !quality || !direct || direct.dataset.qu === quality ? html
    : JSON.parse(await api.fetch(`${m.origin}/get__watch__server/`, { post_id: direct.dataset.post, quality, server: direct.dataset.server, csrf_token: seedCsrf(html) }, true)).server || '';
  const tok = link.match(/vids\.php\?t=([A-Za-z0-9]+)/)?.[1];
  if (!tok) throw new Error('no myseed link');
  return myseedUrl(tok, m.origin);
}

// the watch page's own calls (an XHR from the site, with the page's csrf token; main.js sends a form as one)
const seedCsrf = html => html.match(/csrf__token'\s*:\s*"([^"]+)/)?.[1] || '';
// the watch page lists one quality's servers (480p); its menu asks for the others (720p, 1080p), then each server's link on its own
async function otherQualities(origin, html, doc) {
  const csrf = seedCsrf(html), post = doc.querySelector('.servers__list li[data-post]')?.dataset.post;
  if (!csrf || !post) return [];
  const shown = new Set([...doc.querySelectorAll('.servers__list li[data-qu]')].map(li => li.dataset.qu));
  const xhr = async (what, form) => JSON.parse(await api.fetch(`${origin}/${what}/`, form));
  return (await Promise.all([...doc.querySelectorAll('.qualities__list li[data-quality]')].map(li => li.dataset.quality).filter(q => q && !shown.has(q)).map(async quality => {
    const form = { post_id: post, quality, csrf_token: csrf };
    const lis = await xhr('get__quality__servers', form).then(r => [...parse(r.html || '').querySelectorAll('li[data-server]')]).catch(() => []);
    return Promise.all(lis.map(li => xhr('get__watch__server', { ...form, server: li.dataset.server })
      .then(r => r.server ? { label: li.dataset.serverName || txt(li) || t('server'), quality, url: r.server } : null).catch(() => null)));
  }))).flat().filter(Boolean);
}

// the watch page (the title's page + watch/) and download page (+ download/): stream servers and download links
async function seedWatch(m, slug) {
  const base = edBase(m, slug);
  const [wHtml, dHtml] = await Promise.all([api.fetch(`${base}/watch/`), api.fetch(`${base}/download/`).catch(() => '')]);
  const doc = parse(wHtml), dDoc = dHtml ? parse(dHtml) : doc;
  const list = '.serversList li[data-link], .mob-servers li[data-link], .servers__list li[data-link]';
  if (!doc.querySelector('.serversList, .mob-servers, .servers__list')) throw new Error(`not the watch page: ${txt(doc.querySelector('title')) || 'empty'}`);
  const raw = [...[...doc.querySelectorAll(list)].map(li => ({
    label: txt(li) || t('server'),
    quality: li.dataset.qu || li.closest('[data-quality]')?.dataset.quality || li.dataset.quality || '',
    url: li.dataset.link || '',
  })), ...await otherQualities(m.origin, wHtml, doc)].filter(s => s.url && !DEAD_HOSTS.test(new URL(s.url, m.origin).hostname)); // gone hosts: not offered, nor unwrapped (MegaMax's lookup of one hangs till it times out)
  let servers = (await Promise.all(raw.map(s => unwrapServer(s, m.origin)))).flat()
    .sort((a, b) => hostRank(a.label) - hostRank(b.label) || (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0)); // each host's best quality first
  // vidara gets new films before it has encoded them: its page then says "Waiting in queue" (.queue-card) or "Encoding your
  // video" (.processing-card), both with a .stage-badge, and plays nothing.
  // the website starts on the first server (it can't tell a player that plays from one that doesn't, unlike the desktop's
  // playerHealth): such a vidara is left out there, so the next host plays
  if (api.web) servers = (await Promise.all(servers.map(async s => s.label === 'vidara' && /stage-badge|queue-card|processing-card/.test(await api.fetch(s.url).catch(() => '')) ? null : s))).filter(Boolean);
  const downloads = [
    ...[...doc.querySelectorAll('.donwload-servers-list li')].map(li => ({ label: txt(li.querySelector('.ser-name')), quality: txt(li.querySelector('.server-info')), url: li.querySelector('a.ser-link')?.getAttribute('href') || '' })),
    ...[...dDoc.querySelectorAll('a.download__item[href]')].map(a => {
      const href = a.getAttribute('href') || '', b64 = href.match(/\/l\/([A-Za-z0-9+/=_-]+)/)?.[1];
      const url = (b64 && b64Url(b64)) || href;
      return { label: hostName(url) || txt(a.querySelector('h4, span')), quality: a.closest('[data-quality]')?.dataset.quality || txt(a.querySelector('p')).match(/\d+p/i)?.[0] || '', url };
    }),
  ].filter(d => d.url.startsWith('https://'));
  return { servers, downloads };
}

// an episode's (or film's) download links the app can fetch itself (its site's own file host), best quality first (app.js runEpisode)
async function edDownloads(slug) {
  const w = await seedWatch(await load('edMovie', edUrl(slug)), slug);
  return w.downloads.filter(l => MediaHosts.host(l.url)).sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))
    .map(l => ({ ...l, quality: l.quality.replace(/^(\d+)$/, '$1p'), token: l.url }));
}

// MyCima and WeCima: films only, never listed (so no card shows twice). The same film (title, year, dubbed or not) is
// searched there and its servers and download links are offered after ArabSeed's, as backups.
const MC = 'https://cima.my-cima.net';
const mcKey = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// the same name, or with the year matching, one name's words all in the other's (egydead's "Undisputed 4 Boyka" for "Boyka Undisputed")
const sameFilm = (m, name) => {
  const t = edTitle(name), a = mcKey(t.title).split(' '), b = mcKey(m.title).split(' ');
  const [few, all] = a.length < b.length ? [a, new Set(b)] : [b, new Set(a)];
  return /^(مشاهدة\s+)?فيلم\s/.test(name) && (!t.year || !m.year || t.year === m.year) && /مدبلج/.test(name) === !!m.dub
    && (a.join(' ') === b.join(' ') || !!(t.year && m.year) && few.every(w => all.has(w)));
};
const backupServer = ref => url => ({ label: hostName(url), quality: '', url, ref, backup: true });
async function mcWatch(m) {
  const hits = parse(await api.fetch(`${MC}/ajax-search.php`, { queryString: m.title }));
  const vids = [...hits.querySelectorAll('li[data-video-id]')].filter(li => sameFilm(m, txt(li)))
    .map(li => li.dataset.videoId).slice(0, 2); // it often has a film twice ("... مترجم", "... مترجم ماي سيما")
  const pages = await Promise.all(vids.map(v => Promise.all([api.fetch(`${MC}/play.php?vid=${v}`), api.fetch(`${MC}/downloads.php?vid=${v}`).catch(() => '')])));
  return {
    servers: pages.flatMap(([p]) => [...parse(p).querySelectorAll('.list_embedded li[data-embed]')].map(li => li.dataset.embed.match(/src=['"]([^'"]+)/)?.[1] || ''))
      .filter(u => u.startsWith('https://')).map(backupServer(MC + '/')).sort((a, b) => hostRank(a.label) - hostRank(b.label)),
    downloads: pages.flatMap(([, d]) => d ? [...parse(d).querySelectorAll('.downloadlist a[href]')] : [])
      .map(a => ({ label: hostName(a.getAttribute('href')) || txt(a.querySelector('strong')), quality: '', url: a.getAttribute('href') })).filter(d => d.url.startsWith('https://')),
  };
}

async function wcWatch(m) {
  const hit = (await wcSearch(m.title)).find(r => sameFilm(m, r.title));
  if (!hit) return { servers: [], downloads: [] };
  const l = await wcLinks(hit.url);
  return { servers: l.servers.map(backupServer('')).sort((a, b) => hostRank(a.label) - hostRank(b.label)), // its own player sends no referrer
    downloads: l.downloads.map(url => ({ label: hostName(url), quality: '', url })) };
}

// EgyDead (behind Cloudflare's check, which is shown when it asks): its watch page is laid out like ArabSeed's.
// It hops domains: egydead.space sends on to the current one, where its links point
// the website: that redirect is behind Cloudflare's check for Vercel's servers, the current domain isn't, so it's asked there
// directly (when egydead.space starts sending elsewhere, this follows it)
const EGY = api.web ? 'https://a1.egydead.media' : 'https://egydead.space';
async function egyWatch(m) {
  const hit = [...parse(await api.fetch(`${EGY}/?s=${encodeURIComponent(mcKey(m.title))}`)).querySelectorAll('.posts-list .movieItem a[href]')]
    .find(a => sameFilm(m, a.getAttribute('title') || txt(a.querySelector('.BottomTitle'))));
  if (!hit) return { servers: [], downloads: [] };
  const u = new URL(hit.getAttribute('href')), w = await seedWatch({ origin: u.origin }, decodeURIComponent(u.pathname.replace(/^\/|\/$/g, '')));
  return { servers: w.servers.map(s => ({ ...s, ref: u.origin + '/', backup: true })), downloads: w.downloads }; // its hosts want its page as the referrer
}

// free players by IMDb id, for any film or episode IMDb knows: the last backups (subtitles in English at best, and their own ads).
// an episode's id is its series': the episode page has no IMDb link, so its English name is looked up ("The Sopranos الموسم السادس الحلقة 21")
const FREE = [ // [label, film, episode]
  ['vidsrc', 'https://vidsrc.cc/v2/embed/movie/$id', 'https://vidsrc.cc/v2/embed/tv/$id/$s/$e'],
  ['vidfast', 'https://vidfast.pro/movie/$id', 'https://vidfast.pro/tv/$id/$s/$e'],
  ['2embed', 'https://www.2embed.cc/embed/$id', 'https://www.2embed.cc/embedtv/$id&s=$s&e=$e'],
  ['vidsrcme', 'https://vidsrc.me/embed/movie?imdb=$id', 'https://vidsrc.me/embed/tv?imdb=$id&season=$s&episode=$e'],
];
async function freeWatch(m, slug) {
  const ep = slug.includes('/') && m.title.replace(/[أإآ]/g, 'ا').match(/^(.+?)(?:\s+الموسم\s+(\S+))?\s+الحلقة\s+(\d+)/);
  const s = ep && (ep[2] ? +ep[2] || AR_NTH.indexOf(ep[2]) + 1 : 1), name = mcKey(ep ? ep[1] : m.title);
  let tt = !ep && m.imdbId;
  if (!tt && (!slug.includes('/') || s)) { // past "العاشر" (AR_NTH's last), the season isn't known
    const hits = (JSON.parse(await api.fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(name)}.json`)).d || [])
      .filter(h => /^tt\d+$/.test(h.id) && mcKey(h.l) === name && (ep ? /^tv(Series|MiniSeries)$/ : /^(movie|tvMovie)$/).test(h.qid) && (ep || !m.year || String(h.y) === m.year));
    tt = hits.length === 1 && hits[0].id; // two of that name: none, rather than the wrong one
  }
  return { servers: tt ? FREE.map(([label, film, tv]) => ({ label, quality: '', url: ep ? tv.replace('$id', tt).replace('$s', s).replace('$e', ep[3]) : film.replace('$id', tt), ref: '', backup: true })) : [], downloads: [] };
}

// all four sites' links (remembered by edWatchSoon): a host already listed is not offered again by a later site
// early: handed the site's own links first, which the player shows while the other sites are still being asked
async function edWatch(m, slug, early) {
  const mine = seedWatch(m, slug);
  early?.(mine);
  const [a, ...b] = await Promise.allSettled([mine, ...(slug.includes('/') ? [] : [egyWatch(m), mcWatch(m), wcWatch(m)]), freeWatch(m, slug)]);
  b.forEach(r => r.reason && console.error(r.reason));
  const own = a.value || { servers: [], downloads: [] }, more = b.map(r => r.value).filter(Boolean);
  if (a.reason && !more.some(x => x.servers.length)) throw a.reason;
  const fresh = list => (have => x => !have.has(x.label) && have.add(x.label))(new Set(list.map(x => x.label)));
  return { servers: [...own.servers, ...more.flatMap(x => x.servers).filter(fresh(own.servers))],
    downloads: [...own.downloads, ...more.flatMap(x => x.downloads).filter(fresh(own.downloads))] };
}

// Watch links are asked as soon as a title opens (and the next episode while this one plays).
// Its answer is saved (store.streams) and played from at once next time, while the page is asked again behind it.
const watches = new Map(); // slug -> { at, promise }: one ask per few minutes
const edWatchSoon = (m, slug) => {
  const key = '/cinema/' + slug, saved = store.streams[key], w = watches.get(slug);
  if (!(w && Date.now() - w.at < 10 * 60e3)) {
    let early;
    const promise = edWatch(m, slug, p => early = p).then(r => {
      if (r.servers.length) { store.streams[key] = { at: Date.now(), w: r }; persist('streams'); }
      return r;
    });
    watches.set(slug, { at: Date.now(), promise, early });
    promise.catch(() => watches.get(slug)?.promise === promise && watches.delete(slug));
  }
  return saved ? Promise.resolve(api.web ? { ...saved.w, servers: saved.w.servers.filter(s => s.label !== 'myseed') } : saved.w) : watches.get(slug).promise; // saved before the website left myseed's out (unwrapServer)
};

const edList = (id, page = 1, force) => load('edList', ED + eCat(id)[1] + (page > 1 ? `page/${page}/` : ''), force)
  .then(d => id === 'all' ? { ...d, items: d.items.filter(c => /^\/cinema\/فيلم-/.test(c.path)) } : d); // latest additions: the films only (not episodes, shows, wrestling)
// its search lists the newest episodes, so an older show (or its older seasons) is missed: its series search ("type=series") first
const edFind = (q, series) => `${ED}/find/?word=${encodeURIComponent(q)}${series ? '&type=series' : ''}`;
// "The Sopranos الموسم السادس" -> 6 (0: past AR_NTH's "العاشر")
const seasonNo = title => { const w = title.replace(/[أإآ]/g, 'ا').match(/الموسم\s+(\S+)/)?.[1] || ''; return +w || AR_NTH.indexOf(w) + 1; };
// a card per season, each show's in order (the site lists them any way); then the episodes of shows not listed yet
const edSearch = q => Promise.all([load('edList', edFind(q, true)).catch(() => ({ items: [] })), load('edList', edFind(q))]).then(([s, e]) => {
  const show = c => edShowKey(c) || c.path, first = new Map(s.items.map((c, i) => [show(c), i]).reverse());
  const seasons = [...s.items].sort((a, b) => first.get(show(a)) - first.get(show(b)) || seasonNo(a.title) - seasonNo(b.title)), have = new Set(seasons.map(show));
  return dubbed([...seasons, ...e.items.filter(c => !have.has(show(c)))]);
});

async function cinemaRoute(rest, force) {
  if (/^(serie|season|episode)$/.test(rest[0])) rest = [rest[0] + '/' + rest[1], ...rest.slice(2)];
  const [a, b] = rest;
  if (a === 'browse' && eCat(b)) return cinemaBrowse(b, force);
  if (a?.startsWith('episode/') && b === 'show') { // an episode's card: its season (or show), where it was listed as the show
    const m = await load('edMovie', edUrl(a), force);
    return location.replace(edHref(m.up || a));
  }
  if (a && (b === 'watch' || a.startsWith('episode/'))) return cinemaPlay(a);
  if (a) return cinemaTitle(a, force);
  return cinemaHome(force);
}

// slider slides for film cards: use the card's own poster + story immediately when present, else fetch the title page
async function cinemaHero(items) {
  const slugs = items.map(c => c.path.slice('/cinema/'.length));
  const top = await Promise.all(items.map((c, i) => (c.poster && c.desc) ? { banner: c.poster, title: c.title, desc: c.desc } : load('edMovie', edUrl(slugs[i])).catch(() => null)));
  return top.map((m, i) => m?.banner && { banner: m.banner, title: m.title, desc: m.desc,
    info: edHref(slugs[i]), play: `${edHref(slugs[i])}/watch` }).filter(Boolean);
}

// the source has no ranking endpoint: use the best rated unique films or series from the lists already loaded.
const edTopRated = (lists, series = false) => [...new Map(lists.flatMap(d => d?.items || [])
  .filter(c => /^\/cinema\/(?:serie|season|episode)\//.test(c.path) === series && +c.rating > 0)
  .map(c => [edShowKey(c) || c.path, c])).values()].sort((a, b) => +b.rating - +a.rating).slice(0, 10);

async function cinemaHome(force) {
  const hash=location.hash;
  const lists = await firstSections(ECATS.map(c => () => edList(c[0],1,force)));
  if(location.hash!==hash)return;
  const slides=lists.find(Boolean).items.slice(0,5).map(c=>({banner:c.poster,title:c.title,year:c.year,desc:c.desc || '',info:edHref(c.path.slice('/cinema/'.length))}));
  heroPage(slides, `
      ${chips(ECATS.slice(1).map(c => [eCatName(c), '#/cinema/browse/' + c[0]]))}
      ${row(t('continueWatching'), continued(['cinema']))}
      ${row(t('homeTopMovies'), dubbed(edTopRated(lists)), undefined, true)}
      ${row(t('homeTopSeries'), dubbed(edTopRated(lists, true)), undefined, true)}
      ${ECATS.map((c, i) => row(eCatName(c), dubbed(lists[i]?.items), '#/cinema/browse/' + c[0])).join('')}`, () => cinemaHome(true));
}

async function cinemaBrowse(id, force) {
  const at = (n, force) => edList(id, n, force).then(d => ({ ...d, items: dubbed(d.items) }));
  listView(eCatName(eCat(id)), await at(1, force), n => at(n, true), () => cinemaBrowse(id, true));
}

const edMovieOf = (slug, force = false) => load('edMovie', edUrl(slug), force, true); // a title page, from the cache: its cast and IMDb id (cast-info.js)
async function cinemaTitle(slug, force) {
  let m = await load('edMovie', edUrl(slug), force);
  const path = '/cinema/' + slug;
  // a season's page often links no other season: they're found by the show's name
  if (slug.startsWith('serie/') && !m.seasons.length && seasonNo(m.title)) {
    const show = m.title.replace(/\s*الموسم\s.*$/, ''), all = (await load('edList', edFind(show, true)).catch(() => null))?.items || [];
    const mine = all.filter(c => c.path.startsWith('/cinema/serie/') && c.title.replace(/\s*الموسم\s.*$/, '') === show && seasonNo(c.title)).sort((a, b) => seasonNo(a.title) - seasonNo(b.title));
    if (mine.some(c => c.path === path)) m = { ...m, seasons: mine };
  }
  if (m.cat.some(isAnimeCat)) return animeInstead(m.title); // an anime film after all (an old link, say): witanime's copy instead
  // a series page with seasons: open the season last watched, else the first
  if (m.seasons.length && (!m.episodes.length || !m.seasons.some(s => s.path === path))) {
    const s = [...m.seasons].sort((x, y) => (store.history[y.path]?.at || 0) - (store.history[x.path]?.at || 0))[0];
    return location.replace(edHref(s.path.slice('/cinema/'.length)));
  }
  const h = store.history[path], eps = m.episodes;
  const target = !slug.includes('/') ? slug : h?.slug || eps[0]?.slug;
  if (target) edWatchSoon(m, target).catch(() => {});
  const play = !slug.includes('/') ? { href: edHref(slug) + '/watch', label: t('play') } // a film
    : h ? { href: edHref(h.slug), label: `${t('play')} · ${t('ep')} ${h.ep}` } : eps.length && { href: edHref(eps[0].slug), label: t('play') };
  // one quiet line for the facts (category, year, running time, quality) instead of a chip each; the countries and language
  // are left out. "2 ساعة و 53 دقيقة" / "ساعة و 52 دقيقة" (one hour) read as hours and minutes
  const runtime = s => { const h = +(s.match(/(\d+)\s*ساع/)?.[1] || /ساع/.test(s)), min = +(s.match(/(\d+)\s*دقيق/)?.[1] || 0); return h || min ? t('runtime', h, min) : s; };
  const meta = [...m.cat, ...m.tags.filter(x => /^(19|20)\d\d$/.test(x)), ...m.tags.filter(x => /ساع|دقيق/.test(x)).map(runtime),
    ...m.tags.filter(x => /^(blu-?ray|web-?dl|web-?rip|hd-?rip|hdtv|hd-?cam|cam|dvd\w*|hd|4k|\d{3,4}p)$/i.test(x))];
  const desc = /^مشاهدة\s+(و\s*)?تحميل/.test(m.desc) ? '' : m.desc; // pages saved before the plot was read: the site's line, not shown
  view.innerHTML = `<div class="det-page">${detHead({ list: eps.length && [t('episodes'), eps.length], banner: img(m.banner), poster: m.poster && img(m.poster), title: m.title, meta, chips: m.genres, desc,
      rating: Ratings.slot({title:m.title, type:"cinema", path, year:m.year, imdb:m.imdb}), play: play || null,
      actions: `${api.web && !eps.length ? `<button class="btn ghost" id="web-cinema-dl">${ICON.download} ${t('downloadShort')}</button>` : ''}
            <button class="btn ghost" id="fav">${inList(path) ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList')}</button>`,
      more: `${m.trailer ? `<button class="btn ghost" id="trl">${ICON.play} ${t('trailer')}</button>` : ''}
            ${slug.includes('/') ? `<button class="btn ghost" id="grf">${ICON.star} ${t('epRatings')}</button>` : ''}` })}
    ${m.seasons.length > 1 ? `<div class="section" data-pane="eps"><h2>${t('seasons')}</h2><div class="fchips">${m.seasons.map(s => `<a class="fchip ${s.path === path ? 'on' : ''}" href="#${s.path}" dir="auto">${esc(s.title.match(/(الموسم|الجزء)\s+\S+/)?.[0] || s.title)}</a>`).join('')}</div></div>` : ''}
    ${eps.length ? `<div class="section" data-pane="eps"><h2>${t('episodes')} <small>${eps.length}</small><div class="ep-tools">${selBtn('btn ghost small')}</div></h2>
      ${selBar()}<div class="eps list" id="eps"></div></div>` : ''}
    <section class="section" id="title-cast" hidden></section>
    ${row(t('moreLike'), dubbed(m.related))}</div>`;
  wireDetTabs();
  CastInfo.mount($('#title-cast'), [m.title], slug.includes('/') ? 'series' : 'cinema', slug.includes('/') ? '' : m.year, slug);
  if (slug.includes('/')) $('#grf').onclick = () => ratingsSheet([m.title], m.imdbId, false); // a series: a film has no episodes to rate
  $('#fav').onclick = e => { const on = toggleList({ path, title: m.title, poster: m.poster, type: 'cinema' }); e.currentTarget.innerHTML = on ? ICON.check + ' ' + t('inList') : ICON.plus + ' ' + t('myList'); };
  if (eps.length) {
    const drawEps = () => $('#eps').innerHTML = eps.map(e => // the site gives no episode names or stills
      epRow(e.n, null, m.banner || m.poster, edHref(e.slug), store.seen['/cinema/' + e.slug], h?.slug === e.slug, '/cinema/' + e.slug)).join('');
    drawEps();
    epActions($('#eps'), eps.map(e => ({ id: '/cinema/' + e.slug, ep: e.n, slug: e.slug })), () => eps.map(e => '/cinema/' + e.slug), drawEps,
      e => ({ id: e.id, epPath: e.id, kind: 'cinema', slug: e.slug, show: path, title: m.title, ep: e.ep, poster: m.poster }), m.title);
  }
  $('#web-cinema-dl')?.addEventListener('click',()=>WebDownloads.downloadVideo([{id:path,kind:'cinema',slug,show:path,title:m.title,ep:'',poster:m.poster}]));
  pageRefresh = () => cinemaTitle(slug, true);
  if (m.trailer) $('#trl').onclick = () => showTrailer(m.trailer);
}

// the same film on witanime: straight to it when the search finds a close match, else the search results
async function animeInstead(title) {
  const hit = (await scraper.search(title).catch(() => ({ items: [] }))).items.find(i => i.type === 'movie' && similar(i.title, title) >= .75);
  location.replace(hit ? '#/title' + hit.path : '#/search/' + encodeURIComponent(title));
}

async function cinemaPlay(slug) {
  if (store.downloads['/cinema/' + slug]?.state === 'done') return location.replace(offlineHash('/cinema/' + slug)); // downloaded: no need to stream
  const m = await load('edMovie', edUrl(slug));
  const watch = edWatchSoon(m, slug); // asked now: the season page below may take a moment too
  // Continue Watching: one entry per film, or per season for episodes (the one watched last)
  const ep = slug.startsWith('episode/') && (m.title.match(/الحلقة\s+(\d+(\.\d+)?)/)?.[1] || '?');
  const show = '/cinema/' + (ep && m.up || slug);
  store.history[show] = { show, slug, title: ep ? m.title.replace(/\s*الحلقة\s.*$/, '') : m.title, poster: m.poster, ...(ep && { ep }), at: Date.now() };
  store.seen['/cinema/' + slug] = 1;
  persist('history'); persist('seen');
  const eps = m.episodes.length ? m.episodes : ep && m.up ? (await load('edMovie', edUrl(m.up)).catch(() => null))?.episodes || [] : [];
  const next = eps[eps.findIndex(e => e.slug === slug) + 1];
  castInfo = { links: () => edDownloads(slug), poster: m.poster };
  panelNames = null;
  view.innerHTML = `<div class="player">
    <header>
      <button class="icon-btn" id="back" title="${t('back')}" aria-label="${t('back')}">${ICON.back}</button>
      <div class="ttl"><a href="#${show}" dir="auto">${esc(m.title)}</a><small>${esc(m.year)}</small></div>
      <div class="sp"></div>
      ${next ? `<button class="btn ghost small" id="nxt" title="${t('nextEp')}">${ICON.next} <span>${t('nextEp')}</span></button>` : ''}
      <div class="dd idle" id="srv">
        <button class="dd-btn"><span class="dd-dot"></span><span class="lbl">${t('loadingServers')}</span>${ICON.caretDown}</button>
        <div class="dd-menu"></div>
      </div>
      ${api.playerFull ? `<button class="icon-btn pfull" title="${t('fullscreen')}" aria-label="${t('fullscreen')}">${ICON.expand}</button>` : ''}
      ${playerMore(eps.map(e => ({ n: e.n, go: edHref(e.slug), seen: store.seen['/cinema/' + e.slug], on: e.slug === slug })), m.banner || m.poster)}
    </header>
    <div class="stage"><div class="spin"></div></div>
    ${playBar()}
  </div>`;
  const stage = $('.stage'), srv = $('#srv'), dlm = $('#dlm');
  let stream = null, cur = null;
  const place = () => {
    if (!stream) return;
    const r = stage.getBoundingClientRect();
    // the hosts only play when embedded by egydead (MegaMax's "allow_domain"): present its page as the referrer (the backups' own site's, or none)
    api.player(stream.url || stream, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }, cur?.ref ?? m.origin + '/', !!stream.native);
  };
  playerObs = new ResizeObserver(place);
  playerObs.observe(stage);
  $('#back').onclick = () => leavePlayer('#' + show);
  if (next) $('#nxt').onclick = () => location.replace(edHref(next.slug)); // like chapters: back still leaves the player
  $('#ext').onclick = () => api.openExternal(edUrl(slug));

  const here = () => [`#/cinema/${slug}/watch`, ep && `#/cinema/${slug}`].includes(decodeURIComponent(location.hash));
  let w = { servers: [], downloads: [] }, why = ''; // why: what refused it, shown under "no servers"
  let answered = false; // the menu works before the servers' answer (it can take a minute): until then it says it's looking
  // downloads are on third-party hosts: they open in the browser
  const drawDl = () => dlm.querySelector('.dd-menu').innerHTML = !answered ? `<div class="dd-group">${t('searching')}</div>` : w.downloads.length
    ? w.downloads.map((d, i) => `<button class="dd-item" data-i="${i}"><span class="host">${esc(d.label)}</span>${d.quality ? `<span class="q">${esc(d.quality)}</span>` : ''}<span class="tag">${ICON.external} ${t('browser')}</span></button>`).join('')
    : `<div class="dd-group">${t('dlNone')}</div>`;
  drawDl();
  dlm.querySelector('.dd-btn').onclick = () => dlm.classList.contains('open') ? closeMenu(dlm) : openMenu(dlm);
  dlm.querySelector('.dd-menu').onclick = e => { const b = e.target.closest('.dd-item'); if (b) { closeMenu(); const l=w.downloads[b.dataset.i]; if(api.web)return WebDownloads.downloadVideo([{id:'/cinema/'+slug,kind:'cinema',slug,show:'/cinema/'+slug,title:m.title,ep:m.n||'',poster:m.poster,token:l.url,host:l.label,quality:l.quality}]); api.openExternal(l.url); toast(t('openedBrowser')); } };
  // the saved answer, else the site's own servers once they're in (if any), else everything: the other sites (egydead's
  // Cloudflare check can take a minute the first time) join the menu when they answer
  const { promise: fresh, early } = watches.get(slug) || {};
  try { w = await (early ? Promise.race([watch, early.then(r => r.servers.length ? r : watch, () => watch)]) : watch); } catch (e) { console.error(e); why = noNames(e.message); }
  answered = true; drawDl();
  if (next) edWatchSoon(m, next.slug).catch(() => {});
  if (!here()) return;
  // the menu takes the full answer when it comes (servers gone, or the other sites'), the video playing on
  let more = !!fresh; // still asking: said at the end of the menu
  fresh?.then(f => {
    const urls = l => l.servers.map(s => s.url).join(' ');
    if (!here() || !f.servers.length || urls(f) === urls(w)) return;
    const had = w.servers.length;
    w = f; cur = w.servers.find(s => s.url === cur?.url) || cur;
    had ? (cur ? draw() : nextServer()) : route(); // "no servers" showing: drawn again with them; none of the old ones worked: on to these
    drawDl();
  }, () => {}).finally(() => { more = false; here() && w.servers.length && draw(); });
  const draw = () => {
    srv.className = 'dd ' + (cur ? 'live' : 'idle') + (srv.classList.contains('open') ? ' open' : '');
    srv.querySelector('.lbl').innerHTML = cur ? `${esc(cur.label)}${cur.quality ? `<small>${esc(cur.quality)}</small>` : ''}` : t('chooseServer');
    // one group per quality, as MegaMax lists them (best first), then MyCima's and WeCima's backups
    const grp = s => s.backup ? t('backupServers') : s.quality || t('mainServers');
    const groups = [...new Set(w.servers.map(grp))];
    srv.querySelector('.dd-menu').innerHTML = groups.map(q => {
      const g = w.servers.map((s, i) => [s, i]).filter(([s]) => grp(s) === q);
      return `<div class="dd-group">${esc(q)}<small>${g.length}</small></div>`
        + g.map(([s, i]) => `<button class="dd-item ${s === cur ? 'on' : ''}" data-i="${i}"><span class="host">${esc(s.label)}</span>${s.quality ? `<span class="q" data-q="${esc(s.quality)}">${esc(s.quality)}</span>` : ''}${CHECK}</button>`).join('');
    }).join('') + (more ? ddSkel() : '');
  };
  const tried = new Set();
  const pick = async (i, patient) => {
    const s = cur = w.servers[i]; draw();
    tried.add(s.url);
    stream = null; api.player(null); stage.innerHTML = '<div class="spin"></div>'; showPlayBar(false);
    let url = s.label === 'myseed' ? await myseedNow(m, slug, s.quality).catch(e => (console.error(e), s.url)) : s.url;
    if (api.web) url = await api.unwrap(url).catch(() => url); // the website: a host's stream it can play itself, ad-free ({ url, native }: web.js)
    if (cur !== s || !here()) return; // another server picked, or the page left, meanwhile
    stream = url; place(); showPlayBar(true);
    watchServer(() => cur === s && here(), patient, () => {
      store.prefs.edServer = s.label; (store.prefs.showServer ||= {})[show] = s.label; persist('prefs');
    }, nextServer);
  };
  // the next one not tried yet; uqload only when it's all that's left
  const nextServer = () => {
    const rest = w.servers.filter(s => !tried.has(s.url)), n = rest.find(ok) || rest[0];
    if (n) return pick(w.servers.indexOf(n));
    cur = stream = null; api.player(null); showPlayBar(false); draw();
    stage.innerHTML = `<div class="empty"><b>${t('noneWorked')}</b>${t('noneWorkedHint')}</div>`;
  };
  srv.querySelector('.dd-btn').onclick = () => srv.classList.contains('open') ? closeMenu(srv) : openMenu(srv);
  srv.querySelector('.dd-menu').onclick = e => { const b = e.target.closest('.dd-item'); if (b) { closeMenu(); tried.clear(); pick(+b.dataset.i, true); } };
  if (!w.servers.length) {
    draw();
    stage.innerHTML = `<div class="empty"><b>${t('noServers')}</b>${t('noServersEdHint')}${why ? `<small class="why" dir="ltr">${esc(why)}</small>` : ''}<br><br><button class="btn red" id="again">${t('retry')}</button></div>`;
    $('#again').onclick = () => route();
    return;
  }
  // the one that last played this show, else the last one used, else the first one; uqload only when it's all there is
  const ok = s => s.label !== LAST_HOST, mine = w.servers.findIndex(s => s.label === store.prefs.showServer?.[show]), saved = w.servers.findIndex(s => ok(s) && s.label === store.prefs.edServer);
  pick(Math.max(0, mine >= 0 ? mine : saved >= 0 ? saved : w.servers.findIndex(ok)));
}
