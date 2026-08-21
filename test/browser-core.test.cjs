const assert = require('node:assert/strict');
const test = require('node:test');

const shared = require('../shared.js');
globalThis.DevFeedbackShared = shared;
const pageCapture = shared;

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Capture Record seam builds a canonical Element record', () => {
  const record = pageCapture.createElementRecord({
    id: 'element-capture-1',
    selector: 'button[data-action="save"]',
    pageUrl: 'https://example.test/settings?tab=profile',
    pageTitle: 'Settings',
    elementInfo: {
      tag: 'button',
      text: 'Save',
      classes: ['primary'],
      styles: { color: '#444', background: 'url(https://tracker.test/pixel)' }
    },
    position: { x: 24, y: 48 },
    pageContext: {
      url: 'https://example.test/settings?tab=profile',
      title: 'Settings',
      viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 120, devicePixelRatio: 2 }
    },
    note: 'Increase the button contrast',
    acceptance: ['The button passes contrast review'],
    timestamp: '2026-08-21T12:00:00.000Z'
  });

  assert.deepEqual(record, {
    specVersion: shared.FEEDBACK_SPEC_VERSION,
    id: 'element-capture-1',
    type: 'element',
    captureType: 'element',
    selector: 'button[data-action="save"]',
    pageUrl: 'https://example.test/settings?tab=profile',
    pageTitle: 'Settings',
    elementInfo: {
      tag: 'button',
      classes: ['primary'],
      text: 'Save',
      styles: { color: '#444' },
      role: '',
      surroundingText: '',
      parentLayout: {}
    },
    position: { x: 24, y: 48 },
    pageContext: {
      url: 'https://example.test/settings?tab=profile',
      title: 'Settings',
      sourceKind: 'web-page',
      viewport: {
        width: 1280,
        height: 800,
        scrollX: 0,
        scrollY: 120,
        devicePixelRatio: 2,
        zoom: 1
      },
      browser: { userAgent: '', language: '' }
    },
    changeRequest: {
      kind: 'visual-suggestion',
      summary: 'Increase the button contrast',
      requestedMutations: []
    },
    acceptance: ['The button passes contrast review'],
    note: 'Increase the button contrast',
    timestamp: '2026-08-21T12:00:00.000Z'
  });
});

test('Capture Record seam builds a Region/PDF record with evidence', () => {
  const record = pageCapture.createRegionRecord({
    id: 'region-capture-1',
    pageUrl: 'file:///Users/monroe/Documents/brief.pdf',
    pageTitle: 'brief.pdf',
    viewportRect: { x: 12, y: 18, width: 440, height: 280 },
    devicePixelRatio: 2,
    screenshot: { mimeType: 'image/png', dataUrl: PNG_DATA_URL },
    annotations: [{
      id: 'annotation-1',
      type: 'pin',
      point: { x: 80, y: 96 },
      number: 1,
      color: '#ff3b30'
    }],
    acceptance: ['The page heading aligns with the body copy'],
    pageContext: {
      url: 'file:///Users/monroe/Documents/brief.pdf',
      title: 'brief.pdf',
      viewport: { width: 1280, height: 800, scrollY: 10 }
    },
    tabContext: {
      url: 'file:///Users/monroe/Documents/brief.pdf',
      title: 'brief.pdf'
    },
    note: 'Align the page heading',
    timestamp: '2026-08-21T12:05:00.000Z'
  });

  assert.equal(record.type, 'region');
  assert.equal(record.captureType, 'region');
  assert.equal(record.sourceKind, 'pdf');
  assert.equal(record.screenshot.dataUrl, PNG_DATA_URL);
  assert.deepEqual(record.viewportRect, { x: 12, y: 18, width: 440, height: 280 });
  assert.equal(record.annotations[0].target, null);
  assert.deepEqual(record.acceptance, ['The page heading aligns with the body copy']);
});

test('Capture Record seam rejects records that cannot cross the interface', () => {
  assert.throws(
    () => pageCapture.createCaptureRecord({ type: 'element', note: 'missing selector' }),
    /valid element selector/
  );
  assert.throws(
    () => pageCapture.createCaptureRecord({ type: 'element', selector: '  ', note: 'empty selector' }),
    /valid element selector/
  );
  assert.throws(
    () => pageCapture.createCaptureRecord({ type: 'region', screenshot: {}, note: 'invalid evidence' }),
    /valid region evidence/
  );
  assert.throws(
    () => pageCapture.createCaptureRecord({ type: 'unknown', note: 'unsupported' }),
    /Unsupported capture type/
  );
});

test('legacy Visual and Add records remain readable through History normalization', () => {
  const visual = shared.normalizeFeedbackItem({
    id: 'legacy-visual',
    type: 'element',
    selector: '#save',
    pageUrl: 'https://example.test/',
    note: 'Make Save clearer',
    changeRequest: {
      kind: 'requested-mutation',
      summary: 'Make Save clearer',
      requestedMutations: [{
        action: 'restyle',
        target: { selectors: ['#save'], tag: 'button' },
        parameters: { styles: { color: '#111111' } }
      }]
    }
  });
  const add = shared.normalizeFeedbackItem({
    id: 'legacy-add',
    type: 'element',
    selector: '#content',
    pageUrl: 'https://example.test/',
    note: 'Add a notice',
    changeRequest: {
      kind: 'requested-mutation',
      summary: 'Add a notice',
      requestedMutations: [{
        action: 'insert',
        target: { selectors: ['#content'], tag: 'main' },
        parameters: {
          placement: 'inside-end',
          content: { type: 'text', title: 'Notice', body: 'Read this first' }
        }
      }]
    }
  });

  assert.equal(visual.changeRequest.requestedMutations[0].action, 'restyle');
  assert.equal(add.changeRequest.requestedMutations[0].action, 'insert');
  assert.equal(add.changeRequest.requestedMutations[0].parameters.content.title, 'Notice');
});
