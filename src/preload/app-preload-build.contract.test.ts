import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as {
  scripts?: Record<string, string>;
};

describe('app preload build contract', () => {
  it('bundles the main preload bridge before app start/build output is used', () => {
    const buildScript = packageJson.scripts?.build ?? '';
    const bundleScript = packageJson.scripts?.['build:app-preload'] ?? '';

    expect(buildScript).toContain('build:app-preload');
    expect(bundleScript).toContain('esbuild src/preload/preload.ts');
    expect(bundleScript).toContain('--bundle');
    expect(bundleScript).toContain('--outfile=dist/preload/preload/preload.js');
  });
});
