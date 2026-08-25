'use strict';

const HOST_ID = 'dev-feedback-electron-inspector';
const STYLE_KEYS = Object.freeze([
  'background-color', 'color', 'font-size', 'font-weight', 'width', 'height',
  'margin', 'padding', 'gap', 'border-radius', 'display', 'opacity'
]);

function mountElectronInspector(options = {}) {
  const documentRef = options.document;
  const windowRef = options.window;
  const bridge = options.bridge;
  if (!documentRef?.body || !windowRef || !bridge) {
    throw new TypeError('Electron Inspector renderer requires document, window, and bridge.');
  }

  documentRef.getElementById(HOST_ID)?.remove();
  const host = documentRef.createElement('div');
  host.id = HOST_ID;
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `${styles()}${markup()}`;
  documentRef.body.appendChild(host);

  const panel = shadow.querySelector('[data-panel]');
  const highlight = shadow.querySelector('[data-highlight]');
  const title = shadow.querySelector('[data-title]');
  const status = shadow.querySelector('[data-status]');
  const body = shadow.querySelector('[data-body]');
  const inspectButton = shadow.querySelector('[data-inspect]');
  const historyButton = shadow.querySelector('[data-history]');
  const closeButton = shadow.querySelector('[data-close]');

  let active = false;
  let selecting = false;
  let hostContext = { hostId: 'electron-app', hostName: 'Electron App' };

  inspectButton.addEventListener('click', beginSelection);
  historyButton.addEventListener('click', showHistory);
  closeButton.addEventListener('click', close);
  documentRef.addEventListener('pointermove', handlePointerMove, true);
  documentRef.addEventListener('click', handleDocumentClick, true);
  documentRef.addEventListener('keydown', handleKeydown, true);
  windowRef.addEventListener?.('resize', clearHighlight, { passive: true });

  function start(context = {}) {
    hostContext = {
      hostId: cleanText(context.hostId, 120) || 'electron-app',
      hostName: cleanText(context.hostName, 160) || 'Electron App'
    };
    active = true;
    panel.hidden = false;
    title.textContent = `${hostContext.hostName} Inspector`;
    beginSelection();
  }

  function beginSelection() {
    active = true;
    selecting = true;
    panel.hidden = false;
    status.textContent = 'Click an interface element. Press Esc to stop.';
    body.replaceChildren();
    const copy = documentRef.createElement('p');
    copy.className = 'copy';
    copy.textContent = 'Hover to inspect. Only the element you click and the note you write are captured.';
    body.appendChild(copy);
  }

  function handlePointerMove(event) {
    if (!selecting || isInspectorEvent(event)) return;
    const element = getInspectableElement(event);
    if (!element) return clearHighlight();
    const rect = element.getBoundingClientRect();
    highlight.hidden = false;
    highlight.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
    highlight.style.width = `${Math.max(0, Math.round(rect.width))}px`;
    highlight.style.height = `${Math.max(0, Math.round(rect.height))}px`;
  }

  function handleDocumentClick(event) {
    if (!selecting || isInspectorEvent(event)) return;
    const element = getInspectableElement(event);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selecting = false;
    clearHighlight();
    renderCaptureForm(element);
  }

  function renderCaptureForm(element) {
    const draft = buildElementDraft(element, windowRef);
    status.textContent = 'Describe the change for this element.';
    body.replaceChildren();

    const target = documentRef.createElement('div');
    target.className = 'target';
    const targetName = documentRef.createElement('strong');
    targetName.textContent = `<${draft.elementInfo.tag}> ${draft.elementInfo.text || 'Untitled element'}`;
    const selector = documentRef.createElement('code');
    selector.textContent = draft.selector;
    target.append(targetName, selector);

    const label = documentRef.createElement('label');
    label.textContent = 'What should change?';
    const textarea = documentRef.createElement('textarea');
    textarea.maxLength = 2000;
    textarea.rows = 4;
    textarea.placeholder = 'Describe the problem and the result you want.';
    label.appendChild(textarea);

    const actions = documentRef.createElement('div');
    actions.className = 'actions';
    const save = createButton('Save capture', 'primary');
    const cancel = createButton('Pick another');
    actions.append(save, cancel);
    body.append(target, label, actions);
    textarea.focus();

    save.addEventListener('click', async () => {
      const note = textarea.value.trim();
      if (!note) {
        showError('Write a short change request before saving.');
        textarea.focus();
        return;
      }
      save.disabled = true;
      status.textContent = 'Saving locally...';
      try {
        await bridge.saveElement({ ...draft, note });
        await showHistory();
      } catch (error) {
        save.disabled = false;
        showError(error?.message || 'The capture could not be saved.');
      }
    });
    cancel.addEventListener('click', beginSelection);
  }

  async function showHistory() {
    selecting = false;
    clearHighlight();
    status.textContent = 'Loading local History...';
    try {
      const history = await bridge.listHistory();
      renderHistory(Array.isArray(history?.items) ? history.items : []);
    } catch (error) {
      showError(error?.message || 'History could not be loaded.');
    }
  }

  function renderHistory(items) {
    status.textContent = `${items.length} saved capture${items.length === 1 ? '' : 's'}`;
    body.replaceChildren();
    if (!items.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'copy';
      empty.textContent = 'No captures yet.';
      body.appendChild(empty);
      return;
    }

    const list = documentRef.createElement('ol');
    list.className = 'history';
    items.slice().reverse().forEach((item) => {
      const entry = documentRef.createElement('li');
      const note = documentRef.createElement('span');
      note.textContent = cleanText(item.note, 240) || 'Untitled capture';
      const selector = documentRef.createElement('code');
      selector.textContent = cleanText(item.selector, 300);
      entry.append(note, selector);
      list.appendChild(entry);
    });

    const actions = documentRef.createElement('div');
    actions.className = 'actions';
    const send = createButton('Send to Codex', 'primary');
    const another = createButton('Inspect another');
    actions.append(send, another);
    body.append(list, actions);
    another.addEventListener('click', beginSelection);
    send.addEventListener('click', async () => {
      send.disabled = true;
      status.textContent = 'Writing the local handoff...';
      try {
        const result = await bridge.sendToCodex();
        status.textContent = `Handoff ready with ${result.count} capture${result.count === 1 ? '' : 's'}.`;
        send.textContent = 'Sent to Codex inbox';
      } catch (error) {
        send.disabled = false;
        showError(error?.message || 'The handoff could not be written.');
      }
    });
  }

  function handleKeydown(event) {
    if (!active || event.key !== 'Escape') return;
    if (selecting) {
      event.preventDefault();
      selecting = false;
      clearHighlight();
      status.textContent = 'Selection paused.';
      return;
    }
    close();
  }

  function close() {
    active = false;
    selecting = false;
    clearHighlight();
    panel.hidden = true;
  }

  function clearHighlight() {
    highlight.hidden = true;
  }

  function isInspectorEvent(event) {
    return event.composedPath?.().includes(host) || event.target === host;
  }

  function getInspectableElement(event) {
    const target = event.composedPath?.()[0] || event.target;
    return target && target.nodeType === 1 && target !== documentRef.documentElement && target !== documentRef.body
      ? target
      : null;
  }

  function showError(message) {
    status.textContent = message;
    status.classList.add('error');
    windowRef.setTimeout?.(() => status.classList.remove('error'), 2400);
  }

  function createButton(label, kind = '') {
    const element = documentRef.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (kind) element.className = kind;
    return element;
  }

  return Object.freeze({
    start,
    close,
    dispose() {
      close();
      inspectButton.removeEventListener('click', beginSelection);
      historyButton.removeEventListener('click', showHistory);
      closeButton.removeEventListener('click', close);
      documentRef.removeEventListener('pointermove', handlePointerMove, true);
      documentRef.removeEventListener('click', handleDocumentClick, true);
      documentRef.removeEventListener('keydown', handleKeydown, true);
      windowRef.removeEventListener?.('resize', clearHighlight);
      host.remove();
    }
  });
}

