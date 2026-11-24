// Side panel + settings. The order is kept in chrome.storage.session (memory only: it is
// gone when Chrome closes) so the side panel can show it on every tab.
const enableActionClick = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(enableActionClick);
chrome.runtime.onStartup.addListener(enableActionClick);
enableActionClick();
// the Rewaa content script (rewaa.js) reads the order from session storage too (memory only, our own scripts)
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});

// Is the panel open? panel.js keeps a port open while it is visible (and reconnects if this
// worker was put to sleep). When the panel closes:
//   - collapse (the panel's ⟩ button or Alt+Shift+Z) sets a 'collapsing' flag first -> order kept
//   - Chrome's X close (no flag) -> the order is cleared, so old data never shows again
const openWindows = new Set();
const COLLAPSE_MS = 4000;
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith('panel:')) return;
  const w = Number(port.name.slice(6));
  openWindows.add(w);
  port.onDisconnect.addListener(async () => {
    openWindows.delete(w);
    const { collapsing } = await chrome.storage.session.get('collapsing');
    if (collapsing && Date.now() - collapsing < COLLAPSE_MS) chrome.storage.session.remove('collapsing');
    else if (!openWindows.size) chrome.storage.session.remove(['current', 'collapsing']); // still open in another window: keep
  });
});
// Alt+Shift+Z: collapse / expand the panel (the toolbar icon also opens it)
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd !== 'toggle-panel' || !tab) return;
  if (openWindows.has(tab.windowId) && chrome.sidePanel.close) {
    chrome.storage.session.set({ collapsing: Date.now() })
      .then(() => chrome.sidePanel.close({ windowId: tab.windowId })).catch(() => {});
  } else chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m) return;
  // rewaa.js asks for the order (memory only; it never leaves the browser)
  if (m.type === 'get-order') { chrome.storage.session.get('current').then(({ current }) => reply({ current: current || null })); return true; }
  if (m.type === 'open-options') chrome.runtime.openOptionsPage();

  if (m.type === 'open-panel' && sender.tab) {
    // must run straight away, inside the user's click
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    chrome.storage.session.set({ current: { id: String(m.id), loading: true, at: Date.now() } });
  }

  if (m.type === 'show-order' && sender.tab) {
    chrome.storage.session.get('current').then(({ current }) => {
      // a late answer for an order the user has already moved away from (or closed) is dropped,
      // so an old order can never replace the one just asked for
      if (!current || String(current.id) !== String(m.payload.id)) return;
      chrome.storage.session.set({ current: { ...m.payload, loading: false, at: Date.now() } });
    });
  }

});

// tell open Rewaa tabs when the order changes, so their button shows the right order number
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'session' || !c.current) return;
  chrome.tabs.query({ url: 'https://platform.rewaatech.com/*' }).then((tabs) => tabs.forEach((t) =>
    chrome.tabs.sendMessage(t.id, { type: 'order-changed' }).catch(() => {}))).catch(() => {});
});
