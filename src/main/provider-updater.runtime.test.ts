import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliProviderMeta, ProviderId } from '../shared/types/provider';

const mockExecFile = vi.hoisted(() => vi.fn());
const mockGetAllProviders = vi.hoisted(() => vi.fn());
const mockGetFullPath = vi.hoisted(() => vi.fn(() => '/mock/path'));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('./providers/registry', () => ({
  getAllProviders: mockGetAllProviders,
}));

vi.mock('./pty-manager', () => ({
  getFullPath: mockGetFullPath,
}));

import {
  type ProviderUpdaterTarget,
  updateAllProviders,
  updateProviders,
} from './provider-updater';

function createProviderMeta(id: ProviderId, displayName: string): CliProviderMeta {
  return {
    id,
    displayName,
    binaryName: id,
    capabilities: {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    },
    defaultContextWindowSize: 200_000,
  };
}

function createTarget(
  id: ProviderId,
  displayName: string,
  binaryPath: string,
): ProviderUpdaterTarget {
  return {
    meta: createProviderMeta(id, displayName),
    resolveBinaryPath: () => binaryPath,
    validatePrerequisites: () => ({ ok: true, message: '' }),
  };
}

type ExecPlan = {
  command: string;
  args: string[];
  stdout?: string;
  stderr?: string;
  error?: NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
  delayMs?: number;
  onChild?: (child: { killed: boolean; kill: ReturnType<typeof vi.fn> }) => void;
};

describe('provider updater default runner runtime', () => {
  const plans: ExecPlan[] = [];
  const capturedExecOptions: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    plans.length = 0;
    capturedExecOptions.length = 0;

    mockExecFile.mockImplementation(
      (
        command: string,
        args: string[],
        options: Record<string, unknown>,
        callback: (...cbArgs: any[]) => void,
      ) => {
        const next = plans.shift();
        if (!next) {
          throw new Error(`Unexpected execFile call: ${command} ${args.join(' ')}`);
        }
        expect(command).toBe(next.command);
        expect(args).toEqual(next.args);
        capturedExecOptions.push(options);

        const closeHandlers: Array<() => void> = [];
        const child = {
          killed: false,
          kill: vi.fn((signal: string) => {
            if (signal === 'SIGTERM' || signal === 'SIGKILL') {
              child.killed = true;
            }
            return true;
          }),
          once: vi.fn((event: string, handler: () => void) => {
            if (event === 'close') {
              closeHandlers.push(handler);
            }
            return child;
          }),
        };
        next.onChild?.(child);

        const delayMs = next.delayMs ?? 0;
        setTimeout(() => {
          callback(next.error ?? null, next.stdout ?? '', next.stderr ?? '');
          for (const handler of closeHandlers) {
            handler();
          }
        }, delayMs);

        return child;
      },
    );
  });

  it('runs successful updates through the default exec runner', async () => {
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    plans.push(
      { command: codexBinary, args: ['--version'], stdout: 'codex 0.120.0' },
      { command: 'npm', args: ['view', '@openai/codex', 'version', '--silent'], stdout: '0.121.0' },
      { command: 'npm', args: ['install', '-g', '@openai/codex@latest'], stdout: 'updated' },
      { command: codexBinary, args: ['--version'], stdout: 'codex 0.121.0' },
    );

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      now: (() => 10_000) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].source).toBe('npm');
    expect(capturedExecOptions[0]?.timeout).toBe(20_000);
    const env = capturedExecOptions[0]?.env as Record<string, string> | undefined;
    expect(env?.PATH).toBe('/mock/path');
  });

  it('maps default runner command failures into provider error results', async () => {
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    plans.push(
      { command: codexBinary, args: ['--version'], stdout: 'codex 0.120.0' },
      { command: 'npm', args: ['view', '@openai/codex', 'version', '--silent'], stdout: '0.121.0' },
      {
        command: 'npm',
        args: ['install', '-g', '@openai/codex@latest'],
        error: {
          name: 'Error',
          message: 'install failed',
          code: '17',
          stderr: 'permission denied',
        },
        stderr: 'permission denied',
      },
    );

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      now: (() => 10_100) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('error');
    expect(summary.results[0].message).toBe('permission denied');
  });

  it('aborts default runner commands and terminates the child process', async () => {
    const abortController = new AbortController();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    let capturedChild: { killed: boolean; kill: ReturnType<typeof vi.fn> } | null = null;

    plans.push({
      command: codexBinary,
      args: ['--version'],
      delayMs: 10,
      onChild: (child) => {
        capturedChild = child;
        setTimeout(() => abortController.abort(), 0);
      },
      error: {
        name: 'Error',
        message: 'aborted',
        code: '1',
        stdout: '',
        stderr: 'aborted',
      },
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      signal: abortController.signal,
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('cancelled');
    if (!capturedChild) {
      throw new Error('Expected child process handle to be captured');
    }
    const child = capturedChild as { killed: boolean; kill: ReturnType<typeof vi.fn> };
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('handles already-aborted signals when default runner starts a command', async () => {
    const abortController = new AbortController();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';

    const target: ProviderUpdaterTarget = {
      meta: createProviderMeta('codex', 'Codex CLI'),
      resolveBinaryPath: () => codexBinary,
      validatePrerequisites: () => {
        abortController.abort();
        return { ok: true, message: '' };
      },
    };

    const summary = await updateProviders([target], {
      signal: abortController.signal,
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('cancelled');
  });

  it('delegates updateAllProviders to registry-provided targets', async () => {
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    const target = createTarget('codex', 'Codex CLI', codexBinary);
    mockGetAllProviders.mockReturnValue([target]);
    plans.push(
      { command: codexBinary, args: ['--version'], stdout: 'codex 0.121.0' },
      { command: 'npm', args: ['view', '@openai/codex', 'version', '--silent'], stdout: '0.121.0' },
    );

    const summary = await updateAllProviders({ now: (() => 10_500) as () => number });

    expect(mockGetAllProviders).toHaveBeenCalledTimes(1);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].status).toBe('up_to_date');
  });
});
