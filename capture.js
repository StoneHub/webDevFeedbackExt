/**
 * Dev Feedback Capture - Region Capture Editor
 */

(function() {
  'use strict';

  const {
    CAPTURE_TYPE_REGION,
    MAX_NOTE_LENGTH,
    buildFeedbackId,
    detectSourceKind,
    makeStorageKey,
    sanitizeFeedbackItems
  } = globalThis.DevFeedbackShared;

  const SESSION_PREFIX = 'dev-feedback-region-session-';

  let session = null;
  let selection = null;
  let dragState = null;

  const imageWrap = document.getElementById('image-wrap');
  const screenshotImage = document.getElementById('screenshot-image');
  const selectionBox = document.getElementById('selection-box');
  const selectionSummary = document.getElementById('selection-summary');
  const sourceUrl = document.getElementById('source-url');
  const noteField = document.getElementById('note-field');
  const statusLine = document.getElementById('status-line');

  document.getElementById('save-btn').addEventListener('click', saveCapture);
  document.getElementById('reset-btn').addEventListener('click', resetSelection);
  document.getElementById('cancel-btn').addEventListener('click', cancelCapture);

  imageWrap.addEventListener('mousedown', startSelection);
  window.addEventListener('mousemove', updateSelection);
  window.addEventListener('mouseup', finishSelection);

  init().catch((error) => {
    setStatus(error.message || 'Unable to load the capture session.', true);
  });

  async function init() {
    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) {
      throw new Error('Missing region capture session id.');
    }

    const result = await chrome.storage.local.get([`${SESSION_PREFIX}${sessionId}`]);
    session = result[`${SESSION_PREFIX}${sessionId}`];

    if (!session || !session.screenshotDataUrl) {
      throw new Error('The region capture session expired before it could be opened.');
    }

    sourceUrl.textContent = session.pageUrl || session.rawTabUrl || 'Unknown source';
    noteField.maxLength = MAX_NOTE_LENGTH;

    await new Promise((resolve, reject) => {
      screenshotImage.onload = () => resolve();
      screenshotImage.onerror = () => reject(new Error('Unable to load the captured screenshot.'));
      screenshotImage.src = session.screenshotDataUrl;
    });
  }

  function startSelection(event) {
    if (event.button !== 0) {
      return;
    }

    const rect = imageWrap.getBoundingClientRect();
    dragState = {
      startX: clamp(event.clientX - rect.left, 0, rect.width),
      startY: clamp(event.clientY - rect.top, 0, rect.height)
    };

    selection = {
      x: dragState.startX,
      y: dragState.startY,
      width: 0,
      height: 0
    };

    renderSelection();
    event.preventDefault();
  }

  function updateSelection(event) {
    if (!dragState) {
      return;
    }

    const rect = imageWrap.getBoundingClientRect();
    const currentX = clamp(event.clientX - rect.left, 0, rect.width);
    const currentY = clamp(event.clientY - rect.top, 0, rect.height);

    selection = {
      x: Math.min(dragState.startX, currentX),
      y: Math.min(dragState.startY, currentY),
      width: Math.abs(currentX - dragState.startX),
      height: Math.abs(currentY - dragState.startY)
    };

    renderSelection();
  }

  function finishSelection() {
    if (!dragState) {
      return;
    }

    dragState = null;
    renderSelection();
  }

  function renderSelection() {
    if (!selection || selection.width < 2 || selection.height < 2) {
      selectionBox.classList.remove('visible');
      selectionSummary.textContent = 'Draw a box on the screenshot.';
      return;
    }

    selectionBox.classList.add('visible');
    selectionBox.style.left = `${selection.x}px`;
    selectionBox.style.top = `${selection.y}px`;
    selectionBox.style.width = `${selection.width}px`;
    selectionBox.style.height = `${selection.height}px`;

    const viewportRect = buildViewportRect(selection);
    selectionSummary.textContent = `x ${viewportRect.x}, y ${viewportRect.y}, width ${viewportRect.width}, height ${viewportRect.height}`;
  }

  function resetSelection() {
    selection = null;
    selectionBox.classList.remove('visible');
    selectionSummary.textContent = 'Draw a box on the screenshot.';
    setStatus('');
  }

  async function saveCapture() {
    const note = noteField.value.trim();
    if (!note) {
      setStatus('Add a short note before saving.', true);
      noteField.focus();
      return;
    }

    if (!selection || selection.width < 8 || selection.height < 8) {
      setStatus('Draw a larger region before saving.', true);
      return;
    }

    setStatus('Saving region feedback...');

    const crop = cropSelectedRegion();
    const viewportRect = buildViewportRect(selection);
    const storageKey = makeStorageKey(session.pageUrl || session.rawTabUrl || '');
    const existing = await chrome.storage.local.get([storageKey]);
    const nextItems = sanitizeFeedbackItems(
      existing[storageKey],
      session.pageUrl || session.rawTabUrl || '',
      session.pageTitle || ''
    ).concat({
      id: buildFeedbackId(),
      type: CAPTURE_TYPE_REGION,
      captureType: CAPTURE_TYPE_REGION,
      pageUrl: session.pageUrl || session.rawTabUrl || '',
      pageTitle: session.pageTitle || '',
      viewportRect,
      devicePixelRatio: session.viewportMetrics?.devicePixelRatio || 1,
      screenshot: {
        mimeType: 'image/png',
        dataUrl: crop
      },
      tabContext: {
        url: session.pageUrl || session.rawTabUrl || '',
        title: session.pageTitle || ''
      },
      sourceKind: detectSourceKind(session.pageUrl || session.rawTabUrl || ''),
      note: note.slice(0, MAX_NOTE_LENGTH),
      timestamp: new Date().toISOString()
    });

    await chrome.storage.local.set({ [storageKey]: nextItems });
    await chrome.runtime.sendMessage({ action: 'notify-feedback-updated', tabId: session.tabId });
    await chrome.runtime.sendMessage({ action: 'clear-region-session', sessionId: session.sessionId });

    setStatus('Saved. This tab will close.');
    window.setTimeout(() => window.close(), 300);
  }

  async function cancelCapture() {
    if (session?.sessionId) {
      await chrome.runtime.sendMessage({ action: 'clear-region-session', sessionId: session.sessionId });
    }

    window.close();
  }

  function cropSelectedRegion() {
    const naturalRect = buildNaturalRect(selection);
    const canvas = document.createElement('canvas');
    canvas.width = naturalRect.width;
    canvas.height = naturalRect.height;

    const context = canvas.getContext('2d');
    context.drawImage(
      screenshotImage,
      naturalRect.x,
      naturalRect.y,
      naturalRect.width,
      naturalRect.height,
      0,
      0,
      naturalRect.width,
      naturalRect.height
    );

    return canvas.toDataURL('image/png');
  }

  function buildViewportRect(displayRect) {
    const naturalRect = buildNaturalRect(displayRect);
    const viewportMetrics = session.viewportMetrics || {};
    const viewportWidth = Number.isFinite(viewportMetrics.width) && viewportMetrics.width > 0
      ? viewportMetrics.width
      : screenshotImage.naturalWidth;
    const viewportHeight = Number.isFinite(viewportMetrics.height) && viewportMetrics.height > 0
      ? viewportMetrics.height
      : screenshotImage.naturalHeight;

    const scaleX = screenshotImage.naturalWidth / viewportWidth;
    const scaleY = screenshotImage.naturalHeight / viewportHeight;

    return {
      x: Math.round(naturalRect.x / scaleX),
      y: Math.round(naturalRect.y / scaleY),
      width: Math.round(naturalRect.width / scaleX),
      height: Math.round(naturalRect.height / scaleY)
    };
  }

  function buildNaturalRect(displayRect) {
    const displayWidth = screenshotImage.getBoundingClientRect().width || 1;
    const displayHeight = screenshotImage.getBoundingClientRect().height || 1;
    const scaleX = screenshotImage.naturalWidth / displayWidth;
    const scaleY = screenshotImage.naturalHeight / displayHeight;

    return {
      x: Math.round(displayRect.x * scaleX),
      y: Math.round(displayRect.y * scaleY),
      width: Math.max(1, Math.round(displayRect.width * scaleX)),
      height: Math.max(1, Math.round(displayRect.height * scaleY))
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setStatus(message, isError) {
    statusLine.textContent = message;
    statusLine.classList.toggle('error', Boolean(isError));
  }
})();
