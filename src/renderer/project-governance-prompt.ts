import type { ProjectGovernanceState } from '../shared/types.js';

export function buildProjectGovernancePromptBlock(
  projectGovernance?: ProjectGovernanceState,
): string | undefined {
  const policy = projectGovernance?.policy;
  if (!policy) return undefined;

  const lines = [
    'Project governance policy:',
    `Policy: ${policy.displayName}`,
    `Mode: ${policy.mode}`,
    `Tool policy: ${policy.toolPolicy}`,
    `Write policy: ${policy.writePolicy}`,
    `Network policy: ${policy.networkPolicy}`,
    `MCP allowlist: ${policy.mcpAllowlistCount} server(s)`,
    `Provider profiles: ${policy.providerProfileCount}`,
  ];

  if (typeof policy.budgetLimitUsd === 'number') {
    lines.push(`Budget limit: $${policy.budgetLimitUsd}`);
  }

  lines.push('If a requested action conflicts with this policy, pause and explain the conflict before proceeding.');
  return lines.join('\n');
}

export function appendProjectGovernanceToPrompt(
  prompt: string,
  projectGovernance?: ProjectGovernanceState,
): string {
  const block = buildProjectGovernancePromptBlock(projectGovernance);
  return block ? `${prompt}\n\n${block}` : prompt;
}
