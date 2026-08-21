(function() {
  'use strict';

  importScripts('shared.js');

  const {
    FEEDBACK_STORAGE_PREFIX,
    REGION_CAPTURE_SESSION_PREFIX,
    buildFeedbackId,
    canInjectIntoUrl,
    sanitizeFeedbackItems,
    getEffectivePageUrl
  } = globalThis.DevFeedbackShared;
  const REGION_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
  const mutationQueues = new Map();

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ensure-content-script') {
      respondAsync(ensureContentScript(request.tabId, request.url), sendResponse);
      return true;
    }

    if (request.action === 'start-region-capture') {
      const tab = request.tab || sender.tab;
      respondAsync(startRegionCapture(tab, request.viewportMetrics), sendResponse);
      return true;
    }

    if (request.action === 'notify-feedback-updated') {
      respondAsync(notifyFeedbackUpdated(request.tabId), sendResponse);
      return true;
    }

    if (request.action === 'clear-region-session') {
      respondAsync(clearRegionSession(request.sessionId), sendResponse);
      return true;
    }

    if (request.action === 'resolve-annotation-target') {
      respondAsync(resolveAnnotationTarget(request.tabId, request.point, request.pageContext), sendResponse);
      return true;
    }

    if (request.action === 'list-feedback-history') {
      respondAsync(listFeedbackHistory(), sendResponse);
      return true;
    }

    if (request.action === 'get-feedback-items') {
      respondAsync(getFeedbackItems(request.storageKey), sendResponse);
      return true;
    }

    if (request.action === 'add-feedback-item') {
      respondAsync(addFeedbackItem(request.storageKey, request.item), sendResponse);
      return true;
    }

    if (request.action === 'delete-feedback-item') {
      respondAsync(deleteFeedbackItem(request.storageKey, request.itemId), sendResponse);
      return true;
    }

    if (request.action === 'clear-feedback-items') {
      respondAsync(clearFeedbackItems(request.storageKey), sendResponse);
      return true;
    }

    return false;
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearRegionSessionsForEditorTab(tabId).catch((error) => {
      console.debug('Unable to clear closed region editor session:', error.message);
    });
  });

  sweepExpiredRegionSessions().catch((error) => {
    console.debug('Unable to sweep expired region sessions:', error.message);
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

    let storageKey = '';
    try {
      await sweepExpiredRegionSessions();
      let resolvedViewportMetrics = viewportMetrics;
      if (!resolvedViewportMetrics && canInjectIntoUrl(tab.url || '')) {
        const injected = await ensureContentScript(tab.id, tab.url || '');
        if (injected.ok) {
          resolvedViewportMetrics = await sendTabMessage(tab.id, { action: 'get-viewport-metrics' }).catch(() => null);
        }
      }
      resolvedViewportMetrics = resolvedViewportMetrics || {
        width: tab.width,
        height: tab.height,
        devicePixelRatio: null
      };
      const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const sessionId = buildFeedbackId();
      storageKey = `${REGION_CAPTURE_SESSION_PREFIX}${sessionId}`;
      const pageUrl = getEffectivePageUrl(tab.url || '');
      const session = {
        sessionId,
        tabId: tab.id,
        windowId: tab.windowId,
        pageUrl,
        rawTabUrl: tab.url || '',
        pageTitle: tab.title || '',
        viewportMetrics: sanitizeViewportMetrics(resolvedViewportMetrics),
        screenshotDataUrl,
        createdAt: new Date().toISOString()
      };

      session.viewportMetrics.zoom = await chrome.tabs.getZoom(tab.id).catch(() => 1);

      await chrome.storage.session.set({ [storageKey]: session });
      const editorTab = await chrome.tabs.create({
        url: chrome.runtime.getURL(`capture.html?session=${encodeURIComponent(sessionId)}`)
      });
      await chrome.storage.session.set({
        [storageKey]: { ...session, editorTabId: editorTab.id }
      });
      await chrome.tabs.get(editorTab.id);

      return { ok: true, sessionId };
    } catch (error) {
      if (typeof storageKey === 'string') {
        await chrome.storage.session.remove(storageKey).catch(() => {});
      }
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

  async function resolveAnnotationTarget(tabId, point, pageContext) {
    if (!tabId) {
      return { ok: true, target: null, reason: 'The source tab is no longer available.' };
    }

    try {
      const response = await sendTabMessage(tabId, {
        action: 'resolve-dom-target',
        point,
        pageContext
      });
      return response?.ok ? response : { ok: true, target: null, reason: response?.reason || 'No DOM target found.' };
    } catch (error) {
      return { ok: true, target: null, reason: 'DOM anchoring is unavailable for this page.' };
    }
  }

  async function clearRegionSession(sessionId) {
    if (!sessionId) {
      return { ok: false, reason: 'Missing region capture session id.' };
    }

    await chrome.storage.session.remove(`${REGION_CAPTURE_SESSION_PREFIX}${sessionId}`);
    return { ok: true };
  }

  async function clearRegionSessionsForEditorTab(tabId) {
    const sessions = await chrome.storage.session.get(null);
    const keys = Object.entries(sessions)
      .filter(([key, value]) => key.startsWith(REGION_CAPTURE_SESSION_PREFIX) && value?.editorTabId === tabId)
      .map(([key]) => key);

    if (keys.length) {
      await chrome.storage.session.remove(keys);
    }
  }

  async function sweepExpiredRegionSessions() {
    const sessions = await chrome.storage.session.get(null);
    const now = Date.now();
    const expiredKeys = Object.entries(sessions)
      .filter(([key, value]) => {
        if (!key.startsWith(REGION_CAPTURE_SESSION_PREFIX)) {
          return false;
        }
        const createdAt = Date.parse(value?.createdAt || '');
        return !Number.isFinite(createdAt) || now - createdAt > REGION_SESSION_MAX_AGE_MS;
      })
      .map(([key]) => key);

    if (expiredKeys.length) {
      await chrome.storage.session.remove(expiredKeys);
    }
  }

  async function listFeedbackHistory() {
    const stored = await chrome.storage.local.get(null);
    const histories = await Promise.all(Object.entries(stored).flatMap(([storageKey, value]) => {
      if (!storageKey.startsWith(FEEDBACK_STORAGE_PREFIX) || !Array.isArray(value)) {
        return [];
      }
      return [getFeedbackItems(storageKey).then((response) => ({ storageKey, items: response.items || [] }))];
    }));

    return { ok: true, histories };
  }

  async function getFeedbackItems(storageKey) {
    if (!isFeedbackStorageKey(storageKey)) {
      return { ok: false, reason: 'Invalid feedback storage key.' };
    }
    return enqueueFeedbackOperation(storageKey, async () => {
      const stored = await chrome.storage.local.get([storageKey]);
      const { items, needsMigration } = normalizeStoredFeedbackItems(stored[storageKey]);
      if (needsMigration) {
        await chrome.storage.local.set({ [storageKey]: items });
      }
      return { ok: true, items };
    });
  }

  async function addFeedbackItem(storageKey, item) {
    return mutateFeedbackItems(storageKey, (items) => items.concat(item));
  }

  async function deleteFeedbackItem(storageKey, itemId) {
    if (!itemId) {
      return { ok: false, reason: 'Missing feedback item id.' };
    }
    return mutateFeedbackItems(storageKey, (items) => items.filter((item) => item.id !== itemId));
  }

  async function clearFeedbackItems(storageKey) {
    return mutateFeedbackItems(storageKey, () => []);
  }

  function mutateFeedbackItems(storageKey, mutate) {
    if (!isFeedbackStorageKey(storageKey)) {
      return Promise.resolve({ ok: false, reason: 'Invalid feedback storage key.' });
    }

    return enqueueFeedbackOperation(storageKey, async () => {
      const stored = await chrome.storage.local.get([storageKey]);
      const { items: currentItems } = normalizeStoredFeedbackItems(stored[storageKey]);
      const nextItems = sanitizeFeedbackItems(mutate(currentItems));
      await chrome.storage.local.set({ [storageKey]: nextItems });
      return { ok: true, items: nextItems };
    });
  }

  function enqueueFeedbackOperation(storageKey, operation) {
    const previous = mutationQueues.get(storageKey) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);

    mutationQueues.set(storageKey, current);
    const clearQueue = () => {
      if (mutationQueues.get(storageKey) === current) {
        mutationQueues.delete(storageKey);
      }
    };
    current.then(clearQueue, clearQueue);
    return current;
  }

  function isFeedbackStorageKey(storageKey) {
    return typeof storageKey === 'string' && storageKey.startsWith(FEEDBACK_STORAGE_PREFIX);
  }

  function normalizeStoredFeedbackItems(rawItems) {
    const normalized = sanitizeFeedbackItems(rawItems);
    const needsMigration = !Array.isArray(rawItems) || rawItems.length !== normalized.length || rawItems.some((item) => (
      !item || typeof item.id !== 'string' || !item.id || !item.type || !item.captureType
    ));
    return { items: normalized, needsMigration };
  }

  function respondAsync(promise, sendResponse) {
    Promise.resolve(promise)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, reason: error.message || 'Extension operation failed.' }));
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
      scrollX: Number.isFinite(viewportMetrics?.scrollX) ? viewportMetrics.scrollX : 0,
      scrollY: Number.isFinite(viewportMetrics?.scrollY) ? viewportMetrics.scrollY : 0,
      devicePixelRatio: Number.isFinite(viewportMetrics?.devicePixelRatio) && viewportMetrics.devicePixelRatio > 0
        ? viewportMetrics.devicePixelRatio
        : null,
      zoom: Number.isFinite(viewportMetrics?.zoom) && viewportMetrics.zoom > 0 ? viewportMetrics.zoom : 1,
      userAgent: typeof viewportMetrics?.userAgent === 'string' ? viewportMetrics.userAgent.slice(0, 500) : navigator.userAgent,
      language: typeof viewportMetrics?.language === 'string' ? viewportMetrics.language.slice(0, 80) : navigator.language
    };
  }
})();
