// The list of fields the order window can show, and the user's choice of which ones.
// Shared by content.js (the window) and options.js (the settings page). No page access.
(function (root) {
  const g = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  const r2 = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };

  // v(rec, raw) for order fields; v(item, rawProduct) for product fields (shown once per product).
  // A getter may return a list of [label, value] pairs instead of one value.
  const FIELDS = [
    { k: 'order.code', g: 'Order', l: 'Order code', v: (r) => r.code },
    { k: 'order.statusCode', g: 'Order', l: 'Status code (same in AR/EN)', v: (r) => r.status },
    { k: 'order.source', g: 'Order', l: 'Source', v: (r, o) => o.source },
    { k: 'order.currency', g: 'Order', l: 'Currency', v: (r) => r.currency },
    { k: 'order.note', g: 'Order', l: 'Customer note', v: (r, o) => o.customer_note },

    { k: 'cust.name', g: 'Customer', l: 'Name', d: 1, v: (r) => r.customer.name },
    { k: 'cust.mobile', g: 'Customer', l: 'Mobile', d: 1, v: (r) => r.customer.mobile },
    { k: 'cust.mobileSa', g: 'Customer', l: 'Mobile for Rewaa (no 966)', d: 1, v: (r) => r.customer.mobileSa },
    { k: 'cust.email', g: 'Customer', l: 'Email', d: 1, v: (r) => r.customer.email },
    { k: 'cust.id', g: 'Customer', l: 'Customer id', v: (r, o) => g(o, 'customer.id') },
    { k: 'cust.country', g: 'Customer', l: 'Country', v: (r, o) => g(o, 'shipping.address.country.name') },
    { k: 'cust.city', g: 'Customer', l: 'City', d: 1, v: (r) => r.shipping.city },
    { k: 'cust.district', g: 'Customer', l: 'District', d: 1, v: (r, o) => g(o, 'shipping.address.district') },
    { k: 'cust.street', g: 'Customer', l: 'Street', v: (r, o) => g(o, 'shipping.address.street') },
    { k: 'cust.address', g: 'Customer', l: 'Full address', d: 1, v: (r) => r.shipping.address },
    { k: 'cust.short', g: 'Customer', l: 'Short address', v: (r, o) => g(o, 'shipping.address.short_address') },

    { k: 'ship.method', g: 'Shipping', l: 'Shipping company', d: 1, v: (r) => r.shipping.method },
    { k: 'ship.tracking', g: 'Shipping', l: 'Tracking number', v: (r, o) => g(o, 'shipping.method.tracking.number') },
    { k: 'ship.weight', g: 'Shipping', l: 'Weight (g)', v: (r, o) => o.weight },

    { k: 'pay.method', g: 'Payment', l: 'Payment method', d: 1, v: (r) => r.paymentMethod.name },
    { k: 'pay.status', g: 'Payment', l: 'Payment status', d: 1, v: (r) => r.paymentStatus },
    { k: 'pay.paid', g: 'Payment', l: 'Paid amount', v: (r, o) => r2(g(o, 'payment_summary.paid_amount')) },
    { k: 'pay.remaining', g: 'Payment', l: 'Remaining', v: (r, o) => r2(g(o, 'payment_summary.remaining_amount')) },
    { k: 'pay.coupons', g: 'Payment', l: 'Coupons', d: 1, v: (r) => r.coupons.flatMap((c, i) => {
      const n = r.coupons.length > 1 ? ` ${i + 1}` : '';
      // Zid repeats the order's coupon total on a free-shipping coupon too (seen in a real order, Nov 2026: the same
      // amount on both the 30% coupon and the free-shipping one), so that number is not this coupon's own amount
      const copied = c.freeShipping && r.coupons.some((o) => o !== c && !o.freeShipping && o.discount === c.discount);
      const amount = copied ? 'Free shipping (see Shipping discount in Totals)' : c.freeShipping ? `${c.discount} + free shipping` : c.discount;
      return [[`Coupon${n}`, c.code], [`Coupon${n} discount`, amount]];
    }) },

    { k: 'p.name', g: 'Product', l: 'Name', d: 1, p: 1, v: (it) => it.name },
    { k: 'p.nameAr', g: 'Product', l: 'Name (Arabic)', p: 1, v: (it) => it.nameAr },
    { k: 'p.nameEn', g: 'Product', l: 'Name (English)', p: 1, v: (it) => it.nameEn },
    { k: 'p.sku', g: 'Product', l: 'SKU', d: 1, p: 1, v: (it) => it.sku },
    { k: 'p.qty', g: 'Product', l: 'Quantity', d: 1, p: 1, v: (it) => it.qty },
    { k: 'p.price', g: 'Product', l: 'Price (1 piece)', d: 1, p: 1, v: (it) => it.unitPrice },
    { k: 'p.old', g: 'Product', l: 'Old price', p: 1, v: (it) => (it.oldUnitPrice !== it.unitPrice ? it.oldUnitPrice : null) },
    { k: 'p.total', g: 'Product', l: 'Line total', d: 1, p: 1, v: (it) => it.lineTotal },
    { k: 'p.afterCoupon', g: 'Product', l: 'Line total after coupon', p: 1, v: (it) => it.lineTotalAfterCoupon },
    { k: 'p.couponUnit', g: 'Product', l: 'Coupon per piece', p: 1, v: (it) => it.couponPerUnit },
    { k: 'p.barcode', g: 'Product', l: 'Barcode', p: 1, v: (it) => it.barcode },
    { k: 'p.options', g: 'Product', l: 'Options', d: 1, p: 1, v: (it) => it.options.join(', ') },

    { k: 't.invoice', g: 'Totals', l: 'Invoice lines (VAT, coupon, shipping...)', d: 1, v: (r) => r.totals.map((t) => [t.title || t.code, t.value]) },
    { k: 't.total', g: 'Totals', l: 'Order total', d: 1, v: (r) => r.orderTotal },
  ];
  // order number, date and status are always in the window's header, so they are not listed here
  const GROUPS = ['Product', 'Customer', 'Shipping', 'Payment', 'Totals', 'Order'];
  // lang: 'page' (default: Arabic dashboard -> Arabic data, English dashboard -> English data) | 'en' | 'ar'.
  // v: settings version (2 = lang default changed to 'page', 3 = 'Mobile for Rewaa' shown by default).
  const defaults = () => ({ v: 3, show: FIELDS.filter((f) => f.d).map((f) => f.k), extra: [], lang: 'page' });

  // every leaf of an order -> { path, label, value }; product fields become products.*.x
  const pretty = (k) => String(k).replace(/_/g, ' ').replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  function flat(v, path, label, out, depth) {
    if (v === null || v === undefined || v === '' || depth > 8) return out;
    if (Array.isArray(v)) { v.forEach((x, i) => flat(x, path.concat(i), `${label} ${i + 1}`, out, depth + 1)); return out; }
    if (typeof v === 'object') {
      for (const k of Object.keys(v)) flat(v[k], path.concat(k), label ? `${label} › ${pretty(k)}` : pretty(k), out, depth + 1);
      return out;
    }
    out.push({ path: path.join('.'), label, value: typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v) });
    return out;
  }
  const allFields = (raw) => {
    const top = { ...raw }; delete top.products;
    const out = flat(top, [], '', [], 0);
    const p0 = (raw.products || [])[0];
    if (p0) flat(p0, ['products', '*'], 'Product', [], 0).forEach((f) => out.push(f));
    return out;
  };

  const api = { FIELDS, GROUPS, defaults, get: g, allFields };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZidOrderFields = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
