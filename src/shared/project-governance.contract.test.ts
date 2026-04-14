import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project governance contracts', () => {
  it('defines governance policy source and state models', () => {
    expect(source).toContain('export interface ProjectGovernancePolicySource');
    expect(source).toContain("mode: 'advisory' | 'enforced'");
    expect(source).toContain("toolPolicy: 'allow' | 'ask' | 'block'");
    expect(source).toContain("writePolicy: 'allow' | 'ask' | 'block'");
    expect(source).toContain("networkPolicy: 'allow' | 'ask' | 'block'");
    expect(source).toContain('providerProfileCount: number');
    expect(source).toContain('export interface ProjectGovernanceState');
    expect(source).toContain('policy?: ProjectGovernancePolicySource');
  });

  it('extends project records with governance state', () => {
    expect(source).toContain('projectGovernance?: ProjectGovernanceState;');
  });

  it('defines governance scaffold result types', () => {
    expect(source).toContain('export interface ProjectGovernanceStarterPolicyResult');
    expect(source).toContain('state: ProjectGovernanceState');
  });
});
