/**
 * Dev Feedback Capture - Popup Script
 */

(function() {
  'use strict';

  const { isLocalDevUrl, SHORTCUT_LABEL, MAC_SHORTCUT_LABEL } = globalThis.DevFeedbackShared;

  let currentTabId = null;
  let isSupportedTab = false;

  function getShortcutLabel() {
    return navigator.platform.toLowerCase().includes('mac') ? MAC_SHORTCUT_LABEL : SHORTCUT_LABEL;
  }

  function setWarning(message, visible) {
    const warning = document.getElementById('localhost-warning');
    warning.textContent = message;
    warning.style.display = visible ? 'block' : 'none';
  }

  // Check if current tab is a supported local page.
  function checkCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      const toggleBtn = document.getElementById('toggle-feedback-btn');

      currentTabId = activeTab && typeof activeTab.id === 'number' ? activeTab.id : null;
      isSupportedTab = Boolean(activeTab && isLocalDevUrl(activeTab.url));

      if (isSupportedTab) {
        setWarning('', false);
        toggleBtn.disabled = false;
        getContentState();
        return;
      }

      toggleBtn.disabled = true;
      updateUI(false, 0);
      setWarning('Open a localhost, 127.0.0.1, 0.0.0.0, or ::1 page to start capturing feedback.', true);
    });
  }

  // Get state from content script
  function getContentState() {
    if (!currentTabId) return;

    chrome.tabs.sendMessage(currentTabId, { action: 'get-state' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not ready:', chrome.runtime.lastError.message);
        updateUI(false, 0);
        setWarning('Refresh this page once so the extension can attach to it.', true);
        return;
      }

      setWarning('', false);

      if (response) {
        updateUI(response.feedbackMode, response.itemCount);
      }
    });
  }

  // Toggle feedback mode
  function toggleFeedbackMode() {
    if (!currentTabId || !isSupportedTab) return;

    chrome.tabs.sendMessage(currentTabId, { action: 'toggle-feedback-mode' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Error toggling:', chrome.runtime.lastError.message);
        setWarning('Refresh the page and try again. The content script is not available yet.', true);
        return;
      }

      setWarning('', false);

      if (response) {
        updateUI(response.feedbackMode, response.itemCount);
      }
    });
  }

  // Update UI based on state
  function updateUI(feedbackMode, itemCount) {
    const toggleBtn = document.getElementById('toggle-feedback-btn');
    const statusText = document.getElementById('feedback-mode-status');
    const itemCountEl = document.getElementById('item-count');

    if (feedbackMode) {
      toggleBtn.textContent = 'Stop Feedback Mode';
      toggleBtn.classList.add('active');
      statusText.textContent = 'ON';
      statusText.classList.add('active');
    } else {
      toggleBtn.textContent = 'Start Feedback Mode';
      toggleBtn.classList.remove('active');
      statusText.textContent = 'OFF';
      statusText.classList.remove('active');
    }

    itemCountEl.textContent = itemCount;
  }

  // Initialize popup
  function init() {
    document.getElementById('shortcut-label').textContent = getShortcutLabel();
    checkCurrentPage();

    // Setup toggle button
    document.getElementById('toggle-feedback-btn').addEventListener('click', toggleFeedbackMode);
  }

  // Run when popup opens
  document.addEventListener('DOMContentLoaded', init);

})();
