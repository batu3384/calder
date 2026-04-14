import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectWorkflowDocument } from '../../shared/types.js';

function normalizeWorkflowRelativePath(projectPath: string, workflowPath: string): string {
  const resolvedProjectPath = path.resolve(projectPath);
  const resolvedWorkflowPath = path.isAbsolute(workflowPath)
    ? path.resolve(workflowPath)
    : path.resolve(projectPath, workflowPath);
  const relativePath = path.relative(resolvedProjectPath, resolvedWorkflowPath).replace(/\\/g, '/');

  if (
    relativePath.startsWith('..')
    || path.isAbsolute(relativePath)
    || !relativePath.startsWith('.calder/workflows/')
    || !relativePath.endsWith('.md')
  ) {
    throw new Error('Only workflow files inside .calder/workflows are supported');
  }

  return relativePath;
}

function deriveWorkflowTitle(relativePath: string, contents: string): string {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => line.startsWith('#'));
  if (heading) {
    return heading.replace(/^#+\s*/, '').trim();
  }
  return path.basename(relativePath, '.md');
}

export async function readProjectWorkflowFile(
  projectPath: string,
  workflowPath: string,
): Promise<ProjectWorkflowDocument> {
  const relativePath = normalizeWorkflowRelativePath(projectPath, workflowPath);
  const fullPath = path.join(projectPath, relativePath);
  const contents = await readFile(fullPath, 'utf8');

  return {
    path: fullPath,
    relativePath,
    title: deriveWorkflowTitle(relativePath, contents),
    contents,
  };
}
