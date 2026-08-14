import { describe, expect, it } from 'vitest';

import { installProviders, type ProviderUpdaterRunner, updateProviders } from './provider-updater';
import { createProviderMeta, createTarget, FakeRunner } from './provider-updater.test-support';
import { runProviderUpdate } from './provider-updater-update-helpers';

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

describe('installProviders', () => {
  it('installs a missing provider using its install command', async () => {
    const runner = new FakeRunner();
    let installed = false;
    const provider = {
      meta: createProviderMeta('codex', 'Codex CLI'),
      getInstallCommand: () => 'npm install -g @openai/codex',
      clearBinaryCache: () => undefined,
      resolveBinaryPath: () => '/usr/local/bin/codex',
      validatePrerequisites: () =>
        installed ? { ok: true, message: '' } : { ok: false, message: 'Codex CLI missing' },
    };

    runner.enqueue('npm', ['install', '-g', '@openai/codex'], {
      code: 0,
      stdout: 'installed',
    });
    const originalRun = runner.run.bind(runner);
    runner.run = async (command, args) => {
      const result = await originalRun(command, args);
      if (command === 'npm' && args[0] === 'install') {
        installed = true;
        runner.enqueue('/usr/local/bin/codex', ['--version'], { code: 0, stdout: 'codex 0.121.0' });
      }
      return result;
    };

    const summary = await installProviders([provider], {
      runner,
      now: (() => 1_000) as () => number,
    });

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe('updated');
    expect(summary.results[0].updateCommand).toBe('npm install -g @openai/codex');
    expect(summary.results[0].message).toContain('installed successfully');
  });

  it('skips install when provider is already present', async () => {
    const runner = new FakeRunner();
    const provider = {
      meta: createProviderMeta('claude', 'Claude Code'),
      getInstallCommand: () => 'npm install -g @anthropic-ai/claude-code',
      clearBinaryCache: () => undefined,
      resolveBinaryPath: () => '/usr/local/bin/claude',
      validatePrerequisites: () => ({ ok: true, message: '' }),
    };

    const summary = await installProviders([provider], {
      runner,
      now: (() => 1_000) as () => number,
    });

    expect(summary.results[0].status).toBe('skipped');
    expect(summary.results[0].message).toContain('already installed');
    expect(runner.calls).toHaveLength(0);
  });
});

describe('shouldRetryWithFallback behavior via updateProviders', () => {
  it('does not chain fallback after npm update failure', async () => {
    const runner = new FakeRunner();
    const codexBinary = '/Users/test/.npm-global/lib/node_modules/@openai/codex/bin/codex.js';
    runner.enqueue(codexBinary, ['--version'], { code: 0, stdout: 'codex 0.120.0' });
    runner.enqueue('npm', ['view', '@openai/codex', 'version', '--silent'], {
      code: 0,
      stdout: '0.121.0',
    });
    runner.enqueue('npm', ['install', '-g', '@openai/codex@latest'], {
      code: 1,
      stderr: 'EACCES: permission denied',
    });

    const summary = await updateProviders([createTarget('codex', 'Codex CLI', codexBinary)], {
      runner,
      now: (() => 1_000) as () => number,
    });

    const brewCalls = runner.calls.filter((call) => call.command === 'brew');
    expect(brewCalls).toHaveLength(0);
    expect(summary.results[0].status).toBe('error');
    expect(summary.results[0].source).toBe('npm');
  });
});
