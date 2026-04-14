import fs from 'node:fs';
import path from 'node:path';
import type {
  ProjectBackgroundTaskSource,
  ProjectBackgroundTaskState,
  ProjectBackgroundTaskStatus,
} from '../../shared/types.js';

interface RawTaskDocument {
  title?: unknown;
  status?: unknown;
  prompt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  artifacts?: unknown;
  handoff?: unknown;
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function listTaskFiles(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function readTask(filePath: string): RawTaskDocument {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed === 'object' && parsed ? parsed as RawTaskDocument : {};
  } catch {
    return {};
  }
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

function summarizePrompt(prompt: string): string {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 140) ?? '';
}

function buildTaskSource(filePath: string): ProjectBackgroundTaskSource {
  const stat = fs.statSync(filePath);
  const raw = readTask(filePath);
  const title = asString(raw.title, path.basename(filePath, '.json'));
  const prompt = asString(raw.prompt);
  const handoff = asString(raw.handoff);
  const lastUpdated = asString(raw.updatedAt, new Date(stat.mtimeMs).toISOString());

  return {
    id: `task:${filePath}`,
    path: filePath,
    title,
    status: asStatus(raw.status),
    summary: summarizePrompt(prompt),
    createdAt: asString(raw.createdAt, lastUpdated),
    lastUpdated,
    artifactCount: asArtifacts(raw.artifacts).length,
    handoffSummary: handoff.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '',
  };
}

function countStatus(tasks: ProjectBackgroundTaskSource[], status: ProjectBackgroundTaskStatus): number {
  return tasks.filter((task) => task.status === status).length;
}

export async function discoverProjectBackgroundTasks(projectPath: string): Promise<ProjectBackgroundTaskState> {
  const taskDir = path.join(projectPath, '.calder', 'tasks');
  const tasks = listTaskFiles(taskDir)
    .map((entry) => path.join(taskDir, entry))
    .filter(isFile)
    .map((filePath) => buildTaskSource(filePath))
    .sort((left, right) => right.lastUpdated.localeCompare(left.lastUpdated));

  const lastUpdated = tasks.map((task) => task.lastUpdated).sort().at(-1);

  return {
    tasks,
    queuedCount: countStatus(tasks, 'queued'),
    runningCount: countStatus(tasks, 'running'),
    completedCount: countStatus(tasks, 'completed'),
    lastUpdated,
  };
}
