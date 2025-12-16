/**
 * Dev Feedback Capture - Popup Script
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'dev-feedback-extension-enabled';

  // Check if current tab is a localhost page
  function checkCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const url = tabs[0].url;
        const isLocalhost = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');

        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        const warning = document.getElementById('localhost-warning');

        if (isLocalhost) {
          statusDot.classList.remove('inactive');
          statusText.textContent = 'Extension Active';
          warning.style.display = 'none';
        } else {
          statusDot.classList.add('inactive');
          statusText.textContent = 'Not on localhost';
          warning.style.display = 'block';
        }
      }
    });
  }

  // Load the extension enabled state
  function loadEnabledState() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const toggle = document.getElementById('extension-toggle');
      // Default to enabled if not set
      const isEnabled = result[STORAGE_KEY] !== false;
      toggle.checked = isEnabled;
    });
  }

  // Save the extension enabled state and notify content scripts
  function saveEnabledState(enabled) {
    chrome.storage.local.set({ [STORAGE_KEY]: enabled }, () => {
      // Send message to all localhost tabs to update their state
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.startsWith('http://localhost') || tab.url.startsWith('http://127.0.0.1'))) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'extension-enabled-changed',
              enabled: enabled
            }).catch(() => {
              // Ignore errors for tabs where content script isn't loaded
            });
          }
        });
      });
    });
  }

  // Open documentation (README)
  function openDocumentation() {
    const docsUrl = 'https://github.com/your-username/dev-feedback-capture';
    chrome.tabs.create({ url: docsUrl });
  }

  // Initialize popup
  function init() {
    checkCurrentPage();
    loadEnabledState();

    // Setup extension toggle listener
    const toggle = document.getElementById('extension-toggle');
    toggle.addEventListener('change', (e) => {
      saveEnabledState(e.target.checked);
    });

    // Setup event listeners
    document.getElementById('open-options').addEventListener('click', () => {
      // For now, just show an alert with instructions
      // In a real extension, this could open a full options page
      alert('Dev Feedback Capture\n\nTo use:\n1. Navigate to any localhost page\n2. Click the floating "Feedback Mode" button\n3. Click elements to capture feedback\n4. Export your feedback as JSON or Markdown\n\nKeyboard shortcut: Alt+F toggles feedback mode');
    });
  }

  // Run when popup opens
  document.addEventListener('DOMContentLoaded', init);

})();
