import fs from 'node:fs';
import path from 'node:path';
import type {
  ProjectGovernanceDecisionPolicy,
  ProjectGovernanceMode,
  ProjectGovernancePolicySource,
  ProjectGovernanceState,
} from '../../shared/types.js';

interface RawGovernancePolicy {
  profileName?: unknown;
  mode?: unknown;
  toolPolicy?: unknown;
  writePolicy?: unknown;
  networkPolicy?: unknown;
  mcpAllowlist?: unknown;
  providerProfiles?: unknown;
  budgetLimitUsd?: unknown;
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
  if (!isFile(policyPath)) {
    return {};
  }

  const policy = buildPolicySource(policyPath);
  return {
    policy,
    lastUpdated: policy.lastUpdated,
  };
}

export { POLICY_RELATIVE_PATH };
