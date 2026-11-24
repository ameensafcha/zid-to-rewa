// node test/extract.test.js  - checks normalize/validate on made-up orders
// shaped like docs.zid.sa "View Order". No real customer data.
const assert = require('assert');
const { normalize, validate } = require('../extract.js');

const base = () => ({
  id: 1001, code: 'TEST1', created_at: '2026-11-19 10:00:00',
  order_status: { code: 'preparing', name: 'Preparing' }, payment_status: 'paid',
  currency_code: 'SAR', order_total: '326.37000000',
  customer: { name: 'test customer', mobile: '123456789', email: 'testing@mail.com' },
  payment: { method: { name: 'Apple Pay (mada)', code: 'zid_pay' } },
  shipping: { method: { name: 'Aramex' }, address: { formatted_address: 'Test Street', city: { name: 'Riyadh' } } },
  coupon: { code: 'TEST50', name: 'test coupon', discount: '-107.5' },
  invoice: [
    { code: 'sub_totals_before_vat', value: '391.30', title: 'Total without VAT' },
    { code: 'coupon', value: '-107.50', title: 'Coupon' },
    { code: 'vat', value: '42.57', title: 'VAT (%15)' },
    { code: 'total', value: '326.37000000', title: 'Total' },
  ],
  products_sum_total_string: '450.00 SAR',
  products: [{
    name: 'Test Product', sku: 'T-001', quantity: 2, price: 225, price_before: 250,
    total: 450, discounted_total: 342.5, discounts: { coupon: { unit_amount: 53.75 } }, options: [],
  }],
});

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };

t('good order: no errors, numbers read', () => {
  const rec = normalize(base());
  const v = validate(rec, 'Total 326.37 SAR');
  assert.deepStrictEqual(v.errors, []);
  assert.strictEqual(rec.items[0].qty, 2);
  assert.strictEqual(rec.items[0].unitPrice, 225);
  assert.strictEqual(rec.items[0].lineTotal, 450);
  assert.strictEqual(rec.orderTotal, 326.37);
  assert.strictEqual(rec.productsSum, 450);
  assert.strictEqual(rec.paymentMethod.name, 'Apple Pay (mada)');
});

t('screen shows a different total -> error', () => {
  const v = validate(normalize(base()), 'Total 999.00 SAR');
  assert.ok(v.errors.some((e) => /does not show the total/.test(e)));
});

t('invoice total differs from order total -> error', () => {
  const o = base(); o.invoice[3].value = '300.00';
  const v = validate(normalize(o), 'Total 326.37');
  assert.ok(v.errors.some((e) => /not the invoice total/.test(e)));
});

t('missing SKU -> error', () => {
  const o = base(); o.products[0].sku = '';
  assert.ok(validate(normalize(o)).errors.some((e) => /SKU missing/.test(e)));
});

t('half quantity -> error', () => {
  const o = base(); o.products[0].quantity = 1.5;
  assert.ok(validate(normalize(o)).errors.some((e) => /quantity/.test(e)));
});

t('no products -> error', () => {
  const o = base(); o.products = [];
  assert.ok(validate(normalize(o)).errors.some((e) => /No products/.test(e)));
});

t('price x qty not line total -> warning only', () => {
  const o = base(); o.products[0].total = 400;
  const v = validate(normalize(o), 'Total 326.37');
  assert.deepStrictEqual(v.errors, []);
  assert.ok(v.warnings.some((w) => /price x qty/.test(w)));
});

t('big total with thousands comma on screen is accepted', () => {
  const o = base(); o.order_total = '6954.64'; o.invoice[3].value = '6954.64';
  assert.deepStrictEqual(validate(normalize(o), 'Total 6,954.64 SAR').errors, []);
});

t('Arabic name object and comma string numbers', () => {
  const o = base(); o.products[0].name = { ar: 'طقم', en: 'Set' }; o.products_sum_total_string = '1,450.00 ج.م';
  const rec = normalize(o);
  assert.strictEqual(rec.items[0].name, 'طقم');
  assert.strictEqual(rec.productsSum, 1450);
});

t('real dashboard shape: invoice under payment, long decimals', () => {
  const o = base(); const inv = o.invoice; delete o.invoice;
  o.payment.invoice = inv.map((r) => ({ ...r }));
  o.payment.invoice[3].value = '326.37499766764000'; o.order_total = '326.37499766764000';
  o.coupons = [{ code: 'A', discount: '-107.5000' }, { code: 'SHIP', discount: '-22.5', free_shipping: true }];
  const rec = normalize(o);
  assert.strictEqual(rec.invoiceTotal, 326.37);
  assert.strictEqual(rec.coupons.length, 2);
  assert.deepStrictEqual(validate(rec, 'Total 326.37').errors, []);
});

t('Arabic dashboard: Arabic digits on screen and in values', () => {
  const o = base(); o.order_total = '٣٢٦٫٣٧'; o.invoice[3].value = '326.37';
  const rec = normalize(o);
  assert.strictEqual(rec.orderTotal, 326.37);
  assert.deepStrictEqual(validate(rec, 'الإجمالي ٣٢٦٫٣٧ ر.س').errors, []);
  assert.deepStrictEqual(validate(rec, 'الإجمالي 326.37 ر.س').errors, []);
  assert.ok(validate(rec, 'الإجمالي ٩٩٩٫٠٠').errors.some((e) => /does not show the total/.test(e)));
});

t('product name in both languages', () => {
  const o = base(); o.products[0].name = { ar: 'منتج تجريبي', en: 'Test Product' };
  const it = normalize(o).items[0];
  assert.strictEqual(it.nameAr, 'منتج تجريبي'); assert.strictEqual(it.nameEn, 'Test Product');
});

t('Arabic big total with Arabic thousands mark', () => {
  const o = base(); o.order_total = '6954.64'; o.invoice[3].value = '6954.64';
  assert.deepStrictEqual(validate(normalize(o), 'المجموع ٦٬٩٥٤٫٦٤').errors, []);
});

console.log(`\n${pass} tests passed`);
