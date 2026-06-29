import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const providerIpcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-provider.ts'), 'utf8');

describe('ipc provider contract', () => {
  it('delegates provider/read channels from ipc-handlers', () => {
    expect(ipcSource).toContain('registerProviderIpcHandlers();');
  });

  it('keeps provider session handoff and binary checks wired', () => {
    expect(providerIpcSource).toContain("'session:buildResumeWithPrompt'");
    expect(providerIpcSource).toContain("'provider:checkBinary'");
    expect(providerIpcSource).toContain("'provider:getMeta'");
    expect(providerIpcSource).toContain("'provider:listProviders'");
  });
});
