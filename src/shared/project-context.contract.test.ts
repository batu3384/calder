import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project context contracts', () => {
  it('defines a discovered context source model', () => {
    expect(source).toContain('export interface ProjectContextSource');
    expect(source).toContain("provider: ProviderId | 'shared'");
    expect(source).toContain("kind: 'memory' | 'rules' | 'instructions' | 'mcp'");
  });

  it('defines a project context state snapshot', () => {
    expect(source).toContain('export interface ProjectContextState');
    expect(source).toContain('sources: ProjectContextSource[]');
    expect(source).toContain('sharedRuleCount: number');
  });

  it('defines applied-context payload fields', () => {
    expect(source).toContain('appliedContext?: AppliedContextSummary');
    expect(source).toContain('export interface AppliedContextSummary');
  });
});
