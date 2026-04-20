import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('state sanitizer delegation contract', () => {
  const ipcHandlersSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
  const sanitizerSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-state-sanitizer.ts'), 'utf8');

  it('delegates persisted-state sanitization from ipc-handlers to dedicated module', () => {
    expect(ipcHandlersSource).toContain("from './ipc-state-sanitizer'");
    expect(ipcHandlersSource).toContain('sanitizePersistedStateForSave,');
    expect(sanitizerSource).toContain('export function sanitizePersistedStateForSave');
    expect(sanitizerSource).toContain('duplicate project.id detected');
    expect(sanitizerSource).toContain('unsupported session.providerId');
  });
});
