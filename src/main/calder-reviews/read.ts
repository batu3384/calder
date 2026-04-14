import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectReviewDocument } from '../../shared/types.js';

const REVIEWS_DIR_PREFIX = `.calder${path.posix.sep}reviews${path.posix.sep}`;

function normalizeReviewRelativePath(reviewPath: string): string {
  const normalized = reviewPath.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!normalized.startsWith(REVIEWS_DIR_PREFIX) || !normalized.endsWith('.md') || normalized.includes('..')) {
    throw new Error('Review path must stay within .calder/reviews');
  }
  return normalized;
}

function deriveReviewTitle(relativePath: string, contents: string): string {
  const firstHeading = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('#'));
  if (firstHeading) {
    return firstHeading.replace(/^#+\s*/, '').trim() || path.basename(relativePath, '.md');
  }
  return path.basename(relativePath, '.md');
}

export async function readProjectReviewFile(
  projectPath: string,
  reviewPath: string,
): Promise<ProjectReviewDocument> {
  const relativePath = normalizeReviewRelativePath(reviewPath);
  const fullPath = path.join(projectPath, relativePath);
  const contents = await readFile(fullPath, 'utf8');
  return {
    path: fullPath,
    relativePath,
    title: deriveReviewTitle(relativePath, contents),
    contents,
  };
}
