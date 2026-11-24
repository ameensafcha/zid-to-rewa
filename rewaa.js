// Rewaa sell screen (platform.rewaatech.com/<lang>/pos/v2/registers/<id>/sale):
// puts the Zid order read in the side panel into the cart, like a person would:
//   1. each product: type its SKU in the product search, click the result with that exact SKU, set the qty
//   1b. the Zid coupon/discount: one fixed SAR invoice discount (Rewaa's Discount number pad)
//   2. Customer: search the phone (no 966); found -> pick it, not found -> (+) new: name + phone -> Add
//   3. click Pay - and STOP. The payment method and the final pay are always the user's.
//
// NO GUESSING: every element is found by the data-qa attribute Rewaa's own code puts on it (read from
// Rewaa's JS bundles, 22 Nov 2026 - see NOTES.md "Rewaa page contract"). Before filling, and before each
// step, the elements that step needs must be there exactly once. If Rewaa changes its screen, a check
// fails and NOTHING is filled - it says which part changed. Every value typed is read back.
// It only clicks on this page. Nothing is sent anywhere by the extension itself.
(() => {
  if (window.__zorRewaa) return;
  window.__zorRewaa = true;
  const { normalize } = window.ZidOrderExtract;
  const SALE = /\/pos\/v2\/registers\/\d+\/sale/;
  const onSale = () => SALE.test(location.pathname);
  // the Rewaa build this was checked against; a newer build only shows a note (the checks still decide)
  const CHECKED_BUILD = 'main.b1a6c0797c3da2ee.js';

  // ---------- small DOM helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const textOf = (el) => norm(el && (el.innerText || el.textContent));
  const digits = (s) => String(s || '').replace(/[^\d]/g, '');
  const num = (s) => { const m = String(s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
  const qa = (k) => `[data-qa="${k}"]`;
  const all = (sel, root = document) => [...root.querySelectorAll(sel)].filter(vis);
  let stopped = false;
  class Stop extends Error {}
  class Changed extends Error {} // Rewaa's screen is not what this code was written for
  class Abort extends Error {}   // something else changed the page meanwhile: stop at once
  async function waitFor(fn, ms = 8000, what = 'the page') {
    const end = Date.now() + ms;
    for (;;) {
      if (stopped) throw new Stop('Stopped');
      let v = null;
      try { v = fn(); } catch (e) { if (e instanceof Changed || e instanceof Abort) throw e; v = null; }
      if (v) return v;
      if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
      await sleep(150);
    }
  }
  // exactly one visible element, or a "Rewaa changed" error naming it
  function one(sel, name, root = document) {
    const l = all(sel, root);
    if (l.length !== 1) throw new Changed(`${name} (${sel}) - found ${l.length}, expected 1`);
    return l[0];
  }
  // wait until exactly one is there (dialogs open with a small delay)
  const waitOne = (sel, name, ms = 6000, root = document) =>
    waitFor(() => (all(sel, root).length === 1 ? all(sel, root)[0] : null), ms, name)
      .catch((e) => { if (e instanceof Stop) throw e; throw new Changed(`${name} (${sel}) - found ${all(sel, root).length}, expected 1`); });

  // Angular reads a typed value through the native setter + an "input" event. Rewaa's customer form
  // only takes the value on "blur" (updateOn: 'blur'), the qty box on "change".
  const setNative = (el, v) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  // like a person: one key at a time, 70-170 ms apart (user, 22 Nov 2026: never fill like a bot)
  const rnd = (a, b) => a + Math.random() * (b - a);
  const human = () => sleep(rnd(450, 1100)); // the pause a person takes before the next click
  async function typeInto(el, v, { keyup = false, change = false, blur = false } = {}) {
    el.focus();
    const text = String(v);
    if (el.value) { setNative(el, ''); fire(el, 'input'); await sleep(rnd(120, 250)); }
    for (let i = 1; i <= text.length; i++) {
      if (stopped) throw new Stop('Stopped');
      const ch = text[i - 1];
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ch }));
      setNative(el, text.slice(0, i));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      if (keyup) el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch }));
      await sleep(rnd(70, 170));
    }
    if (change) fire(el, 'change');
    if (blur) { el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }
  }
  function click(el) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  }

  // ---------- the Rewaa page contract (data-qa values from Rewaa's own code) ----------
  const Q = {
    view: qa('cartView'),
    search: `${qa('cartSearch-autocompleteInput')} input`,          // p-autoComplete host -> its <input>
    results: `.cart-search-list li.p-autocomplete-item`,             // PrimeNG result rows of that search
    resultSku: qa('cartSearch-productSku'),
    resultName: qa('cartSearch-productName'),
    lineQty: qa('cartLineItems-productQuantityInput'),
    lineName: qa('cartLineItems-productName'),
    customerBtn: qa('cartActions-customerBtn'),
    payBtn: qa('cartView-payBtn'),
    // Customer dialog (rw-cart-select-customer-dialog)
    cust: qa('cartSelectCustomer'),
    custInput: `input${qa('cartSelectCustomer-customerInput')}`,
    custLoader: qa('cartSelectCustomer-loader'),
    custRow: qa('cartSelectCustomer-customerItemList'),
    custRowName: qa('cartSelectCustomer-customerName'),
    custRowMobile: qa('cartSelectCustomer-customerMobile'),
    custAdd: qa('cartSelectCustomer-btnAddCustomer'),
    // Add New Customer dialog (rw-cart-add-new-customer)
    form: qa('cartAddCustomer-form'),
    name: `input${qa('cartAddCustomer-nameInput')}`,
    phone: `rw-phone-number-input input[type="tel"]${qa('cartAddCustomer-phoneInput')}`,
    country: qa('cartAddCustomer-countryCodeDropdown'),
    code: `input${qa('cartAddCustomer-codeInput')}`,
    addBtn: `button${qa('cartAddCustomer-btnAdd')}`,
    // invoice discount (rw-cart-note-and-discount). Its window is rw-discount-tabs-dialog ("discountTabsDialog-*")
    // when Rewaa's promotions are on, else rw-discount-dialog ("discountDialog-*") - same number pad in both.
    discountBtn: qa('cartNoteAndDiscount-addDiscountBtn'),
    discountClear: qa('cartNoteAndDiscount-clearDiscountBtn'),
    discountField: `${qa('discountTabsDialog-discountInputField')}, ${qa('discountDialog-discountInputField')}`,
    // the payment window opened by Pay - the extension never clicks anything inside it
    payDlg: qa('paymentDialog'),
    payTotal: qa('paymentDialog-totalPrice'),
    payBadPhone: qa('paymentDialog-invalidKsaPhoneBanner'),
    // the OLD screens - if one of these shows, Rewaa switched this account back and the code stops
    oldScreen: `${qa('saleView')}, ${qa('selectCustomerModal')}, ${qa('addCustomer')}`,
  };
  // the sell screen itself; returns the list of problems (empty = OK)
  function screenCheck() {
    const bad = [];
    for (const [k, name] of [['view', 'Sell screen'], ['search', 'Product search box'], ['customerBtn', 'Customer button'], ['payBtn', 'Pay button']]) {
      const n = all(Q[k]).length;
      if (n !== 1) bad.push(`${name}: found ${n}, expected 1`);
    }
    if (all(Q.oldScreen).length) bad.push('An old Rewaa screen is showing (saleView / selectCustomerModal) - this code only knows the new one');
    const open = [['payDlg', 'payment'], ['cust', 'customer'], ['form', 'add customer'], ['discountField', 'discount']].filter(([k]) => all(Q[k]).length).map(([, n]) => n);
    if (open.length) bad.push(`A Rewaa window is already open (${open.join(', ')}) - close it first`);
    return bad;
  }
  const changedMsg = (what) => `Rewaa's screen has changed (${what}). Nothing more was filled - finish this sale by hand and tell the developer.`;

  // cart lines: name -> total qty (Rewaa shows no SKU on the line itself, only in its expanded details)
  function cartLines() {
    const m = new Map();
    for (const inp of all(Q.lineQty)) {
      const tr = inp.closest('tr');
      const nm = tr && textOf(tr.querySelector(Q.lineName));
      if (!nm) throw new Changed('a cart line without its product name');
      const q = num(inp.value);
      if (q === null) throw new Changed(`cart line "${nm}" with an unreadable quantity "${inp.value}"`);
      const e = m.get(nm) || { qty: 0, inputs: [] };
      e.qty += q; e.inputs.push(inp); m.set(nm, e);
    }
    return m;
  }
  const payTotal = () => { const n = textOf(document.querySelector(Q.payBtn)).replace(/,/g, '').match(/\d+(\.\d+)?/g) || []; return n.length > 1 ? Number(n[n.length - 1]) : null; };
  const payInfo = () => { const t = textOf(document.querySelector(Q.payBtn)).replace(/,/g, ''); const n = t.match(/[\d.]+/g) || []; return { text: t, items: n.length ? Number(n[0]) : null }; };

  // ---------- steps ----------
  async function addProduct(it, log) {
    const box = one(Q.search, 'Product search box');
    const before = cartLines();
    // the SKU first; the exact product name only when Zid has no SKU
    const tries = it.sku ? [['sku', it.sku]] : [it.nameEn, it.nameAr, it.name].filter((v, i, a) => v && a.indexOf(v) === i).map((v) => ['name', v]);
    let li = null;
    for (const [kind, q] of tries) {
      log(`Looking for ${kind === 'sku' ? 'SKU' : 'name'} "${q}" in Rewaa…`, 'info'); // the search takes a few seconds: show it is working
      await human();
      await typeInto(box, q);
      // Rewaa searches 500 ms after the last key; a result row must have EXACTLY this SKU (or name)
      const hits = await waitFor(() => {
        // someone typed into the box meanwhile (a real key press) -> never match on changed text
        if (box.value !== q) throw new Abort(`The product search box now shows "${box.value}", not "${q}" - something typed into it. Stopped`);
        const rows = all(Q.results).filter((r) => {
          const el = r.querySelector(kind === 'sku' ? Q.resultSku : Q.resultName);
          return el && textOf(el) === q;
        });
        return rows.length ? rows : null;
      }, 6000, `"${q}" in the product results`).catch((e) => { if (e instanceof Stop || e instanceof Changed || e instanceof Abort) throw e; return null; });
      if (hits && hits.length > 1) throw new Error(`${hits.length} products in Rewaa have the ${kind === 'sku' ? 'SKU' : 'name'} "${q}" - add it by hand`);
      if (hits) { li = hits[0]; break; }
    }
    if (!li) {
      const done = before.size ? ' The products before it are already in the cart.' : '';
      throw new Error(it.sku
        ? `Not found in Rewaa: ${it.sku} (${it.name}) - add this product in Rewaa with the same SKU, or add it by hand.${done}`
        : `Not found in Rewaa: "${it.name}" (Zid has no SKU, so it was searched by name) - give it the same SKU in Zid and Rewaa, or add it by hand.${done}`);
    }
    const price = num((li.querySelector('.fw-500.rw__fs-10') || {}).textContent);
    // click the product's name (never the "View Details" button in the same row)
    await human();
    click(li.querySelector(Q.resultName) || li);

    // exactly one product name in the cart must have gone up by 1 (a new line, or +1 on the same line)
    const grown = await waitFor(() => {
      const now = cartLines();
      const up = [...now].filter(([nm, e]) => e.qty > ((before.get(nm) || {}).qty || 0));
      return up.length ? up : null;
    }, 6000, 'the product to appear in the cart').catch((e) => {
      if (e instanceof Stop || e instanceof Changed) throw e;
      throw new Error(`${it.sku || it.name} did not appear in the cart - if Rewaa opened a window (serial / extras), finish it by hand`);
    });
    if (grown.length !== 1) throw new Error(`More than one cart line changed after adding ${it.sku} - check the cart by hand`);
    const [lineName, line] = grown[0];
    if (line.inputs.length !== 1) throw new Error(`"${lineName}" is on ${line.inputs.length} cart lines - set its quantity by hand`);
    const want = ((before.get(lineName) || {}).qty || 0) + it.qty;
    let inp = line.inputs[0];
    if (num(inp.value) !== want) {
      await human();
      await typeInto(inp, want, { change: true }); // onQuantityChange reads the box on "change"; never click it (opens a number pad)
      await waitFor(() => { const e = cartLines().get(lineName); return e && e.qty === want; }, 5000, `quantity ${want} for ${it.sku || it.name}`);
    }
    const warn = price !== null && it.unitPrice !== null && Math.abs(price - it.unitPrice) > 0.01 ? ` (Rewaa price ${price}, Zid price ${it.unitPrice})` : '';
    log(`${it.sku || it.name} x${it.qty} -> "${lineName}" qty ${want}${warn}`, warn ? 'warn' : 'ok');
  }

  // the Zid coupon/discount in money, VAT included: line total before minus after (products.*.discounted_total).
  // Seen in real data, Nov 2026: two lines 100 -> 70 and 50 -> 35 = a 45.00 discount.
  // null = Zid has a coupon but no per-product amounts (then it is added by hand)
  function zidDiscount(rec) {
    const known = rec.items.every((it) => it.lineTotal !== null && it.lineTotalAfterCoupon !== null);
    if (!known) return (rec.coupons || []).some((c) => !c.freeShipping) ? null : 0;
    const d = rec.items.reduce((a, it) => a + (it.lineTotal - it.lineTotalAfterCoupon), 0);
    return Math.round(d * 100) / 100;
  }

  // the Zid discount as ONE fixed SAR invoice discount, typed on Rewaa's own number pad like a cashier
  async function setDiscount(rec, log) {
    const d = zidDiscount(rec);
    if (d === null) { log('Zid has a coupon but no per-product amounts - add the discount in Rewaa by hand', 'warn'); return; }
    if (d <= 0) return;
    if (all(Q.discountClear).length) throw new Error(`The Rewaa cart already has a discount - check it by hand (the Zid discount is ${d.toFixed(2)} SAR)`);
    const before = payTotal();
    if (before === null) throw new Changed('the total on the Pay button cannot be read');
    if (d > before) throw new Error(`The Zid discount ${d.toFixed(2)} is more than the Rewaa total ${before} - check the cart by hand`);
    const dBtn = one(Q.discountBtn, 'Discount button');
    if (dBtn.disabled) throw new Error(`Rewaa's Discount button is disabled (a discount row may already be open) - add ${d.toFixed(2)} SAR by hand`);
    await human();
    click(dBtn);
    const P = await waitFor(() => ['discountTabsDialog', 'discountDialog'].find((p) => all(qa(`${p}-discountInputField`)).length === 1), 8000, 'the Discount window')
      .catch((e) => { if (e instanceof Stop) throw e; throw new Changed('the Discount window (discountDialog / discountTabsDialog) did not open'); });
    const k = (n) => qa(`${P}-${n}`);
    const field = one(k('discountInputField'), 'discount amount box');
    const close = () => { const x = all(`${k('close')}, ${k('cancelBtn')}`)[0]; if (x) click(x); };
    try {
      // fixed SAR, never %: the selector's active option must not be "%"
      const sel = one(k('discountTypeSelector'), 'discount type (% / SR) switch');
      const opts = [...sel.querySelectorAll('.p-button')].filter(vis);
      if (opts.length !== 2) throw new Changed(`discount type switch has ${opts.length} options, expected 2`);
      const fixed = opts.find((o) => textOf(o) !== '%');
      if (!fixed.classList.contains('p-highlight')) { await human(); click(fixed); await waitFor(() => fixed.classList.contains('p-highlight'), 3000, 'the SR (fixed) discount type'); }
      if (num(field.value) !== 0) { click(one(k('numPadReset'), 'number pad reset')); await waitFor(() => num(field.value) === 0, 3000, 'the discount box to clear'); }
      // the pad shifts in from the right: 9,7,2,0 -> 97.20 (Rewaa's applyLeftShift)
      for (const ch of String(Math.round(d * 100))) {
        await sleep(rnd(220, 480));
        const key = ch === '0' ? one(k('numPad0'), 'number pad 0') : all(k('numPad')).find((b) => textOf(b) === ch);
        if (!key) throw new Changed(`number pad key ${ch}`);
        click(key);
      }
      await waitFor(() => num(field.value) === d, 3000, `the discount box to show ${d.toFixed(2)}`)
        .catch((e) => { if (e instanceof Stop) throw e; throw new Error(`The discount box shows "${field.value}", not ${d.toFixed(2)}`); });
      const ok = one(k('numPadOk'), 'number pad OK (tick)');
      if (ok.disabled) throw new Error(`Rewaa does not allow a ${d.toFixed(2)} SAR discount here (discount limit or price below cost) - add it by hand`);
      await human();
      click(ok);
      await waitFor(() => !all(k('discountInputField')).length, 6000, 'the Discount window to close');
    } catch (e) { close(); throw e; }
    const want = Math.round((before - d) * 100) / 100;
    await waitFor(() => { const t = payTotal(); return t !== null && Math.abs(t - want) < 0.011; }, 6000, 'the new total')
      .catch((e) => { if (e instanceof Stop) throw e; throw new Error(`After the discount the Rewaa total is ${payTotal()}, expected ${want} - check the discount by hand`); });
    log(`Zid discount ${d.toFixed(2)} SAR added in Rewaa (total ${before} -> ${want})`, 'ok');
  }

  // the stored mobile is shown as e.g. +966512345678: only these exact forms count as the same phone
  const samePhone = (shown, phone) => ['', '0', '966', '00966'].some((p) => digits(shown) === p + phone);

  async function setCustomer(rec, log) {
    const phone = rec.customer.mobileSa;
    if (!phone) {
      throw new Error(rec.customer.mobile
        ? `Mobile "${rec.customer.mobile}" is not a Saudi number (5xxxxxxxx) - choose the customer by hand`
        : 'The Zid order has no mobile number - choose the customer by hand');
    }
    await human();
    click(one(Q.customerBtn, 'Customer button'));
    const dlg = await waitOne(Q.cust, 'Customer window', 8000);
    if (all(Q.oldScreen).length) throw new Changed('the old customer window opened');
    const sb = await waitOne(Q.custInput, 'customer search box', 8000, dlg);
    await human();
    await typeInto(sb, phone, { keyup: true }); // Rewaa searches on keyup, 500 ms later
    if (sb.value !== phone) throw new Error(`The customer search box shows "${sb.value}", not ${phone}`);
    // wait for that search to run and finish (its spinner comes and goes)
    const t0 = Date.now();
    await waitFor(() => Date.now() - t0 > 1200 && !all(Q.custLoader, dlg).length, 10000, 'the customer search');
    const rows = all(Q.custRow, dlg).filter((r) => samePhone(textOf(r.querySelector(Q.custRowMobile)), phone));
    if (rows.length > 1) throw new Error(`${rows.length} customers in Rewaa have the phone ${phone} - choose one by hand`);

    if (rows.length === 1) {
      const nm = textOf(rows[0].querySelector(Q.custRowName));
      await human();
      click(one(Q.custRowName, 'customer name in the result', rows[0]));
      await waitFor(() => !dlg.isConnected || !vis(dlg), 6000, 'the customer to be chosen');
      log(`Existing customer: ${nm} (${phone})`, 'ok');
      return;
    }
    // not found -> (+) Add New Customer
    await human();
    click(one(Q.custAdd, '(+) Add customer button', dlg));
    const form = await waitOne(Q.form, 'Add New Customer form', 8000);
    const nameIn = one(Q.name, 'customer name box', form);
    const tel = one(Q.phone, 'customer phone box', form);
    const country = one(Q.country, 'country code picker', form);
    // the phone box is cleared once Rewaa has loaded its country list, so wait for +966 first
    await waitFor(() => /\+\s*966\b/.test(textOf(country)), 8000, 'the +966 country code').catch((e) => {
      if (e instanceof Stop) throw e;
      throw new Error(`The phone country is "${textOf(country) || 'empty'}", not +966 - add the customer by hand`);
    });
    // no name in Zid: never "Customer" - that is Rewaa's own label for "no customer chosen"
    const name = norm(rec.customer.name) || `Zid customer ${phone}`;
    await human();
    await typeInto(nameIn, name, { blur: true });
    await human();
    await typeInto(tel, phone, { blur: true });
    await sleep(400);
    if (nameIn.value !== name) throw new Error(`The name box shows "${nameIn.value}", not "${name}"`);
    if (tel.value !== phone) throw new Error(`The phone box shows "${tel.value}", not ${phone}`);
    const phoneErr = form.querySelector('rw-phone-number-input .p-error');
    if (phoneErr && vis(phoneErr)) throw new Error(`Rewaa says about the phone: ${textOf(phoneErr)}`);
    await waitFor(() => one(Q.code, 'customer code box', form).value, 6000, 'Rewaa to make the customer code');
    const add = one(Q.addBtn, 'Add button', form);
    await human();
    click(add);
    await waitFor(() => !form.isConnected || !vis(form), 10000, 'Rewaa to save the customer').catch((e) => {
      if (e instanceof Stop) throw e;
      const err = [...form.querySelectorAll('rw-input-error, .p-error')].filter(vis).map(textOf).join(' / ');
      throw new Error(`Rewaa did not save the customer${err ? `: ${err}` : ''} - check the form`);
    });
    await waitFor(() => !all(Q.cust).length, 6000, 'the customer window to close');
    log(`New customer added: ${name} ${phone}`, 'ok');
  }

  async function openPay(rec, log) {
    const b = one(Q.payBtn, 'Pay button');
    if (all(Q.payDlg).length) throw new Error('A payment window is already open - close it and check the cart');
    await waitFor(() => !b.disabled, 4000, 'the Pay button').catch((e) => {
      if (e instanceof Stop) throw e;
      throw new Error('Rewaa keeps Pay disabled - check the cart (not enough stock in Rewaa, or a red line). Products and customer are filled');
    });
    await human();
    click(b);
    const dlg = await waitOne(Q.payDlg, 'payment window', 8000);
    const total = num(textOf(dlg.querySelector(Q.payTotal)));
    if (rec.orderTotal !== null && total !== null && Math.abs(total - rec.orderTotal) > 0.01) {
      log(`Rewaa total ${total} vs Zid order total ${rec.orderTotal} (shipping / coupon are not added by this)`, 'warn');
    }
    if (all(Q.payBadPhone, dlg).length) log('Rewaa says the customer phone is not a valid KSA number - check it', 'warn');
    log('Pay opened - choose the payment method and finish the sale yourself', 'ok');
  }

  // the three steps, in order (run() asks first)
  async function fill(rec, log) {
    for (const it of rec.items) await addProduct(it, log);
    await setDiscount(rec, log);
    await setCustomer(rec, log);
    await openPay(rec, log);
  }

  // ---------- run ----------
  let running = false;
  async function run(current) {
    if (running || ui.fab.disabled) return;
    const rec = current && current.raw ? normalize(current.raw) : null;
    if (!rec) return ui.msg('No Zid order in the side panel. Read an order on the Zid dashboard first.', 'err');
    if (current.checks && current.checks.errors && current.checks.errors.length) return ui.msg('This order failed its checks in the side panel - fix that first.', 'err');
    if (!onSale()) return ui.msg('Open the Rewaa Sell Screen first.', 'err');
    const bad = screenCheck();
    if (bad.length) return ui.msg(bad.some((b) => b.startsWith('A Rewaa window')) ? bad.join('; ') : changedMsg(bad.join('; ')), 'err');
    const build = [...document.scripts].map((s) => (s.src.match(/main\.[0-9a-f]+\.js/) || [])[0]).find(Boolean);
    const buildNote = build && build !== CHECKED_BUILD ? `\n\nNote: Rewaa was updated since this was tested (${build}). The screen checks passed; each step is checked again.` : '';
    const pi = payInfo();
    const disc = zidDiscount(rec);
    const list = rec.items.map((it) => `${it.qty} x ${it.sku || it.name}`).join('\n') +
      (disc ? `\n\nDiscount (Zid coupon): ${disc.toFixed(2)} SAR` : disc === null ? '\n\nZid coupon: add the discount by hand' : '');
    const cartNote = pi.items ? `\n\nThe cart already has ${pi.items} item(s) - they stay in the sale.` : '';
    const ok = await ui.confirm(`Fill order #${rec.orderId} into this sale?\n\n${list}\n\nCustomer: ${rec.customer.name || '-'} ${rec.customer.mobileSa || rec.customer.mobile || ''}\n\nIt stops when the Pay window opens.${cartNote}${buildNote}`);
    if (!ok) return;
    running = true; stopped = false;
    ui.start();
    const log = (t, k) => ui.line(t, k);
    try {
      await fill(rec, log);
      ui.done(true);
    } catch (e) {
      log(e instanceof Stop ? 'You pressed Stop - nothing more was clicked' : e instanceof Changed ? changedMsg(e.message) : `Stopped: ${e.message}`, 'err');
      ui.done(false);
    } finally { running = false; }
  }
  // the order comes from the background (content scripts may not read storage.session directly)
  // after the extension is reloaded, this old copy of the script throws "Extension context invalidated"
  // straight away (not as a rejected promise): catch it and hide the old button until the tab is refreshed
  const getCurrent = async () => {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'get-order' });
      return (r && r.current) || null;
    } catch (e) {
      if (!(chrome.runtime && chrome.runtime.id)) ui.host.style.display = 'none';
      return null;
    }
  };

  // ---------- UI (Shadow DOM so Rewaa's CSS cannot touch it) ----------
  const ui = (() => {
    const host = document.createElement('div');
    host.id = 'zor-rewaa';
    host.dir = 'ltr'; // our text is English: on Rewaa's Arabic (RTL) screen it must not flip ("?Fill order")
    host.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483646;display:none';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
      *{box-sizing:border-box;font:13px/1.4 system-ui,"Segoe UI",Tahoma,sans-serif}
      .fab{display:flex;align-items:center;gap:8px;padding:10px 16px;border:0;border-radius:99px;background:#14532d;color:#fff;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}
      .fab:hover{background:#166534}.fab:disabled{opacity:.6;cursor:wait}
      .box{width:min(380px,92vw);max-height:60vh;overflow:auto;margin-bottom:8px;padding:12px;border-radius:12px;background:#fff;color:#1f2937;box-shadow:0 10px 30px rgba(0,0,0,.25);display:none}
      .box.on{display:block}.box pre{margin:0 0 10px;white-space:pre-wrap;font:inherit}
      .row{display:flex;gap:8px;justify-content:flex-end}
      .row button{padding:7px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-weight:600}
      .row .go{background:#14532d;border-color:#14532d;color:#fff}
      .l{padding:3px 0}.info{color:#6b7280;font-size:12px}.ok::before{content:"✓ ";color:#15803d}.warn{color:#92400e}.warn::before{content:"! "}.err{color:#b91c1c}.err::before{content:"✗ "}
      .run::before{content:"";display:inline-block;width:11px;height:11px;margin-right:6px;vertical-align:-1px;border:2px solid #cbd5cb;border-top-color:#14532d;border-radius:50%;animation:s .7s linear infinite}
      @keyframes s{to{transform:rotate(360deg)}}
    </style><div class="box" id="box"></div><button class="fab" id="fab" type="button">Fill Zid order</button>`;
    const box = sh.getElementById('box'); const fab = sh.getElementById('fab');
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let lines = [];
    const show = (html) => { host.style.display = 'block'; box.innerHTML = html; box.classList.add('on'); };
    const draw = (busy) => show(`${lines.map((x) => `<div class="l ${x.k}">${esc(x.t)}</div>`).join('')}${busy ? '<div class="l run">Working…</div>' : ''}
      <div class="row">${busy ? '<button type="button" id="stop">Stop</button>' : '<button type="button" id="x">Close</button>'}</div>`);
    box.addEventListener('click', (e) => {
      if (e.target.id === 'stop') stopped = true;
      if (e.target.id === 'x') box.classList.remove('on');
    });
    fab.onclick = async () => run(await getCurrent());
    document.documentElement.appendChild(host);
    return {
      host, fab,
      msg: (t, k) => { lines = [{ t, k }]; draw(false); },
      confirm: (t) => new Promise((res) => {
        fab.disabled = true;
        const end = (v) => { fab.disabled = false; res(v); };
        show(`<pre>${esc(t)}</pre><div class="row"><button type="button" id="no">Cancel</button><button type="button" class="go" id="yes">Fill</button></div>`);
        sh.getElementById('no').onclick = () => { box.classList.remove('on'); end(false); };
        sh.getElementById('yes').onclick = () => end(true);
      }),
      start: () => { lines = []; fab.disabled = true; draw(true); },
      line: (t, k) => { lines.push({ t, k }); draw(true); },
      done: () => { fab.disabled = false; draw(false); },
    };
  })();

  // show the button only on the sell screen AND when an order was read on Zid - no order = nothing shown
  // (Rewaa is a single-page app: watch the URL). A fill already running stays visible.
  async function refresh() {
    const cur = await getCurrent();
    const id = cur && cur.raw ? normalize(cur.raw).orderId : '';
    ui.host.style.display = onSale() && (id || running) ? 'block' : 'none';
    if (!running && id) ui.fab.textContent = `Fill Zid order #${id}`;
  }
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; refresh(); } }, 800);
  refresh();

  // the side panel's "Fill in Rewaa" button
  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m && m.type === 'order-changed') { refresh(); return; }
    if (!m || m.type !== 'rewaa-fill') return;
    if (!onSale()) { reply({ ok: false, error: 'This Rewaa tab is not on the Sell Screen' }); return; }
    reply({ ok: true });
    (m.current ? Promise.resolve(m.current) : getCurrent()).then(run);
  });
})();
