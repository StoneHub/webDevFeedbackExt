(function() {
  'use strict';
  const { buildClipboardText, canInjectIntoUrl, detectSourceKind, frameAccessPattern, makeStorageKey, prepareExportHistories, safeShareUrl, sanitizeFeedbackItems, SHORTCUT_LABEL, MAC_SHORTCUT_LABEL } = DevFeedbackShared;
  let tab;
  let state = {};
  let frameAccess = [];
  let storageKey = '';
  let pageItems = [];
  const pick = document.getElementById('primary-action-btn');
  const warning = document.getElementById('warning');
  function showError(message) { warning.textContent = message; warning.hidden = !message; }
  // Embedded frames from other sites (an artifact iframe, a preview pane) need the user's one-time OK.
  async function missingFrameAccess() {
    const frames = await chrome.scripting.executeScript({
      target:{tabId:tab.id, allFrames:true},
      func:() => ({url:location.href, frames:[...document.querySelectorAll('iframe[src],frame[src]')].map(frame => frame.src)})
    }).catch(() => []);
    const patterns = [...new Set(frames.flatMap(({result}) => (result?.frames || []).map(src => frameAccessPattern(src, result.url))).filter(Boolean))];
    const granted = await Promise.all(patterns.map(origin => chrome.permissions.contains({origins:[origin]})));
    return patterns.filter((origin, index) => !granted[index]);
  }
  // This page's captures, oldest first, the same order the clipboard uses.
  function renderList(items) {
    const page = safeShareUrl(tab.url);
    pageItems = sanitizeFeedbackItems(items).filter(item => safeShareUrl(item.pageUrl) === page);
    document.getElementById('captures').hidden = !pageItems.length;
    document.getElementById('item-count').textContent = pageItems.length;
    document.getElementById('capture-list').replaceChildren(...pageItems.map(item => {
      const row = document.createElement('li');
      const text = document.createElement('div');
      const locator = document.createElement('code');
      locator.textContent = item.selector || 'Region capture';
      locator.title = locator.textContent;
      const note = document.createElement('span');
      note.textContent = item.note.trim() || 'No note';
      note.className = item.note.trim() ? '' : 'empty';
      text.append(locator, note);
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${locator.textContent}`);
      remove.addEventListener('click', async () => {
        const result = await chrome.runtime.sendMessage({action:'delete-feedback-items', storageKey, itemIds:[item.id]});
        if (!result?.ok) { showError(result?.reason || 'Could not delete.'); return; }
        renderList(result.items);
      });
      row.append(text, remove);
      return row;
    }));
  }
  function download(extension, text, type) {
    const host = (() => { try { return new URL(tab.url).hostname || 'file'; } catch { return 'page'; } })();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], {type}));
    link.download = `dev-feedback-${host}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  async function init() {
    document.getElementById('shortcut-label').textContent = navigator.platform.toLowerCase().includes('mac') ? MAC_SHORTCUT_LABEL : SHORTCUT_LABEL;
    [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    // Browser-internal pages hide their URL from the extension, so there is no list to show.
    if (tab?.url) {
      storageKey = makeStorageKey(tab.url);
      renderList((await chrome.storage.local.get(storageKey))[storageKey] || []);
    }
    if (!tab?.id || !canInjectIntoUrl(tab.url) || detectSourceKind(tab.url) === 'pdf') {
      showError('Open a webpage to pick an element. PDF and browser-internal pages are not supported.');
      return;
    }
    state = await chrome.tabs.sendMessage(tab.id, {action:'get-state'}, {frameId:0}).catch(()=>({}));
    frameAccess = await missingFrameAccess();
    if (frameAccess.length) {
      const note = document.getElementById('frame-access');
      note.textContent = `Part of this page is embedded from ${frameAccess.map(origin => new URL(origin.replace('*.', '')).hostname).join(', ')}. Chrome will ask once to let you pick inside it.`;
      note.hidden = false;
    }
    pick.textContent = state.editorOpen ? 'Return to open note' : state.feedbackMode ? 'Stop picking' : 'Pick an element';
    pick.disabled = false;
  }
  pick.addEventListener('click', async () => {
    showError('');
    if (state.editorOpen) { window.close(); return; }
    pick.disabled = true;
    const enabled = !state.feedbackMode;
    // Both calls start inside the click: Chrome needs the gesture for the permission prompt,
    // and the prompt may close this popup, so the background finishes the frame setup on grant.
    const started = chrome.runtime.sendMessage({action:'set-picking', tabId:tab.id, enabled});
    if (enabled && frameAccess.length) await chrome.permissions.request({origins:frameAccess}).catch(() => false);
    try {
      const result = await started;
      if (!result?.ok) throw new Error(result?.reason || 'Could not start picking on this page.');
      window.close();
    } catch (error) { showError(error.message); pick.disabled = false; }
  });
  document.getElementById('copy-btn').addEventListener('click', async event => {
    const button = event.currentTarget;
    await navigator.clipboard.writeText(buildClipboardText(pageItems));
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy all'; }, 1500);
  });
  document.getElementById('markdown-btn').addEventListener('click', () => download('md', buildClipboardText(pageItems), 'text/markdown'));
  // Same payload the local MCP companion imports from its Downloads inbox.
  document.getElementById('json-btn').addEventListener('click', async () => {
    const histories = await prepareExportHistories([{storageKey, items:pageItems}]);
    download('json', JSON.stringify({schemaVersion:1, exportedAt:new Date().toISOString(), histories}, null, 2), 'application/json');
  });
  init().catch(error=>showError(error.message));
})();
