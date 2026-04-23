import { spawn } from 'child_process';
import { getFullPath } from './pty-manager';

interface StreamingCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function createInstallId(): string {
  return `mobile-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runCommandStreaming(
  command: string,
  args: string[],
  timeoutMs: number,
  onChunk: (source: 'stdout' | 'stderr', chunk: string) => void,
): Promise<StreamingCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, PATH: getFullPath() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1500).unref();
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      stdout += text;
      onChunk('stdout', text);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      stderr += text;
      onChunk('stderr', text);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const message = error.message || `${command} failed`;
      if (stderr.trim().length === 0) {
        stderr = message;
      } else {
        stderr = `${stderr}\n${message}`;
      }
      resolve({ code: 1, stdout, stderr });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (timedOut) {
        const timeoutMessage = `Command timed out after ${Math.round(timeoutMs / 1000)}s.`;
        stderr = stderr.trim().length > 0 ? `${stderr}\n${timeoutMessage}` : timeoutMessage;
        resolve({ code: 124, stdout, stderr });
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
