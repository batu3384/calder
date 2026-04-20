import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const calderIpcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-calder.ts'), 'utf8');

describe('ipc handlers lifecycle contract', () => {
  it('resets all long-lived watchers when the main window closes', () => {
    expect(ipcSource).toContain('export function resetHookWatcher(): void {');
    expect(ipcSource).toContain('stopHookWatching();');
    expect(ipcSource).toContain('stopCodexSessionWatcher();');
    expect(ipcSource).toContain('stopBlackboxSessionWatcher();');
    expect(ipcSource).toContain('resetCalderProjectWatchers();');
    expect(calderIpcSource).toContain('stopProjectContextWatcher();');
    expect(calderIpcSource).toContain('stopProjectWorkflowWatcher();');
    expect(calderIpcSource).toContain('stopProjectReviewWatcher();');
    expect(calderIpcSource).toContain('stopProjectGovernanceWatcher();');
    expect(calderIpcSource).toContain('stopProjectBackgroundTaskWatcher();');
    expect(calderIpcSource).toContain('stopProjectCheckpointWatcher();');
  });
});
