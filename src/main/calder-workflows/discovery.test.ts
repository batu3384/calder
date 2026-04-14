import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProjectWorkflows } from './discovery.js';

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('discoverProjectWorkflows', () => {
  it('discovers markdown workflows under .calder/workflows', async () => {
    const root = makeProject('workflow-discovery');
    roots.push(root);
    writeFiles(root, {
      '.calder/workflows/review-pr.md': '# Review PR\nSummarize findings before patching.\n',
      '.calder/workflows/fix-failing-tests.md': '\nFix the smallest failing test set first.\n',
    });

    const result = await discoverProjectWorkflows(root);

    expect(result.workflows).toEqual([
      expect.objectContaining({
        displayName: 'fix-failing-tests.md',
        summary: 'Fix the smallest failing test set first.',
      }),
      expect.objectContaining({
        displayName: 'review-pr.md',
        summary: 'Review PR',
      }),
    ]);
    expect(result.lastUpdated).toBeTypeOf('string');
  });

  it('returns an empty state when no workflows exist', async () => {
    const root = makeProject('workflow-empty');
    roots.push(root);
    writeFiles(root, {
      'README.md': '# No workflows here\n',
    });

    const result = await discoverProjectWorkflows(root);

    expect(result.workflows).toEqual([]);
    expect(result.lastUpdated).toBeUndefined();
  });
});
