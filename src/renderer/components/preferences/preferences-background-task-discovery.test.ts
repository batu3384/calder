import { describe, expect, it, vi } from 'vitest';

import type { ProjectBackgroundTaskSource } from '../../../shared/types/project-background-task.js';

vi.mock('../../state.js', () => ({
  appState: {
    addFileReaderSession: vi.fn(),
    setProjectBackgroundTasks: vi.fn(),
    resolveSurfaceTargetSession: vi.fn(() => null),
  },
}));

vi.mock('../../project-background-task-actions.js', () => ({
  resumeProjectBackgroundTaskInNewSession: vi.fn(),
  sendProjectBackgroundTaskToSelectedSession: vi.fn(),
}));

vi.mock('../modal.js', () => ({
  setModalError: vi.fn(),
  showModal: vi.fn(),
}));

import {
  buildBackgroundTaskMetaText,
  resolveBackgroundTaskArtifactPath,
} from './preferences-background-task-discovery.js';

function task(overrides: Partial<ProjectBackgroundTaskSource> = {}): ProjectBackgroundTaskSource {
  return {
    id: 'task-1',
    path: '/repo/.calder/tasks/task-1.md',
    title: 'Task 1',
    status: 'queued',
    summary: '',
    createdAt: '2026-04-22T10:00:00.000Z',
    lastUpdated: '2026-04-22T10:00:00.000Z',
    artifactCount: 0,
    handoffSummary: '',
    ...overrides,
  };
}

describe('preferences-background-task-discovery helpers', () => {
  it('resolves relative artifact paths against project root', () => {
    const resolved = resolveBackgroundTaskArtifactPath('/repo/workspace/', './notes\\handoff.md');
    expect(resolved.fullPath).toBe('/repo/workspace/notes/handoff.md');
    expect(resolved.relativePath).toBe('notes/handoff.md');
  });

  it('keeps absolute artifact paths intact', () => {
    const resolved = resolveBackgroundTaskArtifactPath('/repo/workspace', '/tmp/report.md');
    expect(resolved.fullPath).toBe('/tmp/report.md');
    expect(resolved.relativePath).toBeNull();
  });

  it('formats task meta with summary and artifact plurality', () => {
    expect(
      buildBackgroundTaskMetaText(
        task({ status: 'running', artifactCount: 2, summary: 'Investigating flaky tests' }),
      ),
    ).toBe('running · 2 artifacts · Investigating flaky tests');

    expect(buildBackgroundTaskMetaText(task({ status: 'completed', artifactCount: 1 }))).toBe(
      'completed · 1 artifact',
    );
  });
});
