/**
 * Dev Feedback Capture - Content Script
 * Runs on supported local development pages.
 */

(function() {
  'use strict';

  const {
    MAX_NOTE_LENGTH,
    escapeCssIdentifier,
    isLocalDevUrl,
    makeStorageKey
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
  let dragOffset = { x: 0, y: 0 };
  let feedbackPanel = null;
  let captureModal = null;
  let markerLayer = null;
  let decorationFrame = 0;

  function init() {
    if (!document.body || !isLocalDevUrl(window.location.href)) {
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
    feedbackPanel.innerHTML = `
      <div class="dev-feedback-panel-header">
        <div class="dev-feedback-panel-header-title">
          <span>Feedback Items</span>
          <span class="dev-feedback-count">0</span>
        </div>
      </div>
      <div class="dev-feedback-panel-actions">
        <button class="dev-feedback-btn dev-feedback-btn-primary" id="dev-feedback-copy-json">
          Copy as JSON
        </button>
        <button class="dev-feedback-btn dev-feedback-btn-secondary" id="dev-feedback-copy-markdown">
          Copy as Markdown
        </button>
        <button class="dev-feedback-btn dev-feedback-btn-danger" id="dev-feedback-clear">
          Clear All
        </button>
      </div>
      <div class="dev-feedback-items"></div>
    `;
    document.body.appendChild(feedbackPanel);

    feedbackPanel.querySelector('.dev-feedback-panel-header').addEventListener('mousedown', startDragging);
    feedbackPanel.querySelector('#dev-feedback-copy-json').addEventListener('click', copyAsJSON);
    feedbackPanel.querySelector('#dev-feedback-copy-markdown').addEventListener('click', copyAsMarkdown);
    feedbackPanel.querySelector('#dev-feedback-clear').addEventListener('click', clearAllFeedback);
  }

  function createCaptureModal() {
    captureModal = document.createElement('div');
    captureModal.id = UI_IDS.modal;
    captureModal.innerHTML = `
      <div class="dev-feedback-modal-content" role="dialog" aria-modal="true" aria-labelledby="dev-feedback-modal-title">
        <h2 class="dev-feedback-modal-title" id="dev-feedback-modal-title">Capture Element Feedback</h2>

        <div class="dev-feedback-modal-section">
          <div class="dev-feedback-modal-section-title">Element Information</div>
          <div class="dev-feedback-element-info" id="${UI_IDS.elementDetails}"></div>
        </div>

        <div class="dev-feedback-modal-section">
          <div class="dev-feedback-modal-section-title">What do you want changed?</div>
          <textarea
            class="dev-feedback-textarea"
            id="${UI_IDS.note}"
            maxlength="${MAX_NOTE_LENGTH}"
            placeholder="Describe the changes you'd like to see..."
          ></textarea>
          <div class="dev-feedback-help-text">Up to ${MAX_NOTE_LENGTH} characters.</div>
        </div>

        <div class="dev-feedback-modal-actions">
          <button class="dev-feedback-btn dev-feedback-btn-large dev-feedback-btn-primary" id="dev-feedback-save">
            Save Feedback
          </button>
          <button class="dev-feedback-btn dev-feedback-btn-large dev-feedback-btn-secondary" id="dev-feedback-cancel">
            Cancel
          </button>
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

    const elementInfo = {
      selector: getElementSelector(element),
      tag: element.tagName.toLowerCase(),
      classes: Array.from(element.classList).filter((className) => !className.startsWith('dev-feedback')),
      text: (element.innerText || element.textContent || '').trim().slice(0, 100),
      styles: pickTrackedStyles(window.getComputedStyle(element)),
      position: getElementPosition(element)
    };

    displayElementInfo(elementInfo);
    showCaptureModal();
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

    const nextItems = feedbackItems.concat({
      id: buildFeedbackId(),
      selector: elementInfo.selector,
      pageUrl: window.location.href,
      elementInfo: {
        tag: elementInfo.tag,
        classes: elementInfo.classes,
        text: elementInfo.text,
        styles: elementInfo.styles
      },
      position: elementInfo.position,
      note: note.slice(0, MAX_NOTE_LENGTH),
      timestamp: new Date().toISOString()
    });

    if (!(await persistFeedbackItems(nextItems))) {
      return;
    }

    feedbackItems = nextItems;
    updateFeedbackPanel();
    closeCaptureModal();
    scheduleDecorationRefresh();
    showNotification('Feedback saved.');
  }

  function buildFeedbackId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    return `feedback-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function updateFeedbackPanel() {
    const itemsContainer = feedbackPanel.querySelector('.dev-feedback-items');
    const countBadge = feedbackPanel.querySelector('.dev-feedback-count');

    countBadge.textContent = String(feedbackItems.length);
    itemsContainer.replaceChildren();

    if (feedbackItems.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'dev-feedback-empty';
      emptyState.textContent = 'No feedback items yet. Enable Feedback Mode and click elements to capture them.';
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
    deleteButton.textContent = '×';
    deleteButton.addEventListener('click', () => {
      deleteFeedbackItem(index);
    });

    header.appendChild(number);
    header.appendChild(deleteButton);

    const selector = document.createElement('div');
    selector.className = 'dev-feedback-item-selector';
    selector.textContent = item.selector;

    const note = document.createElement('div');
    note.className = 'dev-feedback-item-note';
    note.textContent = item.note;

    const timestamp = document.createElement('div');
    timestamp.className = 'dev-feedback-item-timestamp';
    timestamp.textContent = formatTimestamp(item.timestamp);

    itemElement.appendChild(header);
    itemElement.appendChild(selector);
    itemElement.appendChild(note);
    itemElement.appendChild(timestamp);

    const pageHint = getPageHint(item.pageUrl);
    if (pageHint) {
      const locationHint = document.createElement('div');
      locationHint.className = 'dev-feedback-item-location';
      locationHint.textContent = pageHint;
      itemElement.appendChild(locationHint);
    }

    if (!findCapturedElement(item.selector)) {
      const status = document.createElement('div');
      status.className = 'dev-feedback-item-status';
      status.textContent = 'Element not currently found on this page';
      itemElement.appendChild(status);
    }

    return itemElement;
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

    const nextItems = feedbackItems.filter((_, itemIndex) => itemIndex !== index);

    if (!(await persistFeedbackItems(nextItems))) {
      return;
    }

    feedbackItems = nextItems;
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
    let markdown = `# Feedback for ${window.location.href}\n\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n\n`;
    markdown += `**Total Items:** ${feedbackItems.length}\n\n`;
    markdown += '---\n\n';

    feedbackItems.forEach((item, index) => {
      markdown += `## ${index + 1}. ${item.elementInfo.tag}\n\n`;
      markdown += `**Selector:** \`${item.selector}\`\n\n`;
      markdown += `**Classes:** ${item.elementInfo.classes.join(', ') || 'none'}\n\n`;
      markdown += `**Text:** ${item.elementInfo.text || '(empty)'}\n\n`;
      markdown += `**Position:** x: ${item.position.x}, y: ${item.position.y}\n\n`;
      markdown += '**Styles:**\n';

      Object.entries(item.elementInfo.styles).forEach(([key, value]) => {
        markdown += `- ${key}: ${value}\n`;
      });

      if (item.pageUrl) {
        markdown += `\n**Captured On:** ${item.pageUrl}\n`;
      }

      markdown += '\n**Requested Changes:**\n\n';
      markdown += `${item.note}\n\n`;
      markdown += `**Captured:** ${formatTimestamp(item.timestamp)}\n\n`;
      markdown += '---\n\n';
    });

    try {
      await copyToClipboard(markdown);
      showNotification('Copied as Markdown.');
    } catch (error) {
      showNotification('Unable to copy Markdown to the clipboard.', 'error');
    }
  }

  async function clearAllFeedback() {
    if (feedbackItems.length === 0) {
      return;
    }

    if (!confirm(`Delete all ${feedbackItems.length} feedback items?`)) {
      return;
    }

    if (!(await persistFeedbackItems([]))) {
      return;
    }

    feedbackItems = [];
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
        // Fall back to the legacy copy path below.
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
    document.body.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add('visible');
    });

    window.setTimeout(() => {
      notification.classList.remove('visible');
      window.setTimeout(() => notification.remove(), 220);
    }, 2200);
  }

  async function persistFeedbackItems(nextItems) {
    const storageKey = makeStorageKey(window.location.href);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [storageKey]: nextItems }, () => {
        if (chrome.runtime.lastError) {
          console.error('Unable to persist feedback items:', chrome.runtime.lastError.message);
          showNotification('Unable to save feedback right now.', 'error');
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  function loadFeedbackItems() {
    const storageKey = makeStorageKey(window.location.href);

    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Unable to load feedback items:', chrome.runtime.lastError.message);
        showNotification('Unable to load saved feedback.', 'error');
        return;
      }

      feedbackItems = sanitizeFeedbackItems(result[storageKey]);
      updateFeedbackPanel();
      scheduleDecorationRefresh();
    });
  }

  function sanitizeFeedbackItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.flatMap((item) => {
      if (!item || typeof item !== 'object' || typeof item.selector !== 'string' || typeof item.note !== 'string') {
        return [];
      }

      return [{
        id: typeof item.id === 'string' ? item.id : buildFeedbackId(),
        selector: item.selector,
        pageUrl: typeof item.pageUrl === 'string' ? item.pageUrl : window.location.href,
        elementInfo: {
          tag: typeof item.elementInfo?.tag === 'string' ? item.elementInfo.tag : 'unknown',
          classes: Array.isArray(item.elementInfo?.classes)
            ? item.elementInfo.classes.filter((value) => typeof value === 'string')
            : [],
          text: typeof item.elementInfo?.text === 'string' ? item.elementInfo.text : '',
          styles: sanitizeStyles(item.elementInfo?.styles)
        },
        position: sanitizePosition(item.position),
        note: item.note.slice(0, MAX_NOTE_LENGTH),
        timestamp: isValidDate(item.timestamp) ? item.timestamp : new Date().toISOString()
      }];
    });
  }

  function sanitizeStyles(styles) {
    if (!styles || typeof styles !== 'object') {
      return {};
    }

    const allowedKeys = [
      'background-color',
      'color',
      'font-size',
      'width',
      'height',
      'margin',
      'padding'
    ];

    return allowedKeys.reduce((result, key) => {
      if (typeof styles[key] === 'string') {
        result[key] = styles[key];
      }
      return result;
    }, {});
  }

  function sanitizePosition(position) {
    return {
      x: Number.isFinite(position?.x) ? position.x : 0,
      y: Number.isFinite(position?.y) ? position.y : 0
    };
  }

  function isValidDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
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

  function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle-feedback-mode') {
      toggleFeedbackMode();
      sendResponse({ feedbackMode: feedbackMode, itemCount: feedbackItems.length });
      return;
    }

    if (request.action === 'get-state') {
      sendResponse({ feedbackMode: feedbackMode, itemCount: feedbackItems.length });
      return;
    }

    if (request.action === 'set-feedback-mode') {
      setFeedbackMode(Boolean(request.enabled));
      sendResponse({ feedbackMode: feedbackMode, itemCount: feedbackItems.length });
    }
  });
})();
