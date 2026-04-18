import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');

describe('share dialog mobile UX contract', () => {
  it('surfaces a quick handoff lane and keeps manual codes as explicit fallback', () => {
    expect(source).toContain('Quick handoff (Recommended)');
    expect(source).toContain('Show Manual Codes');
    expect(source).toContain('Hide Manual Codes');
  });

  it('offers a local retry action when mobile pairing creation fails', () => {
    expect(source).toContain('Retry QR');
  });
});
