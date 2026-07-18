/**
 * Dev Feedback Capture - Reversible Visual Edit Engine
 *
 * This module owns temporary, in-page mutations only. It performs no storage,
 * messaging, or permission work. Runtime DOM references remain private to a
 * session and are never included in snapshot output.
 */

(function(root, factory) {
  const api = factory();
  root.DevFeedbackVisualEdit = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_MAX_COMMANDS = 50;
  const HARD_MAX_COMMANDS = 50;
  const MAX_STYLE_VALUE_LENGTH = 500;

  const STYLE_ALLOWLIST = Object.freeze(new Set([
    'translate',
    'width',
    'height',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
    'box-sizing',
    'display',
    'opacity',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'gap',
    'row-gap',
    'column-gap',
    'color',
    'background-color',
    'border-color',
    'border-width',
    'border-radius',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-align'
  ]));

  const DEFAULT_MATCH_STYLE_PROPERTIES = Object.freeze([
    'color',
    'background-color',
    'border-color',
    'border-width',
    'border-radius',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-align'
  ]);

  const ALIGNMENTS = new Set(['left', 'right', 'top', 'bottom', 'center-x', 'center-y']);
  const REORDER_DIRECTIONS = new Set(['previous', 'next', 'first', 'last']);

  function createSession(options) {
    const target = options?.target;
    if (!isElementLike(target)) {
      throw new TypeError('createSession requires a target element.');
    }

    const buildTargetSnapshot = typeof options?.buildTargetSnapshot === 'function'
      ? options.buildTargetSnapshot
      : buildDefaultTargetSnapshot;
    const requestedMax = Number.isFinite(options?.maxCommands)
      ? Math.floor(options.maxCommands)
      : DEFAULT_MAX_COMMANDS;
    const maxCommands = clamp(requestedMax, 1, HARD_MAX_COMMANDS);
    const targetSnapshot = snapshotTarget(target, buildTargetSnapshot);

    let commands = [];
    let cursor = 0;
    let restored = false;
    let sequence = 0;
    const baselineEntries = [];
    const baselineKeys = new Set();

    function commitStyle(label, properties, operationKind) {
      ensureActive();
      const entries = normalizeStyleProperties(properties);
      if (!entries.length) {
        throw new TypeError('commitStyle requires at least one allowlisted style property.');
      }

      const kind = sanitizeKind(operationKind || 'style');
      const operations = entries.map(([property, after]) => {
        const before = readInlineStyle(target, property);
        registerStyleBaseline(target, property, before);
        return {
          runtimeKind: 'style',
          targetRef: target,
          targetSnapshot,
          property,
          before,
          after,
          serializedKind: kind
        };
      });

      return commitCommand({
        label: sanitizeLabel(label || 'Change style'),
        kind,
        target: targetSnapshot,
        reference: null,
        operations
      });
    }

    function commitText(value) {
      ensureActive();
      const textNode = findDirectTextNode(target);
      const nextValue = String(value ?? '').slice(0, 4000);
      const beforeValue = String(textNode.nodeValue ?? '');
      registerBaseline('text', () => {
        textNode.nodeValue = beforeValue;
      });

      return commitCommand({
        label: 'Edit text',
        kind: 'text',
        target: targetSnapshot,
        reference: null,
        operations: [{
          runtimeKind: 'text',
          targetRef: target,
          textNodeRef: textNode,
          targetSnapshot,
          before: { value: beforeValue },
          after: { value: nextValue },
          serializedKind: 'text'
        }]
      });
    }

    function commitHide(hidden) {
      ensureActive();
      const shouldHide = Boolean(hidden);
      const before = readInlineStyle(target, 'display');
      registerStyleBaseline(target, 'display', before);
      const after = shouldHide
        ? { existed: true, value: 'none', priority: 'important' }
        : { existed: false, value: '', priority: '' };

      return commitCommand({
        label: shouldHide ? 'Hide element' : 'Show element',
        kind: 'hide',
        target: targetSnapshot,
        reference: null,
        operations: [{
          runtimeKind: 'style',
          targetRef: target,
          targetSnapshot,
          property: 'display',
          before,
          after,
          serializedKind: 'hide'
        }]
      });
    }

    function commitReorder(direction) {
      ensureActive();
      if (!REORDER_DIRECTIONS.has(direction)) {
        throw new TypeError('Reorder direction must be previous, next, first, or last.');
      }

      const parent = target.parentNode;
      if (!parent || typeof parent.insertBefore !== 'function') {
        throw new Error('The target cannot be reordered without a mutable parent.');
      }

      assertHistoryCapacity();
      truncateRedo();

      const before = captureLocation(target);
      const destination = getReorderDestination(target, direction);
      if (!destination || locationsEqual(before, destination)) {
        return null;
      }

      registerBaseline('reorder', () => placeAtLocation(target, before));
      placeAtLocation(target, destination);
      const after = captureLocation(target);

      return recordAppliedCommand({
        label: `Reorder ${direction}`,
        kind: 'reorder',
        target: targetSnapshot,
        reference: snapshotTarget(parent, buildTargetSnapshot),
        operations: [{
          runtimeKind: 'reorder',
          targetRef: target,
          targetSnapshot,
          direction,
          before,
          after,
          serializedKind: 'reorder'
        }]
      });
    }

    function commitMatchStyle(reference, properties) {
      ensureActive();
      if (!isElementLike(reference)) {
        throw new TypeError('commitMatchStyle requires a reference element.');
      }

      const requested = properties === undefined ? DEFAULT_MATCH_STYLE_PROPERTIES : properties;
      if (!Array.isArray(requested) || !requested.length) {
        throw new TypeError('Match-style properties must be a non-empty array.');
      }

      const names = Array.from(new Set(requested.map(normalizePropertyName)));
      names.forEach(assertAllowedProperty);
      const computed = getComputedStyles(reference);
      const values = names.reduce((result, property) => {
        result[property] = computed.getPropertyValue(property);
        return result;
      }, {});

      return commitStyleWithReference('Match style', values, 'match-style', reference);
    }

    function commitAlign(reference, alignment) {
      ensureActive();
      if (!isElementLike(reference)) {
        throw new TypeError('commitAlign requires a reference element.');
      }
      if (!ALIGNMENTS.has(alignment)) {
        throw new TypeError('Alignment must be left, right, top, bottom, center-x, or center-y.');
      }
      if (typeof target.getBoundingClientRect !== 'function' || typeof reference.getBoundingClientRect !== 'function') {
        throw new Error('Alignment requires measurable target and reference elements.');
      }

      const targetRect = target.getBoundingClientRect();
      const referenceRect = reference.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (alignment === 'left') dx = referenceRect.left - targetRect.left;
      if (alignment === 'right') dx = referenceRect.right - targetRect.right;
      if (alignment === 'top') dy = referenceRect.top - targetRect.top;
      if (alignment === 'bottom') dy = referenceRect.bottom - targetRect.bottom;
      if (alignment === 'center-x') {
        dx = (referenceRect.left + referenceRect.width / 2) - (targetRect.left + targetRect.width / 2);
      }
      if (alignment === 'center-y') {
        dy = (referenceRect.top + referenceRect.height / 2) - (targetRect.top + targetRect.height / 2);
      }

      return commitTranslate(`Align ${alignment}`, dx, dy, 'align', reference);
    }

    function nudge(dx, dy) {
      ensureActive();
      const x = finiteNumber(dx, 'Nudge dx');
      const y = finiteNumber(dy, 'Nudge dy');
      return commitTranslate('Nudge element', x, y, 'move', null);
    }

    function undo() {
      ensureActive();
      if (!cursor) {
        return false;
      }
      const command = commands[cursor - 1];
      revertOperations(command.operations);
      cursor -= 1;
      return true;
    }

    function redo() {
      ensureActive();
      if (cursor >= commands.length) {
        return false;
      }
      const command = commands[cursor];
      applyOperations(command.operations);
      cursor += 1;
      return true;
    }

    function reset() {
      ensureActive();
      restoreBaseline();
      commands = [];
      cursor = 0;
      restored = false;
      return getState();
    }

    function restore() {
      if (restored) {
        return getState();
      }
      restoreBaseline();
      commands = [];
      cursor = 0;
      restored = true;
      return getState();
    }

    function snapshot() {
      return {
        schemaVersion: 1,
        target: cloneSerializable(targetSnapshot),
        maxCommands,
        cursor,
        commands: commands.slice(0, cursor).map(serializeCommand)
      };
    }

    function getState() {
      return {
        restored,
        dirty: cursor > 0,
        commandCount: commands.length,
        appliedCommandCount: cursor,
        maxCommands,
        canUndo: !restored && cursor > 0,
        canRedo: !restored && cursor < commands.length,
        target: cloneSerializable(targetSnapshot)
      };
    }

    function commitStyleWithReference(label, properties, kind, reference) {
      const entries = normalizeStyleProperties(properties);
      const referenceSnapshot = snapshotTarget(reference, buildTargetSnapshot);
      const operations = entries.map(([property, after]) => {
        const before = readInlineStyle(target, property);
        registerStyleBaseline(target, property, before);
        return {
          runtimeKind: 'style',
          targetRef: target,
          targetSnapshot,
          property,
          before,
          after,
          serializedKind: kind
        };
      });
      return commitCommand({ label, kind, target: targetSnapshot, reference: referenceSnapshot, operations });
    }

    function commitTranslate(label, dx, dy, kind, reference) {
      const inlineTranslate = readInlineStyle(target, 'translate');
      const effectiveTranslate = inlineTranslate.existed
        ? inlineTranslate.value
        : getComputedStyles(target).getPropertyValue('translate');
      const current = parseTranslate(effectiveTranslate);
      const effectiveBefore = {
        existed: true,
        value: `${formatNumber(current.x)}px ${formatNumber(current.y)}px`,
        priority: inlineTranslate.priority
      };
      const after = {
        existed: true,
        value: `${formatNumber(current.x + dx)}px ${formatNumber(current.y + dy)}px`,
        priority: inlineTranslate.priority
      };
      registerStyleBaseline(target, 'translate', inlineTranslate);
      return commitCommand({
        label,
        kind,
        target: targetSnapshot,
        reference: reference ? snapshotTarget(reference, buildTargetSnapshot) : null,
        operations: [{
          runtimeKind: 'style',
          targetRef: target,
          targetSnapshot,
          property: 'translate',
          before: inlineTranslate,
          serializedBefore: effectiveBefore,
          after,
          serializedKind: kind
        }]
      });
    }

    function commitCommand(draft) {
      assertHistoryCapacity();
      truncateRedo();
      applyOperations(draft.operations);
      return recordAppliedCommand(draft);
    }

    function recordAppliedCommand(draft) {
      assertHistoryCapacity();
      truncateRedo();
      const command = {
        id: buildId(++sequence),
        label: sanitizeLabel(draft.label),
        kind: sanitizeKind(draft.kind),
        target: cloneSerializable(draft.target),
        reference: cloneSerializable(draft.reference),
        operations: draft.operations,
        createdAt: new Date().toISOString()
      };
      commands.push(command);
      cursor = commands.length;
      return serializeCommand(command);
    }

    function assertHistoryCapacity() {
      if (cursor < commands.length) {
        return;
      }
      if (commands.length >= maxCommands) {
        throw new Error(`Visual edit history is limited to ${maxCommands} commands. Save or reset before continuing.`);
      }
    }

    function truncateRedo() {
      if (cursor < commands.length) {
        commands.splice(cursor);
      }
    }

    function registerStyleBaseline(element, property, state) {
      registerBaseline(`style:${property}`, () => writeInlineStyle(element, property, state));
    }

    function registerBaseline(key, restoreEntry) {
      if (baselineKeys.has(key)) {
        return;
      }
      baselineKeys.add(key);
      baselineEntries.push({ key, restore: restoreEntry });
    }

    function restoreBaseline() {
      for (let index = baselineEntries.length - 1; index >= 0; index -= 1) {
        baselineEntries[index].restore();
      }
      baselineEntries.length = 0;
      baselineKeys.clear();
    }

    function ensureActive() {
      if (restored) {
        throw new Error('This visual edit session has been restored and is no longer active.');
      }
    }

    return Object.freeze({
      commitStyle,
      commitText,
      commitHide,
      commitReorder,
      commitMatchStyle,
      commitAlign,
      nudge,
      undo,
      redo,
      reset,
      restore,
      snapshot,
      getState
    });
  }

  function applyOperations(operations) {
    const applied = [];
    try {
      operations.forEach((operation) => {
        applyOperation(operation, operation.after);
        applied.push(operation);
      });
    } catch (error) {
      for (let index = applied.length - 1; index >= 0; index -= 1) {
        applyOperation(applied[index], applied[index].before);
      }
      throw error;
    }
  }

  function revertOperations(operations) {
    for (let index = operations.length - 1; index >= 0; index -= 1) {
      applyOperation(operations[index], operations[index].before);
    }
  }

  function applyOperation(operation, state) {
    if (operation.runtimeKind === 'style') {
      writeInlineStyle(operation.targetRef, operation.property, state);
      return;
    }
    if (operation.runtimeKind === 'text') {
      operation.textNodeRef.nodeValue = state.value;
      return;
    }
    if (operation.runtimeKind === 'reorder') {
      placeAtLocation(operation.targetRef, state);
      return;
    }
    throw new Error(`Unsupported runtime operation: ${operation.runtimeKind}`);
  }

  function serializeCommand(command) {
    return {
      id: command.id,
      label: command.label,
      kind: command.kind,
      target: cloneSerializable(command.target),
      reference: cloneSerializable(command.reference),
      operations: command.operations.map((operation) => {
        const serialized = {
          kind: operation.serializedKind,
          target: cloneSerializable(operation.targetSnapshot),
          before: serializeOperationState(operation, operation.serializedBefore || operation.before),
          after: serializeOperationState(operation, operation.after)
        };
        if (operation.property) serialized.property = operation.property;
        if (operation.direction) serialized.direction = operation.direction;
        return serialized;
      }),
      createdAt: command.createdAt
    };
  }

  function serializeOperationState(operation, state) {
    if (operation.runtimeKind === 'reorder') {
      return {
        parent: cloneSerializable(state.parentSnapshot),
        nextSibling: cloneSerializable(state.nextSiblingSnapshot)
      };
    }
    return cloneSerializable(state);
  }

  function normalizeStyleProperties(properties) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      throw new TypeError('Style properties must be an object.');
    }
    return Object.entries(properties).map(([rawProperty, rawValue]) => {
      const property = normalizePropertyName(rawProperty);
      assertAllowedProperty(property);
      return [property, normalizeStyleValue(rawValue)];
    });
  }

  function normalizePropertyName(property) {
    return String(property || '').trim().replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).toLowerCase();
  }

  function assertAllowedProperty(property) {
    if (!STYLE_ALLOWLIST.has(property)) {
      throw new Error(`Style property is not allowed: ${property}`);
    }
  }

  function normalizeStyleValue(rawValue) {
    const candidate = rawValue && typeof rawValue === 'object'
      ? rawValue
      : { value: rawValue, priority: '' };
    const value = String(candidate.value ?? '');
    if (value.length > MAX_STYLE_VALUE_LENGTH || /(?:javascript\s*:|@import|url\s*\()/i.test(value)) {
      throw new Error('Style value is not allowed.');
    }
    const priority = candidate.priority === 'important' ? 'important' : '';
    return { existed: true, value, priority };
  }

  function readInlineStyle(element, property) {
    const style = getStyleDeclaration(element);
    const value = typeof style.getPropertyValue === 'function' ? style.getPropertyValue(property) : style[property] || '';
    const priority = typeof style.getPropertyPriority === 'function' ? style.getPropertyPriority(property) : '';
    return { existed: styleHasProperty(style, property), value: String(value || ''), priority: String(priority || '') };
  }

  function writeInlineStyle(element, property, state) {
    const style = getStyleDeclaration(element);
    if (!state?.existed) {
      if (typeof style.removeProperty === 'function') {
        style.removeProperty(property);
      } else {
        delete style[property];
      }
      return;
    }
    if (typeof style.setProperty === 'function') {
      style.setProperty(property, String(state.value ?? ''), state.priority || '');
    } else {
      style[property] = String(state.value ?? '');
    }
  }

  function styleHasProperty(style, property) {
    if (Number.isFinite(style.length) && typeof style.item === 'function') {
      for (let index = 0; index < style.length; index += 1) {
        if (style.item(index) === property) return true;
      }
    }
    return Object.prototype.hasOwnProperty.call(style, property) && style[property] !== '';
  }

  function getStyleDeclaration(element) {
    if (!element.style || typeof element.style !== 'object') {
      throw new Error('The target does not expose an inline style declaration.');
    }
    return element.style;
  }

  function getComputedStyles(element) {
    const view = element.ownerDocument?.defaultView;
    if (view && typeof view.getComputedStyle === 'function') {
      return view.getComputedStyle(element);
    }
    if (typeof getComputedStyle === 'function') {
      return getComputedStyle(element);
    }
    return {
      getPropertyValue(property) {
        return readInlineStyle(element, property).value;
      }
    };
  }

  function findDirectTextNode(element) {
    const childNodes = Array.from(element.childNodes || []);
    const textNodes = childNodes.filter((node) => node && node.nodeType === 3);
    const elementChildren = childNodes.filter((node) => node && node.nodeType === 1);
    if (textNodes.length !== 1 || elementChildren.length > 0) {
      throw new Error('Inline text editing is limited to elements with one direct text node and no child elements.');
    }
    return textNodes[0];
  }

  function captureLocation(element) {
    const parent = element.parentNode;
    const nextSibling = element.nextSibling || null;
    return {
      parentRef: parent,
      nextSiblingRef: nextSibling,
      parentSnapshot: buildDefaultTargetSnapshot(parent),
      nextSiblingSnapshot: nextSibling ? buildDefaultTargetSnapshot(nextSibling) : null
    };
  }

  function placeAtLocation(element, location) {
    const parent = location?.parentRef;
    if (!parent || typeof parent.insertBefore !== 'function') {
      throw new Error('The original reorder parent is no longer available.');
    }
    const nextSibling = location.nextSiblingRef;
    parent.insertBefore(element, nextSibling && nextSibling.parentNode === parent ? nextSibling : null);
  }

  function getReorderDestination(element, direction) {
    const parent = element.parentNode;
    const siblings = Array.from(parent?.children || []).filter(Boolean);
    const index = siblings.indexOf(element);
    if (index < 0) return null;
    if (direction === 'previous' && index > 0) {
      return locationBefore(parent, siblings[index - 1]);
    }
    if (direction === 'next' && index < siblings.length - 1) {
      return locationBefore(parent, siblings[index + 1].nextSibling || null);
    }
    if (direction === 'first' && index > 0) {
      return locationBefore(parent, siblings[0]);
    }
    if (direction === 'last' && index < siblings.length - 1) {
      return locationBefore(parent, null);
    }
    return null;
  }

  function locationBefore(parent, nextSibling) {
    return {
      parentRef: parent,
      nextSiblingRef: nextSibling,
      parentSnapshot: buildDefaultTargetSnapshot(parent),
      nextSiblingSnapshot: nextSibling ? buildDefaultTargetSnapshot(nextSibling) : null
    };
  }

  function locationsEqual(left, right) {
    return left?.parentRef === right?.parentRef && left?.nextSiblingRef === right?.nextSiblingRef;
  }

  function parseTranslate(value) {
    const text = String(value || '').trim();
    if (!text || text === 'none') return { x: 0, y: 0 };
    const match = text.match(/^(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?$/i);
    if (!match) {
      throw new Error('Nudge and align require an empty or pixel-based inline translate value.');
    }
    return { x: Number(match[1]), y: Number(match[2] || 0) };
  }

  function buildDefaultTargetSnapshot(element) {
    if (!element || typeof element !== 'object') return null;
    const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
    return {
      tag: typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '',
      id: typeof element.id === 'string' ? element.id : '',
      classes: element.classList ? Array.from(element.classList).slice(0, 20) : [],
      text: typeof element.textContent === 'string' ? element.textContent.trim().slice(0, 280) : '',
      rect: rect ? {
        x: finiteOrZero(rect.x ?? rect.left),
        y: finiteOrZero(rect.y ?? rect.top),
        width: finiteOrZero(rect.width),
        height: finiteOrZero(rect.height)
      } : null
    };
  }

  function snapshotTarget(element, builder) {
    try {
      return cloneSerializable(builder(element));
    } catch (error) {
      return buildDefaultTargetSnapshot(element);
    }
  }

  function cloneSerializable(value, seen) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (value === undefined || ['function', 'symbol', 'bigint'].includes(typeof value)) return undefined;
    if (typeof value !== 'object') return undefined;
    if (value.nodeType || value.window === value) return undefined;
    const visited = seen || new WeakSet();
    if (visited.has(value)) return undefined;
    visited.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => cloneSerializable(item, visited)).filter((item) => item !== undefined);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    return Object.keys(value).reduce((result, key) => {
      const cloned = cloneSerializable(value[key], visited);
      if (cloned !== undefined) result[key] = cloned;
      return result;
    }, {});
  }

  function isElementLike(value) {
    return Boolean(value && typeof value === 'object' && value.style && typeof value.style === 'object');
  }

  function sanitizeLabel(value) {
    return String(value || 'Visual edit').trim().slice(0, 160) || 'Visual edit';
  }

  function sanitizeKind(value) {
    return String(value || 'style').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'style';
  }

  function buildId(sequence) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `visual-edit-${Date.now()}-${sequence}`;
  }

  function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
    return number;
  }

  function finiteOrZero(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function formatNumber(value) {
    return Number(value.toFixed(3)).toString();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  return Object.freeze({
    STYLE_ALLOWLIST: Object.freeze(Array.from(STYLE_ALLOWLIST)),
    createSession
  });
});
