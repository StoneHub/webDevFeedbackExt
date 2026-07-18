(function(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.DevFeedbackShared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const SUPPORTED_HOSTNAMES = Object.freeze([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1'
  ]);

  const SUPPORTED_MATCH_PATTERNS = Object.freeze([
    'http://localhost/*',
    'https://localhost/*',
    'http://127.0.0.1/*',
    'https://127.0.0.1/*',
    'http://0.0.0.0/*',
    'https://0.0.0.0/*',
    'http://[::1]/*',
    'https://[::1]/*'
  ]);

  const SHORTCUT_LABEL = 'Ctrl+Shift+F';
  const MAC_SHORTCUT_LABEL = 'Command+Shift+F';
  const MAX_NOTE_LENGTH = 2000;
  const MAX_ACCEPTANCE_CRITERIA = 12;
  const CAPTURE_TYPE_ELEMENT = 'element';
  const CAPTURE_TYPE_REGION = 'region';
  const FEEDBACK_STORAGE_PREFIX = 'dev-feedback-';
  const REGION_CAPTURE_SESSION_PREFIX = 'dev-feedback-region-session-';

  function normalizeHostname(hostname) {
    return String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  }

  function isLocalDevUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        SUPPORTED_HOSTNAMES.includes(normalizeHostname(url.hostname))
      );
    } catch (error) {
      return false;
    }
  }

  function canInjectIntoUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return ['http:', 'https:', 'file:'].includes(url.protocol);
    } catch (error) {
      return false;
    }
  }

  function getEffectivePageUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const embeddedSource = url.searchParams.get('src');

      if (
        embeddedSource &&
        (url.protocol === 'chrome-extension:' || url.protocol === 'edge-extension:')
      ) {
        return embeddedSource;
      }

      return url.href;
    } catch (error) {
      return String(rawUrl || '');
    }
  }

  function makeStorageKey(rawUrl) {
    try {
      const url = new URL(getEffectivePageUrl(rawUrl));

      if (url.protocol !== 'file:' && url.origin && url.origin !== 'null') {
        return `${FEEDBACK_STORAGE_PREFIX}${url.origin}`;
      }

      return `${FEEDBACK_STORAGE_PREFIX}file-${encodeURIComponent(url.href)}`;
    } catch (error) {
      return `${FEEDBACK_STORAGE_PREFIX}file-${encodeURIComponent(String(rawUrl || ''))}`;
    }
  }

  function escapeCssIdentifier(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function buildFeedbackId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `feedback-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function sanitizeFeedbackItems(items, fallbackUrl, fallbackTitle) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.flatMap((item) => {
      const normalized = normalizeFeedbackItem(item, fallbackUrl, fallbackTitle);
      return normalized ? [normalized] : [];
    });
  }

  function normalizeFeedbackItem(item, fallbackUrl, fallbackTitle) {
    if (!item || typeof item !== 'object' || typeof item.note !== 'string') {
      return null;
    }

    const pageUrl = typeof item.pageUrl === 'string' && item.pageUrl ? item.pageUrl : String(fallbackUrl || '');
    const effectiveUrl = getEffectivePageUrl(pageUrl);
    const pageTitle = typeof item.pageTitle === 'string' ? item.pageTitle : String(fallbackTitle || '');
    const timestamp = isValidDate(item.timestamp) ? item.timestamp : new Date().toISOString();
    const note = item.note.slice(0, MAX_NOTE_LENGTH);
    const id = typeof item.id === 'string' ? item.id : buildFeedbackId();

    if (
      item.type === CAPTURE_TYPE_REGION ||
      item.captureType === CAPTURE_TYPE_REGION ||
      item.viewportRect ||
      item.screenshot
    ) {
      const tabContext = sanitizeTabContext(item.tabContext, effectiveUrl, pageTitle);
      return {
        id,
        type: CAPTURE_TYPE_REGION,
        captureType: CAPTURE_TYPE_REGION,
        pageUrl: effectiveUrl,
        pageTitle,
        viewportRect: sanitizeViewportRect(item.viewportRect),
        devicePixelRatio: sanitizeDevicePixelRatio(item.devicePixelRatio),
        screenshot: sanitizeScreenshot(item.screenshot),
        annotations: sanitizeAnnotations(item.annotations),
        acceptance: sanitizeAcceptance(item.acceptance),
        pageContext: sanitizePageContext(item.pageContext, effectiveUrl, pageTitle),
        tabContext,
        sourceKind: sanitizeSourceKind(item.sourceKind, tabContext.url || effectiveUrl),
        note,
        timestamp
      };
    }

    if (typeof item.selector !== 'string') {
      return null;
    }

    return {
      id,
      type: CAPTURE_TYPE_ELEMENT,
      captureType: CAPTURE_TYPE_ELEMENT,
      selector: item.selector,
      pageUrl: effectiveUrl,
      pageTitle,
      elementInfo: {
        tag: typeof item.elementInfo?.tag === 'string' ? item.elementInfo.tag : 'unknown',
        classes: Array.isArray(item.elementInfo?.classes)
          ? item.elementInfo.classes.filter((value) => typeof value === 'string')
          : [],
        text: typeof item.elementInfo?.text === 'string' ? item.elementInfo.text : '',
        styles: sanitizeStyles(item.elementInfo?.styles),
        role: sanitizeString(item.elementInfo?.role, 120),
        surroundingText: sanitizeString(item.elementInfo?.surroundingText, 500),
        parentLayout: sanitizeParentLayout(item.elementInfo?.parentLayout)
      },
      position: sanitizePosition(item.position),
      pageContext: sanitizePageContext(item.pageContext, effectiveUrl, pageTitle),
      acceptance: sanitizeAcceptance(item.acceptance),
      note,
      timestamp
    };
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

  function sanitizeViewportRect(viewportRect) {
    return {
      x: Number.isFinite(viewportRect?.x) ? viewportRect.x : 0,
      y: Number.isFinite(viewportRect?.y) ? viewportRect.y : 0,
      width: Number.isFinite(viewportRect?.width) ? Math.max(0, viewportRect.width) : 0,
      height: Number.isFinite(viewportRect?.height) ? Math.max(0, viewportRect.height) : 0
    };
  }

  function sanitizeDevicePixelRatio(value) {
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function sanitizeScreenshot(screenshot) {
    const supportedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const mimeType = supportedMimeTypes.includes(screenshot?.mimeType) ? screenshot.mimeType : 'image/png';
    const rawDataUrl = typeof screenshot?.dataUrl === 'string' ? screenshot.dataUrl : '';
    const dataUrl = /^data:image\/(?:png|jpeg|webp);base64,/i.test(rawDataUrl) ? rawDataUrl : '';

    const rawAnnotatedDataUrl = typeof screenshot?.annotatedDataUrl === 'string' ? screenshot.annotatedDataUrl : '';
    const annotatedDataUrl = /^data:image\/(?:png|jpeg|webp);base64,/i.test(rawAnnotatedDataUrl)
      ? rawAnnotatedDataUrl
      : '';

    return { mimeType, dataUrl, annotatedDataUrl };
  }

  function sanitizeAnnotations(annotations) {
    if (!Array.isArray(annotations)) {
      return [];
    }

    return annotations.slice(0, 100).flatMap((annotation, index) => {
      if (!annotation || !['arrow', 'rectangle', 'ellipse', 'pin', 'text', 'blur'].includes(annotation.type)) {
        return [];
      }

      const normalized = {
        id: sanitizeString(annotation.id, 120) || `annotation-${index + 1}`,
        type: annotation.type,
        color: sanitizeColor(annotation.color),
        target: sanitizeAnnotationTarget(annotation.target)
      };

      if (annotation.type === 'arrow') {
        normalized.start = sanitizePoint(annotation.start);
        normalized.end = sanitizePoint(annotation.end);
      } else if (annotation.type === 'pin' || annotation.type === 'text') {
        normalized.point = sanitizePoint(annotation.point);
        if (annotation.type === 'pin') {
          normalized.number = Number.isFinite(annotation.number) ? Math.max(1, Math.round(annotation.number)) : index + 1;
        } else {
          normalized.text = sanitizeString(annotation.text, 280);
        }
      } else {
        normalized.rect = sanitizeViewportRect(annotation.rect);
      }

      return [normalized];
    });
  }

  function sanitizeAnnotationTarget(target) {
    if (!target || typeof target !== 'object') {
      return null;
    }

    const selectors = Array.isArray(target.selectors)
      ? target.selectors.map((value) => sanitizeString(value, 500)).filter(Boolean).slice(0, 4)
      : [];

    return {
      selectors,
      tag: sanitizeString(target.tag, 80),
      role: sanitizeString(target.role, 120),
      text: sanitizeString(target.text, 280),
      rect: sanitizeViewportRect(target.rect),
      surroundingText: sanitizeString(target.surroundingText, 500),
      parentLayout: sanitizeParentLayout(target.parentLayout)
    };
  }

  function sanitizeAcceptance(acceptance) {
    if (!Array.isArray(acceptance)) {
      return [];
    }

    return acceptance
      .map((criterion) => sanitizeString(criterion, 500))
      .filter(Boolean)
      .slice(0, MAX_ACCEPTANCE_CRITERIA);
  }

  function sanitizePageContext(pageContext, fallbackUrl, fallbackTitle) {
    const viewport = pageContext?.viewport || {};
    const browser = pageContext?.browser || {};
    return {
      url: getEffectivePageUrl(pageContext?.url || fallbackUrl || ''),
      title: sanitizeString(pageContext?.title || fallbackTitle, 500),
      sourceKind: sanitizeSourceKind(pageContext?.sourceKind, pageContext?.url || fallbackUrl),
      viewport: {
        width: sanitizeNonNegativeNumber(viewport.width),
        height: sanitizeNonNegativeNumber(viewport.height),
        scrollX: sanitizeNumber(viewport.scrollX),
        scrollY: sanitizeNumber(viewport.scrollY),
        devicePixelRatio: sanitizeDevicePixelRatio(viewport.devicePixelRatio),
        zoom: Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1
      },
      browser: {
        userAgent: sanitizeString(browser.userAgent, 500),
        language: sanitizeString(browser.language, 80)
      }
    };
  }

  function sanitizeParentLayout(parentLayout) {
    if (!parentLayout || typeof parentLayout !== 'object') {
      return {};
    }

    return ['display', 'direction', 'gridTemplateColumns', 'gap', 'alignItems', 'justifyContent'].reduce((result, key) => {
      const value = sanitizeString(parentLayout[key], 200);
      if (value) {
        result[key] = value;
      }
      return result;
    }, {});
  }

  function sanitizePoint(point) {
    return {
      x: sanitizeNumber(point?.x),
      y: sanitizeNumber(point?.y)
    };
  }

  function sanitizeNumber(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function sanitizeNonNegativeNumber(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function sanitizeString(value, maxLength) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
  }

  function sanitizeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ff3b30';
  }

  function sanitizeTabContext(tabContext, fallbackUrl, fallbackTitle) {
    return {
      url: typeof tabContext?.url === 'string' && tabContext.url
        ? getEffectivePageUrl(tabContext.url)
        : String(fallbackUrl || ''),
      title: typeof tabContext?.title === 'string' ? tabContext.title : String(fallbackTitle || '')
    };
  }

  function sanitizeSourceKind(value, rawUrl) {
    if (value === 'pdf' || value === 'web-page' || value === 'unknown') {
      return value;
    }

    return detectSourceKind(rawUrl);
  }

  function detectSourceKind(rawUrl) {
    try {
      const url = new URL(getEffectivePageUrl(rawUrl));
      const pathname = url.pathname.toLowerCase();

      if (pathname.endsWith('.pdf')) {
        return 'pdf';
      }

      if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'file:') {
        return 'web-page';
      }
    } catch (error) {
      return 'unknown';
    }

    return 'unknown';
  }

  function isValidDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function buildMarkdownExport(rawUrl, items, options) {
    const sourceUrl = getEffectivePageUrl(rawUrl);
    const normalizedItems = sanitizeFeedbackItems(items, rawUrl);
    const exportedAt = options?.exportedAt || new Date().toLocaleString();
    let markdown = `# Feedback for ${sourceUrl}\n\n`;
    markdown += `**Date:** ${exportedAt}\n\n`;
    markdown += `**Total Items:** ${normalizedItems.length}\n\n`;
    markdown += '---\n\n';

    normalizedItems.forEach((item, index) => {
      markdown += `## ${index + 1}. ${item.type === CAPTURE_TYPE_REGION ? 'Region Capture' : item.elementInfo.tag}\n\n`;
      markdown += `**Type:** ${item.type}\n\n`;

      if (item.type === CAPTURE_TYPE_REGION) {
        markdown += `**Source:** ${item.sourceKind}\n\n`;
        markdown += `**Viewport Rect:** x: ${item.viewportRect.x}, y: ${item.viewportRect.y}, width: ${item.viewportRect.width}, height: ${item.viewportRect.height}\n\n`;
        markdown += `**Page:** ${item.tabContext.url || item.pageUrl}\n\n`;

        if (item.tabContext.title) {
          markdown += `**Title:** ${item.tabContext.title}\n\n`;
        }

        markdown += `**Crop Stored:** ${item.screenshot.dataUrl ? 'yes' : 'no'}\n\n`;
        markdown += `**Annotations:** ${item.annotations.length}\n\n`;

        item.annotations.forEach((annotation, annotationIndex) => {
          const target = annotation.target?.selectors?.[0] || 'visual-only';
          markdown += `- ${annotationIndex + 1}. ${annotation.type} -> ${target}\n`;
        });

        if (item.annotations.length) {
          markdown += '\n';
        }
      } else {
        markdown += `**Selector:** \`${item.selector}\`\n\n`;
        markdown += `**Classes:** ${item.elementInfo.classes.join(', ') || 'none'}\n\n`;
        markdown += `**Text:** ${item.elementInfo.text || '(empty)'}\n\n`;
        markdown += `**Position:** x: ${item.position.x}, y: ${item.position.y}\n\n`;
        markdown += '**Styles:**\n';

        Object.entries(item.elementInfo.styles).forEach(([key, value]) => {
          markdown += `- ${key}: ${value}\n`;
        });

        markdown += '\n';
      }

      if (item.pageUrl) {
        markdown += `**Captured On:** ${item.pageUrl}\n\n`;
      }

      markdown += '**Requested Changes:**\n\n';
      markdown += `${item.note}\n\n`;

      if (item.acceptance.length) {
        markdown += '**Acceptance Criteria:**\n\n';
        item.acceptance.forEach((criterion) => {
          markdown += `- [ ] ${criterion}\n`;
        });
        markdown += '\n';
      }
      markdown += `**Captured:** ${formatTimestamp(item.timestamp)}\n\n`;
      markdown += '---\n\n';
    });

    return markdown;
  }

  function buildAiPromptExport(rawUrl, items) {
    const sourceUrl = getEffectivePageUrl(rawUrl);
    const normalizedItems = sanitizeFeedbackItems(items, rawUrl);
    let prompt = 'Implement the following visual change specification. Treat requested changes and acceptance criteria as requirements; annotations are supporting evidence.\n\n';
    prompt += `Source: ${sourceUrl}\n`;
    prompt += `Total items: ${normalizedItems.length}\n\n`;

    normalizedItems.forEach((item, index) => {
      prompt += `Item ${index + 1}\n`;
      prompt += `Type: ${item.type}\n`;

      if (item.type === CAPTURE_TYPE_REGION) {
        prompt += `Evidence: ${item.screenshot.dataUrl ? 'stored in local history; use Download AI Bundle for exact image files' : 'no image available'}\n`;
        prompt += `Source kind: ${item.sourceKind}\n`;
        prompt += `Rect: x=${item.viewportRect.x}, y=${item.viewportRect.y}, width=${item.viewportRect.width}, height=${item.viewportRect.height}\n`;
        prompt += `Page URL: ${item.tabContext.url || item.pageUrl}\n`;
        item.annotations.forEach((annotation, annotationIndex) => {
          prompt += `Annotation ${annotationIndex + 1}: ${annotation.type}`;
          if (annotation.target?.selectors?.length) {
            prompt += ` anchored to ${annotation.target.selectors.join(' or ')}`;
          }
          if (annotation.text) {
            prompt += ` (${annotation.text})`;
          }
          prompt += '\n';
        });
      } else {
        prompt += `Selector: ${item.selector}\n`;
        prompt += `Tag: ${item.elementInfo.tag}\n`;
        prompt += `Text: ${item.elementInfo.text || '(empty)'}\n`;
        prompt += `Page URL: ${item.pageUrl}\n`;
      }

      prompt += `Requested change: ${item.note}\n`;
      item.acceptance.forEach((criterion) => {
        prompt += `Acceptance: ${criterion}\n`;
      });
      prompt += `Captured at: ${formatTimestamp(item.timestamp)}\n\n`;
    });

    return prompt.trim();
  }

  function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
  }

  return {
    CAPTURE_TYPE_ELEMENT,
    CAPTURE_TYPE_REGION,
    FEEDBACK_STORAGE_PREFIX,
    REGION_CAPTURE_SESSION_PREFIX,
    SUPPORTED_HOSTNAMES,
    SUPPORTED_MATCH_PATTERNS,
    SHORTCUT_LABEL,
    MAC_SHORTCUT_LABEL,
    MAX_NOTE_LENGTH,
    MAX_ACCEPTANCE_CRITERIA,
    buildAiPromptExport,
    buildFeedbackId,
    buildMarkdownExport,
    canInjectIntoUrl,
    detectSourceKind,
    escapeCssIdentifier,
    formatTimestamp,
    getEffectivePageUrl,
    isLocalDevUrl,
    normalizeFeedbackItem,
    makeStorageKey,
    normalizeHostname,
    sanitizeFeedbackItems
  };
});
