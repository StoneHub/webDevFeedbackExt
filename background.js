(function() {
  'use strict';

  importScripts('shared.js', 'session-model.js');

  const {
    FEEDBACK_STORAGE_PREFIX,
    REGION_CAPTURE_SESSION_PREFIX,
    buildFeedbackId,
    canInjectIntoUrl,
    sanitizeFeedbackItems,
    getEffectivePageUrl
  } = globalThis.DevFeedbackShared;
  const {
    SESSION_INDEX_KEY,
    ACTIVE_SESSION_KEY,
    MAX_STORED_SESSIONS,
    estimateSerializedBytes,
    makeSessionStorageKey,
    createFeedbackSession,
    appendSessionEvent,
    sanitizeFeedbackSession
  } = globalThis.DevFeedbackSessionModel;
  const REGION_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
  const LOCAL_STORAGE_SOFT_LIMIT_BYTES = 8 * 1024 * 1024;
  const mutationQueues = new Map();
  const sessionMutationQueues = new Map();
  let navigationListenersRegistered = false;

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

    if (request.action === 'capture-visual-edit-viewport') {
      respondAsync(captureVisualEditViewport(sender.tab), sendResponse);
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

    if (request.action === 'start-feedback-session') {
      respondAsync(startFeedbackSession(request.tab || sender.tab), sendResponse);
      return true;
    }

    if (request.action === 'get-feedback-session-state') {
      respondAsync(getFeedbackSessionState(request.tabId), sendResponse);
      return true;
    }

    if (request.action === 'sync-feedback-session-recorder') {
      respondAsync(syncFeedbackSessionRecorder(request.tabId, request.url), sendResponse);
      return true;
    }

    if (request.action === 'append-feedback-session-event') {
      respondAsync(appendFeedbackSessionEvent(request.sessionId, request.event, sender.tab), sendResponse);
      return true;
    }

    if (request.action === 'set-feedback-session-paused') {
      respondAsync(setFeedbackSessionPaused(request.sessionId, request.paused, sender.tab), sendResponse);
      return true;
    }

    if (request.action === 'stop-feedback-session') {
      respondAsync(stopFeedbackSession({
        sessionId: request.sessionId,
        reason: request.reason,
        openReview: request.openReview,
        senderTab: sender.tab
      }), sendResponse);
      return true;
    }

    if (request.action === 'list-feedback-sessions') {
      respondAsync(listFeedbackSessions(), sendResponse);
      return true;
    }

    if (request.action === 'get-feedback-session') {
      respondAsync(getFeedbackSession(request.sessionId), sendResponse);
      return true;
    }

    if (request.action === 'update-feedback-session-summary') {
      respondAsync(updateFeedbackSessionSummary(request.sessionId, request.summary), sendResponse);
      return true;
    }

    if (request.action === 'delete-feedback-session') {
      respondAsync(deleteFeedbackSession(request.sessionId), sendResponse);
      return true;
    }

    if (request.action === 'clear-feedback-sessions') {
      respondAsync(clearFeedbackSessions(), sendResponse);
      return true;
    }

    return false;
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearRegionSessionsForEditorTab(tabId).catch((error) => {
      console.debug('Unable to clear closed region editor session:', error.message);
    });
    stopFeedbackSessionForClosedTab(tabId).catch((error) => {
      console.debug('Unable to close feedback session for removed tab:', error.message);
    });
  });

  registerFeedbackSessionNavigationListeners();
  chrome.permissions?.onAdded?.addListener(() => {
    registerFeedbackSessionNavigationListeners();
  });
  chrome.permissions?.onRemoved?.addListener((removed) => {
    if (removed?.permissions?.includes('webNavigation')) {
      stopFeedbackSession({
        reason: 'permission-revoked',
        openReview: false
      }).catch((error) => {
        console.debug('Unable to interrupt Feedback Session after permission removal:', error.message);
      });
    }
  });

  sweepExpiredRegionSessions().catch((error) => {
    console.debug('Unable to sweep expired region sessions:', error.message);
  });
  const sessionInitializationPromise = reconcileStaleFeedbackSessions().catch((error) => {
    console.debug('Unable to reconcile stale Feedback Sessions:', error.message);
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
        files: ['shared.js', 'visual-edit.js', 'content.js']
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message || 'Unable to inject the feedback UI on this page.' };
    }
  }

  async function captureVisualEditViewport(tab) {
    if (!tab?.id || !tab.windowId || !canInjectIntoUrl(tab.url || '')) {
      return { ok: false, reason: 'Visual evidence requires the active injectable page.' };
    }

    const activeTabs = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (!activeTabs.some((activeTab) => activeTab.id === tab.id)) {
      return { ok: false, reason: 'Keep the edited page active while capturing visual evidence.' };
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    return { ok: true, dataUrl };
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

  function registerFeedbackSessionNavigationListeners() {
    if (navigationListenersRegistered || !chrome.webNavigation) {
      return;
    }
    navigationListenersRegistered = true;

    chrome.webNavigation.onCommitted.addListener((details) => {
      recordFeedbackSessionNavigation(details, 'navigation-committed').catch(logSessionNavigationError);
    });
    chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
      syncFeedbackSessionRecorder(details.tabId, details.url, details.documentId)
        .catch(logSessionNavigationError);
    });
    chrome.webNavigation.onCompleted.addListener((details) => {
      recordFeedbackSessionNavigation(details, 'navigation-completed')
        .then(() => syncFeedbackSessionRecorder(details.tabId, details.url, details.documentId))
        .catch(logSessionNavigationError);
    });
    chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
      recordFeedbackSessionNavigation(details, 'navigation-history').catch(logSessionNavigationError);
    });
    chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
      recordFeedbackSessionNavigation(details, 'navigation-fragment').catch(logSessionNavigationError);
    });
    chrome.webNavigation.onErrorOccurred.addListener((details) => {
      recordFeedbackSessionNavigation(details, 'navigation-error').catch(logSessionNavigationError);
    });
  }

  function logSessionNavigationError(error) {
    console.debug('Unable to record feedback-session navigation:', error.message);
  }

  function startFeedbackSession(tab) {
    return enqueueActiveSessionOperation(() => startFeedbackSessionUnlocked(tab));
  }

  async function startFeedbackSessionUnlocked(tab) {
    await sessionInitializationPromise;
    if (!tab || !Number.isInteger(tab.id) || !canInjectIntoUrl(tab.url || '')) {
      return {
        ok: false,
        reason: 'Feedback Sessions need an injectable http, https, or file page in the active tab.'
      };
    }

    const permissionGranted = await chrome.permissions.contains({ permissions: ['webNavigation'] });
    if (!permissionGranted) {
      return {
        ok: false,
        reason: 'Navigation recording permission is required. Start again and approve the browser prompt.'
      };
    }

    registerFeedbackSessionNavigationListeners();
    const active = await getActiveFeedbackSession();
    if (active) {
      return {
        ok: false,
        reason: active.tabId === tab.id
          ? 'A Feedback Session is already recording in this tab.'
          : 'Stop the current Feedback Session before starting another one.'
      };
    }

    const recorder = await ensureSessionRecorder(tab.id, tab.url || '');
    if (!recorder.ok) {
      return recorder;
    }

    const session = createFeedbackSession(tab);
    await storeFeedbackSession(session);
    await addFeedbackSessionToIndex(session.id);
    const activeState = {
      sessionId: session.id,
      tabId: tab.id,
      status: 'recording',
      startedAt: session.startedAt,
      lastDocumentId: '',
      lastGapDocumentId: '',
      limitReached: false
    };
    await chrome.storage.session.set({ [ACTIVE_SESSION_KEY]: activeState });
    await setFeedbackSessionBadge(tab.id, 'recording');

    try {
      await sendTabMessage(tab.id, {
        action: 'activate-feedback-session-recorder',
        sessionId: session.id,
        paused: false,
        limitReached: false
      });
    } catch (error) {
      await chrome.storage.session.remove(ACTIVE_SESSION_KEY);
      await chrome.storage.local.remove(makeSessionStorageKey(session.id));
      await removeFeedbackSessionFromIndex(session.id);
      await setFeedbackSessionBadge(tab.id, 'off');
      return {
        ok: false,
        reason: 'The page recorder did not attach cleanly. Refresh the page and try again.'
      };
    }

    return { ok: true, session: summarizeFeedbackSession(session) };
  }

  async function getFeedbackSessionState(tabId) {
    const active = await getActiveFeedbackSession();
    if (!active) {
      return { ok: true, active: false, session: null };
    }

    const response = await getFeedbackSession(active.sessionId);
    if (Number.isInteger(tabId) && active.tabId !== tabId) {
      return {
        ok: true,
        active: false,
        activeElsewhere: true,
        session: response.session ? summarizeFeedbackSession(response.session) : null
      };
    }
    return {
      ok: true,
      active: Boolean(response.session),
      session: response.session ? summarizeFeedbackSession(response.session) : null
    };
  }

  async function syncFeedbackSessionRecorder(tabId, rawUrl, documentId = '') {
    const active = await getActiveFeedbackSession();
    if (!active || active.tabId !== tabId) {
      return { ok: true, active: false };
    }
    if (!['recording', 'paused'].includes(active.status)) {
      await sendTabMessage(tabId, { action: 'deactivate-feedback-session-recorder' }).catch(() => {});
      return { ok: true, active: false };
    }

    const recorder = await ensureSessionRecorder(tabId, rawUrl || '');
    if (!recorder.ok) {
      if (!documentId || active.lastGapDocumentId !== documentId) {
        await appendFeedbackSessionEvent(active.sessionId, {
          type: 'capture-gap',
          timestamp: new Date().toISOString(),
          pageUrl: rawUrl || '',
          pageTitle: '',
          details: {
            reason: 'Navigation was recorded, but interaction detail is unavailable until the extension has access to this page.'
          }
        }, { id: tabId });
        await updateActiveFeedbackSession(active.sessionId, (current) => ({
          ...current,
          lastGapDocumentId: documentId || current.lastGapDocumentId
        }));
      }
      return { ok: true, active: true, interactionCapture: false, reason: recorder.reason };
    }

    try {
      await sendTabMessage(tabId, {
        action: 'sync-feedback-session-recorder',
        sessionId: active.sessionId,
        paused: active.status === 'paused',
        limitReached: Boolean(active.limitReached)
      });
      const confirmedActive = await getActiveFeedbackSession();
      if (!confirmedActive || confirmedActive.sessionId !== active.sessionId) {
        await sendTabMessage(tabId, { action: 'deactivate-feedback-session-recorder' }).catch(() => {});
        return { ok: true, active: false };
      }
      if (
        confirmedActive.status !== active.status ||
        Boolean(confirmedActive.limitReached) !== Boolean(active.limitReached)
      ) {
        await sendTabMessage(tabId, {
          action: 'sync-feedback-session-recorder',
          sessionId: confirmedActive.sessionId,
          paused: confirmedActive.status === 'paused',
          limitReached: Boolean(confirmedActive.limitReached)
        });
      }
      if (documentId && active.lastDocumentId !== documentId) {
        await updateActiveFeedbackSession(active.sessionId, (current) => ({
          ...current,
          lastDocumentId: documentId,
          lastGapDocumentId: ''
        }));
      }
      return {
        ok: true,
        active: true,
        interactionCapture: true,
        paused: confirmedActive.status === 'paused'
      };
    } catch (error) {
      return {
        ok: true,
        active: true,
        interactionCapture: false,
        reason: 'The page recorder did not respond after navigation.'
      };
    }
  }

  async function ensureSessionRecorder(tabId, rawUrl) {
    if (!tabId || !canInjectIntoUrl(rawUrl)) {
      return {
        ok: false,
        reason: 'Interaction capture is unavailable on this browser-managed page.'
      };
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['session-model.js', 'session-recorder.js']
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error.message || 'Unable to attach the feedback-session recorder to this page.'
      };
    }
  }

  async function recordFeedbackSessionNavigation(details, type) {
    if (!details || details.frameId !== 0) {
      return;
    }

    const active = await getActiveFeedbackSession();
    if (!active || active.tabId !== details.tabId || active.status !== 'recording') {
      return;
    }

    await appendFeedbackSessionEvent(active.sessionId, {
      type,
      timestamp: new Date(details.timeStamp || Date.now()).toISOString(),
      pageUrl: details.url || '',
      pageTitle: '',
      details: {
        transitionType: details.transitionType || '',
        transitionQualifiers: details.transitionQualifiers || [],
        documentId: details.documentId || '',
        error: details.error || ''
      }
    }, { id: details.tabId });
  }

  async function appendFeedbackSessionEvent(sessionId, event, senderTab) {
    const active = await getActiveFeedbackSession();
    if (
      !active ||
      active.sessionId !== sessionId ||
      !senderTab ||
      senderTab.id !== active.tabId
    ) {
      return { ok: false, reason: 'This tab does not own the active Feedback Session.' };
    }

    if (active.status !== 'recording') {
      return { ok: true, ignored: true, paused: active.status === 'paused', status: active.status };
    }

    const result = await appendStoredFeedbackSessionEvent(sessionId, event);
    if (result?.truncated && !result.accepted && !active.limitReached) {
      await updateStoredFeedbackSession(sessionId, (session) => ({
        ...session,
        status: 'paused'
      }));
      const nextActive = await updateActiveFeedbackSession(sessionId, (current) => ({
        ...current,
        status: 'paused',
        limitReached: true
      }));
      if (!nextActive) {
        return { ok: false, reason: 'The Feedback Session stopped before the event limit update completed.' };
      }
      await setFeedbackSessionBadge(nextActive.tabId, 'paused');
      await sendTabMessage(nextActive.tabId, {
        action: 'sync-feedback-session-recorder',
        sessionId,
        paused: true,
        limitReached: true
      }).catch(() => {});
      return { ...result, paused: true, limitReached: true };
    }
    return result;
  }

  function appendStoredFeedbackSessionEvent(sessionId, event) {
    return enqueueSessionOperation(sessionId, async () => {
      const stored = await chrome.storage.local.get([makeSessionStorageKey(sessionId)]);
      const current = sanitizeFeedbackSession(stored[makeSessionStorageKey(sessionId)]);
      if (!current) {
        return { ok: false, reason: 'The active Feedback Session record is missing.' };
      }

      const appended = appendSessionEvent(current, event);
      if (!appended.session) {
        return { ok: false, reason: 'The session event was not valid.' };
      }

      if (appended.accepted) {
        const [totalBytes, currentSessionBytes] = await Promise.all([
          chrome.storage.local.getBytesInUse(null),
          chrome.storage.local.getBytesInUse(makeSessionStorageKey(sessionId))
        ]);
        const projectedBytes = totalBytes - currentSessionBytes + estimateSerializedBytes(appended.session);
        if (projectedBytes > LOCAL_STORAGE_SOFT_LIMIT_BYTES) {
          const limitedSession = {
            ...current,
            truncated: true,
            truncationReason: 'storage-soft-limit'
          };
          await storeFeedbackSession(limitedSession);
          return {
            ok: true,
            accepted: false,
            eventCount: limitedSession.eventCount,
            truncated: true,
            limitReason: limitedSession.truncationReason
          };
        }
      }

      await storeFeedbackSession(appended.session);
      return {
        ok: true,
        accepted: appended.accepted,
        eventCount: appended.session.eventCount,
        truncated: appended.session.truncated,
        limitReason: appended.session.truncationReason
      };
    });
  }

  function setFeedbackSessionPaused(sessionId, shouldPause, senderTab) {
    return enqueueActiveSessionOperation(
      () => setFeedbackSessionPausedUnlocked(sessionId, shouldPause, senderTab)
    );
  }

  async function setFeedbackSessionPausedUnlocked(sessionId, shouldPause, senderTab) {
    const active = await getActiveFeedbackSession();
    if (
      !active ||
      active.sessionId !== sessionId ||
      !senderTab ||
      senderTab.id !== active.tabId
    ) {
      return { ok: false, reason: 'This tab does not own the active Feedback Session.' };
    }

    const paused = Boolean(shouldPause);
    if (!paused && active.limitReached) {
      return {
        ok: false,
        reason: 'A Feedback Session storage safety limit was reached. Stop and review this session before starting another.'
      };
    }
    if ((active.status === 'paused') === paused) {
      return { ok: true, paused };
    }

    const transition = await enqueueSessionOperation(sessionId, async () => {
      const storageKey = makeSessionStorageKey(sessionId);
      const stored = await chrome.storage.local.get([storageKey]);
      const current = sanitizeFeedbackSession(stored[storageKey]);
      if (!current) {
        throw new Error('The active Feedback Session record is missing.');
      }
      const appended = appendSessionEvent(current, {
        type: paused ? 'session-pause' : 'session-resume',
        timestamp: new Date().toISOString(),
        pageUrl: senderTab.url || '',
        pageTitle: senderTab.title || ''
      });
      const nextSession = {
        ...(appended.session || current),
        status: paused ? 'paused' : 'recording'
      };
      await storeFeedbackSession(nextSession);
      return {
        accepted: appended.accepted,
        truncated: nextSession.truncated,
        truncationReason: nextSession.truncationReason
      };
    });
    const reachedLimit = transition.truncated && !transition.accepted;
    const nextPaused = reachedLimit ? true : paused;
    await chrome.storage.session.set({
      [ACTIVE_SESSION_KEY]: {
        ...active,
        status: nextPaused ? 'paused' : 'recording',
        limitReached: reachedLimit || Boolean(active.limitReached)
      }
    });
    await setFeedbackSessionBadge(active.tabId, nextPaused ? 'paused' : 'recording');

    return {
      ok: true,
      paused: nextPaused,
      limitReached: reachedLimit || Boolean(active.limitReached)
    };
  }

  function stopFeedbackSession(options = {}) {
    return enqueueActiveSessionOperation(() => stopFeedbackSessionUnlocked(options));
  }

  async function stopFeedbackSessionUnlocked({ sessionId, reason, openReview, senderTab } = {}) {
    const active = await getActiveFeedbackSession();
    if (!active || (sessionId && active.sessionId !== sessionId)) {
      return { ok: false, reason: 'No matching Feedback Session is active.' };
    }

    if (senderTab?.id && senderTab.id !== active.tabId) {
      return { ok: false, reason: 'Stop the session from the tab where it is recording.' };
    }

    await chrome.storage.session.set({
      [ACTIVE_SESSION_KEY]: {
        ...active,
        status: 'stopping'
      }
    });
    const stoppedAt = new Date().toISOString();
    const stopReason = typeof reason === 'string' && reason ? reason : 'user-stopped';
    const stoppedSession = await enqueueSessionOperation(active.sessionId, async () => {
      const storageKey = makeSessionStorageKey(active.sessionId);
      const stored = await chrome.storage.local.get([storageKey]);
      const storedSession = sanitizeFeedbackSession(stored[storageKey]);
      if (!storedSession) {
        return null;
      }
      const appended = appendSessionEvent(storedSession, {
        type: 'session-stop',
        timestamp: stoppedAt,
        pageUrl: senderTab?.url || storedSession.lastUrl,
        pageTitle: senderTab?.title || storedSession.lastTitle,
        details: {
          reason: stopReason
        }
      });
      const next = {
        ...(appended.session || storedSession),
        status: stopReason === 'user-stopped' ? 'completed' : 'interrupted',
        endedAt: stoppedAt,
        stopReason
      };
      await storeFeedbackSession(next);
      return next;
    });
    if (!stoppedSession) {
      await chrome.storage.session.remove(ACTIVE_SESSION_KEY);
      await setFeedbackSessionBadge(active.tabId, 'off');
      return { ok: false, reason: 'The active Feedback Session record is missing.' };
    }

    await chrome.storage.session.remove(ACTIVE_SESSION_KEY);
    await setFeedbackSessionBadge(active.tabId, 'off');
    if (stopReason !== 'tab-closed') {
      await sendTabMessage(active.tabId, { action: 'deactivate-feedback-session-recorder' }).catch(() => {});
    }
    if (openReview) {
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`sessions.html?session=${encodeURIComponent(stoppedSession.id)}`)
      });
    }

    return { ok: true, session: summarizeFeedbackSession(stoppedSession) };
  }

  async function stopFeedbackSessionForClosedTab(tabId) {
    const active = await getActiveFeedbackSession();
    if (!active || active.tabId !== tabId) {
      return;
    }
    await stopFeedbackSession({
      sessionId: active.sessionId,
      reason: 'tab-closed',
      openReview: false
    });
  }

  async function listFeedbackSessions() {
    const storedIndex = await chrome.storage.local.get([SESSION_INDEX_KEY]);
    const ids = Array.isArray(storedIndex[SESSION_INDEX_KEY])
      ? storedIndex[SESSION_INDEX_KEY].filter((id) => typeof id === 'string')
      : [];
    const keys = ids.map(makeSessionStorageKey);
    const stored = keys.length ? await chrome.storage.local.get(keys) : {};
    const sessions = ids
      .map((id) => sanitizeFeedbackSession(stored[makeSessionStorageKey(id)]))
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));

    return { ok: true, sessions };
  }

  async function getFeedbackSession(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId) {
      return { ok: false, reason: 'Missing Feedback Session id.', session: null };
    }
    const storageKey = makeSessionStorageKey(sessionId);
    const stored = await chrome.storage.local.get([storageKey]);
    return { ok: true, session: sanitizeFeedbackSession(stored[storageKey]) };
  }

  async function updateFeedbackSessionSummary(sessionId, summary) {
    const session = await updateStoredFeedbackSession(sessionId, (current) => ({
      ...current,
      summary: typeof summary === 'string' ? summary : ''
    }));
    return session
      ? { ok: true, session }
      : { ok: false, reason: 'Feedback Session not found.' };
  }

  async function deleteFeedbackSession(sessionId) {
    const active = await getActiveFeedbackSession();
    if (active?.sessionId === sessionId) {
      return { ok: false, reason: 'Stop the active Feedback Session before deleting it.' };
    }
    await chrome.storage.local.remove(makeSessionStorageKey(sessionId));
    await removeFeedbackSessionFromIndex(sessionId);
    return { ok: true };
  }

  async function clearFeedbackSessions() {
    const active = await getActiveFeedbackSession();
    if (active) {
      return { ok: false, reason: 'Stop the active Feedback Session before clearing saved sessions.' };
    }
    const storedIndex = await chrome.storage.local.get([SESSION_INDEX_KEY]);
    const ids = Array.isArray(storedIndex[SESSION_INDEX_KEY]) ? storedIndex[SESSION_INDEX_KEY] : [];
    await chrome.storage.local.remove(ids.map(makeSessionStorageKey).concat(SESSION_INDEX_KEY));
    return { ok: true };
  }

  async function getActiveFeedbackSession() {
    const stored = await chrome.storage.session.get([ACTIVE_SESSION_KEY]);
    const active = stored[ACTIVE_SESSION_KEY];
    return (
      active &&
      typeof active.sessionId === 'string' &&
      Number.isInteger(active.tabId)
    ) ? active : null;
  }

  async function reconcileStaleFeedbackSessions() {
    const active = await getActiveFeedbackSession();
    const storedIndex = await chrome.storage.local.get([SESSION_INDEX_KEY]);
    const ids = Array.isArray(storedIndex[SESSION_INDEX_KEY]) ? storedIndex[SESSION_INDEX_KEY] : [];
    if (!ids.length) {
      return;
    }
    const keys = ids.map(makeSessionStorageKey);
    const stored = await chrome.storage.local.get(keys);
    const endedAt = new Date().toISOString();

    for (const id of ids) {
      if (active?.sessionId === id) {
        continue;
      }
      const storageKey = makeSessionStorageKey(id);
      const session = sanitizeFeedbackSession(stored[storageKey]);
      if (!session || !['recording', 'paused'].includes(session.status)) {
        continue;
      }
      const appended = appendSessionEvent(session, {
        type: 'session-stop',
        timestamp: endedAt,
        pageUrl: session.lastUrl,
        pageTitle: session.lastTitle
      });
      await storeFeedbackSession({
        ...(appended.session || session),
        status: 'interrupted',
        endedAt,
        stopReason: 'browser-or-extension-restarted'
      });
    }
  }

  async function storeFeedbackSession(session) {
    const sanitized = sanitizeFeedbackSession(session);
    if (!sanitized) {
      throw new Error('Invalid Feedback Session record.');
    }
    await chrome.storage.local.set({
      [makeSessionStorageKey(sanitized.id)]: sanitized
    });
    return sanitized;
  }

  function updateStoredFeedbackSession(sessionId, mutate) {
    return enqueueSessionOperation(sessionId, async () => {
      const response = await getFeedbackSession(sessionId);
      if (!response.session) {
        return null;
      }
      return storeFeedbackSession(mutate(response.session));
    });
  }

  function enqueueSessionOperation(sessionId, operation) {
    const queueKey = String(sessionId || '');
    const previous = sessionMutationQueues.get(queueKey) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    sessionMutationQueues.set(queueKey, current);
    const clearQueue = () => {
      if (sessionMutationQueues.get(queueKey) === current) {
        sessionMutationQueues.delete(queueKey);
      }
    };
    current.then(clearQueue, clearQueue);
    return current;
  }

  function enqueueActiveSessionOperation(operation) {
    return enqueueSessionOperation(`${ACTIVE_SESSION_KEY}:mutation`, operation);
  }

  function updateActiveFeedbackSession(sessionId, mutate) {
    return enqueueActiveSessionOperation(async () => {
      const active = await getActiveFeedbackSession();
      if (!active || active.sessionId !== sessionId) {
        return null;
      }
      const next = mutate({ ...active });
      if (!next) {
        await chrome.storage.session.remove(ACTIVE_SESSION_KEY);
        return null;
      }
      await chrome.storage.session.set({ [ACTIVE_SESSION_KEY]: next });
      return next;
    });
  }

  async function addFeedbackSessionToIndex(sessionId) {
    await enqueueSessionOperation(SESSION_INDEX_KEY, async () => {
      const stored = await chrome.storage.local.get([SESSION_INDEX_KEY]);
      const current = Array.isArray(stored[SESSION_INDEX_KEY]) ? stored[SESSION_INDEX_KEY] : [];
      const next = [sessionId, ...current.filter((id) => id !== sessionId)];
      const removed = next.slice(MAX_STORED_SESSIONS);
      await chrome.storage.local.set({ [SESSION_INDEX_KEY]: next.slice(0, MAX_STORED_SESSIONS) });
      if (removed.length) {
        await chrome.storage.local.remove(removed.map(makeSessionStorageKey));
      }
    });
  }

  async function removeFeedbackSessionFromIndex(sessionId) {
    await enqueueSessionOperation(SESSION_INDEX_KEY, async () => {
      const stored = await chrome.storage.local.get([SESSION_INDEX_KEY]);
      const current = Array.isArray(stored[SESSION_INDEX_KEY]) ? stored[SESSION_INDEX_KEY] : [];
      await chrome.storage.local.set({
        [SESSION_INDEX_KEY]: current.filter((id) => id !== sessionId)
      });
    });
  }

  async function setFeedbackSessionBadge(tabId, state) {
    if (!Number.isInteger(tabId)) {
      return;
    }
    const text = state === 'recording' ? 'REC' : state === 'paused' ? 'II' : '';
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: state === 'recording' ? '#b63849' : '#7b7188'
    }).catch(() => {});
    await chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  }

  function summarizeFeedbackSession(session) {
    return {
      id: session.id,
      status: session.status,
      tabId: session.tabId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      startUrl: session.startUrl,
      lastUrl: session.lastUrl,
      eventCount: session.eventCount,
      truncated: session.truncated
    };
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
