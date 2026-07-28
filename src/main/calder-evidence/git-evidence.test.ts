import { describe, expect, it } from 'vitest';

import type { GitFingerprintSnapshot } from '../../shared/types-evidence.js';
import { compareGitFingerprints } from './git-evidence.js';

function snapshot(
  paths: GitFingerprintSnapshot['paths'],
  overrides: Partial<GitFingerprintSnapshot> = {},
): GitFingerprintSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    isGitRepo: true,
    branch: 'main',
    headCommit: 'abc123',
    paths,
    truncated: false,
    ...overrides,
  };
}

describe('calder-evidence git comparison', () => {
  it('classifies dirty-at-start paths and inferred renames', () => {
    const baseline = snapshot([
      {
        path: 'src/a.ts',
        area: 'working',
        status: 'modified',
        worktreeFingerprint: 'fp-a',
      },
      {
        path: 'src/old.ts',
        area: 'working',
        status: 'deleted',
        worktreeFingerprint: 'fp-rename',
      },
    ]);

    const final = snapshot(
      [
        {
          path: 'src/a.ts',
          area: 'working',
          status: 'modified',
          worktreeFingerprint: 'fp-a',
        },
        {
          path: 'src/new.ts',
          area: 'working',
          status: 'added',
          worktreeFingerprint: 'fp-rename',
        },
      ],
      { headCommit: 'def456' },
    );

    const result = compareGitFingerprints(baseline, final);
    const categories = result.observations.map((obs) => obs.category);

    expect(categories).toContain('dirty_at_start_unchanged');
    expect(categories).toContain('renamed');
    expect(categories).toContain('head_moved');
    expect(result.observations.find((obs) => obs.category === 'renamed')).toMatchObject({
      path: 'src/new.ts',
      previousPath: 'src/old.ts',
      confidence: 'inferred',
    });
  });

  it('marks further dirty changes during the window', () => {
    const baseline = snapshot([
      {
        path: 'src/b.ts',
        area: 'working',
        status: 'modified',
        worktreeFingerprint: 'before',
      },
    ]);
    const final = snapshot([
      {
        path: 'src/b.ts',
        area: 'working',
        status: 'modified',
        worktreeFingerprint: 'after',
      },
    ]);

    const result = compareGitFingerprints(baseline, final);
    expect(result.observations).toContainEqual(
      expect.objectContaining({
        path: 'src/b.ts',
        category: 'dirty_at_start_changed_further_during_window',
      }),
    );
  });
});
