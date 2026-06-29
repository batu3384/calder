import { describe, expect, it } from 'vitest';

import type { CliProviderMeta, ProviderId } from '../shared/types/provider';
import {
  type ProviderUpdaterRunner,
  type ProviderUpdaterTarget,
  updateProvider,
  updateProviders,
} from './provider-updater';
import { runProviderUpdate } from './provider-updater-update-helpers';

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
    validatePrerequisites: () =>
      installed ? { ok: true, message: '' } : { ok: false, message: `${displayName} missing` },
  };
}

class FakeRunner implements ProviderUpdaterRunner {
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

describe('updateProviders', () => {
  it('updates npm-backed providers when a newer npm version exists', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.120.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], {
      code: 0,
      stdout: 'updated',
    });
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 1_000) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].beforeVersion).toBe('0.120.0');
    expect(summary.results[0].latestVersion).toBe('0.121.0');
    expect(summary.results[0].afterVersion).toBe('0.121.0');
    expect(summary.results[0].updateCommand).toBe('npm install -g @openai/codex@latest');
  });

  it('falls back to npm when unknown source self-update fails for a self-managed cli', async () => {
    const runner = new FakeRunner();
    const claudeBinary = '/opt/tools/claude';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.109' });
    runner.enqueue(claudeBinary, ['update'], { code: 1, stderr: 'update not supported' });
    runner.enqueue('npm', ['view', '@anthropic-ai/claude-code', 'version', '--silent'], {
      code: 0,
      stdout: '2.1.110',
    });
    runner.enqueue('npm', ['install', '-g', '@anthropic-ai/claude-code@latest'], {
      code: 0,
      stdout: 'updated',
    });
    runner.enqueue('claude', ['--version'], { code: 0, stdout: '2.1.110' });

    const summary = await updateProviders([createTarget('claude', 'Claude Code', claudeBinary)], {
      runner,
      now: (() => 4_570) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('claude');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateCommand).toBe(
      'npm install -g @anthropic-ai/claude-code@latest',
    );
    expect(runner.calls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
      `${claudeBinary} --version`,
      `${claudeBinary} update`,
      'npm view @anthropic-ai/claude-code version --silent',
      'npm install -g @anthropic-ai/claude-code@latest',
      'claude --version',
    ]);
  });

  it('skips providers that are not installed', async () => {
    const runner = new FakeRunner();
    const summary = await updateProviders(
      [createTarget('qwen', 'Qwen Code', '/usr/local/bin/qwen', false)],
      { runner, now: (() => 2_000) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('qwen');
    expect(summary.results[0].status).toBe('skipped');
    expect(summary.results[0].message).toContain('not installed');
    expect(runner.calls).toHaveLength(0);
  });

  it('marks brew cask providers as up to date when brew reports no outdated version', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Caskroom/antigravity-cli/0.37.1/agy';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.37.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: JSON.stringify({ formulae: [], casks: [] }),
    });
    runner.enqueue('npm', ['view', '@google/antigravity-cli', 'version', '--silent'], {
      code: 0,
      stdout: '0.37.1',
    });

    const summary = await updateProviders(
      [createTarget('antigravity', 'Antigravity CLI', geminiBinary)],
      { runner, now: (() => 3_000) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('antigravity');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].latestVersion).toBe('0.37.1');
    expect(summary.results[0].checkCommand).toBe('brew outdated --json=v2 --cask antigravity-cli');
  });

  it('falls back to self update when Homebrew cask upgrade fails', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Caskroom/antigravity-cli/0.38.1/agy';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 1,
      stdout: JSON.stringify({
        formulae: [],
        casks: [{ name: 'antigravity-cli', current_version: '0.38.2' }],
      }),
    });
    runner.enqueue('brew', ['upgrade', '--cask', 'antigravity-cli'], {
      code: 1,
      stderr: 'brew route failed',
    });
    runner.enqueue(geminiBinary, ['update'], { code: 0, stdout: 'updated' });
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.2' });

    const summary = await updateProviders(
      [createTarget('antigravity', 'Antigravity CLI', geminiBinary)],
      { runner, now: (() => 3_050) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('antigravity');
    expect(summary.results[0].source).toBe('self');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateAttempted).toBe(true);
    expect(summary.results[0].latestVersion).toBeUndefined();
    expect(summary.results[0].updateCommand).toBe(`${geminiBinary} update`);
    expect(runner.calls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
      `${geminiBinary} --version`,
      'brew outdated --json=v2 --cask antigravity-cli',
      'brew upgrade --cask antigravity-cli',
      `${geminiBinary} update`,
      `${geminiBinary} --version`,
    ]);
  });

  it('keeps brew cask providers as up_to_date when npm upstream lookup is unavailable', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Caskroom/antigravity-cli/0.38.1/agy';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: JSON.stringify({ formulae: [], casks: [] }),
    });
    runner.enqueue('npm', ['view', '@google/antigravity-cli', 'version', '--silent'], {
      code: 1,
      stderr: 'network error',
    });

    const summary = await updateProviders(
      [createTarget('antigravity', 'Antigravity CLI', geminiBinary)],
      { runner, now: (() => 3_075) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('antigravity');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
  });

  it('uses built-in self update commands for self-managed providers', async () => {
    const runner = new FakeRunner();
    const claudeBinary = '/Users/test/.local/bin/claude';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.109' });
    runner.enqueue(claudeBinary, ['update'], { code: 0, stdout: 'updated' });
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.110' });

    const summary = await updateProviders([createTarget('claude', 'Claude Code', claudeBinary)], {
      runner,
      now: (() => 4_000) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('claude');
    expect(summary.results[0].source).toBe('self');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateCommand).toBe(`${claudeBinary} update`);
  });

  it('prefers npm updates for providers installed from npm even when self-update exists', async () => {
    const runner = new FakeRunner();
    const claudeBinary =
      '/Users/test/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.js';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.109' });
    runner.enqueue('npm', ['view', '@anthropic-ai/claude-code', 'version', '--silent'], {
      code: 0,
      stdout: '2.1.110',
    });
    runner.enqueue('npm', ['install', '-g', '@anthropic-ai/claude-code@latest'], {
      code: 0,
      stdout: 'updated',
    });
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: '2.1.110' });

    const summary = await updateProviders([createTarget('claude', 'Claude Code', claudeBinary)], {
      runner,
      now: (() => 4_250) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('claude');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateCommand).toBe(
      'npm install -g @anthropic-ai/claude-code@latest',
    );
  });

  it('uses npm-based checks for Copilot instead of self-update commands', async () => {
    const runner = new FakeRunner();
    const copilotBinary = '/Users/test/.npm-global/lib/node_modules/@github/copilot/bin/copilot.js';
    runner.enqueue(copilotBinary, ['--version'], { code: 0, stdout: 'GitHub Copilot CLI 1.0.30.' });
    runner.enqueue('npm', ['view', '@github/copilot', 'version', '--silent'], {
      code: 0,
      stdout: '1.0.30',
    });

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
      stdout: JSON.stringify({ formulae: [], casks: [] }),
    });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_550) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].checkCommand).toBe('brew outdated --json=v2 --cask codex');
  });

  it('detects Claude Code installed from Homebrew latest cask before falling back to self update', async () => {
    const runner = new FakeRunner();
    const claudeBinary = '/opt/homebrew/Caskroom/claude-code@latest/2.1.109/claude';
    runner.enqueue(claudeBinary, ['--version'], { code: 0, stdout: 'Claude Code 2.1.109' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'claude-code@latest'], {
      code: 0,
      stdout: JSON.stringify({ formulae: [], casks: [] }),
    });
    runner.enqueue('npm', ['view', '@anthropic-ai/claude-code', 'version', '--silent'], {
      code: 0,
      stdout: '2.1.109',
    });

    const summary = await updateProviders([createTarget('claude', 'Claude Code', claudeBinary)], {
      runner,
      now: (() => 4_565) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('claude');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].checkCommand).toBe(
      'brew outdated --json=v2 --cask claude-code@latest',
    );
    expect(
      runner.calls.some(
        (call) => call.command === claudeBinary && call.args.join(' ') === 'update',
      ),
    ).toBe(false);
  });

  it('marks brew cask providers as sync_pending when npm upstream is newer than Homebrew metadata', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/opt/homebrew/Caskroom/codex/0.121.0/codex';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'codex'], {
      code: 0,
      stdout: JSON.stringify({ formulae: [], casks: [] }),
    });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.122.0',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_560) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('sync_pending');
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].latestVersion).toBe('0.122.0');
    expect(summary.results[0].message).toContain('Homebrew');
    expect(runner.calls.some((call) => call.command === 'brew' && call.args[0] === 'upgrade')).toBe(
      false,
    );
  });

  it('continues update flow when brew check payloads cannot be parsed', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Caskroom/antigravity-cli/0.37.1/agy';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.37.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: '{ not valid json',
    });
    runner.enqueue('brew', ['info', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: '{ not valid json',
    });
    runner.enqueue('brew', ['upgrade', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: 'already up to date',
    });
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.37.1' });

    const summary = await updateProviders(
      [createTarget('antigravity', 'Antigravity CLI', geminiBinary)],
      { runner, now: (() => 4_575) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('antigravity');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(true);
    expect(summary.results[0].latestVersion).toBeUndefined();
    expect(summary.results[0].updateCommand).toBe('brew upgrade --cask antigravity-cli');
  });

  it('detects brew cask updates from outdated data and upgrades without relying on stale info data', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Caskroom/antigravity-cli/0.38.0/agy';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.0' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 1,
      stdout: JSON.stringify({
        formulae: [],
        casks: [
          { name: 'antigravity-cli', installed_versions: ['0.38.0'], current_version: '0.38.1' },
        ],
      }),
    });
    runner.enqueue('brew', ['upgrade', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: 'upgraded',
    });
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.1' });

    const summary = await updateProviders(
      [createTarget('antigravity', 'Antigravity CLI', geminiBinary)],
      { runner, now: (() => 4_576) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('antigravity');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].latestVersion).toBe('0.38.1');
    expect(summary.results[0].checkCommand).toBe('brew outdated --json=v2 --cask antigravity-cli');
    expect(runner.calls.some((call) => call.command === 'brew' && call.args[0] === 'info')).toBe(
      false,
    );
  });

  it('detects Copilot installed from Homebrew cask and applies cask update strategy', async () => {
    const runner = new FakeRunner();
    const copilotBinary = '/opt/homebrew/Caskroom/copilot-cli/1.0.30/copilot';
    runner.enqueue(copilotBinary, ['--version'], { code: 0, stdout: 'GitHub Copilot CLI 1.0.30.' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'copilot-cli'], {
      code: 0,
      stdout: JSON.stringify({ formulae: [], casks: [] }),
    });
    runner.enqueue('npm', ['view', '@github/copilot', 'version', '--silent'], {
      code: 0,
      stdout: '1.0.30',
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

  it('falls back to npm checks when installation source cannot be determined but npm package is configured', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/usr/local/bin/codex';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_580) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('npm');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].checked).toBe(true);
    expect(summary.results[0].updateAttempted).toBe(false);
    expect(summary.results[0].checkCommand).toBe('npm view @openai/codex version --silent');
    expect(summary.results[0].message).toBe('Codex CLI is already up to date.');
    expect(runner.calls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
      `${codexBinary} --version`,
      'npm view @openai/codex version --silent',
    ]);
  });

  it('skips providers gracefully when update spec is missing', async () => {
    const runner = new FakeRunner();

    const summary = await updateProviders(
      [
        createTarget(
          'unknown-provider' as ProviderId,
          'Unknown Provider',
          '/usr/local/bin/unknown',
        ),
      ],
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

    const summary = await updateProviders([createTarget('claude', 'Claude Code', claudeBinary)], {
      runner,
      now: (() => 4_600) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('2.1');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(true);
  });

  it('treats semver build metadata as equivalent when comparing versions', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0+build.42' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_700) as () => number,
    });

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
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], {
      code: 0,
      stdout: 'updated',
    });
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_750) as () => number,
    });

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
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0-rc.2',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_800) as () => number,
    });

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
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0-rc.2',
    });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], {
      code: 0,
      stdout: 'updated',
    });
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0-rc.2' });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_850) as () => number,
    });

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
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0-rc.1',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_875) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].beforeVersion).toBe('0.121.0-rc.1');
    expect(summary.results[0].latestVersion).toBe('0.121.0-rc.1');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].updateAttempted).toBe(false);
  });

  it('falls back to brew info for cask checks and keeps provider up to date when versions match', async () => {
    const runner = new FakeRunner();
    const geminiBinary = '/opt/homebrew/Caskroom/antigravity-cli/0.38.1/agy';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: '',
    });
    runner.enqueue('brew', ['info', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: JSON.stringify({ casks: [{ version: '0.38.1' }] }),
    });

    const summary = await updateProviders(
      [createTarget('antigravity', 'Antigravity CLI', geminiBinary)],
      { runner, now: (() => 4_900) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('antigravity');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('up_to_date');
    expect(summary.results[0].checkCommand).toBe('brew info --json=v2 --cask antigravity-cli');
  });

  it('falls back to brew info for cask checks and applies cask upgrade commands', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/opt/homebrew/Caskroom/codex/0.121.0/codex';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'codex'], {
      code: 0,
      stdout: '',
    });
    runner.enqueue('brew', ['info', '--json=v2', '--cask', 'codex'], {
      code: 0,
      stdout: JSON.stringify({ casks: [{ version: '0.122.0' }] }),
    });
    runner.enqueue('brew', ['upgrade', '--cask', 'codex'], { code: 0, stdout: 'upgraded' });
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.122.0' });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_925) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateCommand).toBe('brew upgrade --cask codex');
  });

  it('matches brew outdated entries that report names as arrays', async () => {
    const runner = new FakeRunner();
    const copilotBinary = '/opt/homebrew/Caskroom/copilot-cli/1.0.30/copilot';
    runner.enqueue(copilotBinary, ['--version'], { code: 0, stdout: 'GitHub Copilot CLI 1.0.30.' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'copilot-cli'], {
      code: 1,
      stdout: JSON.stringify({
        casks: [{ name: ['copilot', 'copilot-cli'], current_version: '1.0.31' }],
      }),
    });
    runner.enqueue('brew', ['upgrade', '--cask', 'copilot-cli'], { code: 0, stdout: 'upgraded' });
    runner.enqueue(copilotBinary, ['--version'], { code: 0, stdout: 'GitHub Copilot CLI 1.0.31.' });

    const summary = await updateProviders(
      [createTarget('copilot', 'GitHub Copilot', copilotBinary)],
      { runner, now: (() => 4_950) as () => number },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('copilot');
    expect(summary.results[0].source).toBe('brew-cask');
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].latestVersion).toBe('1.0.31');
  });

  it('returns error results when update command execution fails', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.120.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], {
      code: 1,
      stderr: 'permission denied',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 4_975) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('codex');
    expect(summary.results[0].status).toBe('error');
    expect(summary.results[0].message).toBe('permission denied');
  });

  it('marks provider as cancelled when aborted before checks complete', async () => {
    const abortController = new AbortController();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    const runner: ProviderUpdaterRunner = {
      async run(command, args) {
        if (command === codexBinary && args[0] === '--version') {
          abortController.abort();
          return { code: 0, stdout: 'codex 0.120.0', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: 'Unexpected command' };
      },
    };

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      signal: abortController.signal,
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('cancelled');
    expect(summary.results[0].message).toContain('before checks completed');
  });

  it('marks provider as cancelled when aborted before update execution', async () => {
    const abortController = new AbortController();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    const runner: ProviderUpdaterRunner = {
      async run(command, args) {
        if (command === codexBinary && args[0] === '--version') {
          return { code: 0, stdout: 'codex 0.120.0', stderr: '' };
        }
        if (command === 'npm' && args[0] === 'view') {
          abortController.abort();
          return { code: 0, stdout: '0.121.0', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: 'Unexpected command' };
      },
    };

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      signal: abortController.signal,
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('cancelled');
    expect(summary.results[0].message).toContain('before execution');
  });

  it('marks provider as cancelled when aborted before version verification completes', async () => {
    const abortController = new AbortController();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    let versionCallCount = 0;
    const runner: ProviderUpdaterRunner = {
      async run(command, args, options) {
        if (command === codexBinary && args[0] === '--version') {
          versionCallCount += 1;
          if (versionCallCount === 2) {
            abortController.abort();
          }
          return { code: options?.signal?.aborted ? 130 : 0, stdout: 'codex 0.120.0', stderr: '' };
        }
        if (command === 'npm' && args[0] === 'view') {
          return { code: 0, stdout: '0.121.0', stderr: '' };
        }
        if (command === 'npm' && args[0] === 'install') {
          return { code: 0, stdout: 'updated', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: 'Unexpected command' };
      },
    };

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      signal: abortController.signal,
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('cancelled');
    expect(summary.results[0].message).toContain('before version verification completed');
  });

  it('emits provider update progress events from start to finish', async () => {
    const runner = new FakeRunner();
    const progressEvents: string[] = [];

    const summary = await updateProviders(
      [createTarget('qwen', 'Qwen Code', '/usr/local/bin/qwen', false)],
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

  it('updates a single selected provider without running every provider', async () => {
    const runner = new FakeRunner();
    const progressEvents: Array<{
      phase: string;
      totalProviders: number;
      providerId?: ProviderId;
    }> = [];
    const geminiBinary = '/opt/homebrew/Caskroom/antigravity-cli/0.38.1/agy';
    runner.enqueue(geminiBinary, ['--version'], { code: 0, stdout: '0.38.1' });
    runner.enqueue('brew', ['outdated', '--json=v2', '--cask', 'antigravity-cli'], {
      code: 0,
      stdout: JSON.stringify({ formulae: [], casks: [] }),
    });
    runner.enqueue('npm', ['view', '@google/antigravity-cli', 'version', '--silent'], {
      code: 0,
      stdout: '0.38.1',
    });

    const summary = await updateProvider(
      createTarget('antigravity', 'Antigravity CLI', geminiBinary),
      {
        runner,
        now: (() => 5_125) as () => number,
        onProgress: (event) => {
          progressEvents.push({
            phase: event.phase,
            totalProviders: event.totalProviders,
            providerId: event.providerId,
          });
        },
      },
    );

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].providerId).toBe('antigravity');
    expect(progressEvents[0]).toMatchObject({ phase: 'started', totalProviders: 1 });
    expect(progressEvents.some((event) => event.providerId === 'antigravity')).toBe(true);
  });

  it('emits running stage messages for the active provider while update checks execute', async () => {
    const runner = new FakeRunner();
    const progressEvents: Array<{
      phase: string;
      providerMessage?: string;
    }> = [];
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.121.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 5_250) as () => number,
      onProgress: (event) => {
        progressEvents.push({
          phase: event.phase,
          providerMessage: event.providerMessage,
        });
      },
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('up_to_date');
    expect(
      progressEvents.some((event) => event.providerMessage === 'Checking installed version…'),
    ).toBe(true);
    expect(
      progressEvents.some((event) => event.providerMessage === 'Checking latest npm version…'),
    ).toBe(true);
    expect(progressEvents.some((event) => event.providerMessage === 'Already up to date.')).toBe(
      true,
    );
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

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      signal: abortController.signal,
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('cancelled');
    expect(summary.results[0].message).toContain('cancelled');
  });

  it('returns an immediate cancelled summary when signal is already aborted', async () => {
    const runner = new FakeRunner();
    const abortController = new AbortController();
    const progressEvents: string[] = [];
    abortController.abort();

    const summary = await updateProviders(
      [createTarget('codex', 'Codex CLI', '/usr/local/bin/codex')],
      {
        runner,
        signal: abortController.signal,
        now: (() => 5_500) as () => number,
        onProgress: (event) => {
          progressEvents.push(event.phase);
        },
      },
    );

    expect(summary.cancelled).toBe(true);
    expect(summary.results).toHaveLength(0);
    expect(progressEvents).toEqual(['started', 'finished']);
    expect(runner.calls).toHaveLength(0);
  });
});

describe('runProviderUpdate', () => {
  it('returns skipped when update source is unknown', async () => {
    const runner: ProviderUpdaterRunner = {
      async run() {
        throw new Error('runner should not be called');
      },
    };
    const stageMessages: string[] = [];

    const result = await runProviderUpdate({
      providerId: 'codex',
      providerName: 'Codex CLI',
      binaryPath: '/usr/local/bin/codex',
      source: 'unknown',
      spec: {},
      beforeVersion: '0.120.0',
      runner,
      onStage: (message) => {
        stageMessages.push(message);
      },
    });

    expect(result.status).toBe('skipped');
    expect(result.updateAttempted).toBe(false);
    expect(result.message).toContain('could not be determined');
    expect(stageMessages).toContain('Update source could not be detected.');
  });

  it('returns skipped when source has no update command configured', async () => {
    const runner: ProviderUpdaterRunner = {
      async run() {
        throw new Error('runner should not be called');
      },
    };
    const stageMessages: string[] = [];

    const result = await runProviderUpdate({
      providerId: 'codex',
      providerName: 'Codex CLI',
      binaryPath: '/usr/local/bin/codex',
      source: 'self',
      spec: {},
      beforeVersion: '0.120.0',
      runner,
      onStage: (message) => {
        stageMessages.push(message);
      },
    });

    expect(result.status).toBe('skipped');
    expect(result.updateAttempted).toBe(false);
    expect(result.message).toContain('No update command available');
    expect(stageMessages).toContain('No update command configured for this source.');
  });

  it('applies npm update command and verifies an updated version', async () => {
    const runner = new FakeRunner();
    const binaryPath = '/usr/local/bin/codex';
    const stageMessages: string[] = [];

    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], {
      code: 0,
      stdout: 'updated',
    });
    runner.enqueue(binaryPath, ['--version'], { code: 0, stdout: 'codex 0.121.0' });

    const result = await runProviderUpdate({
      providerId: 'codex',
      providerName: 'Codex CLI',
      binaryPath,
      source: 'npm',
      spec: { npmPackage: '@openai/codex' },
      beforeVersion: '0.120.0',
      runner,
      onStage: (message) => {
        stageMessages.push(message);
      },
    });

    expect(result.status).toBe('updated');
    expect(result.latestVersion).toBe('0.121.0');
    expect(result.afterVersion).toBe('0.121.0');
    expect(result.updateCommand).toBe('npm install -g @openai/codex@latest');
    expect(stageMessages).toContain('Checking latest npm version…');
    expect(stageMessages).toContain('Applying update command…');
    expect(stageMessages).toContain('Verifying installed version…');
  });
});
