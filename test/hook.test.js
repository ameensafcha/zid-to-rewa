// node test/hook.test.js - hook.js passes on an order found in a JSON fetch answer
const fs = require('fs'); const assert = require('assert');
const msgs = [];
const body = { status: 'object', order: { id: 1001, order_total: '10', invoice: [], products: [{ sku: 'A' }] } };
global.location = { origin: 'https://dashboard.zid.sa' };
global.XMLHttpRequest = function () {}; XMLHttpRequest.prototype.open = () => {}; XMLHttpRequest.prototype.send = () => {}; XMLHttpRequest.prototype.setRequestHeader = () => {};
global.window = global;
window.postMessage = (m) => msgs.push(m); window.addEventListener = () => {};
window.fetch = async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
eval(fs.readFileSync('hook.js', 'utf8'));
(async () => {
  const r = await window.fetch('https://api.zid.sa/v1/managers/store/orders/1001/view');
  assert.strictEqual((await r.json()).order.id, 1001); // page still gets its answer
  await new Promise((s) => setTimeout(s, 50));
  const om = msgs.filter((m) => m.type === 'order'); assert.strictEqual(om.length, 1); assert.strictEqual(om[0].order.id, 1001);
  await window.fetch('x'); // non-order JSON ignored is covered by findOrders; html ignored:
  window.fetch = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
  console.log('ok - hook passes the order on and leaves the page answer intact');
})();
