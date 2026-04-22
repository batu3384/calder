import * as fs from 'fs';
import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource } from '../shared/types/provider';
import type { ProviderUpdateSpec, ProviderUpdaterRunner } from './provider-updater-types';

const CHECK_TIMEOUT_MS = 20_000;
const UPDATE_TIMEOUT_MS = 6 * 60_000;

interface ProviderUpdateCheckResult {
  latestVersion: string | undefined;
  updateNeeded: boolean;
  checkCommand: string | undefined;
}

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

async function readNpmLatestVersion(
  runner: ProviderUpdaterRunner,
  npmPackage: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const result = await runner.run('npm', ['view', npmPackage, 'version', '--silent'], { timeoutMs: CHECK_TIMEOUT_MS, signal });
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
  // Homebrew returns exit code 1 when outdated packages are found, while still
  // printing valid JSON payloads. Parse both 0 and 1 exit codes.
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

async function resolveProviderUpdateCheck(input: {
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  beforeVersion?: string;
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}): Promise<ProviderUpdateCheckResult> {
  const { source, spec, beforeVersion, runner, signal, onStage } = input;
  let latestVersion: string | undefined;
  let updateNeeded = true;
  let checkCommand: string | undefined;

  if (source === 'npm' && spec.npmPackage) {
    onStage?.('Checking latest npm version…');
    checkCommand = `npm view ${spec.npmPackage} version --silent`;
    latestVersion = await readNpmLatestVersion(runner, spec.npmPackage, signal);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
  } else if (source === 'brew-formula' && spec.brewFormula) {
    onStage?.('Checking Homebrew formula updates…');
    checkCommand = `brew outdated --json=v2 --formula ${spec.brewFormula}`;
    const outdatedStatus = await readBrewOutdatedStatus(runner, 'formula', spec.brewFormula, signal);
    if (outdatedStatus) {
      latestVersion = outdatedStatus.latestVersion ?? (outdatedStatus.updateNeeded ? undefined : beforeVersion);
      updateNeeded = outdatedStatus.updateNeeded;
    } else {
      onStage?.('Falling back to Homebrew metadata check…');
      checkCommand = `brew info --json=v2 ${spec.brewFormula}`;
      latestVersion = await readBrewLatestVersion(runner, 'formula', spec.brewFormula, signal);
      updateNeeded = shouldUpdate(beforeVersion, latestVersion);
    }
  } else if (source === 'brew-cask' && spec.brewCask) {
    onStage?.('Checking Homebrew cask updates…');
    checkCommand = `brew outdated --json=v2 --cask ${spec.brewCask}`;
    const outdatedStatus = await readBrewOutdatedStatus(runner, 'cask', spec.brewCask, signal);
    if (outdatedStatus) {
      latestVersion = outdatedStatus.latestVersion ?? (outdatedStatus.updateNeeded ? undefined : beforeVersion);
      updateNeeded = outdatedStatus.updateNeeded;
    } else {
      onStage?.('Falling back to Homebrew metadata check…');
      checkCommand = `brew info --json=v2 --cask ${spec.brewCask}`;
      latestVersion = await readBrewLatestVersion(runner, 'cask', spec.brewCask, signal);
      updateNeeded = shouldUpdate(beforeVersion, latestVersion);
    }
  }

  return { latestVersion, updateNeeded, checkCommand };
}

function buildCancelledResult(input: {
  providerId: ProviderId;
  providerName: string;
  source: ProviderUpdateSource;
  beforeVersion?: string;
  latestVersion?: string;
  checkCommand?: string;
  updateCommand?: string;
  updateAttempted?: boolean;
  message: string;
}): Omit<ProviderUpdateResult, 'durationMs'> {
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

async function buildBrewSyncPendingResult(input: {
  providerId: ProviderId;
  providerName: string;
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  beforeVersion?: string;
  latestVersion?: string;
  checkCommand?: string;
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'> | null> {
  const { providerId, providerName, source, spec, beforeVersion, latestVersion, checkCommand, runner, signal, onStage } = input;
  if (
    source !== 'brew-formula'
    && source !== 'brew-cask'
  ) {
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

  const packageToken = source === 'brew-formula' ? spec.brewFormula : spec.brewCask;
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

function resolveUpdateCommand(
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
    return {
      providerId,
      providerName,
      source,
      status: 'skipped',
      checked: true,
      updateAttempted: false,
      beforeVersion,
      message: 'Update source could not be determined for this provider.',
    };
  }

  const checkResult = await resolveProviderUpdateCheck({
    source,
    spec,
    beforeVersion,
    runner,
    signal,
    onStage,
  });
  let { latestVersion, updateNeeded, checkCommand } = checkResult;

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

  if (!updateNeeded) {
    const syncPendingResult = await buildBrewSyncPendingResult({
      providerId,
      providerName,
      source,
      spec,
      beforeVersion,
      latestVersion,
      checkCommand,
      runner,
      signal,
      onStage,
    });
    if (syncPendingResult) {
      return syncPendingResult;
    }
  }

  if (!updateNeeded) {
    onStage?.('Already up to date.');
    return {
      providerId,
      providerName,
      source,
      status: 'up_to_date',
      checked: true,
      updateAttempted: false,
      checkCommand,
      beforeVersion,
      latestVersion,
      message: `${providerName} is already up to date.`,
    };
  }

  const command = resolveUpdateCommand(binaryPath, source, spec);
  if (!command) {
    onStage?.('No update command configured for this source.');
    return {
      providerId,
      providerName,
      source,
      status: 'skipped',
      checked: true,
      updateAttempted: false,
      checkCommand,
      beforeVersion,
      latestVersion,
      message: 'No update command available for this provider source.',
    };
  }

  const updateCommand = `${command.command} ${command.args.join(' ')}`.trim();
  onStage?.('Applying update command…');
  const updateExec = await runner.run(command.command, command.args, { timeoutMs: UPDATE_TIMEOUT_MS, signal });
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
    return {
      providerId,
      providerName,
      source,
      status: 'error',
      checked: true,
      updateAttempted: true,
      checkCommand,
      updateCommand,
      beforeVersion,
      latestVersion,
      message: errorMessage,
    };
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
  const hasVersionBump = hasDifferentVersion(beforeVersion, afterVersion);
  return {
    providerId,
    providerName,
    source,
    status: hasVersionBump ? 'updated' : 'up_to_date',
    checked: true,
    updateAttempted: true,
    checkCommand,
    updateCommand,
    beforeVersion,
    latestVersion,
    afterVersion,
    message: hasVersionBump
      ? `${providerName} was updated successfully.`
      : `${providerName} is already up to date.`,
  };
}

function brewEntryMatchesToken(name: string | string[] | undefined, token: string): boolean {
  if (!name) return false;
  if (Array.isArray(name)) {
    return name.includes(token);
  }
  return name === token;
}

function shouldUpdate(currentVersion?: string, latestVersion?: string): boolean {
  if (!latestVersion) return true;
  if (!currentVersion) return true;
  const compare = compareVersions(currentVersion, latestVersion);
  if (compare === null) return currentVersion !== latestVersion;
  return compare < 0;
}

function hasDifferentVersion(beforeVersion?: string, afterVersion?: string): boolean {
  if (!beforeVersion || !afterVersion) return false;
  return beforeVersion !== afterVersion;
}

function parseVersion(value: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?/);
  return match?.[0];
}

function compareVersions(left: string, right: string): number | null {
  const leftVersion = parseComparableVersion(left);
  const rightVersion = parseComparableVersion(right);
  if (!leftVersion || !rightVersion) return null;

  const leftParts = leftVersion.parts;
  const rightParts = rightVersion.parts;
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  const leftPrerelease = leftVersion.prerelease;
  const rightPrerelease = rightVersion.prerelease;
  if (!leftPrerelease && !rightPrerelease) return 0;
  if (!leftPrerelease) return 1;
  if (!rightPrerelease) return -1;

  return comparePrerelease(leftPrerelease, rightPrerelease);
}

function comparePrerelease(left: string[], right: string[]): number {
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;

    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      const lNum = Number.parseInt(l, 10);
      const rNum = Number.parseInt(r, 10);
      if (lNum > rNum) return 1;
      if (lNum < rNum) return -1;
      continue;
    }
    if (lNumeric && !rNumeric) return -1;
    if (!lNumeric && rNumeric) return 1;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function parseComparableVersion(value: string): { parts: number[]; prerelease?: string[] } | null {
  const match = value.match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const parts = match[1].split('.').map((part) => Number.parseInt(part, 10));
  const prerelease = match[2]?.split('.').filter(Boolean);
  return { parts, prerelease: prerelease && prerelease.length > 0 ? prerelease : undefined };
}
