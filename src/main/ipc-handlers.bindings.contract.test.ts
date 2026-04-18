import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');

describe('ipc watcher binding lifecycle contract', () => {
  it('detaches closed listeners when rebinding and resetting watchers', () => {
    expect(ipcSource).toContain('function removeWindowClosedListener');
    expect(ipcSource).toContain('removeWindowClosedListener(existing.win, existing.onWindowClosed);');
    expect(ipcSource).toContain('removeWindowClosedListener(binding.win, binding.onWindowClosed);');
  });
});
