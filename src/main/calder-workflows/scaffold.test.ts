import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectWorkflowFile, createProjectWorkflowStarterFiles } from './scaffold.js';

const roots: string[] = [];

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('project workflow scaffold', () => {
  it('creates starter workflow files without overwriting existing files', async () => {
    const root = makeProject('workflow-starters');
    roots.push(root);
    mkdirSync(join(root, '.calder', 'workflows'), { recursive: true });

    const result = await createProjectWorkflowStarterFiles(root);

    expect(result.created.length).toBeGreaterThan(0);
    expect(result.state.workflows.length).toBeGreaterThan(0);
  });

  it('creates a named workflow file and returns refreshed state', async () => {
    const root = makeProject('workflow-create');
    roots.push(root);

    const result = await createProjectWorkflowFile(root, 'Incident triage');
    const workflowPath = join(root, result.relativePath);

    expect(result.created).toBe(true);
    expect(result.relativePath).toBe('.calder/workflows/incident-triage.md');
    expect(readFileSync(workflowPath, 'utf8')).toContain('# Incident triage');
    expect(result.state.workflows).toEqual([
      expect.objectContaining({
        displayName: 'incident-triage.md',
      }),
    ]);
  });

  it('does not overwrite an existing workflow file', async () => {
    const root = makeProject('workflow-existing');
    roots.push(root);

    const first = await createProjectWorkflowFile(root, 'Incident triage');
    const workflowPath = join(root, first.relativePath);
    writeFileSync(workflowPath, '# Keep me\n', 'utf8');

    const second = await createProjectWorkflowFile(root, 'Incident triage');

    expect(second.created).toBe(false);
    expect(readFileSync(workflowPath, 'utf8')).toContain('Keep me');
  });

  it('throws when creating a workflow file without a title', async () => {
    const root = makeProject('workflow-empty-title');
    roots.push(root);

    await expect(createProjectWorkflowFile(root, '   ')).rejects.toThrow('Workflow title is required');
  });
});
