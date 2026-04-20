import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const copyAssetsSource = readFileSync(path.join(process.cwd(), 'scripts/copy-assets.js'), 'utf8');

describe('copy-assets script contract', () => {
  it('filters test files when mirroring renderer styles into dist', () => {
    expect(copyAssetsSource).toContain('function isTestSourceFile');
    expect(copyAssetsSource).toContain('filter: (srcPath) => !isTestSourceFile(srcPath)');
  });

  it('still copies provider assets recursively', () => {
    expect(copyAssetsSource).toContain("path.join(root, 'src', 'renderer', 'assets', 'providers')");
    expect(copyAssetsSource).toContain("path.join(dist, 'assets', 'providers')");
  });
});
