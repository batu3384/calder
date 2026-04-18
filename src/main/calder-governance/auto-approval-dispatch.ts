import type { ProviderId } from '../../shared/types.js';

const AUTO_APPROVAL_INPUT_BY_PROVIDER: Partial<Record<ProviderId, string>> = {
  claude: '1\n',
  codex: 'y\n',
  gemini: 'y\n',
  qwen: 'y\n',
};

export function resolveAutoApprovalInput(providerId: ProviderId): string {
  const input = AUTO_APPROVAL_INPUT_BY_PROVIDER[providerId];
  if (!input) {
    throw new Error(`Unsupported auto-approval provider: ${providerId}`);
  }
  return input;
}
