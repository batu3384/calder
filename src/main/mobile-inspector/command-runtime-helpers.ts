import { execFile, spawn } from 'child_process';

import { getFullPath } from '../pty-manager';

const COMMAND_TIMEOUT_MS = 20_000;

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface BinaryCommandResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function buildCommandEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: getFullPath() };
}

export function isLikelyCommandMissing(result: { stderr: string }): boolean {
  return /ENOENT|not found|No such file or directory/i.test(result.stderr);
}

export function firstNonEmptyLine(...chunks: Array<string | undefined>): string {
  for (const chunk of chunks) {
    if (!chunk) continue;
    const line = chunk
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);
    if (line) return line;
  }
  return '';
}

export function runCommand(command: string, args: string[], timeoutMs: number = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        env: buildCommandEnv(),
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        const err = error as NodeJS.ErrnoException & {
          code?: number | string;
          stdout?: string;
          stderr?: string;
        };
        const message = err.message || '';
        const mergedErr = [err.stderr ?? stderr ?? '', message].filter(Boolean).join('\n').trim();
        resolve({
          code: typeof err.code === 'number' ? err.code : 1,
          stdout: err.stdout ?? stdout ?? '',
          stderr: mergedErr,
        });
      },
    );
  });
}

export function runBinaryCommand(command: string, args: string[], timeoutMs: number = COMMAND_TIMEOUT_MS): Promise<BinaryCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: buildCommandEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1000).unref();
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stderr = Buffer.concat([
        ...stderrChunks,
        Buffer.from((error.message || '').trim(), 'utf8'),
      ]).toString('utf8').trim();
      resolve({
        code: 1,
        stdout: Buffer.concat(stdoutChunks),
        stderr,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      if (timedOut) {
        resolve({
          code: 124,
          stdout: Buffer.concat(stdoutChunks),
          stderr: [stderr, `Command timed out after ${Math.round(timeoutMs / 1000)}s.`].filter(Boolean).join('\n'),
        });
        return;
      }
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks),
        stderr,
      });
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
