// node test/no-own-requests.test.js - the extension never makes a network request of its own:
// hook.js only reads answers the page itself received, and no file calls fetch / XHR / sendBeacon.
const fs = require('fs'); const path = require('path'); const assert = require('assert');
const dir = path.join(__dirname, '..');
// 1. no file (other than hook.js wrapping the page's own fetch/XHR) starts a request
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
  if (f === 'hook.js') continue;
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\.src\s*=\s*['"`]https?:/.test(src), `${f} makes a request`);
}
// 2. hook.js: answers the old "fetch-order" message with nothing, and never calls fetch itself
const calls = []; let onMsg = null; const msgs = [];
global.location = { origin: 'https://dashboard.zid.sa', pathname: '/en-sa/stores/1/orders' };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.XMLHttpRequest = function () {}; Object.assign(XMLHttpRequest.prototype, { open() {}, send() {}, setRequestHeader() {} });
global.window = global;
window.postMessage = (m) => msgs.push(m);
window.addEventListener = (t, f) => { if (t === 'message') onMsg = f; };
window.fetch = async (url) => { calls.push(url); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
eval(fs.readFileSync(path.join(dir, 'hook.js'), 'utf8'));
assert.strictEqual(onMsg, null, 'hook.js listens for requests from the extension');
(async () => {
  await window.fetch('https://hermod.zid.sa/v1/managers/store/orders/1/view'); // the page's own call
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(calls.length, 1, 'hook.js made a request of its own');
  console.log('ok - the extension makes no request of its own');
})();
