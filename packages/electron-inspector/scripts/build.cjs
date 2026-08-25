'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const source = path.join(repositoryRoot, 'shared.js');
const vendorRoot = path.join(packageRoot, 'vendor');
const destination = path.join(vendorRoot, 'capture-record.cjs');

fs.mkdirSync(vendorRoot, { recursive: true });
fs.copyFileSync(source, destination);
