// Turns a Zid order object (from the dashboard's own JSON) into a small, clean
// record, and checks the numbers. Pure functions: no page access, no network.
// Field names follow docs.zid.sa "View Order" (/v1/managers/store/orders/{id}/view).
(function (root) {
  // Arabic-Indic (٠-٩) and Persian (۰-۹) digits, Arabic decimal (٫) and thousands (٬) -> Latin
  const latin = (s) => String(s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, '.').replace(/[٬،]/g, ',');
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(latin(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const r2 = (n) => (n === null ? null : Math.round(n * 100) / 100);
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const name = (v) => (v && typeof v === 'object' ? txt(v.ar || v.en || v.name) : txt(v));
  const lang = (v, l) => (v && typeof v === 'object' ? txt(v[l]) : '');
  // Saudi mobile for Rewaa: 9 digits starting with 5 ("966512345678", "+966 51...", "0512..." -> "512345678").
  // Anything else (another country, too short) -> '' so nothing wrong is typed.
  const saMobile = (v) => {
    let d = latin(txt(v)).replace(/\D/g, '');
    d = d.replace(/^00/, '').replace(/^966/, '').replace(/^0/, '');
    return /^5\d{8}$/.test(d) ? d : '';
  };

  // Zid sends created_at in UTC ("2026-11-19 10:42:55"); the dashboard shows Saudi time (+3).
  function ksaTime(v) {
    const t = txt(v);
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return t;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  }

  function normalize(o) {
    const items = (o.products || []).map((p) => {
      const qty = num(p.quantity);
      const price = num(p.price ?? p.price_with_additions ?? p.gross_sale_price);
      return {
        name: name(p.name),
        nameAr: lang(p.name, 'ar'),   // only when Zid sends both languages
        nameEn: lang(p.name, 'en'),
        sku: txt(p.sku),
        barcode: txt(p.barcode),
        qty,
        unitPrice: r2(price),                          // price per piece, incl. VAT, as on the order page
        oldUnitPrice: r2(num(p.price_before)),         // struck-out price, if any
        lineTotal: r2(num(p.total)),                   // unit price x qty
        lineTotalAfterCoupon: r2(num(p.discounted_total)),
        couponPerUnit: r2(num(p.discounts && p.discounts.coupon && p.discounts.coupon.unit_amount)),
        options: (p.options || []).map((x) => `${name(x.name)}: ${name(x.value)}`).filter((s) => s !== ': '),
      };
    });
    // real dashboard data (hermod.zid.sa, Nov 2026): totals live in order.payment.invoice;
    // docs.zid.sa shows order.invoice - accept both
    const inv = (o.payment && Array.isArray(o.payment.invoice) && o.payment.invoice) || (Array.isArray(o.invoice) && o.invoice) || [];
    const totals = inv.map((t) => ({ code: txt(t.code), title: txt(t.title), value: r2(num(t.value)) }));
    const totalRow = totals.find((t) => t.code === 'total');
    const ship = o.shipping || {};
    const addr = ship.address || {};
    const pay = (o.payment && o.payment.method) || {};
    return {
      orderId: txt(o.id),
      code: txt(o.code),
      createdAt: txt(o.created_at),        // UTC, as Zid sends it
      createdAtKsa: ksaTime(o.created_at), // Saudi time, as the dashboard shows it
      status: txt(o.order_status && (o.order_status.code || o.order_status.name)), // code = same in AR and EN
      paymentStatus: txt(o.payment_status),
      paymentMethod: { name: txt(pay.name), code: txt(pay.code) },
      currency: txt(o.currency_code),
      customer: {
        name: txt(o.customer && o.customer.name),
        mobile: txt(o.customer && o.customer.mobile),
        mobileSa: saMobile(o.customer && o.customer.mobile), // for Rewaa (no 966)
        email: txt(o.customer && o.customer.email),
      },
      shipping: {
        method: txt(ship.method && ship.method.name),
        city: txt(addr.city && addr.city.name),
        address: txt(addr.formatted_address || addr.street),
      },
      coupon: o.coupon ? { code: txt(o.coupon.code), name: txt(o.coupon.name), discount: r2(num(o.coupon.discount)) } : null,
      coupons: (Array.isArray(o.coupons) && o.coupons.length ? o.coupons : (o.coupon ? [o.coupon] : []))
        .map((c) => ({ code: txt(c.code), name: txt(c.name), discount: r2(num(c.discount)), freeShipping: !!c.free_shipping })),
      items,
      totals,
      orderTotal: r2(num(o.order_total)),
      invoiceTotal: totalRow ? totalRow.value : null,
      productsSum: r2(num(o.products_sum_total ?? o.products_sum_total_string)),
    };
  }

  // Returns { errors: [...], warnings: [...] }. Any error = do not copy.
  function validate(rec, pageText) {
    const errors = [];
    const warnings = [];
    const near = (a, b, tol = 0.02) => a !== null && b !== null && Math.abs(a - b) <= tol;

    if (!rec.orderId) errors.push('Order number missing');
    if (!rec.items.length) errors.push('No products in the order');
    rec.items.forEach((it, i) => {
      const n = `Product ${i + 1}${it.name ? ` (${it.name})` : ''}`;
      if (!it.sku) errors.push(`${n}: SKU missing`);
      if (!(Number.isInteger(it.qty) && it.qty > 0)) errors.push(`${n}: quantity is not a whole number above 0`);
      if (it.unitPrice === null || it.unitPrice < 0) errors.push(`${n}: price missing`);
      if (it.lineTotal !== null && it.unitPrice !== null && Number.isInteger(it.qty) &&
          !near(it.unitPrice * it.qty, it.lineTotal, 0.05)) {
        warnings.push(`${n}: price x qty (${r2(it.unitPrice * it.qty)}) is not the line total (${it.lineTotal})`);
      }
    });
    if (rec.orderTotal === null) errors.push('Order total missing');
    if (rec.invoiceTotal === null) errors.push('Invoice total missing');
    if (rec.orderTotal !== null && rec.invoiceTotal !== null && !near(rec.orderTotal, rec.invoiceTotal)) {
      errors.push(`Order total ${rec.orderTotal} is not the invoice total ${rec.invoiceTotal}`);
    }
    const lines = rec.items.reduce((s, it) => s + (it.lineTotal || 0), 0);
    if (rec.productsSum !== null && !near(r2(lines), rec.productsSum, 0.05)) {
      warnings.push(`Sum of product lines (${r2(lines)}) is not Zid's products total (${rec.productsSum})`);
    }
    if (pageText !== undefined && rec.orderTotal !== null) {
      pageText = latin(pageText); // the Arabic dashboard may show ٣٢٦٫٣٧
      const shown = rec.orderTotal.toFixed(2);
      const withComma = Number(shown).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (!pageText.includes(shown) && !pageText.includes(withComma)) {
        errors.push(`The page does not show the total ${shown} - data and screen do not match`);
      }
    }
    if (rec.currency && rec.currency !== 'SAR') warnings.push(`Currency is ${rec.currency}, not SAR`);
    if (!rec.paymentMethod.name) warnings.push('Payment method missing');
    if (!rec.customer.name) warnings.push('Customer name missing');
    return { errors, warnings };
  }

  const api = { normalize, validate, latin, ksaTime, saMobile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZidOrderExtract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
