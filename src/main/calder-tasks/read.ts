import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectBackgroundTaskDocument, ProjectBackgroundTaskStatus } from '../../shared/types.js';

const TASKS_DIR_PREFIX = `.calder${path.posix.sep}tasks${path.posix.sep}`;

interface RawTaskDocument {
  title?: unknown;
  status?: unknown;
  prompt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  artifacts?: unknown;
  handoff?: unknown;
}

function normalizeTaskRelativePath(taskPath: string): string {
  const normalized = taskPath.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!normalized.startsWith(TASKS_DIR_PREFIX) || !normalized.endsWith('.json') || normalized.includes('..')) {
    throw new Error('Task path must stay within .calder/tasks');
  }
  return normalized;
}

function asStatus(value: unknown): ProjectBackgroundTaskStatus {
  if (value === 'running' || value === 'blocked' || value === 'completed' || value === 'cancelled') {
    return value;
  }
  return 'queued';
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asArtifacts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export async function readProjectBackgroundTaskFile(
  projectPath: string,
  taskPath: string,
): Promise<ProjectBackgroundTaskDocument> {
  const relativePath = normalizeTaskRelativePath(taskPath);
  const fullPath = path.join(projectPath, relativePath);
  const raw = JSON.parse(await readFile(fullPath, 'utf8')) as RawTaskDocument;
  const now = new Date().toISOString();
  return {
    path: fullPath,
    relativePath,
    title: asString(raw.title, path.basename(relativePath, '.json')),
    status: asStatus(raw.status),
    prompt: asString(raw.prompt),
    createdAt: asString(raw.createdAt, now),
    updatedAt: asString(raw.updatedAt, now),
    artifacts: asArtifacts(raw.artifacts),
    handoff: asString(raw.handoff),
  };
}
