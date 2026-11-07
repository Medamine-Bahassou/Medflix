// the website's side: web.js posts { medflix: 'ask', id, req } and gets { medflix: 'answer', id, res } back
document.documentElement.dataset.medflixExt = '1'; // set before the page's scripts run: web.js asks here instead of Vercel
window.addEventListener('message', e => {
  if (e.source !== window || e.data?.medflix !== 'ask') return; // only the page itself, not its player iframes
  const answer = res => window.postMessage({ medflix: 'answer', id: e.data.id, res }, location.origin);
  chrome.runtime.sendMessage(e.data.req).then(answer, err => answer({ error: String(err?.message || err) }));
});
