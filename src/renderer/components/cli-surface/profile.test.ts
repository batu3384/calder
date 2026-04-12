import { describe, expect, it } from 'vitest';
import {
  createDiscoveredCliSurfaceProfile,
  createDemoCliSurfaceProfile,
  formatCliSurfaceCommand,
  getCliSurfaceProfileLabel,
} from './profile.js';

describe('cli surface profile helpers', () => {
  it('formats the full command string for discovered node scripts', () => {
    expect(formatCliSurfaceCommand('npm', ['run', 'dev:tui'])).toBe('npm run dev:tui');
  });

  it('formats the full command string for discovered Go entrypoints', () => {
    expect(formatCliSurfaceCommand('go', ['run', './cmd/aegis'])).toBe('go run ./cmd/aegis');
  });

  it('uses the full command string as the default name for discovered profiles', () => {
    expect(createDiscoveredCliSurfaceProfile({
      id: 'go:cmd:aegis',
      command: 'go',
      args: ['run', './cmd/aegis'],
      cwd: '/tmp/aegis',
      source: 'go:cmd-entry',
      reason: 'Detected cmd/aegis as the primary Go entrypoint',
      confidence: 'high',
    })).toMatchObject({
      id: 'go:cmd:aegis',
      name: 'go run ./cmd/aegis',
      command: 'go',
      args: ['run', './cmd/aegis'],
    });
  });

  it('shows the full command for legacy auto-generated profile names', () => {
    expect(getCliSurfaceProfileLabel({
      id: 'go:cmd:aegis',
      name: './cmd/aegis',
      command: 'go',
      args: ['run', './cmd/aegis'],
      cwd: '/tmp/aegis',
    })).toBe('go run ./cmd/aegis');
  });

  it('preserves custom profile names that do not look auto-generated', () => {
    expect(getCliSurfaceProfileLabel({
      id: 'custom',
      name: 'Security TUI',
      command: 'go',
      args: ['run', './cmd/ironsentinel'],
      cwd: '/tmp/security',
    })).toBe('Security TUI');
  });

  it('creates a built-in demo profile with a stable command marker', () => {
    expect(createDemoCliSurfaceProfile('/tmp/security')).toEqual(
      expect.objectContaining({
        id: 'builtin:cli-surface-demo',
        name: 'Calder CLI Surface Demo',
        command: '__calder_cli_surface_demo__',
        cwd: '/tmp/security',
      }),
    );
  });
});
