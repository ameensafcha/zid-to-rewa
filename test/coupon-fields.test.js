// node test/coupon-fields.test.js - the Coupons rows in the side panel (made-up numbers, no customer data)
const assert = require('assert');
const { FIELDS } = require('../fields.js');
const f = FIELDS.find((x) => x.k === 'pay.coupons');
// Zid sends the order's coupon total on the free-shipping coupon too
const two = { coupons: [{ code: 'A30', discount: -84.52, freeShipping: false }, { code: 'SHIP', discount: -84.52, freeShipping: true }] };
assert.deepStrictEqual(f.v(two), [['Coupon 1', 'A30'], ['Coupon 1 discount', -84.52], ['Coupon 2', 'SHIP'], ['Coupon 2 discount', 'Free shipping (see Shipping discount in Totals)']]);
const one = { coupons: [{ code: 'SHIP', discount: -10, freeShipping: true }] };
assert.deepStrictEqual(f.v(one), [['Coupon', 'SHIP'], ['Coupon discount', '-10 + free shipping']]);
const plain = { coupons: [{ code: 'X', discount: -5, freeShipping: false }] };
assert.deepStrictEqual(f.v(plain), [['Coupon', 'X'], ['Coupon discount', -5]]);
console.log('coupon fields: 3 ok');
