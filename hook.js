// Runs inside the Zid dashboard page (MAIN world) before the page's own code.
// It never changes the page's requests and NEVER makes a request of its own (since 0.6.0):
// it only looks at the JSON answers the page itself receives and passes on orders with products.
// It does not read or keep any request header (no login tokens).
(() => {
  if (window.__zidOrderHook) return;
  window.__zidOrderHook = true;

  const post = (msg) => window.postMessage({ source: 'zid-order-hook', ...msg }, location.origin);
  try { localStorage.removeItem('zorDetailTpl'); } catch (e) { /* left by 0.5.0, no longer used */ }

  const findOrders = (node, out, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (!Array.isArray(node) && Array.isArray(node.products) && node.id != null &&
        (node.invoice || node.order_total != null)) {
      out.push(node);
      return;
    }
    for (const k in node) findOrders(node[k], out, depth + 1);
  };

  // language of the dashboard page (/ar-sa/ or /en-sa/); Zid answers in that language
  const pageLang = () => (/^\/ar(-|\/|$)/.test(location.pathname) ? 'ar' : 'en');
  const handle = (text) => {
    if (!text || text.length > 5e6) return;
    const c = text.trimStart()[0];
    if (c !== '{' && c !== '[') return;
    let data;
    try { data = JSON.parse(text); } catch (e) { return; }
    const found = [];
    findOrders(data, found, 0);
    for (const order of found) post({ type: 'order', order, lang: pageLang() });
  };

  // the page's own fetch: passed through untouched; the answer is read from a copy
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      const p = origFetch.apply(this, arguments);
      p.then((res) => {
        try {
          const ct = res.headers.get('content-type') || '';
          if (!/json/i.test(ct)) return;
          res.clone().text().then((t) => handle(t)).catch(() => {});
        } catch (e) { /* never break the page */ }
      }).catch(() => {});
      return p;
    };
  }

  // the page's own XHR: passed through untouched; the answer is read when it arrives
  const X = XMLHttpRequest.prototype;
  const origSend = X.send;
  X.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        if (this.responseType && this.responseType !== 'text' && this.responseType !== 'json') return;
        const t = this.responseType === 'json' ? JSON.stringify(this.response) : this.responseText;
        handle(t);
      } catch (e) { /* never break the page */ }
    });
    return origSend.apply(this, args);
  };
})();
