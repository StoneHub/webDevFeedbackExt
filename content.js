// The page sees only public targeting controls. Notes live in an extension frame; the list lives in the extension menu.
// Runs in every frame the extension can reach; the background keeps picking in sync across them.
(function() {
  'use strict';
  if (globalThis.__DEV_FEEDBACK_CAPTURE_LOADED__) return;
  globalThis.__DEV_FEEDBACK_CAPTURE_LOADED__ = true;
  const EDITOR_WIDTH = 300;
  const EDITOR_HEIGHT = 150;
  let active = false;
  let busy = false;
  let highlighted = null;
  let editor = null;
  let editorSession = null;
  let previousFocus = null;
  let toastTimer = null;
  const host = document.createElement('div');
  host.dataset.devFeedbackPicker = '';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { all:initial; position:fixed; inset:0; z-index:2147483647; pointer-events:none; }
    :host([hidden]) { display:none !important; }
    iframe { position:absolute; pointer-events:auto; border:1px solid #a5a0dd; border-radius:12px; background:white; box-shadow:0 8px 40px #0003; }
    [role="status"] { position:absolute; top:12px; left:50%; transform:translateX(-50%); font:13px/1.4 system-ui; color:#fff; background:#29263a; padding:8px 14px; border-radius:999px; box-shadow:0 4px 24px #0003; white-space:nowrap; }
  </style><div role="status" hidden></div>`;
  document.documentElement.appendChild(host);
  host.hidden = true;
  const toast = shadow.querySelector('[role="status"]');
  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    host.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; if (!editor) host.hidden = true; }, 3000);
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
  // A pick inside an embedded frame reports its rect in that frame; shift it into this page.
  // Content scripts cannot map a frameId to its element, so match the frame's origin, then its size.
  function anchorRect(anchor) {
    if (!anchor?.rect) return null;
    if (!anchor.frameId) return anchor.rect;
    const sameOrigin = [...document.querySelectorAll('iframe,frame')].filter(element => {
      try { return new URL(element.src, location.href).origin === new URL(anchor.frame.url).origin; } catch { return false; }
    });
    const frame = sameOrigin.find(element => element.clientWidth === anchor.frame.width && element.clientHeight === anchor.frame.height)
      || (sameOrigin.length === 1 ? sameOrigin[0] : null);
    if (!frame) return null;
    const box = frame.getBoundingClientRect();
    const dx = box.left + frame.clientLeft, dy = box.top + frame.clientTop;
    return { left:anchor.rect.left + dx, top:anchor.rect.top + dy, right:anchor.rect.right + dx, bottom:anchor.rect.bottom + dy };
  }
  // Below the element if it fits, else above, else as close as the viewport allows.
  function placeEditor(rect) {
    const width = Math.min(EDITOR_WIDTH, innerWidth - 16);
    const clamp = (value, max) => Math.max(8, Math.min(value, max));
    let left = innerWidth - width - 12, top = 12;
    if (rect) {
      left = clamp(rect.left, innerWidth - width - 8);
      top = rect.bottom + 8;
      if (top + EDITOR_HEIGHT > innerHeight - 8) top = rect.top - EDITOR_HEIGHT - 8;
      if (top < 8) top = clamp(rect.bottom + 8, innerHeight - EDITOR_HEIGHT - 8);
    }
    editor.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${EDITOR_HEIGHT}px;`;
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
      const { left, top, right, bottom } = target.getBoundingClientRect();
      const frame = { url:location.href, width:innerWidth, height:innerHeight };
      const response = await chrome.runtime.sendMessage({ action: 'start-element-capture', snapshot, rect:{ left, top, right, bottom }, frame });
      if (!response?.ok) throw new Error(response?.reason || 'Could not open the editor.');
    } catch {
      showToast('Could not open the note. Try picking the element again.');
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
      if (editor) { sendResponse({ok:false,reason:'Save or close the open note first.'}); return; }
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(request.sessionId)) return;
      setActive(false);
      previousFocus = document.activeElement;
      editorSession = request.sessionId;
      editor = document.createElement('iframe');
      editor.allow = 'clipboard-write';
      editor.title = 'Write element feedback';
      editor.src = chrome.runtime.getURL('element.html?session=' + encodeURIComponent(editorSession));
      placeEditor(anchorRect(request.anchor));
      shadow.appendChild(editor);
      host.hidden = false;
      editor.focus();
    } else if (request.action === 'close-capture-overlay') {
      if (request.sessionId !== editorSession) return;
      editor?.remove(); editor = null; editorSession = null;
      host.hidden = toast.hidden;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
      if (typeof request.toast === 'string' && request.toast) showToast(request.toast);
    } else if (request.action === 'set-feedback-mode') setActive(request.enabled);
    else if (request.action !== 'get-state') return;
    sendResponse({ ok:true, editorOpen:Boolean(editor), feedbackMode:active, interactionMode:active ? 'element' : 'off' });
  });
})();
