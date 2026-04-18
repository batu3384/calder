import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(
  readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
) as {
  scripts?: Record<string, string>;
};

describe('webview preload build contract', () => {
  it('bundles browser-tab preload before app start/build output is used', () => {
    const buildScript = packageJson.scripts?.build ?? '';
    const bundleScript = packageJson.scripts?.['build:webview-preload'] ?? '';

    expect(buildScript).toContain('build:webview-preload');
    expect(bundleScript).toContain('esbuild src/preload/browser-tab-preload.ts');
    expect(bundleScript).toContain('--bundle');
    expect(bundleScript).toContain('--outfile=dist/preload/preload/browser-tab-preload.js');
  });
});
