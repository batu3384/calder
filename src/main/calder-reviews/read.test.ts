import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path, { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readProjectReviewFile } from './read.js';

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

describe('readProjectReviewFile', () => {
  it('reads a review findings markdown file and derives its title', async () => {
    const root = makeProject('review-read');
    roots.push(root);
    writeFiles(root, {
      '.calder/reviews/pr-42-findings.md': '# PR 42 Findings\n\nCrash risk in restore flow.\n',
    });

    const result = await readProjectReviewFile(root, '.calder/reviews/pr-42-findings.md');

    expect(result).toEqual({
      path: path.join(root, '.calder/reviews/pr-42-findings.md'),
      relativePath: '.calder/reviews/pr-42-findings.md',
      title: 'PR 42 Findings',
      contents: '# PR 42 Findings\n\nCrash risk in restore flow.\n',
    });
  });

  it('rejects reads outside .calder/reviews', async () => {
    const root = makeProject('review-read-outside');
    roots.push(root);
    writeFiles(root, {
      '.calder/reviews/ok.md': '# Ok\n',
      'README.md': '# Nope\n',
    });

    await expect(readProjectReviewFile(root, '../README.md')).rejects.toThrow('Review path must stay within .calder/reviews');
  });
});
