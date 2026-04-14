import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project review contracts', () => {
  it('defines discovered project review source models', () => {
    expect(source).toContain('export interface ProjectReviewSource');
    expect(source).toContain('path: string');
    expect(source).toContain('summary: string');
  });

  it('defines a project review state snapshot', () => {
    expect(source).toContain('export interface ProjectReviewState');
    expect(source).toContain('reviews: ProjectReviewSource[]');
  });

  it('extends project records with review state', () => {
    expect(source).toContain('projectReviews?: ProjectReviewState;');
  });

  it('defines create and read models for project reviews', () => {
    expect(source).toContain('export interface ProjectReviewCreateResult');
    expect(source).toContain('export interface ProjectReviewDocument');
    expect(source).toContain('relativePath: string');
    expect(source).toContain('contents: string');
    expect(source).toContain('title: string');
  });
});
