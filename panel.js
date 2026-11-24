// Chrome side panel: shows the last order read with "Read order" on the Zid dashboard.
// It stays open on every tab (Zid, Rewaa, ...) until closed. One Copy button per value.
(() => {
  const { normalize } = window.ZidOrderExtract;
  const { FIELDS, GROUPS, defaults, get, allFields } = window.ZidOrderFields;
  const app = document.getElementById('app');
  // tell the background the panel is open; reconnect if the background worker went to sleep
  const connect = (wid) => { const p = chrome.runtime.connect({ name: `panel:${wid}` }); p.onDisconnect.addListener(() => setTimeout(() => connect(wid), 300)); };
  chrome.windows.getCurrent().then((w) => connect(w.id)).catch(() => {});
  const toastEl = document.getElementById('toast');
  let settings = defaults();
  let current = null;   // { id, lang, raw, checks, error, loading, at }
  const STALE_MS = 30 * 60 * 1000; // 30 min

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const empty = (v) => v === null || v === undefined || v === '';
  const pretty = (k) => String(k).replace(/_/g, ' ').replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  const toast = (t) => { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 1400); };

  const copyIcon = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"/></svg>';
  const tickIcon = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
  const copyBtn = (v) => `<button type="button" class="cp" title="Copy" data-v="${esc(v)}">${copyIcon}</button>`;
  const row = (label, val) => (empty(val) ? '' :
    `<div class="row"><div class="lab">${esc(label)}</div><div class="val" dir="auto">${esc(val)}</div>${copyBtn(val)}</div>`);
  const rowsOf = (f, out) => (Array.isArray(out) ? out.map(([l, v]) => row(l, v)).join('') : row(f.l, out));

  const extraLabel = (p) => pretty(p.split('.').filter((x) => x !== '*' && !/^\d+$/.test(x)).slice(-2).join(' '));
  const extraValue = (path, raw, product) => (path.startsWith('products.*.')
    ? (product ? get(product, path.slice(11)) : undefined) : get(raw, path));

  const card = (name, title, body) => {
    const n = (body.match(/class="row"/g) || []).length;
    return n ? `<section class="card"><h2>${esc(title)}</h2><div class="rows">${body}</div></section>` : '';
  };

  function render() {
    if (!current) {
      app.innerHTML = `<div class="empty"><b>No order yet</b>Open the Zid dashboard and press <b style="display:inline">Read order</b> on an order. It shows here, and this panel stays open on every tab.<br><br>Collapse: the ⟩ button (the order stays). Open again: toolbar icon or Alt+Shift+Z.<br>Close with Chrome's X: the order is cleared.</div>`;
      return;
    }
    if (!current.raw) {
      app.innerHTML = `<div class="top"><div class="r1"><div class="num"><h1>Order ${esc(current.id)}</h1></div>
          <button class="ib" type="button" data-act="settings" title="Settings">⚙</button>
          <button class="ib" type="button" data-act="hide" title="Collapse panel (open again: toolbar icon or Alt+Shift+Z)">⟩</button></div></div>
        <main>${current.loading ? '<div class="loading"><span class="spin"></span>Reading the order from Zid…</div>'
          : `<div class="banner">Could not read this order<p>${esc(current.error || '')}</p></div>`}</main>`;
      return wire();
    }
    const raw = current.raw;
    const rec = normalize(raw);
    // field names only (no values) for the Settings page list
    chrome.storage.local.set({ knownFields: allFields(raw).map((f) => ({ path: f.path, label: f.label })) }).catch(() => {});
    const { errors = [], warnings = [] } = current.checks || {};
    const on = new Set(settings.show);
    const extra = settings.extra || [];
    const products = raw.products || [];

    const groupHtml = (g) => {
      if (g === 'Product') {
        return rec.items.map((it, i) => {
          const body = FIELDS.filter((f) => f.p && on.has(f.k)).map((f) => rowsOf(f, f.v(it, products[i]))).join('') +
            extra.filter((p) => p.startsWith('products.*.')).map((p) => row(extraLabel(p), extraValue(p, raw, products[i]))).join('');
          return card(`Product ${i + 1}`, rec.items.length > 1 ? `Product ${i + 1} of ${rec.items.length}` : 'Product', body);
        }).join('');
      }
      return card(g, g, FIELDS.filter((f) => !f.p && f.g === g && on.has(f.k)).map((f) => rowsOf(f, f.v(rec, raw))).join(''));
    };
    const extraTop = extra.filter((p) => !p.startsWith('products.*.')).map((p) => row(extraLabel(p), extraValue(p, raw))).join('');
    const status = get(raw, 'order_status.name') || rec.status;

    app.innerHTML = `
      <div class="top">
        <div class="r1">
          <div class="num"><h1>#${esc(rec.orderId)}</h1>${copyBtn(rec.orderId)}</div>
          <div class="acts">
          <button class="lang" type="button" data-act="rewaa" title="Fill this order into the Rewaa sell screen open in this window (stops at Pay)" ${errors.length ? 'disabled' : ''}>Fill Rewaa</button>
          <button class="ib" type="button" data-act="settings" title="Settings">⚙</button>
          <button class="ib" type="button" data-act="hide" title="Collapse panel (open again: toolbar icon or Alt+Shift+Z)">⟩</button>
          </div>
        </div>
        <div class="r2"><span>${esc(rec.createdAtKsa || rec.createdAt)}</span><span class="chip" dir="auto">${esc(status)}</span></div>
      </div>
      <main>
        ${errors.length || current.error ? `<div class="banner">Do NOT use - check failed${errors.map((x) => `<p>${esc(x)}</p>`).join('')}${current.error ? `<p>${esc(current.error)}</p>` : ''}</div>` : ''}
        ${warnings.length ? `<div class="warn">${warnings.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
        ${GROUPS.map(groupHtml).join('')}
        ${card('More', 'More fields', extraTop)}
      </main>`;
    wire();
  }

  function wire() {
    app.querySelectorAll('.cp').forEach((b) => {
      b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.v);
          b.classList.add('done'); b.innerHTML = tickIcon;
          setTimeout(() => { b.classList.remove('done'); b.innerHTML = copyIcon; }, 1100);
        } catch (err) { toast('Copy failed - click inside the panel and try again'); }
      };
    });
    const act = (name, fn) => { const b = app.querySelector(`[data-act="${name}"]`); if (b) b.onclick = fn; };
    act('settings', () => chrome.runtime.openOptionsPage());
    // collapse keeps the order (toolbar icon / Alt+Shift+Z opens it again); Chrome's X clears it
    act('hide', () => chrome.storage.session.set({ collapsing: Date.now() }).finally(() => window.close()));
    // the open tab must be the Rewaa Sell Screen; rewaa.js asks for a confirm there, then fills
    act('rewaa', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      if (!tab || !/^https:\/\/platform\.rewaatech\.com\/.*\/pos\/v2\/registers\/\d+\/sale/.test(tab.url || '')) {
        toast('Open the Rewaa Sell Screen in this window first'); return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'rewaa-fill', current })
        .then((r) => toast(r && r.ok ? 'Confirm on the Rewaa page' : (r && r.error) || 'Rewaa page did not answer'))
        .catch(() => toast('Reload the Rewaa tab once (the extension was updated)'));
    });
  }

  chrome.storage.local.get(['settings']).then((s) => {
    settings = { ...defaults(), ...(s.settings || {}) };
    return chrome.storage.session.get('current');
  }).then((s) => {
    current = s.current || null;
    // an order collapsed long ago is not shown again: read it fresh instead
    if (current && current.at && Date.now() - current.at > STALE_MS) { current = null; chrome.storage.session.remove('current'); }
    render();
  });

  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'session' && c.current) { current = c.current.newValue || null; render(); }
    if (area === 'local' && c.settings) { settings = { ...defaults(), ...(c.settings.newValue || {}) }; render(); }
  });
})();
