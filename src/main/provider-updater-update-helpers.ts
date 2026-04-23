import * as fs from 'fs';
import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource } from '../shared/types/provider';
import type { ProviderUpdateSpec, ProviderUpdaterRunner } from './provider-updater-types';
import {
  hasDifferentVersion,
  parseVersion,
} from './provider-updater-version';
import {
  buildCancelledResult,
  buildMissingUpdateCommandResult,
  buildUnknownSourceResult,
} from './provider-updater/update-result-helpers';
import {
  resolveNoUpdateResult,
  resolveProviderUpdateCheck,
} from './provider-updater/update-check-helpers';
import {
  applyUpdateCommandAndVerify,
  resolveUpdateCommand,
} from './provider-updater/update-command-helpers';

const CHECK_TIMEOUT_MS = 20_000;

export function resolveRealPath(binaryPath: string): string {
  try {
    return fs.realpathSync(binaryPath);
  } catch {
    return binaryPath;
  }
}

export function detectUpdateSource(
  providerId: ProviderId,
  spec: ProviderUpdateSpec,
  resolvedBinaryPath: string,
): ProviderUpdateSource {
  const normalized = resolvedBinaryPath.replace(/\\/g, '/');
  const npmSegment = spec.npmPackage ? `/node_modules/${spec.npmPackage.replace(/\//g, '/')}/` : '';
  if (spec.brewCask && normalized.includes(`/Caskroom/${spec.brewCask}/`)) {
    return 'brew-cask';
  }
  if (spec.brewFormula && normalized.includes(`/Cellar/${spec.brewFormula}/`)) {
    return 'brew-formula';
  }
  if (npmSegment && normalized.includes(npmSegment)) {
    return 'npm';
  }
  if (providerId === 'codex' && normalized.includes('/node_modules/@openai/codex/')) {
    return 'npm';
  }
  if (providerId === 'gemini' && normalized.includes('/node_modules/@google/gemini-cli/')) {
    return 'npm';
  }
  if (providerId === 'qwen' && normalized.includes('/node_modules/@qwen-code/qwen-code/')) {
    return 'npm';
  }
  if (spec.selfUpdateArgs) {
    return 'self';
  }
  return 'unknown';
}

export async function readBinaryVersion(
  runner: ProviderUpdaterRunner,
  binaryPath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const result = await runner.run(binaryPath, ['--version'], { timeoutMs: CHECK_TIMEOUT_MS, signal });
  if (result.code !== 0) return undefined;
  const raw = `${result.stdout}\n${result.stderr}`.trim();
  return parseVersion(raw);
}

export async function runProviderUpdate(input: {
  providerId: ProviderId;
  providerName: string;
  binaryPath: string;
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  beforeVersion?: string;
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'>> {
  const { providerId, providerName, binaryPath, source, spec, beforeVersion, runner, signal, onStage } = input;

  if (signal?.aborted) {
    return buildCancelledResult({
      providerId,
      providerName,
      source,
      beforeVersion,
      message: 'Update cancelled before checks completed.',
    });
  }

  if (source === 'unknown') {
    onStage?.('Update source could not be detected.');
    return buildUnknownSourceResult({
      providerId,
      providerName,
      source,
      beforeVersion,
    });
  }

  const checkResult = await resolveProviderUpdateCheck({
    source,
    spec,
    beforeVersion,
    runner,
    signal,
    onStage,
  });
  const { latestVersion, updateNeeded, checkCommand } = checkResult;

  if (signal?.aborted) {
    return buildCancelledResult({
      providerId,
      providerName,
      source,
      beforeVersion,
      latestVersion,
      checkCommand,
      message: 'Update cancelled before execution.',
    });
  }

  const noUpdateResult = await resolveNoUpdateResult({
    providerId,
    providerName,
    source,
    spec,
    beforeVersion,
    latestVersion,
    checkCommand,
    updateNeeded,
    runner,
    signal,
    onStage,
  });
  if (noUpdateResult) {
    return noUpdateResult;
  }

  const updateCommandInput = resolveUpdateCommand(binaryPath, source, spec);
  if (!updateCommandInput) {
    onStage?.('No update command configured for this source.');
    return buildMissingUpdateCommandResult({
      providerId,
      providerName,
      source,
      checkCommand,
      beforeVersion,
      latestVersion,
    });
  }

  return applyUpdateCommandAndVerify({
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
  });
}
