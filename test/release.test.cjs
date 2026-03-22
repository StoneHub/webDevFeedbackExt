const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shared = require('../shared.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

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
      dataUrl: 'data:image/png;base64,abc123'
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
assert.equal(migratedItems[1].type, 'region');
assert.equal(migratedItems[1].captureType, 'region');
assert.equal(migratedItems[1].sourceKind, 'pdf');

const markdown = shared.buildMarkdownExport('https://example.com/page', migratedItems, {
  exportedAt: '3/22/2026, 10:30:00 AM'
});
assert.equal(markdown.includes('Region Capture'), true);
assert.equal(markdown.includes('Move this annotation'), true);
assert.equal(markdown.includes('**Crop Stored:** yes'), true);

const aiPrompt = shared.buildAiPromptExport('https://example.com/page', migratedItems);
assert.equal(aiPrompt.includes('Item 2'), true);
assert.equal(aiPrompt.includes('Reference crop: item 2 saved image'), true);
assert.equal(aiPrompt.includes('Requested change: Move this annotation'), true);

assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.default,
  shared.SHORTCUT_LABEL
);
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.mac,
  shared.MAC_SHORTCUT_LABEL
);

console.log('Test assertions passed.');
