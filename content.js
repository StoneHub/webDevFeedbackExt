// The page sees only public targeting controls. Notes and History live in extension pages.
// Runs in every frame the extension can reach; the background keeps picking in sync across them.
(function() {
  'use strict';
  if (globalThis.__DEV_FEEDBACK_CAPTURE_LOADED__) return;
  globalThis.__DEV_FEEDBACK_CAPTURE_LOADED__ = true;
  let active = false;
  let busy = false;
  let highlighted = null;
  let editor = null;
  let editorSession = null;
  let previousFocus = null;
  let statusTimer = null;
  const host = document.createElement('div');
  host.dataset.devFeedbackPicker = '';
  const shadow = host.attachShadow({ mode: 'closed' });
  // Instructions live in the extension menu. The page only gets the editor and a brief error notice.
  shadow.innerHTML = `<style>
    :host { all:initial; position:fixed; top:12px; right:12px; z-index:2147483647; pointer-events:none; }
    :host([hidden]) { display:none !important; }
    iframe { pointer-events:auto; }
    [role="status"] { font:13px/1.4 system-ui; color:#172139; background:#fff; padding:8px 12px; border:2px solid #4f46e5; border-radius:10px; box-shadow:0 4px 24px #0003; max-width:280px; }
  </style><div role="status" hidden></div>`;
  document.documentElement.appendChild(host);
  host.hidden = true;
  const status = shadow.querySelector('[role="status"]');
  function showStatus(message) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = false;
    host.hidden = false;
    statusTimer = setTimeout(() => { status.hidden = true; if (!editor) host.hidden = true; }, 4000);
  }
  function clearHighlight() {
    highlighted?.classList.remove('dev-feedback-highlight');
    highlighted = null;
  }
  function setActive(value) {
    if (editor) return;
    active = Boolean(value);
    if (!active) clearHighlight();
  }
  function stopEverywhere() {
    setActive(false);
    chrome.runtime.sendMessage({ action: 'stop-picking' }).catch(() => {});
  }
  document.addEventListener('mouseover', event => {
    if (!active || host.contains(event.target) || event.target === host) return;
    clearHighlight();
    // An embedded frame highlights its own elements when the extension can reach it.
    if (event.target.tagName === 'IFRAME' || event.target.tagName === 'FRAME') return;
    highlighted = event.target; highlighted.classList.add('dev-feedback-highlight');
  }, true);
  async function pick(target) {
    if (busy || !target || target === document.body || target === document.documentElement) return;
    busy = true;
    clearHighlight();
    try {
      const snapshot = globalThis.DevFeedbackCollector.buildElementSnapshot(target);
      const response = await chrome.runtime.sendMessage({ action: 'start-element-capture', snapshot });
      if (!response?.ok) throw new Error(response?.reason || 'Could not open the editor.');
    } catch {
      showStatus('Could not open the editor. Try picking the element again.');
    } finally { busy = false; }
  }
  document.addEventListener('click', event => {
    if (!event.isTrusted || !active || event.composedPath().includes(host)) return;
    event.preventDefault(); event.stopImmediatePropagation(); pick(event.target);
  }, true);
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || !active) return;
    if (event.key === 'Escape') { event.preventDefault(); stopEverywhere(); }
    if (event.altKey && event.key === 'Enter' && !event.composedPath().includes(host)) {
      event.preventDefault(); pick(document.activeElement);
    }
  }, true);
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (request.action === 'show-capture-overlay') {
      if (editor) { sendResponse({ok:false,reason:'Save or cancel the open draft first.'}); return; }
      if (!['element.html','history.html'].includes(request.page) || !/^[a-zA-Z0-9-]{1,100}$/.test(request.sessionId)) return;
      setActive(false);
      editor?.remove();
      previousFocus = document.activeElement;
      editorSession = request.sessionId;
      editor = document.createElement('iframe');
      editor.allow = 'clipboard-write';
      editor.title = request.page === 'history.html' ? 'Feedback History' : 'Write element feedback';
      editor.src = chrome.runtime.getURL(request.page + '?session=' + encodeURIComponent(editorSession));
      editor.style.cssText = request.page === 'history.html'
        ? 'display:block;width:min(440px,calc(100vw - 24px));height:calc(100vh - 24px);border:1px solid #a5a0dd;border-radius:14px;background:white;box-shadow:0 8px 40px #0003;'
        : 'display:block;width:min(380px,calc(100vw - 24px));height:min(510px,calc(100vh - 24px));border:1px solid #a5a0dd;border-radius:14px;background:white;box-shadow:0 8px 40px #0003;';
      status.hidden = true;
      shadow.appendChild(editor);
      host.hidden = false;
      editor.focus();
    } else if (request.action === 'close-capture-overlay') {
      if (request.sessionId !== editorSession) return;
      editor?.remove(); editor = null; editorSession = null;
      host.hidden = true;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    } else if (request.action === 'set-feedback-mode') setActive(request.enabled);
    else if (request.action !== 'get-state') return;
    sendResponse({ ok:true, editorOpen:Boolean(editor), feedbackMode:active, interactionMode:active ? 'element' : 'off' });
  });
})();
