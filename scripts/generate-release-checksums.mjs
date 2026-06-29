#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const checksumsPath = path.join(root, 'bin', 'release-checksums.json');

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

const assetsDir = process.argv[2];
if (!assetsDir) {
  console.error('Usage: node scripts/generate-release-checksums.mjs <release-assets-dir>');
  process.exit(1);
}

const entries = {};
for (const assetName of process.argv.slice(3)) {
  const assetPath = path.join(assetsDir, assetName);
  entries[assetName] = sha256File(assetPath);
  console.log(`${assetName}: ${entries[assetName]}`);
}

let checksums = {};
try {
  checksums = JSON.parse(readFileSync(checksumsPath, 'utf8'));
} catch {
  checksums = {};
}

checksums[version] = {
  ...(checksums[version] ?? {}),
  ...entries,
};

writeFileSync(checksumsPath, `${JSON.stringify(checksums, null, 2)}\n`);
console.log(`Updated ${checksumsPath} for v${version}`);
