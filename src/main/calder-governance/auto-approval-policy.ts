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

export function readAutoApprovalModeFromPolicyFile(filePath: string): AutoApprovalMode {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawAutoApprovalPolicy;
    return asAutoApprovalMode(parsed?.autoApproval?.mode) ?? 'off';
  } catch {
    return 'off';
  }
}

export function readGlobalAutoApprovalMode(): AutoApprovalMode {
  return readAutoApprovalModeFromPolicyFile(GLOBAL_AUTO_APPROVAL_POLICY_PATH);
}

export function resolveEffectiveAutoApprovalMode(input: {
  globalMode?: AutoApprovalMode;
  projectMode?: AutoApprovalMode;
  sessionMode?: AutoApprovalMode;
}): Pick<ProjectGovernanceAutoApprovalState, 'effectiveMode' | 'policySource'> {
  if (input.sessionMode && input.sessionMode !== 'off') {
    return { effectiveMode: input.sessionMode, policySource: 'session' };
  }

  if (input.projectMode && input.projectMode !== 'off') {
    return { effectiveMode: input.projectMode, policySource: 'project' };
  }

  if (input.globalMode && input.globalMode !== 'off') {
    return { effectiveMode: input.globalMode, policySource: 'global' };
  }

  return { effectiveMode: 'off', policySource: 'fallback' satisfies AutoApprovalPolicySource };
}
