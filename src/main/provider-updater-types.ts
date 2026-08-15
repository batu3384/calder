import type { ProviderUpdateProgressEvent } from '../shared/types/provider';
import type { CliProvider } from './providers/provider';

export interface ProviderUpdaterRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface ProviderUpdateSpec {
  npmPackage?: string;
  brewFormula?: string | string[];
  brewCask?: string | string[];
  selfUpdateArgs?: string[];
}

export interface ProviderUpdaterTarget {
  meta: Pick<CliProvider['meta'], 'id' | 'displayName' | 'binaryName'>;
  resolveBinaryPath(): string;
  validatePrerequisites(): { ok: boolean; message: string };
  clearBinaryCache(): void;
}

export interface ProviderUpdaterOptions {
  runner?: ProviderUpdaterRunner;
  now?: () => number;
  onProgress?: (event: ProviderUpdateProgressEvent) => void;
  signal?: AbortSignal;
}

export interface ResolvedProviderUpdaterOptions {
  runner: ProviderUpdaterRunner;
  now: () => number;
  onProgress?: (event: ProviderUpdateProgressEvent) => void;
  signal?: AbortSignal;
}
