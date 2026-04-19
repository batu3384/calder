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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asAutoApprovalMode(value: unknown): AutoApprovalMode | undefined {
  return value === 'off'
    || value === 'edit_only'
    || value === 'edit_plus_safe_tools'
    || value === 'full_auto'
    || value === 'full_auto_unsafe'
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

export function readGlobalAutoApprovalPolicy(): AutoApprovalPolicyModeReadResult {
  return readAutoApprovalPolicyMode(GLOBAL_AUTO_APPROVAL_POLICY_PATH);
}

export function setAutoApprovalModeInPolicyFile(filePath: string, mode: AutoApprovalMode | null): void {
  let existing: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (isRecord(parsed)) {
      existing = parsed;
    }
  } catch {
    existing = undefined;
  }

  if (!existing) {
    if (mode === null) {
      return;
    }
    existing = {};
  }

  const rawAutoApproval = existing.autoApproval;
  const autoApproval = isRecord(rawAutoApproval)
    ? { ...rawAutoApproval }
    : {};

  if (mode === null) {
    delete autoApproval.mode;
    if (Object.keys(autoApproval).length > 0) {
      existing.autoApproval = autoApproval;
    } else {
      delete existing.autoApproval;
    }
  } else {
    autoApproval.mode = mode;
    existing.autoApproval = autoApproval;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
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
