(function() {
  'use strict';

  importScripts('shared.js');

  const { buildFeedbackId, canInjectIntoUrl, getEffectivePageUrl } = globalThis.DevFeedbackShared;
  const REGION_CAPTURE_SESSION_PREFIX = 'dev-feedback-region-session-';

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ensure-content-script') {
      ensureContentScript(request.tabId, request.url).then(sendResponse);
      return true;
    }

    if (request.action === 'start-region-capture') {
      const tab = request.tab || sender.tab;
      startRegionCapture(tab, request.viewportMetrics).then(sendResponse);
      return true;
    }

    if (request.action === 'notify-feedback-updated') {
      notifyFeedbackUpdated(request.tabId).then(sendResponse);
      return true;
    }

    if (request.action === 'clear-region-session') {
      clearRegionSession(request.sessionId).then(sendResponse);
      return true;
    }

    return false;
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-feedback-mode') {
      return;
    }

    withActiveTab(async (activeTab) => {
      if (!activeTab || !activeTab.id) {
        return;
      }

      const injected = await ensureContentScript(activeTab.id, activeTab.url);
      if (!injected.ok) {
        console.debug('Unable to inject content script from command:', injected.reason);
        return;
      }

      try {
        await sendTabMessage(activeTab.id, { action: 'toggle-feedback-mode' });
      } catch (error) {
        console.debug('Unable to toggle feedback mode from command:', error.message);
      }
    });
  });

  async function ensureContentScript(tabId, rawUrl) {
    if (!tabId || !canInjectIntoUrl(rawUrl)) {
      return { ok: false, reason: 'This page does not support in-page element capture. Use Region mode instead.' };
    }

    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['styles.css']
      });
    } catch (error) {
      if (!String(error && error.message).includes('Cannot access')) {
        console.debug('Unable to inject styles:', error.message);
      }
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['shared.js', 'content.js']
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message || 'Unable to inject the feedback UI on this page.' };
    }
  }

  async function startRegionCapture(tab, viewportMetrics) {
    if (!tab || !tab.id) {
      return { ok: false, reason: 'No active tab is available for capture.' };
    }

    try {
      const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const sessionId = buildFeedbackId();
      const storageKey = `${REGION_CAPTURE_SESSION_PREFIX}${sessionId}`;
      const pageUrl = getEffectivePageUrl(tab.url || '');
      const session = {
        sessionId,
        tabId: tab.id,
        windowId: tab.windowId,
        pageUrl,
        rawTabUrl: tab.url || '',
        pageTitle: tab.title || '',
        viewportMetrics: sanitizeViewportMetrics(viewportMetrics),
        screenshotDataUrl,
        createdAt: new Date().toISOString()
      };

      await chrome.storage.local.set({ [storageKey]: session });
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`capture.html?session=${encodeURIComponent(sessionId)}`)
      });

      return { ok: true, sessionId };
    } catch (error) {
      return { ok: false, reason: error.message || 'Unable to capture the current tab.' };
    }
  }

  async function notifyFeedbackUpdated(tabId) {
    if (!tabId) {
      return { ok: true };
    }

    try {
      await sendTabMessage(tabId, { action: 'refresh-feedback' });
    } catch (error) {
      // Ignore missing content scripts. Region capture may have started from a PDF or protected page.
    }

    return { ok: true };
  }

  async function clearRegionSession(sessionId) {
    if (!sessionId) {
      return { ok: false, reason: 'Missing region capture session id.' };
    }

    await chrome.storage.local.remove(`${REGION_CAPTURE_SESSION_PREFIX}${sessionId}`);
    return { ok: true };
  }

  async function withActiveTab(callback) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    await callback(tabs && tabs[0]);
  }

  async function sendTabMessage(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
  }

  function sanitizeViewportMetrics(viewportMetrics) {
    return {
      width: Number.isFinite(viewportMetrics?.width) ? viewportMetrics.width : 0,
      height: Number.isFinite(viewportMetrics?.height) ? viewportMetrics.height : 0,
      devicePixelRatio: Number.isFinite(viewportMetrics?.devicePixelRatio) && viewportMetrics.devicePixelRatio > 0
        ? viewportMetrics.devicePixelRatio
        : 1
    };
  }
})();
