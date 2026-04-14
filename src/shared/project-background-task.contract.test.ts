import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project background task contracts', () => {
  it('defines local background task queue models', () => {
    expect(source).toContain("export type ProjectBackgroundTaskStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'cancelled'");
    expect(source).toContain('export interface ProjectBackgroundTaskSource');
    expect(source).toContain('artifactCount: number');
    expect(source).toContain('handoffSummary: string');
    expect(source).toContain('export interface ProjectBackgroundTaskState');
    expect(source).toContain('queuedCount: number');
  });

  it('extends project records with background task state', () => {
    expect(source).toContain('projectBackgroundTasks?: ProjectBackgroundTaskState;');
  });
});
