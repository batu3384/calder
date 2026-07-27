import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectGovernanceState } from '../shared/types/governance';
import {
  applySessionOverrideToGovernanceState,
  isAutoApprovalMode,
  updateAutoApprovalMode,
} from './ipc-auto-approval-governance';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ipc auto-approval governance helpers', () => {
  it('validates known auto-approval modes', () => {
    expect(isAutoApprovalMode('ask')).toBe(true);
    expect(isAutoApprovalMode('project_edits')).toBe(true);
    expect(isAutoApprovalMode('session_safe')).toBe(true);
    expect(isAutoApprovalMode('full_auto')).toBe(false);
    expect(isAutoApprovalMode('invalid-mode')).toBe(false);
    expect(isAutoApprovalMode(undefined)).toBe(false);
  });

  it('writes project-level auto-approval mode to governance policy file', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calder-policy-'));
    tempDirs.push(projectDir);

    updateAutoApprovalMode(projectDir, 'project', 'project_edits');

    const policyPath = path.join(projectDir, '.calder', 'governance', 'policy.json');
    const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as {
      autoApproval?: { mode?: string };
    };
    expect(parsed.autoApproval?.mode).toBe('project_edits');
  });

  it('applies session override to derived governance auto-approval state', async () => {
    const state: ProjectGovernanceState = {
      autoApproval: {
        globalMode: 'ask',
        projectMode: 'project_edits',
        effectiveMode: 'project_edits',
        policySource: 'project',
        safeToolProfile: 'default-read-only',
        recentDecisions: [],
      },
    };

    const result = await applySessionOverrideToGovernanceState(state, 'session_safe');
    expect(result.autoApproval?.sessionMode).toBe('session_safe');
    expect(result.autoApproval?.effectiveMode).toBe('session_safe');
    expect(result.autoApproval?.policySource).toBe('session');
  });
});
