(function() {
  'use strict';

  // Safari loads shared.js and its platform file as background page scripts; Chrome's service worker imports it.
  if (!globalThis.DevFeedbackShared) importScripts('shared.js');

  const {
    FEEDBACK_STORAGE_PREFIX,
    REGION_CAPTURE_SESSION_PREFIX,
    buildClipboardText,
    buildFeedbackId,
    canInjectIntoUrl,
    makeStorageKey,
    safeShareUrl,
    sanitizeFeedbackItems,
    detectSourceKind
  } = globalThis.DevFeedbackShared;
  const REGION_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
  const mutationQueues = new Map();

  const ELEMENT_SESSION_PREFIX = 'dev-feedback-element-session-';
  const SESSION_PREFIXES = [REGION_CAPTURE_SESSION_PREFIX, ELEMENT_SESSION_PREFIX];
  const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
  const MAX_ITEM_BYTES = 3 * 1024 * 1024;
  const MAX_ITEMS_PER_SITE = 500;
  // Where History lives and who writes the clipboard. Safari supplies its own (safari/platform.js);
  // Chrome keeps History in storage.local, closed to content scripts, and copies from the note frame.
  const platform = globalThis.DevFeedbackPlatform || chromePlatform();
  const storageReady = platform.ready;
  storageReady.catch(() => {});

  function chromePlatform() {
    const local = chrome.storage.local;
    return {
      ready:Promise.resolve()
        .then(() => local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }))
        .catch(error => {
          console.error('History access restriction failed:', error.message);
          throw new Error('This browser cannot keep saved notes private to the extension, so picking is off.');
        }),
      history:{
        async read(storageKey) { return (await local.get([storageKey]))[storageKey]; },
        async write(storageKey, items) { await local.set({ [storageKey]:items }); },
        async usage(storageKey) {
          const [total, key] = await Promise.all([local.getBytesInUse(null), local.getBytesInUse(storageKey)]);
          return { total, key };
        }
      },
      writeClipboard:null
    };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    respondAsync(handleRequest(request, sender), sendResponse);
    return true;
  });

  function trustedPage(sender) {
    if (sender.id !== chrome.runtime.id) return '';
    try {
      const url = new URL(sender.url);
      const page = url.pathname.slice(1);
      if (sender.frameId && page !== 'element.html') return '';
      return url.protocol === new URL(chrome.runtime.getURL('')).protocol && url.host === new URL(chrome.runtime.getURL('')).host && ['popup.html', 'element.html'].includes(page) ? page : '';
    } catch { return ''; }
  }

  async function ownedSession(sender) {
    const id = new URL(sender.url).searchParams.get('session');
    if (!id || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid capture session.');
    const key = ELEMENT_SESSION_PREFIX + id;
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
    // Embedded frames (an artifact or preview iframe) may pick and stop picking, nothing else.
    const frameSender = !page && sender.frameId > 0 && Number.isInteger(sender.tab?.id) && canInjectIntoUrl(sender.url);
    if (!page && !contentSender && !frameSender) throw new Error('Untrusted request sender.');
    if (request.action === 'start-element-capture' && (contentSender || frameSender)) return startElementCapture(sender, request.snapshot, request.rect, request.frame);
    if (request.action === 'stop-picking' && (contentSender || frameSender)) return setPicking(sender.tab.id, false);
    if (request.action === 'set-picking' && page === 'popup.html') {
      const tab = await chrome.tabs.get(request.tabId);
      await assertCaptureTab(tab);
      if (request.enabled === true) {
        const injected = await ensureContentScript(tab.id, tab.url);
        if (!injected.ok) return injected;
      }
      return setPicking(tab.id, request.enabled === true);
    }
    if (request.action === 'list-page-feedback' && page === 'popup.html') {
      if (!isFeedbackStorageKey(request.storageKey)) throw new Error('Invalid feedback storage key.');
      return { ok:true, items:normalizeStoredFeedbackItems(await platform.history.read(request.storageKey)).items };
    }
    if (request.action === 'copy-page-feedback' && page === 'popup.html') {
      if (typeof request.pageUrl !== 'string') throw new Error('Invalid page.');
      return copyPageFeedback(request.pageUrl);
    }
    if (request.action === 'delete-feedback-items' && page === 'popup.html') {
      if (!Array.isArray(request.itemIds) || request.itemIds.length > MAX_ITEMS_PER_SITE || request.itemIds.some(id => typeof id !== 'string')) throw new Error('Invalid selection.');
      return mutateFeedbackItems(request.storageKey, items => items.filter(item => !request.itemIds.includes(item.id)));
    }
    if (page === 'element.html') {
      const { key, session } = await ownedSession(sender);
      if (request.action === 'get-capture-session') return { ok:true, session };
      if (request.action === 'clear-capture-session') {
        await chrome.storage.session.remove(key);
        const count = Number.isInteger(request.count) ? request.count : 0;
        const toast = request.saved !== true ? ''
          : request.copied === true ? `Copied this page's feedback · ${count} item${count === 1 ? '' : 's'}`
          : 'Saved. Copy it from the extension menu.';
        await chrome.tabs.sendMessage(session.tabId, { action:'close-capture-overlay', sessionId:session.sessionId, toast }, { frameId:0 }).catch(()=>{});
        await setPicking(session.tabId, true);
        return { ok:true };
      }
      if (request.action === 'add-feedback-item') {
        if (!request.item || typeof request.item !== 'object') throw new Error('Missing capture.');
        const item = globalThis.DevFeedbackShared.createElementRecord({
          id:session.sessionId, pageUrl:session.pageUrl, pageTitle:session.pageTitle,
          selector:session.snapshot.selector, elementInfo:session.snapshot,
          position:session.snapshot.position, pageContext:session.pageContext,
          note:typeof request.item.note === 'string' ? request.item.note : '', timestamp:new Date().toISOString()
        });
        // Each save copies every stored capture on this page, the same list and order as Copy all in the menu.
        const stored = await addFeedbackItem(makeStorageKey(session.pageUrl), item);
        if (!stored.ok) return stored;
        // Saved either way; a failed copy leaves the note open with Copy again, which repeats this idempotent save.
        return copyPageFeedback(session.pageUrl).catch(error => {
          console.error('Copy after save failed:', error.message);
          return { ok:true, copied:false, count:0 };
        });
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

  async function startElementCapture(sender, rawSnapshot, rawRect, rawFrame) {
    const tab = await assertCaptureTab(sender.tab);
    if (!rawSnapshot || typeof rawSnapshot.selector !== 'string' || rawSnapshot.selector.length > 2000) throw new Error('Invalid element target.');
    const sessionId = buildFeedbackId();
    const snapshot = { ...globalThis.DevFeedbackShared.sanitizeElementInfo(rawSnapshot), selector:rawSnapshot.selector, position:rawSnapshot.position };
    const pageContext = await runCollector(tab.id, 'buildPageContext');
    await assertCaptureTab(tab);
    // Where the element sits in its own frame, so the note opens beside it.
    const rect = ['left', 'top', 'right', 'bottom'].every(side => Number.isFinite(rawRect?.[side]))
      ? { left:rawRect.left, top:rawRect.top, right:rawRect.right, bottom:rawRect.bottom } : null;
    // The frame's own URL comes from Chrome, not the page; its viewport size helps tell same-origin frames apart.
    const frame = sender.frameId > 0
      ? { url:sender.url, width:Number.isFinite(rawFrame?.width) ? rawFrame.width : 0, height:Number.isFinite(rawFrame?.height) ? rawFrame.height : 0 } : null;
    const session = { sessionId, tabId:tab.id, pageUrl:tab.url, pageTitle:tab.title || '', snapshot, pageContext, anchor:{ frameId:sender.frameId, rect, frame }, createdAt:new Date().toISOString() };
    const opened = await openCaptureEditor(session);
    await setPicking(tab.id, false);
    return opened;
  }

  // Every frame keeps its own picker, so on/off goes to all of them at once. The badge shows it is on.
  async function setPicking(tabId, enabled) {
    await chrome.tabs.sendMessage(tabId, { action:'set-feedback-mode', enabled }).catch(() => {});
    await chrome.action.setBadgeText({ tabId, text:enabled ? 'ON' : '' }).catch(() => {});
    return { ok:true };
  }

  // Granting an embedded site from the popup can close the popup, so finish the job here.
  chrome.permissions.onAdded.addListener(() => {
    withActiveTab(async (tab) => {
      if (!tab?.id) return;
      const state = await chrome.tabs.sendMessage(tab.id, { action:'get-state' }, { frameId:0 }).catch(() => null);
      if (!state?.feedbackMode) return;
      const injected = await ensureContentScript(tab.id, tab.url);
      if (injected.ok) await setPicking(tab.id, true);
    }).catch(error => console.debug('Unable to pick in newly allowed frames:', error.message));
  });

  chrome.action.setBadgeBackgroundColor({ color:'#4f46e5' }).catch(() => {});

  async function openCaptureEditor(session) {
    const key = ELEMENT_SESSION_PREFIX + session.sessionId;
    const injected = await ensureContentScript(session.tabId, session.pageUrl);
    if (!injected.ok) throw new Error(injected.reason);
    await chrome.storage.session.set({ [key]:{ ...session, editorTabId:session.tabId, embedded:true } });
    try {
      const shown = await chrome.tabs.sendMessage(session.tabId, { action:'show-capture-overlay', sessionId:session.sessionId, anchor:session.anchor }, { frameId:0 });
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

      await storageReady;
      const injected = await ensureContentScript(activeTab.id, activeTab.url);
      if (!injected.ok) {
        console.debug('Unable to inject content script from command:', injected.reason);
        return;
      }

      const state = await chrome.tabs.sendMessage(activeTab.id, { action:'get-state' }, { frameId:0 }).catch(() => null);
      if (!state || state.editorOpen) return;
      await setPicking(activeTab.id, !state.feedbackMode);
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
        target: { tabId, allFrames: true },
        files: ['styles.css']
      });
    } catch (error) {
      if (!String(error && error.message).includes('Cannot access')) {
        console.debug('Unable to inject styles:', error.message);
      }
    }

    try {
      // Cross-origin frames are reached only once the user allows their site from the popup.
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
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

  // This page's stored feedback, oldest first. Where the browser can write the clipboard natively
  // (Safari), it is written here and the result says whether it landed; otherwise the caller copies the text.
  // Queued behind History writes, so the last copy holds the latest saves.
  function copyPageFeedback(pageUrl) {
    const storageKey = makeStorageKey(pageUrl);
    if (!isFeedbackStorageKey(storageKey)) throw new Error('Invalid feedback storage key.');
    return enqueueFeedbackOperation('history', async () => {
      const page = safeShareUrl(pageUrl);
      const pageItems = normalizeStoredFeedbackItems(await platform.history.read(storageKey)).items.filter(saved => safeShareUrl(saved.pageUrl) === page);
      const text = buildClipboardText(pageItems);
      if (!platform.writeClipboard) return { ok:true, clipboard:text, count:pageItems.length };
      const copied = await platform.writeClipboard(text).catch(error => {
        console.error('Clipboard write failed:', error.message);
        return false;
      });
      return { ok:true, copied:copied === true, count:pageItems.length };
    });
  }

  // The id is the editor session's, so only that note frame can reach its own record. A repeat keeps the
  // record in place; if the reply to an earlier save was lost and the note was edited, the edit replaces it.
  async function addFeedbackItem(storageKey, item) {
    return mutateFeedbackItems(storageKey, (items) => items.some(existing => existing.id === item.id)
      ? items.map(existing => existing.id === item.id && existing.note !== item.note ? { ...existing, note:item.note } : existing)
      : items.concat(item));
  }

  function mutateFeedbackItems(storageKey, mutate) {
    if (!isFeedbackStorageKey(storageKey)) {
      return Promise.resolve({ ok: false, reason: 'Invalid feedback storage key.' });
    }

    return enqueueFeedbackOperation('history', async () => {
      const { items: currentItems } = normalizeStoredFeedbackItems(await platform.history.read(storageKey));
      const nextItems = sanitizeFeedbackItems(mutate(currentItems));
      if (nextItems.length > MAX_ITEMS_PER_SITE && nextItems.length > currentItems.length) throw new Error('This site has 500 captures. Export and delete older items before saving. Your draft is still open.');
      const encodedBytes = new TextEncoder().encode(JSON.stringify(nextItems)).length;
      const largest = Math.max(0, ...nextItems.map(item => new TextEncoder().encode(JSON.stringify(item)).length));
      const { total:used, key:previous } = await platform.history.usage(storageKey);
      if ((nextItems.length > currentItems.length || encodedBytes > new TextEncoder().encode(JSON.stringify(currentItems)).length) && (largest > MAX_ITEM_BYTES || used - previous + encodedBytes + storageKey.length > MAX_HISTORY_BYTES)) {
        throw new Error('History is nearly full or this capture is too large. Export and delete older items, or shorten this note. Your draft is still open.');
      }
      await platform.history.write(storageKey, nextItems);
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

})();
