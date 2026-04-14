import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project team context contracts', () => {
  it('defines shared team context space models', () => {
    expect(source).toContain('export interface ProjectTeamContextSpaceSource');
    expect(source).toContain('linkedRuleCount: number');
    expect(source).toContain('linkedWorkflowCount: number');
    expect(source).toContain('export interface ProjectTeamContextState');
    expect(source).toContain('spaces: ProjectTeamContextSpaceSource[]');
    expect(source).toContain('sharedRuleCount: number');
    expect(source).toContain('workflowCount: number');
  });

  it('extends project records with team context state', () => {
    expect(source).toContain('projectTeamContext?: ProjectTeamContextState;');
  });
});
