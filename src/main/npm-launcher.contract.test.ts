import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const launcherSource = readFileSync(new URL('../../bin/calder.js', import.meta.url), 'utf-8');

describe('npm launcher security contract', () => {
  it('keeps release downloads and redirects HTTPS-only', () => {
    expect(launcherSource).toContain("currentUrl.protocol !== 'https:'");
    expect(launcherSource).toContain('Refusing HTTPS downgrade redirect');
    expect(launcherSource).not.toContain("require('http')");
  });

  it('avoids shell interpolation for archive extraction helpers', () => {
    expect(launcherSource).toContain('execFileSync');
    expect(launcherSource).not.toContain('execSync(');
  });

  it('extracts into staging before replacing the installed app', () => {
    expect(launcherSource).toContain('fs.mkdtempSync');
    expect(launcherSource).toContain('moveExtractedAppIntoPlace');
    expect(launcherSource).not.toContain('fs.rmSync(APP_PATH, { recursive: true, force: true });');
  });
});
