import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project workflow contracts', () => {
  it('defines discovered workflow source models', () => {
    expect(source).toContain('export interface ProjectWorkflowSource');
    expect(source).toContain('path: string');
    expect(source).toContain('summary: string');
  });

  it('defines a project workflow state snapshot', () => {
    expect(source).toContain('export interface ProjectWorkflowState');
    expect(source).toContain('workflows: ProjectWorkflowSource[]');
  });

  it('extends project records with workflow state', () => {
    expect(source).toContain('projectWorkflows?: ProjectWorkflowState;');
  });

  it('defines scaffold result types for workflows', () => {
    expect(source).toContain('export interface ProjectWorkflowStarterFilesResult');
    expect(source).toContain('export interface ProjectWorkflowCreateResult');
  });

  it('defines a readable workflow document model', () => {
    expect(source).toContain('export interface ProjectWorkflowDocument');
    expect(source).toContain('relativePath: string');
    expect(source).toContain('contents: string');
    expect(source).toContain('title: string');
  });
});
