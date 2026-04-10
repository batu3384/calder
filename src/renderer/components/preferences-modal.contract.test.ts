import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./preferences-modal.ts', import.meta.url), 'utf-8');

describe('preferences modal contract', () => {
  it('builds a branded menu header and section intros', () => {
    expect(source).toContain('preferences-menu-header');
    expect(source).toContain('preferences-section-intro');
  });
});
