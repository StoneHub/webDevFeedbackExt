/**
 * Dev Feedback Capture - Safe proposed-content previews
 *
 * User input is rendered with DOM text nodes only. The HTML frame option is a
 * visual placeholder and never executes markup, scripts, or remote content.
 */

(function(root, factory) {
  const api = factory();
  root.DevFeedbackContentProposal = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const BLOCK_TYPES = Object.freeze(['text', 'image', 'list', 'frame']);
  const PLACEMENTS = Object.freeze(['before', 'after', 'inside-start', 'inside-end']);
  const CONTAINER_TAGS = new Set([
    'article', 'aside', 'blockquote', 'body', 'dd', 'div', 'dl', 'dt',
    'fieldset', 'figcaption', 'figure', 'footer', 'form', 'header', 'li',
    'main', 'nav', 'ol', 'section', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
  ]);

  function sanitizeDefinition(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const type = BLOCK_TYPES.includes(raw.type) ? raw.type : 'text';
    const placement = PLACEMENTS.includes(raw.placement) ? raw.placement : 'after';
    const body = cleanText(raw.body, 2000);
    const items = (Array.isArray(raw.items) ? raw.items : body.split(/\r?\n/))
      .map((item) => cleanText(item, 280))
      .filter(Boolean)
      .slice(0, 12);

    return {
      type,
      placement,
      title: cleanText(raw.title, 160),
      body,
      items,
      altText: cleanText(raw.altText, 500),
      support: cleanText(raw.support, 1000)
    };
  }

  function createPreviewElement(documentRef, input) {
    if (!documentRef?.createElement) {
      throw new TypeError('createPreviewElement requires a document.');
    }

    const definition = sanitizeDefinition(input);
    const preview = documentRef.createElement('section');
    preview.className = `dev-feedback-content-preview dev-feedback-content-preview-${definition.type}`;
    preview.dataset.devFeedbackContentPreview = 'true';
    preview.setAttribute('aria-label', `Proposed ${getTypeLabel(definition.type)} content`);

    const proposalLabel = documentRef.createElement('div');
    proposalLabel.className = 'dev-feedback-content-preview-label';
    proposalLabel.textContent = `Proposed ${getTypeLabel(definition.type)}`;
    preview.appendChild(proposalLabel);

    if (definition.title) {
      const title = documentRef.createElement('strong');
      title.className = 'dev-feedback-content-preview-title';
      title.textContent = definition.title;
      preview.appendChild(title);
    }

    if (definition.type === 'image') {
      const imagePlaceholder = documentRef.createElement('div');
      imagePlaceholder.className = 'dev-feedback-content-preview-image';
      imagePlaceholder.textContent = 'Image placeholder';
      preview.appendChild(imagePlaceholder);

      const caption = documentRef.createElement('span');
      caption.className = 'dev-feedback-content-preview-copy';
      caption.textContent = definition.altText || definition.body || 'Describe the image, subject, or asset needed.';
      preview.appendChild(caption);
    } else if (definition.type === 'list') {
      const list = documentRef.createElement('ul');
      const items = definition.items.length ? definition.items : ['First item', 'Second item', 'Third item'];
      items.forEach((item) => {
        const listItem = documentRef.createElement('li');
        listItem.textContent = item;
        list.appendChild(listItem);
      });
      preview.appendChild(list);
    } else if (definition.type === 'frame') {
      const frame = documentRef.createElement('div');
      frame.className = 'dev-feedback-content-preview-frame';
      frame.textContent = definition.body || 'HTML / embed frame placeholder';
      preview.appendChild(frame);
    } else {
      const paragraph = documentRef.createElement('p');
      paragraph.className = 'dev-feedback-content-preview-copy';
      paragraph.textContent = definition.body || 'Add supporting copy here.';
      preview.appendChild(paragraph);
    }

    if (definition.support) {
      const support = documentRef.createElement('small');
      support.className = 'dev-feedback-content-preview-support';
      support.textContent = `Supports: ${definition.support}`;
      preview.appendChild(support);
    }

    return preview;
  }

  function insertPreview(anchor, preview, placement) {
    if (!anchor?.parentNode || !preview) {
      throw new TypeError('insertPreview requires a connected anchor and preview.');
    }

    const normalizedPlacement = PLACEMENTS.includes(placement) ? placement : 'after';
    if (normalizedPlacement.startsWith('inside-') && !canPlaceInside(anchor)) {
      throw new Error(`Cannot place content inside a ${String(anchor.tagName || 'void element').toLowerCase()}.`);
    }

    if (normalizedPlacement === 'before') {
      anchor.parentNode.insertBefore(preview, anchor);
    } else if (normalizedPlacement === 'inside-start') {
      anchor.insertBefore(preview, anchor.firstChild || null);
    } else if (normalizedPlacement === 'inside-end') {
      anchor.appendChild(preview);
    } else {
      anchor.parentNode.insertBefore(preview, anchor.nextSibling || null);
    }

    return preview;
  }

  function removePreview(preview) {
    if (preview?.parentNode) {
      preview.parentNode.removeChild(preview);
    }
  }

  function canPlaceInside(anchor) {
    const tag = String(anchor?.tagName || '').toLowerCase();
    return CONTAINER_TAGS.has(tag);
  }

  function getTypeLabel(type) {
    return ({
      text: 'text',
      image: 'image',
      list: 'list',
      frame: 'HTML frame'
    })[type] || 'text';
  }

  function cleanText(value, maxLength) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  return {
    BLOCK_TYPES,
    PLACEMENTS,
    canPlaceInside,
    createPreviewElement,
    getTypeLabel,
    insertPreview,
    removePreview,
    sanitizeDefinition
  };
});
