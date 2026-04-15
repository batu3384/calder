import { describe, expect, expectTypeOf, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ProjectGovernanceAutoApprovalDecisionRecord, ProjectGovernanceAutoApprovalState } from './types';
import type { AutoApprovalDecision, AutoApprovalMode, AutoApprovalOperationClass, AutoApprovalPolicySource, InspectorEvent } from './types';

const source = readFileSync(path.join(process.cwd(), 'src/shared/types.ts'), 'utf8');

describe('project governance contracts', () => {
  it('defines governance policy source and state models', () => {
    expect(source).toContain('export interface ProjectGovernancePolicySource');
    expect(source).toContain("mode: 'advisory' | 'enforced'");
    expect(source).toContain("toolPolicy: 'allow' | 'ask' | 'block'");
    expect(source).toContain("writePolicy: 'allow' | 'ask' | 'block'");
    expect(source).toContain("networkPolicy: 'allow' | 'ask' | 'block'");
    expect(source).toContain('providerProfileCount: number');
    expect(source).toContain("export type AutoApprovalMode = 'off' | 'edit_only' | 'edit_plus_safe_tools';");
    expect(source).toContain("export type AutoApprovalPolicySource = 'global' | 'project' | 'session' | 'fallback';");
    expect(source).toContain("export type AutoApprovalOperationClass = 'edit' | 'safe_tool' | 'risky_tool' | 'unknown' | 'destructive';");
    expect(source).toContain("export type AutoApprovalDecision = 'allow' | 'ask' | 'block';");
    expect(source).toContain('export interface ProjectGovernanceAutoApprovalState');
    expect(source).toContain('globalMode: AutoApprovalMode');
    expect(source).toContain('effectiveMode: AutoApprovalMode');
    expect(source).toContain("safeToolProfile: 'default-read-only';");
    expect(source).toContain('recentDecisions: ProjectGovernanceAutoApprovalDecisionRecord[];');
    expect(source).toContain('export interface ProjectGovernanceState');
    expect(source).toContain('policy?: ProjectGovernancePolicySource');
    expect(source).toContain('autoApproval?: ProjectGovernanceAutoApprovalState');
  });

  it('pins the auto-approval decision record shape', () => {
    expectTypeOf<ProjectGovernanceAutoApprovalDecisionRecord>().toEqualTypeOf<{
      timestamp: string;
      operationClass: AutoApprovalOperationClass;
      decision: AutoApprovalDecision;
      reason?: string;
    }>();
    expectTypeOf<ProjectGovernanceAutoApprovalState['recentDecisions'][number]>().toEqualTypeOf<ProjectGovernanceAutoApprovalDecisionRecord>();
  });

  it('extends project records with governance state', () => {
    expect(source).toContain('projectGovernance?: ProjectGovernanceState;');
  });

  it('defines governance scaffold result types', () => {
    expect(source).toContain('export interface ProjectGovernanceStarterPolicyResult');
    expect(source).toContain('state: ProjectGovernanceState');
  });

  it('includes approval decision inspector events', () => {
    expect(source).toContain("'approval_decision'");
    expect(source).toContain('auto_approval?: {');
    expect(source).toContain('policy_source: AutoApprovalPolicySource');
    expect(source).toContain('effective_mode: AutoApprovalMode');
    expect(source).toContain('operation_class: AutoApprovalOperationClass');
    expect(source).toContain('decision: AutoApprovalDecision');
    expect(source).toContain('reason?: string');
  });

  it('pins the inspector auto-approval payload shape', () => {
    expectTypeOf<InspectorEvent['auto_approval']>().toEqualTypeOf<{
      policy_source: AutoApprovalPolicySource;
      effective_mode: AutoApprovalMode;
      operation_class: AutoApprovalOperationClass;
      decision: AutoApprovalDecision;
      reason?: string;
    } | undefined>();
  });
});
