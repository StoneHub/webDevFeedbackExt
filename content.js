// The page sees only public targeting controls. Notes and History live in extension pages.
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
  const host = document.createElement('div');
  host.dataset.devFeedbackPicker = '';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { all:initial; position:fixed; top:12px; right:12px; z-index:2147483647; }
    :host([hidden]) { display:none !important; }
    section { font:14px/1.5 system-ui; color:#172139; background:#fff; padding:14px; border:2px solid #4f46e5; border-radius:12px; box-shadow:0 4px 24px #0003; max-width:300px; }
    button { font:inherit; margin:8px 8px 0 0; padding:6px 10px; cursor:pointer; }
    button:focus-visible { outline:3px solid #4f46e5; }
  </style><section><strong>Pick an element</strong><div role="status">Click a page element, or focus it with Tab and press Alt+Enter. Esc stops picking.</div><button id="history">Open History</button><button id="stop">Stop</button></section>`;
  document.documentElement.appendChild(host);
  host.hidden = true;
  const status = shadow.querySelector('[role="status"]');
  function clearHighlight() {
    highlighted?.classList.remove('dev-feedback-highlight');
    highlighted = null;
  }
  function setActive(value) {
    if (editor) return;
    active = Boolean(value);
    host.hidden = !active;
    if (active) status.textContent = 'Click a page element, or focus it with Tab and press Alt+Enter. Esc stops picking.';
    if (!active) clearHighlight();
  }
  shadow.querySelector('#stop').addEventListener('click', event => { if (event.isTrusted) setActive(false); });
  shadow.querySelector('#history').addEventListener('click', async event => {
    if (event.isTrusted) await chrome.runtime.sendMessage({ action: 'open-history' });
  });
  document.addEventListener('mouseover', event => {
    if (!active || host.contains(event.target) || event.target === host) return;
    clearHighlight(); highlighted = event.target; highlighted.classList.add('dev-feedback-highlight');
  }, true);
  async function pick(target) {
    if (busy || !target || target === document.body || target === document.documentElement) return;
    busy = true;
    clearHighlight();
    status.textContent = 'Opening private capture editor...';
    try {
      const snapshot = globalThis.DevFeedbackCollector.buildElementSnapshot(target);
      const response = await chrome.runtime.sendMessage({ action: 'start-element-capture', snapshot });
      if (!response?.ok) throw new Error(response?.reason || 'Could not open the editor.');
      if (!editor) setActive(false);
    } catch {
      status.textContent = 'Could not open the editor. Try picking the element again.';
    } finally { busy = false; }
  }
  document.addEventListener('click', event => {
    if (!event.isTrusted || !active || event.composedPath().includes(host)) return;
    event.preventDefault(); event.stopImmediatePropagation(); pick(event.target);
  }, true);
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || !active) return;
    if (event.key === 'Escape') { event.preventDefault(); setActive(false); }
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
      shadow.querySelector('section').hidden = true;
      shadow.appendChild(editor);
      host.hidden = false;
      editor.focus();
    } else if (request.action === 'close-capture-overlay') {
      if (request.sessionId !== editorSession) return;
      editor?.remove(); editor = null; editorSession = null;
      shadow.querySelector('section').hidden = false;
      host.hidden = true;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
      if (request.pickNext) { setActive(true); status.textContent = 'Saved. Pick the next element, or press Esc to stop.'; }
    } else if (request.action === 'toggle-feedback-mode') setActive(!active);
    else if (request.action === 'set-feedback-mode') setActive(request.enabled);
    else if (request.action !== 'get-state') return;
    sendResponse({ ok:true, editorOpen:Boolean(editor), feedbackMode:active, interactionMode:active ? 'element' : 'off' });
  });
})();
