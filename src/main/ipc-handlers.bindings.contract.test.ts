import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const calderIpcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-calder.ts'), 'utf8');

describe('ipc watcher binding lifecycle contract', () => {
  it('detaches closed listeners when rebinding and resetting watchers', () => {
    expect(ipcSource).toContain('resetCalderProjectWatchers();');
    expect(calderIpcSource).toContain('function removeWindowClosedListener');
    expect(calderIpcSource).toContain('removeWindowClosedListener(existing.win, existing.onWindowClosed);');
    expect(calderIpcSource).toContain('removeWindowClosedListener(binding.win, binding.onWindowClosed);');
  });
});
