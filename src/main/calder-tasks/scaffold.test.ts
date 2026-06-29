import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readProjectBackgroundTaskFile } from './read.js';
import { createProjectBackgroundTaskFile } from './scaffold.js';

const roots: string[] = [];

function makeProject(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('project background task files', () => {
  it('rejects blank task title', async () => {
    const root = makeProject('background-task-empty-title');
    await expect(createProjectBackgroundTaskFile(root, '   ', 'prompt')).rejects.toThrow('Task title is required');
  });

  it('rejects blank task prompt', async () => {
    const root = makeProject('background-task-empty-prompt');
    await expect(createProjectBackgroundTaskFile(root, 'Task title', '   ')).rejects.toThrow('Task prompt is required');
  });

  it('creates and reads queued task documents', async () => {
    const root = makeProject('background-task-create');

    const result = await createProjectBackgroundTaskFile(root, 'Review UI', 'Check the preferences modal.');
    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/tasks/review-ui.json');
    expect(readFileSync(join(root, result.relativePath), 'utf8')).toContain('"status": "queued"');
    expect(result.state.queuedCount).toBe(1);

    const document = await readProjectBackgroundTaskFile(root, result.relativePath);
    expect(document.title).toBe('Review UI');
    expect(document.prompt).toBe('Check the preferences modal.');
    expect(document.status).toBe('queued');
  });

  it('uses fallback slug when task title has no alphanumeric characters', async () => {
    const root = makeProject('background-task-fallback-slug');

    const result = await createProjectBackgroundTaskFile(root, '!!!', 'run fallback check');

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/tasks/background-task.json');
    expect(readFileSync(join(root, result.relativePath), 'utf8')).toContain('"title": "!!!"');
  });
});
