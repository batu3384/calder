import type {
  ProviderId,
  ProviderUpdateResult,
  ProviderUpdateSource,
} from '../../shared/types/provider';
import type { ProviderUpdateSpec } from '../provider-updater-types';

export type ProviderUpdateSourceResolution = {
  source: ProviderUpdateSource;
  packageToken?: string;
};

export const PROVIDER_UPDATE_SPECS: Partial<Record<ProviderId, ProviderUpdateSpec>> = {
  claude: {
    npmPackage: '@anthropic-ai/claude-code',
    brewCask: ['claude-code', 'claude-code@latest'],
    selfUpdateArgs: ['update'],
  },
  codex: {
    npmPackage: '@openai/codex',
    brewCask: 'codex',
  },
  antigravity: {
    brewCask: 'antigravity-cli',
    selfUpdateArgs: ['update'],
  },
};

export function getProviderStageProgress(message: string): number {
  if (message.includes('Checking installed version')) return 10;
  if (message.includes('latest npm') || message.includes('Homebrew')) return 30;
  if (message.includes('upstream npm')) return 45;
  if (message.includes('Trying') || message.includes('fallback')) return 58;
  if (message.includes('Applying update command')) return 72;
  if (message.includes('Installing CLI package')) return 72;
  if (message.includes('Verifying installed version') || message.includes('Verifying installation'))
    return 90;
  if (message.includes('Already up to date') || message.includes('could not be detected'))
    return 100;
  return 50;
}

export function buildProviderUpdateSourceAttempts(
  spec: ProviderUpdateSpec,
  primary: ProviderUpdateSourceResolution,
): ProviderUpdateSourceResolution[] {
  const attempts: ProviderUpdateSourceResolution[] = [primary];
  const seen = new Set<ProviderUpdateSource>([primary.source]);
  const pushAttempt = (attempt: ProviderUpdateSourceResolution): void => {
    if (seen.has(attempt.source)) return;
    attempts.push(attempt);
    seen.add(attempt.source);
  };

  if (primary.source === 'unknown') {
    if (spec.selfUpdateArgs) {
      pushAttempt({ source: 'self' });
    }
    if (spec.npmPackage) {
      pushAttempt({ source: 'npm' });
    }
    return attempts;
  }

  if (primary.source === 'self') {
    if (spec.npmPackage) pushAttempt({ source: 'npm' });
    return attempts;
  }

  if (primary.source === 'brew-cask' || primary.source === 'brew-formula') {
    if (spec.selfUpdateArgs) pushAttempt({ source: 'self' });
    if (spec.npmPackage) pushAttempt({ source: 'npm' });
    return attempts;
  }

  return attempts;
}

export function shouldRetryWithFallback(
  result: Omit<ProviderUpdateResult, 'durationMs'>,
  attemptSource: ProviderUpdateSource,
  nextAttemptSource?: ProviderUpdateSource,
): boolean {
  if (result.status === 'cancelled') return false;
  if (result.status === 'sync_pending' && result.source === 'brew-formula') return true;
  if (result.status === 'error') {
    if (!nextAttemptSource) return false;
    if (attemptSource === 'npm') return false;
    if (
      nextAttemptSource === 'npm' &&
      (attemptSource === 'brew-cask' || attemptSource === 'brew-formula')
    ) {
      return false;
    }
    return true;
  }
  if (result.status !== 'skipped') return false;
  return (
    result.message.includes('No update command available') ||
    result.message.includes('could not be determined') ||
    result.message.includes('No update command configured')
  );
}

function getCommandNameFromBinaryPath(binaryPath: string): string {
  const normalized = binaryPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || binaryPath;
}

export function getAttemptBinaryPath(
  binaryPath: string,
  primarySource: ProviderUpdateSource,
  attemptSource: ProviderUpdateSource,
  binaryName?: string,
): string {
  if (attemptSource === 'npm' && primarySource !== 'npm') {
    return binaryName || getCommandNameFromBinaryPath(binaryPath);
  }
  return binaryPath;
}

export function describeFallbackAttempt(
  providerName: string,
  source: ProviderUpdateSource,
): string {
  if (source === 'self') return `Retrying ${providerName} with its built-in updater…`;
  if (source === 'npm') return `Retrying ${providerName} with npm fallback…`;
  if (source === 'brew-cask') return `Retrying ${providerName} with Homebrew cask fallback…`;
  if (source === 'brew-formula') return `Retrying ${providerName} with Homebrew formula fallback…`;
  return `Retrying ${providerName} with an alternate updater…`;
}
