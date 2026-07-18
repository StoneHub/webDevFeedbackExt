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

  let feedbackMode = false;
  let feedbackItems = [];
  let currentElement = null;
  let isDragging = false;
  let panelCollapsed = true;
  let dragOffset = { x: 0, y: 0 };
  let feedbackPanel = null;
  let captureModal = null;
  let markerLayer = null;
  let decorationFrame = 0;
  let modalReturnFocus = null;

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
        </div>
        <div class="dev-feedback-panel-controls">
          <button class="dev-feedback-panel-toggle" id="dev-feedback-panel-toggle" title="Expand capture list" aria-label="Expand capture list" aria-expanded="false">+</button>
          <button class="dev-feedback-panel-close" id="dev-feedback-panel-close" title="Stop element mode" aria-label="Stop element mode">x</button>
        </div>
      </div>
      <div class="dev-feedback-panel-actions">
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-copy-json">JSON</button>
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-copy-markdown">Markdown</button>
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-copy-ai">AI Prompt</button>
        <button class="dev-feedback-btn dev-feedback-btn-primary" id="dev-feedback-capture-region">Capture Region</button>
        <button class="dev-feedback-btn dev-feedback-btn-danger" id="dev-feedback-clear">Clear</button>
      </div>
      <div class="dev-feedback-items"></div>
      <div class="dev-feedback-panel-footer">Feedback is stored locally in this browser.</div>
    `;
    document.body.appendChild(feedbackPanel);

    feedbackPanel.querySelector('.dev-feedback-panel-header').addEventListener('mousedown', startDragging);
    feedbackPanel.querySelector('#dev-feedback-panel-toggle').addEventListener('click', togglePanelCollapsed);
    feedbackPanel.querySelector('#dev-feedback-panel-close').addEventListener('click', () => setFeedbackMode(false));
    feedbackPanel.querySelector('#dev-feedback-copy-json').addEventListener('click', copyAsJSON);
    feedbackPanel.querySelector('#dev-feedback-copy-markdown').addEventListener('click', copyAsMarkdown);
    feedbackPanel.querySelector('#dev-feedback-copy-ai').addEventListener('click', copyAsAiPrompt);
    feedbackPanel.querySelector('#dev-feedback-capture-region').addEventListener('click', startRegionCapture);
    feedbackPanel.querySelector('#dev-feedback-clear').addEventListener('click', clearAllFeedback);
  }

  function togglePanelCollapsed() {
    panelCollapsed = !panelCollapsed;
    feedbackPanel.classList.toggle('collapsed', panelCollapsed);
    const button = feedbackPanel.querySelector('#dev-feedback-panel-toggle');
    button.textContent = panelCollapsed ? '+' : '−';
    button.title = panelCollapsed ? 'Expand capture list' : 'Collapse capture list';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!panelCollapsed));
    window.requestAnimationFrame(clampPanelToViewport);
  }

  function clampPanelToViewport() {
    const rect = feedbackPanel.getBoundingClientRect();
    feedbackPanel.style.left = `${clamp(rect.left, 8, Math.max(8, window.innerWidth - rect.width - 8))}px`;
    feedbackPanel.style.top = `${clamp(rect.top, 8, Math.max(8, window.innerHeight - rect.height - 8))}px`;
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
    window.addEventListener('resize', scheduleDecorationRefresh, { passive: true });
    window.addEventListener('scroll', scheduleDecorationRefresh, true);
    document.addEventListener('keydown', handleGlobalKeydown);
  }

  function handleGlobalKeydown(event) {
    if (event.key === 'Escape' && captureModal.classList.contains('visible')) {
      event.preventDefault();
      closeCaptureModal();
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
    feedbackMode = !feedbackMode;
    feedbackPanel.classList.toggle('visible', feedbackMode);

    if (feedbackMode) {
      enableElementHighlighting();
    } else {
      disableElementHighlighting();
      closeCaptureModal();
    }

    scheduleDecorationRefresh();
  }

  function setFeedbackMode(enabled) {
    if (feedbackMode !== enabled) {
      toggleFeedbackMode();
    }
  }

  function enableElementHighlighting() {
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
    if (!feedbackMode || isOurElement(event.target)) {
      return;
    }

    event.target.classList.add('dev-feedback-highlight');
  }

  function handleMouseOut(event) {
    if (!feedbackMode || isOurElement(event.target)) {
      return;
    }

    event.target.classList.remove('dev-feedback-highlight');
  }

  function handleElementClick(event) {
    if (!feedbackMode) {
      return;
    }

    const target = event.target;
    if (isOurElement(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    captureElement(target);
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
      'width': computedStyles.width,
      'height': computedStyles.height,
      'margin': computedStyles.margin,
      'padding': computedStyles.padding
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

    if (!feedbackItems.length) {
      return;
    }

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
    const x = clamp(event.clientX - dragOffset.x, 8, maxX);
    const y = clamp(event.clientY - dragOffset.y, 8, maxY);

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
      sendResponse({ feedbackMode, itemCount: feedbackItems.length });
      return;
    }

    if (request.action === 'set-feedback-mode') {
      setFeedbackMode(Boolean(request.enabled));
      sendResponse({ feedbackMode, itemCount: feedbackItems.length });
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
