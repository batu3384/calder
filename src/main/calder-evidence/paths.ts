import * as os from 'node:os';
import * as path from 'node:path';

let dataRootOverride: string | null = null;

export function resolveCalderDataRoot(override?: string): string {
  if (override !== undefined) return override;
  if (dataRootOverride !== null) return dataRootOverride;
  return path.join(os.homedir(), '.calder');
}

export function resolveEvidenceRoot(override?: string): string {
  return path.join(resolveCalderDataRoot(override), 'evidence');
}

export function resolveEvidenceRunDirectory(runId: string, override?: string): string {
  assertSafeRunId(runId);
  return path.join(resolveEvidenceRoot(override), 'runs', runId);
}

export function assertSafeRunId(runId: string): void {
  if (
    !runId ||
    runId.includes('..') ||
    runId.includes('/') ||
    runId.includes('\\') ||
    runId.includes('\0')
  ) {
    throw new Error('Invalid evidence run id');
  }
}

export function __setCalderDataRootForTests(root: string): void {
  dataRootOverride = root;
}

export function __resetCalderDataRootForTests(): void {
  dataRootOverride = null;
}
