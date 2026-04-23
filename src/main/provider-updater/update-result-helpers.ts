import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource } from '../../shared/types/provider';

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

export function buildPostUpdateResult(
  input: BaseProviderResultInput & {
    afterVersion?: string;
    hasVersionBump: boolean;
  },
): Omit<ProviderUpdateResult, 'durationMs'> {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: input.source,
    status: input.hasVersionBump ? 'updated' : 'up_to_date',
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
