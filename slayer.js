// Manga Slayer v41's active Madara source, plus its bundled older domain. No app credentials.
(function(root) {
  const sources = [{ key: 'spark', origin: 'https://sparkmanga.net' }, { key: 'starz', origin: 'https://manga-starz.net' }];
  const source = key => { const s = sources.find(s => s.key === key); if (!s) throw Error('Unknown manga source'); return s; };
  // base64url paths keep Arabic slugs and chapter URLs inside one route segment.
  const id = (key, path) => `s:${key}:` + btoa(new URL(path, source(key).origin).pathname).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const decode = value => { const [, key, token] = value.split(':'); return { ...source(key), path: atob(token.replace(/-/g, '+').replace(/_/g, '/')) }; };
  const url = value => { const s = decode(value); return s.origin + s.path; };
  const text = e => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const blockedTitle = s => /^(access denied|just a moment|attention required|403 forbidden)\b/i.test(String(s).trim());
  const image = (e, base) => {
    if (!e) return '';
    const candidates = ['data-src', 'data-lazy-src', 'src'].map(k => e.getAttribute(k) || '');
    for (const k of ['data-srcset', 'srcset']) candidates.push(...(e.getAttribute(k) || '').split(',').map(s => s.trim().split(/\s+/)[0]));
    for (const value of candidates) {
      if (!value.trim() || /^(data|javascript|about):/i.test(value.trim())) continue;
      try { const u = new URL(value.trim(), base); if (/^https?:$/.test(u.protocol)) return u.href; } catch {}
    }
    return '';
  };
  const number = s => (String(s).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).match(/\d+(?:\.\d+)?/) || [s])[0];
  function listing(doc, key) {
    const seen = new Set();
    const items = [...doc.querySelectorAll('.page-item-detail, .c-tabs-item__content')].map(b => {
      const a = b.querySelector('.post-title a, .tab-summary h3 a'), href = a?.getAttribute('href');
      if (!href || !text(a) || blockedTitle(text(a))) return null;
      const sid = id(key, href);
      if (seen.has(sid)) return null; seen.add(sid);
      return { path: '/manga/series/' + sid, type: 'manga', title: text(a), names: [text(a)], poster: image(b.querySelector('img'), source(key).origin), rating: '', badge: '' };
    }).filter(Boolean);
    const pages = Math.max(1, ...[...doc.querySelectorAll('a[href]')].map(a => +(a.getAttribute('href').match(/\/page\/(\d+)/)?.[1] || 1)));
    return { items, pages };
  }
  function chapters(doc, key) {
    return [...new Map([...doc.querySelectorAll('li.wp-manga-chapter a[href]')].map(a => {
      const cid = id(key, a.getAttribute('href')); return [cid, { id: cid, n: number(text(a)) }];
    })).values()];
  }
  function series(doc, sid) {
    const s = decode(sid), base = s.origin + s.path;
    const heading = [...doc.querySelectorAll('.post-title h1, h1.post-title')].find(e => text(e) && !blockedTitle(text(e)));
    const title = text(heading);
    const poster = image(doc.querySelector('.summary_image img, .summary-image img'), base)
      || image({ getAttribute: k => k === 'src' ? doc.querySelector('meta[property="og:image"]')?.getAttribute('content') : '' }, base);
    const info = label => [...doc.querySelectorAll('.post-content_item')].find(e => text(e.querySelector('.summary-heading')).includes(label))?.querySelector('.summary-content');
    const alt = text(info('Alternative')) || text(info('أسماء')), st = text(info('Status')) || text(info('الحالة'));
    const postId = doc.querySelector('[data-manga]')?.getAttribute('data-manga') || doc.querySelector('#manga-chapters-holder')?.getAttribute('data-id') || doc.body?.className.match(/postid-(\d+)/)?.[1];
    if (!title || !postId) throw Error('Manga details unavailable');
    return { id: sid, title, alt, names: [title, ...alt.split(/[,;|،]/)], story: text(doc.querySelector('.summary__content, .description-summary .summary-content')),
      poster, cover: poster, type: text(info('Type')), status: /مستمر|ongoing/i.test(st) ? '79' : /مكتمل|completed/i.test(st) ? '80' : '',
      genres: [...doc.querySelectorAll('.genres-content a')].map(text), rating: '', views: 0, postId, chapters: chapters(doc, s.key) };
  }
  function pages(doc) {
    return [...new Set([...doc.querySelectorAll('img.wp-manga-chapter-img')].map(e => image(e)).filter(u => /^https?:\/\//.test(u)))];
  }
  const listUrl = (s, p, page) => p.search ? s.origin + (page > 1 ? `/page/${page}/` : '/') + '?s=' + encodeURIComponent(p.search) + '&post_type=wp-manga' : s.origin + (page > 1 ? `/manga/page/${page}/` : '/');
  const supports = p => !['type', 'status', 'genres', 'is_hot', 'order_by'].some(k => p[k]);
  // the public config rewrites the old image hosts; retain HTTPS and the DNS name for TLS/SNI.
  const transformImage = (u, key) => u.replace(/^(https?:\/\/)(s\d+|lek|temp|s)\./, (_, scheme, sub) => scheme + sub + (key === 'spark' ? 'darko.' : 'likey.')).replace('lekmanga.site', key === 'spark' ? 'link-manga.net' : 'like-manga.net');
  const api = { blockedTitle, transformImage, sources, id, decode, url, listing, chapters, series, pages, listUrl, supports, number };
  if (typeof module !== 'undefined') module.exports = api; else root.Slayer = api;
})(globalThis);
