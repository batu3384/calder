import type { ProviderId } from '../../shared/types/provider.js';

const PROVIDER_ICON_ASSETS: Partial<Record<ProviderId, string>> = {
  claude: 'claude.png',
  codex: 'codex.png',
  antigravity: 'antigravity.png',
};

const PROVIDER_FALLBACK_LABELS: Record<ProviderId, string> = {
  claude: 'CL',
  codex: 'OX',
  copilot: 'CP',
  antigravity: 'AG',
  qwen: 'QW',
};

const VALID_PROVIDER_IDS = new Set<ProviderId>([
  'claude',
  'codex',
  'copilot',
  'antigravity',
  'qwen',
]);

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildProviderIconMarkup(providerId: ProviderId, showIcons: boolean): string {
  if (!showIcons) return '';
  if (!VALID_PROVIDER_IDS.has(providerId)) return '';

  const asset = PROVIDER_ICON_ASSETS[providerId];
  if (asset) {
    return `<img class="tab-provider-icon" src="assets/providers/${asset}" alt="${escapeAttr(providerId)}"> `;
  }

  const label = PROVIDER_FALLBACK_LABELS[providerId] ?? providerId.slice(0, 2).toUpperCase();
  return `<span class="tab-provider-fallback tab-provider-fallback-${escapeAttr(providerId)}" aria-hidden="true">${escapeHtml(label)}</span> `;
}
