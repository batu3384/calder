import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AutoApprovalMode,
  AutoApprovalPolicySource,
  ProjectGovernanceAutoApprovalState,
} from '../../shared/types.js';

interface RawAutoApprovalPolicy {
  autoApproval?: {
    mode?: unknown;
  };
}

interface AutoApprovalPolicyModeReadResult {
  mode: AutoApprovalMode;
  isExplicit: boolean;
}

export const GLOBAL_AUTO_APPROVAL_POLICY_PATH = path.join(
  os.homedir(),
  '.calder',
  'governance',
  'default-policy.json',
);

function asAutoApprovalMode(value: unknown): AutoApprovalMode | undefined {
  return value === 'off' || value === 'edit_only' || value === 'edit_plus_safe_tools'
    ? value
    : undefined;
}

function readAutoApprovalPolicyMode(filePath: string): AutoApprovalPolicyModeReadResult {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawAutoApprovalPolicy;
    const explicitMode = asAutoApprovalMode(parsed?.autoApproval?.mode);
    if (explicitMode !== undefined) {
      return { mode: explicitMode, isExplicit: true };
    }
  } catch {
    return { mode: 'off', isExplicit: false };
  }

  return { mode: 'off', isExplicit: false };
}

export function readAutoApprovalModeFromPolicyFile(filePath: string): AutoApprovalMode {
  return readAutoApprovalPolicyMode(filePath).mode;
}

export function readGlobalAutoApprovalMode(): AutoApprovalMode {
  return readAutoApprovalModeFromPolicyFile(GLOBAL_AUTO_APPROVAL_POLICY_PATH);
}

export function readGlobalAutoApprovalPolicy(): AutoApprovalPolicyModeReadResult {
  return readAutoApprovalPolicyMode(GLOBAL_AUTO_APPROVAL_POLICY_PATH);
}

export function resolveEffectiveAutoApprovalMode(input: {
  globalMode?: AutoApprovalMode;
  hasGlobalMode?: boolean;
  projectMode?: AutoApprovalMode;
  hasProjectMode?: boolean;
  sessionMode?: AutoApprovalMode;
  hasSessionMode?: boolean;
}): Pick<ProjectGovernanceAutoApprovalState, 'effectiveMode' | 'policySource'> {
  const hasSessionMode = input.hasSessionMode ?? input.sessionMode !== undefined;
  if (hasSessionMode) {
    return { effectiveMode: input.sessionMode ?? 'off', policySource: 'session' };
  }

  const hasProjectMode = input.hasProjectMode ?? input.projectMode !== undefined;
  if (hasProjectMode) {
    return { effectiveMode: input.projectMode ?? 'off', policySource: 'project' };
  }

  const hasGlobalMode = input.hasGlobalMode ?? input.globalMode !== undefined;
  if (hasGlobalMode) {
    return { effectiveMode: input.globalMode ?? 'off', policySource: 'global' };
  }

  return { effectiveMode: 'off', policySource: 'fallback' satisfies AutoApprovalPolicySource };
}
