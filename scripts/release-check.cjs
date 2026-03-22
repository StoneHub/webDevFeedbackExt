const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const rootDir = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const shared = require(path.join(rootDir, 'shared.js'));

const requiredFiles = [
  'background.js',
  'capture.html',
  'capture.js',
  'content.js',
  'manifest.json',
  'popup.html',
  'popup.js',
  'shared.js',
  'styles.css',
  'icon16.png',
  'icon48.png',
  'icon128.png'
];

requiredFiles.forEach((file) => {
  const absolutePath = path.join(rootDir, file);
  assert.equal(fs.existsSync(absolutePath), true, `Missing required release file: ${file}`);
});

assert.equal(manifest.background.service_worker, 'background.js');
assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
assert.equal(Array.isArray(manifest.content_scripts), false);
assert.equal(manifest.commands['toggle-feedback-mode'].suggested_key.default, shared.SHORTCUT_LABEL);
assert.equal(manifest.commands['toggle-feedback-mode'].suggested_key.mac, shared.MAC_SHORTCUT_LABEL);

console.log('Release check passed.');
