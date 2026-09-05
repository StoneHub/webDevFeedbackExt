const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const productJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'product.json'), 'utf8'));
const license = fs.readFileSync(path.join(rootDir, 'LICENSE'), 'utf8');
const shared = require(path.join(rootDir, 'shared.js'));

const requiredFiles = [
  'element.html',
  'ai-bundle.js',
  'background.js',
  'capture.html',
  'capture.js',
  'content.js',
  'collector.js',
  'element.js',
  'editor-dialog.js',
  'history.css',
  'history.html',
  'history.js',
  'manifest.json',
  'popup.html',
  'popup.js',
  'shared.js',
  'styles.css',
  'mcp/cli.mjs',
  'mcp/server.mjs',
  'mcp/store.mjs',
  'docs/mcp-local-agent.md',
  'docs/manual-release-checklist.md',
  'CONTEXT.md',
  'docs/agents/issue-tracker.md',
  'docs/agents/triage-labels.md',
  'docs/agents/domain.md',
  'icon16.png',
  'icon48.png',
  'icon128.png'
];

const shippedJavaScriptFiles = [
  'ai-bundle.js',
  'background.js',
  'capture.js',
  'content.js',
  'collector.js',
  'element.js',
  'editor-dialog.js',
  'history.js',
  'popup.js',
  'shared.js'
];

const companionJavaScriptFiles = [
  'mcp/cli.mjs',
  'mcp/server.mjs',
  'mcp/store.mjs'
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

companionJavaScriptFiles.forEach((file) => {
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
assert.equal(packageJson.license, 'MIT');
assert.match(license, /^MIT License/);
assert.equal(manifest.name, 'Dev Feedback Capture: AI UI Review & Prompts');
assert.ok(manifest.name.length <= 45, 'Manifest name exceeds the Chrome Web Store limit');
assert.equal(manifest.description, 'Pick elements and annotate regions. Export AI-ready prompts and region evidence for developers.');
assert.ok(manifest.description.length <= 132, 'Manifest description exceeds the Chrome Web Store limit');
assert.equal(productJson.summary, 'Capture browser elements or regions and send local, structured feedback to a coding agent.');
assert.equal(manifest.background.service_worker, 'background.js');
assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
assert.equal(Array.isArray(manifest.content_scripts), false);
assert.deepEqual(manifest.web_accessible_resources, [{ resources:['element.html','capture.html'], matches:['<all_urls>'] }]);
assert.equal(manifest.commands['toggle-feedback-mode'].suggested_key.default, shared.SHORTCUT_LABEL);
assert.equal(manifest.commands['toggle-feedback-mode'].suggested_key.mac, shared.MAC_SHORTCUT_LABEL);
assert.equal(productJson.releaseUrl, 'https://github.com/StoneHub/webDevFeedbackExt/releases');
assert.equal(productJson.distribution.latestReleaseApi, 'https://api.github.com/repos/StoneHub/webDevFeedbackExt/releases/latest');
assert.equal(productJson.distribution.assetNamePattern, 'dev-feedback-capture-v{version}.zip');
assert.equal(packageJson.dependencies['@modelcontextprotocol/sdk'], '1.29.0');
assert.equal(packageJson.dependencies.zod, '4.4.3');
assert.equal(packageJson.scripts['test:mcp'], 'node --test test/mcp.test.mjs');
assert.equal(packageJson.scripts.mcp, 'node mcp/cli.mjs');

console.log('Release check passed.');
