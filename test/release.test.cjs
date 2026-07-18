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
const historySource = fs.readFileSync(path.join(__dirname, '..', 'history.js'), 'utf8');
const captureSource = fs.readFileSync(path.join(__dirname, '..', 'capture.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

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
assert.equal(migratedItems[1].type, 'region');
assert.equal(migratedItems[1].captureType, 'region');
assert.equal(migratedItems[1].sourceKind, 'pdf');
assert.equal(migratedItems[1].annotations.length, 1);
assert.equal(migratedItems[1].annotations[0].target.selectors[0], 'button[data-action="save"]');
assert.deepEqual(migratedItems[1].acceptance, ['Button aligns with the total']);
assert.equal(migratedItems[1].pageContext.viewport.scrollY, 100);

const markdown = shared.buildMarkdownExport('https://example.com/page', migratedItems, {
  exportedAt: '3/22/2026, 10:30:00 AM'
});
assert.equal(markdown.includes('Region Capture'), true);
assert.equal(markdown.includes('Move this annotation'), true);
assert.equal(markdown.includes('**Crop Stored:** yes'), true);
assert.equal(markdown.includes('button[data-action="save"]'), true);
assert.equal(markdown.includes('- [ ] Button aligns with the total'), true);

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
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.default,
  shared.SHORTCUT_LABEL
);
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.mac,
  shared.MAC_SHORTCUT_LABEL
);
assert.equal(packageJson.version, manifest.version);
assert.equal(Array.isArray(manifest.web_accessible_resources), false);
assert.equal(productJson.distribution.assetNamePattern, 'dev-feedback-capture-v{version}.zip');
assert.equal(packageJson.scripts['verify:package'], 'node scripts/verify-package.cjs');
assert.match(ciWorkflow, /pull_request:/);
assert.match(ciWorkflow, /npm run verify:package/);
assert.match(releaseWorkflow, /\$ZIP_PATH\.sha256/);
assert.match(releaseWorkflow, /--generate-notes/);
assert.match(historySource, /schemaVersion: 1/);
assert.match(captureSource, /fillStyle = '#191919'/);
assert.doesNotMatch(captureSource, /function pixelateRect/);
assert.match(historySource, /function redactEvidenceRect/);
assert.match(historySource, /annotatedImages\.get\(item\.id\)/);
assert.match(contentSource, /classList\.add\('collapsed'\)/);
assert.match(contentSource, /aria-expanded="false"/);

console.log('Test assertions passed.');
