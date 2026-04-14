import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectBackgroundTaskCreateResult } from '../../shared/types.js';
import { discoverProjectBackgroundTasks } from './discovery.js';

function slugifyTaskTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'background-task';
}

function buildTaskDocument(title: string, prompt: string): string {
  const now = new Date().toISOString();
  return `${JSON.stringify({
    schemaVersion: 1,
    title: title.trim(),
    status: 'queued',
    prompt: prompt.trim(),
    createdAt: now,
    updatedAt: now,
    artifacts: [],
    handoff: '',
  }, null, 2)}\n`;
}

export async function createProjectBackgroundTaskFile(
  projectPath: string,
  title: string,
  prompt: string,
): Promise<ProjectBackgroundTaskCreateResult> {
  const trimmedTitle = title.trim();
  const trimmedPrompt = prompt.trim();
  if (!trimmedTitle) {
    throw new Error('Task title is required');
  }
  if (!trimmedPrompt) {
    throw new Error('Task prompt is required');
  }

  const relativePath = path.posix.join('.calder', 'tasks', `${slugifyTaskTitle(trimmedTitle)}.json`);
  const fullPath = path.join(projectPath, relativePath);

  let created = false;
  try {
    await readFile(fullPath, 'utf8');
  } catch {
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buildTaskDocument(trimmedTitle, trimmedPrompt), 'utf8');
    created = true;
  }

  const state = await discoverProjectBackgroundTasks(projectPath);
  return {
    created,
    relativePath,
    state,
  };
}
