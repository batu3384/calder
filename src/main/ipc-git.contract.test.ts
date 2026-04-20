import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const gitIpcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-git.ts'), 'utf8');

describe('ipc git contract', () => {
  it('delegates git channel registration from ipc-handlers', () => {
    expect(ipcSource).toContain('registerGitIpcHandlers({');
  });

  it('keeps governance labels around destructive git mutations', () => {
    expect(gitIpcSource).toContain("label: 'Stage git file'");
    expect(gitIpcSource).toContain("label: 'Unstage git file'");
    expect(gitIpcSource).toContain("label: 'Discard git file changes'");
    expect(gitIpcSource).toContain("label: 'Checkout git branch'");
    expect(gitIpcSource).toContain("label: 'Create git branch'");
  });
});
