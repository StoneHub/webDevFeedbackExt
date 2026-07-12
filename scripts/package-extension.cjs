const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const packageJson = readJson(path.join(rootDir, 'package.json'));
const manifest = readJson(path.join(rootDir, 'manifest.json'));
const version = packageJson.version;
const distDir = path.join(rootDir, 'dist');
const zipName = `dev-feedback-capture-v${version}.zip`;
const outputPath = path.join(distDir, zipName);

const extensionFiles = [
  'background.js',
  'capture.html',
  'capture.js',
  'content.js',
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
];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

if (manifest.version !== version) {
  throw new Error(`package.json version ${version} does not match manifest.json version ${manifest.version}`);
}

for (const file of extensionFiles) {
  const absolutePath = path.join(rootDir, file);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing extension file: ${file}`);
  }
}

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(outputPath)) {
  fs.rmSync(outputPath);
}

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-feedback-capture-'));

try {
  for (const file of extensionFiles) {
    fs.copyFileSync(path.join(rootDir, file), path.join(stagingDir, file));
  }

  if (hasSystemZip()) {
    createWithSystemZip(stagingDir, outputPath, extensionFiles);
  } else {
    createStoredZip(stagingDir, outputPath, extensionFiles);
  }
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

const size = fs.statSync(outputPath).size;
console.log(`Created ${path.relative(rootDir, outputPath)} (${size} bytes)`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasSystemZip() {
  const result = spawnSync('zip', ['--version'], { encoding: 'utf8', stdio: 'ignore' });
  return result.status === 0;
}

function createWithSystemZip(sourceDir, destination, files) {
  const result = spawnSync('zip', ['-q', '-r', destination, ...files], {
    cwd: sourceDir,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit ${result.status}`;
    throw new Error(`zip command failed: ${detail}`);
  }
}

function createStoredZip(sourceDir, destination, files) {
  const localFileRecords = [];
  const centralDirectoryRecords = [];
  let offset = 0;

  for (const file of files) {
    const data = fs.readFileSync(path.join(sourceDir, file));
    const name = Buffer.from(file, 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localFileRecords.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralDirectoryRecords.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralDirectoryRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(destination, Buffer.concat([...localFileRecords, centralDirectory, end]));
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}
