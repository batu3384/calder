import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_COMMAND_BASENAMES = new Set([
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'python',
  'python3',
  'bun',
  'deno',
  'vite',
  'astro',
  'nuxt',
  'nuxi',
  'next',
  'react-scripts',
  'expo',
  'turbo',
]);

function normalizeCommandBasename(command: string): string {
  const base = path.basename(command);
  return base.replace(/\.(cmd|exe|ps1)$/i, '').toLowerCase();
}

export function validateSpawnCommand(
  command: string,
): { ok: true; command: string } | { ok: false; error: string } {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return { ok: false, error: 'Command is required' };
  }
  if (command.includes('\0')) {
    return { ok: false, error: 'Command contains NUL byte' };
  }

  const basename = normalizeCommandBasename(command);
  if (!ALLOWED_COMMAND_BASENAMES.has(basename)) {
    return { ok: false, error: `Command not allowlisted: ${basename}` };
  }

  if (path.isAbsolute(command)) {
    try {
      const stat = fs.lstatSync(command);
      if (!stat.isFile()) {
        return { ok: false, error: 'Command path is not a regular file' };
      }
    } catch {
      return { ok: false, error: 'Command path does not exist' };
    }
  }

  return { ok: true, command };
}
