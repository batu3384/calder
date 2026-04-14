import fs from 'node:fs';
import path from 'node:path';
import type { ProjectReviewSource, ProjectReviewState } from '../../shared/types.js';

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function listMarkdownFiles(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.md'))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function readSummary(filePath: string): string {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const candidate = lines[0] ?? '';
    return candidate.startsWith('#') ? candidate.replace(/^#+\s*/, '').trim() : candidate;
  } catch {
    return '';
  }
}

function buildReview(filePath: string): ProjectReviewSource {
  const stat = fs.statSync(filePath);
  return {
    id: `review:${filePath}`,
    path: filePath,
    displayName: path.basename(filePath),
    summary: readSummary(filePath),
    lastUpdated: new Date(stat.mtimeMs).toISOString(),
  };
}

export async function discoverProjectReviews(projectPath: string): Promise<ProjectReviewState> {
  const reviewDir = path.join(projectPath, '.calder', 'reviews');
  const reviews = listMarkdownFiles(reviewDir)
    .map((entry) => path.join(reviewDir, entry))
    .filter(isFile)
    .map((filePath) => buildReview(filePath));

  const lastUpdated = reviews
    .map((review) => review.lastUpdated)
    .sort()
    .at(-1);

  return {
    reviews,
    lastUpdated,
  };
}
