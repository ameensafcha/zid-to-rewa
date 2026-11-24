// Settings page: which fields the order window shows. Saved in chrome.storage.local.
(() => {
  const { FIELDS, GROUPS, defaults } = window.ZidOrderFields;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let settings = defaults();
  let known = [];

  const flash = () => { $('saved').classList.add('on'); clearTimeout(flash.t); flash.t = setTimeout(() => $('saved').classList.remove('on'), 1200); };
  const save = () => chrome.storage.local.set({ settings }).then(flash);

  function draw() {
    const on = new Set(settings.show);
    $('main').innerHTML = GROUPS.map((g) => `<section class="card"><h2>${g}${g === 'Product' ? ' (each product)' : ''}
        <button type="button" data-all="${g}">All</button><button type="button" data-none="${g}">None</button></h2>
      ${FIELDS.filter((f) => f.g === g).map((f) => `<label><input type="checkbox" data-k="${f.k}" ${on.has(f.k) ? 'checked' : ''}>${esc(f.l)}</label>`).join('')}
      </section>`).join('');
    const ex = new Set(settings.extra || []);
    $('extra').innerHTML = known.length
      ? known.map((f) => `<label data-s="${esc((f.label + ' ' + f.path).toLowerCase())}"><input type="checkbox" data-p="${esc(f.path)}" ${ex.has(f.path) ? 'checked' : ''}>${esc(f.label)}<span class="p">${esc(f.path)}</span></label>`).join('')
      : '<div class="empty">No order read yet. Open an order in the Zid dashboard, press "Read order", then come back.</div>';
    filter();
  }

  function filter() {
    const t = $('q').value.trim().toLowerCase();
    $('extra').querySelectorAll('label').forEach((l) => { l.style.display = !t || l.dataset.s.includes(t) ? '' : 'none'; });
  }

  document.addEventListener('change', (e) => {
    const k = e.target.dataset.k, p = e.target.dataset.p;
    if (k) {
      const s = new Set(settings.show);
      if (e.target.checked) s.add(k); else s.delete(k);
      settings = { ...settings, show: FIELDS.map((f) => f.k).filter((x) => s.has(x)) };
      save();
    }
    if (p) {
      const s = new Set(settings.extra || []);
      if (e.target.checked) s.add(p); else s.delete(p);
      settings = { ...settings, extra: [...s] };
      save();
    }
  });
  document.addEventListener('click', (e) => {
    const all = e.target.dataset.all, none = e.target.dataset.none;
    if (!all && !none) return;
    const g = all || none;
    const s = new Set(settings.show);
    FIELDS.filter((f) => f.g === g).forEach((f) => (all ? s.add(f.k) : s.delete(f.k)));
    settings = { ...settings, show: FIELDS.map((f) => f.k).filter((x) => s.has(x)) };
    save(); draw();
  });
  $('q').addEventListener('input', filter);
  const SAFE = /^(code|title|type|currency_code|payment_status|sku|status|source|source_code|is_[a-z_]+|has_[a-z_]+)$/;
  const MASK = /^(customer|consignee|address|shipping_address|receiver|gift_card_details|histories|images|marketing_source)$/;
  function shape(v, key, depth, masked) {
    if (depth > 7) return '…';
    if (Array.isArray(v)) return v.length ? [`len=${v.length}`, shape(v[0], key, depth + 1, masked)] : ['len=0'];
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = shape(v[k], k, depth + 1, masked || MASK.test(k)); return o; }
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return masked && typeof v === 'number' ? '<num>' : v;
    if (typeof v === 'string') return masked ? `<str ${v.length}>` : (SAFE.test(key) || /^-?[\d.,]+$/.test(v) ? v : `<str ${v.length}>`);
    return typeof v;
  }
  $('fmt').addEventListener('click', async () => {
    const { current } = await chrome.storage.session.get('current');
    if (!current || !current.raw) { $('fmtmsg').textContent = 'Open an order with Read order first'; return; }
    await navigator.clipboard.writeText(JSON.stringify({ lang: current.lang, order: shape(current.raw, '', 0, false) }, null, 1));
    $('fmtmsg').textContent = 'Copied (customer data hidden)';
  });
  $('reset').addEventListener('click', () => { settings = defaults(); save(); draw(); });

  chrome.storage.local.get(['settings', 'knownFields']).then((s) => {
    settings = { ...defaults(), ...(s.settings || {}) };
    known = s.knownFields || [];
    draw();
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.knownFields) { known = c.knownFields.newValue || []; draw(); }
  });
})();
