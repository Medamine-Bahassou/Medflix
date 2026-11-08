/* Public host pages only; no Anime Witcher backend credentials or remote rules. */
(function(root) {
  const supports = label => /^(mediafire|pixeldrain|krakenfiles|streamtape|firestream|mf|pd|kf|st)(?:\s|$)/i.test(label);
  const host = url => {
    const h = new URL(url).hostname;
    return ['mediafire.com','pixeldrain.com','krakenfiles.com','streamtape.com','streamtape.cc','arabseed.top','firestream.to'].find(d => h === d || h.endsWith('.' + d));
  };
  const clean = s => s.replace(/&amp;/g, '&');
  async function resolve(url, request) {
    const kind = host(url); if (!kind) throw new Error('unsupported host');
    const u = new URL(url);
    if (kind === 'pixeldrain.com') {
      const id = u.pathname.match(/^\/(?:u|api\/file)\/([\w-]+)\/?$/)?.[1];
      if (!id) throw new Error('unsupported Pixeldrain link');
      return u.origin + '/api/file/' + id;
    }
    // arabseed's file host (the movie section's downloads): its free-download form, posted from its page, answers with the file
    if (kind === 'arabseed.top') {
      const id = u.pathname.match(/^\/(\w+)\/?$/)?.[1];
      if (!id) throw new Error('unsupported arabseed link');
      const direct = (await request(url, {op: 'download2', id, method_free: '1'}, {Referer: url})).match(/href=["'](https?:\/\/[^"']+\.(?:mp4|mkv))["']/i)?.[1];
      if (!direct) throw new Error('host did not provide a download link');
      return new URL(clean(direct), url).href;
    }
    const html = await request(url);
    let direct;
    if (kind === 'mediafire.com') direct = html.match(/href=["'](https:\/\/download\d*\.mediafire\.com\/[^"']+)["']/i)?.[1];
    else if (kind === 'krakenfiles.com') {
      const token = html.match(/id=["']dl-token["'][^>]*value=["']([^"']+)/)?.[1];
      const hash = html.match(/data-file-hash=["']([^"']+)/)?.[1];
      if (token && hash) {
        const result = JSON.parse(await request(u.origin + '/download/' + encodeURIComponent(hash), {token}));
        if (result.status === 'ok') direct = result.url;
      }
    } else if (kind === 'firestream.to') {
      const value = html.match(/"downloadUrl":"((?:\\.|[^"\\])*)"/)?.[1];
      if (value) direct = JSON.parse('"' + value + '"');
    } else {
      // Evaluate only quoted strings and substring offsets, never host JavaScript.
      const expr = html.match(/getElementById\(['"](?:no)?robotlink['"]\)\.innerHTML\s*=\s*([^;]+);/)?.[1];
      if (expr) {
        const parts = [...expr.matchAll(/['"]([^'"]*)['"]\)?((?:\.substring\(\d+\))*)/g)];
        direct = parts.map(m => [...m[2].matchAll(/substring\((\d+)\)/g)].reduce((s, n) => s.substring(Number(n[1])), m[1])).join('');
      }
    }
    if (!direct) throw new Error('host did not provide a download link');
    const result = new URL(clean(direct), url);
    if (!['https:', 'http:'].includes(result.protocol)) throw new Error('invalid media URL');
    return result.href;
  }
  function downloadLinks(downloads, players) {
    const seen = new Set(downloads.map(s => s.label.toLowerCase() + ':' + s.quality));
    return [...downloads, ...players.filter(s => supports(s.label) && !seen.has(s.label.toLowerCase() + ':' + s.quality)).map(s => ({...s, token: 'stream:' + s.token}))];
  }
  const videoResponse = (status, type, first) => {
    if (status < 200 || status >= 300 || !first.length || /json|^text\/|zip/i.test(type)) return false;
    const prefix = String.fromCharCode(...first.slice(0, 4)).trimStart();
    return !/^[{[<]/.test(prefix) && prefix !== 'PK\x03\x04';
  };
  const videoHtml = url => '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#000}video{width:100vw;height:100vh}</style><video controls autoplay playsinline src="' + url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></video>';
  // what a TV can fetch by itself, best first. tried as a Chromecast asks (no cookies, no referrer): pixeldrain and mediafire answered with
  // the mp4 every time, firestream about half the time, streamtape never (its page needs a session: the TV would get html)
  const castOrder = links => {
    const name = l => `${l.label} ${l.token}`.toLowerCase();
    const reliable = l => /pixeldrain|mediafire/.test(name(l)) ? 0 : /firestream/.test(name(l)) ? 2 : 1;
    const quality = l => { const q = String(l.quality).toUpperCase(); return /4K|2160/.test(q) ? 0 : /FHD|1080/.test(q) ? 1 : /HD|720/.test(q) ? 2 : /SD|480|360/.test(q) ? 3 : 4; };
    return links.filter(l => !/^st(\s|$)|streamtape|streamta\.pe/.test(name(l))).sort((a, b) => reliable(a) - reliable(b) || quality(a) - quality(b));
  };
  const api = {supports, host, resolve, downloadLinks, videoResponse, videoHtml, castOrder};
  if (typeof module !== 'undefined') module.exports = api; else root.MediaHosts = api;
})(globalThis);
