import { describe, expect, it } from 'vitest';
import { appendProjectGovernanceToPrompt, buildProjectGovernancePromptBlock } from './project-governance-prompt.js';

describe('project governance prompt helpers', () => {
  it('builds a compact governance block from the active project policy', () => {
    const block = buildProjectGovernancePromptBlock({
      policy: {
        id: 'governance:/proj/.calder/governance/policy.json',
        path: '/proj/.calder/governance/policy.json',
        displayName: 'Project guardrails',
        summary: 'enforced · writes ask · network block',
        lastUpdated: '2026-04-13T12:00:00.000Z',
        mode: 'enforced',
        toolPolicy: 'block',
        writePolicy: 'ask',
        networkPolicy: 'block',
        mcpAllowlistCount: 2,
        providerProfileCount: 2,
        budgetLimitUsd: 10,
      },
      lastUpdated: '2026-04-13T12:00:00.000Z',
    });

    expect(block).toContain('Project governance policy:');
    expect(block).toContain('Policy: Project guardrails');
    expect(block).toContain('Mode: enforced');
    expect(block).toContain('Tool policy: block');
    expect(block).toContain('Write policy: ask');
    expect(block).toContain('Network policy: block');
    expect(block).toContain('MCP allowlist: 2 server(s)');
    expect(block).toContain('Provider profiles: 2');
    expect(block).toContain('Budget limit: $10');
    expect(block).toContain('If a requested action conflicts with this policy');
  });

  it('appends the governance block without changing prompts for projects without policy', () => {
    expect(appendProjectGovernanceToPrompt('Inspect this UI', {})).toBe('Inspect this UI');
  });
});
