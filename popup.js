(function() {
  'use strict';
  const { canInjectIntoUrl, detectSourceKind, frameAccessPattern, makeStorageKey, SHORTCUT_LABEL, MAC_SHORTCUT_LABEL } = DevFeedbackShared;
  let tab;
  let state = {};
  let frameAccess = [];
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
  async function init() {
    document.getElementById('shortcut-label').textContent = navigator.platform.toLowerCase().includes('mac') ? MAC_SHORTCUT_LABEL : SHORTCUT_LABEL;
    [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    document.getElementById('page-label').textContent = tab?.title || 'Current webpage';
    if (!tab?.id || !canInjectIntoUrl(tab.url) || detectSourceKind(tab.url) === 'pdf') {
      showError('Open a webpage to pick an element. PDF and browser-internal pages are not supported.');
      return;
    }
    state = await chrome.tabs.sendMessage(tab.id, {action:'get-state'}, {frameId:0}).catch(()=>({}));
    const key = makeStorageKey(tab.url);
    const stored = await chrome.storage.local.get(key);
    document.getElementById('item-count').textContent = (stored[key] || []).length;
    frameAccess = await missingFrameAccess();
    if (frameAccess.length) {
      const note = document.getElementById('frame-access');
      note.textContent = `Part of this page is embedded from ${frameAccess.map(origin => new URL(origin.replace('*.', '')).hostname).join(', ')}. Chrome will ask once to let you pick inside it.`;
      note.hidden = false;
    }
    pick.textContent = state.editorOpen ? 'Return to open panel' : state.feedbackMode ? 'Stop picking' : 'Pick an element';
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
  document.getElementById('history-btn').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({action:'open-history',tabId:tab?.id});
    if (!result?.ok) { showError(result?.reason || 'Could not open History.'); return; }
    if (result.usePopup) window.location.replace(chrome.runtime.getURL('history.html?surface=popup'));
    else window.close();
  });
  init().catch(error=>showError(error.message));
})();
