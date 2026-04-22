import type { CliSurfacePortMode } from '../../shared/types/project.js';

export function parseCliSurfaceArgs(raw: string): string[] | undefined {
  const matches = raw.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const args = matches
    .map((token) => token.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return args.length > 0 ? args : undefined;
}

export function parseCliSurfacePortMode(raw: string | undefined, fallback: CliSurfacePortMode = 'auto'): CliSurfacePortMode {
  if (raw === 'auto' || raw === 'fixed' || raw === 'off') return raw;
  return fallback;
}

export function isLikelyFixedPortCompatible(command: string, args: string[] | undefined): boolean {
  const normalized = normalizeCliSurfaceCommand(command);
  if (normalized === 'vite' || normalized === 'astro' || normalized === 'next' || normalized === 'nuxt' || normalized === 'nuxi') {
    return true;
  }
  if (normalized === 'npm' || normalized === 'pnpm' || normalized === 'yarn') {
    return Boolean(parsePackageManagerScriptName(normalized, args));
  }
  return false;
}

function normalizeCliSurfaceCommand(command: string): string {
  const trimmed = command.trim();
  const slashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const base = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
  return base.toLowerCase();
}

function parsePackageManagerScriptName(command: string, args: string[] | undefined): string | undefined {
  if (!args || args.length === 0) return undefined;
  if (command === 'npm') {
    if (args[0] === 'run' || args[0] === 'run-script') return args[1];
    return undefined;
  }
  if (command === 'pnpm') {
    if (args[0] === 'run' || args[0] === 'run-script') return args[1];
    if (!args[0].startsWith('-')) return args[0];
    return undefined;
  }
  if (command === 'yarn') {
    if (args[0] === 'run') return args[1];
    if (!args[0].startsWith('-')) return args[0];
    return undefined;
  }
  return undefined;
}
