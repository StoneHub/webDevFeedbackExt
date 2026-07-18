/**
 * Dev Feedback Capture - Visual Change Spec Editor
 */

(function() {
  'use strict';

  const {
    CAPTURE_TYPE_REGION,
    MAX_ACCEPTANCE_CRITERIA,
    MAX_NOTE_LENGTH,
    buildFeedbackId,
    detectSourceKind,
    makeStorageKey
  } = globalThis.DevFeedbackShared;

  const SESSION_PREFIX = 'dev-feedback-region-session-';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DRAW_TOOLS = new Set(['arrow', 'rectangle', 'ellipse', 'blur']);

  let session = null;
  let selection = null;
  let activeTool = 'crop';
  let annotations = [];
  let undoStack = [];
  let redoStack = [];
  let gesture = null;
  let saving = false;
  const anchorPromises = new Map();

  const imageWrap = document.getElementById('image-wrap');
  const screenshotImage = document.getElementById('screenshot-image');
  const selectionBox = document.getElementById('selection-box');
  const annotationLayer = document.getElementById('annotation-layer');
  const selectionSummary = document.getElementById('selection-summary');
  const sourceUrl = document.getElementById('source-url');
  const noteField = document.getElementById('note-field');
  const acceptanceField = document.getElementById('acceptance-field');
  const noteCounter = document.getElementById('note-counter');
  const acceptanceCounter = document.getElementById('acceptance-counter');
  const statusLine = document.getElementById('status-line');
  const saveButton = document.getElementById('save-btn');
  const undoButton = document.getElementById('undo-btn');
  const redoButton = document.getElementById('redo-btn');
  const colorField = document.getElementById('annotation-color');

  saveButton.addEventListener('click', saveCapture);
  document.getElementById('reset-btn').addEventListener('click', resetSpec);
  document.getElementById('cancel-btn').addEventListener('click', cancelCapture);
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => setActiveTool(button.dataset.tool));
  });

  imageWrap.addEventListener('pointerdown', startGesture);
  noteField.addEventListener('input', updateCaptureState);
  acceptanceField?.addEventListener('input', updateCaptureState);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('pointermove', updateGesture);
  window.addEventListener('pointerup', finishGesture);
  window.addEventListener('pointercancel', cancelGesture);
  window.addEventListener('resize', render);

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
      screenshotImage.onload = resolve;
      screenshotImage.onerror = () => reject(new Error('Unable to load the captured screenshot.'));
      screenshotImage.src = session.screenshotDataUrl;
    });

    const viewport = getViewportSize();
    annotationLayer.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    render();
  }

  function startGesture(event) {
    if (event.button !== 0 || !session || gesture || saving) {
      return;
    }

    const point = getViewportPoint(event);
    if (activeTool !== 'crop' && (!selection || !pointInsideRect(point, selection))) {
      setStatus('Draw annotations inside the selected evidence crop.', true);
      return;
    }
    imageWrap.setPointerCapture?.(event.pointerId);

    if (activeTool === 'pin') {
      const pinBounds = insetRect(selection, 17);
      if (pinBounds.width <= 0 || pinBounds.height <= 0) {
        setStatus('The crop is too small for a numbered pin.', true);
        return;
      }
      pushUndoState();
      addAnnotation({
        id: buildFeedbackId(),
        type: 'pin',
        point: clampPointToRect(point, pinBounds),
        number: annotations.filter((annotation) => annotation.type === 'pin').length + 1,
        color: getAnnotationColor(),
        target: null
      });
      redoStack = [];
      render();
      updateCaptureState();
      event.preventDefault();
      return;
    }

    if (activeTool === 'text') {
      const text = window.prompt('Annotation text (up to 280 characters):', '');
      if (text?.trim()) {
        const annotationText = text.trim().slice(0, 280);
        const textPoint = fitTextPoint(point, annotationText, selection);
        if (!textPoint) {
          setStatus('The text annotation is wider than the selected crop.', true);
          return;
        }
        pushUndoState();
        addAnnotation({
          id: buildFeedbackId(),
          type: 'text',
          point: textPoint,
          text: annotationText,
          color: getAnnotationColor(),
          target: null
        });
        redoStack = [];
        render();
        updateCaptureState();
      }
      event.preventDefault();
      return;
    }

    const drawBounds = getToolBounds(activeTool, selection);
    const gesturePoint = activeTool === 'crop' ? point : clampPointToRect(point, drawBounds);
    gesture = {
      tool: activeTool,
      pointerId: event.pointerId,
      start: gesturePoint,
      current: gesturePoint,
      before: captureEditorState()
    };
    if (activeTool === 'crop') {
      selection = { x: point.x, y: point.y, width: 0, height: 0 };
    }
    render();
    event.preventDefault();
  }

  function updateGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || saving) {
      return;
    }

    gesture.current = getViewportPoint(event);
    if (gesture.tool === 'crop') {
      selection = rectFromPoints(gesture.start, gesture.current);
    } else if (selection) {
      gesture.current = clampPointToRect(gesture.current, getToolBounds(gesture.tool, selection));
    }
    render();
    updateCaptureState();
  }

  function finishGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || saving) {
      return;
    }

    const completed = gesture;
    gesture = null;
    completed.current = completed.tool === 'crop' || !selection
      ? getViewportPoint(event)
      : clampPointToRect(getViewportPoint(event), getToolBounds(completed.tool, selection));
    if (completed.tool === 'crop') {
      if (selection?.width >= 8 && selection?.height >= 8) {
        pushUndoSnapshot(completed.before);
        annotations = annotations.filter((annotation) => annotationInsideRect(annotation, selection));
        redoStack = [];
      } else {
        restoreEditorState(completed.before);
        return;
      }
    } else if (DRAW_TOOLS.has(completed.tool)) {
      const rect = rectFromPoints(completed.start, completed.current);
      const isArrow = completed.tool === 'arrow';
      if ((isArrow && distance(completed.start, completed.current) >= 6) || (!isArrow && rect.width >= 6 && rect.height >= 6)) {
        pushUndoSnapshot(completed.before);
        redoStack = [];
        addAnnotation(isArrow ? {
          id: buildFeedbackId(),
          type: 'arrow',
          start: completed.start,
          end: completed.current,
          color: getAnnotationColor(),
          target: null
        } : {
          id: buildFeedbackId(),
          type: completed.tool,
          rect,
          color: getAnnotationColor(),
          target: null
        });
      }
    }
    render();
    updateCaptureState();
  }

  function render() {
    renderSelection();
    renderAnnotations();
    document.querySelectorAll('[data-tool]').forEach((button) => {
      const isActive = button.dataset.tool === activeTool;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
  }

  function renderSelection() {
    if (!selection || selection.width < 2 || selection.height < 2) {
      selectionBox.classList.remove('visible');
      selectionSummary.textContent = 'Use Crop to define the evidence area.';
      return;
    }

    const viewport = getViewportSize();
    selectionBox.classList.add('visible');
    selectionBox.style.left = `${selection.x / viewport.width * 100}%`;
    selectionBox.style.top = `${selection.y / viewport.height * 100}%`;
    selectionBox.style.width = `${selection.width / viewport.width * 100}%`;
    selectionBox.style.height = `${selection.height / viewport.height * 100}%`;
    selectionSummary.textContent = `x ${Math.round(selection.x)}, y ${Math.round(selection.y)}, width ${Math.round(selection.width)}, height ${Math.round(selection.height)} · ${annotations.length} annotation${annotations.length === 1 ? '' : 's'}`;
  }

  function renderAnnotations() {
    annotationLayer.replaceChildren();
    const items = gesture && DRAW_TOOLS.has(gesture.tool)
      ? annotations.concat(buildDraftAnnotation(gesture))
      : annotations;
    items.filter(Boolean).forEach((annotation) => annotationLayer.appendChild(buildSvgAnnotation(annotation)));
  }

  function buildDraftAnnotation(currentGesture) {
    if (currentGesture.tool === 'arrow') {
      return { type: 'arrow', start: currentGesture.start, end: currentGesture.current, color: getAnnotationColor() };
    }
    return {
      type: currentGesture.tool,
      rect: rectFromPoints(currentGesture.start, currentGesture.current),
      color: getAnnotationColor()
    };
  }

  function buildSvgAnnotation(annotation) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('data-type', annotation.type);
    const color = annotation.color || '#ff3b30';

    if (annotation.type === 'arrow') {
      const line = svgElement('line', {
        x1: annotation.start.x, y1: annotation.start.y,
        x2: annotation.end.x, y2: annotation.end.y,
        stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round'
      });
      group.append(line, buildArrowHead(annotation.start, annotation.end, color));
    } else if (annotation.type === 'rectangle' || annotation.type === 'blur') {
      group.appendChild(svgElement('rect', {
        x: annotation.rect.x, y: annotation.rect.y,
        width: annotation.rect.width, height: annotation.rect.height,
        rx: 4, fill: annotation.type === 'blur' ? '#191919' : 'transparent',
        stroke: color, 'stroke-width': 4, 'stroke-dasharray': annotation.type === 'blur' ? '8 5' : ''
      }));
      if (annotation.type === 'blur') {
        const label = svgElement('text', {
          x: annotation.rect.x + annotation.rect.width / 2,
          y: annotation.rect.y + annotation.rect.height / 2,
          fill: '#fff', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 14, 'font-weight': 800
        });
        label.textContent = 'REDACT';
        group.appendChild(label);
      }
    } else if (annotation.type === 'ellipse') {
      group.appendChild(svgElement('ellipse', {
        cx: annotation.rect.x + annotation.rect.width / 2,
        cy: annotation.rect.y + annotation.rect.height / 2,
        rx: annotation.rect.width / 2, ry: annotation.rect.height / 2,
        fill: 'transparent', stroke: color, 'stroke-width': 4
      }));
    } else if (annotation.type === 'pin') {
      group.appendChild(svgElement('circle', { cx: annotation.point.x, cy: annotation.point.y, r: 15, fill: color, stroke: '#fff', 'stroke-width': 2 }));
      const label = svgElement('text', {
        x: annotation.point.x, y: annotation.point.y + 1,
        fill: '#fff', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 15, 'font-weight': 800
      });
      label.textContent = String(annotation.number);
      group.appendChild(label);
    } else if (annotation.type === 'text') {
      const label = svgElement('text', {
        x: annotation.point.x, y: annotation.point.y,
        fill: color, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'font-size': 18, 'font-weight': 800
      });
      label.textContent = annotation.text;
      group.appendChild(label);
    }
    return group;
  }

  function buildArrowHead(start, end, color) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const size = 14;
    const points = [
      end,
      { x: end.x - size * Math.cos(angle - Math.PI / 6), y: end.y - size * Math.sin(angle - Math.PI / 6) },
      { x: end.x - size * Math.cos(angle + Math.PI / 6), y: end.y - size * Math.sin(angle + Math.PI / 6) }
    ];
    return svgElement('polygon', { points: points.map((point) => `${point.x},${point.y}`).join(' '), fill: color });
  }

  function svgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function setActiveTool(tool) {
    if (saving || !['crop', 'arrow', 'rectangle', 'ellipse', 'pin', 'text', 'blur'].includes(tool)) {
      return;
    }
    cancelGesture();
    activeTool = tool;
    setStatus(tool === 'crop' ? 'Drag to set the evidence crop.' : `Draw a ${tool} annotation on the screenshot.`);
    render();
  }

  function resetSpec() {
    if (saving || (!selection && !annotations.length)) {
      return;
    }
    pushUndoState();
    selection = null;
    annotations = [];
    redoStack = [];
    setStatus('Visual spec reset.');
    render();
    updateCaptureState();
  }

  function undo() {
    if (saving) {
      return;
    }
    const previous = undoStack.pop();
    if (!previous) {
      return;
    }
    redoStack.push(captureEditorState());
    restoreEditorState(previous);
  }

  function redo() {
    if (saving) {
      return;
    }
    const next = redoStack.pop();
    if (!next) {
      return;
    }
    pushUndoSnapshot(captureEditorState());
    restoreEditorState(next);
  }

  function pushUndoState() {
    pushUndoSnapshot(captureEditorState());
  }

  function pushUndoSnapshot(state) {
    undoStack.push(state);
    if (undoStack.length > 50) {
      undoStack.shift();
    }
  }

  function captureEditorState() {
    return JSON.parse(JSON.stringify({ selection, annotations }));
  }

  function restoreEditorState(state) {
    selection = state.selection;
    annotations = state.annotations;
    render();
    updateCaptureState();
  }

  async function saveCapture() {
    if (saving) {
      return;
    }
    const note = noteField.value.trim();
    if (!note) {
      setStatus('Add a requested change before saving.', true);
      noteField.focus();
      return;
    }
    if (!selection || selection.width < 8 || selection.height < 8) {
      setStatus('Use Crop to draw a larger evidence area before saving.', true);
      return;
    }

    saving = true;
    setEditorLocked(true);
    setStatus('Resolving DOM anchors and saving visual spec...');
    const pageContext = buildPageContext();

    try {
      await Promise.all([...anchorPromises.values()]);
      const resolvedAnnotations = annotations.map((annotation) => ({ ...annotation }));
      annotations = resolvedAnnotations;
      const beforeImage = cropSelectedRegion();
      const storageKey = makeStorageKey(session.pageUrl || session.rawTabUrl || '');
      const item = {
        id: buildFeedbackId(),
        type: CAPTURE_TYPE_REGION,
        captureType: CAPTURE_TYPE_REGION,
        pageUrl: session.pageUrl || session.rawTabUrl || '',
        pageTitle: session.pageTitle || '',
        viewportRect: roundRect(selection),
        devicePixelRatio: getCaptureDevicePixelRatio(),
        screenshot: {
          mimeType: 'image/png',
          dataUrl: beforeImage
        },
        annotations: resolvedAnnotations,
        acceptance: getAcceptanceCriteria(),
        pageContext,
        tabContext: {
          url: session.pageUrl || session.rawTabUrl || '',
          title: session.pageTitle || ''
        },
        sourceKind: detectSourceKind(session.pageUrl || session.rawTabUrl || ''),
        note: note.slice(0, MAX_NOTE_LENGTH),
        timestamp: new Date().toISOString()
      };

      const result = await chrome.runtime.sendMessage({ action: 'add-feedback-item', storageKey, item });
      if (!result?.ok) {
        throw new Error(result?.reason || 'Unable to save visual change spec.');
      }
      await chrome.runtime.sendMessage({ action: 'notify-feedback-updated', tabId: session.tabId });
      await chrome.runtime.sendMessage({ action: 'clear-region-session', sessionId: session.sessionId });
      setStatus('Visual change spec saved. This tab will close.');
      window.setTimeout(() => window.close(), 350);
    } catch (error) {
      saving = false;
      setEditorLocked(false);
      setStatus(error.message || 'Unable to save visual change spec.', true);
      render();
      updateCaptureState();
    }
  }

  function setEditorLocked(locked) {
    document.querySelectorAll('button, input, textarea').forEach((control) => {
      control.disabled = locked;
    });
    imageWrap.style.pointerEvents = locked ? 'none' : '';
    imageWrap.setAttribute('aria-disabled', String(locked));
  }

  async function resolveAnnotationTarget(annotation, pageContext) {
    const response = await chrome.runtime.sendMessage({
      action: 'resolve-annotation-target',
      tabId: session.tabId,
      point: getAnnotationTargetPoint(annotation),
      pageContext
    });
    return response?.target || null;
  }

  function addAnnotation(annotation) {
    annotations.push(annotation);
    const pageContext = buildPageContext();
    const promise = resolveAnnotationTarget(annotation, pageContext)
      .then((target) => {
        applyResolvedTarget(annotation.id, target);
      })
      .catch(() => {})
      .finally(() => anchorPromises.delete(annotation.id));
    anchorPromises.set(annotation.id, promise);
  }

  function applyResolvedTarget(annotationId, target) {
    const apply = (items) => {
      const match = items?.find((candidate) => candidate.id === annotationId);
      if (match) {
        match.target = target;
      }
    };
    apply(annotations);
    undoStack.forEach((state) => apply(state.annotations));
    redoStack.forEach((state) => apply(state.annotations));
  }

  function getAnnotationTargetPoint(annotation) {
    if (annotation.type === 'arrow') {
      return annotation.end;
    }
    if (annotation.point) {
      return annotation.point;
    }
    return {
      x: annotation.rect.x + annotation.rect.width / 2,
      y: annotation.rect.y + annotation.rect.height / 2
    };
  }

  async function cancelCapture() {
    if (hasUnsavedWork() && !window.confirm('Discard this visual change spec?')) {
      return;
    }
    if (session?.sessionId) {
      await chrome.runtime.sendMessage({ action: 'clear-region-session', sessionId: session.sessionId });
    }
    window.close();
  }

  function handleKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !isTextInput(event.target)) {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (event.key === 'Escape') {
      if (gesture) {
        cancelGesture();
      } else {
        event.preventDefault();
        cancelCapture();
      }
      return;
    }
    if (event.target !== imageWrap || activeTool !== 'crop') {
      return;
    }

    const viewport = getViewportSize();
    if ((event.key === 'Enter' || event.key === ' ') && !selection) {
      event.preventDefault();
      pushUndoState();
      selection = {
        x: Math.round(viewport.width * 0.25),
        y: Math.round(viewport.height * 0.25),
        width: Math.max(8, Math.round(viewport.width * 0.5)),
        height: Math.max(8, Math.round(viewport.height * 0.5))
      };
      redoStack = [];
      render();
      updateCaptureState();
      return;
    }

    if (!selection || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    pushUndoState();
    const delta = event.altKey ? 1 : 10;
    const horizontal = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
    const vertical = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
    if (event.shiftKey) {
      selection.width = clamp(selection.width + horizontal, 8, viewport.width - selection.x);
      selection.height = clamp(selection.height + vertical, 8, viewport.height - selection.y);
    } else {
      selection.x = clamp(selection.x + horizontal, 0, viewport.width - selection.width);
      selection.y = clamp(selection.y + vertical, 0, viewport.height - selection.height);
    }
    redoStack = [];
    render();
  }

  function updateCaptureState() {
    const noteLength = noteField.value.length;
    const criteria = getAcceptanceCriteria();
    noteCounter.textContent = `${noteLength} / ${MAX_NOTE_LENGTH}`;
    if (acceptanceCounter) {
      acceptanceCounter.textContent = `${criteria.length} / ${MAX_ACCEPTANCE_CRITERIA} criteria`;
    }
    saveButton.disabled = !(noteField.value.trim() && selection?.width >= 8 && selection?.height >= 8);
  }

  function getAcceptanceCriteria() {
    return String(acceptanceField?.value || '')
      .split('\n')
      .map((criterion) => criterion.trim().replace(/^[-*]\s*/, ''))
      .filter(Boolean)
      .slice(0, MAX_ACCEPTANCE_CRITERIA);
  }

  function hasUnsavedWork() {
    return Boolean(noteField.value.trim() || acceptanceField?.value.trim() || selection || annotations.length);
  }

  function cropSelectedRegion() {
    const naturalRect = buildNaturalRect(selection);
    const canvas = document.createElement('canvas');
    canvas.width = naturalRect.width;
    canvas.height = naturalRect.height;
    const context = canvas.getContext('2d');
    context.drawImage(
      screenshotImage,
      naturalRect.x, naturalRect.y, naturalRect.width, naturalRect.height,
      0, 0, naturalRect.width, naturalRect.height
    );
    const viewport = getViewportSize();
    const scaleX = screenshotImage.naturalWidth / viewport.width;
    const scaleY = screenshotImage.naturalHeight / viewport.height;
    annotations.filter((annotation) => annotation.type === 'blur').forEach((annotation) => {
      redactRect(context, annotation.rect, naturalRect, scaleX, scaleY);
    });
    return canvas.toDataURL('image/png');
  }

  function redactRect(context, rect, crop, scaleX, scaleY) {
    const left = Math.max(crop.x, rect.x * scaleX);
    const top = Math.max(crop.y, rect.y * scaleY);
    const right = Math.min(crop.x + crop.width, (rect.x + rect.width) * scaleX);
    const bottom = Math.min(crop.y + crop.height, (rect.y + rect.height) * scaleY);
    const x = Math.round(left - crop.x);
    const y = Math.round(top - crop.y);
    const width = Math.round(right - left);
    const height = Math.round(bottom - top);
    if (width <= 0 || height <= 0) {
      return;
    }
    context.save();
    context.fillStyle = '#191919';
    context.fillRect(x, y, width, height);
    context.restore();
  }


  function cancelGesture(event) {
    if (!gesture || (event?.pointerId !== undefined && event.pointerId !== gesture.pointerId)) {
      return;
    }
    const previous = gesture.before;
    gesture = null;
    restoreEditorState(previous);
  }

  function buildPageContext() {
    const metrics = session.viewportMetrics || {};
    return {
      url: session.pageUrl || session.rawTabUrl || '',
      title: session.pageTitle || '',
      sourceKind: detectSourceKind(session.pageUrl || session.rawTabUrl || ''),
      viewport: {
        width: getViewportSize().width,
        height: getViewportSize().height,
        scrollX: metrics.scrollX || 0,
        scrollY: metrics.scrollY || 0,
        devicePixelRatio: getCaptureDevicePixelRatio(),
        zoom: metrics.zoom || 1
      },
      browser: {
        userAgent: metrics.userAgent || window.navigator.userAgent,
        language: metrics.language || window.navigator.language
      }
    };
  }

  function getViewportPoint(event) {
    const display = screenshotImage.getBoundingClientRect();
    const viewport = getViewportSize();
    return {
      x: clamp((event.clientX - display.left) / Math.max(1, display.width) * viewport.width, 0, viewport.width),
      y: clamp((event.clientY - display.top) / Math.max(1, display.height) * viewport.height, 0, viewport.height)
    };
  }

  function getCaptureDevicePixelRatio() {
    const reported = session?.viewportMetrics?.devicePixelRatio;
    if (Number.isFinite(reported) && reported > 0) {
      return reported;
    }
    const viewport = getViewportSize();
    const scaleX = screenshotImage.naturalWidth / Math.max(1, viewport.width);
    const scaleY = screenshotImage.naturalHeight / Math.max(1, viewport.height);
    const derived = (scaleX + scaleY) / 2;
    return Number.isFinite(derived) && derived > 0 ? Number(derived.toFixed(3)) : 1;
  }

  function pointInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  function clampPointToRect(point, rect) {
    return {
      x: clamp(point.x, rect.x, rect.x + rect.width),
      y: clamp(point.y, rect.y, rect.y + rect.height)
    };
  }

  function insetRect(rect, amount) {
    const inset = Math.max(0, amount);
    return {
      x: rect.x + inset,
      y: rect.y + inset,
      width: Math.max(0, rect.width - inset * 2),
      height: Math.max(0, rect.height - inset * 2)
    };
  }

  function getToolBounds(tool, rect) {
    return insetRect(rect, tool === 'arrow' ? 16 : 2);
  }

  function measureTextAnnotation(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = '800 18px system-ui';
    return context.measureText(text).width;
  }

  function fitTextPoint(point, text, rect) {
    const width = measureTextAnnotation(text);
    if (width > rect.width - 8 || rect.height < 28) {
      return null;
    }
    return {
      x: clamp(point.x, rect.x + 4, rect.x + rect.width - width - 4),
      y: clamp(point.y, rect.y + 22, rect.y + rect.height - 5)
    };
  }

  function annotationInsideRect(annotation, rect) {
    if (annotation.type === 'arrow') {
      const arrowBounds = insetRect(rect, 16);
      return pointInsideRect(annotation.start, arrowBounds) && pointInsideRect(annotation.end, arrowBounds);
    }
    if (annotation.type === 'pin') {
      return pointInsideRect(annotation.point, insetRect(rect, 17));
    }
    if (annotation.type === 'text') {
      const width = measureTextAnnotation(annotation.text);
      return annotation.point.x >= rect.x + 4
        && annotation.point.x + width <= rect.x + rect.width - 4
        && annotation.point.y >= rect.y + 22
        && annotation.point.y <= rect.y + rect.height - 5;
    }
    const shapeBounds = insetRect(rect, 2);
    return annotation.rect
      && pointInsideRect({ x: annotation.rect.x, y: annotation.rect.y }, shapeBounds)
      && pointInsideRect({ x: annotation.rect.x + annotation.rect.width, y: annotation.rect.y + annotation.rect.height }, shapeBounds);
  }

  function getViewportSize() {
    const metrics = session?.viewportMetrics || {};
    return {
      width: Number.isFinite(metrics.width) && metrics.width > 0 ? metrics.width : screenshotImage.naturalWidth || 1,
      height: Number.isFinite(metrics.height) && metrics.height > 0 ? metrics.height : screenshotImage.naturalHeight || 1
    };
  }

  function buildNaturalRect(viewportRect) {
    const viewport = getViewportSize();
    const scaleX = screenshotImage.naturalWidth / viewport.width;
    const scaleY = screenshotImage.naturalHeight / viewport.height;
    return {
      x: Math.round(viewportRect.x * scaleX),
      y: Math.round(viewportRect.y * scaleY),
      width: Math.max(1, Math.round(viewportRect.width * scaleX)),
      height: Math.max(1, Math.round(viewportRect.height * scaleY))
    };
  }

  function rectFromPoints(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  }

  function roundRect(rect) {
    return {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height)
    };
  }

  function distance(start, end) {
    return Math.hypot(end.x - start.x, end.y - start.y);
  }

  function getAnnotationColor() {
    return /^#[0-9a-f]{6}$/i.test(colorField?.value || '') ? colorField.value : '#ff3b30';
  }

  function isTextInput(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
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
