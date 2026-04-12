import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const workflowSource = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf-8');

describe('release workflow contract', () => {
  it('validates and quotes the manual version input before running npm version', () => {
    expect(workflowSource).toContain('VERSION_INPUT: ${{ inputs.version }}');
    expect(workflowSource).toContain('case "$VERSION_INPUT" in');
    expect(workflowSource).toContain('npm version "$VERSION_INPUT" --no-git-tag-version');
  });
});
