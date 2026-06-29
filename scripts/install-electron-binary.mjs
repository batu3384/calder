#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const pathFile = path.join(electronDir, 'path.txt');
const distDir = path.join(electronDir, 'dist');

function electronReady() {
  if (!existsSync(pathFile)) {
    return false;
  }
  const relativePath = readFileSync(pathFile, 'utf8').trim();
  return existsSync(path.join(distDir, relativePath));
}

if (electronReady()) {
  console.log('[install-electron-binary] Electron binary already present');
  process.exit(0);
}

try {
  rmSync(pathFile, { force: true });
  rmSync(distDir, { recursive: true, force: true });
} catch {
  // ignore cleanup errors
}

const result = spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    force_no_cache: 'true',
  },
});

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

if (!electronReady()) {
  console.error('[install-electron-binary] Electron install finished but binary is still missing');
  process.exit(1);
}

console.log('[install-electron-binary] Electron binary installed');