function buildElementDraft(element, windowRef) {
  const rect = element.getBoundingClientRect();
  const computed = windowRef.getComputedStyle(element);
  const styles = Object.fromEntries(STYLE_KEYS.map((key) => [key, computed.getPropertyValue(key)]));
  return {
    selector: buildSelector(element, windowRef),
    elementInfo: {
      tag: element.tagName.toLowerCase(),
      text: cleanText(element.innerText || element.textContent, 500),
      classes: Array.from(element.classList || []).slice(0, 20),
      styles,
      role: cleanText(element.getAttribute('role') || implicitRole(element), 120),
      surroundingText: cleanText(element.parentElement?.innerText || element.parentElement?.textContent, 500),
      parentLayout: {
        display: computed.getPropertyValue('display'),
        gap: computed.getPropertyValue('gap')
      }
    },
    position: { x: Math.round(rect.left), y: Math.round(rect.top) },
    viewport: {
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
      scrollX: windowRef.scrollX,
      scrollY: windowRef.scrollY,
      devicePixelRatio: windowRef.devicePixelRatio
    }
  };
}

function buildSelector(element, windowRef) {
  const escape = windowRef.CSS?.escape || fallbackCssEscape;
  if (element.id) {
    const selector = `#${escape(element.id)}`;
    if (isUnique(element.ownerDocument, selector)) return selector;
  }
  for (const attribute of ['data-testid', 'data-test', 'name', 'aria-label']) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const selector = `${element.tagName.toLowerCase()}[${attribute}="${escapeAttribute(value)}"]`;
    if (isUnique(element.ownerDocument, selector)) return selector;
  }

  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && current !== element.ownerDocument.body && parts.length < 6) {
    let part = current.tagName.toLowerCase();
    const classes = Array.from(current.classList || []).filter(Boolean).slice(0, 2);
    if (classes.length) part += `.${classes.map(escape).join('.')}`;
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter((sibling) => sibling.tagName === current.tagName)
      : [];
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    parts.unshift(part);
    const selector = parts.join(' > ');
    if (isUnique(element.ownerDocument, selector)) return selector;
    current = current.parentElement;
  }
  return parts.join(' > ') || element.tagName.toLowerCase();
}

