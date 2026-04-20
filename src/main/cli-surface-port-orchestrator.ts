import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createServer } from 'node:net';
import type { CliSurfacePortMode, CliSurfaceProfile } from '../shared/types';

const AUTO_PORT_MIN = 4300;
const AUTO_PORT_SPAN = 2000;
const PORT_MAX = 65535;
const MAX_FALLBACK_ATTEMPTS = 200;

export interface CliSurfaceLaunchMetadata {
  portMode: CliSurfacePortMode;
  resolvedPort?: number;
  resolvedUrl?: string;
  portFallbackUsed?: boolean;
  portReason: string;
}

export interface CliSurfaceLaunchResolution {
  launch: {
    command: string;
    args?: string[];
    cwd: string;
    envPatch?: Record<string, string>;
    cols?: number;
    rows?: number;
  };
  metadata: CliSurfaceLaunchMetadata;
}

type InjectionMode = 'none' | 'env' | 'arg-and-env';
type ArgFlag = '--port' | '-p';

interface InjectionPlan {
  mode: InjectionMode;
  argFlag?: ArgFlag;
  reason: string;
}

function toValidPort(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  if (value < 1 || value > PORT_MAX) return undefined;
  return value;
}

function normalizeCommand(command: string): string {
  return basename(command).toLowerCase();
}

function hasExplicitPortArgs(args: string[] | undefined): boolean {
  if (!args || args.length === 0) return false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--port' || token === '-p') return true;
    if (token.startsWith('--port=')) return true;
  }
  return false;
}

function parsePackageScriptName(command: string, args: string[] | undefined): string | undefined {
  if (!args || args.length === 0) return undefined;
  const manager = normalizeCommand(command);
  if (manager === 'npm') {
    if (args[0] === 'run' || args[0] === 'run-script') {
      return args[1];
    }
    return undefined;
  }
  if (manager === 'pnpm') {
    if (args[0] === 'run' || args[0] === 'run-script') {
      return args[1];
    }
    if (!args[0].startsWith('-')) {
      return args[0];
    }
    return undefined;
  }
  if (manager === 'yarn') {
    if (args[0] === 'run') return args[1];
    if (!args[0].startsWith('-')) return args[0];
    return undefined;
  }
  return undefined;
}

function readPackageScript(cwd: string, scriptName: string | undefined): string | undefined {
  if (!scriptName) return undefined;
  const packageJsonPath = join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const script = parsed.scripts?.[scriptName];
    return typeof script === 'string' ? script : undefined;
  } catch {
    return undefined;
  }
}

type ScriptFramework = 'vite' | 'astro' | 'nuxt' | 'next' | 'cra' | 'unknown';

function detectFramework(scriptCommand: string | undefined): ScriptFramework {
  if (!scriptCommand) return 'unknown';
  const normalized = scriptCommand.toLowerCase();
  if (/\breact-scripts\b/.test(normalized)) return 'cra';
  if (/\bnext\b/.test(normalized)) return 'next';
  if (/\bnuxt\b|\bnuxi\b/.test(normalized)) return 'nuxt';
  if (/\bastro\b/.test(normalized)) return 'astro';
  if (/\bvite\b/.test(normalized)) return 'vite';
  return 'unknown';
}

function planForDirectCommand(command: string): InjectionPlan {
  switch (normalizeCommand(command)) {
    case 'vite':
    case 'astro':
      return { mode: 'arg-and-env', argFlag: '--port', reason: 'Direct framework CLI supports --port.' };
    case 'nuxt':
    case 'nuxi':
    case 'next':
      return { mode: 'arg-and-env', argFlag: '-p', reason: 'Direct framework CLI supports -p/--port.' };
    default:
      return { mode: 'none', reason: 'Command is not recognized as a web dev server CLI.' };
  }
}

function planForPackageManager(profile: CliSurfaceProfile): InjectionPlan {
  const scriptName = parsePackageScriptName(profile.command, profile.args);
  const scriptCommand = readPackageScript(profile.cwd ?? process.cwd(), scriptName);
  const framework = detectFramework(scriptCommand);

  switch (framework) {
    case 'vite':
    case 'astro':
      return { mode: 'arg-and-env', argFlag: '--port', reason: `Detected ${framework} script.` };
    case 'nuxt':
    case 'next':
      return { mode: 'arg-and-env', argFlag: '-p', reason: `Detected ${framework} script.` };
    case 'cra':
      return { mode: 'env', reason: 'Detected react-scripts dev server.' };
    default:
      if (!scriptName) {
        return { mode: 'none', reason: 'Package manager profile does not target a script.' };
      }
      if (['dev', 'start', 'serve', 'preview'].includes(scriptName)) {
        return {
          mode: 'env',
          reason: 'Generic dev/start script; applying PORT env without forcing CLI flags.',
        };
      }
      return { mode: 'none', reason: 'Script does not look like a local web server command.' };
  }
}

