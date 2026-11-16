// Install the current signed Safari Debug build into /Applications, keeping the previous copy until
// the new one verifies. Pass the build settings the signed build wrote:
//   node scripts/safari-install.cjs --build-settings .build/safari/build-settings.json
// It does not enable the extension or change Safari's website access; those stay with the user.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const APP_NAME = 'Dev Feedback Capture';
const APP_ID = 'app.stonehub.dev-feedback-capture';
const APPEX = `Contents/PlugIns/${APP_NAME} Extension.appex`;

const settingsIndex = process.argv.indexOf('--build-settings');
assert(settingsIndex > 0 && process.argv[settingsIndex + 1], 'Pass --build-settings with the JSON from the signed build.');
const settings = JSON.parse(fs.readFileSync(process.argv[settingsIndex + 1], 'utf8')).find(item => item.target === APP_NAME)?.buildSettings;
assert(settings, 'Build settings do not describe the Dev Feedback Capture app.');
const source = path.join(settings.TARGET_BUILD_DIR, settings.FULL_PRODUCT_NAME);
const destination = `/Applications/${APP_NAME}.app`;

assert(fs.existsSync(source) && !fs.lstatSync(source).isSymbolicLink(), 'Resolved build product is missing or a symlink.');
assert(!fs.existsSync(destination) || !fs.lstatSync(destination).isSymbolicLink(), 'Installed app is a symlink; inspect it before updating.');
assert(fs.realpathSync(source) !== (fs.existsSync(destination) ? fs.realpathSync(destination) : ''), 'Build is already the installed app.');
const team = signingTeam(source);
if (fs.existsSync(destination)) {
  assert(bundleId(destination) === APP_ID, 'Destination belongs to a different app.');
  assert(signingTeam(destination) === team, 'Signing team changed; review before replacing the installed app.');
}
const processes = capture('ps', ['-A', '-o', 'comm=']).split('\n');
assert(!processes.some(line => [source, destination].some(app => line.trim().startsWith(path.join(app, 'Contents/MacOS') + '/'))),
  'Quit Dev Feedback Capture before updating. Safari can stay open.');
validate(source);
const expected = treeHashes(source);

const stage = fs.mkdtempSync(path.join('/Applications', '.DevFeedbackCapture-install-'));
const prepared = path.join(stage, 'prepared.app');
const previous = path.join(stage, 'previous.app');
let keepStage = false;
try {
  run('ditto', [source, prepared]);
  assert(same(treeHashes(prepared), expected), 'Prepared copy differs from the checked build.');
  const hadPrevious = fs.existsSync(destination);
  if (hadPrevious) fs.renameSync(destination, previous);
  try {
    fs.renameSync(prepared, destination);
    assert(same(treeHashes(destination), expected), 'Installed files differ from the checked build.');
    validate(destination);
    run('pluginkit', ['-a', path.join(destination, APPEX)]);
  } catch (error) {
    try {
      fs.rmSync(destination, { recursive:true, force:true });
      if (hadPrevious) fs.renameSync(previous, destination);
    } catch {
      keepStage = true;
      throw new Error(`Rollback needs manual recovery. Previous app kept at ${previous}`);
    }
    throw error;
  }
  console.log(`Installed ${destination}: ${Object.keys(expected).length} files match the build, signature valid.`);
  // Safari would otherwise list the build product too; remove only this exact build's registration.
  // The install already succeeded, so a failure here is a warning, not an install error.
  if (spawnSync('pluginkit', ['-r', path.join(source, APPEX)], { stdio:'inherit' }).status !== 0) {
    console.warn(`Warning: could not unregister the build product at ${path.join(source, APPEX)}; Safari may list the extension twice.`);
  }
  // Safari can keep running the previous extension code until the extension is turned off and on.
  console.log('Open the app once. If the extension was already enabled, turn it off and on in Safari Settings > Extensions, then reload the test page.');
} finally {
  if (!keepStage) fs.rmSync(stage, { recursive:true, force:true });
}

function validate(app) {
  run('codesign', ['--verify', '--deep', '--strict', app]);
  assert(bundleId(app) === APP_ID && signingTeam(app) === team, 'App identity changed.');
  const extension = path.join(app, APPEX);
  assert(bundleId(extension) === `${APP_ID}.Extension` && signingTeam(extension) === team, 'Extension identity changed.');
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'Contents/Resources/manifest.json'), 'utf8'));
  assert(!manifest.host_permissions && !manifest.content_scripts, 'Website access widened; review before installing.');
}

function signingTeam(app) {
  const details = spawnSync('codesign', ['-d', '--verbose=4', app], { encoding:'utf8' }).stderr || '';
  const match = details.match(/^TeamIdentifier=(\S+)$/m);
  assert(match && match[1] !== 'not set', 'Install a build signed with your development team (safari:preview -- --xcconfig).');
  return match[1];
}

function bundleId(bundle) {
  return JSON.parse(capture('plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents/Info.plist')])).CFBundleIdentifier;
}

function treeHashes(root) {
  const result = {};
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      if (entry.isSymbolicLink()) result[relative] = `link:${fs.readlinkSync(full)}`;
      else if (entry.isDirectory()) walk(full);
      else result[relative] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(root);
  return result;
}

function same(left, right) {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding:'utf8', maxBuffer:64 * 1024 * 1024 });
  assert(result.status === 0, `${command} failed: ${result.stderr || result.error?.message}`);
  return result.stdout;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio:'inherit' });
  assert(result.status === 0, `${command} failed (exit ${result.status})`);
}

// Throws, so a failure after the swap still reaches the rollback above.
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
