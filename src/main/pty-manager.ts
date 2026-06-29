import { execFile, execFileSync } from 'child_process';
import * as pty from 'node-pty';

import type { ProviderId } from '../shared/types/provider';
import { buildBrowserBridgeEnv } from './browser-bridge';
import { getFullPath } from './full-path';
import { registerSession } from './hooks/hook-status';
import { isWin } from './platform';
import { buildProviderBaseEnv } from './provider-env';
import { getProvider } from './providers/registry';
import {
  sanitizeArgs,
  sanitizeExtraArgs,
  sanitizeInitialPrompt,
  sanitizeSessionId,
  sanitizeSpawnArgs,
  validateCwd,
} from './security/sanitize';
import { validateSpawnCommand } from './security/spawn-command';

export { getFullPath } from './full-path';

interface PtyInstance {
  process: pty.IPty;
  sessionId: string;
}

const ptys = new Map<string, PtyInstance>();
const silencedExits = new Set<string>();
const RESUME_SESSION_MISSING_PATTERN =
  /no\s+conversation\s+found\s+with\s+session\s+id|session(?:\s+id)?[\s\S]{0,160}?not\s+found/i;

export function spawnPty(
  sessionId: string,
  cwd: string,
  cliSessionId: string | null,
  isResume: boolean,
  extraArgs: string,
  providerId: ProviderId,
  initialPrompt: string | undefined,
  onData: (data: string) => void,
  onExit: (exitCode: number, signal?: number) => void,
): void {
  const sessionIdResult = sanitizeSessionId(sessionId);
  if (!sessionIdResult.ok) {
    throw new Error(`Invalid session ID: ${sessionIdResult.error}`);
  }

  const cwdResult = validateCwd(cwd);
  if (!cwdResult.ok) {
    throw new Error(`Invalid CWD: ${cwdResult.error}`);
  }

  if (ptys.has(sessionId)) {
    // Silence the old PTY's exit event so it doesn't remove the new session
    silencedExits.add(sessionId);
    killPty(sessionId);
  }

  registerSession(sessionId, providerId);

  const sanitizedExtraArgs = sanitizeExtraArgs(extraArgs);

  let sanitizedInitialPrompt: string | undefined;
  if (initialPrompt !== undefined && initialPrompt !== '') {
    const promptResult = sanitizeInitialPrompt(initialPrompt);
    if (!promptResult.ok) {
      throw new Error(`Invalid initial prompt: ${promptResult.error}`);
    }
    sanitizedInitialPrompt = promptResult.value;
  }

  const provider = getProvider(providerId);
  const baseEnv = buildProviderBaseEnv(providerId, { ...process.env } as Record<string, string>);
  const env = buildBrowserBridgeEnv(cwd, provider.buildEnv(sessionId, baseEnv));
  const shell = provider.resolveBinaryPath();
  let attemptedResumeFallback = false;

  const spawnAttempt = (attemptCliSessionId: string | null, attemptIsResume: boolean): void => {
    const args = provider.buildArgs({
      cliSessionId: attemptCliSessionId,
      isResume: attemptIsResume,
      extraArgs: sanitizedExtraArgs.join(' '),
      initialPrompt: sanitizedInitialPrompt,
    });
    const sanitizedArgs = sanitizeSpawnArgs(args, sanitizedInitialPrompt);
    const ptyProcess = pty.spawn(shell, sanitizedArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env,
    });
    let shouldRetryWithoutResume = false;

    ptyProcess.onData((data) => {
      onData(data);
      if (
        !attemptedResumeFallback &&
        attemptIsResume &&
        !!attemptCliSessionId &&
        RESUME_SESSION_MISSING_PATTERN.test(data)
      ) {
        attemptedResumeFallback = true;
        shouldRetryWithoutResume = true;
        onData(
          '\r\n[Calder] Previous session could not be resumed. Starting a fresh session...\r\n',
        );
        ptyProcess.kill();
      }
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
      // Only remove from map if this PTY is still the active one for this session
      const current = ptys.get(sessionId);
      if (current?.process === ptyProcess) {
        ptys.delete(sessionId);
      }
      if (shouldRetryWithoutResume) {
        spawnAttempt(null, false);
        return;
      }
      onExit(exitCode, signal);
    });

    ptys.set(sessionId, { process: ptyProcess, sessionId });
  };

  spawnAttempt(cliSessionId, isResume);
}

