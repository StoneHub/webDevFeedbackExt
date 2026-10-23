// Safari development preview: stage the Chrome release files unchanged, generate the
// Xcode project with Apple's converter once, and with --build compile it unsigned and
// check the packaged extension against the staged files. Everything stays under .build/.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const APP_NAME = 'Dev Feedback Capture';
const APP_ID = 'app.stonehub.dev-feedback-capture';
const EXTENSION_ID = `${APP_ID}.Extension`;
const buildDir = path.join(rootDir, '.build', 'safari');
const stagedDir = path.join(buildDir, 'extension');
const projectDir = path.join(buildDir, APP_NAME, `${APP_NAME}.xcodeproj`);
const pbxproj = path.join(projectDir, 'project.pbxproj');
const derivedData = path.join(buildDir, 'DerivedData');
const version = require(path.join(rootDir, 'package.json')).version;

run(process.execPath, [path.join(rootDir, 'scripts', 'package-extension.cjs')]);
fs.rmSync(stagedDir, { recursive: true, force: true });
fs.mkdirSync(stagedDir, { recursive: true });
run('unzip', ['-q', path.join(rootDir, 'dist', `dev-feedback-capture-v${version}.zip`), '-d', stagedDir]);

// The project references the staged files in place, so restaging refreshes the next build.
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
console.log(`Safari project ready: ${path.relative(rootDir, projectDir)}`);

if (process.argv.includes('--build')) {
  run('xcodebuild', ['-project', projectDir, '-scheme', APP_NAME, '-configuration', 'Debug',
    '-derivedDataPath', derivedData, 'CODE_SIGNING_ALLOWED=NO', 'build'], { quiet: true });
  const app = path.join(derivedData, 'Build', 'Products', 'Debug', `${APP_NAME}.app`);
  const appex = path.join(app, 'Contents', 'PlugIns', `${APP_NAME} Extension.appex`);
  assert(plist(app).CFBundleIdentifier === APP_ID, 'App bundle identifier changed');
  assert(plist(appex).CFBundleIdentifier === EXTENSION_ID, 'Extension bundle identifier changed');
  assert(plist(appex).NSExtension?.NSExtensionPointIdentifier === 'com.apple.Safari.web-extension', 'Not a Safari web extension');
  const resources = path.join(appex, 'Contents', 'Resources');
  const staged = fs.readdirSync(stagedDir).sort();
  for (const file of staged) {
    assert(fs.readFileSync(path.join(resources, file)).equals(fs.readFileSync(path.join(stagedDir, file))), `Packaged ${file} differs from the release file`);
  }
  console.log(`Unsigned build ok: ${path.relative(rootDir, app)} (${staged.length} extension files match the release package)`);
}

function plist(bundle) {
  const result = spawnSync('plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')], { encoding: 'utf8' });
  assert(result.status === 0, `Could not read ${bundle}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function run(command, args, { quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.error?.message || `exit ${result.status}`})\n${(result.stdout || '').slice(-4000)}${result.stderr || ''}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
