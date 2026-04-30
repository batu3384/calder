import { describe, expect, it } from 'vitest';
import type { CliProviderMeta, ProviderId } from '../shared/types/provider';
import { updateProviders, type ProviderUpdaterRunner, type ProviderUpdaterTarget } from '../main/provider-updater';

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

function createTarget(id: ProviderId, displayName: string, binaryPath: string): ProviderUpdaterTarget {
  return {
    meta: createProviderMeta(id, displayName),
    resolveBinaryPath: () => binaryPath,
    validatePrerequisites: () => ({ ok: true, message: '' }),
  };
}

class FakeRunner implements ProviderUpdaterRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  private readonly queued = new Map<string, Array<{ code: number; stdout: string; stderr: string }>>();

  enqueue(command: string, args: string[], result: { code: number; stdout?: string; stderr?: string }): void {
    const key = `${command}\u0000${args.join('\u0000')}`;
    const bucket = this.queued.get(key) ?? [];
    bucket.push({ code: result.code, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
    this.queued.set(key, bucket);
  }

  async run(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    this.calls.push({ command, args: [...args] });
    const key = `${command}\u0000${args.join('\u0000')}`;
    const bucket = this.queued.get(key) ?? [];
    if (bucket.length === 0) throw new Error(`No queued response for: ${key}`);
    const next = bucket.shift()!;
    this.queued.set(key, bucket);
    return next;
  }
}

describe('provider update fallbacks', () => {
  it('falls back from Claude Homebrew updates to the built-in updater when brew fails', async () => {
    const runner = new FakeRunner();
    const claudeBinary = '/opt/homebrew/Caskroom/claude-code/1.0.0/claude';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: 'claude 1.0.0' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'claude-code'], {
      code: 1,
      stdout: JSON.stringify({ casks: [{ name: 'claude-code', current_version: '1.0.1' }] }),
    });
    runner.enqueue('brew', ['upgrade', '--cask', 'claude-code'], { code: 1, stderr: 'brew route failed' });
    runner.enqueue(claudeBinary, ['update'], { code: 0, stdout: 'updated' });
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: 'claude 1.0.1' });

    const summary = await updateProviders([createTarget('claude', 'Claude Code', claudeBinary)], {
      runner,
      now: (() => 1_000) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('claude');
    expect(summary.results[0].source).toBe('self');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateAttempted).toBe(true);
    expect(summary.results[0].updateCommand).toBe(`${claudeBinary} update`);
    expect(runner.calls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
      `${claudeBinary} --version`,
      'brew outdated --json=v2 --cask claude-code',
      'brew upgrade --cask claude-code',
      `${claudeBinary} update`,
      `${claudeBinary} --version`,
    ]);
  });

  it('falls back from Gemini Homebrew formula updates to npm when brew fails', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Cellar/gemini-cli/0.38.0/bin/gemini';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.0' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--formula', 'gemini-cli'], {
      code: 1,
      stdout: JSON.stringify({ formulae: [{ name: 'gemini-cli', current_version: '0.38.1' }] }),
    });
    runner.enqueue('brew', ['upgrade', 'gemini-cli'], { code: 1, stderr: 'brew route failed' });
    runner.enqueue('npm', ['view', '@google/gemini-cli', 'version', '--silent'], { code: 0, stdout: '0.38.1' });
    runner.enqueue('npm', ['install', '-g', '@google/gemini-cli@latest'], { code: 0, stdout: 'updated' });
    runner.enqueue('gemini', ['--version'], { code: 0, stdout: '0.38.1' });

    const summary = await updateProviders([createTarget('gemini', 'Gemini CLI', geminiBinary)], {
      runner,
      now: (() => 1_250) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('gemini');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateAttempted).toBe(true);
    expect(summary.results[0].updateCommand).toBe('npm install -g @google/gemini-cli@latest');
    expect(runner.calls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
      `${geminiBinary} --version`,
      'brew outdated --json=v2 --formula gemini-cli',
      'brew upgrade gemini-cli',
      'npm view @google/gemini-cli version --silent',
      'npm install -g @google/gemini-cli@latest',
      'gemini --version',
    ]);
  });
});
