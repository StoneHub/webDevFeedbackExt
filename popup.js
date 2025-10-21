/**
 * Dev Feedback Capture - Popup Script
 */

(function() {
  'use strict';

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

  // Open documentation (README)
  function openDocumentation() {
    const docsUrl = 'https://github.com/your-username/dev-feedback-capture';
    chrome.tabs.create({ url: docsUrl });
  }

  // Initialize popup
  function init() {
    checkCurrentPage();

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
