import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const providerUpdateSource = readFileSync(
  path.join(process.cwd(), 'src/main/ipc-provider-update.ts'),
  'utf8',
);

describe('ipc provider update contract', () => {
  it('delegates provider update channels from ipc-handlers', () => {
    expect(ipcSource).toContain('registerProviderUpdateIpcHandlers();');
  });

  it('keeps provider update progress and cancellation channels wired', () => {
    expect(providerUpdateSource).toContain("'provider:updateAll'");
    expect(providerUpdateSource).toContain("'provider:updateProvider'");
    expect(providerUpdateSource).toContain("'provider:update-progress'");
    expect(providerUpdateSource).toContain("'provider:cancelUpdateAll'");
  });
});
