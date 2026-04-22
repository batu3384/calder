#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN_TRACKED_PREFIXES = [
  '.codex-ui-backups/',
  '.superpowers/',
  '.tmp-home-ui/',
  '.tmp-ui/',
  '.worktrees/',
];

const DIRECT_FILE_BUDGETS = [
  { dir: 'src/main', max: 185 },
  { dir: 'src/renderer', max: 110 },
  { dir: 'src/renderer/components', max: 190 },
];

function getTrackedFiles() {
  const output = execSync('git ls-files -z', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.split('\u0000').filter(Boolean);
}

function countDirectFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}

function main() {
  const trackedFiles = getTrackedFiles().filter((file) => existsSync(join(process.cwd(), file)));
  const violations = [];

  for (const prefix of FORBIDDEN_TRACKED_PREFIXES) {
    const matches = trackedFiles.filter((file) => file.startsWith(prefix));
    if (matches.length > 0) {
      violations.push({
        type: 'forbidden-tracked-prefix',
        subject: prefix,
        details: matches,
      });
    }
  }

  const budgetResults = [];
  for (const budget of DIRECT_FILE_BUDGETS) {
    const directFiles = countDirectFiles(budget.dir);
    budgetResults.push({ ...budget, directFiles });
    if (directFiles > budget.max) {
      violations.push({
        type: 'direct-file-budget',
        subject: budget.dir,
        details: [`direct files: ${directFiles}`, `max: ${budget.max}`],
      });
    }
  }

  console.log('[structure-audit] Direct file budgets:');
  for (const result of budgetResults) {
    console.log(
      `  - ${result.dir}: ${result.directFiles}/${result.max}${result.directFiles > result.max ? ' (over)' : ''}`,
    );
  }

  if (violations.length === 0) {
    console.log('[structure-audit] PASS');
    return;
  }

  console.error('[structure-audit] FAIL');
  for (const violation of violations) {
    console.error(`\n[${violation.type}] ${violation.subject}`);
    for (const detail of violation.details.slice(0, 20)) {
      console.error(`  - ${detail}`);
    }
    if (violation.details.length > 20) {
      console.error(`  - ...and ${violation.details.length - 20} more`);
    }
  }

  process.exit(1);
}

main();
