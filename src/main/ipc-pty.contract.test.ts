import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('pty IPC delegation contract', () => {
  const ipcHandlersSource = readFileSync(
    path.join(process.cwd(), 'src/main/ipc-handlers.ts'),
    'utf8',
  );
  const ptySource = readFileSync(path.join(process.cwd(), 'src/main/ipc-pty.ts'), 'utf8');

  it('delegates PTY channel registration from ipc-handlers', () => {
    expect(ipcHandlersSource).toContain('registerPtyIpcHandlers({');
    expect(ptySource).toContain('assertProjectGovernanceAllows');
    expect(ptySource).toContain("label: 'Spawn CLI session'");
    expect(ptySource).toContain("label: 'Spawn shell session'");
    expect(ptySource).toContain("'pty:create'");
    expect(ptySource).toContain("'pty:createShell'");
    expect(ptySource).toContain("'pty:write'");
    expect(ptySource).toContain("'pty:resize'");
    expect(ptySource).toContain("'pty:kill'");
    expect(ptySource).toContain("'pty:getCwd'");
  });
});
