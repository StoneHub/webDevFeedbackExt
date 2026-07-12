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
    makeStorageKey
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
  const noteCounter = document.getElementById('note-counter');
  const statusLine = document.getElementById('status-line');
  const saveButton = document.getElementById('save-btn');

  saveButton.addEventListener('click', saveCapture);
  document.getElementById('reset-btn').addEventListener('click', resetSelection);
  document.getElementById('cancel-btn').addEventListener('click', cancelCapture);

  imageWrap.addEventListener('pointerdown', startSelection);
  noteField.addEventListener('input', updateCaptureState);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('pointermove', updateSelection);
  window.addEventListener('pointerup', finishSelection);

  init().catch((error) => {
    setStatus(error.message || 'Unable to load the capture session.', true);
  });

  async function init() {
    const sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) {
      throw new Error('Missing region capture session id.');
    }

    const result = await chrome.storage.session.get([`${SESSION_PREFIX}${sessionId}`]);
    session = result[`${SESSION_PREFIX}${sessionId}`];

    if (!session || !session.screenshotDataUrl) {
      throw new Error('The region capture session expired before it could be opened.');
    }

    sourceUrl.textContent = session.pageUrl || session.rawTabUrl || 'Unknown source';
    noteField.maxLength = MAX_NOTE_LENGTH;
    updateCaptureState();

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
    imageWrap.setPointerCapture?.(event.pointerId);

    selection = {
      x: dragState.startX,
      y: dragState.startY,
      width: 0,
      height: 0
    };

    renderSelection();
    updateCaptureState();
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
    updateCaptureState();
  }

  function finishSelection() {
    if (!dragState) {
      return;
    }

    dragState = null;
    renderSelection();
    updateCaptureState();
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
    updateCaptureState();
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
    saveButton.disabled = true;

    const crop = cropSelectedRegion();
    const viewportRect = buildViewportRect(selection);
    const storageKey = makeStorageKey(session.pageUrl || session.rawTabUrl || '');
    try {
      const item = {
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
      };

      const result = await chrome.runtime.sendMessage({
        action: 'add-feedback-item',
        storageKey,
        item
      });
      if (!result?.ok) {
        throw new Error(result?.reason || 'Unable to save region feedback.');
      }
      await chrome.runtime.sendMessage({ action: 'notify-feedback-updated', tabId: session.tabId });
      await chrome.runtime.sendMessage({ action: 'clear-region-session', sessionId: session.sessionId });

      setStatus('Saved. This tab will close.');
      window.setTimeout(() => window.close(), 300);
    } catch (error) {
      setStatus(error.message || 'Unable to save region feedback.', true);
      updateCaptureState();
    }
  }

  async function cancelCapture() {
    if (hasUnsavedWork() && !window.confirm('Discard this region capture?')) {
      return;
    }

    if (session?.sessionId) {
      await chrome.runtime.sendMessage({ action: 'clear-region-session', sessionId: session.sessionId });
    }

    window.close();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelCapture();
      return;
    }

    if (event.target !== imageWrap) {
      return;
    }

    const rect = imageWrap.getBoundingClientRect();
    if ((event.key === 'Enter' || event.key === ' ') && !selection) {
      event.preventDefault();
      selection = {
        x: Math.round(rect.width * 0.25),
        y: Math.round(rect.height * 0.25),
        width: Math.max(8, Math.round(rect.width * 0.5)),
        height: Math.max(8, Math.round(rect.height * 0.5))
      };
      renderSelection();
      updateCaptureState();
      return;
    }

    if (!selection || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const delta = event.altKey ? 1 : 10;
    const horizontal = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
    const vertical = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
    if (event.shiftKey) {
      selection.width = clamp(selection.width + horizontal, 8, rect.width - selection.x);
      selection.height = clamp(selection.height + vertical, 8, rect.height - selection.y);
    } else {
      selection.x = clamp(selection.x + horizontal, 0, rect.width - selection.width);
      selection.y = clamp(selection.y + vertical, 0, rect.height - selection.height);
    }
    renderSelection();
    updateCaptureState();
  }

  function updateCaptureState() {
    const noteLength = noteField.value.length;
    const hasNote = noteField.value.trim().length > 0;
    const hasSelection = Boolean(selection && selection.width >= 8 && selection.height >= 8);

    if (noteCounter) {
      noteCounter.textContent = `${noteLength} / ${MAX_NOTE_LENGTH}`;
    }

    saveButton.disabled = !(hasNote && hasSelection);
  }

  function hasUnsavedWork() {
    return Boolean(noteField.value.trim() || (selection && selection.width >= 8 && selection.height >= 8));
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
    statusLine.setAttribute('role', isError ? 'alert' : 'status');
  }
})();
