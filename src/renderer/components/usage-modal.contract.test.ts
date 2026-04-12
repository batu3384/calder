import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./usage-modal.ts', import.meta.url), 'utf-8');

describe('usage modal contract', () => {
  it('renders summary cards and model usage rows without interpolating dynamic innerHTML', () => {
    expect(source).not.toContain('el.innerHTML = `<div class="usage-stat-value">${card.value}</div><div class="usage-stat-label">${card.label}</div>`;');
    expect(source).not.toContain('row.innerHTML = `');
    expect(source).toContain('value.textContent = card.value');
    expect(source).toContain('label.textContent = card.label');
    expect(source).toContain('name.textContent = prettyModelName(model)');
    expect(source).toContain('tokens.textContent = `${formatTokens(totalTokens)} tokens · ${formatTokens(cacheTokens)} cache`');
  });
});
