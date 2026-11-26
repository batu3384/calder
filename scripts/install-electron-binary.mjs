#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const installScript = path.join(electronDir, 'install.js');
const pathFile = path.join(electronDir, 'path.txt');
const distDir = path.join(electronDir, 'dist');
const maxAttempts = 3;
const retryDelaysMs = [2_000, 5_000];

function electronReady() {
  if (!existsSync(pathFile)) {
    return false;
  }
  const relativePath = readFileSync(pathFile, 'utf8').trim();
  return existsSync(path.join(distDir, relativePath));
}

function cleanIncompleteInstall() {
  try {
    rmSync(pathFile, { force: true });
    rmSync(distDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (electronReady()) {
  console.log('[install-electron-binary] Electron binary already present');
  process.exit(0);
}

if (!existsSync(installScript)) {
  console.error('[install-electron-binary] Electron package is missing; run npm ci first');
  process.exit(1);
}

let lastStatus = 1;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  cleanIncompleteInstall();
  if (attempt > 1) {
    console.log(`[install-electron-binary] Retry ${attempt}/${maxAttempts}`);
  }

  const result = spawnSync(process.execPath, [installScript], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      force_no_cache: 'true',
    },
  });

  lastStatus = result.status ?? 1;
  if (lastStatus === 0 && electronReady()) {
    console.log('[install-electron-binary] Electron binary installed');
    process.exit(0);
  }

  if (result.error) {
    console.error('[install-electron-binary] Installer failed to start:', result.error);
  } else if (lastStatus === 0) {
    console.error('[install-electron-binary] Installer exited cleanly but binary is missing');
  }

  const delay = retryDelaysMs[attempt - 1];
  if (attempt < maxAttempts && delay) {
    await sleep(delay);
  }
}

console.error(
  `[install-electron-binary] Electron binary install failed after ${maxAttempts} attempts`,
);
process.exit(lastStatus || 1);
