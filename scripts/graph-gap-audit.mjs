#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as graphGapAuditLib from './graph-gap-audit-lib.mjs';

const repoRoot = process.cwd();
const baseRef = process.env.CALDER_GRAPH_BASE ?? 'HEAD';

const testFiles = graphGapAuditLib.walkFiles(
  path.join(repoRoot, 'src'),
  (filePath) => /\.test\.[cm]?[jt]sx?$/.test(filePath)
);
const testContents = testFiles.map((filePath) => ({
  filePath,
  content: readFileSync(filePath, 'utf8'),
}));

const lineCache = new Map();

let detectResult;
try {
  detectResult = graphGapAuditLib.runDetectChanges({ repoRoot, baseRef });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (detectResult.kind === 'missing') {
  console.log('[graph-gap-audit] code-review-graph not found; skipping audit');
  process.exit(0);
}

if (detectResult.kind === 'none') {
  console.log(`[graph-gap-audit] No changes detected for base ${baseRef}`);
  process.exit(0);
}

const data = detectResult.data;
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
  const sourceLine = graphGapAuditLib.lineTextAt(filePath, gap.line_start, lineCache);
  if (sourceLine.includes('private ')) {
    ignored.privateMethod.push(gap);
    continue;
  }
  if (gap.line_start === gap.line_end) {
    ignored.oneLineFacade.push(gap);
    continue;
  }
  if (graphGapAuditLib.appearsInTestContent(gap.name, filePath, testContents)) {
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
