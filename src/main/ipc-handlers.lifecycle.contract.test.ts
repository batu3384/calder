import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');

describe('ipc handlers lifecycle contract', () => {
  it('resets all long-lived watchers when the main window closes', () => {
    expect(ipcSource).toContain('export function resetHookWatcher(): void {');
    expect(ipcSource).toContain('stopHookWatching();');
    expect(ipcSource).toContain('stopCodexSessionWatcher();');
    expect(ipcSource).toContain('stopBlackboxSessionWatcher();');
    expect(ipcSource).toContain('stopProjectContextWatcher();');
    expect(ipcSource).toContain('stopProjectWorkflowWatcher();');
    expect(ipcSource).toContain('stopProjectReviewWatcher();');
    expect(ipcSource).toContain('stopProjectGovernanceWatcher();');
    expect(ipcSource).toContain('stopProjectBackgroundTaskWatcher();');
    expect(ipcSource).toContain('stopProjectCheckpointWatcher();');
  });
});
