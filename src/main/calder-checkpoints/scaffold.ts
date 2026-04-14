import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectCheckpointDocument,
  ProjectCheckpointCreateResult,
  ProjectCheckpointSnapshotInput,
} from '../../shared/types.js';
import { getGitFiles, getGitStatus } from '../git-status.js';
import { discoverProjectCheckpoints } from './discovery.js';

function slugifyLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'checkpoint';
}

function buildCheckpointRelativePath(createdAt: string, label: string): string {
  const safeStamp = createdAt.replace(/[:.]/g, '-');
  return path.posix.join('.calder', 'checkpoints', `${safeStamp}-${slugifyLabel(label)}.json`);
}

function normalizeCheckpointRelativePath(projectPath: string, checkpointPath: string): string {
  const resolvedProjectPath = path.resolve(projectPath);
  const resolvedCheckpointPath = path.isAbsolute(checkpointPath)
    ? path.resolve(checkpointPath)
    : path.resolve(projectPath, checkpointPath);
  const relativePath = path.relative(resolvedProjectPath, resolvedCheckpointPath).replace(/\\/g, '/');

  if (
    relativePath.startsWith('..')
    || path.isAbsolute(relativePath)
    || !relativePath.startsWith('.calder/checkpoints/')
    || !relativePath.endsWith('.json')
  ) {
    throw new Error('Only checkpoint files inside .calder/checkpoints are supported');
  }

  return relativePath;
}

export async function createProjectCheckpointFile(
  projectPath: string,
  snapshot: ProjectCheckpointSnapshotInput,
): Promise<ProjectCheckpointCreateResult> {
  const createdAt = snapshot.createdAt ?? new Date().toISOString();
  const label = snapshot.label.trim() || 'Manual checkpoint';
  const relativePath = buildCheckpointRelativePath(createdAt, label);
  const fullPath = path.join(projectPath, relativePath);
  const gitStatus = await getGitStatus(projectPath);
  const gitFiles = await getGitFiles(projectPath);

  const payload = {
    schemaVersion: 1,
    id: `checkpoint:${createdAt}:${slugifyLabel(label)}`,
    label,
    createdAt,
    project: {
      name: snapshot.projectName,
      path: projectPath,
    },
    activeSessionId: snapshot.activeSessionId,
    sessionCount: snapshot.sessions.length,
    changedFileCount: gitFiles.length,
    sessions: snapshot.sessions,
    surface: snapshot.surface,
    projectContext: snapshot.projectContext,
    projectWorkflows: snapshot.projectWorkflows,
    projectTeamContext: snapshot.projectTeamContext,
    git: {
      isGitRepo: gitStatus.isGitRepo,
      branch: gitStatus.branch,
      ahead: gitStatus.ahead,
      behind: gitStatus.behind,
      changedFiles: gitFiles,
    },
  };

  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(payload, null, 2), 'utf8');

  const state = await discoverProjectCheckpoints(projectPath);
  return {
    created: true,
    relativePath,
    state,
  };
}

export async function readProjectCheckpointFile(
  projectPath: string,
  checkpointPath: string,
): Promise<ProjectCheckpointDocument> {
  const relativePath = normalizeCheckpointRelativePath(projectPath, checkpointPath);
  const fullPath = path.join(projectPath, relativePath);
  return JSON.parse(await readFile(fullPath, 'utf8')) as ProjectCheckpointDocument;
}
