const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shared = require('../shared.js');
globalThis.DevFeedbackShared = shared;
const bundleBuilder = require('../ai-bundle.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const productJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'product.json'), 'utf8'));
const ciWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');
const releaseWorkflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
const historyMarkup = fs.readFileSync(path.join(__dirname, '..', 'history.html'), 'utf8');
const historySource = fs.readFileSync(path.join(__dirname, '..', 'history.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const popupSource = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
const popupScriptSource = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

class MockStyleDeclaration {
  constructor(initial = {}) {
    this.values = new Map();
    Object.entries(initial).forEach(([property, value]) => {
      this.setProperty(property, value);
    });
  }

  get length() {
    return this.values.size;
  }

  item(index) {
    return Array.from(this.values.keys())[index] || '';
  }

  getPropertyValue(property) {
    return this.values.get(property)?.value || '';
  }

  getPropertyPriority(property) {
    return this.values.get(property)?.priority || '';
  }

  setProperty(property, value, priority = '') {
    this.values.set(property, { value: String(value), priority: String(priority) });
  }

  removeProperty(property) {
    const value = this.getPropertyValue(property);
    this.values.delete(property);
    return value;
  }
}

class MockTextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentNode = null;
  }

  get textContent() {
    return this.nodeValue;
  }
}

class MockElement {
  constructor(id, options = {}) {
    this.nodeType = 1;
    this.id = id;
    this.tagName = (options.tagName || 'div').toUpperCase();
    this.classList = options.classes || [];
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.style = new MockStyleDeclaration(options.style);
    this.computedStyles = options.computedStyles || {};
    this.childNodes = [];
    this.parentNode = null;
    this.ownerDocument = mockDocument;
    this.rect = {
      left: 0,
      top: 0,
      width: 100,
      height: 40,
      ...(options.rect || {})
    };
    if (Object.prototype.hasOwnProperty.call(options, 'text')) {
      this.appendChild(new MockTextNode(options.text));
    }
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] || null;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent || '').join('');
  }

  set textContent(value) {
    this.childNodes.forEach((child) => {
      child.parentNode = null;
    });
    this.childNodes = [];
    if (String(value)) {
      this.appendChild(new MockTextNode(String(value)));
    }
  }

  getBoundingClientRect() {
    return {
      ...this.rect,
      x: this.rect.left,
      y: this.rect.top,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height
    };
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(child, reference) {
    if (reference !== null && reference.parentNode !== this) {
      throw new Error('Reference node is not a child.');
    }
    if (child.parentNode) {
      const oldIndex = child.parentNode.childNodes.indexOf(child);
      if (oldIndex >= 0) child.parentNode.childNodes.splice(oldIndex, 1);
    }
    const index = reference === null ? this.childNodes.length : this.childNodes.indexOf(reference);
    this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) {
      throw new Error('Node is not a child.');
    }
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

const mockDocument = {
  createElement(tagName) {
    return new MockElement('', { tagName });
  },
  defaultView: {
    getComputedStyle(element) {
      return {
        getPropertyValue(property) {
          return element.computedStyles[property] ?? element.style.getPropertyValue(property);
        }
      };
    }
  }
};

function childIds(parent) {
  return parent.children.map((child) => child.id);
}

assert.equal(shared.isLocalDevUrl('http://localhost:3000'), true);
assert.equal(shared.isLocalDevUrl('https://localhost:8443/test'), true);
assert.equal(shared.isLocalDevUrl('http://127.0.0.1:5173'), true);
assert.equal(shared.isLocalDevUrl('https://0.0.0.0:3000'), true);
assert.equal(shared.isLocalDevUrl('http://[::1]:8080'), true);

assert.equal(shared.isLocalDevUrl('https://example.com'), false);
assert.equal(shared.isLocalDevUrl('chrome://extensions'), false);
assert.equal(shared.isLocalDevUrl('not-a-url'), false);

assert.equal(shared.canInjectIntoUrl('https://example.com/path'), true);
assert.equal(shared.canInjectIntoUrl('file:///C:/Docs/sample.pdf'), true);
assert.equal(shared.canInjectIntoUrl('chrome://extensions'), false);

assert.equal(
  shared.getEffectivePageUrl('chrome-extension://viewer/index.html?src=https%3A%2F%2Fexample.com%2Fdoc.pdf'),
  'https://example.com/doc.pdf'
);
assert.equal(
  shared.makeStorageKey('file:///C:/Docs/sample.pdf'),
  'dev-feedback-file-file%3A%2F%2F%2FC%3A%2FDocs%2Fsample.pdf'
);

const migratedItems = shared.sanitizeFeedbackItems([
  {
    selector: 'button.primary',
    note: 'Make this larger',
    timestamp: '2026-03-22T10:00:00.000Z',
    elementInfo: {
      tag: 'button',
      classes: ['primary'],
      text: 'Save',
      styles: {
        'background-color': 'rgb(0, 0, 0)'
      }
    },
    position: { x: 50, y: 80 }
  },
  {
    type: 'region',
    note: 'Move this annotation',
    timestamp: '2026-03-22T10:05:00.000Z',
    pageUrl: 'file:///C:/Docs/sample.pdf',
    pageTitle: 'Sample PDF',
    viewportRect: { x: 20, y: 40, width: 120, height: 60 },
    devicePixelRatio: 2,
    screenshot: {
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      annotatedDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    },
    annotations: [{
      id: 'annotation-1',
      type: 'arrow',
      start: { x: 20, y: 40 },
      end: { x: 80, y: 60 },
      color: '#ff3b30',
      target: {
        selectors: ['button[data-action="save"]'],
        tag: 'button',
        role: 'button',
        text: 'Save',
        rect: { x: 70, y: 45, width: 40, height: 24 },
        parentLayout: { display: 'flex', gap: '8px' }
      }
    }],
    acceptance: ['Button aligns with the total'],
    pageContext: {
      url: 'file:///C:/Docs/sample.pdf',
      title: 'Sample PDF',
      sourceKind: 'pdf',
      viewport: { width: 1440, height: 900, scrollX: 0, scrollY: 100, devicePixelRatio: 2, zoom: 1 },
      browser: { userAgent: 'Test Browser', language: 'en-US' }
    },
    tabContext: {
      url: 'file:///C:/Docs/sample.pdf',
      title: 'Sample PDF'
    }
  }
], 'https://example.com/page', 'Example Page');

assert.equal(migratedItems.length, 2);
assert.equal(migratedItems[0].type, 'element');
assert.equal(migratedItems[0].captureType, 'element');
assert.equal(migratedItems[0].specVersion, shared.FEEDBACK_SPEC_VERSION);
assert.equal(migratedItems[0].changeRequest.kind, shared.REQUEST_KIND_VISUAL_SUGGESTION);
assert.equal(migratedItems[0].changeRequest.summary, 'Make this larger');
assert.deepEqual(migratedItems[0].changeRequest.requestedMutations, []);
assert.equal(migratedItems[1].type, 'region');
assert.equal(migratedItems[1].captureType, 'region');
assert.equal(migratedItems[1].changeRequest.kind, shared.REQUEST_KIND_VISUAL_SUGGESTION);
assert.deepEqual(migratedItems[1].changeRequest.requestedMutations, []);
assert.equal(migratedItems[1].sourceKind, 'pdf');
assert.equal(migratedItems[1].annotations.length, 1);
assert.equal(migratedItems[1].annotations[0].target.selectors[0], 'button[data-action="save"]');
assert.deepEqual(migratedItems[1].acceptance, ['Button aligns with the total']);
assert.equal(migratedItems[1].pageContext.viewport.scrollY, 100);

const validPngDataUrl = migratedItems[1].screenshot.dataUrl;
const normalizedVisualEdit = shared.normalizeFeedbackItem({
  type: 'element',
  note: 'Move and restyle CTA',
  selector: '#cta',
  elementInfo: {
    tag: 'button',
    text: 'Save',
    styles: { color: '#111111' }
  },
  proposedElementInfo: {
    tag: 'button',
    text: 'Continue',
    styles: {
      color: '#ffffff',
      'font-size': '18px',
      'font-weight': '700',
      position: 'fixed'
    }
  },
  changeRequest: {
    kind: shared.REQUEST_KIND_MUTATION,
    summary: 'Move and restyle CTA',
    requestedMutations: [
      {
        id: 'move-cta',
        action: 'move',
        target: {
          selectors: ['#cta'],
          tag: 'button',
          rect: { x: 10, y: 20, width: 100, height: 40 }
        },
        parameters: { deltaX: 12, deltaY: -4, unsupported: 'drop me' }
      },
      {
        id: 'restyle-cta',
        action: 'restyle',
        target: { selectors: ['#cta'], tag: 'button' },
        parameters: {
          styles: {
            color: '#ffffff',
            'font-size': '18px',
            'background-image': 'url(https://example.com/tracker.png)'
          }
        }
      }
    ]
  },
  evidence: {
    before: {
      dataUrl: validPngDataUrl,
      source: { kind: 'captured', label: 'Before preview' }
    },
    proposed: {
      dataUrl: validPngDataUrl,
      source: 'rendered-preview'
    }
  }
}, 'https://example.com/page', 'Example Page');

assert.equal(normalizedVisualEdit.changeRequest.kind, shared.REQUEST_KIND_MUTATION);
assert.deepEqual(
  normalizedVisualEdit.changeRequest.requestedMutations.map((mutation) => mutation.action),
  ['move', 'restyle']
);
assert.deepEqual(normalizedVisualEdit.changeRequest.requestedMutations[0].parameters, {
  deltaX: 12,
  deltaY: -4
});
assert.deepEqual(normalizedVisualEdit.changeRequest.requestedMutations[1].parameters.styles, {
  color: '#ffffff',
  'font-size': '18px'
});
assert.equal(normalizedVisualEdit.proposedElementInfo.text, 'Continue');
assert.deepEqual(normalizedVisualEdit.proposedElementInfo.styles, {
  color: '#ffffff',
  'font-size': '18px',
  'font-weight': '700'
});
assert.equal(normalizedVisualEdit.evidence.before.dataUrl, validPngDataUrl);
assert.equal(normalizedVisualEdit.evidence.before.source.kind, 'captured');
assert.equal(normalizedVisualEdit.evidence.proposed.source.kind, 'rendered-preview');

const downgradedVisualEdit = shared.normalizeFeedbackItem({
  type: 'element',
  note: 'Reject unsafe edits',
  selector: '#cta',
  elementInfo: { tag: 'button', text: 'Save' },
  changeRequest: {
    kind: shared.REQUEST_KIND_MUTATION,
    summary: 'Reject unsafe edits',
    requestedMutations: [
      {
        action: 'execute-script',
        target: { selectors: ['#cta'] },
        parameters: { text: 'alert(1)' }
      },
      {
        action: 'move',
        target: {},
        parameters: { deltaX: 20 }
      },
      {
        action: 'restyle',
        target: { selectors: ['#cta'] },
        parameters: {
          styles: {
            color: 'url(https://example.com/tracker.png)',
            position: 'fixed'
          }
        }
      }
    ]
  }
}, 'https://example.com/page', 'Example Page');

assert.equal(downgradedVisualEdit.changeRequest.kind, shared.REQUEST_KIND_VISUAL_SUGGESTION);
assert.deepEqual(downgradedVisualEdit.changeRequest.requestedMutations, []);

const emptyRewrite = shared.normalizeFeedbackItem({
  type: 'element',
  note: 'Clear the label',
  selector: '#label',
  elementInfo: { tag: 'span', text: 'Old label' },
  changeRequest: {
    kind: shared.REQUEST_KIND_MUTATION,
    summary: 'Clear the label',
    requestedMutations: [{
      action: 'rewrite',
      target: { selectors: ['#label'], tag: 'span' },
      parameters: { text: '' }
    }]
  }
}, 'https://example.com/page', 'Example Page');
assert.equal(emptyRewrite.changeRequest.kind, shared.REQUEST_KIND_MUTATION);
assert.equal(emptyRewrite.changeRequest.requestedMutations[0].parameters.text, '');

const normalizedInsert = shared.normalizeFeedbackItem({
  type: 'element',
  note: 'Help users understand the next step',
  selector: '#results',
  elementInfo: { tag: 'section', text: 'Results' },
  changeRequest: {
    kind: shared.REQUEST_KIND_MUTATION,
    summary: 'Help users understand the next step',
    requestedMutations: [{
      action: 'insert',
      target: { selectors: ['#results'], tag: 'section' },
      parameters: {
        placement: 'inside-end',
        content: {
          type: 'list',
          title: 'What happens next',
          body: 'Ignored duplicate body',
          items: ['Review the draft', '', 'Share with the team'],
          support: 'Explain the handoff workflow',
          unsafe: '<script>alert(1)</script>'
        }
      }
    }]
  }
}, 'https://example.com/page', 'Example Page');

assert.equal(normalizedInsert.changeRequest.kind, shared.REQUEST_KIND_MUTATION);
assert.deepEqual(normalizedInsert.changeRequest.requestedMutations[0].parameters, {
  placement: 'inside-end',
  content: {
    type: 'list',
    title: 'What happens next',
    body: 'Ignored duplicate body',
    support: 'Explain the handoff workflow',
    items: ['Review the draft', 'Share with the team']
  }
});
assert.equal(shared.MUTATION_ACTIONS.includes('insert'), true);

const markdown = shared.buildMarkdownExport('https://example.com/page', migratedItems, {
  exportedAt: '3/22/2026, 10:30:00 AM'
});
assert.equal(markdown.includes('Region Capture'), true);
assert.equal(markdown.includes('Move this annotation'), true);
assert.equal(markdown.includes('**Crop Stored:** yes'), true);
assert.equal(markdown.includes('button\\[data\\-action="save"\\]'), true);
assert.equal(markdown.includes('- [ ] Button aligns with the total'), true);

const escapedMarkdown = shared.buildMarkdownExport('https://example.com/<unsafe>', [{
  selector: '#unsafe',
  note: '<img src=x onerror=alert(1)>\n# injected heading',
  timestamp: '2026-07-18T12:00:00.000Z',
  elementInfo: { tag: 'button', text: '<script>alert(1)</script>' },
  position: { x: 0, y: 0 }
}], { exportedAt: '<unsafe date>' });
assert.equal(escapedMarkdown.includes('<img'), false);
assert.equal(escapedMarkdown.includes('<script>'), false);
assert.equal(escapedMarkdown.includes('&lt;img src=x onerror=alert\\(1\\)&gt;'), true);
assert.equal(escapedMarkdown.includes('\n# injected heading'), false);

const aiPrompt = shared.buildAiPromptExport('https://example.com/page', migratedItems);
assert.equal(aiPrompt.includes('Item 2'), true);
assert.equal(aiPrompt.includes('use Download AI Bundle for exact image files'), true);
assert.equal(aiPrompt.includes('Page URL: https://example.com/page'), true);
assert.equal(aiPrompt.includes('Requested change: Move this annotation'), true);
assert.equal(aiPrompt.includes('Acceptance: Button aligns with the total'), true);

const aiBundle = bundleBuilder.buildAiBundle([{ storageKey: 'dev-feedback-https://example.com', items: migratedItems }], {
  exportedAt: '2026-07-17T20:00:00.000Z'
});
assert.equal(aiBundle.filename, 'dev-feedback-ai-bundle-2026-07-17T20-00-00Z.zip');
assert.deepEqual(aiBundle.entryNames, [
  'prompt.md',
  'feedback.json',
  'page-context.json',
  'report.html',
  '02-before.png',
  '02-annotated.png'
]);
assert.equal(Buffer.from(aiBundle.bytes).readUInt32LE(0), 0x04034b50);
assert.equal(Buffer.from(aiBundle.bytes).includes(Buffer.from('Source: file:///C:/Docs/sample.pdf')), true);

const visualBundle = bundleBuilder.buildAiBundle([{ storageKey: 'dev-feedback-https://example.com', items: [normalizedVisualEdit] }], {
  exportedAt: '2026-07-18T12:00:00.000Z'
});
assert.deepEqual(visualBundle.entryNames, [
  'prompt.md',
  'feedback.json',
  'page-context.json',
  'report.html',
  '01-before.png',
  '01-proposed.png'
]);
const visualBundleBytes = Buffer.from(visualBundle.bytes);
assert.equal(visualBundleBytes.includes(Buffer.from('"schemaVersion": 3')), true);
assert.equal(visualBundleBytes.includes(Buffer.from('"schemaVersion": 2')), true);
assert.equal(visualBundleBytes.includes(Buffer.from('Requested mutation')), true);
assert.equal(visualBundleBytes.includes(Buffer.from('Acceptance criteria (unverified)')), true);
assert.equal(visualBundleBytes.includes(Buffer.from('data:image/png;base64,')), false);
assert.throws(() => bundleBuilder.createZipArchive([{ name: '../escape.txt', data: 'nope' }]), /Invalid ZIP entry name/);
assert.throws(() => bundleBuilder.buildAiBundle([{ storageKey: 'bad', items: [{
  ...migratedItems[1],
  screenshot: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,YmFkLWltYWdl' }
}] }]), /Invalid before image data/);
assert.throws(() => bundleBuilder.buildAiBundle([{ storageKey: 'truncated-png', items: [{
  ...migratedItems[1],
  screenshot: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
}] }]), /Invalid before image data/);
assert.throws(() => bundleBuilder.buildAiBundle([{ storageKey: 'truncated-jpeg', items: [{
  ...migratedItems[1],
  screenshot: { mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/' }
}] }]), /Invalid before image data/);
const validPngBytes = Buffer.from(migratedItems[1].screenshot.dataUrl.split(',')[1], 'base64');
const pngWithoutIdat = Buffer.concat([
  validPngBytes.subarray(0, 33),
  validPngBytes.subarray(validPngBytes.length - 12)
]);
assert.throws(() => bundleBuilder.buildAiBundle([{ storageKey: 'png-without-idat', items: [{
  ...migratedItems[1],
  screenshot: { mimeType: 'image/png', dataUrl: `data:image/png;base64,${pngWithoutIdat.toString('base64')}` }
}] }]), /Invalid before image data/);
assert.throws(() => bundleBuilder.buildAiBundle([{ storageKey: 'jpeg-markers-only', items: [{
  ...migratedItems[1],
  screenshot: { mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/2Q==' }
}] }]), /Invalid before image data/);
const emptyWebp = Buffer.alloc(20);
emptyWebp.write('RIFF', 0, 'ascii');
emptyWebp.writeUInt32LE(12, 4);
emptyWebp.write('WEBPVP8 ', 8, 'ascii');
assert.throws(() => bundleBuilder.buildAiBundle([{ storageKey: 'empty-webp', items: [{
  ...migratedItems[1],
  screenshot: { mimeType: 'image/webp', dataUrl: `data:image/webp;base64,${emptyWebp.toString('base64')}` }
}] }]), /Invalid before image data/);

assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
assert.equal(manifest.name, 'Dev Feedback Capture: AI UI Review & Prompts');
assert.equal(manifest.name.length, 44);
assert.equal(manifest.description, 'Pick webpage elements, write clear change requests, and export selected feedback for developers and coding agents.');
assert.equal(productJson.summary, 'Pick webpage elements and turn clear change requests into a local developer handoff.');
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.default,
  shared.SHORTCUT_LABEL
);
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.mac,
  shared.MAC_SHORTCUT_LABEL
);
assert.equal(packageJson.version, manifest.version);
assert.deepEqual(manifest.web_accessible_resources, [{ resources:['element.html','history.html'], matches:['<all_urls>'] }]);
assert.equal(productJson.distribution.assetNamePattern, 'dev-feedback-capture-v{version}.zip');
assert.equal(packageJson.scripts['verify:package'], 'node scripts/verify-package.cjs');
assert.match(ciWorkflow, /pull_request:/);
assert.match(ciWorkflow, /npm run verify:package/);
assert.match(releaseWorkflow, /\$ZIP_PATH\.sha256/);
assert.match(releaseWorkflow, /--generate-notes/);
assert.match(historySource, /schemaVersion: 1/);
assert.match(historyMarkup, /id="download-json">Send to Codex</);
assert.match(historySource, /dev-feedback-codex-inbox-/);
assert.match(historySource, /newest valid capture/);
assert.match(historySource, /function redactEvidenceRect/);
assert.match(historySource, /annotatedImages\.get\(item\.id\)/);
assert.match(backgroundSource, /files:/);
assert.doesNotMatch(popupSource, /capture-mode|Capture Region/);
assert.doesNotMatch(backgroundSource, /captureVisibleTab|windows\.create/);
assert.match(popupScriptSource, /History|history/i);
assert.doesNotMatch(stylesSource, /dev-feedback-visual-|dev-feedback-content-preview|visual-active|content-active/);

console.log('Test assertions passed.');