export function spawnCommandPty(
  sessionId: string,
  launch: {
    command: string;
    args?: string[];
    cwd: string;
    envPatch?: Record<string, string>;
    cols?: number;
    rows?: number;
  },
  onData: (data: string) => void,
  onExit: (exitCode: number, signal?: number) => void,
): void {
  const sessionIdResult = sanitizeSessionId(sessionId);
  if (!sessionIdResult.ok) {
    throw new Error(`Invalid session ID: ${sessionIdResult.error}`);
  }

  if (ptys.has(sessionId)) {
    silencedExits.add(sessionId);
    killPty(sessionId);
  }

  const commandResult = validateSpawnCommand(launch.command);
  if (!commandResult.ok) {
    throw new Error(`Invalid CLI surface command: ${commandResult.error}`);
  }

  const baseEnv = { ...process.env, PATH: getFullPath(), ...(launch.envPatch ?? {}) } as Record<
    string,
    string
  >;
  const env = buildBrowserBridgeEnv(launch.cwd, baseEnv);
  const sanitizedArgs = launch.args ? sanitizeArgs(launch.args) : [];
  const ptyProcess = pty.spawn(commandResult.command, sanitizedArgs, {
    name: 'xterm-256color',
    cols: launch.cols ?? 120,
    rows: launch.rows ?? 30,
    cwd: launch.cwd,
    env,
  });

  ptyProcess.onData((data) => onData(data));
  ptyProcess.onExit(({ exitCode, signal }) => {
    const current = ptys.get(sessionId);
    if (current?.process === ptyProcess) {
      ptys.delete(sessionId);
    }
    onExit(exitCode, signal);
  });

  ptys.set(sessionId, { process: ptyProcess, sessionId });
}

export function writePty(sessionId: string, data: string): boolean {
  const instance = ptys.get(sessionId);
  if (!instance) {
    return false;
  }
  instance.process.write(data);
  return true;
}

export function hasPtySession(sessionId: string): boolean {
  return ptys.has(sessionId);
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const instance = ptys.get(sessionId);
  if (instance) {
    try {
      instance.process.resize(cols, rows);
    } catch (err) {
      console.warn(`[pty-manager] resize(${sessionId}, cols=${cols}, rows=${rows}) threw:`, err);
    }
  }
}

export function killPty(sessionId: string): void {
  const instance = ptys.get(sessionId);
  if (instance) {
    const rootPid = Number((instance.process as unknown as { pid?: number }).pid);
    if (Number.isFinite(rootPid) && rootPid > 0) {
      terminateProcessTree(rootPid);
    }
    try {
      instance.process.kill();
    } catch (err) {
      console.warn(`[pty-manager] kill(${sessionId}) process.kill threw:`, err);
    }
    ptys.delete(sessionId);
    // Note: silencedExits.delete(sessionId) is intentionally NOT called here.
    // silencedExits tracks whether the exit event for THIS PTY should be silenced.
    // That decision is made at spawn time, not at kill time.
    // The exit handler itself removes the sessionId from silencedExits when it fires.
    // Adding delete here would break the silencing of old PTY exits during session respawn.
  }
}

function terminateProcessTree(rootPid: number): void {
  if (isWin) {
    // /T = terminate child processes, /F = force
    execFile('taskkill', ['/PID', String(rootPid), '/T', '/F'], { timeout: 2500 }, () => {});
    return;
  }

  // Kill known descendants first so detached dev servers don't survive parent shell teardown.
  const descendants = collectDescendantPids(rootPid).reverse();
  for (const pid of descendants) {
    terminatePid(pid);
  }
  terminatePid(rootPid);
}

