import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource } from '../../shared/types/provider';
import type { ProviderUpdaterRunner,ProviderUpdateSpec } from '../provider-updater-types';
import {
  brewEntryMatchesToken,
  parseVersion,
  shouldUpdate,
} from '../provider-updater-version';
import {
  buildCancelledResult,
  buildUpToDateResult,
} from './update-result-helpers';

const CHECK_TIMEOUT_MS = 20_000;

function getPrimaryToken(tokenOrTokens?: string | string[]): string | undefined {
  if (!tokenOrTokens) return undefined;
  return Array.isArray(tokenOrTokens) ? tokenOrTokens[0] : tokenOrTokens;
}

export interface ProviderUpdateCheckResult {
  latestVersion: string | undefined;
  updateNeeded: boolean;
  checkCommand: string | undefined;
}

async function readNpmLatestVersion(
  runner: ProviderUpdaterRunner,
  npmPackage: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const result = await runner.run('npm', ['view', npmPackage, 'version', '--silent'], {
    timeoutMs: CHECK_TIMEOUT_MS,
    signal,
  });
  if (result.code !== 0) return undefined;
  return parseVersion(result.stdout.trim());
}

async function readBrewLatestVersion(
  runner: ProviderUpdaterRunner,
  kind: 'formula' | 'cask',
  token: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const args = kind === 'cask' ? ['info', '--json=v2', '--cask', token] : ['info', '--json=v2', token];
  const result = await runner.run('brew', args, { timeoutMs: CHECK_TIMEOUT_MS, signal });
  if (result.code !== 0) return undefined;
  try {
    const payload = JSON.parse(result.stdout) as {
      formulae?: Array<{ versions?: { stable?: string } }>;
      casks?: Array<{ version?: string }>;
    };
    if (kind === 'formula') {
      return parseVersion(payload.formulae?.[0]?.versions?.stable ?? '');
    }
    return parseVersion(payload.casks?.[0]?.version ?? '');
  } catch {
    return undefined;
  }
}

async function readBrewOutdatedStatus(
  runner: ProviderUpdaterRunner,
  kind: 'formula' | 'cask',
  token: string,
  signal?: AbortSignal,
): Promise<{ updateNeeded: boolean; latestVersion?: string } | undefined> {
  const args = kind === 'cask'
    ? ['outdated', '--json=v2', '--cask', token]
    : ['outdated', '--json=v2', '--formula', token];
  const result = await runner.run('brew', args, { timeoutMs: CHECK_TIMEOUT_MS, signal });
  if (result.code !== 0 && result.code !== 1) return undefined;
  if (!result.stdout.trim()) return undefined;

  try {
    const payload = JSON.parse(result.stdout) as {
      formulae?: Array<{
        name?: string | string[];
        current_version?: string;
        currentVersion?: string;
        version?: string;
      }>;
      casks?: Array<{
        name?: string | string[];
        current_version?: string;
        currentVersion?: string;
        version?: string;
      }>;
    };
    const entries = kind === 'formula' ? (payload.formulae ?? []) : (payload.casks ?? []);
    if (entries.length === 0) {
      return { updateNeeded: false };
    }

    const matchedEntry = entries.find((entry) => brewEntryMatchesToken(entry.name, token));
    const entry = matchedEntry ?? entries[0];
    const latestCandidate = entry.current_version ?? entry.currentVersion ?? entry.version ?? '';
    return {
      updateNeeded: true,
      latestVersion: parseVersion(latestCandidate),
    };
  } catch {
    return undefined;
  }
}

