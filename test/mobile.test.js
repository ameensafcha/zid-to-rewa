// node test/mobile.test.js - Zid mobile -> Rewaa phone box (9 digits, starts with 5, no 966)
const assert = require('assert');
const { saMobile, normalize } = require('../extract.js');
const cases = [
  ['966512345678', '512345678'], ['+966512345678', '512345678'], ['00966512345678', '512345678'],
  ['0512345678', '512345678'], ['512345678', '512345678'], ['+966 51 234 5678', '512345678'],
  ['٩٦٦٥١٢٣٤٥٦٧٨', '512345678'], ['123456789', ''], ['971501234567', ''], ['', ''], [null, ''],
];
for (const [i, o] of cases) assert.strictEqual(saMobile(i), o, `${i} -> ${o}`);
assert.strictEqual(normalize({ customer: { mobile: '966512345678' }, products: [] }).customer.mobileSa, '512345678');
console.log(`ok - ${cases.length + 1} mobile cases`);
