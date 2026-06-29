/**
 * Governance rule engine — evaluates operations against configurable rules.
 * Replaces the simple if-else decision tree with a priority-based rule system.
 */

import type { ProjectGovernanceOperation } from './enforcement';

export type GovernanceAction = 'allow' | 'block' | 'ask' | 'warn';
export type GovernanceMode = 'advisory' | 'enforced';

export interface GovernanceRule {
  /** Unique identifier for the rule */
  id: string;
  /** Lower number = higher priority. Rules evaluated lowest-first. */
  priority: number;
  /** Human-readable description */
  description?: string;
  /** The operation type this rule matches */
  operation: string;
  /** Condition function — returns true if the rule matches this operation */
  condition: (op: ProjectGovernanceOperation) => boolean;
  /** Action to take when the rule matches */
  action: GovernanceAction;
  /** Optional reason shown to the user */
  reason?: string;
}

export interface GovernanceResult {
  action: GovernanceAction;
  reason: string;
  matchedRuleId: string;
  blocked?: boolean;
  warned?: boolean;
}

export interface GovernancePolicyFile {
  version: number;
  mode: GovernanceMode;
  budgetLimitUsd?: number;
  allowedMcpServers?: string[];
  rules: SerializedRule[];
}

export interface SerializedRule {
  id: string;
  priority: number;
  operation: string;
  action: GovernanceAction;
  condition?: string; // serialized JS condition (for trusted policy files, advisory mode only)
  reason?: string;
}

const DEFAULT_RULES = (budgetLimitGetter: () => number | undefined): GovernanceRule[] => [
  {
    id: 'network-global',
    priority: 10,
    operation: 'network',
    description: 'Block all network operations by default',
    condition: () => true,
    action: 'ask',
    reason: 'Network access requires explicit approval',
  },
  {
    id: 'mcp-write-global',
    priority: 20,
    operation: 'mcp_write',
    description: 'MCP write operations require approval',
    condition: () => true,
    action: 'ask',
    reason: 'MCP tool writes require governance approval',
  },
  {
    id: 'budget-exceeded',
    priority: 5,
    operation: 'budget',
    description: 'Block if estimated cost exceeds budget limit',
    condition: (op) => {
      if (op.kind !== 'budget') return false;
      const cost = typeof op.estimatedCostUsd === 'number' ? op.estimatedCostUsd : 0;
      const limit = budgetLimitGetter();
      return limit !== undefined && cost > limit;
    },
    action: 'block',
    reason: 'Operation exceeds configured budget limit',
  },
];

/**
 * Rule-based governance engine.
 * Evaluates operations against ordered rules and returns the first matching result.
 */
export class GovernanceEngine {
  private rules: GovernanceRule[];
  private mode: GovernanceMode;
  private budgetLimitUsd: number | undefined;

  constructor(rules: GovernanceRule[] = DEFAULT_RULES(() => this.budgetLimitUsd), mode: GovernanceMode = 'advisory', budgetLimitUsd?: number) {
    // Sort by priority (ascending — lower number = higher priority)
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
    this.mode = mode;
    this.budgetLimitUsd = budgetLimitUsd;
  }

  /**
   * Evaluate an operation against all rules.
   * Returns the result of the first matching rule, or 'allow' if no rules match.
   */
  evaluate(op: ProjectGovernanceOperation): GovernanceResult {
    for (const rule of this.rules) {
      const matched = this.matchesOperation(rule, op);
      if (matched) {
        const result = this.computeResult(rule, op);
        if (this.mode === 'enforced') {
          console.info(`[governance] rule=${rule.id} action=${result.action} op=${op.label} mode=${this.mode}`);
        }
        // In enforced mode, 'ask' becomes 'block' for write operations
        if (this.mode === 'enforced' && result.action === 'ask' && op.kind === 'write') {
          return { ...result, action: 'block', reason: `${result.reason} (governance enforced)` };
        }
        return result;
      }
    }
    return { action: 'allow', reason: 'No matching governance rule', matchedRuleId: 'default-allow' };
  }

  private matchesOperation(rule: GovernanceRule, op: ProjectGovernanceOperation): boolean {
    if (rule.operation !== op.kind) return false;
    try {
      return rule.condition(op);
    } catch (err) {
      console.warn(`[governance] rule=${rule.id} condition threw: ${err}`);
      return false;
    }
  }

  private computeResult(rule: GovernanceRule, _op: ProjectGovernanceOperation): GovernanceResult {
    return {
      action: rule.action,
      reason: rule.reason ?? `Matched rule: ${rule.id}`,
      matchedRuleId: rule.id,
      blocked: rule.action === 'block',
      warned: rule.action === 'warn',
    };
  }

  /**
   * Add a new rule to the engine.
   * Rules are re-sorted by priority after addition.
   */
  addRule(rule: GovernanceRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a rule by ID.
   */
  removeRule(id: string): boolean {
    const idx = this.rules.findIndex(r => r.id === id);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Update the engine mode.
   */
  setMode(mode: GovernanceMode): void {
    this.mode = mode;
  }

  /**
   * Update the budget limit.
   */
  setBudgetLimit(limitUsd: number): void {
    this.budgetLimitUsd = limitUsd;
  }

  /**
   * Serialize rules for storage in governance.json.
   */
  serializeRules(): GovernanceRule[] {
    const defaultIds = new Set(DEFAULT_RULES(() => this.budgetLimitUsd).map(r => r.id));
    return this.rules.filter(r => !defaultIds.has(r.id));
  }

  /**
   * Load rules from a serialized policy file.
   * Note: serialized condition strings are NOT evaluated for security reasons.
   * Custom rules currently match all operations of their type. This is by design —
   * condition evaluation would require a safe-eval sandbox and is a future enhancement.
   */
  static fromPolicyFile(policy: GovernancePolicyFile): GovernanceEngine {
    const customRules: GovernanceRule[] = policy.rules.map(r => ({
      id: r.id,
      priority: r.priority,
      operation: r.operation,
      // Condition strings are intentionally not evaluated — see comment above
      condition: () => true,
      action: r.action,
      reason: r.reason,
      description: r.reason,
    }));
    const engine = new GovernanceEngine([...DEFAULT_RULES(() => policy.budgetLimitUsd), ...customRules], policy.mode, policy.budgetLimitUsd);
    if (policy.mode === 'advisory' && customRules.length > 0) {
      console.info(`[governance] loaded ${customRules.length} custom rules in advisory mode — condition evaluation skipped for security`);
    }
    return engine;
  }
}

/**
 * Decision tree for auto-approval — wraps GovernanceEngine for simple use cases.
 */
export function classifyAutoApprovalAction(
  op: ProjectGovernanceOperation,
  engine: GovernanceEngine
): GovernanceAction {
  const result = engine.evaluate(op);
  return result.action;
}