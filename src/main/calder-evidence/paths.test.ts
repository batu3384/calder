import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetCalderDataRootForTests,
  __setCalderDataRootForTests,
  assertSafeRunId,
  resolveCalderDataRoot,
  resolveEvidenceRoot,
  resolveEvidenceRunDirectory,
} from './paths.js';

const roots: string[] = [];

afterEach(() => {
  __resetCalderDataRootForTests();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('calder-evidence paths', () => {
  it('resolves default and injectable data roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-paths-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    expect(resolveCalderDataRoot()).toBe(root);
    expect(resolveEvidenceRoot()).toBe(join(root, 'evidence'));
    expect(resolveEvidenceRunDirectory('run-1')).toBe(join(root, 'evidence', 'runs', 'run-1'));
    expect(resolveCalderDataRoot('/override')).toBe('/override');
  });

  it('rejects unsafe run ids', () => {
    expect(() => assertSafeRunId('')).toThrow('Invalid evidence run id');
    expect(() => assertSafeRunId('../escape')).toThrow('Invalid evidence run id');
    expect(() => assertSafeRunId('a/b')).toThrow('Invalid evidence run id');
    expect(() => assertSafeRunId('a\\b')).toThrow('Invalid evidence run id');
    expect(() => assertSafeRunId('ok-run-id')).not.toThrow();
  });
});
