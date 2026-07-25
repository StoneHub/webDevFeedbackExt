/**
 * Dev Feedback Capture - Content Script
 * Injected on demand into the current tab for in-page UI and element capture.
 */

(function() {
  'use strict';

  if (window.__DEV_FEEDBACK_CAPTURE_LOADED__) {
    return;
  }

  window.__DEV_FEEDBACK_CAPTURE_LOADED__ = true;

  const {
    CAPTURE_TYPE_ELEMENT,
    CAPTURE_TYPE_REGION,
    MAX_NOTE_LENGTH,
    buildAiPromptExport,
    buildFeedbackId,
    buildMarkdownExport,
    escapeCssIdentifier,
    formatTimestamp,
    makeStorageKey,
    sanitizeFeedbackItems
  } = globalThis.DevFeedbackShared;

  const UI_IDS = {
    panel: 'dev-feedback-panel',
    modal: 'dev-feedback-modal',
    markerLayer: 'dev-feedback-marker-layer',
    elementDetails: 'dev-feedback-element-details',
    note: 'dev-feedback-note'
  };

  const SELECTORS = {
    panel: `#${UI_IDS.panel}`,
    modal: `#${UI_IDS.modal}`,
    markerLayer: `#${UI_IDS.markerLayer}`
  };

  const INTERACTION_MODES = Object.freeze({
    OFF: 'off',
    ELEMENT: 'element',
    VISUAL_PICK: 'visual-pick',
    VISUAL_EDIT: 'visual-edit',
    VISUAL_MATCH: 'visual-match',
    VISUAL_ALIGN: 'visual-align'
  });

  const MATCH_STYLE_PROPERTIES = Object.freeze([
    'color',
    'background-color',
    'font-size',
    'font-weight',
    'border-radius',
    'padding',
    'gap'
  ]);

  let feedbackMode = false;
  let interactionMode = INTERACTION_MODES.OFF;
  let feedbackItems = [];
  let currentElement = null;
  let isDragging = false;
  let panelCollapsed = true;
  let panelAnchor = 'right';
  let dragOffset = { x: 0, y: 0 };
  let feedbackPanel = null;
  let captureModal = null;
  let markerLayer = null;
  let decorationFrame = 0;
  let modalReturnFocus = null;
  let visualSession = null;
  let visualTarget = null;
  let visualOriginalInfo = null;
  let visualBeforeViewport = null;
  let visualInitialContext = null;
  let visualLastRect = null;
  let visualHidden = false;
  let visualBusy = false;

  function init() {
    if (!document.body) {
      return;
    }

    createFeedbackPanel();
    createCaptureModal();
    createMarkerLayer();
    attachGlobalListeners();
    loadFeedbackItems();
    console.log('Dev Feedback Capture initialized');
  }

  function createFeedbackPanel() {
    feedbackPanel = document.createElement('div');
    feedbackPanel.id = UI_IDS.panel;
    feedbackPanel.classList.add('collapsed');
    feedbackPanel.innerHTML = `
      <div class="dev-feedback-panel-header">
        <div class="dev-feedback-panel-header-title">
          <span class="dev-feedback-panel-mark" aria-hidden="true">&lt;/&gt;</span>
          <span class="dev-feedback-panel-copy">
            <span class="dev-feedback-panel-name">Dev Feedback Capture</span>
            <span class="dev-feedback-panel-subtitle">Local page review history</span>
          </span>
          <span class="dev-feedback-count">0</span>
          <span class="dev-feedback-visual-dirty" aria-label="Unsaved visual edit" title="Unsaved visual edit">V*</span>
        </div>
        <div class="dev-feedback-panel-controls">
          <button class="dev-feedback-panel-toggle" id="dev-feedback-panel-toggle" title="Expand changes" aria-label="Expand changes" aria-expanded="false">⌃</button>
          <button class="dev-feedback-panel-close" id="dev-feedback-panel-close" title="Stop element mode" aria-label="Stop element mode">x</button>
        </div>
      </div>
      <div class="dev-feedback-panel-actions">
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-copy-json">JSON</button>
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-copy-markdown">Markdown</button>
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-copy-ai">AI Prompt</button>
        <button class="dev-feedback-btn dev-feedback-btn-primary" id="dev-feedback-capture-region">Capture Region</button>
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-start-visual">Visual Edit</button>
        <button class="dev-feedback-btn dev-feedback-btn-danger" id="dev-feedback-clear">Clear</button>
      </div>
      <div class="dev-feedback-items"></div>
      <section class="dev-feedback-visual-inspector" aria-labelledby="dev-feedback-visual-title">
        <div class="dev-feedback-visual-heading">
          <div>
            <div class="dev-feedback-modal-section-title">Visual Edit</div>
            <div id="dev-feedback-visual-title" class="dev-feedback-visual-title">Pick one page element</div>
          </div>
          <button class="dev-feedback-btn dev-feedback-btn-tertiary" id="dev-feedback-visual-pick-again" type="button">Pick another</button>
        </div>
        <p class="dev-feedback-visual-status" id="dev-feedback-visual-status" role="status" aria-live="polite">Click an element on the page to begin.</p>
        <div class="dev-feedback-operation-chips" id="dev-feedback-operation-chips" aria-label="Applied visual edits"></div>
        <div class="dev-feedback-visual-history" role="toolbar" aria-label="Visual edit history">
          <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-visual-undo" type="button">Undo</button>
          <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-visual-redo" type="button">Redo</button>
          <button class="dev-feedback-btn dev-feedback-btn-tertiary" id="dev-feedback-visual-reset" type="button">Reset</button>
        </div>

        <fieldset class="dev-feedback-control-group">
          <legend>Move</legend>
          <div class="dev-feedback-nudge-grid" aria-label="Move selected element">
            <button type="button" data-nudge-x="0" data-nudge-y="-1" aria-label="Move up one pixel">↑</button>
            <button type="button" data-nudge-x="-1" data-nudge-y="0" aria-label="Move left one pixel">←</button>
            <button type="button" data-nudge-x="1" data-nudge-y="0" aria-label="Move right one pixel">→</button>
            <button type="button" data-nudge-x="0" data-nudge-y="1" aria-label="Move down one pixel">↓</button>
          </div>
          <div class="dev-feedback-inline-fields">
            <label>X <input id="dev-feedback-move-x" type="number" value="0" step="1"></label>
            <label>Y <input id="dev-feedback-move-y" type="number" value="0" step="1"></label>
            <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-apply-move" type="button">Move</button>
          </div>
        </fieldset>

        <fieldset class="dev-feedback-control-group">
          <legend>Resize</legend>
          <div class="dev-feedback-inline-fields">
            <label>W <input id="dev-feedback-width" type="number" min="1" max="100000" step="1"></label>
            <label>H <input id="dev-feedback-height" type="number" min="1" max="100000" step="1"></label>
            <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-apply-size" type="button">Apply</button>
          </div>
        </fieldset>

        <fieldset class="dev-feedback-control-group">
          <legend>Text and visibility</legend>
          <label class="dev-feedback-field-label" for="dev-feedback-visual-text">Visible text</label>
          <textarea class="dev-feedback-compact-textarea" id="dev-feedback-visual-text" maxlength="2000"></textarea>
          <div class="dev-feedback-inline-actions">
            <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-apply-text" type="button">Apply text</button>
            <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-toggle-hide" type="button">Hide</button>
          </div>
        </fieldset>

        <fieldset class="dev-feedback-control-group">
          <legend>Order and alignment</legend>
          <div class="dev-feedback-inline-actions">
            <button class="dev-feedback-btn dev-feedback-btn-secondary" data-reorder="previous" type="button">Earlier</button>
            <button class="dev-feedback-btn dev-feedback-btn-secondary" data-reorder="next" type="button">Later</button>
          </div>
          <div class="dev-feedback-inline-fields">
            <label class="dev-feedback-grow">Align
              <select id="dev-feedback-align-kind">
                <option value="left">Left</option><option value="center-x">Center X</option><option value="right">Right</option>
                <option value="top">Top</option><option value="center-y">Center Y</option><option value="bottom">Bottom</option>
              </select>
            </label>
            <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-pick-align" type="button">Pick reference</button>
          </div>
        </fieldset>

        <fieldset class="dev-feedback-control-group">
          <legend>Style</legend>
          <div class="dev-feedback-inline-fields">
            <label class="dev-feedback-grow">Property
              <select id="dev-feedback-style-property">
                <option value="color">Text color</option><option value="background-color">Background</option>
                <option value="font-size">Font size</option><option value="font-weight">Font weight</option>
                <option value="border-radius">Corner radius</option><option value="padding">Padding</option><option value="gap">Gap</option>
              </select>
            </label>
            <input id="dev-feedback-style-color" type="color" value="#8ed8a0" aria-label="Style color">
            <input id="dev-feedback-style-number" type="number" min="0" max="1000" value="16" aria-label="Style value in pixels">
            <select id="dev-feedback-style-weight" aria-label="Font weight"><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option><option value="800">800</option></select>
            <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-apply-style" type="button">Apply</button>
          </div>
          <button class="dev-feedback-btn dev-feedback-btn-secondary dev-feedback-full-width" id="dev-feedback-pick-match" type="button">Match style from another element</button>
        </fieldset>

        <fieldset class="dev-feedback-control-group dev-feedback-request-fields">
          <legend>Save change spec</legend>
          <label class="dev-feedback-field-label" for="dev-feedback-visual-note">Implementation request</label>
          <textarea class="dev-feedback-compact-textarea" id="dev-feedback-visual-note" maxlength="${MAX_NOTE_LENGTH}" placeholder="Describe what should be implemented..."></textarea>
          <label class="dev-feedback-field-label" for="dev-feedback-visual-acceptance">Acceptance checks (one per line)</label>
          <textarea class="dev-feedback-compact-textarea" id="dev-feedback-visual-acceptance" maxlength="2000" placeholder="The element visibly matches the proposed state."></textarea>
          <div class="dev-feedback-inline-actions">
            <button class="dev-feedback-btn dev-feedback-btn-primary" id="dev-feedback-save-visual" type="button">Save spec</button>
            <button class="dev-feedback-btn dev-feedback-btn-danger" id="dev-feedback-cancel-visual" type="button">Cancel &amp; restore</button>
          </div>
        </fieldset>
      </section>
      <div class="dev-feedback-panel-footer">Feedback is stored locally in this browser.</div>
    `;
    document.body.appendChild(feedbackPanel);

    feedbackPanel.querySelector('.dev-feedback-panel-header').addEventListener('mousedown', startDragging);
    feedbackPanel.querySelector('#dev-feedback-panel-toggle').addEventListener('click', togglePanelCollapsed);
    feedbackPanel.querySelector('#dev-feedback-panel-close').addEventListener('click', stopInteractionMode);
    feedbackPanel.querySelector('#dev-feedback-copy-json').addEventListener('click', copyAsJSON);
    feedbackPanel.querySelector('#dev-feedback-copy-markdown').addEventListener('click', copyAsMarkdown);
    feedbackPanel.querySelector('#dev-feedback-copy-ai').addEventListener('click', copyAsAiPrompt);
    feedbackPanel.querySelector('#dev-feedback-capture-region').addEventListener('click', startRegionCapture);
    feedbackPanel.querySelector('#dev-feedback-start-visual').addEventListener('click', startVisualEditMode);
    feedbackPanel.querySelector('#dev-feedback-clear').addEventListener('click', clearAllFeedback);
    bindVisualInspector();
  }

  function togglePanelCollapsed() {
    panelCollapsed = !panelCollapsed;
    feedbackPanel.classList.toggle('collapsed', panelCollapsed);
    const button = feedbackPanel.querySelector('#dev-feedback-panel-toggle');
    button.textContent = panelCollapsed ? '⌃' : '⌄';
    button.title = panelCollapsed ? 'Expand changes' : 'Collapse changes';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!panelCollapsed));
    window.requestAnimationFrame(() => {
      if (panelCollapsed) {
        anchorPanelToViewportEdge();
      } else {
        clampPanelToViewport();
      }
    });
  }

  function setPanelCollapsed(collapsed) {
    if (panelCollapsed === collapsed) {
      return;
    }
    togglePanelCollapsed();
  }

  function bindVisualInspector() {
    feedbackPanel.querySelectorAll('[data-nudge-x]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const scale = event.shiftKey ? 10 : 1;
        runVisualCommand(() => visualSession.nudge(
          Number(button.dataset.nudgeX) * scale,
          Number(button.dataset.nudgeY) * scale
        ));
      });
    });
    feedbackPanel.querySelector('#dev-feedback-apply-move').addEventListener('click', () => {
      const dx = Number(feedbackPanel.querySelector('#dev-feedback-move-x').value);
      const dy = Number(feedbackPanel.querySelector('#dev-feedback-move-y').value);
      if (!dx && !dy) {
        showNotification('Enter a non-zero X or Y movement.', 'error');
        return;
      }
      runVisualCommand(() => visualSession.nudge(dx, dy));
    });
    feedbackPanel.querySelector('#dev-feedback-apply-size').addEventListener('click', () => {
      const width = Number(feedbackPanel.querySelector('#dev-feedback-width').value);
      const height = Number(feedbackPanel.querySelector('#dev-feedback-height').value);
      if (!(width > 0) || !(height > 0)) {
        showNotification('Width and height must be greater than zero.', 'error');
        return;
      }
      runVisualCommand(() => visualSession.commitStyle('Resize element', {
        width: `${width}px`,
        height: `${height}px`,
        'box-sizing': 'border-box'
      }, 'resize'));
    });
    feedbackPanel.querySelector('#dev-feedback-apply-text').addEventListener('click', () => {
      runVisualCommand(() => visualSession.commitText(feedbackPanel.querySelector('#dev-feedback-visual-text').value));
    });
    feedbackPanel.querySelector('#dev-feedback-toggle-hide').addEventListener('click', () => {
      runVisualCommand(() => visualSession.commitHide(!visualHidden), () => {
        visualHidden = !visualHidden;
      });
    });
    feedbackPanel.querySelectorAll('[data-reorder]').forEach((button) => {
      button.addEventListener('click', () => runVisualCommand(() => visualSession.commitReorder(button.dataset.reorder)));
    });
    feedbackPanel.querySelector('#dev-feedback-style-property').addEventListener('change', syncStyleControl);
    feedbackPanel.querySelector('#dev-feedback-apply-style').addEventListener('click', applyCuratedStyle);
    feedbackPanel.querySelector('#dev-feedback-pick-match').addEventListener('click', () => beginReferencePick(INTERACTION_MODES.VISUAL_MATCH));
    feedbackPanel.querySelector('#dev-feedback-pick-align').addEventListener('click', () => beginReferencePick(INTERACTION_MODES.VISUAL_ALIGN));
    feedbackPanel.querySelector('#dev-feedback-visual-pick-again').addEventListener('click', pickAnotherVisualTarget);
    feedbackPanel.querySelector('#dev-feedback-visual-undo').addEventListener('click', () => runVisualCommand(() => visualSession.undo()));
    feedbackPanel.querySelector('#dev-feedback-visual-redo').addEventListener('click', () => runVisualCommand(() => visualSession.redo()));
    feedbackPanel.querySelector('#dev-feedback-visual-reset').addEventListener('click', resetVisualSession);
    feedbackPanel.querySelector('#dev-feedback-save-visual').addEventListener('click', saveVisualSpec);
    feedbackPanel.querySelector('#dev-feedback-cancel-visual').addEventListener('click', cancelVisualEdit);
    syncStyleControl();
  }

  function syncStyleControl() {
    const property = feedbackPanel.querySelector('#dev-feedback-style-property').value;
    const color = feedbackPanel.querySelector('#dev-feedback-style-color');
    const number = feedbackPanel.querySelector('#dev-feedback-style-number');
    const weight = feedbackPanel.querySelector('#dev-feedback-style-weight');
    color.hidden = !['color', 'background-color'].includes(property);
    number.hidden = !['font-size', 'border-radius', 'padding', 'gap'].includes(property);
    weight.hidden = property !== 'font-weight';
  }

  function applyCuratedStyle() {
    const property = feedbackPanel.querySelector('#dev-feedback-style-property').value;
    let value;
    if (['color', 'background-color'].includes(property)) {
      value = feedbackPanel.querySelector('#dev-feedback-style-color').value;
    } else if (property === 'font-weight') {
      value = feedbackPanel.querySelector('#dev-feedback-style-weight').value;
    } else {
      const number = Number(feedbackPanel.querySelector('#dev-feedback-style-number').value);
      if (!Number.isFinite(number) || number < 0) {
        showNotification('Enter a non-negative style value.', 'error');
        return;
      }
      value = `${number}px`;
    }
    runVisualCommand(() => visualSession.commitStyle(`Set ${property}`, { [property]: value }, 'style'));
  }

  function clampPanelToViewport() {
    const rect = feedbackPanel.getBoundingClientRect();
    feedbackPanel.style.left = `${clamp(rect.left, 8, Math.max(8, window.innerWidth - rect.width - 8))}px`;
    feedbackPanel.style.top = `${clamp(rect.top, 8, Math.max(8, window.innerHeight - rect.height - 8))}px`;
    feedbackPanel.style.right = 'auto';
    feedbackPanel.style.bottom = 'auto';
  }

  function getAnchoredPanelPosition(x, y, width, height, preferredEdge = null) {
    const inset = 8;
    const maxX = Math.max(inset, window.innerWidth - width - inset);
    const maxY = Math.max(inset, window.innerHeight - height - inset);
    const clampedX = clamp(x, inset, maxX);
    const clampedY = clamp(y, inset, maxY);
    const distances = {
      left: clampedX - inset,
      right: maxX - clampedX,
      top: clampedY - inset,
      bottom: maxY - clampedY
    };
    const edge = preferredEdge && Object.hasOwn(distances, preferredEdge)
      ? preferredEdge
      : Object.entries(distances).sort((left, right) => left[1] - right[1])[0][0];

    return {
      edge,
      x: edge === 'left' ? inset : edge === 'right' ? maxX : clampedX,
      y: edge === 'top' ? inset : edge === 'bottom' ? maxY : clampedY
    };
  }

  function anchorPanelToViewportEdge(preferredEdge = null) {
    const rect = feedbackPanel.getBoundingClientRect();
    const position = getAnchoredPanelPosition(
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      preferredEdge
    );
    panelAnchor = position.edge;
    feedbackPanel.dataset.anchor = panelAnchor;
    feedbackPanel.style.left = `${position.x}px`;
    feedbackPanel.style.top = `${position.y}px`;
    feedbackPanel.style.right = 'auto';
    feedbackPanel.style.bottom = 'auto';
  }

  function createCaptureModal() {
    captureModal = document.createElement('div');
    captureModal.id = UI_IDS.modal;
    captureModal.innerHTML = `
      <div class="dev-feedback-modal-content" role="dialog" aria-modal="true" aria-labelledby="dev-feedback-modal-title" tabindex="-1">
        <h2 class="dev-feedback-modal-title" id="dev-feedback-modal-title">Capture Element Feedback</h2>

        <div class="dev-feedback-modal-section">
          <div class="dev-feedback-modal-section-title">Element Information</div>
          <div class="dev-feedback-element-info" id="${UI_IDS.elementDetails}"></div>
        </div>

        <div class="dev-feedback-modal-section">
          <label class="dev-feedback-modal-section-title" for="${UI_IDS.note}">What do you want changed?</label>
          <textarea
            class="dev-feedback-textarea"
            id="${UI_IDS.note}"
            maxlength="${MAX_NOTE_LENGTH}"
            placeholder="Describe the changes you'd like to see..."
          ></textarea>
          <div class="dev-feedback-help-text">Up to ${MAX_NOTE_LENGTH} characters.</div>
        </div>

        <div class="dev-feedback-modal-actions">
          <button class="dev-feedback-btn dev-feedback-btn-large dev-feedback-btn-primary" id="dev-feedback-save">Save Feedback</button>
          <button class="dev-feedback-btn dev-feedback-btn-large dev-feedback-btn-secondary" id="dev-feedback-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(captureModal);

    captureModal.querySelector('#dev-feedback-save').addEventListener('click', saveFeedback);
    captureModal.querySelector('#dev-feedback-cancel').addEventListener('click', closeCaptureModal);
    captureModal.addEventListener('click', (event) => {
      if (event.target === captureModal) {
        closeCaptureModal();
      }
    });
  }

  function createMarkerLayer() {
    markerLayer = document.createElement('div');
    markerLayer.id = UI_IDS.markerLayer;
    document.body.appendChild(markerLayer);
  }

  function attachGlobalListeners() {
    window.addEventListener('resize', handleViewportResize, { passive: true });
    window.addEventListener('scroll', scheduleDecorationRefresh, true);
    document.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('pagehide', restoreVisualOnPageExit);
    window.addEventListener('beforeunload', restoreVisualOnPageExit);
    window.addEventListener('popstate', restoreVisualAfterSameDocumentNavigation);
    window.addEventListener('hashchange', restoreVisualAfterSameDocumentNavigation);
  }

  function handleViewportResize() {
    scheduleDecorationRefresh();
    if (!feedbackPanel?.classList.contains('visible')) {
      return;
    }
    window.requestAnimationFrame(() => {
      if (panelCollapsed) {
        anchorPanelToViewportEdge(panelAnchor);
      } else {
        clampPanelToViewport();
      }
    });
  }

  function handleGlobalKeydown(event) {
    if (event.key === 'Escape' && captureModal.classList.contains('visible')) {
      event.preventDefault();
      closeCaptureModal();
      return;
    }

    if (event.key === 'Escape' && [INTERACTION_MODES.VISUAL_MATCH, INTERACTION_MODES.VISUAL_ALIGN].includes(interactionMode)) {
      event.preventDefault();
      interactionMode = INTERACTION_MODES.VISUAL_EDIT;
      renderVisualInspector('Reference selection cancelled.');
      return;
    }

    const editable = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (!editable && visualSession && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      runVisualCommand(() => event.shiftKey ? visualSession.redo() : visualSession.undo());
      return;
    }

    if (!editable && visualSession && event.ctrlKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      runVisualCommand(() => visualSession.redo());
      return;
    }

    if (event.key === 'Tab' && captureModal.classList.contains('visible')) {
      trapModalFocus(event);
    }
  }

  function trapModalFocus(event) {
    const focusable = Array.from(captureModal.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.disabled);
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function toggleFeedbackMode() {
    setInteractionMode(interactionMode === INTERACTION_MODES.ELEMENT ? INTERACTION_MODES.OFF : INTERACTION_MODES.ELEMENT);
  }

  function setFeedbackMode(enabled) {
    setInteractionMode(enabled ? INTERACTION_MODES.ELEMENT : INTERACTION_MODES.OFF);
  }

  function setInteractionMode(nextMode, options = {}) {
    if (interactionMode === nextMode) {
      return true;
    }
    if (visualBusy && visualSession) {
      showNotification('Wait for the current visual evidence capture to finish.', 'error');
      return false;
    }
    if (
      visualSession
      && !String(nextMode).startsWith('visual-')
      && visualSession.getState().dirty
      && !options.discardVisual
    ) {
      showNotification('Save or Cancel the visual preview before changing modes.', 'error');
      return false;
    }
    if (visualSession && !String(nextMode).startsWith('visual-')) {
      restoreVisualSession();
    }
    interactionMode = nextMode;
    feedbackMode = nextMode === INTERACTION_MODES.ELEMENT;
    feedbackPanel.classList.toggle('visible', nextMode !== INTERACTION_MODES.OFF);
    feedbackPanel.classList.toggle('visual-active', String(nextMode).startsWith('visual-'));
    closeCaptureModal();
    if (nextMode === INTERACTION_MODES.OFF) {
      disableElementHighlighting();
    } else {
      enableElementHighlighting();
    }
    renderVisualInspector();
    scheduleDecorationRefresh();
    if (nextMode !== INTERACTION_MODES.OFF) {
      window.requestAnimationFrame(() => {
        if (panelCollapsed) {
          anchorPanelToViewportEdge(panelAnchor);
        } else {
          clampPanelToViewport();
        }
      });
    }
    return true;
  }

  function stopInteractionMode() {
    setInteractionMode(INTERACTION_MODES.OFF, { discardVisual: true });
  }

  function startVisualEditMode() {
    if (!globalThis.DevFeedbackVisualEdit?.createSession) {
      showNotification('Visual Edit did not load. Refresh the page and try again.', 'error');
      return { ok: false, reason: 'Visual Edit engine unavailable.' };
    }
    if (visualBusy) {
      return { ok: false, reason: 'Wait for the current visual evidence capture to finish.' };
    }
    if (visualSession?.getState().dirty) {
      return { ok: false, reason: 'Save or Cancel the current visual preview before starting another.' };
    }
    if (visualSession) {
      restoreVisualSession();
    }
    setInteractionMode(INTERACTION_MODES.VISUAL_PICK);
    setPanelCollapsed(true);
    showNotification('Visual Edit: pick one page element.');
    return { ok: true };
  }

  function enableElementHighlighting() {
    disableElementHighlighting();
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleElementClick, true);
  }

  function disableElementHighlighting() {
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('click', handleElementClick, true);

    document.querySelectorAll('.dev-feedback-highlight').forEach((element) => {
      element.classList.remove('dev-feedback-highlight');
    });
  }

  function handleMouseOver(event) {
    if (interactionMode === INTERACTION_MODES.OFF || interactionMode === INTERACTION_MODES.VISUAL_EDIT || isOurElement(event.target)) {
      return;
    }

    event.target.classList.add('dev-feedback-highlight');
  }

  function handleMouseOut(event) {
    if (interactionMode === INTERACTION_MODES.OFF || interactionMode === INTERACTION_MODES.VISUAL_EDIT || isOurElement(event.target)) {
      return;
    }

    event.target.classList.remove('dev-feedback-highlight');
  }

  function handleElementClick(event) {
    if (interactionMode === INTERACTION_MODES.OFF || interactionMode === INTERACTION_MODES.VISUAL_EDIT) {
      return;
    }

    const target = event.target;
    if (isOurElement(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (interactionMode === INTERACTION_MODES.ELEMENT) {
      captureElement(target);
    } else if (interactionMode === INTERACTION_MODES.VISUAL_PICK) {
      selectVisualTarget(target);
    } else if (interactionMode === INTERACTION_MODES.VISUAL_MATCH) {
      applyMatchReference(target);
    } else if (interactionMode === INTERACTION_MODES.VISUAL_ALIGN) {
      applyAlignReference(target);
    }
  }

  function isOurElement(element) {
    return Boolean(
      element &&
      (
        (element.id && element.id.startsWith('dev-feedback')) ||
        (typeof element.closest === 'function' && element.closest(SELECTORS.panel)) ||
        (typeof element.closest === 'function' && element.closest(SELECTORS.modal)) ||
        (typeof element.closest === 'function' && element.closest(SELECTORS.markerLayer))
      )
    );
  }

  function captureElement(element) {
    currentElement = element;
    const elementInfo = buildElementSnapshot(element);

    displayElementInfo(elementInfo);
    showCaptureModal();
  }

  async function selectVisualTarget(element) {
    if (visualBusy || isOurElement(element)) {
      return;
    }
    if (element === document.body || element === document.documentElement || element.contains(feedbackPanel)) {
      showNotification('Pick a specific page element rather than the document root.', 'error');
      return;
    }
    visualBusy = true;
    element.classList.remove('dev-feedback-highlight');
    try {
      const originalInfo = buildElementSnapshot(element);
      const beforeViewport = await captureVisualViewport();
      if (!beforeViewport) {
        throw new Error('Unable to capture before evidence. Keep this tab visible and try again.');
      }
      visualTarget = element;
      visualOriginalInfo = originalInfo;
      visualBeforeViewport = beforeViewport;
      visualInitialContext = buildPageContext();
      visualLastRect = originalInfo.rect;
      visualHidden = false;
      visualSession = globalThis.DevFeedbackVisualEdit.createSession({
        target: element,
        maxCommands: 24,
        buildTargetSnapshot: buildVisualTargetSnapshot
      });
      interactionMode = INTERACTION_MODES.VISUAL_EDIT;
      feedbackPanel.classList.add('visual-active');
      populateVisualInputs(originalInfo);
      placePanelOppositeTarget(originalInfo.rect);
      setPanelCollapsed(false);
      renderVisualInspector('Preview changes here. The page is restored after Save or Cancel.');
      scheduleDecorationRefresh();
    } catch (error) {
      restoreVisualSession();
      interactionMode = INTERACTION_MODES.VISUAL_PICK;
      showNotification(error.message || 'Unable to start a visual edit for this element.', 'error');
    } finally {
      visualBusy = false;
    }
  }

  function buildVisualTargetSnapshot(element) {
    const snapshot = buildElementSnapshot(element);
    return {
      selectors: snapshot.selectors,
      tag: snapshot.tag,
      role: snapshot.role,
      text: snapshot.text,
      rect: snapshot.rect,
      surroundingText: snapshot.surroundingText,
      parentLayout: snapshot.parentLayout
    };
  }

  function populateVisualInputs(info, resetRequestFields = true) {
    feedbackPanel.querySelector('#dev-feedback-width').value = Math.max(1, Math.round(info.rect.width));
    feedbackPanel.querySelector('#dev-feedback-height').value = Math.max(1, Math.round(info.rect.height));
    feedbackPanel.querySelector('#dev-feedback-visual-text').value = info.text || '';
    feedbackPanel.querySelector('#dev-feedback-move-x').value = '0';
    feedbackPanel.querySelector('#dev-feedback-move-y').value = '0';
    if (resetRequestFields) {
      feedbackPanel.querySelector('#dev-feedback-visual-note').value = '';
      feedbackPanel.querySelector('#dev-feedback-visual-acceptance').value = '';
    }
  }

  function placePanelOppositeTarget(rect) {
    feedbackPanel.style.top = `${clamp(18, 8, Math.max(8, window.innerHeight - feedbackPanel.offsetHeight - 8))}px`;
    if (rect.x + rect.width / 2 > window.innerWidth / 2) {
      feedbackPanel.style.left = '18px';
      feedbackPanel.style.right = 'auto';
    } else {
      feedbackPanel.style.left = 'auto';
      feedbackPanel.style.right = '18px';
    }
  }

  function beginReferencePick(mode) {
    if (!visualSession) {
      return;
    }
    interactionMode = mode;
    setPanelCollapsed(true);
    renderVisualInspector(mode === INTERACTION_MODES.VISUAL_MATCH
      ? 'Pick the element whose style should be matched. Press Escape to cancel.'
      : 'Pick the element to align against. Press Escape to cancel.');
  }

  function applyMatchReference(reference) {
    if (reference === visualTarget) {
      showNotification('Pick a different element to match.', 'error');
      return;
    }
    if (!runVisualCommand(() => visualSession.commitMatchStyle(reference, MATCH_STYLE_PROPERTIES))) {
      return;
    }
    interactionMode = INTERACTION_MODES.VISUAL_EDIT;
    setPanelCollapsed(false);
    renderVisualInspector('Matched the selected style facets.');
  }

  function applyAlignReference(reference) {
    if (reference === visualTarget) {
      showNotification('Pick a different alignment reference.', 'error');
      return;
    }
    const alignment = feedbackPanel.querySelector('#dev-feedback-align-kind').value;
    if (!runVisualCommand(() => visualSession.commitAlign(reference, alignment))) {
      return;
    }
    interactionMode = INTERACTION_MODES.VISUAL_EDIT;
    setPanelCollapsed(false);
    renderVisualInspector(`Aligned ${alignment} to the selected reference.`);
  }

  function runVisualCommand(command, onApplied) {
    if (!visualSession || visualBusy) {
      return false;
    }
    try {
      const result = command();
      if (result !== null && result !== false && onApplied) {
        onApplied();
      }
      if (visualTarget?.isConnected) {
        visualHidden = window.getComputedStyle(visualTarget).display === 'none';
        const rect = getViewportRect(visualTarget);
        if (rect.width > 0 && rect.height > 0) {
          visualLastRect = rect;
        }
        syncVisualInputsFromTarget();
      }
      renderVisualInspector();
      scheduleDecorationRefresh();
      return result !== null && result !== false;
    } catch (error) {
      showNotification(error.message || 'Unable to apply that visual edit.', 'error');
      return false;
    }
  }

  function resetVisualSession() {
    if (!visualSession) {
      return;
    }
    visualSession.reset();
    visualHidden = false;
    populateVisualInputs(visualOriginalInfo, false);
    renderVisualInspector('All preview edits reset.');
    scheduleDecorationRefresh();
  }

  function syncVisualInputsFromTarget() {
    if (!visualTarget?.isConnected) {
      return;
    }
    const rect = getViewportRect(visualTarget);
    if (rect.width > 0 && rect.height > 0) {
      feedbackPanel.querySelector('#dev-feedback-width').value = Math.max(1, Math.round(rect.width));
      feedbackPanel.querySelector('#dev-feedback-height').value = Math.max(1, Math.round(rect.height));
    }
    feedbackPanel.querySelector('#dev-feedback-visual-text').value = (visualTarget.textContent || '').trim().slice(0, 2000);
    feedbackPanel.querySelector('#dev-feedback-move-x').value = '0';
    feedbackPanel.querySelector('#dev-feedback-move-y').value = '0';
  }

  function pickAnotherVisualTarget() {
    if (visualBusy) {
      showNotification('Wait for the current visual evidence capture to finish.', 'error');
      return;
    }
    if (visualSession?.getState().dirty) {
      showNotification('Save, Reset, or Cancel the current preview before picking another element.', 'error');
      return;
    }
    restoreVisualSession();
    interactionMode = INTERACTION_MODES.VISUAL_PICK;
    feedbackPanel.classList.add('visual-active');
    setPanelCollapsed(true);
    renderVisualInspector('Click another page element to begin.');
    scheduleDecorationRefresh();
  }

  function cancelVisualEdit() {
    if (visualBusy) {
      showNotification('Wait for the current visual evidence capture to finish.', 'error');
      return;
    }
    restoreVisualSession();
    interactionMode = INTERACTION_MODES.VISUAL_PICK;
    feedbackPanel.classList.add('visual-active');
    setPanelCollapsed(true);
    renderVisualInspector('Preview restored. Pick another element.');
    showNotification('Visual preview cancelled and page restored.');
  }

  function restoreVisualSession() {
    if (visualSession) {
      try {
        visualSession.restore();
      } catch (error) {
        console.debug('Unable to restore visual edit session:', error.message);
      }
    }
    visualSession = null;
    visualTarget = null;
    visualOriginalInfo = null;
    visualBeforeViewport = null;
    visualInitialContext = null;
    visualLastRect = null;
    visualHidden = false;
    visualBusy = false;
    if (feedbackPanel) {
      feedbackPanel.classList.remove('visual-dirty');
    }
  }

  function restoreVisualOnPageExit() {
    if (!visualSession) {
      return;
    }
    restoreVisualSession();
    interactionMode = INTERACTION_MODES.OFF;
    feedbackMode = false;
    disableElementHighlighting();
    if (feedbackPanel) {
      feedbackPanel.classList.remove('visible', 'visual-active');
    }
  }

  function restoreVisualAfterSameDocumentNavigation() {
    if (!visualSession) {
      return;
    }
    restoreVisualSession();
    interactionMode = INTERACTION_MODES.VISUAL_PICK;
    feedbackMode = false;
    feedbackPanel.classList.add('visible', 'visual-active');
    setPanelCollapsed(true);
    renderVisualInspector('Page navigation restored the preview. Pick an element again.');
    scheduleDecorationRefresh();
  }

  function renderVisualInspector(statusMessage) {
    if (!feedbackPanel) {
      return;
    }
    const inspector = feedbackPanel.querySelector('.dev-feedback-visual-inspector');
    if (!inspector) {
      return;
    }
    const visualActive = String(interactionMode).startsWith('visual-');
    feedbackPanel.classList.toggle('visual-active', visualActive);
    const state = visualSession?.getState();
    feedbackPanel.classList.toggle('visual-dirty', Boolean(state?.dirty));
    const title = feedbackPanel.querySelector('#dev-feedback-visual-title');
    title.textContent = visualTarget
      ? `${visualOriginalInfo?.tag || 'element'} · ${visualOriginalInfo?.selector || ''}`
      : 'Pick one page element';
    if (statusMessage) {
      feedbackPanel.querySelector('#dev-feedback-visual-status').textContent = statusMessage;
    } else if (!visualTarget) {
      feedbackPanel.querySelector('#dev-feedback-visual-status').textContent = 'Click an element on the page to begin.';
    } else {
      feedbackPanel.querySelector('#dev-feedback-visual-status').textContent = state?.dirty
        ? `${state.appliedCommandCount} reversible edit${state.appliedCommandCount === 1 ? '' : 's'} applied.`
        : 'No preview edits yet.';
    }
    const chips = feedbackPanel.querySelector('#dev-feedback-operation-chips');
    chips.replaceChildren();
    const commands = visualSession?.snapshot().commands || [];
    commands.forEach((command) => {
      const chip = document.createElement('span');
      chip.className = 'dev-feedback-operation-chip';
      chip.textContent = command.label;
      chips.appendChild(chip);
    });
    feedbackPanel.querySelector('#dev-feedback-visual-undo').disabled = !state?.canUndo;
    feedbackPanel.querySelector('#dev-feedback-visual-redo').disabled = !state?.canRedo;
    feedbackPanel.querySelector('#dev-feedback-visual-reset').disabled = !state?.dirty;
    feedbackPanel.querySelector('#dev-feedback-save-visual').disabled = !state?.dirty || visualBusy;
    feedbackPanel.querySelector('#dev-feedback-visual-pick-again').disabled = !visualTarget;
    feedbackPanel.querySelector('#dev-feedback-toggle-hide').textContent = visualHidden ? 'Show' : 'Hide';
    const closeButton = feedbackPanel.querySelector('#dev-feedback-panel-close');
    closeButton.title = visualActive ? 'Stop Visual Edit and restore page' : 'Stop element mode';
    closeButton.setAttribute('aria-label', closeButton.title);
    inspector.querySelectorAll('fieldset').forEach((fieldset) => {
      fieldset.disabled = !visualSession || visualBusy;
    });
  }

  async function saveVisualSpec() {
    if (!visualSession || visualBusy) {
      return;
    }
    const noteField = feedbackPanel.querySelector('#dev-feedback-visual-note');
    const note = noteField.value.trim();
    if (!note) {
      showNotification('Add an implementation request before saving.', 'error');
      noteField.focus();
      return;
    }
    const state = visualSession.getState();
    if (!state.dirty) {
      showNotification('Apply at least one visual edit before saving.', 'error');
      return;
    }
    if (!visualTarget?.isConnected || !sameVisualViewport()) {
      showNotification('The page moved or changed. Reset and pick the element again.', 'error');
      return;
    }

    visualBusy = true;
    let finalStatus = '';
    renderVisualInspector('Capturing proposed evidence...');
    try {
      const proposedViewport = await captureVisualViewport();
      if (!proposedViewport?.dataUrl || !visualBeforeViewport?.dataUrl) {
        throw new Error('Could not capture both before and proposed evidence. Nothing was saved.');
      }
      const currentRect = getViewportRect(visualTarget);
      const evidenceRect = buildEvidenceRect(visualOriginalInfo.rect, currentRect.width > 0 ? currentRect : visualLastRect);
      const [beforeDataUrl, proposedDataUrl] = await Promise.all([
        cropViewportImage(visualBeforeViewport.dataUrl, evidenceRect),
        cropViewportImage(proposedViewport.dataUrl, evidenceRect)
      ]);
      if (!beforeDataUrl || !proposedDataUrl) {
        throw new Error('Visual evidence could not be cropped. Nothing was saved.');
      }

      const sessionSnapshot = visualSession.snapshot();
      const proposedElementInfo = buildElementSnapshot(visualTarget);
      const requestedMutations = buildRequestedMutations(sessionSnapshot, proposedElementInfo);
      if (!requestedMutations.length) {
        throw new Error('No supported visual mutations were produced. Nothing was saved.');
      }
      const acceptance = feedbackPanel.querySelector('#dev-feedback-visual-acceptance').value
        .split(/\r?\n/)
        .map((criterion) => criterion.trim())
        .filter(Boolean)
        .slice(0, 12);
      const item = {
        specVersion: 2,
        id: buildFeedbackId(),
        type: CAPTURE_TYPE_ELEMENT,
        captureType: CAPTURE_TYPE_ELEMENT,
        selector: visualOriginalInfo.selector,
        pageUrl: window.location.href,
        pageTitle: document.title,
        elementInfo: toStoredElementInfo(visualOriginalInfo),
        proposedElementInfo: toStoredElementInfo(proposedElementInfo),
        position: visualOriginalInfo.position,
        pageContext: visualInitialContext,
        changeRequest: {
          kind: 'requested-mutation',
          summary: note.slice(0, MAX_NOTE_LENGTH),
          requestedMutations
        },
        evidence: {
          before: { mimeType: 'image/png', dataUrl: beforeDataUrl, source: { kind: 'captured' } },
          proposed: { mimeType: 'image/png', dataUrl: proposedDataUrl, source: { kind: 'rendered-preview' } }
        },
        acceptance,
        note: note.slice(0, MAX_NOTE_LENGTH),
        timestamp: new Date().toISOString()
      };

      visualSession.restore();
      visualSession = null;
      const nextItems = await runFeedbackMutation('add-feedback-item', { item });
      if (!nextItems) {
        throw new Error('Unable to store the visual change spec.');
      }
      feedbackItems = sanitizeFeedbackItems(nextItems, window.location.href, document.title);
      restoreVisualSession();
      interactionMode = INTERACTION_MODES.VISUAL_PICK;
      feedbackPanel.classList.add('visual-active');
      setPanelCollapsed(true);
      updateFeedbackPanel();
      finalStatus = 'Saved locally. Pick another element.';
      scheduleDecorationRefresh();
      showNotification('Visual change spec saved and page restored.');
    } catch (error) {
      showNotification(error.message || 'Unable to save the visual change spec.', 'error');
      if (visualSession) {
        finalStatus = 'Save failed. Your reversible preview is still active.';
      } else {
        restoreVisualSession();
        interactionMode = INTERACTION_MODES.VISUAL_PICK;
        finalStatus = 'Save failed after restoring the page. Pick the element again.';
      }
    } finally {
      visualBusy = false;
      renderVisualInspector(finalStatus);
    }
  }

  function toStoredElementInfo(info) {
    return {
      tag: info.tag,
      classes: info.classes,
      text: info.text,
      styles: info.styles,
      role: info.role,
      surroundingText: info.surroundingText,
      parentLayout: info.parentLayout
    };
  }

  function buildRequestedMutations(sessionSnapshot, proposedInfo) {
    return sessionSnapshot.commands.slice(0, 24).flatMap((command, index) => {
      const operations = command.operations || [];
      const target = command.target || sessionSnapshot.target;
      let action = command.kind;
      if (action === 'text') action = 'rewrite';
      if (action === 'style' || action === 'match-style') action = 'restyle';
      if (action === 'align') action = 'move';
      let parameters = {};

      if (action === 'rewrite') {
        const operation = operations.find((candidate) => candidate.kind === 'text');
        parameters = { text: operation?.after?.value || proposedInfo.text };
      } else if (action === 'hide') {
        parameters = { hidden: operations.some((operation) => operation.after?.value === 'none') };
      } else if (action === 'reorder') {
        parameters = { index: Math.max(0, Array.from(visualTarget.parentElement?.children || []).indexOf(visualTarget)) };
      } else if (action === 'move') {
        const operation = operations.find((candidate) => candidate.property === 'translate');
        const before = parseTranslateValue(operation?.before?.value);
        const after = parseTranslateValue(operation?.after?.value);
        parameters = { deltaX: after.x - before.x, deltaY: after.y - before.y };
      } else if (action === 'resize') {
        operations.forEach((operation) => {
          if (operation.property === 'width' || operation.property === 'height') {
            parameters[operation.property] = Math.max(0, Number.parseFloat(operation.after?.value) || 0);
          }
        });
      } else if (action === 'restyle') {
        parameters = {
          styles: operations.reduce((styles, operation) => {
            if (operation.property && operation.after?.value !== undefined) {
              styles[operation.property] = operation.after.value;
            }
            return styles;
          }, {})
        };
      }

      return [{
        id: command.id || `mutation-${index + 1}`,
        action,
        target,
        parameters
      }];
    });
  }

  function parseTranslateValue(value) {
    const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?$/);
    return match ? { x: Number(match[1]), y: Number(match[2] || 0) } : { x: 0, y: 0 };
  }

  function sameVisualViewport() {
    const viewport = visualInitialContext?.viewport;
    return visualInitialContext?.url === window.location.href
      && viewport
      && Math.abs(viewport.scrollX - window.scrollX) <= 2
      && Math.abs(viewport.scrollY - window.scrollY) <= 2
      && Math.abs(viewport.width - window.innerWidth) <= 2
      && Math.abs(viewport.height - window.innerHeight) <= 2
      && Math.abs(viewport.devicePixelRatio - window.devicePixelRatio) <= 0.02;
  }

  async function captureVisualViewport() {
    const elements = [feedbackPanel, captureModal, markerLayer];
    const visibility = elements.map((element) => element?.style.visibility || '');
    const highlighted = Array.from(document.querySelectorAll('.dev-feedback-highlight'));
    const selected = Array.from(document.querySelectorAll('.dev-feedback-selected'));
    elements.forEach((element) => {
      if (element) element.style.visibility = 'hidden';
    });
    highlighted.forEach((element) => element.classList.remove('dev-feedback-highlight'));
    selected.forEach((element) => element.classList.remove('dev-feedback-selected'));
    try {
      await nextAnimationFrame();
      await nextAnimationFrame();
      const response = await chrome.runtime.sendMessage({ action: 'capture-visual-edit-viewport' });
      return response?.ok && /^data:image\/png;base64,/i.test(response.dataUrl || '')
        ? { dataUrl: response.dataUrl, metrics: getViewportMetrics() }
        : null;
    } finally {
      elements.forEach((element, index) => {
        if (element) element.style.visibility = visibility[index];
      });
      if (interactionMode !== INTERACTION_MODES.VISUAL_EDIT) {
        highlighted.forEach((element) => element.classList.add('dev-feedback-highlight'));
      }
      scheduleDecorationRefresh();
    }
  }

  function buildEvidenceRect(originalRect, proposedRect) {
    const padding = 24;
    const left = Math.max(0, Math.min(originalRect.x, proposedRect.x) - padding);
    const top = Math.max(0, Math.min(originalRect.y, proposedRect.y) - padding);
    const right = Math.min(window.innerWidth, Math.max(originalRect.x + originalRect.width, proposedRect.x + proposedRect.width) + padding);
    const bottom = Math.min(window.innerHeight, Math.max(originalRect.y + originalRect.height, proposedRect.y + proposedRect.height) + padding);
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  async function cropViewportImage(dataUrl, rect) {
    const image = await loadDataImage(dataUrl);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const sourceX = Math.round(rect.x * scaleX);
    const sourceY = Math.round(rect.y * scaleY);
    const sourceWidth = Math.max(1, Math.round(rect.width * scaleX));
    const sourceHeight = Math.max(1, Math.round(rect.height * scaleY));
    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return '';
    }
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    return canvas.toDataURL('image/png');
  }

  function loadDataImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to decode captured visual evidence.'));
      image.src = dataUrl;
    });
  }

  function buildElementSnapshot(element) {
    const computedStyles = window.getComputedStyle(element);
    return {
      selector: getElementSelector(element),
      selectors: getElementSelectors(element),
      tag: element.tagName.toLowerCase(),
      role: getElementRole(element),
      classes: Array.from(element.classList).filter((className) => !className.startsWith('dev-feedback')),
      text: (element.innerText || element.textContent || '').trim().slice(0, 280),
      surroundingText: (element.parentElement?.innerText || element.parentElement?.textContent || '').trim().slice(0, 500),
      styles: pickTrackedStyles(computedStyles),
      parentLayout: pickParentLayout(element.parentElement),
      position: getElementPosition(element),
      rect: getViewportRect(element)
    };
  }

  function getElementSelectors(element) {
    const selectors = [getElementSelector(element)];
    ['data-testid', 'data-test', 'data-qa', 'name'].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (value) {
        selectors.push(`${element.tagName.toLowerCase()}[${attribute}="${escapeAttributeValue(value)}"]`);
      }
    });
    if (element.getAttribute('aria-label')) {
      selectors.push(`${element.tagName.toLowerCase()}[aria-label="${escapeAttributeValue(element.getAttribute('aria-label'))}"]`);
    }
    return Array.from(new Set(selectors)).slice(0, 4);
  }

  function escapeAttributeValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function getElementRole(element) {
    const explicitRole = element.getAttribute('role');
    if (explicitRole) {
      return explicitRole;
    }
    return ({ A: 'link', BUTTON: 'button', INPUT: 'input', SELECT: 'combobox', TEXTAREA: 'textbox' })[element.tagName] || '';
  }

  function pickParentLayout(parent) {
    if (!parent) {
      return {};
    }
    const styles = window.getComputedStyle(parent);
    return {
      display: styles.display,
      direction: styles.flexDirection,
      gridTemplateColumns: styles.gridTemplateColumns,
      gap: styles.gap,
      alignItems: styles.alignItems,
      justifyContent: styles.justifyContent
    };
  }

  function getViewportRect(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function pickTrackedStyles(computedStyles) {
    return {
      'background-color': computedStyles.backgroundColor,
      'color': computedStyles.color,
      'font-size': computedStyles.fontSize,
      'font-weight': computedStyles.fontWeight,
      'width': computedStyles.width,
      'height': computedStyles.height,
      'margin': computedStyles.margin,
      'padding': computedStyles.padding,
      'gap': computedStyles.gap,
      'border-radius': computedStyles.borderRadius,
      'display': computedStyles.display,
      'opacity': computedStyles.opacity
    };
  }

  function getElementPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY)
    };
  }

  function getElementSelector(element) {
    if (element.id) {
      return `#${escapeCssIdentifier(element.id)}`;
    }

    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 5) {
      let selector = current.tagName.toLowerCase();
      const classNames = Array.from(current.classList)
        .filter((className) => !className.startsWith('dev-feedback'))
        .slice(0, 2);

      if (classNames.length > 0) {
        selector += `.${classNames.map(escapeCssIdentifier).join('.')}`;
      }

      if (current.parentElement) {
        const sameTypeSiblings = Array.from(current.parentElement.children).filter(
          (sibling) => sibling.tagName === current.tagName
        );

        if (sameTypeSiblings.length > 1) {
          selector += `:nth-of-type(${sameTypeSiblings.indexOf(current) + 1})`;
        }
      }

      path.unshift(selector);

      const candidate = path.join(' > ');
      if (isUniqueSelector(candidate)) {
        return candidate;
      }

      current = current.parentElement;
    }

    return path.join(' > ');
  }

  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (error) {
      return false;
    }
  }

  function displayElementInfo(elementInfo) {
    const detailsContainer = captureModal.querySelector(`#${UI_IDS.elementDetails}`);
    const fragment = document.createDocumentFragment();

    addInfoRow(fragment, 'Selector', elementInfo.selector);
    addInfoRow(fragment, 'Tag', elementInfo.tag);
    addInfoRow(fragment, 'Classes', elementInfo.classes.join(', ') || 'none');
    addInfoRow(fragment, 'Text', elementInfo.text || '(empty)');
    addInfoRow(fragment, 'Position', `x: ${elementInfo.position.x}, y: ${elementInfo.position.y}`);

    const stylesText = Object.entries(elementInfo.styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    addInfoRow(fragment, 'Styles', stylesText);

    detailsContainer.replaceChildren(fragment);
    captureModal.dataset.elementInfo = JSON.stringify(elementInfo);
  }

  function addInfoRow(fragment, label, value) {
    const row = document.createElement('div');
    row.className = 'dev-feedback-element-info-row';

    const labelElement = document.createElement('span');
    labelElement.className = 'dev-feedback-element-info-label';
    labelElement.textContent = `${label}:`;

    const valueElement = document.createElement('span');
    valueElement.className = 'dev-feedback-element-info-value';
    valueElement.textContent = value;

    row.appendChild(labelElement);
    row.appendChild(valueElement);
    fragment.appendChild(row);
  }

  function showCaptureModal() {
    modalReturnFocus = document.activeElement;
    captureModal.classList.add('visible');
    const noteField = captureModal.querySelector(`#${UI_IDS.note}`);
    noteField.value = '';
    noteField.focus();
  }

  function closeCaptureModal() {
    captureModal.classList.remove('visible');

    if (currentElement) {
      currentElement.classList.remove('dev-feedback-highlight');
      currentElement = null;
    }

    if (modalReturnFocus?.isConnected && typeof modalReturnFocus.focus === 'function') {
      modalReturnFocus.focus();
    }
    modalReturnFocus = null;
  }

  async function saveFeedback() {
    const noteField = captureModal.querySelector(`#${UI_IDS.note}`);
    const note = noteField.value.trim();

    if (!note) {
      showNotification('Add a short description before saving.', 'error');
      noteField.focus();
      return;
    }

    let elementInfo;
    try {
      elementInfo = JSON.parse(captureModal.dataset.elementInfo || '{}');
    } catch (error) {
      showNotification('Unable to read the captured element details.', 'error');
      return;
    }

    const item = {
      id: buildFeedbackId(),
      type: CAPTURE_TYPE_ELEMENT,
      captureType: CAPTURE_TYPE_ELEMENT,
      selector: elementInfo.selector,
      pageUrl: window.location.href,
      pageTitle: document.title,
      elementInfo: {
        tag: elementInfo.tag,
        classes: elementInfo.classes,
        text: elementInfo.text,
        styles: elementInfo.styles,
        role: elementInfo.role,
        surroundingText: elementInfo.surroundingText,
        parentLayout: elementInfo.parentLayout
      },
      position: elementInfo.position,
      pageContext: buildPageContext(),
      note: note.slice(0, MAX_NOTE_LENGTH),
      timestamp: new Date().toISOString()
    };

    const nextItems = await runFeedbackMutation('add-feedback-item', { item });
    if (!nextItems) {
      return;
    }

    feedbackItems = sanitizeFeedbackItems(nextItems, window.location.href, document.title);
    updateFeedbackPanel();
    closeCaptureModal();
    scheduleDecorationRefresh();
    showNotification('Feedback saved.');
  }

  async function startRegionCapture() {
    if (visualBusy) {
      const reason = 'Wait for the current visual evidence capture to finish.';
      showNotification(reason, 'error');
      return { ok: false, reason };
    }
    if (visualSession?.getState().dirty) {
      const reason = 'Save or Cancel the visual preview before starting Region capture.';
      showNotification(reason, 'error');
      return { ok: false, reason };
    }
    if (visualSession || String(interactionMode).startsWith('visual-')) {
      setInteractionMode(INTERACTION_MODES.OFF, { discardVisual: true });
    }
    const visibility = [feedbackPanel, captureModal, markerLayer].map((element) => element?.style.visibility || '');
    [feedbackPanel, captureModal, markerLayer].forEach((element) => {
      if (element) {
        element.style.visibility = 'hidden';
      }
    });
    clearDecorations();

    try {
      await nextAnimationFrame();
      await nextAnimationFrame();
      const response = await chrome.runtime.sendMessage({
        action: 'start-region-capture',
        viewportMetrics: getViewportMetrics()
      });

      if (!response || !response.ok) {
        showNotification(response?.reason || 'Unable to start region capture.', 'error');
        return response || { ok: false, reason: 'Unable to start region capture.' };
      }

      showNotification('Region capture opened in a new tab.');
      return response;
    } catch (error) {
      showNotification('Unable to start region capture.', 'error');
      return { ok: false, reason: error.message || 'Unable to start region capture.' };
    } finally {
      [feedbackPanel, captureModal, markerLayer].forEach((element, index) => {
        if (element) {
          element.style.visibility = visibility[index];
        }
      });
      scheduleDecorationRefresh();
    }
  }

  function nextAnimationFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  function updateFeedbackPanel() {
    const itemsContainer = feedbackPanel.querySelector('.dev-feedback-items');
    const countBadge = feedbackPanel.querySelector('.dev-feedback-count');

    countBadge.textContent = String(feedbackItems.length);
    itemsContainer.replaceChildren();

    if (feedbackItems.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'dev-feedback-empty';
      emptyState.textContent = 'No feedback items yet. Capture an element or use region capture from the panel or popup.';
      itemsContainer.appendChild(emptyState);
      return;
    }

    const fragment = document.createDocumentFragment();
    feedbackItems.forEach((item, index) => {
      fragment.appendChild(createFeedbackItemElement(item, index));
    });
    itemsContainer.appendChild(fragment);
  }

  function createFeedbackItemElement(item, index) {
    const itemElement = document.createElement('div');
    itemElement.className = 'dev-feedback-item';

    const header = document.createElement('div');
    header.className = 'dev-feedback-item-header';

    const number = document.createElement('span');
    number.className = 'dev-feedback-item-number';
    number.textContent = String(index + 1);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'dev-feedback-item-delete';
    deleteButton.title = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete feedback item ${index + 1}`);
    deleteButton.textContent = '×';
    deleteButton.addEventListener('click', () => {
      deleteFeedbackItem(index);
    });

    header.appendChild(number);
    header.appendChild(deleteButton);
    itemElement.appendChild(header);

    if (item.type === CAPTURE_TYPE_REGION) {
      populateRegionItem(itemElement, item);
    } else {
      populateElementItem(itemElement, item);
    }

    const note = document.createElement('div');
    note.className = 'dev-feedback-item-note';
    note.textContent = item.note;
    itemElement.appendChild(note);

    const timestamp = document.createElement('div');
    timestamp.className = 'dev-feedback-item-timestamp';
    timestamp.textContent = formatTimestamp(item.timestamp);
    itemElement.appendChild(timestamp);

    const pageHint = getPageHint(item.pageUrl);
    if (pageHint) {
      const locationHint = document.createElement('div');
      locationHint.className = 'dev-feedback-item-location';
      locationHint.textContent = pageHint;
      itemElement.appendChild(locationHint);
    }

    if (item.type === CAPTURE_TYPE_ELEMENT && !findCapturedElement(item.selector)) {
      const status = document.createElement('div');
      status.className = 'dev-feedback-item-status';
      status.textContent = 'Element not currently found on this page';
      itemElement.appendChild(status);
    }

    return itemElement;
  }

  function populateElementItem(itemElement, item) {
    const selector = document.createElement('div');
    selector.className = 'dev-feedback-item-selector';
    selector.textContent = item.selector;
    itemElement.appendChild(selector);
  }

  function populateRegionItem(itemElement, item) {
    const label = document.createElement('div');
    label.className = 'dev-feedback-item-selector';
    label.textContent = `Region capture (${item.sourceKind})`;
    itemElement.appendChild(label);

    if (item.screenshot.dataUrl) {
      const thumbnail = document.createElement('img');
      thumbnail.className = 'dev-feedback-item-thumbnail';
      thumbnail.src = item.screenshot.dataUrl;
      thumbnail.alt = 'Captured region preview';
      itemElement.appendChild(thumbnail);
    }

    const meta = document.createElement('div');
    meta.className = 'dev-feedback-item-location';
    meta.textContent = `Rect ${item.viewportRect.width}×${item.viewportRect.height} at (${item.viewportRect.x}, ${item.viewportRect.y})`;
    itemElement.appendChild(meta);

    if (item.tabContext?.url) {
      const source = document.createElement('div');
      source.className = 'dev-feedback-item-location';
      source.textContent = item.tabContext.url;
      itemElement.appendChild(source);
    }
  }

  function getPageHint(rawUrl) {
    try {
      const capturedUrl = new URL(rawUrl);
      const currentUrl = new URL(window.location.href);
      const capturedPath = `${capturedUrl.pathname}${capturedUrl.search}`;
      const currentPath = `${currentUrl.pathname}${currentUrl.search}`;

      if (capturedPath !== currentPath) {
        return `Captured on ${capturedPath || '/'}`;
      }
    } catch (error) {
      return '';
    }

    return '';
  }

  async function deleteFeedbackItem(index) {
    if (!confirm('Delete this feedback item?')) {
      return;
    }

    const item = feedbackItems[index];
    const nextItems = await runFeedbackMutation('delete-feedback-item', { itemId: item?.id });
    if (!nextItems) {
      return;
    }

    feedbackItems = sanitizeFeedbackItems(nextItems, window.location.href, document.title);
    updateFeedbackPanel();
    scheduleDecorationRefresh();
  }

  async function copyAsJSON() {
    const data = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      feedback: feedbackItems
    };

    try {
      await copyToClipboard(JSON.stringify(data, null, 2));
      showNotification('Copied as JSON.');
    } catch (error) {
      showNotification('Unable to copy JSON to the clipboard.', 'error');
    }
  }

  async function copyAsMarkdown() {
    try {
      await copyToClipboard(buildMarkdownExport(window.location.href, feedbackItems));
      showNotification('Copied as Markdown.');
    } catch (error) {
      showNotification('Unable to copy Markdown to the clipboard.', 'error');
    }
  }

  async function copyAsAiPrompt() {
    try {
      await copyToClipboard(buildAiPromptExport(window.location.href, feedbackItems));
      showNotification('Copied as AI prompt.');
    } catch (error) {
      showNotification('Unable to copy the AI prompt to the clipboard.', 'error');
    }
  }

  async function clearAllFeedback() {
    if (feedbackItems.length === 0) {
      return;
    }

    if (!confirm(`Delete all ${feedbackItems.length} feedback items?`)) {
      return;
    }

    const nextItems = await runFeedbackMutation('clear-feedback-items');
    if (!nextItems) {
      return;
    }

    feedbackItems = nextItems;
    updateFeedbackPanel();
    clearDecorations();
    showNotification('All feedback cleared.');
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall through to the legacy copy path.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    textarea.remove();

    if (!copied) {
      throw new Error('Clipboard copy failed');
    }
  }

  function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `dev-feedback-notification dev-feedback-notification-${type || 'success'}`;
    notification.textContent = message;
    notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
    notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    document.body.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add('visible');
    });

    window.setTimeout(() => {
      notification.classList.remove('visible');
      window.setTimeout(() => notification.remove(), 220);
    }, 2200);
  }

  async function runFeedbackMutation(action, details = {}) {
    const storageKey = makeStorageKey(window.location.href);
    try {
      const response = await chrome.runtime.sendMessage({ action, storageKey, ...details });
      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to update feedback history.');
      }
      return sanitizeFeedbackItems(response.items, window.location.href, document.title);
    } catch (error) {
      console.error('Unable to update feedback items:', error.message);
      showNotification('Unable to save feedback right now.', 'error');
      return null;
    }
  }

  async function loadFeedbackItems() {
    const storageKey = makeStorageKey(window.location.href);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'get-feedback-items', storageKey });
      if (!response?.ok) {
        throw new Error(response?.reason || 'Unable to load feedback history.');
      }
      feedbackItems = sanitizeFeedbackItems(response.items, window.location.href, document.title);
      updateFeedbackPanel();
      scheduleDecorationRefresh();
    } catch (error) {
      console.error('Unable to load feedback items:', error.message);
      showNotification('Unable to load saved feedback.', 'error');
    }
  }

  function scheduleDecorationRefresh() {
    if (decorationFrame) {
      return;
    }

    decorationFrame = window.requestAnimationFrame(() => {
      decorationFrame = 0;
      applyDecorations();
    });
  }

  function applyDecorations() {
    clearDecorations();

    const fragment = document.createDocumentFragment();

    feedbackItems.forEach((item, index) => {
      if (item.type !== CAPTURE_TYPE_ELEMENT) {
        return;
      }

      const element = findCapturedElement(item.selector);
      if (!element || isOurElement(element)) {
        return;
      }

      element.classList.add('dev-feedback-selected');

      const rect = element.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.className = 'dev-feedback-badge';
      badge.textContent = String(index + 1);
      badge.style.top = `${clamp(rect.top - 12, 8, Math.max(8, window.innerHeight - 32))}px`;
      badge.style.left = `${clamp(rect.right - 12, 8, Math.max(8, window.innerWidth - 32))}px`;
      fragment.appendChild(badge);
    });

    if (visualTarget && String(interactionMode).startsWith('visual-')) {
      const measured = visualTarget.isConnected ? getViewportRect(visualTarget) : null;
      const rect = measured?.width > 0 && measured?.height > 0 ? measured : visualLastRect;
      if (rect) {
        const outline = document.createElement('div');
        outline.className = 'dev-feedback-visual-outline';
        outline.style.left = `${rect.x}px`;
        outline.style.top = `${rect.y}px`;
        outline.style.width = `${Math.max(1, rect.width)}px`;
        outline.style.height = `${Math.max(1, rect.height)}px`;
        outline.textContent = visualHidden ? 'Hidden preview' : 'Visual edit target';
        fragment.appendChild(outline);
      }
    }

    markerLayer.replaceChildren(fragment);
  }

  function clearDecorations() {
    document.querySelectorAll('.dev-feedback-selected').forEach((element) => {
      if (!isOurElement(element)) {
        element.classList.remove('dev-feedback-selected');
      }
    });

    if (markerLayer) {
      markerLayer.replaceChildren();
    }
  }

  function findCapturedElement(selector) {
    try {
      return document.querySelector(selector);
    } catch (error) {
      return null;
    }
  }

  function startDragging(event) {
    if (event.button !== 0) {
      return;
    }

    if (typeof event.target?.closest === 'function' && event.target.closest('button')) {
      return;
    }

    isDragging = true;
    feedbackPanel.classList.add('dragging');

    const rect = feedbackPanel.getBoundingClientRect();
    dragOffset.x = event.clientX - rect.left;
    dragOffset.y = event.clientY - rect.top;

    document.addEventListener('mousemove', handleDragging);
    document.addEventListener('mouseup', stopDragging);
    event.preventDefault();
  }

  function handleDragging(event) {
    if (!isDragging) {
      return;
    }

    const maxX = Math.max(8, window.innerWidth - feedbackPanel.offsetWidth - 8);
    const maxY = Math.max(8, window.innerHeight - feedbackPanel.offsetHeight - 8);
    let x = clamp(event.clientX - dragOffset.x, 8, maxX);
    let y = clamp(event.clientY - dragOffset.y, 8, maxY);

    if (panelCollapsed) {
      const position = getAnchoredPanelPosition(
        x,
        y,
        feedbackPanel.offsetWidth,
        feedbackPanel.offsetHeight
      );
      panelAnchor = position.edge;
      feedbackPanel.dataset.anchor = panelAnchor;
      x = position.x;
      y = position.y;
    }

    feedbackPanel.style.left = `${x}px`;
    feedbackPanel.style.top = `${y}px`;
    feedbackPanel.style.right = 'auto';
    feedbackPanel.style.bottom = 'auto';
  }

  function stopDragging() {
    isDragging = false;
    feedbackPanel.classList.remove('dragging');
    document.removeEventListener('mousemove', handleDragging);
    document.removeEventListener('mouseup', stopDragging);
    if (panelCollapsed) {
      anchorPanelToViewportEdge(panelAnchor);
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getViewportMetrics() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: window.navigator.userAgent,
      language: window.navigator.language
    };
  }

  function buildPageContext() {
    const viewport = getViewportMetrics();
    return {
      url: window.location.href,
      title: document.title,
      sourceKind: 'web-page',
      viewport: {
        width: viewport.width,
        height: viewport.height,
        scrollX: viewport.scrollX,
        scrollY: viewport.scrollY,
        devicePixelRatio: viewport.devicePixelRatio,
        zoom: 1
      },
      browser: {
        userAgent: viewport.userAgent,
        language: viewport.language
      }
    };
  }

  function resolveDomTarget(point, expectedContext) {
    const expectedViewport = expectedContext?.viewport || {};
    if (
      expectedContext?.url && expectedContext.url !== window.location.href ||
      Math.abs((expectedViewport.scrollX || 0) - window.scrollX) > 2 ||
      Math.abs((expectedViewport.scrollY || 0) - window.scrollY) > 2 ||
      Math.abs((expectedViewport.width || window.innerWidth) - window.innerWidth) > 2 ||
      Math.abs((expectedViewport.height || window.innerHeight) - window.innerHeight) > 2 ||
      Math.abs((expectedViewport.devicePixelRatio || window.devicePixelRatio) - window.devicePixelRatio) > 0.02
    ) {
      return { ok: false, reason: 'The source page changed or moved after the screenshot was captured.' };
    }

    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, reason: 'Invalid annotation target point.' };
    }

    const target = document.elementsFromPoint(x, y).find((element) => !isOurElement(element));
    if (!target) {
      return { ok: true, target: null };
    }

    const snapshot = buildElementSnapshot(target);
    return {
      ok: true,
      target: {
        selectors: snapshot.selectors,
        tag: snapshot.tag,
        role: snapshot.role,
        text: snapshot.text,
        rect: snapshot.rect,
        surroundingText: snapshot.surroundingText,
        parentLayout: snapshot.parentLayout
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle-feedback-mode') {
      toggleFeedbackMode();
      sendResponse({ feedbackMode, itemCount: feedbackItems.length });
      return;
    }

    if (request.action === 'get-state') {
      sendResponse({ feedbackMode, interactionMode, itemCount: feedbackItems.length });
      return;
    }

    if (request.action === 'set-feedback-mode') {
      setFeedbackMode(Boolean(request.enabled));
      sendResponse({ feedbackMode, itemCount: feedbackItems.length });
      return;
    }

    if (request.action === 'start-visual-edit') {
      sendResponse(startVisualEditMode());
      return;
    }

    if (request.action === 'refresh-feedback') {
      loadFeedbackItems();
      sendResponse({ feedbackMode, itemCount: feedbackItems.length });
      return;
    }

    if (request.action === 'get-viewport-metrics') {
      sendResponse(getViewportMetrics());
      return;
    }

    if (request.action === 'resolve-dom-target') {
      sendResponse(resolveDomTarget(request.point, request.pageContext));
      return;
    }

    if (request.action === 'start-region-capture') {
      startRegionCapture().then(sendResponse);
      return true;
    }
  });
})();
