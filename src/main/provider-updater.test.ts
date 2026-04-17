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

  it('marks brew formula providers as up to date when brew reports no outdated version', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Cellar/gemini-cli/0.37.1/bin/gemini';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.37.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--formula', 'gemini-cli'], {
      code: 0,
      stdout: JSON.stringify({
        formulae: [],
        casks: [],
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
    expect(summary.results[0].checkCommand).toBe('brew outdated --json=v2 --formula gemini-cli');
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

  it('prefers npm updates for providers installed from npm even when self-update exists', async () => {
    const runner = new FakeRunner();
    const claudeBinary = '/Users/test/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.js';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.109' });
    runner.enqueue('npm', ['view', '@anthropic-ai/claude-code', 'version', '--silent'], { code: 0, stdout: '2.1.110' });
    runner.enqueue('npm', ['install', '-g', '@anthropic-ai/claude-code@latest'], { code: 0, stdout: 'updated' });
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.110' });

    const summary = await updateProviders(
      [createTarget('claude', 'Claude Code', claudeBinary)],
      { runner, now: (() => 4_250) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('claude');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateCommand).toBe('npm install -g @anthropic-ai/claude-code@latest');
  });

  it('uses npm-based checks for Copilot instead of self-update commands', async () => {
    const runner = new FakeRunner();
    const copilotBinary = '/Users/test/.npm-global/lib/node_modules/@github/copilot/bin/copilot.js';
    runner.enqueue(copilotBinary, ['--version'], { code: 0, stdout: 'GitHub Copilot CLI 1.0.30.' });
    runner.enqueue('npm', ['view', '@github/copilot', 'version', '--silent'], { code: 0, stdout: '1.0.30' });

    const summary = await updateProviders(
      [createTarget('copilot', 'GitHub Copilot', copilotBinary)],
      { runner, now: (() => 4_500) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('copilot');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].checkCommand).toBe('npm view @github/copilot version --silent');
    expect(summary.results[0].updateCommand).toBeUndefined();
  });

  it('uses brew outdated checks for cask-installed providers', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/opt/homebrew/Caskroom/codex/0.121.0/codex';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'codex'], {
      code: 0,
      stdout: JSON.stringify({
        formulae: [],
        casks: [],
      }),
    });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 4_550) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].checkCommand).toBe('brew outdated --json=v2 --cask codex');
  });

  it('continues update flow when brew check payloads cannot be parsed', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Cellar/gemini-cli/0.37.1/bin/gemini';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.37.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--formula', 'gemini-cli'], {
      code: 0,
      stdout: '{ not valid json',
    });
    runner.enqueue('brew', ['info', '--json=v2', 'gemini-cli'], {
      code: 0,
      stdout: '{ not valid json',
    });
    runner.enqueue('brew', ['upgrade', 'gemini-cli'], { code: 0, stdout: 'already up to date' });
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.37.1' });

    const summary = await updateProviders(
      [createTarget('gemini', 'Gemini CLI', geminiBinary)],
      { runner, now: (() => 4_575) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('gemini');
    expect(summary.results[0].source).toBe('brew-formula');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(true);
    expect(summary.results[0].latestVersion).toBeUndefined();
    expect(summary.results[0].updateCommand).toBe('brew upgrade gemini-cli');
  });

  it('detects brew formula updates from outdated data and upgrades without relying on stale info data', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Cellar/gemini-cli/0.38.0/bin/gemini';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.0' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--formula', 'gemini-cli'], {
      code: 1,
      stdout: JSON.stringify({
        formulae: [{
          name: 'gemini-cli',
          installed_versions: ['0.38.0'],
          current_version: '0.38.1',
        }],
      }),
    });
    runner.enqueue('brew', ['upgrade', 'gemini-cli'], { code: 0, stdout: 'upgraded' });
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.1' });

    const summary = await updateProviders(
      [createTarget('gemini', 'Gemini CLI', geminiBinary)],
      { runner, now: (() => 4_576) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('gemini');
    expect(summary.results[0].source).toBe('brew-formula');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].latestVersion).toBe('0.38.1');
    expect(summary.results[0].checkCommand).toBe('brew outdated --json=v2 --formula gemini-cli');
    expect(runner.calls.some((call) => (
      call.command === 'brew' && call.args[0] === 'info'
    ))).toBe(false);
  });

  it('detects Copilot installed from Homebrew cask and applies cask update strategy', async () => {
    const runner = new FakeRunner();
    const copilotBinary = '/opt/homebrew/Caskroom/copilot-cli/1.0.30/copilot';
    runner.enqueue(copilotBinary, ['--version'], { code: 0, stdout: 'GitHub Copilot CLI 1.0.30.' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'copilot-cli'], {
      code: 0,
      stdout: JSON.stringify({
        formulae: [],
        casks: [],
      }),
    });

    const summary = await updateProviders(
      [createTarget('copilot', 'GitHub Copilot', copilotBinary)],
      { runner, now: (() => 4_590) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('copilot');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].checkCommand).toBe('brew outdated --json=v2 --cask copilot-cli');
  });

  it('skips provider updates when installation source cannot be determined', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/usr/local/bin/codex';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 4_580) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('unknown');
    expect(summary.results[0].status).toBe('skipped');
    expect(summary.results[0].checked).toBe(true);
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].message).toContain('could not be determined');
  });

  it('skips providers gracefully when update spec is missing', async () => {
    const runner = new FakeRunner();

    const summary = await updateProviders(
      [createTarget('unknown-provider' as ProviderId, 'Unknown Provider', '/usr/local/bin/unknown')],
      { runner, now: (() => 4_590) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('unknown-provider');
    expect(summary.results[0].status).toBe('skipped');
    expect(summary.results[0].source).toBe('unknown');
    expect(summary.results[0].checked).toBe(false);
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].message).toContain('No update strategy configured');
    expect(runner.calls).toHaveLength(0);
  });

  it('treats two-part versions as comparable and avoids unnecessary updates', async () => {
    const runner = new FakeRunner();
    const claudeBinary = '/Users/test/.local/bin/claude';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: 'Claude Code v2.1' });
    runner.enqueue(claudeBinary, ['update'], { code: 0, stdout: 'already up to date' });
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: 'Claude Code v2.1' });

    const summary = await updateProviders(
      [createTarget('claude', 'Claude Code', claudeBinary)],
      { runner, now: (() => 4_600) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('2.1');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(true);
  });

  it('treats semver build metadata as equivalent when comparing versions', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0+build.42' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], { code: 0, stdout: '0.121.0' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 4_700) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('0.121.0+build.42');
    expect(summary.results[0].latestVersion).toBe('0.121.0');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
  });

  it('treats prerelease versions as lower than stable and applies updates', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0-rc.1' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], { code: 0, stdout: '0.121.0' });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], { code: 0, stdout: 'updated' });
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 4_750) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('0.121.0-rc.1');
    expect(summary.results[0].latestVersion).toBe('0.121.0');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateAttempted).toBe(true);
  });

  it('does not downgrade stable versions when latest channel is prerelease', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], { code: 0, stdout: '0.121.0-rc.2' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 4_800) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('0.121.0');
    expect(summary.results[0].latestVersion).toBe('0.121.0-rc.2');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
  });

  it('compares prerelease identifiers numerically when both versions are prerelease', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0-rc.1' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], { code: 0, stdout: '0.121.0-rc.2' });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], { code: 0, stdout: 'updated' });
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0-rc.2' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 4_850) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('0.121.0-rc.1');
    expect(summary.results[0].latestVersion).toBe('0.121.0-rc.2');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateAttempted).toBe(true);
  });

  it('treats equal prerelease versions as up to date', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0-rc.1' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], { code: 0, stdout: '0.121.0-rc.1' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      { runner, now: (() => 4_875) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('0.121.0-rc.1');
    expect(summary.results[0].latestVersion).toBe('0.121.0-rc.1');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
  });

  it('emits provider update progress events from start to finish', async () => {
    const runner = new FakeRunner();
    const progressEvents: string[] = [];

    const summary = await updateProviders(
      [createTarget('blackbox', 'Blackbox CLI', '/usr/local/bin/blackbox', false)],
      {
        runner,
        now: (() => 5_000) as () => number,
        onProgress: (event) => {
          progressEvents.push(event.phase);
        },
      },
    );

    expect(summary.results).toHaveLength(1);
    expect(progressEvents).toEqual([
      'started',
      'provider_started',
      'provider_finished',
      'finished',
    ]);
  });

  it('emits running stage messages for the active provider while update checks execute', async () => {
    const runner = new FakeRunner();
    const progressEvents: Array<{
      phase: string;
      providerMessage?: string;
    }> = [];
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], { code: 0, stdout: '0.121.0' });

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      {
        runner,
        now: (() => 5_250) as () => number,
        onProgress: (event) => {
          progressEvents.push({
            phase: event.phase,
            providerMessage: event.providerMessage,
          });
        },
      },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('up_to_date');
    expect(progressEvents.some((event) => event.providerMessage === 'Checking installed version…')).toBe(true);
    expect(progressEvents.some((event) => event.providerMessage === 'Checking latest npm version…')).toBe(true);
    expect(progressEvents.some((event) => event.providerMessage === 'Already up to date.')).toBe(true);
  });

  it('marks summary as cancelled when update run is aborted', async () => {
    const abortController = new AbortController();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    const runner: ProviderUpdaterRunner = {
      async run(command, args, options) {
        if (command === codexBinary && args[0] === '--version') {
          return { code: 0, stdout: 'codex 0.120.0', stderr: '' };
        }
        if (command === 'npm' && args[0] === 'view') {
          return { code: 0, stdout: '0.121.0', stderr: '' };
        }
        if (command === 'npm' && args[0] === 'install') {
          abortController.abort();
          return {
            code: options?.signal?.aborted ? 130 : 1,
            stdout: '',
            stderr: 'Update cancelled.',
          };
        }
        return { code: 1, stdout: '', stderr: 'Unexpected command' };
      },
    };

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', codexBinary)],
      {
        runner,
        signal: abortController.signal,
      },
    );

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('cancelled');
    expect(summary.results[0].message).toContain('cancelled');
  });
});
