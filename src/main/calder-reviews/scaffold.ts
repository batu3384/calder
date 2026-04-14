import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectReviewCreateResult } from '../../shared/types.js';
import { discoverProjectReviews } from './discovery.js';

function slugifyReviewTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'review-findings';
}

function buildReviewContents(title: string): string {
  return `# ${title.trim()}

Goal: capture the highest-risk review findings before patching.

- Lead with bugs, regressions, and verification gaps.
- Keep each finding concrete and tied to an observable risk.
- End with the smallest safe fix plan.
`;
}

export async function createProjectReviewFile(
  projectPath: string,
  title: string,
): Promise<ProjectReviewCreateResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Review title is required');
  }

  const relativePath = path.posix.join('.calder', 'reviews', `${slugifyReviewTitle(trimmedTitle)}.md`);
  const fullPath = path.join(projectPath, relativePath);

  let created = false;
  try {
    await readFile(fullPath, 'utf8');
  } catch {
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buildReviewContents(trimmedTitle), 'utf8');
    created = true;
  }

  const state = await discoverProjectReviews(projectPath);
  return {
    created,
    relativePath,
    state,
  };
}
