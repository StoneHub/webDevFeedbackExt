const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const packageJson = readJson(path.join(rootDir, 'package.json'));
const expectedFiles = [
  'ai-bundle.js',
  'background.js',
  'content.js',
  'collector.js',
  'element.js',
  'editor-dialog.js',
  'element.html',
  'element.css',
  'history.css',
  'history.html',
  'history.js',
  'icon16.png',
  'icon48.png',
  'icon128.png',
  'manifest.json',
  'popup.html',
  'popup.js',
  'shared.js',
  'styles.css'
].sort();
const defaultZip = path.join(rootDir, 'dist', `dev-feedback-capture-v${packageJson.version}.zip`);
const zipPath = path.resolve(process.argv[2] || defaultZip);

assert.equal(fs.existsSync(zipPath), true, `Package not found: ${zipPath}`);

const testResult = runUnzip(['-t', zipPath]);
assert.equal(testResult.status, 0, `Zip integrity check failed:\n${testResult.stderr || testResult.stdout}`);

const listResult = runUnzip(['-Z1', zipPath]);
assert.equal(listResult.status, 0, `Could not list zip contents:\n${listResult.stderr || listResult.stdout}`);
const packagedFiles = listResult.stdout.split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(packagedFiles, expectedFiles, 'Zip contents differ from the expected extension release files');

const manifestResult = runUnzip(['-p', zipPath, 'manifest.json']);
assert.equal(manifestResult.status, 0, `Could not read packaged manifest:\n${manifestResult.stderr}`);
const packagedManifest = JSON.parse(manifestResult.stdout);
assert.equal(packagedManifest.version, packageJson.version, 'Packaged manifest version does not match package.json');

const digest = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
const checksumPath = `${zipPath}.sha256`;
fs.writeFileSync(checksumPath, `${digest}  ${path.basename(zipPath)}\n`);

console.log(`Verified ${path.relative(rootDir, zipPath)} (${packagedFiles.length} files)`);
console.log(`SHA-256 ${digest}`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runUnzip(args) {
  const result = spawnSync('unzip', args, { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('Package verification requires the standard unzip command');
  }
  return result;
}
