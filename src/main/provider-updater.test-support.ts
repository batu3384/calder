import type { CliProviderMeta, ProviderId } from '../shared/types/provider';
import type { ProviderUpdaterRunner, ProviderUpdaterTarget } from './provider-updater';

export function createProviderMeta(id: ProviderId, displayName: string): CliProviderMeta {
  return {
    id,
    displayName,
    binaryName: id,
    capabilities: {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    },
    defaultContextWindowSize: 200_000,
  };
}

export function createTarget(
  id: ProviderId,
  displayName: string,
  binaryPath: string,
  installed = true,
): ProviderUpdaterTarget {
  return {
    meta: createProviderMeta(id, displayName),
    resolveBinaryPath: () => binaryPath,
    clearBinaryCache: () => undefined,
    validatePrerequisites: () =>
      installed ? { ok: true, message: '' } : { ok: false, message: `${displayName} missing` },
  };
}

export class FakeRunner implements ProviderUpdaterRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  private readonly queued = new Map<
    string,
    Array<{ code: number; stdout: string; stderr: string }>
  >();

  enqueue(
    command: string,
    args: string[],
    result: { code: number; stdout?: string; stderr?: string },
  ): void {
    const key = this.key(command, args);
    const bucket = this.queued.get(key) ?? [];
    bucket.push({ code: result.code, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
    this.queued.set(key, bucket);
  }

  async run(
    command: string,
    args: string[],
    _options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    this.calls.push({ command, args: [...args] });
    const key = this.key(command, args);
    const bucket = this.queued.get(key) ?? [];
    if (bucket.length === 0) {
      throw new Error(`No queued response for: ${key}`);
    }
    const next = bucket.shift()!;
    this.queued.set(key, bucket);
    return next;
  }

  private key(command: string, args: string[]): string {
    return `${command}\u0000${args.join('\u0000')}`;
  }
}
