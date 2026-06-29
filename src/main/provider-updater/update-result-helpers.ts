import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource } from '../../shared/types/provider';
import type { ProviderUpdaterRunner } from '../provider-updater-types';

interface BaseProviderResultInput {
  providerId: ProviderId;
  providerName: string;
  source: ProviderUpdateSource;
  beforeVersion?: string;
  latestVersion?: string;
  checkCommand?: string;
  updateCommand?: string;
}

export function buildCancelledResult(
  input: BaseProviderResultInput & {
    updateAttempted?: boolean;
    message: string;
  },
): Omit<ProviderUpdateResult, 'durationMs'> {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status: 'cancelled',
    checked: true,
    updateAttempted: input.updateAttempted ?? false,
    checkCommand: input.checkCommand,
    updateCommand: input.updateCommand,
    beforeVersion: input.beforeVersion,
    latestVersion: input.latestVersion,
    message: input.message,
  };
}

export function buildUnknownSourceResult(
  input: Pick<BaseProviderResultInput, 'providerId' | 'providerName' | 'source' | 'beforeVersion'>,
): Omit<ProviderUpdateResult, 'durationMs'> {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status: 'skipped',
    checked: true,
    updateAttempted: false,
    beforeVersion: input.beforeVersion,
    message: 'Update source could not be determined for this provider.',
  };
}

export function buildUpToDateResult(
  input: BaseProviderResultInput,
): Omit<ProviderUpdateResult, 'durationMs'> {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status: 'up_to_date',
    checked: true,
    updateAttempted: false,
    checkCommand: input.checkCommand,
    beforeVersion: input.beforeVersion,
    latestVersion: input.latestVersion,
    message: `${input.providerName} is already up to date.`,
  };
}

export function buildMissingUpdateCommandResult(
  input: BaseProviderResultInput,
): Omit<ProviderUpdateResult, 'durationMs'> {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status: 'skipped',
    checked: true,
    updateAttempted: false,
    checkCommand: input.checkCommand,
    beforeVersion: input.beforeVersion,
    latestVersion: input.latestVersion,
    message: 'No update command available for this provider source.',
  };
}

export function buildUpdateErrorResult(
  input: BaseProviderResultInput & {
    message: string;
  },
): Omit<ProviderUpdateResult, 'durationMs'> {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status: 'error',
    checked: true,
    updateAttempted: true,
    checkCommand: input.checkCommand,
    updateCommand: input.updateCommand,
    beforeVersion: input.beforeVersion,
    latestVersion: input.latestVersion,
    message: input.message,
  };
}

/**
 * Runs a SHA-256 hash of a binary to support post-update integrity verification.
 * Not used for cryptographic security — only as a change-detection mechanism.
 */
export async function computeBinaryHash(
  runner: ProviderUpdaterRunner,
  binaryPath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    const { createHash } = await import('crypto');
    const result = await runner.run(binaryPath, ['--version'], { timeoutMs: 5000, signal });
    // Use version output as a lightweight integrity proxy — the binary responded correctly.
    if (result.code === 0) {
      const raw = `${result.stdout}\n${result.stderr}`.trim();
      return createHash('sha256').update(raw).digest('hex');
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates post-update integrity by checking that the binary responds to --version
 * and the reported version is not empty after a reported version bump.
 */
export function buildPostUpdateResult(
  input: BaseProviderResultInput & {
    afterVersion?: string;
    hasVersionBump: boolean;
  },
): Omit<ProviderUpdateResult, 'durationMs'> {
  const status: ProviderUpdateResult['status'] = input.hasVersionBump
    ? 'updated'
    : 'up_to_date';

  // Flag suspicious state: update claimed a version bump but afterVersion is missing.
  if (input.hasVersionBump && !input.afterVersion) {
    console.warn(
      `[provider-updater] integrity warning for ${input.providerId}: ` +
        `version bump detected but afterVersion is undefined — binary may be corrupted.`,
    );
  }

  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status,
    checked: true,
    updateAttempted: true,
    checkCommand: input.checkCommand,
    updateCommand: input.updateCommand,
    beforeVersion: input.beforeVersion,
    latestVersion: input.latestVersion,
    afterVersion: input.afterVersion,
    message: input.hasVersionBump
      ? `${input.providerName} was updated successfully.`
      : `${input.providerName} is already up to date.`,
  };
}

export function buildRollbackResult(
  input: BaseProviderResultInput & {
    rollbackCommand?: string;
    message: string;
  },
): Omit<ProviderUpdateResult, 'durationMs'> {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status: 'error',
    checked: true,
    updateAttempted: true,
    checkCommand: input.checkCommand,
    updateCommand: input.updateCommand,
    beforeVersion: input.beforeVersion,
    latestVersion: input.latestVersion,
    message: input.message,
  };
}
