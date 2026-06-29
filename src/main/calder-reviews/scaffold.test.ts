import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createProjectReviewFile } from './scaffold.js';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('createProjectReviewFile', () => {
  it('rejects blank review titles', async () => {
    const root = mkdtempSync(join(tmpdir(), 'review-scaffold-empty-title-'));
    roots.push(root);

    await expect(createProjectReviewFile(root, '   ')).rejects.toThrow('Review title is required');
  });

  it('creates a new review findings markdown file under .calder/reviews', async () => {
    const root = mkdtempSync(join(tmpdir(), 'review-scaffold-'));
    roots.push(root);

    const result = await createProjectReviewFile(root, 'PR 42 Findings');

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/reviews/pr-42-findings.md');
    expect(readFileSync(join(root, '.calder/reviews/pr-42-findings.md'), 'utf8')).toContain(
      '# PR 42 Findings',
    );
    expect(result.state.reviews).toHaveLength(1);
  });

  it('reuses the existing file when the slug already exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'review-scaffold-existing-'));
    roots.push(root);

    await createProjectReviewFile(root, 'PR 42 Findings');
    const result = await createProjectReviewFile(root, 'PR 42 Findings');

    expect(result.created).toBe(false);
    expect(result.relativePath).toBe('.calder/reviews/pr-42-findings.md');
    expect(result.state.reviews).toHaveLength(1);
  });

  it('falls back to the default slug when title has no alphanumeric characters', async () => {
    const root = mkdtempSync(join(tmpdir(), 'review-scaffold-fallback-slug-'));
    roots.push(root);

    const result = await createProjectReviewFile(root, '!!!');

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/reviews/review-findings.md');
    expect(readFileSync(join(root, '.calder/reviews/review-findings.md'), 'utf8')).toContain(
      '# !!!',
    );
  });
});
