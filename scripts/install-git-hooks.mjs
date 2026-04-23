#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readdirSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const HOOKS_DIR = '.githooks';

function run(cmd) {
  return execSync(cmd, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ensureExecutableHooks() {
  const hooksPath = join(process.cwd(), HOOKS_DIR);
  const entries = readdirSync(hooksPath);
  for (const entry of entries) {
    const fullPath = join(hooksPath, entry);
    const stats = statSync(fullPath);
    if (!stats.isFile()) {
      continue;
    }
    chmodSync(fullPath, 0o755);
  }
}

function main() {
  try {
    run('git rev-parse --is-inside-work-tree');
  } catch {
    console.error('[hooks:install] Not inside a git repository.');
    process.exit(1);
  }

  try {
    run(`git config --local core.hooksPath ${HOOKS_DIR}`);
    ensureExecutableHooks();
    const current = run('git config --local --get core.hooksPath');
    console.log(`[hooks:install] Installed. core.hooksPath=${current}`);
  } catch (error) {
    console.error('[hooks:install] Failed to install git hooks.');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

main();
