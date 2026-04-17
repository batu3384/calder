import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as {
  scripts?: Record<string, string>;
};

describe('development startup contract', () => {
  it('launches Electron through the absolute app-path bootstrap script', () => {
    expect(packageJson.scripts?.start).toBe('npm run build && node scripts/run-electron.js');
    expect(packageJson.scripts?.dev).toBe('npm run build && node scripts/run-electron.js');
  });
});
