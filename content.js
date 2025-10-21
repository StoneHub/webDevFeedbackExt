/**
 * Dev Feedback Capture - Content Script
 * Runs on all localhost pages to enable feedback capture functionality
 */

(function() {
  'use strict';

  // State management
  let feedbackMode = false;
  let feedbackItems = [];
  let currentElement = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // UI Elements
  let toggleButton = null;
  let feedbackPanel = null;
  let captureModal = null;

  /**
   * Initialize the extension
   */
  function init() {
    createToggleButton();
    createFeedbackPanel();
    createCaptureModal();
    loadFeedbackItems();
    setupKeyboardShortcuts();
    console.log('Dev Feedback Capture initialized');
  }

  /**
   * Create the floating toggle button
   */
  function createToggleButton() {
    toggleButton = document.createElement('button');
    toggleButton.id = 'dev-feedback-toggle';
    toggleButton.textContent = 'Feedback Mode: OFF';
    toggleButton.addEventListener('click', toggleFeedbackMode);
    document.body.appendChild(toggleButton);
  }

  /**
   * Create the feedback panel
   */
  function createFeedbackPanel() {
    feedbackPanel = document.createElement('div');
    feedbackPanel.id = 'dev-feedback-panel';
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
      <div class="dev-feedback-items">
        <div class="dev-feedback-empty">No feedback items yet. Enable Feedback Mode and click elements to capture them.</div>
      </div>
    `;
    document.body.appendChild(feedbackPanel);

    // Setup event listeners
    const header = feedbackPanel.querySelector('.dev-feedback-panel-header');
    header.addEventListener('mousedown', startDragging);

    document.getElementById('dev-feedback-copy-json').addEventListener('click', copyAsJSON);
    document.getElementById('dev-feedback-copy-markdown').addEventListener('click', copyAsMarkdown);
    document.getElementById('dev-feedback-clear').addEventListener('click', clearAllFeedback);
  }

  /**
   * Create the capture modal
   */
  function createCaptureModal() {
    captureModal = document.createElement('div');
    captureModal.id = 'dev-feedback-modal';
    captureModal.innerHTML = `
      <div class="dev-feedback-modal-content">
        <h2 class="dev-feedback-modal-title">Capture Element Feedback</h2>

        <div class="dev-feedback-modal-section">
          <div class="dev-feedback-modal-section-title">Element Information</div>
          <div class="dev-feedback-element-info" id="dev-feedback-element-details"></div>
        </div>

        <div class="dev-feedback-modal-section">
          <div class="dev-feedback-modal-section-title">What do you want changed?</div>
          <textarea
            class="dev-feedback-textarea"
            id="dev-feedback-note"
            placeholder="Describe the changes you'd like to see..."
          ></textarea>
        </div>

        <div class="dev-feedback-modal-actions">
          <button class="dev-feedback-btn dev-feedback-btn-large dev-feedback-btn-secondary" id="dev-feedback-save">
            Save Feedback
          </button>
          <button class="dev-feedback-btn dev-feedback-btn-large dev-feedback-btn-primary" id="dev-feedback-cancel">
            Cancel
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(captureModal);

    // Setup event listeners
    document.getElementById('dev-feedback-save').addEventListener('click', saveFeedback);
    document.getElementById('dev-feedback-cancel').addEventListener('click', closeCaptureModal);

    // Close on background click
    captureModal.addEventListener('click', (e) => {
      if (e.target === captureModal) {
        closeCaptureModal();
      }
    });
  }

  /**
   * Toggle feedback mode on/off
   */
  function toggleFeedbackMode() {
    feedbackMode = !feedbackMode;

    if (feedbackMode) {
      toggleButton.textContent = 'Feedback Mode: ON';
      toggleButton.classList.add('active');
      feedbackPanel.classList.add('visible');
      enableElementHighlighting();
    } else {
      toggleButton.textContent = 'Feedback Mode: OFF';
      toggleButton.classList.remove('active');
      feedbackPanel.classList.remove('visible');
      disableElementHighlighting();
    }
  }

  /**
   * Enable element highlighting on hover
   */
  function enableElementHighlighting() {
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleElementClick, true);
  }

  /**
   * Disable element highlighting
   */
  function disableElementHighlighting() {
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('click', handleElementClick, true);

    // Remove any remaining highlights
    document.querySelectorAll('.dev-feedback-highlight').forEach(el => {
      el.classList.remove('dev-feedback-highlight');
    });
  }

  /**
   * Handle mouse over event for highlighting
   */
  function handleMouseOver(e) {
    if (!feedbackMode) return;

    const target = e.target;

    // Don't highlight our own UI elements
    if (isOurElement(target)) return;

    target.classList.add('dev-feedback-highlight');
  }

  /**
   * Handle mouse out event
   */
  function handleMouseOut(e) {
    if (!feedbackMode) return;

    const target = e.target;
    target.classList.remove('dev-feedback-highlight');
  }

  /**
   * Handle element click for capture
   */
  function handleElementClick(e) {
    if (!feedbackMode) return;

    const target = e.target;

    // Don't capture our own UI elements
    if (isOurElement(target)) return;

    e.preventDefault();
    e.stopPropagation();

    captureElement(target);
  }

  /**
   * Check if an element is part of our extension UI
   */
  function isOurElement(element) {
    return element.id && (
      element.id.startsWith('dev-feedback') ||
      element.closest('#dev-feedback-toggle') ||
      element.closest('#dev-feedback-panel') ||
      element.closest('#dev-feedback-modal')
    );
  }

  /**
   * Capture element details
   */
  function captureElement(element) {
    currentElement = element;

    // Get element details
    const selector = getElementSelector(element);
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).filter(c => !c.startsWith('dev-feedback'));
    const text = element.innerText ? element.innerText.substring(0, 100) : '';
    const computedStyles = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    const elementInfo = {
      selector: selector,
      tag: tag,
      classes: classes,
      text: text,
      styles: {
        'background-color': computedStyles.backgroundColor,
        'color': computedStyles.color,
        'font-size': computedStyles.fontSize,
        'width': computedStyles.width,
        'height': computedStyles.height,
        'margin': computedStyles.margin,
        'padding': computedStyles.padding
      },
      position: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY)
      }
    };

    // Display in modal
    displayElementInfo(elementInfo);
    showCaptureModal();
  }

  /**
   * Generate a CSS selector for an element
   */
  function getElementSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }

    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();

      if (current.className && typeof current.className === 'string') {
        const classes = Array.from(current.classList)
          .filter(c => !c.startsWith('dev-feedback'))
          .join('.');
        if (classes) {
          selector += '.' + classes;
        }
      }

      // Add nth-child for specificity
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const index = siblings.indexOf(current) + 1;
        if (siblings.length > 1) {
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;

      // Limit depth to avoid very long selectors
      if (path.length >= 5) break;
    }

    return path.join(' > ');
  }

  /**
   * Display element information in modal
   */
  function displayElementInfo(elementInfo) {
    const detailsContainer = document.getElementById('dev-feedback-element-details');

    const stylesStr = Object.entries(elementInfo.styles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');

    detailsContainer.innerHTML = `
      <div class="dev-feedback-element-info-row">
        <span class="dev-feedback-element-info-label">Selector:</span>
        <span class="dev-feedback-element-info-value">${escapeHtml(elementInfo.selector)}</span>
      </div>
      <div class="dev-feedback-element-info-row">
        <span class="dev-feedback-element-info-label">Tag:</span>
        <span class="dev-feedback-element-info-value">${elementInfo.tag}</span>
      </div>
      <div class="dev-feedback-element-info-row">
        <span class="dev-feedback-element-info-label">Classes:</span>
        <span class="dev-feedback-element-info-value">${elementInfo.classes.join(', ') || 'none'}</span>
      </div>
      <div class="dev-feedback-element-info-row">
        <span class="dev-feedback-element-info-label">Text:</span>
        <span class="dev-feedback-element-info-value">${escapeHtml(elementInfo.text) || '(empty)'}</span>
      </div>
      <div class="dev-feedback-element-info-row">
        <span class="dev-feedback-element-info-label">Position:</span>
        <span class="dev-feedback-element-info-value">x: ${elementInfo.position.x}, y: ${elementInfo.position.y}</span>
      </div>
      <div class="dev-feedback-element-info-row">
        <span class="dev-feedback-element-info-label">Styles:</span>
        <span class="dev-feedback-element-info-value">${stylesStr}</span>
      </div>
    `;

    // Store for later use
    captureModal.dataset.elementInfo = JSON.stringify(elementInfo);
  }

  /**
   * Show the capture modal
   */
  function showCaptureModal() {
    captureModal.classList.add('visible');
    document.getElementById('dev-feedback-note').value = '';
    document.getElementById('dev-feedback-note').focus();
  }

  /**
   * Close the capture modal
   */
  function closeCaptureModal() {
    captureModal.classList.remove('visible');
    if (currentElement) {
      currentElement.classList.remove('dev-feedback-highlight');
      currentElement = null;
    }
  }

  /**
   * Save the feedback item
   */
  function saveFeedback() {
    const note = document.getElementById('dev-feedback-note').value.trim();

    if (!note) {
      alert('Please enter a description of what you want changed.');
      return;
    }

    const elementInfo = JSON.parse(captureModal.dataset.elementInfo);

    const feedbackItem = {
      selector: elementInfo.selector,
      elementInfo: {
        tag: elementInfo.tag,
        classes: elementInfo.classes,
        text: elementInfo.text,
        styles: elementInfo.styles
      },
      position: elementInfo.position,
      note: note,
      timestamp: new Date().toISOString()
    };

    feedbackItems.push(feedbackItem);

    // Mark element as selected
    if (currentElement) {
      currentElement.classList.remove('dev-feedback-highlight');
      currentElement.classList.add('dev-feedback-selected');

      // Add number badge
      const badge = document.createElement('div');
      badge.className = 'dev-feedback-badge';
      badge.textContent = feedbackItems.length;
      currentElement.style.position = 'relative';
      currentElement.appendChild(badge);
    }

    saveFeedbackItems();
    updateFeedbackPanel();
    closeCaptureModal();
  }

  /**
   * Update the feedback panel UI
   */
  function updateFeedbackPanel() {
    const itemsContainer = feedbackPanel.querySelector('.dev-feedback-items');
    const countBadge = feedbackPanel.querySelector('.dev-feedback-count');

    countBadge.textContent = feedbackItems.length;

    if (feedbackItems.length === 0) {
      itemsContainer.innerHTML = '<div class="dev-feedback-empty">No feedback items yet. Enable Feedback Mode and click elements to capture them.</div>';
      return;
    }

    itemsContainer.innerHTML = feedbackItems.map((item, index) => `
      <div class="dev-feedback-item">
        <div class="dev-feedback-item-header">
          <span class="dev-feedback-item-number">${index + 1}</span>
          <button class="dev-feedback-item-delete" data-index="${index}" title="Delete">×</button>
        </div>
        <div class="dev-feedback-item-selector">${escapeHtml(item.selector)}</div>
        <div class="dev-feedback-item-note">${escapeHtml(item.note)}</div>
        <div class="dev-feedback-item-timestamp">${formatTimestamp(item.timestamp)}</div>
      </div>
    `).join('');

    // Add delete listeners
    itemsContainer.querySelectorAll('.dev-feedback-item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        deleteFeedbackItem(index);
      });
    });
  }

  /**
   * Delete a single feedback item
   */
  function deleteFeedbackItem(index) {
    if (confirm('Delete this feedback item?')) {
      feedbackItems.splice(index, 1);
      saveFeedbackItems();
      updateFeedbackPanel();

      // Update badges on page
      updateElementBadges();
    }
  }

  /**
   * Update element badges after deletion
   */
  function updateElementBadges() {
    document.querySelectorAll('.dev-feedback-badge').forEach(badge => badge.remove());

    document.querySelectorAll('.dev-feedback-selected').forEach((el, index) => {
      const badge = document.createElement('div');
      badge.className = 'dev-feedback-badge';
      badge.textContent = index + 1;
      el.appendChild(badge);
    });
  }

  /**
   * Copy feedback as JSON
   */
  function copyAsJSON() {
    const data = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      feedback: feedbackItems
    };

    const json = JSON.stringify(data, null, 2);
    copyToClipboard(json);
    showNotification('Copied as JSON!');
  }

  /**
   * Copy feedback as Markdown
   */
  function copyAsMarkdown() {
    let markdown = `# Feedback for ${window.location.href}\n\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n\n`;
    markdown += `**Total Items:** ${feedbackItems.length}\n\n`;
    markdown += `---\n\n`;

    feedbackItems.forEach((item, index) => {
      markdown += `## ${index + 1}. ${item.elementInfo.tag}\n\n`;
      markdown += `**Selector:** \`${item.selector}\`\n\n`;
      markdown += `**Classes:** ${item.elementInfo.classes.join(', ') || 'none'}\n\n`;
      markdown += `**Text:** ${item.elementInfo.text || '(empty)'}\n\n`;
      markdown += `**Position:** x: ${item.position.x}, y: ${item.position.y}\n\n`;
      markdown += `**Styles:**\n`;
      Object.entries(item.elementInfo.styles).forEach(([key, value]) => {
        markdown += `- ${key}: ${value}\n`;
      });
      markdown += `\n**Requested Changes:**\n\n`;
      markdown += `${item.note}\n\n`;
      markdown += `**Captured:** ${new Date(item.timestamp).toLocaleString()}\n\n`;
      markdown += `---\n\n`;
    });

    copyToClipboard(markdown);
    showNotification('Copied as Markdown!');
  }

  /**
   * Clear all feedback items
   */
  function clearAllFeedback() {
    if (feedbackItems.length === 0) return;

    if (confirm(`Delete all ${feedbackItems.length} feedback items?`)) {
      feedbackItems = [];
      saveFeedbackItems();
      updateFeedbackPanel();

      // Remove badges and selection styling
      document.querySelectorAll('.dev-feedback-badge').forEach(badge => badge.remove());
      document.querySelectorAll('.dev-feedback-selected').forEach(el => {
        el.classList.remove('dev-feedback-selected');
      });

      showNotification('All feedback cleared');
    }
  }

  /**
   * Copy text to clipboard
   */
  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  /**
   * Show a temporary notification
   */
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 9999999;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  /**
   * Save feedback items to storage
   */
  function saveFeedbackItems() {
    const storageKey = `dev-feedback-${window.location.origin}`;
    chrome.storage.local.set({ [storageKey]: feedbackItems });
  }

  /**
   * Load feedback items from storage
   */
  function loadFeedbackItems() {
    const storageKey = `dev-feedback-${window.location.origin}`;
    chrome.storage.local.get([storageKey], (result) => {
      if (result[storageKey]) {
        feedbackItems = result[storageKey];
        updateFeedbackPanel();

        // Re-apply badges (simplified - won't match exact elements)
        console.log(`Loaded ${feedbackItems.length} feedback items`);
      }
    });
  }

  /**
   * Setup keyboard shortcuts
   */
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Alt+F to toggle feedback mode
      if (e.altKey && e.key === 'f') {
        e.preventDefault();
        toggleFeedbackMode();
      }
    });
  }

  /**
   * Panel dragging functionality
   */
  function startDragging(e) {
    isDragging = true;
    feedbackPanel.classList.add('dragging');

    const rect = feedbackPanel.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    document.addEventListener('mousemove', handleDragging);
    document.addEventListener('mouseup', stopDragging);
  }

  function handleDragging(e) {
    if (!isDragging) return;

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

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

  /**
   * Utility: Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Utility: Format timestamp
   */
  function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Listen for keyboard shortcut from extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle-feedback-mode') {
      toggleFeedbackMode();
    }
  });

})();