function collectDescendantPids(rootPid: number): number[] {
  const descendants: number[] = [];
  const seen = new Set<number>([rootPid]);

  function walk(parentPid: number): void {
    const children = listChildPids(parentPid);
    for (const childPid of children) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      walk(childPid);
    }
  }

  walk(rootPid);
  return descendants;
}

function listChildPids(parentPid: number): number[] {
  try {
    const stdout = execFileSync('pgrep', ['-P', String(parentPid)], {
      encoding: 'utf-8',
      timeout: 1200,
    });
    return stdout
      .split('\n')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function terminatePid(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process already exited or inaccessible
  }
}

export function spawnShellPty(
  sessionId: string,
  cwd: string,
  onData: (data: string) => void,
  onExit: (exitCode: number, signal?: number) => void,
): void {
  const sessionIdResult = sanitizeSessionId(sessionId);
  if (!sessionIdResult.ok) {
    throw new Error(`Invalid session ID: ${sessionIdResult.error}`);
  }

  if (ptys.has(sessionId)) {
    killPty(sessionId);
  }

  const shell = isWin ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/zsh';
  const shellEnv = buildBrowserBridgeEnv(cwd, { ...process.env, PATH: getFullPath() });
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 15,
    cwd,
    env: shellEnv,
  });

  ptyProcess.onData((data) => onData(data));
  ptyProcess.onExit(({ exitCode, signal }) => {
    ptys.delete(sessionId);
    onExit(exitCode, signal);
  });

  ptys.set(sessionId, { process: ptyProcess, sessionId });
}

export function consumeSilencedExitFlag(sessionId: string): boolean {
  return silencedExits.delete(sessionId);
}

/** @deprecated Use consumeSilencedExitFlag — name reflects delete side-effect. */
export const isSilencedExit = consumeSilencedExitFlag;

export function killAllPtys(): void {
  for (const [id] of ptys) {
    killPty(id);
  }
}

/**
 * Get the current working directory of a PTY's deepest child process.
 * Uses pgrep/lsof on Unix. Not supported on Windows (returns null).
 */
export function getPtyCwd(sessionId: string): Promise<string | null> {
  const instance = ptys.get(sessionId);
  if (!instance) return Promise.resolve(null);

  const pid = instance.process.pid;

  if (isWin) {
    return getPtyCwdWindows(pid);
  }

  return new Promise((resolve) => {
    // Find deepest child process recursively
    findDeepestChild(pid, (deepestPid) => {
      // Read cwd of the deepest process via lsof
      execFile(
        'lsof',
        ['-a', '-d', 'cwd', '-Fn', '-p', String(deepestPid)],
        { timeout: 3000 },
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          // Parse lsof output: lines starting with 'n' contain the path
          for (const line of stdout.split('\n')) {
            if (line.startsWith('n') && line.length > 1) {
              resolve(line.slice(1));
              return;
            }
          }
          resolve(null);
        },
      );
    });
  });
}

function getPtyCwdWindows(_pid: number): Promise<string | null> {
  // Windows does not expose process cwd reliably via standard APIs.
  // This is a best-effort no-op — cwd tracking is not supported on Windows.
  return Promise.resolve(null);
}

function findDeepestChild(pid: number, callback: (deepestPid: number) => void): void {
  execFile('pgrep', ['-P', String(pid)], { timeout: 3000 }, (err, stdout) => {
    if (err || !stdout.trim()) {
      // No children — this is the deepest
      callback(pid);
      return;
    }
    const children = stdout
      .trim()
      .split('\n')
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n));
    if (children.length === 0) {
      callback(pid);
      return;
    }
    // Recurse into the last child (most recent)
    findDeepestChild(children[children.length - 1], callback);
  });
}
