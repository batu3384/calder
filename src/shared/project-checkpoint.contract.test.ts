import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project checkpoint contracts', () => {
  it('defines checkpoint snapshot input and discovery models', () => {
    expect(source).toContain('export interface ProjectCheckpointSnapshotInput');
    expect(source).toContain('diffFilePath?: string');
    expect(source).toContain('fileReaderPath?: string');
    expect(source).toContain('export interface ProjectCheckpointSource');
    expect(source).toContain('changedFileCount: number');
    expect(source).toContain('sessionCount: number');
    expect(source).toContain('restoreSummary: string');
  });

  it('defines a project checkpoint state snapshot', () => {
    expect(source).toContain('export interface ProjectCheckpointState');
    expect(source).toContain('checkpoints: ProjectCheckpointSource[]');
  });

  it('extends project records with checkpoint state', () => {
    expect(source).toContain('projectCheckpoints?: ProjectCheckpointState;');
  });

  it('defines checkpoint creation result types', () => {
    expect(source).toContain('export interface ProjectCheckpointCreateResult');
    expect(source).toContain('relativePath: string');
    expect(source).toContain('state: ProjectCheckpointState;');
  });

  it('defines a persisted checkpoint document model', () => {
    expect(source).toContain("export type ProjectCheckpointRestoreMode = 'additive' | 'replace'");
    expect(source).toContain('export interface ProjectCheckpointDocument');
    expect(source).toContain('sessions: ProjectCheckpointSnapshotSession[]');
    expect(source).toContain('git: {');
  });
});
