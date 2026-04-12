import * as path from 'path';
import { expandUserPath } from './fs-utils';
import { isWin } from './platform';

function stripMatchingQuotes(value: string): string {
  let current = value.trim();
  while (current.length >= 2) {
    const first = current[0];
    const last = current[current.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      current = current.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return current;
}

function normalizePathLike(value: string): string {
  const expanded = expandUserPath(stripMatchingQuotes(value));
  const normalized = path.normalize(expanded);
  return isWin ? normalized.toLowerCase() : normalized;
}

function tokenizeCommand(command: string): string[] {
  const matches = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return matches.map((part) => stripMatchingQuotes(part)).filter(Boolean);
}

export function isManagedStatusLineCommand(command: string, managedPath: string): boolean {
  const normalizedManagedPath = normalizePathLike(managedPath);
  const tokens = tokenizeCommand(command);

  if (tokens.length === 0) return false;

  return tokens.some((token) => normalizePathLike(token) === normalizedManagedPath);
}
