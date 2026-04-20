import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CliSurfaceProfile } from '../shared/types';
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

    await expect(resolveCliSurfaceLaunch('project-3', profile, new Set<number>([4800])))
      .rejects
      .toThrow('Port 4800 is already in use and fallback is disabled.');
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

    await expect(resolveCliSurfaceLaunch('project-unsupported', profile, new Set<number>()))
      .rejects
      .toThrow('Fixed port mode is not supported for this command profile.');
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
});
