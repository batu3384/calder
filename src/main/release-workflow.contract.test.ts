import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const workflowSource = readFileSync(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf-8',
);

describe('release workflow contract', () => {
  it('validates and quotes the manual version input before running npm version', () => {
    expect(workflowSource).toContain('VERSION_INPUT: ${{ inputs.version }}');
    expect(workflowSource).toContain('case "$VERSION_INPUT" in');
    expect(workflowSource).toContain('npm version "$VERSION_INPUT" --no-git-tag-version');
  });

  it('keeps release npm installs resilient around Electron binary downloads', () => {
    const skipDeclarations = workflowSource.match(/ELECTRON_SKIP_BINARY_DOWNLOAD: '1'/g) ?? [];
    const installerCalls = workflowSource.match(/run: npm run ci:install-electron/g) ?? [];
    expect(skipDeclarations.length).toBe(4);
    expect(installerCalls.length).toBe(3);
  });
});
