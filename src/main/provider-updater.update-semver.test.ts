import { describe, expect, it } from 'vitest';

import type { ProviderId } from '../shared/types/provider';
import { updateProvider, updateProviders } from './provider-updater';
import { createTarget, FakeRunner } from './provider-updater.test-support';

describe('updateProviders', () => {
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