function resolveInjectionPlan(profile: CliSurfaceProfile): InjectionPlan {
  const command = normalizeCommand(profile.command);
  if (command === 'npm' || command === 'pnpm' || command === 'yarn') {
    return planForPackageManager(profile);
  }
  return planForDirectCommand(command);
}

function appendPortArguments(profile: CliSurfaceProfile, flag: ArgFlag, port: number): string[] | undefined {
  const args = [...(profile.args ?? [])];
  if (hasExplicitPortArgs(args)) {
    return profile.args ? [...profile.args] : undefined;
  }

  const command = normalizeCommand(profile.command);
  if (command === 'npm') {
    if ((args[0] === 'run' || args[0] === 'run-script') && typeof args[1] === 'string' && args[1].length > 0) {
      return [...args, '--', flag, String(port)];
    }
    return profile.args ? [...profile.args] : undefined;
  }

  if (command === 'pnpm' || command === 'yarn') {
    if (args.length === 0) return profile.args ? [...profile.args] : undefined;
    return [...args, flag, String(port)];
  }

  return [...args, flag, String(port)];
}

function shouldRespectExplicitPort(profile: CliSurfaceProfile): boolean {
  return hasExplicitPortArgs(profile.args) || Boolean(profile.envPatch?.PORT);
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deriveAutoPort(projectId: string, profile: CliSurfaceProfile): number {
  const key = [
    projectId,
    profile.id,
    profile.cwd ?? '',
    normalizeCommand(profile.command),
    (profile.args ?? []).join(' '),
  ].join('::');
  return AUTO_PORT_MIN + (hashString(key) % AUTO_PORT_SPAN);
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function choosePort(
  preferredPort: number,
  reservedPorts: ReadonlySet<number>,
  allowFallback: boolean,
): Promise<number | null> {
  if (!reservedPorts.has(preferredPort) && await isPortAvailable(preferredPort)) {
    return preferredPort;
  }

  if (!allowFallback) return null;

  let attempts = 0;
  let cursor = preferredPort + 1;
  while (attempts < MAX_FALLBACK_ATTEMPTS) {
    if (cursor > PORT_MAX) cursor = AUTO_PORT_MIN;
    if (!reservedPorts.has(cursor) && await isPortAvailable(cursor)) {
      return cursor;
    }
    cursor += 1;
    attempts += 1;
  }

  return null;
}

export async function resolveCliSurfaceLaunch(
  projectId: string,
  profile: CliSurfaceProfile,
  reservedPorts: ReadonlySet<number>,
): Promise<CliSurfaceLaunchResolution> {
  const cwd = profile.cwd ?? process.cwd();
  const command = profile.command;
  const args = profile.args ? [...profile.args] : undefined;
  const envPatch = profile.envPatch ? { ...profile.envPatch } : undefined;

  const mode: CliSurfacePortMode = profile.portMode ?? 'auto';
  const plan = resolveInjectionPlan(profile);
  const explicitPortAlreadySet = shouldRespectExplicitPort(profile);

  if (mode === 'off') {
    return {
      launch: { command, args, cwd, envPatch, cols: profile.cols, rows: profile.rows },
      metadata: { portMode: mode, portReason: 'Port orchestration disabled by profile.' },
    };
  }

  if (plan.mode === 'none') {
    return {
      launch: { command, args, cwd, envPatch, cols: profile.cols, rows: profile.rows },
      metadata: { portMode: mode, portReason: plan.reason },
    };
  }

  if (mode === 'auto' && explicitPortAlreadySet) {
    return {
      launch: { command, args, cwd, envPatch, cols: profile.cols, rows: profile.rows },
      metadata: {
        portMode: mode,
        portReason: 'Profile already contains explicit port settings; auto orchestration skipped.',
      },
    };
  }

  const preferredPort = mode === 'fixed'
    ? toValidPort(profile.preferredPort)
    : (toValidPort(profile.preferredPort) ?? deriveAutoPort(projectId, profile));

  if (!preferredPort) {
    throw new Error('Fixed port mode requires a valid preferred port (1-65535).');
  }

  const allowFallback = profile.allowPortFallback ?? true;
  const resolvedPort = await choosePort(preferredPort, reservedPorts, allowFallback);
  if (!resolvedPort) {
    throw new Error(
      allowFallback
        ? `Could not allocate a free local port after checking ${MAX_FALLBACK_ATTEMPTS} candidates.`
        : `Port ${preferredPort} is already in use and fallback is disabled.`,
    );
  }

  const nextEnvPatch = { ...(envPatch ?? {}), PORT: String(resolvedPort) };
  const nextArgs = plan.mode === 'arg-and-env' && plan.argFlag
    ? appendPortArguments(profile, plan.argFlag, resolvedPort)
    : args;

  return {
    launch: {
      command,
      args: nextArgs,
      cwd,
      envPatch: nextEnvPatch,
      cols: profile.cols,
      rows: profile.rows,
    },
    metadata: {
      portMode: mode,
      resolvedPort,
      resolvedUrl: `http://localhost:${resolvedPort}/`,
      portFallbackUsed: resolvedPort !== preferredPort,
      portReason: plan.reason,
    },
  };
}
