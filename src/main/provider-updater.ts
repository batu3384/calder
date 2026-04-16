import * as fs from 'fs';
import { execFile } from 'child_process';
import type { CliProvider } from './providers/provider';
import { getAllProviders } from './providers/registry';
import { getFullPath } from './pty-manager';
import type {
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSource,
  ProviderUpdateSummary,
} from '../shared/types';

export interface ProviderUpdaterTarget {
  meta: Pick<CliProvider['meta'], 'id' | 'displayName'>;
  resolveBinaryPath(): string;
  validatePrerequisites(): { ok: boolean; message: string };
}

export interface ProviderUpdaterRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{ code: number; stdout: string; stderr: string }>;
}

interface ProviderUpdateSpec {
  npmPackage?: string;
  brewFormula?: string;
  brewCask?: string;
  selfUpdateArgs?: string[];
}

interface ProviderUpdaterOptions {
  runner?: ProviderUpdaterRunner;
  now?: () => number;
  onProgress?: (event: ProviderUpdateProgressEvent) => void;
  signal?: AbortSignal;
}

const CHECK_TIMEOUT_MS = 20_000;
const UPDATE_TIMEOUT_MS = 6 * 60_000;

const PROVIDER_UPDATE_SPECS: Record<ProviderId, ProviderUpdateSpec> = {
  claude: {
    npmPackage: '@anthropic-ai/claude-code',
    selfUpdateArgs: ['update'],
  },
  codex: {
    npmPackage: '@openai/codex',
    brewCask: 'codex',
  },
  copilot: {
    npmPackage: '@github/copilot',
    brewFormula: 'copilot-cli',
  },
  gemini: {
    npmPackage: '@google/gemini-cli',
    brewFormula: 'gemini-cli',
  },
  qwen: {
    npmPackage: '@qwen-code/qwen-code',
    brewFormula: 'qwen-code',
  },
  minimax: {
    npmPackage: 'mmx-cli',
    selfUpdateArgs: ['update'],
  },
  blackbox: {
    selfUpdateArgs: ['update'],
  },
};

const defaultRunner: ProviderUpdaterRunner = {
  run(command, args, options) {
    const timeoutMs = options?.timeoutMs ?? CHECK_TIMEOUT_MS;
    const signal = options?.signal;
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve({ code: 130, stdout: '', stderr: 'Update cancelled.' });
        return;
      }

      let settled = false;
      const finish = (result: { code: number; stdout: string; stderr: string }): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const child = execFile(
        command,
        args,
        {
          env: { ...process.env, PATH: getFullPath() },
          encoding: 'utf-8',
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) {
            finish({ code: 0, stdout, stderr });
            return;
          }
          const err = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
          if (signal?.aborted) {
            finish({
              code: 130,
              stdout: err.stdout ?? stdout ?? '',
              stderr: err.stderr ?? stderr ?? 'Update cancelled.',
            });
            return;
          }
          const exitCode = typeof err.code === 'number' ? err.code : 1;
          finish({
            code: exitCode,
            stdout: err.stdout ?? stdout ?? '',
            stderr: err.stderr ?? stderr ?? err.message ?? 'Command failed',
          });
        },
      );

      if (!signal) return;

      const forceKillTimer = { current: null as ReturnType<typeof setTimeout> | null };
      const clearForceKill = (): void => {
        if (!forceKillTimer.current) return;
        clearTimeout(forceKillTimer.current);
        forceKillTimer.current = null;
      };
      const abortHandler = (): void => {
        try {
          if (!child.killed) {
            child.kill('SIGTERM');
          }
          forceKillTimer.current = setTimeout(() => {
            try {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            } catch {
              // no-op: process already exited
            }
          }, 1200);
          forceKillTimer.current.unref?.();
        } catch {
          // no-op: process already exited
        }
      };

      child.once('close', () => {
        clearForceKill();
        signal.removeEventListener('abort', abortHandler);
      });

      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) {
        abortHandler();
      }
    });
  },
};

export async function updateAllProviders(options?: ProviderUpdaterOptions): Promise<ProviderUpdateSummary> {
  return updateProviders(getAllProviders(), options);
}

