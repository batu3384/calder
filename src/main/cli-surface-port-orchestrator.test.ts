import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliSurfaceProfile } from '../shared/types/project-surface';
import { resolveCliSurfaceLaunch } from './cli-surface-port-orchestrator';

const roots: string[] = [];

function makeRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function writePackageJson(root: string, scripts: Record<string, string>): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'demo', scripts }, null, 2),
    'utf8',
  );
}

function makeProfile(overrides: Partial<CliSurfaceProfile>): CliSurfaceProfile {
  return {
    id: 'node:dev',
    name: 'npm run dev',
    command: 'npm',
    args: ['run', 'dev'],
    cwd: overrides.cwd ?? process.cwd(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('resolveCliSurfaceLaunch', () => {
  it('injects npm forwarded --port args for Vite scripts in auto mode', async () => {
    const root = makeRoot('vite-project');
    writePackageJson(root, { dev: 'vite' });
    const profile = makeProfile({ cwd: root, portMode: 'auto' });

    const result = await resolveCliSurfaceLaunch('project-1', profile, new Set<number>());

    expect(result.launch.command).toBe('npm');
    expect(result.launch.args?.slice(0, 2)).toEqual(['run', 'dev']);
    expect(result.launch.args?.includes('--')).toBe(true);
    expect(result.launch.args?.includes('--port')).toBe(true);
    expect(result.launch.envPatch?.PORT).toBe(String(result.metadata.resolvedPort));
    expect(result.metadata.resolvedPort).toBeGreaterThanOrEqual(4300);
    expect(result.metadata.portMode).toBe('auto');
  });

  it('uses fixed preferred ports and falls back when the preferred value is reserved', async () => {
    const root = makeRoot('next-project');
    writePackageJson(root, { dev: 'next dev' });
    const profile = makeProfile({
      cwd: root,
      portMode: 'fixed',
      preferredPort: 4567,
      allowPortFallback: true,
    });

    const reserved = new Set<number>([4567]);
    const result = await resolveCliSurfaceLaunch('project-2', profile, reserved);

    expect(result.metadata.resolvedPort).not.toBe(4567);
    expect(result.metadata.portFallbackUsed).toBe(true);
    expect(result.launch.envPatch?.PORT).toBe(String(result.metadata.resolvedPort));
    expect(result.launch.args?.slice(0, 2)).toEqual(['run', 'dev']);
    expect(result.launch.args?.includes('-p')).toBe(true);
  });

  it('throws when fixed mode has an occupied port and fallback is disabled', async () => {
    const root = makeRoot('strict-port-project');
    writePackageJson(root, { dev: 'next dev' });
    const profile = makeProfile({
      cwd: root,
      portMode: 'fixed',
      preferredPort: 4800,
      allowPortFallback: false,
    });

    await expect(
      resolveCliSurfaceLaunch('project-3', profile, new Set<number>([4800])),
    ).rejects.toThrow('Port 4800 is already in use and fallback is disabled.');
  });

  it('throws when fixed mode is used with an unsupported command profile', async () => {
    const root = makeRoot('unsupported-fixed-project');
    const profile = makeProfile({
      cwd: root,
      command: 'python',
      args: ['app.py'],
      portMode: 'fixed',
      preferredPort: 9000,
      allowPortFallback: true,
    });

    await expect(
      resolveCliSurfaceLaunch('project-unsupported', profile, new Set<number>()),
    ).rejects.toThrow('Fixed port mode is not supported for this command profile.');
  });

  it('keeps launch untouched when mode is off', async () => {
    const root = makeRoot('off-mode-project');
    writePackageJson(root, { dev: 'vite' });
    const profile = makeProfile({
      cwd: root,
      portMode: 'off',
      args: ['run', 'dev'],
      envPatch: { NODE_ENV: 'development' },
    });

    const result = await resolveCliSurfaceLaunch('project-4', profile, new Set<number>());

    expect(result.launch.args).toEqual(['run', 'dev']);
    expect(result.launch.envPatch).toEqual({ NODE_ENV: 'development' });
    expect(result.metadata.resolvedPort).toBeUndefined();
    expect(result.metadata.portReason).toContain('disabled');
  });

  it('skips auto orchestration when explicit port args already exist', async () => {
    const root = makeRoot('explicit-port-project');
    writePackageJson(root, { dev: 'vite' });
    const profile = makeProfile({
      cwd: root,
      portMode: 'auto',
      args: ['run', 'dev', '--', '--port', '5123'],
    });

    const result = await resolveCliSurfaceLaunch('project-5', profile, new Set<number>());

    expect(result.launch.args).toEqual(['run', 'dev', '--', '--port', '5123']);
    expect(result.metadata.resolvedPort).toBeUndefined();
    expect(result.metadata.portReason).toContain('explicit port settings');
  });

  it('injects direct framework command args for astro and next CLIs', async () => {
    const astroProfile = makeProfile({
      command: 'astro',
      args: ['dev'],
      portMode: 'auto',
    });
    const astroResult = await resolveCliSurfaceLaunch(
      'project-direct-astro',
      astroProfile,
      new Set<number>(),
    );
    expect(astroResult.launch.args).toContain('--port');
    expect(astroResult.metadata.portReason).toContain('Direct framework CLI supports --port');

    const nextProfile = makeProfile({
      command: 'next',
      args: ['dev'],
      portMode: 'auto',
    });
    const nextResult = await resolveCliSurfaceLaunch(
      'project-direct-next',
      nextProfile,
      new Set<number>(),
    );
    expect(nextResult.launch.args).toContain('-p');
    expect(nextResult.metadata.portReason).toContain('Direct framework CLI supports -p/--port');
  });

  it('handles pnpm/yarn package-manager script parsing branches', async () => {
    const root = makeRoot('package-manager-branches');
    writePackageJson(root, {
      dev: 'react-scripts start',
      start: 'node server.js',
      lint: 'eslint .',
    });

    const pnpmDev = makeProfile({
      cwd: root,
      command: 'pnpm',
      args: ['dev'],
      portMode: 'auto',
    });
    const pnpmResult = await resolveCliSurfaceLaunch(
      'project-pnpm-dev',
      pnpmDev,
      new Set<number>(),
    );
    expect(pnpmResult.launch.args).toEqual(['dev']);
    expect(pnpmResult.launch.envPatch?.PORT).toBe(String(pnpmResult.metadata.resolvedPort));
    expect(pnpmResult.metadata.portReason).toContain('react-scripts');

    const yarnStart = makeProfile({
      cwd: root,
      command: 'yarn',
      args: ['run', 'start'],
      portMode: 'auto',
    });
    const yarnStartResult = await resolveCliSurfaceLaunch(
      'project-yarn-start',
      yarnStart,
      new Set<number>(),
    );
    expect(yarnStartResult.launch.args).toEqual(['run', 'start']);
    expect(yarnStartResult.launch.envPatch?.PORT).toBe(
      String(yarnStartResult.metadata.resolvedPort),
    );
    expect(yarnStartResult.metadata.portReason).toContain('Generic dev/start script');

    const yarnLint = makeProfile({
      cwd: root,
      command: 'yarn',
      args: ['run', 'lint'],
      portMode: 'auto',
    });
    const yarnLintResult = await resolveCliSurfaceLaunch(
      'project-yarn-lint',
      yarnLint,
      new Set<number>(),
    );
    expect(yarnLintResult.metadata.resolvedPort).toBeUndefined();
    expect(yarnLintResult.metadata.portReason).toContain('does not look like a local web server');

    const npmNoScriptTarget = makeProfile({
      cwd: root,
      command: 'npm',
      args: ['test'],
      portMode: 'auto',
    });
    const npmNoScriptResult = await resolveCliSurfaceLaunch(
      'project-npm-test',
      npmNoScriptTarget,
      new Set<number>(),
    );
    expect(npmNoScriptResult.metadata.resolvedPort).toBeUndefined();
    expect(npmNoScriptResult.metadata.portReason).toContain('does not target a script');

    const pnpmFlagOnly = makeProfile({
      cwd: root,
      command: 'pnpm',
      args: ['--filter', 'web', 'run', 'dev'],
      portMode: 'auto',
    });
    const pnpmFlagOnlyResult = await resolveCliSurfaceLaunch(
      'project-pnpm-flag-only',
      pnpmFlagOnly,
      new Set<number>(),
    );
    expect(pnpmFlagOnlyResult.metadata.resolvedPort).toBeUndefined();
    expect(pnpmFlagOnlyResult.metadata.portReason).toContain('does not target a script');

    const yarnFlagOnly = makeProfile({
      cwd: root,
      command: 'yarn',
      args: ['--cwd', 'apps/web'],
      portMode: 'auto',
    });
    const yarnFlagOnlyResult = await resolveCliSurfaceLaunch(
      'project-yarn-flag-only',
      yarnFlagOnly,
      new Set<number>(),
    );
    expect(yarnFlagOnlyResult.metadata.resolvedPort).toBeUndefined();
    expect(yarnFlagOnlyResult.metadata.portReason).toContain('does not target a script');
  });

  it('falls back to generic script mode when package.json parsing fails', async () => {
    const root = makeRoot('broken-package-json');
    writeFileSync(join(root, 'package.json'), '{ this is not valid json', 'utf8');

    const profile = makeProfile({
      cwd: root,
      command: 'npm',
      args: ['run', 'dev'],
      portMode: 'auto',
    });

    const result = await resolveCliSurfaceLaunch(
      'project-broken-package-json',
      profile,
      new Set<number>(),
    );
    expect(result.launch.envPatch?.PORT).toBe(String(result.metadata.resolvedPort));
    expect(result.metadata.portReason).toContain('Generic dev/start script');
  });

  it('keeps explicit npm port arguments in fixed mode while applying env patch', async () => {
    const root = makeRoot('fixed-explicit-port');
    writePackageJson(root, { dev: 'vite' });
    const profile = makeProfile({
      cwd: root,
      command: 'npm',
      args: ['run', 'dev', '--', '--port', '5100'],
      portMode: 'fixed',
      preferredPort: 5200,
    });

    const result = await resolveCliSurfaceLaunch(
      'project-fixed-explicit-port',
      profile,
      new Set<number>(),
    );
    expect(result.launch.args).toEqual(['run', 'dev', '--', '--port', '5100']);
    expect(result.launch.envPatch?.PORT).toBe(String(result.metadata.resolvedPort));
  });

  it('appends pnpm and direct-command port flags when needed', async () => {
    const root = makeRoot('pnpm-and-direct');
    writePackageJson(root, { dev: 'vite' });

    const pnpmProfile = makeProfile({
      cwd: root,
      command: 'pnpm',
      args: ['dev'],
      portMode: 'auto',
    });
    const pnpmResult = await resolveCliSurfaceLaunch(
      'project-pnpm-append',
      pnpmProfile,
      new Set<number>(),
    );
    expect(pnpmResult.launch.args?.slice(-2)).toEqual([
      '--port',
      String(pnpmResult.metadata.resolvedPort),
    ]);

    const directProfile = makeProfile({
      command: 'vite',
      args: undefined,
      portMode: 'auto',
    });
    const directResult = await resolveCliSurfaceLaunch(
      'project-direct-append',
      directProfile,
      new Set<number>(),
    );
    expect(directResult.launch.args).toEqual([
      '--port',
      String(directResult.metadata.resolvedPort),
    ]);
  });

  it('validates fixed preferred ports and fails after fallback attempt exhaustion', async () => {
    const root = makeRoot('fixed-validation');
    writePackageJson(root, { dev: 'next dev' });

    const invalidPortProfile = makeProfile({
      cwd: root,
      command: 'npm',
      args: ['run', 'dev'],
      portMode: 'fixed',
      preferredPort: 70000,
    });
    await expect(
      resolveCliSurfaceLaunch('project-invalid-fixed-port', invalidPortProfile, new Set<number>()),
    ).rejects.toThrow('Fixed port mode requires a valid preferred port (1-65535).');

    const exhaustingProfile = makeProfile({
      cwd: root,
      command: 'npm',
      args: ['run', 'dev'],
      portMode: 'fixed',
      preferredPort: 4500,
      allowPortFallback: true,
    });
    const reserved = new Set<number>(Array.from({ length: 201 }, (_value, index) => 4500 + index));
    await expect(
      resolveCliSurfaceLaunch('project-fixed-exhaustion', exhaustingProfile, reserved),
    ).rejects.toThrow('Could not allocate a free local port after checking 200 candidates.');
  });
});
