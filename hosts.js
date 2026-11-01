/* Public host pages only; no Anime Witcher backend credentials or remote rules. */
(function(root) {
  const supports = label => /^(mediafire|pixeldrain|krakenfiles|streamtape|mf|pd|kf|st)(?:\s|$)/i.test(label);
  const host = url => {
    const h = new URL(url).hostname;
    return ['mediafire.com','pixeldrain.com','krakenfiles.com','streamtape.com','streamtape.cc','arabseed.top'].find(d => h === d || h.endsWith('.' + d));
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
    } else {
      // Evaluate only quoted strings and substring offsets, never host JavaScript.
      const expr = html.match(/getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*([^;]+);/)?.[1];
      if (expr) {
        const parts = [...expr.matchAll(/['"]([^'"]*)['"](?:\.substring\((\d+)\))?/g)];
        direct = parts.map(m => m[1].substring(Number(m[2] || 0))).join('');
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
  const api = {supports, host, resolve, downloadLinks};
  if (typeof module !== 'undefined') module.exports = api; else root.MediaHosts = api;
})(globalThis);
