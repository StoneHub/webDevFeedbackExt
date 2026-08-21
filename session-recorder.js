(function() {
  'use strict';

  if (globalThis.__DEV_FEEDBACK_SESSION_RECORDER_LOADED__) {
    return;
  }
  globalThis.__DEV_FEEDBACK_SESSION_RECORDER_LOADED__ = true;

  const { ALLOWED_KEYS } = globalThis.DevFeedbackSessionModel;
  const OVERLAY_ID = 'dev-feedback-session-recorder';
  const MAX_TARGET_TEXT = 160;
  const SCROLL_DEBOUNCE_MS = 450;
  let activeSessionId = '';
  let paused = false;
  let limitReached = false;
  let recordingError = '';
  let listenersAttached = false;
  let scrollTimer = null;
  let overlayHost = null;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'activate-feedback-session-recorder') {
      activate(request.sessionId, request.paused, request.limitReached);
      sendResponse({ ok: true, sessionId: activeSessionId });
      return false;
    }

    if (request.action === 'deactivate-feedback-session-recorder') {
      deactivate();
      sendResponse({ ok: true });
      return false;
    }

    if (request.action === 'sync-feedback-session-recorder') {
      if (request.sessionId) {
        activate(request.sessionId, request.paused, request.limitReached);
      } else {
        deactivate();
      }
      sendResponse({ ok: true, sessionId: activeSessionId, paused });
      return false;
    }

    return false;
  });

  function activate(sessionId, isPaused, isLimitReached) {
    activeSessionId = typeof sessionId === 'string' ? sessionId : '';
    paused = Boolean(isPaused);
    limitReached = Boolean(isLimitReached);
    recordingError = '';
    attachListeners();
    renderOverlay();
    emitEvent('document-ready', {
      redactions: getLocationRedactions()
    });
  }

  function deactivate() {
    activeSessionId = '';
    paused = false;
    limitReached = false;
    recordingError = '';
    if (scrollTimer) {
      window.clearTimeout(scrollTimer);
      scrollTimer = null;
    }
    overlayHost?.remove();
    overlayHost = null;
  }

  function attachListeners() {
    if (listenersAttached) {
      return;
    }
    listenersAttached = true;

    document.addEventListener('click', handleClick, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('error', handlePageError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
  }

  function handleClick(event) {
    if (!shouldRecordEvent(event) || !(event.target instanceof Element)) {
      return;
    }

    emitEvent('click', {
      target: describeTarget(event.target),
      point: {
        x: event.clientX,
        y: event.clientY,
        pageX: event.pageX,
        pageY: event.pageY
      },
      button: event.button
    });
  }

  function handleChange(event) {
    if (!shouldRecordEvent(event) || !(event.target instanceof Element)) {
      return;
    }

    const target = event.target;
    const inputType = String(target.getAttribute('type') || '').toLowerCase();
    const details = {
      target: describeTarget(target),
      changeKind: target.matches('select') ? 'selection-changed' : 'field-edited'
    };

    if (inputType === 'checkbox' || inputType === 'radio') {
      details.checked = Boolean(target.checked);
      details.changeKind = 'choice-toggled';
    }

    emitEvent('change', details);
  }

  function handleSubmit(event) {
    if (!shouldRecordEvent(event) || !(event.target instanceof HTMLFormElement)) {
      return;
    }

    emitEvent('submit', {
      target: describeTarget(event.target),
      method: event.target.method || 'get',
      action: event.target.action || window.location.href
    });
  }

  function handleKeydown(event) {
    if (!shouldRecordEvent(event) || !ALLOWED_KEYS.has(event.key)) {
      return;
    }

    emitEvent('key', {
      target: event.target instanceof Element ? describeTarget(event.target) : null,
      key: event.key,
      modifiers: {
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey
      }
    });
  }

  function handleScroll() {
    if (!activeSessionId || paused) {
      return;
    }

    if (scrollTimer) {
      window.clearTimeout(scrollTimer);
    }
    scrollTimer = window.setTimeout(() => {
      scrollTimer = null;
      emitEvent('scroll', {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      });
    }, SCROLL_DEBOUNCE_MS);
  }

  function handlePageError(event) {
    if (!activeSessionId || paused || isOverlayEvent(event)) {
      return;
    }

    emitEvent('page-error', {
      message: event.filename ? 'Script error observed' : 'Resource load error observed',
      filename: event.filename || event.target?.currentSrc || event.target?.src || '',
      line: event.lineno,
      column: event.colno
    });
  }

  function handleUnhandledRejection(event) {
    if (!activeSessionId || paused) {
      return;
    }

    emitEvent('unhandled-rejection', {
      message: 'Unhandled promise rejection observed'
    });
  }

  function shouldRecordEvent(event) {
    return Boolean(activeSessionId && !paused && !isOverlayEvent(event));
  }

  function isOverlayEvent(event) {
    return Boolean(overlayHost && event.composedPath?.().includes(overlayHost));
  }

  function describeTarget(element) {
    const interactive = element.closest('button, a, input, select, textarea, summary, [role], [contenteditable="true"]') || element;
    const tag = interactive.tagName.toLowerCase();
    const role = interactive.getAttribute('role') || '';
    const inputType = interactive.getAttribute('type') || '';
    const label = getElementLabel(interactive);
    const canCaptureVisibleText = (
      tag === 'button' ||
      tag === 'a' ||
      tag === 'summary' ||
      role === 'button' ||
      role === 'link' ||
      role === 'tab' ||
      role === 'menuitem'
    );

    return {
      tag,
      role,
      inputType,
      id: interactive.id || '',
      name: interactive.getAttribute('name') || '',
      ariaLabel: interactive.getAttribute('aria-label') || '',
      label,
      text: canCaptureVisibleText ? cleanText(interactive.innerText || interactive.textContent, MAX_TARGET_TEXT) : '',
      selector: buildStructuralSelector(interactive),
      href: tag === 'a' ? interactive.href : ''
    };
  }

  function getElementLabel(element) {
    if (element.labels?.length) {
      return cleanText(element.labels[0].innerText || element.labels[0].textContent, MAX_TARGET_TEXT);
    }

    const wrappingLabel = element.closest('label');
    if (wrappingLabel) {
      return cleanText(wrappingLabel.innerText || wrappingLabel.textContent, MAX_TARGET_TEXT);
    }

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      return cleanText(labelledBy.split(/\s+/).map((id) => (
        document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || ''
      )).join(' '), MAX_TARGET_TEXT);
    }

    return '';
  }

  function buildStructuralSelector(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    if (element.id && /^[a-zA-Z][\w:.-]*$/.test(element.id)) {
      return `#${escapeCss(element.id)}`;
    }

    const parts = [];
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 4; depth += 1) {
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter((candidate) => candidate.tagName === current.tagName)
        : [];
      const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
      parts.unshift(`${tag}${suffix}`);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function escapeCss(value) {
    return globalThis.CSS?.escape
      ? globalThis.CSS.escape(value)
      : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function emitEvent(type, details) {
    if (!activeSessionId) {
      return;
    }

    chrome.runtime.sendMessage({
      action: 'append-feedback-session-event',
      sessionId: activeSessionId,
      event: {
        type,
        timestamp: new Date().toISOString(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        details
      }
    }).then((response) => {
      if (response?.limitReached) {
        paused = true;
        limitReached = true;
        renderOverlay();
      } else if (response?.ok === false) {
        markRecordingError(response.reason);
      }
    }).catch((error) => {
      markRecordingError(error?.message);
    });
  }

  function markRecordingError(reason) {
    paused = true;
    recordingError = cleanText(reason || 'Events are not being saved. Stop and review the session.', 160);
    renderOverlay();
  }

  function renderOverlay() {
    if (!activeSessionId) {
      overlayHost?.remove();
      overlayHost = null;
      return;
    }

    if (!overlayHost?.isConnected) {
      overlayHost = document.createElement('div');
      overlayHost.id = OVERLAY_ID;
      overlayHost.setAttribute('data-dev-feedback-ui', 'session-recorder');
      const shadow = overlayHost.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `
        <style>
          :host {
            all: initial;
            position: fixed;
            z-index: 2147483647;
            right: 16px;
            top: 16px;
            color-scheme: light;
          }
          .recorder {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 8px 7px 10px;
            border: 1px solid rgba(92, 31, 48, 0.28);
            border-radius: 10px;
            background: rgba(255, 250, 251, 0.97);
            box-shadow: 0 12px 34px rgba(38, 25, 42, 0.20);
            font: 700 12px/1.2 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #342b3a;
          }
          .dot {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: #bf3148;
            box-shadow: 0 0 0 3px rgba(191, 49, 72, 0.12);
          }
          .recorder.paused .dot {
            background: #9a7280;
            box-shadow: none;
          }
          button {
            appearance: none;
            border: 1px solid rgba(62, 55, 96, 0.22);
            border-radius: 7px;
            background: #ffffff;
            color: #3d3650;
            min-height: 30px;
            padding: 5px 9px;
            font: 750 11px/1 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            cursor: pointer;
          }
          button:hover {
            background: #f0eef7;
          }
          button:disabled {
            cursor: not-allowed;
            opacity: 0.5;
          }
          button.stop {
            color: #a02d40;
            border-color: rgba(182, 56, 73, 0.32);
          }
        </style>
        <div class="recorder" role="status" aria-live="polite">
          <span class="dot" aria-hidden="true"></span>
          <span class="state">REC</span>
          <button class="pause" type="button">Pause</button>
          <button class="stop" type="button">Stop</button>
        </div>
      `;
      shadow.querySelector('.pause').addEventListener('click', togglePause);
      shadow.querySelector('.stop').addEventListener('click', stopSession);
      document.documentElement.appendChild(overlayHost);
      overlayHost._devFeedbackShadow = shadow;
    }

    const recorder = overlayHost._devFeedbackShadow.querySelector('.recorder');
    recorder.classList.toggle('paused', paused || Boolean(recordingError));
    const stateLabel = overlayHost._devFeedbackShadow.querySelector('.state');
    stateLabel.textContent = recordingError
      ? 'ERROR'
      : limitReached ? 'LIMIT' : paused ? 'PAUSED' : 'REC';
    stateLabel.title = recordingError;
    const pauseButton = overlayHost._devFeedbackShadow.querySelector('.pause');
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    pauseButton.disabled = limitReached || Boolean(recordingError);
  }

  async function togglePause() {
    const response = await chrome.runtime.sendMessage({
      action: 'set-feedback-session-paused',
      sessionId: activeSessionId,
      paused: !paused
    }).catch(() => null);

    if (response?.ok) {
      paused = Boolean(response.paused);
      limitReached = false;
      recordingError = '';
      renderOverlay();
    }
  }

  async function stopSession() {
    const response = await chrome.runtime.sendMessage({
      action: 'stop-feedback-session',
      sessionId: activeSessionId,
      reason: 'user-stopped',
      openReview: true
    }).catch(() => null);

    if (response?.ok) {
      deactivate();
    } else {
      markRecordingError(response?.reason);
    }
  }

  function getLocationRedactions() {
    const redactions = [];
    if (window.location.search) {
      redactions.push('query');
    }
    if (window.location.hash) {
      redactions.push('fragment');
    }
    return redactions;
  }

  function cleanText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }
})();
