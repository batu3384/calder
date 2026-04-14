import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');

describe('share dialog team context contract', () => {
  it('surfaces shared team context before opening a p2p handoff', () => {
    expect(source).toContain('Shared team context');
    expect(source).toContain('project.projectTeamContext');
    expect(source).toContain('share-notice calder-inline-notice');
  });
});
