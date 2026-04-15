import * as fs from 'fs';
import { execFile } from 'child_process';
import type { CliProvider } from './providers/provider';
import { getAllProviders } from './providers/registry';
import { getFullPath } from './pty-manager';
import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource, ProviderUpdateSummary } from '../shared/types';

export interface ProviderUpdaterTarget {
  meta: Pick<CliProvider['meta'], 'id' | 'displayName'>;
  resolveBinaryPath(): string;
  validatePrerequisites(): { ok: boolean; message: string };
}

export interface ProviderUpdaterRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
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
    selfUpdateArgs: ['update'],
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
    return new Promise((resolve) => {
      execFile(
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
            resolve({ code: 0, stdout, stderr });
            return;
          }
          const err = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
          const exitCode = typeof err.code === 'number' ? err.code : 1;
          resolve({
            code: exitCode,
            stdout: err.stdout ?? stdout ?? '',
            stderr: err.stderr ?? stderr ?? err.message ?? 'Command failed',
          });
        },
      );
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
  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  const results: ProviderUpdateResult[] = [];

  for (const provider of providers) {
    const providerStart = now();
    const id = provider.meta.id;
    const providerName = provider.meta.displayName;
    const spec = PROVIDER_UPDATE_SPECS[id];
    const prerequisites = provider.validatePrerequisites();

    if (!prerequisites.ok) {
      results.push({
        providerId: id,
        providerName,
        source: 'unknown',
        status: 'skipped',
        checked: false,
        updateAttempted: false,
        message: `${providerName} is not installed.`,
        durationMs: Math.max(0, now() - providerStart),
      });
      continue;
    }

    const binaryPath = provider.resolveBinaryPath();
    const resolvedBinaryPath = resolveRealPath(binaryPath);
    const source = detectUpdateSource(id, spec, resolvedBinaryPath);
    const beforeVersion = await readBinaryVersion(runner, binaryPath);

    const result = await runProviderUpdate({
      providerId: id,
      providerName,
      binaryPath,
      source,
      spec,
      beforeVersion,
      runner,
    });

    results.push({
      ...result,
      durationMs: Math.max(0, now() - providerStart),
    });
  }

  const finishedAt = new Date(now()).toISOString();
  return {
    startedAt,
    finishedAt,
    results,
  };
}

async function runProviderUpdate(input: {
  providerId: ProviderId;
  providerName: string;
  binaryPath: string;
  source: ProviderUpdateSource;
  spec: ProviderUpdateSpec;
  beforeVersion?: string;
  runner: ProviderUpdaterRunner;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'>> {
  const { providerId, providerName, binaryPath, source, spec, beforeVersion, runner } = input;

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
    latestVersion = await readNpmLatestVersion(runner, spec.npmPackage);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
  } else if (source === 'brew-formula' && spec.brewFormula) {
    checkCommand = `brew info --json=v2 ${spec.brewFormula}`;
    latestVersion = await readBrewLatestVersion(runner, 'formula', spec.brewFormula);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
  } else if (source === 'brew-cask' && spec.brewCask) {
    checkCommand = `brew info --json=v2 --cask ${spec.brewCask}`;
    latestVersion = await readBrewLatestVersion(runner, 'cask', spec.brewCask);
    updateNeeded = shouldUpdate(beforeVersion, latestVersion);
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
  const updateExec = await runner.run(command.command, command.args, { timeoutMs: UPDATE_TIMEOUT_MS });
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

  const afterVersion = await readBinaryVersion(runner, binaryPath);
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
  if (spec.selfUpdateArgs) {
    return 'self';
  }
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
  return 'unknown';
}

function resolveRealPath(binaryPath: string): string {
  try {
    return fs.realpathSync(binaryPath);
  } catch {
    return binaryPath;
  }
}

async function readBinaryVersion(runner: ProviderUpdaterRunner, binaryPath: string): Promise<string | undefined> {
  const result = await runner.run(binaryPath, ['--version'], { timeoutMs: CHECK_TIMEOUT_MS });
  const raw = `${result.stdout}\n${result.stderr}`.trim();
  return parseVersion(raw);
}

async function readNpmLatestVersion(runner: ProviderUpdaterRunner, npmPackage: string): Promise<string | undefined> {
  const result = await runner.run('npm', ['view', npmPackage, 'version', '--silent'], { timeoutMs: CHECK_TIMEOUT_MS });
  if (result.code !== 0) return undefined;
  return parseVersion(result.stdout.trim());
}

async function readBrewLatestVersion(
  runner: ProviderUpdaterRunner,
  kind: 'formula' | 'cask',
  token: string,
): Promise<string | undefined> {
  const args = kind === 'cask' ? ['info', '--json=v2', '--cask', token] : ['info', '--json=v2', token];
  const result = await runner.run('brew', args, { timeoutMs: CHECK_TIMEOUT_MS });
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
  const match = value.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  return match?.[0];
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = parseComparableParts(left);
  const rightParts = parseComparableParts(right);
  if (!leftParts || !rightParts) return null;
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function parseComparableParts(value: string): number[] | null {
  const base = value.split('-', 1)[0];
  if (!/^\d+(\.\d+)*$/.test(base)) return null;
  return base.split('.').map((part) => Number.parseInt(part, 10));
}
