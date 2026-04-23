import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource } from '../../shared/types/provider';
import type { ProviderUpdateSpec, ProviderUpdaterRunner } from '../provider-updater-types';
import {
  buildCancelledResult,
  buildPostUpdateResult,
  buildUpdateErrorResult,
} from './update-result-helpers';

const UPDATE_TIMEOUT_MS = 6 * 60_000;

export function resolveUpdateCommand(
  binaryPath: string,
  source: ProviderUpdateSource,
  spec: ProviderUpdateSpec,
): { command: string; args: string[] } | null {
  if (source === 'self' && spec.selfUpdateArgs) {
    return { command: binaryPath, args: spec.selfUpdateArgs };
  }
  if (source === 'npm' && spec.npmPackage) {
    return { command: 'npm', args: ['install', '-g', `${spec.npmPackage}@latest`] };
  }
  if (source === 'brew-formula' && spec.brewFormula) {
    return { command: 'brew', args: ['upgrade', spec.brewFormula] };
  }
  if (source === 'brew-cask' && spec.brewCask) {
    return { command: 'brew', args: ['upgrade', '--cask', spec.brewCask] };
  }
  return null;
}

export async function applyUpdateCommandAndVerify(input: {
  providerId: ProviderId;
  providerName: string;
  binaryPath: string;
  source: ProviderUpdateSource;
  beforeVersion?: string;
  latestVersion?: string;
  checkCommand?: string;
  updateCommandInput: { command: string; args: string[] };
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
  readBinaryVersion: (
    runner: ProviderUpdaterRunner,
    binaryPath: string,
    signal?: AbortSignal,
  ) => Promise<string | undefined>;
  hasDifferentVersion: (beforeVersion?: string, afterVersion?: string) => boolean;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'>> {
  const {
    providerId,
    providerName,
    binaryPath,
    source,
    beforeVersion,
    latestVersion,
    checkCommand,
    updateCommandInput,
    runner,
    signal,
    onStage,
    readBinaryVersion,
    hasDifferentVersion,
  } = input;
  const updateCommand = `${updateCommandInput.command} ${updateCommandInput.args.join(' ')}`.trim();

  onStage?.('Applying update command…');
  const updateExec = await runner.run(updateCommandInput.command, updateCommandInput.args, {
    timeoutMs: UPDATE_TIMEOUT_MS,
    signal,
  });
  if (signal?.aborted) {
    return buildCancelledResult({
      providerId,
      providerName,
      source,
      beforeVersion,
      latestVersion,
      checkCommand,
      updateCommand,
      updateAttempted: true,
      message: 'Update cancelled while command was running.',
    });
  }
  if (updateExec.code !== 0) {
    const errorMessage = (updateExec.stderr || updateExec.stdout || 'Update command failed').trim();
    return buildUpdateErrorResult({
      providerId,
      providerName,
      source,
      checkCommand,
      updateCommand,
      beforeVersion,
      latestVersion,
      message: errorMessage,
    });
  }

  onStage?.('Verifying installed version…');
  const afterVersion = await readBinaryVersion(runner, binaryPath, signal);
  if (signal?.aborted) {
    return buildCancelledResult({
      providerId,
      providerName,
      source,
      beforeVersion,
      latestVersion,
      checkCommand,
      updateCommand,
      updateAttempted: true,
      message: 'Update cancelled before version verification completed.',
    });
  }

  return buildPostUpdateResult({
    providerId,
    providerName,
    source,
    checkCommand,
    updateCommand,
    beforeVersion,
    latestVersion,
    afterVersion,
    hasVersionBump: hasDifferentVersion(beforeVersion, afterVersion),
  });
}