export async function resolveProviderUpdateCheck(input: {
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  sourcePackageToken?: string;
  beforeVersion?: string;
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}): Promise<ProviderUpdateCheckResult> {
  const { source, spec, sourcePackageToken, beforeVersion, runner, signal, onStage } = input;
  let latestVersion: string | undefined;
  let updateNeeded = true;
  let checkCommand: string | undefined;

  if (source === 'npm' && spec.npmPackage) {
    onStage?.('Checking latest npm version…');
    checkCommand = `npm view ${spec.npmPackage} version --silent`;
    latestVersion = await readNpmLatestVersion(runner, spec.npmPackage, signal);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
  } else if (source === 'brew-formula' && spec.brewFormula) {
    const brewFormula = sourcePackageToken ?? getPrimaryToken(spec.brewFormula)!;
    onStage?.('Checking Homebrew formula updates…');
    checkCommand = `brew outdated --json=v2 --formula ${brewFormula}`;
    const outdatedStatus = await readBrewOutdatedStatus(runner, 'formula', brewFormula, signal);
    if (outdatedStatus) {
      latestVersion = outdatedStatus.latestVersion ?? (outdatedStatus.updateNeeded ? undefined : beforeVersion);
      updateNeeded = outdatedStatus.updateNeeded;
    } else {
      onStage?.('Falling back to Homebrew metadata check…');
      checkCommand = `brew info --json=v2 ${brewFormula}`;
      latestVersion = await readBrewLatestVersion(runner, 'formula', brewFormula, signal);
      updateNeeded = shouldUpdate(beforeVersion, latestVersion);
    }
  } else if (source === 'brew-cask' && spec.brewCask) {
    const brewCask = sourcePackageToken ?? getPrimaryToken(spec.brewCask)!;
    onStage?.('Checking Homebrew cask updates…');
    checkCommand = `brew outdated --json=v2 --cask ${brewCask}`;
    const outdatedStatus = await readBrewOutdatedStatus(runner, 'cask', brewCask, signal);
    if (outdatedStatus) {
      latestVersion = outdatedStatus.latestVersion ?? (outdatedStatus.updateNeeded ? undefined : beforeVersion);
      updateNeeded = outdatedStatus.updateNeeded;
    } else {
      onStage?.('Falling back to Homebrew metadata check…');
      checkCommand = `brew info --json=v2 --cask ${brewCask}`;
      latestVersion = await readBrewLatestVersion(runner, 'cask', brewCask, signal);
      updateNeeded = shouldUpdate(beforeVersion, latestVersion);
    }
  }

  return { latestVersion, updateNeeded, checkCommand };
}

async function buildBrewSyncPendingResult(input: {
  providerId: ProviderId;
  providerName: string;
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  sourcePackageToken?: string;
  beforeVersion?: string;
  latestVersion?: string;
  checkCommand?: string;
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'> | null> {
  const {
    providerId,
    providerName,
    source,
    spec,
    sourcePackageToken,
    beforeVersion,
    latestVersion,
    checkCommand,
    runner,
    signal,
    onStage,
  } = input;
  if (source !== 'brew-formula' && source !== 'brew-cask') {
    return null;
  }
  if (!spec.npmPackage || !beforeVersion) {
    return null;
  }

  onStage?.('Checking upstream npm release…');
  const npmLatestVersion = await readNpmLatestVersion(runner, spec.npmPackage, signal);
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
  if (!npmLatestVersion || !shouldUpdate(beforeVersion, npmLatestVersion)) {
    return null;
  }

  const packageToken = sourcePackageToken ?? getPrimaryToken(source === 'brew-formula' ? spec.brewFormula : spec.brewCask);
  const brewKindLabel = source === 'brew-formula' ? 'formula' : 'cask';
  const npmCheckCommand = `npm view ${spec.npmPackage} version --silent`;
  const combinedCheckCommand = checkCommand ? `${checkCommand}; ${npmCheckCommand}` : npmCheckCommand;
  return {
    providerId,
    providerName,
    source,
    status: 'sync_pending',
    checked: true,
    updateAttempted: false,
    checkCommand: combinedCheckCommand,
    beforeVersion,
    latestVersion: npmLatestVersion,
    message: `${providerName} upstream has ${npmLatestVersion}, but Homebrew ${brewKindLabel}`
      + `${packageToken ? ` "${packageToken}"` : ''} has not synced yet. `
      + 'Run `brew update` and retry later, or switch to npm install for immediate updates.',
  };
}

export async function resolveNoUpdateResult(input: {
  providerId: ProviderId;
  providerName: string;
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  sourcePackageToken?: string;
  beforeVersion?: string;
  latestVersion?: string;
  checkCommand?: string;
  updateNeeded: boolean;
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'> | null> {
  const {
    providerId,
    providerName,
    source,
    spec,
    sourcePackageToken,
    beforeVersion,
    latestVersion,
    checkCommand,
    updateNeeded,
    runner,
    signal,
    onStage,
  } = input;
  if (updateNeeded) return null;

  const syncPendingResult = await buildBrewSyncPendingResult({
    providerId,
    providerName,
    source,
    spec,
    sourcePackageToken,
    beforeVersion,
    latestVersion,
    checkCommand,
    runner,
    signal,
    onStage,
  });
  if (syncPendingResult) return syncPendingResult;

  onStage?.('Already up to date.');
  return buildUpToDateResult({
    providerId,
    providerName,
    source,
    checkCommand,
    beforeVersion,
    latestVersion,
  });
}
