// Safari development preview: stage the Chrome release files plus Safari's platform file and
// manifest changes, generate the Xcode project with Apple's converter, replace its echo handler
// with safari/*.swift, and with --build compile Debug and Release unsigned and check both bundles.
// --xcconfig <private file> builds a signed Debug instead, for scripts/safari-install.cjs.
// Everything generated stays under the ignored .build/safari/.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const APP_NAME = 'Dev Feedback Capture';
const APP_ID = 'app.stonehub.dev-feedback-capture';
const EXTENSION_ID = `${APP_ID}.Extension`;
const PERMISSIONS = ['storage', 'activeTab', 'scripting', 'nativeMessaging'];
const BACKGROUND_SCRIPTS = ['shared.js', 'safari-platform.js', 'background.js'];
const buildDir = path.join(rootDir, '.build', 'safari');
const stagedDir = path.join(buildDir, 'extension');
const generatedDir = path.join(buildDir, APP_NAME);
const projectDir = path.join(generatedDir, `${APP_NAME}.xcodeproj`);
const pbxproj = path.join(projectDir, 'project.pbxproj');
const handler = path.join(generatedDir, `${APP_NAME} Extension`, 'SafariWebExtensionHandler.swift');
const derivedData = path.join(buildDir, 'DerivedData');
const buildSettingsFile = path.join(buildDir, 'build-settings.json');
const version = require(path.join(rootDir, 'package.json')).version;
const xcconfigIndex = process.argv.indexOf('--xcconfig');
const xcconfig = xcconfigIndex > 0 ? path.resolve(process.argv[xcconfigIndex + 1] || '') : '';

run(process.execPath, [path.join(rootDir, 'scripts', 'package-extension.cjs')]);
fs.rmSync(stagedDir, { recursive: true, force: true });
fs.mkdirSync(stagedDir, { recursive: true });
run('unzip', ['-q', path.join(rootDir, 'dist', `dev-feedback-capture-v${version}.zip`), '-d', stagedDir]);

