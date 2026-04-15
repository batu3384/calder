import fs from 'node:fs';
import path from 'node:path';
import type {
  AutoApprovalMode,
  ProjectGovernanceDecisionPolicy,
  ProjectGovernanceMode,
  ProjectGovernancePolicySource,
  ProjectGovernanceState,
} from '../../shared/types.js';
import {
  readGlobalAutoApprovalMode,
  readAutoApprovalModeFromPolicyFile,
  resolveEffectiveAutoApprovalMode,
} from './auto-approval-policy.js';

interface RawGovernancePolicy {
  profileName?: unknown;
  mode?: unknown;
  toolPolicy?: unknown;
  writePolicy?: unknown;
  networkPolicy?: unknown;
  mcpAllowlist?: unknown;
  providerProfiles?: unknown;
  budgetLimitUsd?: unknown;
  autoApproval?: {
    mode?: unknown;
  };
}

const POLICY_RELATIVE_PATH = path.join('.calder', 'governance', 'policy.json');

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function asMode(value: unknown): ProjectGovernanceMode {
  return value === 'enforced' ? 'enforced' : 'advisory';
}

function asDecisionPolicy(value: unknown): ProjectGovernanceDecisionPolicy {
  if (value === 'allow' || value === 'block') return value;
  return 'ask';
}

function asBudgetLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function countAllowlist(value: unknown): number {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0).length
    : 0;
}

function countProviderProfiles(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.values(value).filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)).length;
}

function asAutoApprovalMode(value: unknown): AutoApprovalMode | undefined {
  return value === 'off' || value === 'edit_only' || value === 'edit_plus_safe_tools'
    ? value
    : undefined;
}

function readPolicy(filePath: string): RawGovernancePolicy {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed === 'object' && parsed ? parsed as RawGovernancePolicy : {};
  } catch {
    return {};
  }
}

function buildPolicySource(filePath: string): ProjectGovernancePolicySource {
  const stat = fs.statSync(filePath);
  const raw = readPolicy(filePath);
  const mode = asMode(raw.mode);
  const toolPolicy = asDecisionPolicy(raw.toolPolicy);
  const writePolicy = asDecisionPolicy(raw.writePolicy);
  const networkPolicy = asDecisionPolicy(raw.networkPolicy);
  const budgetLimitUsd = asBudgetLimit(raw.budgetLimitUsd);
  const displayName = typeof raw.profileName === 'string' && raw.profileName.trim()
    ? raw.profileName.trim()
    : 'Project guardrails';

  return {
    id: `governance:${filePath}`,
    path: filePath,
    displayName,
    summary: `${mode} · tools ${toolPolicy} · writes ${writePolicy} · network ${networkPolicy}`,
    lastUpdated: new Date(stat.mtimeMs).toISOString(),
    mode,
    toolPolicy,
    writePolicy,
    networkPolicy,
    mcpAllowlistCount: countAllowlist(raw.mcpAllowlist),
    providerProfileCount: countProviderProfiles(raw.providerProfiles),
    budgetLimitUsd,
  };
}

export async function discoverProjectGovernance(projectPath: string): Promise<ProjectGovernanceState> {
  const policyPath = path.join(projectPath, POLICY_RELATIVE_PATH);
  const globalMode = readGlobalAutoApprovalMode();

  if (!isFile(policyPath)) {
    const resolved = resolveEffectiveAutoApprovalMode({ globalMode });
    return {
      autoApproval: {
        globalMode,
        effectiveMode: resolved.effectiveMode,
        policySource: resolved.policySource,
        safeToolProfile: 'default-read-only',
        recentDecisions: [],
      },
    };
  }

  const policy = buildPolicySource(policyPath);
  const raw = readPolicy(policyPath);
  const projectMode = asAutoApprovalMode(raw.autoApproval?.mode) ?? readAutoApprovalModeFromPolicyFile(policyPath);
  const resolved = resolveEffectiveAutoApprovalMode({ globalMode, projectMode });

  return {
    policy,
    autoApproval: {
      globalMode,
      projectMode,
      effectiveMode: resolved.effectiveMode,
      policySource: resolved.policySource,
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    },
    lastUpdated: policy.lastUpdated,
  };
}

export { POLICY_RELATIVE_PATH };
