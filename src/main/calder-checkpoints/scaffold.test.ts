import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectCheckpointFile, readProjectCheckpointFile } from './scaffold.js';

const roots: string[] = [];

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('project checkpoint scaffold', () => {
  it('creates a checkpoint snapshot file and returns refreshed state', async () => {
    const root = makeProject('checkpoint-create');
    roots.push(root);

    const result = await createProjectCheckpointFile(root, {
      label: 'Before risky refactor',
      createdAt: '2026-04-13T15:30:00.000Z',
      projectName: 'Calder',
      activeSessionId: 'session-1',
      sessions: [
        {
          id: 'session-1',
          name: 'Main session',
          providerId: 'claude',
          cliSessionId: 'cli-1',
          type: 'claude',
        },
      ],
      surface: {
        kind: 'web',
        active: true,
        targetSessionId: 'session-1',
        webUrl: 'http://localhost:3000',
      },
      projectContext: {
        sharedRuleCount: 2,
        providerSourceCount: 1,
      },
      projectWorkflows: {
        workflowCount: 3,
      },
    });

    const checkpointPath = join(root, result.relativePath);
    const contents = JSON.parse(readFileSync(checkpointPath, 'utf8'));

    expect(result.created).toBe(true);
    expect(result.relativePath).toContain('.calder/checkpoints/');
    expect(contents).toMatchObject({
      schemaVersion: 1,
      label: 'Before risky refactor',
      sessionCount: 1,
      surface: {
        kind: 'web',
        webUrl: 'http://localhost:3000',
      },
      projectContext: {
        sharedRuleCount: 2,
      },
      projectWorkflows: {
        workflowCount: 3,
      },
    });
    expect(result.state.checkpoints).toEqual([
      expect.objectContaining({
        label: 'Before risky refactor',
        sessionCount: 1,
      }),
    ]);
  });

  it('reads a saved checkpoint document back from the checkpoints folder', async () => {
    const root = makeProject('checkpoint-read');
    roots.push(root);

    const result = await createProjectCheckpointFile(root, {
      label: 'Restore point',
      createdAt: '2026-04-13T16:10:00.000Z',
      projectName: 'Calder',
      activeSessionId: 'session-1',
      sessions: [
        {
          id: 'session-1',
          name: 'Main session',
          providerId: 'claude',
          cliSessionId: 'cli-1',
        },
      ],
    });

    const checkpoint = await readProjectCheckpointFile(root, result.relativePath);

    expect(checkpoint).toMatchObject({
      label: 'Restore point',
      project: {
        name: 'Calder',
        path: root,
      },
      sessions: [
        expect.objectContaining({
          id: 'session-1',
          cliSessionId: 'cli-1',
        }),
      ],
    });
  });

  it('persists richer session metadata for diff and file reader surfaces', async () => {
    const root = makeProject('checkpoint-surface-metadata');
    roots.push(root);

    const result = await createProjectCheckpointFile(root, {
      label: 'Surface restore',
      createdAt: '2026-04-13T16:15:00.000Z',
      projectName: 'Calder',
      activeSessionId: 'reader-1',
      sessions: [
        {
          id: 'diff-1',
          name: 'app.ts',
          type: 'diff-viewer',
          cliSessionId: null,
          diffFilePath: '/proj/src/app.ts',
          diffArea: 'working',
          worktreePath: '/proj',
        },
        {
          id: 'reader-1',
          name: 'README.md',
          type: 'file-reader',
          cliSessionId: null,
          fileReaderPath: '/proj/README.md',
          fileReaderLine: 42,
        },
      ],
    });

    const checkpoint = await readProjectCheckpointFile(root, result.relativePath);

    expect(checkpoint.sessions).toEqual([
      expect.objectContaining({
        id: 'diff-1',
        diffFilePath: '/proj/src/app.ts',
        diffArea: 'working',
        worktreePath: '/proj',
      }),
      expect.objectContaining({
        id: 'reader-1',
        fileReaderPath: '/proj/README.md',
        fileReaderLine: 42,
      }),
    ]);
  });

  it('falls back to a default label when the provided label is blank', async () => {
    const root = makeProject('checkpoint-default-label');
    roots.push(root);

    const result = await createProjectCheckpointFile(root, {
      label: '   ',
      createdAt: '2026-04-13T16:20:00.000Z',
      projectName: 'Calder',
      activeSessionId: 'session-1',
      sessions: [
        {
          id: 'session-1',
          name: 'Main session',
          providerId: 'claude',
          cliSessionId: 'cli-1',
        },
      ],
    });

    expect(result.relativePath).toContain('manual-checkpoint.json');
    const checkpoint = await readProjectCheckpointFile(root, result.relativePath);
    expect(checkpoint.label).toBe('Manual checkpoint');
  });

  it('rejects reading checkpoint files outside .calder/checkpoints', async () => {
    const root = makeProject('checkpoint-invalid-path');
    roots.push(root);

    await expect(readProjectCheckpointFile(root, '../outside.json')).rejects.toThrow(
      'Only checkpoint files inside .calder/checkpoints are supported',
    );
  });
});
