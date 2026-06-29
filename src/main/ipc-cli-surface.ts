import * as path from 'node:path';

import { ipcMain } from 'electron';

import type { CliSurfaceProfile } from '../shared/types/project-surface';
import { discoverCliSurface } from './cli-surface-discovery';

const MAX_PROJECT_ID_LENGTH = 200;
const MAX_PROFILE_ID_LENGTH = 120;
const MAX_PROFILE_NAME_LENGTH = 160;
const MAX_COMMAND_LENGTH = 240;
const MAX_ARGUMENTS = 64;
const MAX_ARGUMENT_LENGTH = 4096;
const MAX_ENV_KEYS = 64;
const MAX_ENV_KEY_LENGTH = 128;
const MAX_ENV_VALUE_LENGTH = 8192;
const MAX_READY_PATTERN_LENGTH = 512;
const MAX_TERMINAL_INPUT_BYTES = 256 * 1024;
const MIN_TERMINAL_DIMENSION = 2;
const MAX_TERMINAL_DIMENSION = 500;

export interface CliSurfaceRuntime {
  start: (projectId: string, profile: CliSurfaceProfile) => Promise<void>;
  stop: (projectId: string) => void;
  restart: (projectId: string) => Promise<void>;
  write: (projectId: string, data: string) => void;
  resize: (projectId: string, cols: number, rows: number) => void;
}

export interface CliSurfaceIpcPolicy {
  resolveProjectPath: (projectId: string) => string | undefined;
  isWithinKnownProject: (resolvedPath: string) => boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`CLI surface ${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`CLI surface ${label} is required.`);
  }
  if (trimmed.length > maxLength || trimmed.includes('\0')) {
    throw new Error(`CLI surface ${label} is invalid.`);
  }
  return trimmed;
}

function assertOptionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return assertString(value, label, maxLength);
}

function resolveProjectPath(projectId: string, policy?: CliSurfaceIpcPolicy): string | undefined {
  const projectPath = policy?.resolveProjectPath(projectId);
  return projectPath ? path.resolve(projectPath) : undefined;
}

function assertProjectId(projectId: unknown, policy?: CliSurfaceIpcPolicy): {
  projectId: string;
  projectPath?: string;
} {
  const safeProjectId = assertString(projectId, 'project id', MAX_PROJECT_ID_LENGTH);
  const projectPath = resolveProjectPath(safeProjectId, policy);
  if (policy && !projectPath) {
    throw new Error('CLI surface requires a known project.');
  }
  return { projectId: safeProjectId, projectPath };
}

function isInsidePath(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function assertKnownProjectPath(
  candidatePath: unknown,
  label: string,
  policy?: CliSurfaceIpcPolicy,
  expectedProjectPath?: string,
): string {
  const rawPath = assertString(candidatePath, label, 4096);
  const resolvedPath = path.resolve(rawPath);
  if (policy && !policy.isWithinKnownProject(resolvedPath)) {
    throw new Error(`CLI surface ${label} must be inside a known project.`);
  }
  if (expectedProjectPath && !isInsidePath(resolvedPath, expectedProjectPath)) {
    throw new Error(`CLI surface ${label} must be inside the selected project.`);
  }
  return resolvedPath;
}

function sanitizeStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ARGUMENTS) {
    throw new Error(`CLI surface ${label} is invalid.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length > MAX_ARGUMENT_LENGTH || entry.includes('\0')) {
      throw new Error(`CLI surface ${label}[${index}] is invalid.`);
    }
    return entry;
  });
}

function sanitizeEnvPatch(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isPlainRecord(value)) {
    throw new Error('CLI surface environment patch is invalid.');
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_ENV_KEYS) {
    throw new Error('CLI surface environment patch is too large.');
  }
  const sanitized: Record<string, string> = {};
  for (const [key, entryValue] of entries) {
    if (!key || key.length > MAX_ENV_KEY_LENGTH || key.includes('\0')) {
      throw new Error('CLI surface environment key is invalid.');
    }
    if (typeof entryValue !== 'string' || entryValue.length > MAX_ENV_VALUE_LENGTH || entryValue.includes('\0')) {
      throw new Error(`CLI surface environment value for ${key} is invalid.`);
    }
    sanitized[key] = entryValue;
  }
  return sanitized;
}

