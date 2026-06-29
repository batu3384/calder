#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN_TRACKED_PREFIXES = [
  '.codex-ui-backups/',
  '.superpowers/',
  '.tmp-home-ui/',
  '.tmp-ui/',
  '.worktrees/',
];

const DIRECT_FILE_BUDGETS = [
  { dir: 'src/main', max: 195 },
  { dir: 'src/renderer', max: 115 },
  { dir: 'src/renderer/components', max: 190 },
];

const STRUCTURE_BASELINE_PATH = 'scripts/structure-audit-baseline.json';
const SOURCE_FILE_RE = /^src\/.+\.[cm]?[jt]sx?$/;
const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/;
const SCRIPT_FILE_RE = /^scripts\/.+\.[cm]?[jt]s$/;
const LINE_BUDGET_RULES = [
  {
    name: 'src-tests',
    max: 1000,
    include: (file) => SOURCE_FILE_RE.test(file) && TEST_FILE_RE.test(file),
  },
  {
    name: 'src-code',
    max: 500,
    include: (file) => SOURCE_FILE_RE.test(file) && !TEST_FILE_RE.test(file),
  },
  {
    name: 'scripts',
    max: 350,
    include: (file) => SCRIPT_FILE_RE.test(file),
  },
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

function countFileLines(file) {
  const absPath = join(process.cwd(), file);
  const content = readFileSync(absPath, 'utf8');
  if (content.length === 0) {
    return 0;
  }
  const newlineCount = (content.match(/\n/g) ?? []).length;
  return content.endsWith('\n') ? newlineCount : newlineCount + 1;
}

function resolveLineBudgetRule(file) {
  for (const rule of LINE_BUDGET_RULES) {
    if (rule.include(file)) {
      return rule;
    }
  }
  return null;
}

function loadBaselineMap() {
  const absPath = join(process.cwd(), STRUCTURE_BASELINE_PATH);
  if (!existsSync(absPath)) {
    return {};
  }
  const parsed = JSON.parse(readFileSync(absPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid baseline format in ${STRUCTURE_BASELINE_PATH}`);
  }

  const baseline = {};
  for (const [file, value] of Object.entries(parsed)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid baseline line count for ${file} in ${STRUCTURE_BASELINE_PATH}`);
    }
    baseline[file] = value;
  }
  return baseline;
}

function main() {
  const trackedFiles = getTrackedFiles().filter((file) => existsSync(join(process.cwd(), file)));
  const violations = [];
  const lineCountCache = new Map();
  const legacyLineBudgetEntries = [];
  const baseline = loadBaselineMap();

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

  for (const file of trackedFiles) {
    const rule = resolveLineBudgetRule(file);
    if (!rule) {
      continue;
    }
    const lines = countFileLines(file);
    lineCountCache.set(file, lines);
    if (lines <= rule.max) {
      continue;
    }

    const baselineLines = baseline[file];
    if (baselineLines == null) {
      violations.push({
        type: 'line-budget-new-violation',
        subject: file,
        details: [`rule: ${rule.name}`, `lines: ${lines}`, `max: ${rule.max}`],
      });
      continue;
    }

    if (lines > baselineLines) {
      violations.push({
        type: 'line-budget-regression',
        subject: file,
        details: [
          `rule: ${rule.name}`,
          `lines: ${lines}`,
          `baseline: ${baselineLines}`,
          `max: ${rule.max}`,
        ],
      });
      continue;
    }

    legacyLineBudgetEntries.push({
      file,
      rule: rule.name,
      lines,
      baseline: baselineLines,
      max: rule.max,
    });
  }

  const staleBaselineEntries = [];
  for (const [file, baselineLines] of Object.entries(baseline)) {
    if (!trackedFiles.includes(file)) {
      staleBaselineEntries.push(`${file} (missing from git; baseline=${baselineLines})`);
      continue;
    }
    const rule = resolveLineBudgetRule(file);
    if (!rule) {
      staleBaselineEntries.push(`${file} (outside scoped rule; baseline=${baselineLines})`);
      continue;
    }
    const lines = lineCountCache.get(file) ?? countFileLines(file);
    if (lines <= rule.max) {
      staleBaselineEntries.push(
        `${file} (resolved at ${lines}; max=${rule.max}; baseline=${baselineLines})`,
      );
    }
  }

  console.log('[structure-audit] Direct file budgets:');
  for (const result of budgetResults) {
    console.log(
      `  - ${result.dir}: ${result.directFiles}/${result.max}${result.directFiles > result.max ? ' (over)' : ''}`,
    );
  }
  console.log('[structure-audit] Line budgets:');
  for (const rule of LINE_BUDGET_RULES) {
    console.log(`  - ${rule.name}: <= ${rule.max}`);
  }
  console.log(
    `[structure-audit] Legacy over-budget files (frozen): ${legacyLineBudgetEntries.length}`,
  );
  for (const item of legacyLineBudgetEntries.slice(0, 10)) {
    console.log(
      `  - ${item.file}: ${item.lines} (baseline=${item.baseline}, max=${item.max}, rule=${item.rule})`,
    );
  }
  if (legacyLineBudgetEntries.length > 10) {
    console.log(`  - ...and ${legacyLineBudgetEntries.length - 10} more`);
  }
  if (staleBaselineEntries.length > 0) {
    console.log('[structure-audit] Baseline cleanup suggestions:');
    for (const stale of staleBaselineEntries.slice(0, 20)) {
      console.log(`  - ${stale}`);
    }
    if (staleBaselineEntries.length > 20) {
      console.log(`  - ...and ${staleBaselineEntries.length - 20} more`);
    }
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
