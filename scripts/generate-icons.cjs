const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'icon-source.svg'), 'utf8');

async function main() {
  for (const size of [16, 48, 128]) {
    // Keep Store padding at 128px; use the approved tighter toolbar framing.
    const svg = size < 128
      ? source.replace('viewBox="0 0 128 128"', 'viewBox="12 12 104 104"')
      : source;
    await sharp(Buffer.from(svg)).resize(size, size).png()
      .toFile(path.join(root, `icon${size}.png`));
    console.log(`Generated icon${size}.png`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
