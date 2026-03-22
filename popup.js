/**
 * Dev Feedback Capture - Popup Script
 */

(function() {
  'use strict';

  const {
    SHORTCUT_LABEL,
    MAC_SHORTCUT_LABEL,
    canInjectIntoUrl,
    getEffectivePageUrl,
    makeStorageKey
  } = globalThis.DevFeedbackShared;

  const STORAGE_KEYS = {
    captureMode: 'dev-feedback-popup-mode'
  };

  let currentTab = null;
  let currentTabId = null;
  let selectedMode = window.localStorage.getItem(STORAGE_KEYS.captureMode) || 'element';

  function getShortcutLabel() {
    return navigator.platform.toLowerCase().includes('mac') ? MAC_SHORTCUT_LABEL : SHORTCUT_LABEL;
  }

  function setWarning(message) {
    const warning = document.getElementById('warning');
    warning.textContent = message;
    warning.style.display = message ? 'block' : 'none';
  }

  function setInfo(message) {
    const info = document.getElementById('info');
    info.textContent = message;
    info.style.display = message ? 'block' : 'none';
  }

  async function init() {
    document.getElementById('shortcut-label').textContent = getShortcutLabel();
    bindCaptureModeInputs();
    document.getElementById('primary-action-btn').addEventListener('click', handlePrimaryAction);
    await loadCurrentTab();
    syncModeUi();
  }

  function bindCaptureModeInputs() {
    document.querySelectorAll('input[name="capture-mode"]').forEach((input) => {
      input.checked = input.value === selectedMode;
      input.addEventListener('change', () => {
        selectedMode = input.value;
        window.localStorage.setItem(STORAGE_KEYS.captureMode, selectedMode);
        syncModeUi();
      });
    });
  }

  async function loadCurrentTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs && tabs[0] ? tabs[0] : null;
    currentTabId = currentTab && typeof currentTab.id === 'number' ? currentTab.id : null;

    const pageLabel = document.getElementById('page-label');
    if (!currentTab) {
      pageLabel.textContent = 'No active tab';
      updateUI(false, 0);
      return;
    }

    pageLabel.textContent = getEffectivePageUrl(currentTab.url || currentTab.pendingUrl || currentTab.title || 'Current tab');
    await refreshState();
  }

  async function refreshState() {
    const primaryButton = document.getElementById('primary-action-btn');
    const itemCount = await getItemCount();
    const feedbackState = await getFeedbackState();

    updateUI(feedbackState.feedbackMode, itemCount);
    primaryButton.disabled = !currentTabId;
    syncModeUi();
  }

  async function getItemCount() {
    if (!currentTab?.url) {
      return 0;
    }

    const storageKey = makeStorageKey(currentTab.url);
    const result = await chrome.storage.local.get([storageKey]);
    return Array.isArray(result[storageKey]) ? result[storageKey].length : 0;
  }

  async function getFeedbackState() {
    if (!currentTabId) {
      return { feedbackMode: false };
    }

    try {
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'get-state' });
      return response || { feedbackMode: false };
    } catch (error) {
      return { feedbackMode: false };
    }
  }

  function syncModeUi() {
    const primaryButton = document.getElementById('primary-action-btn');
    const canInject = canInjectIntoUrl(currentTab?.url || '');

    setWarning('');
    setInfo('');

    if (!currentTabId) {
      primaryButton.disabled = true;
      primaryButton.textContent = 'No Active Tab';
      return;
    }

    if (selectedMode === 'region') {
      primaryButton.disabled = false;
      primaryButton.classList.remove('stop');
      primaryButton.textContent = 'Capture Region';

      if ((currentTab?.url || '').startsWith('file://')) {
        setInfo('If region capture fails on a local PDF, enable "Allow access to file URLs" on the extension first.');
      } else {
        setInfo('Region capture takes a viewport screenshot and opens an editor tab for drawing the crop.');
      }
      return;
    }

    primaryButton.textContent = document.getElementById('feedback-mode-status').textContent === 'ON'
      ? 'Stop Element Mode'
      : 'Start Element Mode';
    primaryButton.classList.toggle('stop', document.getElementById('feedback-mode-status').textContent === 'ON');
    primaryButton.disabled = !canInject;

    if (!canInject) {
      setWarning('Element mode needs an injectable page such as http, https, or file. Use Region mode for PDFs and browser viewer surfaces.');
      return;
    }

    setInfo('Element mode injects the feedback UI into the current tab only after you start it.');
  }

  async function handlePrimaryAction() {
    if (!currentTabId) {
      return;
    }

    if (selectedMode === 'region') {
      await startRegionCapture();
      return;
    }

    await toggleElementMode();
  }

  async function toggleElementMode() {
    setWarning('');

    const ensured = await chrome.runtime.sendMessage({
      action: 'ensure-content-script',
      tabId: currentTabId,
      url: currentTab?.url || ''
    });

    if (!ensured || !ensured.ok) {
      setWarning(ensured?.reason || 'Unable to load the in-page feedback UI on this tab.');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'toggle-feedback-mode' });
      updateUI(Boolean(response?.feedbackMode), await getItemCount());
      syncModeUi();
    } catch (error) {
      setWarning('Refresh the current page and try again. The feedback UI did not attach cleanly.');
    }
  }

  async function startRegionCapture() {
    setWarning('');

    let viewportMetrics = null;
    try {
      viewportMetrics = await chrome.tabs.sendMessage(currentTabId, { action: 'get-viewport-metrics' });
    } catch (error) {
      viewportMetrics = null;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'start-region-capture',
      tab: {
        id: currentTab.id,
        windowId: currentTab.windowId,
        url: currentTab.url,
        title: currentTab.title
      },
      viewportMetrics
    });

    if (!response || !response.ok) {
      setWarning(response?.reason || 'Unable to start region capture on this tab.');
      return;
    }

    window.close();
  }

  function updateUI(feedbackMode, itemCount) {
    const statusText = document.getElementById('feedback-mode-status');
    const itemCountEl = document.getElementById('item-count');

    statusText.textContent = feedbackMode ? 'ON' : 'OFF';
    statusText.classList.toggle('active', feedbackMode);
    itemCountEl.textContent = String(itemCount);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((error) => {
      setWarning(error.message || 'Unable to initialize the popup.');
    });
  });
})();
