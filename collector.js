// Read-only page observations. This module never receives saved history or notes.
(function() {
  'use strict';
  const { escapeCssIdentifier } = globalThis.DevFeedbackShared;
  function isOurElement(element) { return Boolean(element?.closest?.('[data-dev-feedback-picker]')); }
  function buildElementSnapshot(element) {
    const computedStyles = window.getComputedStyle(element);
    return {
      selector: getElementSelector(element),
      selectors: getElementSelectors(element),
      tag: element.tagName.toLowerCase(),
      role: getElementRole(element),
      classes: Array.from(element.classList).filter((className) => !className.startsWith('dev-feedback')),
      text: element.matches('input, textarea, [contenteditable]') ? '' : (element.innerText || '').trim().slice(0, 280),
      surroundingText: '',
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

  globalThis.DevFeedbackCollector = Object.freeze({ buildElementSnapshot, getViewportMetrics, buildPageContext, resolveDomTarget });
})();