// Safari's only differences: native messaging, and a nonpersistent background page that loads the
// platform file first, the pattern Apple documents and Safari runs with the containing app closed.
fs.copyFileSync(path.join(rootDir, 'safari', 'platform.js'), path.join(stagedDir, 'safari-platform.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(stagedDir, 'manifest.json'), 'utf8'));
manifest.permissions = [...manifest.permissions, 'nativeMessaging'];
manifest.background = { scripts:BACKGROUND_SCRIPTS, persistent:false };
fs.writeFileSync(path.join(stagedDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const staged = fs.readdirSync(stagedDir).sort();

// The project references the staged files in place, so restaging refreshes the next build. A project
// generated before a file was added would leave it out, so regenerate it.
if (fs.existsSync(pbxproj) && !staged.every(file => fs.readFileSync(pbxproj, 'utf8').includes(`path = ../../extension/${file};`))) {
  console.log('Staged files changed; regenerating the Safari project.');
  fs.rmSync(generatedDir, { recursive: true, force: true });
}
if (!fs.existsSync(pbxproj)) {
  run('xcrun', ['safari-web-extension-converter', stagedDir, '--macos-only', '--swift', '--no-open', '--no-prompt',
    '--project-location', buildDir, '--app-name', APP_NAME, '--bundle-identifier', APP_ID]);
}

// Safari 27's converter capitalizes the app identifier from the app name, but the
// embedded extension keeps the requested prefix; Xcode refuses a mismatched pair.
const project = fs.readFileSync(pbxproj, 'utf8').replace(/PRODUCT_BUNDLE_IDENTIFIER = "([^"]+)";/g, (line, id) =>
  id.toLowerCase() === APP_ID.toLowerCase() ? `PRODUCT_BUNDLE_IDENTIFIER = "${APP_ID}";` : line);
fs.writeFileSync(pbxproj, project);
const ids = [...new Set([...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "([^"]+)";/g)].map(match => match[1]))].sort();
assert(JSON.stringify(ids) === JSON.stringify([APP_ID, EXTENSION_ID]), `Unexpected bundle identifiers: ${ids.join(', ')}`);

// The converter's handler only echoes; the project compiles that one file, so it gets both sources.
assert(fs.existsSync(handler) && !fs.lstatSync(handler).isSymbolicLink(), 'Generated native handler is missing.');
const nativeSource = ['NativeBridge.swift', 'SafariWebExtensionHandler.swift']
  .map(file => fs.readFileSync(path.join(rootDir, 'safari', file), 'utf8')).join('\n');
if (fs.readFileSync(handler, 'utf8') !== nativeSource) fs.writeFileSync(handler, nativeSource);
console.log(`Safari project ready: ${path.relative(rootDir, projectDir)}`);

if (xcconfig) {
  assert(fs.existsSync(xcconfig), 'Pass the path to your private signing .xcconfig after --xcconfig.');
  const args = buildArgs('Debug', ['-xcconfig', xcconfig]);
  run('xcodebuild', [...args, 'build'], { quiet:true });
  const settings = capture('xcodebuild', [...args, '-showBuildSettings', '-json']);
  fs.writeFileSync(buildSettingsFile, settings);
  const app = productPath(JSON.parse(settings));
  checkBundle(app);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  for (const bundle of [app, appexPath(app)]) {
    const entitlements = capture('codesign', ['-d', '--entitlements', ':-', bundle]);
    assert(/<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\/>/.test(entitlements), `${path.basename(bundle)} is not sandboxed`);
  }
  console.log(`Signed Debug build ok: ${path.relative(rootDir, app)}. Install with: node scripts/safari-install.cjs --build-settings ${path.relative(rootDir, buildSettingsFile)}`);
} else if (process.argv.includes('--build')) {
  for (const configuration of ['Debug', 'Release']) {
    const args = buildArgs(configuration, ['CODE_SIGNING_ALLOWED=NO']);
    run('xcodebuild', [...args, 'build'], { quiet:true });
    const app = productPath(JSON.parse(capture('xcodebuild', [...args, '-showBuildSettings', '-json'])));
    checkBundle(app);
    console.log(`Unsigned ${configuration} build ok: ${path.relative(rootDir, app)} (${staged.length} extension files match the staged package)`);
  }
}

function buildArgs(configuration, extra) {
  return ['-project', projectDir, '-scheme', APP_NAME, '-configuration', configuration, '-destination', 'platform=macOS',
    '-derivedDataPath', derivedData, ...extra];
}

function productPath(settings) {
  const values = settings.find(item => item.target === APP_NAME).buildSettings;
  return path.join(values.TARGET_BUILD_DIR, values.FULL_PRODUCT_NAME);
}

function appexPath(app) {
  return path.join(app, 'Contents', 'PlugIns', `${APP_NAME} Extension.appex`);
}

// Identity, extension point, exact resources, Safari permissions, and the reviewed native handler.
function checkBundle(app) {
  const appex = appexPath(app);
  assert(plist(app).CFBundleIdentifier === APP_ID, 'App bundle identifier changed');
  assert(plist(appex).CFBundleIdentifier === EXTENSION_ID, 'Extension bundle identifier changed');
  assert(plist(appex).NSExtension?.NSExtensionPointIdentifier === 'com.apple.Safari.web-extension', 'Not a Safari web extension');
  const resources = path.join(appex, 'Contents', 'Resources');
  for (const file of staged) {
    assert(fs.readFileSync(path.join(resources, file)).equals(fs.readFileSync(path.join(stagedDir, file))), `Packaged ${file} differs from the staged file`);
  }
  const packaged = JSON.parse(fs.readFileSync(path.join(resources, 'manifest.json'), 'utf8'));
  assert(JSON.stringify(packaged.permissions) === JSON.stringify(PERMISSIONS), `Unexpected permissions: ${packaged.permissions}`);
  assert(!packaged.host_permissions && !packaged.content_scripts, 'Safari build must not gain static website access');
  assert(JSON.stringify(packaged.background) === JSON.stringify({ scripts:BACKGROUND_SCRIPTS, persistent:false }), 'Unexpected background');
  // Debug builds keep the code in a .debug.dylib beside the executable.
  const macos = path.join(appex, 'Contents', 'MacOS');
  const binary = fs.readdirSync(macos).map(file => fs.readFileSync(path.join(macos, file)).toString('latin1')).join('');
  // Swift stores literals of 15 bytes or fewer inline, so look for the bridge's longer ones.
  for (const literal of ['app.stonehub.dev-feedback-capture/History', 'Saved notes could not be read or written.']) assert(binary.includes(literal), 'Native bridge is not compiled in');
  assert(!binary.includes('Received message from browser.runtime.sendNativeMessage'), 'Converter echo handler is still compiled');
}

function plist(bundle) {
  return JSON.parse(capture('plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')]));
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd:rootDir, encoding:'utf8', maxBuffer:64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed (${result.error?.message || `exit ${result.status}`})\n${(result.stderr || '').slice(-4000)}`);
  return result.stdout;
}

function run(command, args, { quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit', maxBuffer:64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.error?.message || `exit ${result.status}`})\n${(result.stdout || '').slice(-4000)}${result.stderr || ''}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
