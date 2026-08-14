import { describe, expect, it } from 'vitest';

import { updateProviders } from './provider-updater';
import { createTarget, FakeRunner } from './provider-updater.test-support';

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
});
