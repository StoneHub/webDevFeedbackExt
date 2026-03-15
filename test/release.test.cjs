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

assert.deepEqual(manifest.host_permissions, shared.SUPPORTED_MATCH_PATTERNS);
assert.deepEqual(manifest.content_scripts[0].matches, shared.SUPPORTED_MATCH_PATTERNS);
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.default,
  shared.SHORTCUT_LABEL
);
assert.equal(
  manifest.commands['toggle-feedback-mode'].suggested_key.mac,
  shared.MAC_SHORTCUT_LABEL
);

console.log('Test assertions passed.');