function sanitizeOptionalTerminalDimension(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < MIN_TERMINAL_DIMENSION ||
    value > MAX_TERMINAL_DIMENSION
  ) {
    throw new Error(`CLI surface ${label} is invalid.`);
  }
  return value;
}

function sanitizeOptionalPort(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('CLI surface preferred port is invalid.');
  }
  return value;
}

function sanitizeProfile(
  projectPath: string | undefined,
  profile: unknown,
  policy?: CliSurfaceIpcPolicy,
): CliSurfaceProfile {
  if (!isPlainRecord(profile)) {
    throw new Error('CLI surface profile is invalid.');
  }

  const cwdSource = profile.cwd ?? projectPath;
  if (!cwdSource) {
    throw new Error('CLI surface profile cwd is required.');
  }

  const portMode = profile.portMode;
  if (portMode !== undefined && portMode !== 'auto' && portMode !== 'fixed' && portMode !== 'off') {
    throw new Error('CLI surface port mode is invalid.');
  }

  const restartPolicy = profile.restartPolicy;
  if (restartPolicy !== undefined && restartPolicy !== 'manual' && restartPolicy !== 'on-exit') {
    throw new Error('CLI surface restart policy is invalid.');
  }

  const allowPortFallback = profile.allowPortFallback;
  if (allowPortFallback !== undefined && typeof allowPortFallback !== 'boolean') {
    throw new Error('CLI surface port fallback flag is invalid.');
  }

  return {
    id: assertString(profile.id, 'profile id', MAX_PROFILE_ID_LENGTH),
    name: assertString(profile.name, 'profile name', MAX_PROFILE_NAME_LENGTH),
    command: assertString(profile.command, 'command', MAX_COMMAND_LENGTH),
    args: sanitizeStringArray(profile.args, 'arguments'),
    cwd: assertKnownProjectPath(cwdSource, 'cwd', policy, projectPath),
    envPatch: sanitizeEnvPatch(profile.envPatch),
    cols: sanitizeOptionalTerminalDimension(profile.cols, 'columns'),
    rows: sanitizeOptionalTerminalDimension(profile.rows, 'rows'),
    startupReadyPattern: assertOptionalString(
      profile.startupReadyPattern,
      'startup ready pattern',
      MAX_READY_PATTERN_LENGTH,
    ),
    restartPolicy,
    portMode,
    preferredPort: sanitizeOptionalPort(profile.preferredPort),
    allowPortFallback,
  };
}

function sanitizeTerminalInput(data: unknown): string | undefined {
  if (typeof data !== 'string') return undefined;
  if (Buffer.byteLength(data, 'utf8') > MAX_TERMINAL_INPUT_BYTES || data.includes('\0')) {
    return undefined;
  }
  return data;
}

export function registerCliSurfaceIpcHandlers(runtime: CliSurfaceRuntime, policy?: CliSurfaceIpcPolicy): void {
  ipcMain.handle('cli-surface:start', async (_event, projectId: string, profile) => {
    const project = assertProjectId(projectId, policy);
    await runtime.start(
      project.projectId,
      sanitizeProfile(project.projectPath, profile, policy),
    );
  });

  ipcMain.handle('cli-surface:discover', (_event, projectPath: string) => {
    return discoverCliSurface(assertKnownProjectPath(projectPath, 'project path', policy));
  });

  ipcMain.handle('cli-surface:stop', (_event, projectId: string) => {
    const project = assertProjectId(projectId, policy);
    runtime.stop(project.projectId);
  });

  ipcMain.handle('cli-surface:restart', async (_event, projectId: string) => {
    const project = assertProjectId(projectId, policy);
    await runtime.restart(project.projectId);
  });

  ipcMain.on('cli-surface:write', (_event, projectId: string, data: string) => {
    try {
      const project = assertProjectId(projectId, policy);
      const safeData = sanitizeTerminalInput(data);
      if (safeData === undefined) return;
      runtime.write(project.projectId, safeData);
    } catch {
      // Fire-and-forget IPC channels cannot return validation failures safely.
    }
  });

  ipcMain.on('cli-surface:resize', (_event, projectId: string, cols: number, rows: number) => {
    try {
      const project = assertProjectId(projectId, policy);
      runtime.resize(
        project.projectId,
        sanitizeOptionalTerminalDimension(cols, 'columns') ?? 80,
        sanitizeOptionalTerminalDimension(rows, 'rows') ?? 24,
      );
    } catch {
      // Fire-and-forget IPC channels cannot return validation failures safely.
    }
  });
}
