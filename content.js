// Zid dashboard only: "Read order" button on an order's own page. A click opens Chrome's side
// panel (it stays open on every tab, e.g. Rewaa) and sends the order there.
// The order comes ONLY from the answer the dashboard page itself already received (hook.js):
// the extension never asks Zid for anything (since 0.6.0 - no list-page buttons, no EN/AR re-read).
// Data never leaves this browser.
(() => {
  const { normalize, validate } = window.ZidOrderExtract;
  const orders = new Map();  // order id -> { raw, lang } from Zid's own JSON (in the dashboard's language)

  chrome.storage.local.get('settings').then((s) => {
    const saved = s.settings || {};
    // v3: show the "Mobile for Rewaa" row to people who saved their field choice before it existed
    if (!saved.v || saved.v < 3) chrome.storage.local.set({ settings: { ...saved, v: 3, ...(saved.show ? { show: [...new Set([...saved.show, 'cust.mobileSa'])] } : {}) } });
  }).catch(() => {});

  const pageLang = () => (/^\/ar(-|\/|$)/.test(location.pathname) ? 'ar' : 'en');
  const detailId = () => { const m = location.pathname.match(/\/orders\/(\d+)(?:\/|$)/); return m ? m[1] : null; };

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'zid-order-hook') return;
    if (d.type === 'order' && d.order && d.order.id != null) {
      orders.set(String(d.order.id), { raw: d.order, lang: d.lang || pageLang() });
      refresh();
    }
  });

  const send = (m) => { try { chrome.runtime.sendMessage(m); } catch (e) { /* extension reloaded: page needs F5 */ } };

  // the order this page already received from Zid -> checks -> side panel
  function onRead(id) {
    send({ type: 'open-panel', id }); // first, while the click still counts as a user action
    const entry = orders.get(id);
    if (!entry) return send({ type: 'show-order', payload: { id, error: 'Order data not received - press F5 on this order page' } });
    const pageText = document.body.innerText; // the screen check: this is the order's own page
    const checks = validate(normalize(entry.raw), pageText);
    send({ type: 'show-order', payload: { id, lang: entry.lang, raw: entry.raw, checks } });
  }

  // ---------- the button ----------
  let mainBtn;
  function refresh() {
    const id = detailId();
    if (!id) { if (mainBtn) mainBtn.style.display = 'none'; return; }
    if (!mainBtn) {
      mainBtn = document.createElement('button');
      mainBtn.id = 'zor-btn'; mainBtn.type = 'button';
      mainBtn.addEventListener('click', () => onRead(detailId()));
      document.documentElement.appendChild(mainBtn);
    }
    mainBtn.style.display = '';
    const ready = orders.has(id);
    mainBtn.textContent = ready ? 'Read order' : 'Order data not received - press F5';
    mainBtn.classList.toggle('zor-wait', !ready);
  }

  // The dashboard changes pages without reloading: keep the button right for the page shown.
  setInterval(refresh, 700);
  refresh();
})();
