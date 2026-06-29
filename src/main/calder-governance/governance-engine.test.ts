import { describe, expect, it } from 'vitest';

import type { ProjectGovernanceOperation } from './enforcement';
import { GovernanceEngine } from './governance-engine';

describe('GovernanceEngine', () => {
  it('blocks budget operations that exceed the configured limit', () => {
    const engine = new GovernanceEngine(undefined, 'enforced', 5);
    const operation: ProjectGovernanceOperation = {
      kind: 'budget',
      label: 'Deploy preview',
      estimatedCostUsd: 12,
    };
    const result = engine.evaluate(operation);
    expect(result.action).toBe('block');
    expect(result.matchedRuleId).toBe('budget-exceeded');
  });
});
