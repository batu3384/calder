import { describe, expect, it } from 'vitest';
import type { CliProviderMeta, ProviderId } from '../shared/types';
import { updateProviders, type ProviderUpdaterRunner, type ProviderUpdaterTarget } from './provider-updater';

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
  installed = true,
): ProviderUpdaterTarget {
  return {
    meta: createProviderMeta(id, displayName),
    resolveBinaryPath: () => binaryPath,
    validatePrerequisites: () => (installed
      ? { ok: true, message: '' }
      : { ok: false, message: `${displayName} missing` }),
  };
}

class FakeRunner implements ProviderUpdaterRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  private readonly queued = new Map<string, Array<{ code: number; stdout: string; stderr: string }>>();

  enqueue(command: string, args: string[], result: { code: number; stdout?: string; stderr?: string }): void {
    const key = this.key(command, args);
    const bucket = this.queued.get(key) ?? [];
    bucket.push({ code: result.code, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
    this.queued.set(key, bucket);
  }

  async run(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
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

describe('updateProviders', () => {
  it('updates npm-backed providers when a newer npm version exists', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.120.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], { code: 0, stdout: '0.121.0' });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], { code: 0, stdout: 'updated' });
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 1_000) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].beforeVersion).toBe('0.120.0');
    expect(summary.results[0].latestVersion).toBe('0.121.0');
    expect(summary.results[0].afterVersion).toBe('0.121.0');
    expect(summary.results[0].updateCommand).toBe('npm install -g @openai/codex@latest');
  });

  it('skips providers that are not installed', async () => {
    const runner = new FakeRunner();
    const summary = await updateProviders(
      [createTarget('blackbox', 'Blackbox CLI', '/usr/local/bin/blackbox', false)],
      { runner, now: (() => 2_000) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('blackbox');
    expect(summary.results[0].status).toBe('skipped');
    expect(summary.results[0].message).toContain('not installed');
    expect(runner.calls).toHaveLength(0);
  });

  it('marks brew formula providers as up to date when latest equals current', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Cellar/gemini-cli/0.37.1/bin/gemini';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.37.1' });
    runner.enqueue('brew', ['info', '--json=v2', 'gemini-cli'], {
      code: 0,
      stdout: JSON.stringify({
        formulae: [{ versions: { stable: '0.37.1' } }],
      }),
    });

    const summary = await updateProviders(
      [createTarget('gemini', 'Gemini CLI', geminiBinary)],
      { runner, now: (() => 3_000) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('gemini');
    expect(summary.results[0].source).toBe('brew-formula');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].latestVersion).toBe('0.37.1');
  });

  it('uses built-in self update commands for self-managed providers', async () => {
    const runner = new FakeRunner();
    const claudeBinary = '/Users/test/.local/bin/claude';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.109' });
    runner.enqueue(claudeBinary, ['update'], { code: 0, stdout: 'updated' });
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.110' });

    const summary = await updateProviders(
      [createTarget('claude', 'Claude Code', claudeBinary)],
      { runner, now: (() => 4_000) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('claude');
    expect(summary.results[0].source).toBe('self');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateCommand).toBe(`${claudeBinary} update`);
  });
});
