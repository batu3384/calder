/** Glob patterns for files to exclude from large-file scanning. */
export const DEFAULT_SCAN_IGNORE = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Gemfile.lock',
  'Cargo.lock',
  'composer.lock',
  'poetry.lock',
  'go.sum',
  'Pipfile.lock',
  '*.min.js',
  '*.min.css',
  '*.bundle.js',
  '*.generated.*',
];

/** Directories to exclude from large-file alerts (never worth splitting). */
export const EXCLUDED_DIRECTORIES = [
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
];

/** Extra glob patterns to exclude from large-file alerts (beyond DEFAULT_SCAN_IGNORE). */
export const EXTRA_ALERT_IGNORE = [
  '*.map',
  '*.wasm',
  '*.pb',
  '*.bundle.*',
];

/** Dedicated persistent Chromium partition for Calder browser surfaces. */
export const BROWSER_SESSION_PARTITION = 'persist:calder-live-view';

const MAX_PARTITION_KEY_LENGTH = 48;

function sanitizePartitionKey(rawKey: string | null | undefined): string {
  const trimmed = (rawKey ?? '').trim();
  if (!trimmed) return 'default';
  const sanitized = trimmed
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  if (!sanitized) return 'default';
  return sanitized.slice(0, MAX_PARTITION_KEY_LENGTH);
}

/**
 * Build a project-scoped Chromium partition while keeping persistent storage on disk.
 * Using project IDs prevents localhost cookie collisions between different projects.
 */
export function buildBrowserSessionPartition(projectKey: string | null | undefined): string {
  return `${BROWSER_SESSION_PARTITION}-${sanitizePartitionKey(projectKey)}`;
}