function isUnique(documentRef, selector) {
  try {
    return documentRef.querySelectorAll(selector).length === 1;
  } catch (_) {
    return false;
  }
}

function implicitRole(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'input') return 'textbox';
  return '';
}

function fallbackCssEscape(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function escapeAttribute(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function markup() {
  return `
    <div class="highlight" data-highlight hidden></div>
    <aside class="panel" data-panel hidden aria-label="Electron Inspector">
      <header>
        <div><strong data-title>Electron Inspector</strong><small data-status>Ready</small></div>
        <button type="button" class="icon" data-close aria-label="Close inspector">x</button>
      </header>
      <nav>
        <button type="button" class="primary" data-inspect>Inspect element</button>
        <button type="button" data-history>History</button>
      </nav>
      <section data-body></section>
      <footer>Local capture. Explicit handoff.</footer>
    </aside>`;
}

function styles() {
  return `<style>
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel { pointer-events: auto; position: fixed; right: 18px; top: 18px; width: 360px; max-height: calc(100vh - 36px); overflow: auto; color: #f4f5fb; background: #191b27; border: 1px solid #34384d; border-radius: 14px; box-shadow: 0 22px 70px rgba(0,0,0,.42); font: 13px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 14px 10px; }
    header strong, header small { display: block; }
    header strong { font-size: 15px; }
    header small { margin-top: 3px; color: #aeb4cb; }
    header small.error { color: #ff9a9a; }
    nav, .actions { display: flex; gap: 8px; }
    nav { padding: 0 14px 12px; border-bottom: 1px solid #2c3042; }
    section { padding: 14px; }
    footer { padding: 10px 14px; color: #878ea8; border-top: 1px solid #2c3042; font-size: 11px; }
    button { appearance: none; border: 1px solid #464c66; border-radius: 8px; padding: 7px 10px; color: #edf0ff; background: #292d3f; font: inherit; cursor: pointer; }
    button:hover { background: #343950; }
    button:focus-visible, textarea:focus-visible { outline: 2px solid #8e88ff; outline-offset: 2px; }
    button.primary { color: white; background: #5b55c5; border-color: #706ae0; }
    button.primary:hover { background: #6862d1; }
    button:disabled { cursor: wait; opacity: .65; }
    button.icon { padding: 3px 8px; background: transparent; border-color: transparent; }
    .copy { margin: 0; color: #c8cce0; }
    .target { display: grid; gap: 5px; margin-bottom: 12px; padding: 10px; background: #222537; border-radius: 9px; }
    code { display: block; overflow: hidden; color: #aeb4cb; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
    label { display: grid; gap: 6px; font-weight: 600; }
    textarea { width: 100%; resize: vertical; color: #f4f5fb; background: #11131c; border: 1px solid #464c66; border-radius: 8px; padding: 9px; font: inherit; }
    .actions { margin-top: 10px; }
    .history { display: grid; gap: 8px; max-height: 320px; overflow: auto; margin: 0; padding-left: 24px; }
    .history li { padding: 8px; background: #222537; border-radius: 8px; }
    .history span { display: block; margin-bottom: 3px; }
    .highlight { pointer-events: none; position: fixed; left: 0; top: 0; border: 2px solid #8e88ff; border-radius: 3px; background: rgba(142,136,255,.1); box-shadow: 0 0 0 9999px rgba(5,6,10,.08); }
  </style>`;
}

module.exports = {
  mountElectronInspector
};
