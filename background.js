(function() {
  'use strict';

  importScripts('shared.js');

  const { isLocalDevUrl } = globalThis.DevFeedbackShared;

  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-feedback-mode') {
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];

      if (!activeTab || !activeTab.id || !isLocalDevUrl(activeTab.url)) {
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: 'toggle-feedback-mode' }, () => {
        if (chrome.runtime.lastError) {
          console.debug('Unable to toggle feedback mode from command:', chrome.runtime.lastError.message);
        }
      });
    });
  });
})();
