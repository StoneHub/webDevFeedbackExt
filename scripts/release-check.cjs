const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const productJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'product.json'), 'utf8'));
const shared = require(path.join(rootDir, 'shared.js'));

const requiredFiles = [
  'background.js',
  'capture.html',
  'capture.js',
  'content.js',
  'history.css',
  'history.html',
  'history.js',
  'manifest.json',
  'popup.html',
  'popup.js',
  'shared.js',
  'styles.css',
  'icon16.png',
  'icon48.png',
  'icon128.png'
];

const shippedJavaScriptFiles = [
  'background.js',
  'capture.js',
  'content.js',
  'history.js',
  'popup.js',
  'shared.js'
];

requiredFiles.forEach((file) => {
  const absolutePath = path.join(rootDir, file);
  assert.equal(fs.existsSync(absolutePath), true, `Missing required release file: ${file}`);
});

shippedJavaScriptFiles.forEach((file) => {
  const result = spawnSync(process.execPath, ['--check', path.join(rootDir, file)], {
    encoding: 'utf8'
  });

  assert.equal(
    result.status,
    0,
    `Syntax check failed for ${file}:\n${result.stderr || result.stdout}`
  );
});

assert.equal(packageJson.version, manifest.version);
assert.equal(manifest.background.service_worker, 'background.js');
assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
assert.equal(Array.isArray(manifest.content_scripts), false);
assert.equal(Array.isArray(manifest.web_accessible_resources), false);
assert.equal(manifest.commands['toggle-feedback-mode'].suggested_key.default, shared.SHORTCUT_LABEL);
assert.equal(manifest.commands['toggle-feedback-mode'].suggested_key.mac, shared.MAC_SHORTCUT_LABEL);
assert.equal(productJson.releaseUrl, 'https://github.com/StoneHub/webDevFeedbackExt/releases');
assert.equal(productJson.distribution.latestReleaseApi, 'https://api.github.com/repos/StoneHub/webDevFeedbackExt/releases/latest');
assert.equal(productJson.distribution.assetNamePattern, 'dev-feedback-capture-v{version}.zip');

console.log('Release check passed.');
