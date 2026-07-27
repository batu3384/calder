import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { pathEscapesProject, resolvePathWithinProject } from './project-path-security';

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

  it('rejects symlink targets that escape the project root', () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-path-sec-'));
    const outside = mkdtempSync(join(tmpdir(), 'calder-path-out-'));
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'nope');
    mkdirSync(join(root, 'link-dir'), { recursive: true });
    const link = join(root, 'escape');
    symlinkSync(outside, link);

    expect(() => resolvePathWithinProject(root, 'escape/secret.txt')).toThrow(
      'Path escapes project root',
    );
  });
});

describe('pathEscapesProject', () => {
  it('returns true for missing inputs', () => {
    expect(pathEscapesProject(null, '/repo')).toBe(true);
    expect(pathEscapesProject('a.ts', null)).toBe(true);
  });

  it('returns false for in-project relative paths', () => {
    expect(pathEscapesProject('src/a.ts', '/repo')).toBe(false);
  });
});