export async function updateProviders(
  providers: ProviderUpdaterTarget[],
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
  const runner = options?.runner ?? defaultRunner;
  const now = options?.now ?? Date.now;
  const onProgress = options?.onProgress;
  const signal = options?.signal;
  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  const results: ProviderUpdateResult[] = [];
  const providerTargets = providers.map((provider) => ({
    providerId: provider.meta.id,
    providerName: provider.meta.displayName,
  }));

  onProgress?.({
    phase: 'started',
    startedAt,
    totalProviders: providers.length,
    completedProviders: 0,
    providers: providerTargets,
  });

  if (signal?.aborted) {
    const finishedAt = new Date(now()).toISOString();
    const summary: ProviderUpdateSummary = {
      startedAt,
      finishedAt,
      results,
      cancelled: true,
    };
    onProgress?.({
      phase: 'finished',
      startedAt,
      finishedAt,
      cancelled: true,
      totalProviders: providers.length,
      completedProviders: results.length,
    });
    return summary;
  }

  for (const provider of providers) {
    if (signal?.aborted) {
      break;
    }
    const providerStart = now();
    const id = provider.meta.id;
    const providerName = provider.meta.displayName;
    const spec = PROVIDER_UPDATE_SPECS[id];
    const prerequisites = provider.validatePrerequisites();

    onProgress?.({
      phase: 'provider_started',
      startedAt,
      totalProviders: providers.length,
      completedProviders: results.length,
      providerId: id,
      providerName,
    });

    if (!prerequisites.ok) {
      const result: ProviderUpdateResult = {
        providerId: id,
        providerName,
        source: 'unknown',
        status: 'skipped',
        checked: false,
        updateAttempted: false,
        message: `${providerName} is not installed.`,
        durationMs: Math.max(0, now() - providerStart),
      };
      results.push(result);
      onProgress?.({
        phase: 'provider_finished',
        startedAt,
        totalProviders: providers.length,
        completedProviders: results.length,
        providerId: id,
        providerName,
        result,
      });
      continue;
    }

    const binaryPath = provider.resolveBinaryPath();
    const resolvedBinaryPath = resolveRealPath(binaryPath);
    const source = detectUpdateSource(id, spec, resolvedBinaryPath);
    const beforeVersion = await readBinaryVersion(runner, binaryPath, signal);

    const baseResult = await runProviderUpdate({
      providerId: id,
      providerName,
      binaryPath,
      source,
      spec,
      beforeVersion,
      runner,
      signal,
    });
    const result: ProviderUpdateResult = {
      ...baseResult,
      durationMs: Math.max(0, now() - providerStart),
    };

    results.push(result);
    onProgress?.({
      phase: 'provider_finished',
      startedAt,
      totalProviders: providers.length,
      completedProviders: results.length,
      providerId: id,
      providerName,
      result,
    });

    if (result.status === 'cancelled') {
      break;
    }
  }

  const finishedAt = new Date(now()).toISOString();
  const summary: ProviderUpdateSummary = {
    startedAt,
    finishedAt,
    results,
    cancelled: signal?.aborted === true,
  };
  onProgress?.({
    phase: 'finished',
    startedAt,
    finishedAt,
    cancelled: summary.cancelled,
    totalProviders: providers.length,
    completedProviders: results.length,
  });
  return summary;
}

async function runProviderUpdate(input: {
  providerId: ProviderId;
  providerName: string;
  binaryPath: string;
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  beforeVersion?: string;
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'>> {
  const { providerId, providerName, binaryPath, source, spec, beforeVersion, runner, signal } = input;

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

  let latestVersion: string | undefined;
  let updateNeeded = true;
  let checkCommand: string | undefined;

  if (source === 'npm' && spec.npmPackage) {
    checkCommand = `npm view ${spec.npmPackage} version --silent`;
    latestVersion = await readNpmLatestVersion(runner, spec.npmPackage, signal);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
  } else if (source === 'brew-formula' && spec.brewFormula) {
    checkCommand = `brew info --json=v2 ${spec.brewFormula}`;
    latestVersion = await readBrewLatestVersion(runner, 'formula', spec.brewFormula, signal);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
  } else if (source === 'brew-cask' && spec.brewCask) {
    checkCommand = `brew info --json=v2 --cask ${spec.brewCask}`;
    latestVersion = await readBrewLatestVersion(runner, 'cask', spec.brewCask, signal);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
  }

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

function detectUpdateSource(
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

function resolveRealPath(binaryPath: string): string {
  try {
    return fs.realpathSync(binaryPath);
  } catch {
    return binaryPath;
  }
}

async function readBinaryVersion(
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
