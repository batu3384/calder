import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { __bindSessionRunForTests, __resetCoordinatorForTests } from './coordinator.js';
import { __resetCalderDataRootForTests, __setCalderDataRootForTests } from './paths.js';
import { findRunIdByCalderSessionId, resolveEvidenceRunId } from './run-resolve.js';
import { __resetWriteQueuesForTests, createRun } from './store.js';

const roots: string[] = [];

afterEach(() => {
  __resetCoordinatorForTests();
  __resetWriteQueuesForTests();
  __resetCalderDataRootForTests();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('calder-evidence run-resolve', () => {
  it('prefers active session mapping over historical runs', () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-resolve-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    createRun({
      runId: 'run-old',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });
    createRun({
      runId: 'run-new',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });
    __bindSessionRunForTests('session-1', 'run-active');

    expect(findRunIdByCalderSessionId('session-1')).toBe('run-active');
    expect(resolveEvidenceRunId('session-1')).toBe('run-active');
  });

  it('resolves run id directly when meta exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-resolve-2-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    createRun({
      runId: 'run-direct',
      calderSessionId: 'session-2',
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    expect(resolveEvidenceRunId('run-direct')).toBe('run-direct');
  });
});
