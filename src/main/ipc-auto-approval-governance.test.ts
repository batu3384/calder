import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectGovernanceState } from '../shared/types';
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
    expect(isAutoApprovalMode('off')).toBe(true);
    expect(isAutoApprovalMode('edit_only')).toBe(true);
    expect(isAutoApprovalMode('edit_plus_safe_tools')).toBe(true);
    expect(isAutoApprovalMode('full_auto')).toBe(true);
    expect(isAutoApprovalMode('full_auto_unsafe')).toBe(true);
    expect(isAutoApprovalMode('invalid-mode')).toBe(false);
    expect(isAutoApprovalMode(undefined)).toBe(false);
  });

  it('writes project-level auto-approval mode to governance policy file', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calder-policy-'));
    tempDirs.push(projectDir);

    updateAutoApprovalMode(projectDir, 'project', 'full_auto');

    const policyPath = path.join(projectDir, '.calder', 'governance', 'policy.json');
    const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as { autoApproval?: { mode?: string } };
    expect(parsed.autoApproval?.mode).toBe('full_auto');
  });

  it('applies session override to derived governance auto-approval state', async () => {
    const state: ProjectGovernanceState = {
      autoApproval: {
        globalMode: 'off',
        projectMode: 'edit_only',
        effectiveMode: 'edit_only',
        policySource: 'project',
        safeToolProfile: 'default-read-only',
        recentDecisions: [],
      },
    };

    const result = await applySessionOverrideToGovernanceState(state, 'full_auto');
    expect(result.autoApproval?.sessionMode).toBe('full_auto');
    expect(result.autoApproval?.effectiveMode).toBe('full_auto');
    expect(result.autoApproval?.policySource).toBe('session');
  });
});
