import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverProjectGovernance, POLICY_RELATIVE_PATH } from './discovery.js';

export type ProjectGovernanceOperationKind = 'write' | 'mcp' | 'network' | 'budget';
export type ProjectGovernanceDecisionStatus = 'allow' | 'advisory' | 'ask' | 'block';

export interface ProjectGovernanceOperation {
  kind: ProjectGovernanceOperationKind;
  label: string;
  target?: string;
  estimatedCostUsd?: number;
}

export interface ProjectGovernanceDecision {
  allowed: boolean;
  status: ProjectGovernanceDecisionStatus;
  reason?: string;
}

interface RawGovernancePolicy {
  mcpAllowlist?: unknown;
}

async function readRawPolicy(projectPath: string): Promise<RawGovernancePolicy> {
  try {
    const policyPath = path.join(projectPath, POLICY_RELATIVE_PATH);
    const parsed = JSON.parse(await readFile(policyPath, 'utf8'));
    return typeof parsed === 'object' && parsed ? parsed as RawGovernancePolicy : {};
  } catch {
    return {};
  }
}

function normalizeAllowlist(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim())
    : [];
}

function decision(status: ProjectGovernanceDecisionStatus, reason?: string): ProjectGovernanceDecision {
  return {
    allowed: status === 'allow' || status === 'advisory',
    status,
    ...(reason ? { reason } : {}),
  };
}

function asFiniteNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function evaluateBudgetLimit(
  budgetLimitUsd: number | undefined,
  operation: ProjectGovernanceOperation,
): ProjectGovernanceDecision | null {
  const budgetLimit = asFiniteNonNegativeNumber(budgetLimitUsd);
  const estimatedCost = asFiniteNonNegativeNumber(operation.estimatedCostUsd);
  if (budgetLimit === null || estimatedCost === null || estimatedCost <= budgetLimit) {
    return null;
  }
  return decision(
    'block',
    `${operation.label} exceeds the project budget limit (${formatUsd(budgetLimit)}): estimated ${formatUsd(estimatedCost)}.`,
  );
}

export async function evaluateProjectGovernanceOperation(
  projectPath: string,
  operation: ProjectGovernanceOperation,
): Promise<ProjectGovernanceDecision> {
  const state = await discoverProjectGovernance(projectPath);
  const policy = state.policy;
  if (!policy) {
    return decision('allow');
  }

  if (policy.mode !== 'enforced') {
    return decision('advisory', `${operation.label} is allowed because the governance policy is advisory.`);
  }

  if (operation.kind === 'write') {
    if (policy.writePolicy === 'allow') return decision('allow');
    if (policy.writePolicy === 'ask') {
      return decision('ask', `${operation.label} requires approval under the enforced governance policy.`);
    }
    return decision('block', `${operation.label} is blocked by the enforced write policy.`);
  }

  if (operation.kind === 'mcp') {
    const rawPolicy = await readRawPolicy(projectPath);
    const allowlist = normalizeAllowlist(rawPolicy.mcpAllowlist);
    if (allowlist.length > 0 && operation.target && !allowlist.includes(operation.target)) {
      return decision('block', `${operation.target} is not in the project MCP allowlist.`);
    }
    if (policy.toolPolicy === 'ask') {
      return decision('ask', `${operation.label} requires approval under the enforced tool policy.`);
    }
    if (policy.toolPolicy === 'block') {
      return decision('block', `${operation.label} is blocked by the enforced tool policy.`);
    }
    if (policy.writePolicy === 'ask') {
      return decision('ask', `${operation.label} requires approval under the enforced write policy.`);
    }
    if (policy.writePolicy === 'block') {
      return decision('block', `${operation.label} is blocked by the enforced write policy.`);
    }
    const budgetDecision = evaluateBudgetLimit(policy.budgetLimitUsd, operation);
    if (budgetDecision) {
      return budgetDecision;
    }
    return decision('allow');
  }

  if (operation.kind === 'network') {
    if (policy.networkPolicy === 'ask') {
      return decision('ask', `${operation.label} requires approval under the enforced network policy.`);
    }
    if (policy.networkPolicy === 'block') {
      return decision('block', `${operation.label} is blocked by the enforced network policy.`);
    }
    const budgetDecision = evaluateBudgetLimit(policy.budgetLimitUsd, operation);
    if (budgetDecision) {
      return budgetDecision;
    }
    return decision('allow');
  }

  if (operation.kind === 'budget') {
    const budgetDecision = evaluateBudgetLimit(policy.budgetLimitUsd, operation);
    if (budgetDecision) {
      return budgetDecision;
    }
    return decision('allow');
  }

  return decision('allow');
}

export async function assertProjectGovernanceAllows(
  projectPath: string,
  operation: ProjectGovernanceOperation,
): Promise<void> {
  const result = await evaluateProjectGovernanceOperation(projectPath, operation);
  if (result.allowed) return;
  throw new Error(`Governance policy blocked ${operation.label}: ${result.reason ?? result.status}`);
}
