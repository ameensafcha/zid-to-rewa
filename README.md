# Zid Order Reader (for Rewaa)

A Chrome extension (Manifest V3) that moves one order from the **Zid** dashboard to the **Rewaa** POS
sell screen.

1. Open an order in the Zid dashboard and press **Read order**. The order opens in Chrome's side panel,
   and its numbers are checked first.
2. Open the Rewaa sell screen and press **Fill Zid order**. It adds the products, quantities, the coupon
   discount and the customer, then **stops when the Pay window opens**. You choose how the customer pays
   and you finish the sale yourself.

## Privacy and safety

- **The extension never sends a request of its own**, to Zid, Rewaa or anywhere else.
  - On Zid, it reads only the answer the dashboard page has already received.
  - On Rewaa, it only types and clicks on the screen, at a person's pace.
  - `test/no-own-requests.test.js` proves this.
- It does not read or keep login tokens or request headers.
- The order is kept in memory only (`chrome.storage.session`). It is gone when Chrome closes.
- Rewaa elements are found by their `data-qa` attributes.
  - Before each step, the elements that step needs must be there exactly once. If Rewaa changes its
    screen, nothing is filled, and the extension says which part changed.
  - Every value typed is read back to check it.

## Install

1. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. After an update, press **Reload** on the extension, then refresh the Zid and Rewaa tabs.

## Tests

```
node test/extract.test.js
node test/coupon-fields.test.js
node test/hook.test.js
node test/mobile.test.js
node test/no-own-requests.test.js
```
