import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');

describe('tab bar active visibility contract', () => {
  it('keeps the active tab visible inside the scrollable rail after render', () => {
    expect(source).toContain("tabListEl.querySelector('.tab-item.active')");
    expect(source).toContain("scrollIntoView({ block: 'nearest', inline: 'nearest' })");
  });
});
