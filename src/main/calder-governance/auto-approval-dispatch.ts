import type { ProviderId } from '../../shared/types/provider.js';

const AUTO_APPROVAL_INPUT_BY_PROVIDER: Partial<Record<ProviderId, string>> = {
  claude: '1\n',
  codex: 'y\n',
  antigravity: 'y\n',
  qwen: 'y\n',
  copilot: 'y\n',
};

export function supportsAutoApprovalDispatch(providerId: ProviderId | null | undefined): providerId is ProviderId {
  if (!providerId) return false;
  return AUTO_APPROVAL_INPUT_BY_PROVIDER[providerId] !== undefined;
}

export function resolveAutoApprovalInput(providerId: ProviderId): string {
  const input = AUTO_APPROVAL_INPUT_BY_PROVIDER[providerId];
  if (!input) {
    throw new Error(`Unsupported auto-approval provider: ${providerId}`);
  }
  return input;
}
