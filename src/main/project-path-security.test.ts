import { describe, expect, it } from 'vitest';

import { resolvePathWithinProject } from './project-path-security';

describe('resolvePathWithinProject', () => {
  it('resolves relative paths inside the project root', () => {
    const resolved = resolvePathWithinProject('/repo', 'src/index.ts');
    expect(resolved.endsWith('/repo/src/index.ts')).toBe(true);
  });

  it('rejects path traversal outside the project root', () => {
    expect(() => resolvePathWithinProject('/repo', '../../../etc/passwd')).toThrow(
      'Path escapes project root',
    );
  });
});
