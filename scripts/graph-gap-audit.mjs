#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const baseRef = process.env.CALDER_GRAPH_BASE ?? 'HEAD';

function runDetectChanges() {
  const result = spawnSync(
    'code-review-graph',
    ['detect-changes', '--repo', repoRoot, '--base', baseRef],
    { encoding: 'utf8', shell: false, env: process.env }
  );

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.log('[graph-gap-audit] code-review-graph not found; skipping audit');
      process.exit(0);
    }
    console.error('[graph-gap-audit] failed to execute code-review-graph:', result.error.message);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    console.error('[graph-gap-audit] detect-changes failed');
    if (stderr) console.error(stderr);
    if (stdout) console.error(stdout);
    process.exit(result.status ?? 1);
  }

  const output = (result.stdout ?? '').trim();
  if (!output || output.includes('No changes detected.')) {
    console.log(`[graph-gap-audit] No changes detected for base ${baseRef}`);
    process.exit(0);
  }

  const jsonStart = output.indexOf('{');
  const jsonEnd = output.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    console.error('[graph-gap-audit] Unable to parse detect-changes output as JSON');
    process.exit(1);
  }

  try {
    return JSON.parse(output.slice(jsonStart, jsonEnd + 1));
  } catch (error) {
    console.error('[graph-gap-audit] JSON parse error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function walkFiles(dir, predicate, bucket = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(fullPath, predicate, bucket);
      continue;
    }
    if (predicate(fullPath)) bucket.push(fullPath);
  }
  return bucket;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const lineCache = new Map();
function lineTextAt(filePath, lineNumber) {
  if (!existsSync(filePath)) return '';
  if (!lineCache.has(filePath)) {
    lineCache.set(filePath, readFileSync(filePath, 'utf8').split('\n'));
  }
  const lines = lineCache.get(filePath);
  return (lines[lineNumber - 1] ?? '').trim();
}

const testFiles = walkFiles(
  path.join(repoRoot, 'src'),
  (filePath) => /\.test\.[cm]?[jt]sx?$/.test(filePath)
);
const testContents = testFiles.map((filePath) => ({
  filePath,
  content: readFileSync(filePath, 'utf8'),
}));

function appearsInTestContent(functionName, sourceFilePath) {
  const stem = path.basename(sourceFilePath).replace(/\.[^.]+$/, '');
  const matcher = new RegExp(`\\b${escapeRegExp(functionName)}\\b`);
  return testContents.some(({ content }) => matcher.test(content) && content.includes(stem));
}

const data = runDetectChanges();
const rawGaps = data.test_gaps ?? [];

const classContainerSet = new Set();
for (const gap of rawGaps) {
  const prefix = `${gap.file}::${gap.name}.`;
  if (rawGaps.some((candidate) => candidate.qualified_name?.startsWith(prefix))) {
    classContainerSet.add(gap.qualified_name);
  }
}

const ignored = {
  testFileSymbol: [],
  classContainer: [],
  privateMethod: [],
  oneLineFacade: [],
  namedInTests: [],
};
const actionable = [];

for (const gap of rawGaps) {
  const filePath = gap.file;
  if (filePath.includes('.test.') || filePath.includes('/__tests__/')) {
    ignored.testFileSymbol.push(gap);
    continue;
  }
  if (classContainerSet.has(gap.qualified_name)) {
    ignored.classContainer.push(gap);
    continue;
  }
  const sourceLine = lineTextAt(filePath, gap.line_start);
  if (sourceLine.includes('private ')) {
    ignored.privateMethod.push(gap);
    continue;
  }
  if (gap.line_start === gap.line_end) {
    ignored.oneLineFacade.push(gap);
    continue;
  }
  if (appearsInTestContent(gap.name, filePath)) {
    ignored.namedInTests.push(gap);
    continue;
  }
  actionable.push(gap);
}

console.log(`[graph-gap-audit] base=${baseRef}`);
console.log(`[graph-gap-audit] raw_gaps=${rawGaps.length}`);
console.log(`[graph-gap-audit] ignored:test_file_symbol=${ignored.testFileSymbol.length}`);
console.log(`[graph-gap-audit] ignored:class_container=${ignored.classContainer.length}`);
console.log(`[graph-gap-audit] ignored:private_method=${ignored.privateMethod.length}`);
console.log(`[graph-gap-audit] ignored:one_line_facade=${ignored.oneLineFacade.length}`);
console.log(`[graph-gap-audit] ignored:named_in_tests=${ignored.namedInTests.length}`);
console.log(`[graph-gap-audit] actionable=${actionable.length}`);

if (actionable.length > 0) {
  console.error('[graph-gap-audit] actionable gaps:');
  for (const gap of actionable) {
    console.error(`- ${gap.name} (${gap.file}:${gap.line_start}-${gap.line_end})`);
  }
  process.exit(1);
}

console.log('[graph-gap-audit] PASS');
