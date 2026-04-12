import { describe, expect, it, vi } from 'vitest';
import type { CliSurfaceDiscoveryResult, CliSurfaceProfile, ProjectRecord } from '../../../shared/types.js';
import { openCliSurfaceWithSetup } from './setup.js';

function makeProject(): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Demo',
    path: '/tmp/demo',
    sessions: [],
    activeSessionId: null,
    layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
    surface: {
      kind: 'cli',
      active: false,
      cli: { profiles: [], runtime: { status: 'idle' } },
      web: { history: [] },
    },
  };
}

describe('openCliSurfaceWithSetup', () => {
  it('reuses and starts an existing saved profile without running discovery', async () => {
    const project = makeProject();
    const profile: CliSurfaceProfile = {
      id: 'saved',
      name: 'Saved',
      command: 'npm',
      args: ['run', 'dev:tui'],
      cwd: project.path,
    };
    project.surface!.cli!.profiles = [profile];
    project.surface!.cli!.selectedProfileId = profile.id;

    const discover = vi.fn();
    const start = vi.fn();
    const persist = vi.fn();
    const showQuickSetup = vi.fn();
    const showManualSetup = vi.fn();

    await openCliSurfaceWithSetup(project, { discover, start, persist, showQuickSetup, showManualSetup });

    expect(discover).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith(profile);
    expect(showQuickSetup).not.toHaveBeenCalled();
    expect(showManualSetup).not.toHaveBeenCalled();
  });

  it('auto-creates and starts a high-confidence discovered profile', async () => {
    const project = makeProject();
    const discover = vi.fn<() => Promise<CliSurfaceDiscoveryResult>>().mockResolvedValue({
      confidence: 'high',
      candidates: [{
        id: 'node:dev:tui',
        command: 'npm',
        args: ['run', 'dev:tui'],
        cwd: project.path,
        source: 'package.json:scripts.dev:tui',
        reason: 'Found dev:tui in package.json scripts',
        confidence: 'high',
      }],
    });
    const start = vi.fn();
    const persist = vi.fn();

    await openCliSurfaceWithSetup(project, {
      discover,
      start,
      persist,
      showQuickSetup: vi.fn(),
      showManualSetup: vi.fn(),
    });

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      id: 'node:dev:tui',
      name: 'npm run dev:tui',
      command: 'npm',
      args: ['run', 'dev:tui'],
    }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      id: 'node:dev:tui',
      command: 'npm',
      args: ['run', 'dev:tui'],
    }));
  });

  it('uses the full discovered command as the default profile name for go projects', async () => {
    const project = makeProject();
    const discover = vi.fn<() => Promise<CliSurfaceDiscoveryResult>>().mockResolvedValue({
      confidence: 'high',
      candidates: [{
        id: 'go:cmd:aegis',
        command: 'go',
        args: ['run', './cmd/aegis'],
        cwd: project.path,
        source: 'go:cmd-entry',
        reason: 'Detected cmd/aegis as the primary Go entrypoint',
        confidence: 'high',
      }],
    });
    const persist = vi.fn();

    await openCliSurfaceWithSetup(project, {
      discover,
      start: vi.fn(),
      persist,
      showQuickSetup: vi.fn(),
      showManualSetup: vi.fn(),
    });

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      id: 'go:cmd:aegis',
      name: 'go run ./cmd/aegis',
      command: 'go',
      args: ['run', './cmd/aegis'],
    }));
  });

  it('shows quick setup for medium-confidence discovery', async () => {
    const project = makeProject();
    const showQuickSetup = vi.fn();

    await openCliSurfaceWithSetup(project, {
      discover: vi.fn().mockResolvedValue({
        confidence: 'medium',
        candidates: [
          {
            id: 'node:cli',
            command: 'npm',
            args: ['run', 'cli'],
            cwd: project.path,
            source: 'package.json:scripts.cli',
            reason: 'Found cli in package.json scripts',
            confidence: 'medium',
          },
        ],
      }),
      start: vi.fn(),
      persist: vi.fn(),
      showQuickSetup,
      showManualSetup: vi.fn(),
    });

    expect(showQuickSetup).toHaveBeenCalledWith(project, expect.any(Array));
  });

  it('shows quick setup with an empty candidate list for low-confidence discovery', async () => {
    const project = makeProject();
    const showQuickSetup = vi.fn();

    await openCliSurfaceWithSetup(project, {
      discover: vi.fn().mockResolvedValue({ confidence: 'low', candidates: [] }),
      start: vi.fn(),
      persist: vi.fn(),
      showQuickSetup,
      showManualSetup: vi.fn(),
    });

    expect(showQuickSetup).toHaveBeenCalledWith(project, []);
  });
});
