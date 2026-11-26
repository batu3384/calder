import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const workflowSource = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf-8',
);

describe('CI workflow dependency-install contract', () => {
  it('skips the large Electron binary download during npm ci on every job', () => {
    const skipDeclarations = workflowSource.match(/ELECTRON_SKIP_BINARY_DOWNLOAD: '1'/g) ?? [];
    expect(skipDeclarations.length).toBe(3);
  });

  it('installs the Electron binary through the retrying installer before the smoke build', () => {
    const installIndex = workflowSource.indexOf('run: npm run ci:install-electron');
    const smokeBuildIndex = workflowSource.indexOf('run: npm run build', installIndex);
    expect(installIndex).toBeGreaterThan(-1);
    expect(smokeBuildIndex).toBeGreaterThan(installIndex);
  });
});
