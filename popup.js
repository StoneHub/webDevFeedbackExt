/**
 * Dev Feedback Capture - Popup Script
 */

(function() {
  'use strict';

  let currentTabId = null;
  let isLocalhost = false;

  // Check if current tab is a localhost page
  function checkCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        currentTabId = tabs[0].id;
        const url = tabs[0].url;
        isLocalhost = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');

        const warning = document.getElementById('localhost-warning');
        const toggleBtn = document.getElementById('toggle-feedback-btn');

        if (isLocalhost) {
          warning.style.display = 'none';
          toggleBtn.disabled = false;
          // Get current state from content script
          getContentState();
        } else {
          warning.style.display = 'block';
          toggleBtn.disabled = true;
          updateUI(false, 0);
        }
      }
    });
  }

  // Get state from content script
  function getContentState() {
    if (!currentTabId) return;

    chrome.tabs.sendMessage(currentTabId, { action: 'get-state' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be loaded yet
        console.log('Content script not ready:', chrome.runtime.lastError.message);
        updateUI(false, 0);
        return;
      }
      if (response) {
        updateUI(response.feedbackMode, response.itemCount);
      }
    });
  }

  // Toggle feedback mode
  function toggleFeedbackMode() {
    if (!currentTabId || !isLocalhost) return;

    chrome.tabs.sendMessage(currentTabId, { action: 'toggle-feedback-mode' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Error toggling:', chrome.runtime.lastError.message);
        return;
      }
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
    checkCurrentPage();

    // Setup toggle button
    document.getElementById('toggle-feedback-btn').addEventListener('click', toggleFeedbackMode);
  }

  // Run when popup opens
  document.addEventListener('DOMContentLoaded', init);

})();
