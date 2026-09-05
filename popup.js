(function() {
  'use strict';
  const { canInjectIntoUrl, detectSourceKind, makeStorageKey, SHORTCUT_LABEL, MAC_SHORTCUT_LABEL } = DevFeedbackShared;
  let tab;
  let state = {};
  const pick = document.getElementById('primary-action-btn');
  const warning = document.getElementById('warning');
  function showError(message) { warning.textContent = message; warning.hidden = !message; }
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
    pick.textContent = state.editorOpen ? 'Return to open panel' : state.feedbackMode ? 'Stop picking' : 'Pick an element';
    pick.disabled = false;
  }
  pick.addEventListener('click', async () => {
    showError('');
    if (state.editorOpen) { window.close(); return; }
    pick.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({action:'ensure-content-script',tabId:tab.id});
      if (!result?.ok) throw new Error(result?.reason || 'Could not start picking on this page.');
      await chrome.tabs.sendMessage(tab.id, {action:'toggle-feedback-mode'}, {frameId:0});
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
