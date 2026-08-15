import { describe, expect, it, vi } from 'vitest';

import type { ProjectGovernanceOperation } from './enforcement';
import {
  GovernanceEngine,
  type GovernancePolicyFile,
  listSerializedConditionRuleIds,
} from './governance-engine';

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

  it('skips custom rules that carry a serialized condition string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy: GovernancePolicyFile = {
      version: 1,
      mode: 'enforced',
      rules: [
        {
          id: 'block-all-writes',
          priority: 1,
          operation: 'write',
          action: 'block',
          reason: 'Custom write block',
        },
        {
          id: 'conditional-write',
          priority: 0,
          operation: 'write',
          action: 'block',
          condition: 'op.target === "/secret"',
          reason: 'Must not be evaluated',
        },
      ],
    };

    const engine = GovernanceEngine.fromPolicyFile(policy);
    const allowed = engine.evaluate({ kind: 'write', label: 'Edit file', target: '/other' });
    const secret = engine.evaluate({ kind: 'write', label: 'Edit file', target: '/secret' });

    expect(allowed.action).toBe('block');
    expect(allowed.matchedRuleId).toBe('block-all-writes');
    expect(secret.matchedRuleId).toBe('block-all-writes');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'skipped 1 custom rule(s) with serialized conditions: conditional-write',
      ),
    );
    warn.mockRestore();
  });

  it('lists serialized condition rule ids without evaluating them', () => {
    const policy: GovernancePolicyFile = {
      version: 1,
      mode: 'enforced',
      rules: [
        {
          id: 'plain',
          priority: 1,
          operation: 'write',
          action: 'block',
          reason: 'ok',
        },
        {
          id: 'conditional-write',
          priority: 0,
          operation: 'write',
          action: 'block',
          condition: 'op.target === "/secret"',
          reason: 'skip me',
        },
      ],
    };
    expect(listSerializedConditionRuleIds(policy)).toEqual(['conditional-write']);
  });

  it('downgrades enforced mode when serialized condition rules are skipped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy: GovernancePolicyFile = {
      version: 1,
      mode: 'enforced',
      rules: [
        {
          id: 'conditional-write',
          priority: 0,
          operation: 'write',
          action: 'block',
          condition: 'op.target === "/secret"',
          reason: 'Must not be evaluated',
        },
      ],
    };

    const engine = GovernanceEngine.fromPolicyFile(policy);
    const network = engine.evaluate({ kind: 'network', label: 'Fetch docs' });

    expect(network.action).toBe('ask');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('downgraded to advisory'));
    warn.mockRestore();
  });
});
