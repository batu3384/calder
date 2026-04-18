import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf-8');

describe('renderer csp contract', () => {
  it('allows inline-generated QR image sources', () => {
    expect(html).toContain("img-src 'self' data: blob:");
  });
});
