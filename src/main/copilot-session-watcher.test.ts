import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tempHome: string;

function writeWorkspace(id: string, cwd: string, createdAt: string): void {
  const dir = path.join(tempHome, '.copilot', 'session-state', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'workspace.yaml'),
    [
      `id: ${id}`,
      `cwd: ${cwd}`,
      `created_at: ${createdAt}`,
      `updated_at: ${createdAt}`,
      '',
    ].join('\n'),
  );
}

async function loadWatcher() {
  vi.resetModules();
  vi.doMock('os', () => ({ homedir: () => tempHome }));
  return import('./copilot-session-watcher');
}

beforeEach(() => {
  vi.useFakeTimers();
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'calder-copilot-watcher-'));
});

afterEach(async () => {
  try {
    const watcher = await import('./copilot-session-watcher');
    watcher.stopCopilotSessionWatcher();
  } catch {
    // Module may not have been imported in a failing setup.
  }
  vi.useRealTimers();
  vi.doUnmock('os');
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe('copilot session watcher', () => {
  it('captures a new Copilot session id from session-state workspace metadata', async () => {
    const watcher = await loadWatcher();
    const win = { isDestroyed: () => false } as any;

    watcher.startCopilotSessionWatcher(win);
    watcher.registerPendingCopilotSession('ui-1', {
      cwd: '/repo/project',
      registeredAtMs: Date.parse('2026-04-21T10:00:00.000Z'),
    });

    writeWorkspace('copilot-session-1', '/repo/project', '2026-04-21T10:00:01.000Z');
    await vi.advanceTimersByTimeAsync(2000);

    const captured = fs.readFileSync(
      path.join(tempHome, '.calder', 'runtime', 'ui-1.sessionid'),
      'utf-8',
    );
    expect(captured).toBe('copilot-session-1');
  });

  it('prefers the new session whose cwd matches the pending Calder session', async () => {
    const watcher = await loadWatcher();
    const win = { isDestroyed: () => false } as any;

    watcher.startCopilotSessionWatcher(win);
    watcher.registerPendingCopilotSession('ui-1', {
      cwd: '/repo/target',
      registeredAtMs: Date.parse('2026-04-21T10:00:00.000Z'),
    });

    writeWorkspace('wrong-cwd', '/repo/other', '2026-04-21T10:00:01.000Z');
    writeWorkspace('right-cwd', '/repo/target', '2026-04-21T10:00:02.000Z');
    await vi.advanceTimersByTimeAsync(2000);

    const captured = fs.readFileSync(
      path.join(tempHome, '.calder', 'runtime', 'ui-1.sessionid'),
      'utf-8',
    );
    expect(captured).toBe('right-cwd');
  });

  it('does not reuse session-state directories that existed before registration', async () => {
    writeWorkspace('old-session', '/repo/project', '2026-04-21T09:59:00.000Z');
    const watcher = await loadWatcher();
    const win = { isDestroyed: () => false } as any;

    watcher.startCopilotSessionWatcher(win);
    watcher.registerPendingCopilotSession('ui-1', {
      cwd: '/repo/project',
      registeredAtMs: Date.parse('2026-04-21T10:00:00.000Z'),
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(fs.existsSync(path.join(tempHome, '.calder', 'runtime', 'ui-1.sessionid'))).toBe(false);
  });
});
