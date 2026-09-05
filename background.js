(function() {
  'use strict';

  importScripts('shared.js');

  const {
    FEEDBACK_STORAGE_PREFIX,
    REGION_CAPTURE_SESSION_PREFIX,
    buildFeedbackId,
    canInjectIntoUrl,
    sanitizeFeedbackItems,
    detectSourceKind
  } = globalThis.DevFeedbackShared;
  const REGION_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
  const mutationQueues = new Map();

  const ELEMENT_SESSION_PREFIX = 'dev-feedback-element-session-';
  const HISTORY_SESSION_PREFIX = 'dev-feedback-history-session-';
  const SESSION_PREFIXES = [REGION_CAPTURE_SESSION_PREFIX, ELEMENT_SESSION_PREFIX, HISTORY_SESSION_PREFIX];
  const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
  const MAX_ITEM_BYTES = 3 * 1024 * 1024;
  const MAX_ITEMS_PER_SITE = 500;
  const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  storageReady.catch(error => console.error('History access restriction failed:', error.message));

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    respondAsync(handleRequest(request, sender), sendResponse);
    return true;
  });

  function trustedPage(sender) {
    if (sender.id !== chrome.runtime.id) return '';
    try {
      const url = new URL(sender.url);
      const page = url.pathname.slice(1);
      if (sender.frameId && !['element.html','history.html'].includes(page)) return '';
      return url.protocol === new URL(chrome.runtime.getURL('')).protocol && url.host === new URL(chrome.runtime.getURL('')).host && ['popup.html', 'history.html', 'element.html'].includes(page) ? page : '';
    } catch { return ''; }
  }

  async function ownedSession(sender, page) {
    const id = new URL(sender.url).searchParams.get('session');
    if (!id || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid capture session.');
    const key = (page === 'history.html' ? HISTORY_SESSION_PREFIX : ELEMENT_SESSION_PREFIX) + id;
    const session = (await chrome.storage.session.get(key))[key];
    if (!session || !Number.isFinite(Date.parse(session.createdAt)) || session.editorTabId !== sender.tab?.id || Date.now() - Date.parse(session.createdAt) > REGION_SESSION_MAX_AGE_MS) {
      throw new Error('This capture session expired or belongs to another editor.');
    }
    if (session.embedded) {
      const source = await chrome.tabs.get(session.tabId);
      if (source.url !== (session.rawTabUrl || session.pageUrl) || sender.frameId <= 0) throw new Error('The source page changed. Capture again.');
      if (session.editorDocumentId && session.editorDocumentId !== sender.documentId) throw new Error('This session belongs to another frame.');
      if (!session.editorDocumentId) {
        if (!sender.documentId) throw new Error('Missing editor document identity.');
        session.editorDocumentId = sender.documentId;
        await chrome.storage.session.set({ [key]:session });
      }
    } else if (sender.frameId) throw new Error('This session requires its capture window.');
    return { key, session };
  }

  async function handleRequest(request, sender) {
    await storageReady;
    if (!request || typeof request !== 'object' || typeof request.action !== 'string' || sender.id !== chrome.runtime.id) throw new Error('Invalid extension request.');
    const page = trustedPage(sender);
    const contentSender = !page && sender.frameId === 0 && Number.isInteger(sender.tab?.id) && canInjectIntoUrl(sender.url) && sender.url === sender.tab.url;
    if (!page && !contentSender) throw new Error('Untrusted request sender.');
    if (request.action === 'open-history' && (page || contentSender)) {
      const tabId = contentSender || sender.frameId ? sender.tab?.id : request.tabId;
      const tab = Number.isInteger(tabId) ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({active:true,currentWindow:true}))[0];
      if (!tab?.id || !canInjectIntoUrl(tab.url) || detectSourceKind(tab.url) === 'pdf') return {ok:true,usePopup:true};
      await assertCaptureTab(tab);
      const injected = await ensureContentScript(tab.id, tab.url);
      if (!injected.ok) return {ok:true,usePopup:true};
      const session = {sessionId:buildFeedbackId(),tabId:tab.id,pageUrl:tab.url,createdAt:new Date().toISOString()};
      return openCaptureEditor(HISTORY_SESSION_PREFIX,session,'history.html');
    }
    if (request.action === 'start-element-capture' && contentSender) return startElementCapture(sender, request.snapshot);
    if (request.action === 'ensure-content-script' && page === 'popup.html') {
      const tab = await chrome.tabs.get(request.tabId);
      await assertCaptureTab(tab);
      return ensureContentScript(tab.id, tab.url);
    }
    if (page === 'history.html') {
      if (sender.frameId) {
        const {key,session} = await ownedSession(sender,page);
        if (request.action === 'close-history') {
          await chrome.storage.session.remove(key);
          await chrome.tabs.sendMessage(session.tabId,{action:'close-capture-overlay',sessionId:session.sessionId},{frameId:0}).catch(()=>{});
          return {ok:true};
        }
      }

      if (request.action === 'edit-feedback-note') {
        if (typeof request.itemId !== 'string' || typeof request.note !== 'string' || !request.note.trim() || request.note.length > 2000) throw new Error('Write a note of up to 2000 characters.');
        return mutateFeedbackItems(request.storageKey, items => {
          if (!items.some(item => item.id === request.itemId)) throw new Error('This note was deleted. Refresh History.');
          return items.map(item => item.id === request.itemId ? {
            ...item, note:request.note.trim(), acceptance:request.acceptance,
            changeRequest:{ ...item.changeRequest, summary:request.note.trim() }
          } : item);
        });
      }
      if (request.action === 'list-feedback-history') return listFeedbackHistory();
      if (request.action === 'delete-feedback-items') {
        if (!Array.isArray(request.itemIds) || request.itemIds.length > MAX_ITEMS_PER_SITE || request.itemIds.some(id => typeof id !== 'string')) throw new Error('Invalid selection.');
        return mutateFeedbackItems(request.storageKey, items => items.filter(item => !request.itemIds.includes(item.id)));
      }
    }
    if (page === 'element.html') {
      const { key, session } = await ownedSession(sender, page);
      if (request.action === 'get-capture-session') return { ok:true, session };
      if (request.action === 'clear-capture-session') {
        await chrome.storage.session.remove(key);
        if (session.embedded) await chrome.tabs.sendMessage(session.tabId, { action:'close-capture-overlay', sessionId:session.sessionId, pickNext:request.pickNext === true }, { frameId:0 }).catch(()=>{});
        return { ok:true };
      }
      if (request.action === 'add-feedback-item') {
        if (!request.item || typeof request.item !== 'object') throw new Error('Missing capture.');
        const item = globalThis.DevFeedbackShared.createElementRecord({
          id:session.sessionId, pageUrl:session.pageUrl, pageTitle:session.pageTitle,
          selector:session.snapshot.selector, elementInfo:session.snapshot,
          position:session.snapshot.position, pageContext:session.pageContext,
          note:request.item.note, acceptance:request.item.acceptance, timestamp:new Date().toISOString()
        });
        await addFeedbackItem(globalThis.DevFeedbackShared.makeStorageKey(session.pageUrl), item);
        return { ok:true };
      }
    }
    throw new Error('This action is not allowed from this context.');
  }

  async function assertCaptureTab(expected) {
    const tab = await chrome.tabs.get(expected.id);
    const active = await chrome.tabs.query({ active:true, windowId:expected.windowId });
    if (tab.id !== expected.id || tab.url !== expected.url || tab.windowId !== expected.windowId || tab.pendingUrl || !active.some(value => value.id === expected.id)) {
      throw new Error('The source tab changed. Return to the page and capture again.');
    }
    return tab;
  }

  async function runCollector(tabId, operation, args = []) {
    await chrome.scripting.executeScript({ target:{ tabId }, files:['shared.js', 'collector.js'] });
    const results = await chrome.scripting.executeScript({
      target:{ tabId },
      func: (method, values) => globalThis.DevFeedbackCollector[method](...values),
      args:[operation, args]
    });
    return results[0]?.result;
  }

  async function startElementCapture(sender, rawSnapshot) {
    const tab = await assertCaptureTab(sender.tab);
    if (!rawSnapshot || typeof rawSnapshot.selector !== 'string' || rawSnapshot.selector.length > 2000) throw new Error('Invalid element target.');
    const sessionId = buildFeedbackId();
    const snapshot = { ...globalThis.DevFeedbackShared.sanitizeElementInfo(rawSnapshot), selector:rawSnapshot.selector, position:rawSnapshot.position };
    const pageContext = await runCollector(tab.id, 'buildPageContext');
    await assertCaptureTab(tab);
    const session = { sessionId, tabId:tab.id, pageUrl:tab.url, pageTitle:tab.title || '', snapshot, pageContext, createdAt:new Date().toISOString() };
    return openCaptureEditor(ELEMENT_SESSION_PREFIX, session, 'element.html');
  }

  async function openCaptureEditor(prefix, session, page) {
    const key = prefix + session.sessionId;
    const injected = await ensureContentScript(session.tabId, session.pageUrl);
    if (!injected.ok) throw new Error(injected.reason);
    await chrome.storage.session.set({ [key]:{ ...session, editorTabId:session.tabId, embedded:true } });
    try {
      const shown = await chrome.tabs.sendMessage(session.tabId, { action:'show-capture-overlay', sessionId:session.sessionId, page }, { frameId:0 });
      if (!shown?.ok) throw new Error(shown?.reason || 'Could not open the note editor.');
      return { ok:true, sessionId:session.sessionId };
    } catch (error) {
      await chrome.storage.session.remove(key);
      throw error;
    }
  }

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
    if (!tabId || (!canInjectIntoUrl(rawUrl) || detectSourceKind(rawUrl) === 'pdf')) {
      return { ok: false, reason: 'Open a webpage to pick an element. PDF and browser-internal pages are not supported.' };
    }

    try {
      const result = await chrome.scripting.executeScript({target:{tabId},func:()=>document.contentType});
      if (result[0]?.result === 'application/pdf') return {ok:false,reason:'PDF capture is no longer offered. Open a webpage to pick an element.'};
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
        files: ['shared.js', 'collector.js', 'content.js']
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message || 'Unable to inject the feedback UI on this page.' };
    }
  }

  async function clearRegionSessionsForEditorTab(tabId) {
    const sessions = await chrome.storage.session.get(null);
    const keys = Object.entries(sessions)
      .filter(([key, value]) => SESSION_PREFIXES.some(prefix => key.startsWith(prefix)) && value?.editorTabId === tabId)
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
        if (!SESSION_PREFIXES.some(prefix => key.startsWith(prefix))) {
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

    return { ok:true, histories, bytesUsed:await chrome.storage.local.getBytesInUse(null), byteLimit:MAX_HISTORY_BYTES };
  }

  async function getFeedbackItems(storageKey) {
    if (!isFeedbackStorageKey(storageKey)) {
      return { ok: false, reason: 'Invalid feedback storage key.' };
    }
    return enqueueFeedbackOperation('history', async () => {
      const stored = await chrome.storage.local.get([storageKey]);
      const { items, needsMigration } = normalizeStoredFeedbackItems(stored[storageKey]);
      if (needsMigration) {
        await chrome.storage.local.set({ [storageKey]: items });
      }
      return { ok: true, items };
    });
  }

  async function addFeedbackItem(storageKey, item) {
    return mutateFeedbackItems(storageKey, (items) => items.some(existing => existing.id === item.id) ? items : items.concat(item));
  }

  function mutateFeedbackItems(storageKey, mutate) {
    if (!isFeedbackStorageKey(storageKey)) {
      return Promise.resolve({ ok: false, reason: 'Invalid feedback storage key.' });
    }

    return enqueueFeedbackOperation('history', async () => {
      const stored = await chrome.storage.local.get([storageKey]);
      const { items: currentItems } = normalizeStoredFeedbackItems(stored[storageKey]);
      const nextItems = sanitizeFeedbackItems(mutate(currentItems));
      if (nextItems.length > MAX_ITEMS_PER_SITE && nextItems.length > currentItems.length) throw new Error('This site has 500 captures. Export and delete older items before saving. Your draft is still open.');
      const encodedBytes = new TextEncoder().encode(JSON.stringify(nextItems)).length;
      const largest = Math.max(0, ...nextItems.map(item => new TextEncoder().encode(JSON.stringify(item)).length));
      const [used, previous] = await Promise.all([chrome.storage.local.getBytesInUse(null), chrome.storage.local.getBytesInUse(storageKey)]);
      if ((nextItems.length > currentItems.length || encodedBytes > new TextEncoder().encode(JSON.stringify(currentItems)).length) && (largest > MAX_ITEM_BYTES || used - previous + encodedBytes + storageKey.length > MAX_HISTORY_BYTES)) {
        throw new Error('History is nearly full or this capture is too large. Export and delete older items, or shorten this note. Your draft is still open.');
      }
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
    const needsMigration = JSON.stringify(rawItems) !== JSON.stringify(normalized);
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

})();
