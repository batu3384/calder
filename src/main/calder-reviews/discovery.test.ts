import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProjectReviews } from './discovery.js';

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

describe('discoverProjectReviews', () => {
  it('discovers markdown review findings under .calder/reviews', async () => {
    const root = makeProject('review-discovery');
    roots.push(root);
    writeFiles(root, {
      '.calder/reviews/pr-42.md': '# PR 42 Findings\nCrash risk in restore flow.\n',
      '.calder/reviews/layout-pass.md': '\nToolbar wraps too early on medium widths.\n',
    });

    const result = await discoverProjectReviews(root);

    expect(result.reviews).toEqual([
      expect.objectContaining({
        displayName: 'layout-pass.md',
        summary: 'Toolbar wraps too early on medium widths.',
      }),
      expect.objectContaining({
        displayName: 'pr-42.md',
        summary: 'PR 42 Findings',
      }),
    ]);
    expect(result.lastUpdated).toBeTypeOf('string');
  });

  it('returns an empty state when no review findings exist', async () => {
    const root = makeProject('review-empty');
    roots.push(root);
    writeFiles(root, {
      'README.md': '# No reviews yet\n',
    });

    const result = await discoverProjectReviews(root);

    expect(result.reviews).toEqual([]);
    expect(result.lastUpdated).toBeUndefined();
  });
});
