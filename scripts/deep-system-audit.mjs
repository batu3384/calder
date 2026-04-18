#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runStep(step) {
  console.log(`\n[deep-audit] ${step.name}`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.error) {
    console.error(`[deep-audit] ${step.name} failed with error:`, result.error);
    return false;
  }
  if ((result.status ?? 1) !== 0) {
    console.error(`[deep-audit] ${step.name} failed with exit code ${result.status}`);
    return false;
  }

  console.log(`[deep-audit] ${step.name} passed`);
  return true;
}

const steps = [
  { name: 'Clear Vitest cache', cmd: NPX, args: ['vitest', '--clearCache'] },
  { name: 'Main test suite', cmd: NPM, args: ['test'] },
  { name: 'Shuffle seed 1', cmd: NPX, args: ['vitest', 'run', '--sequence.shuffle', '--sequence.seed', '1'] },
  { name: 'Shuffle seed 42', cmd: NPX, args: ['vitest', 'run', '--sequence.shuffle', '--sequence.seed', '42'] },
  { name: 'Shuffle seed 2026', cmd: NPX, args: ['vitest', 'run', '--sequence.shuffle', '--sequence.seed', '2026'] },
  { name: 'Coverage suite', cmd: NPM, args: ['run', 'test:coverage'] },
  { name: 'Build', cmd: NPM, args: ['run', 'build'] },
  { name: 'Production dependency audit', cmd: NPM, args: ['audit', '--omit=dev'] },
  { name: 'Dead code scan (Knip)', cmd: NPX, args: ['knip', '--reporter', 'compact'] },
];

let failed = false;
for (const step of steps) {
  const ok = runStep(step);
  if (!ok) {
    failed = true;
    break;
  }
}

if (failed) {
  console.error('\n[deep-audit] FAILED');
  process.exit(1);
}

console.log('\n[deep-audit] ALL CHECKS PASSED');
